#!/usr/bin/env node
// =============================================================================
//  OLIMP-LIDER — kunlik zaxira (backup) yaratish
//
//  Nima zaxiralanadi:
//    1) Neon PostgreSQL — barcha app_kv kolleksiyalari (JSON, gzip)
//    2) uploads/ — o'quvchi rasmlari va boshqa fayllar (tar.gz)
//    3) maxfiy konfig — .env.local (faqat serverda, chmod 600)
//    4) meta.json — versiya, IP, sanalar, fayl ro'yxati (checksum bilan)
//
//  Chiqish: /root/olimp/backups/<stamp>/
//  Ishga tushirish: node server/backup.js
// =============================================================================
require('./load-env');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);

function log(...a) { console.log('[backup]', ...a); }

function stamp() {
  return new Date().toISOString().replace('T', '_').slice(0, 19).replace(/:/g, '-');
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

async function dumpDatabase(dir) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  const res = await pool.query('SELECT key, value FROM app_kv');
  await pool.end();

  const dump = {};
  const counts = {};
  for (const r of res.rows) {
    dump[r.key] = r.value;
    counts[r.key] = Array.isArray(r.value) ? r.value.length : (r.value && typeof r.value === 'object' ? Object.keys(r.value).length : 1);
  }
  const json = JSON.stringify(dump, null, 2);
  const file = path.join(dir, 'db.json.gz');
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }));
  return { file, counts, raw: json.length, gz: fs.statSync(file).size };
}

function archiveUploads(dir) {
  const uploads = path.join(ROOT, 'uploads');
  const file = path.join(dir, 'uploads.tar.gz');
  if (!fs.existsSync(uploads)) {
    fs.writeFileSync(file, Buffer.alloc(0));
    return { file, size: 0, count: 0 };
  }
  try {
    execFileSync('tar', ['-czf', file, '-C', ROOT, 'uploads'], { stdio: 'ignore' });
    let count = 0;
    try { count = fs.readdirSync(uploads).length; } catch (e) {}
    return { file, size: fs.statSync(file).size, count };
  } catch (e) {
    log('uploads arxivlashda xato:', e.message);
    fs.writeFileSync(file, Buffer.alloc(0));
    return { file, size: 0, count: 0 };
  }
}

function copyConfig(dir) {
  const file = path.join(dir, 'env.local.bak');
  const src = path.join(ROOT, '.env.local');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, file);
    fs.chmodSync(file, 0o600);
    return { file, size: fs.statSync(file).size };
  }
  return { file: null, size: 0 };
}

function gitInfo() {
  try {
    const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const branch = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    return { sha, branch };
  } catch (e) { return { sha: null, branch: null }; }
}

function rotate(dir) {
  let removed = 0;
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs < cutoff) {
      try { fs.rmSync(p, { recursive: true, force: true }); removed++; } catch (e) {}
    }
  }
  return removed;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = stamp();
  const dir = path.join(BACKUP_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  log('zaxira yaratilmoqda:', name);

  // 1) Ma'lumotlar bazasi
  const db = await dumpDatabase(dir);
  log('DB:', Object.keys(db.counts).length, 'kolleksiya |', humanSize(db.raw), '->', humanSize(db.gz));

  // 2) uploads
  const up = archiveUploads(dir);
  log('uploads:', up.count, 'fayl |', humanSize(up.size));

  // 3) konfig
  const cfg = copyConfig(dir);
  log('env.local:', cfg.size ? 'zaxiralandi' : 'yo\'q');

  // 4) meta
  const meta = {
    createdAt: new Date().toISOString(),
    stamp: name,
    host: require('os').hostname(),
    ip: (require('os').networkInterfaces() || {}),
    git: gitInfo(),
    counts: db.counts,
    files: [
      { name: 'db.json.gz', size: db.gz, sha256: sha256(db.file) },
      { name: 'uploads.tar.gz', size: up.size, sha256: sha256(up.file) },
    ],
    dbRawBytes: db.raw,
  };
  if (cfg.file) meta.files.push({ name: 'env.local.bak', size: cfg.size, sha256: sha256(cfg.file) });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  const total = db.gz + up.size + cfg.size;
  log('=== TAYYOR ===', name, '| jami', humanSize(total), '|', (Date.now() - t0) + 'ms');

  // 5) eskirganlarni o'chirish
  const removed = rotate(BACKUP_DIR);
  if (removed) log('eskirgan zaxiralar o\'chirildi:', removed);
})().catch((e) => {
  console.error('[backup] XATO:', e.message);
  process.exit(1);
});
