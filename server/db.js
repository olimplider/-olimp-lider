const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTIONS = ['students', 'users', 'payments', 'attendance', 'grades', 'teachers', 'tests', 'settings'];
const OBJECT_COLLECTIONS = ['settings'];

const store = {
  students: [],
  users: [],
  payments: [],
  attendance: [],
  grades: [],
  teachers: [],
  tests: [],
  settings: {},
};

// ---------- Saqlash rejimi ----------
let mode = 'file'; // 'file' | 'postgres'
let pool = null;
let writeQueue = Promise.resolve();

const dbUrl = process.env.DATABASE_URL || process.env.DB_URL || null;

async function initStorage() {
  if (dbUrl) {
    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      });
      await pool.query('CREATE TABLE IF NOT EXISTS app_kv (key text PRIMARY KEY, value jsonb NOT NULL)');
      mode = 'postgres';
      console.log('Ma\'lumotlar bazasi: PostgreSQL (bulut) ulandi.');
    } catch (e) {
      console.error('PostgreSQL ulanishda xato, JSON fayl rejimiga o\'tilmoqda:', e.message);
      mode = 'file';
    }
  } else {
    mode = 'file';
  }
}

// ---------- Yuklash ----------
function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function loadCollectionFile(name) {
  const file = fileFor(name);
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (name === 'settings') return raw && typeof raw === 'object' ? raw : {};
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.error(`"${name}.json" o'qishda xato:`, e.message);
      return OBJECT_COLLECTIONS.includes(name) ? {} : [];
    }
  }
  return OBJECT_COLLECTIONS.includes(name) ? {} : [];
}

function saveCollectionFile(name) {
  const file = fileFor(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store[name], null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

async function loadAllFromPostgres() {
  const res = await pool.query('SELECT key, value FROM app_kv');
  for (const row of res.rows) {
    if (COLLECTIONS.includes(row.key)) {
      if (OBJECT_COLLECTIONS.includes(row.key)) {
        store[row.key] = row.value && typeof row.value === 'object' ? row.value : {};
      } else {
        store[row.key] = Array.isArray(row.value) ? row.value : [];
      }
    }
  }
}

function saveCollectionPostgres(name) {
  writeQueue = writeQueue
    .then(() =>
      pool.query(
        'INSERT INTO app_kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [name, JSON.stringify(store[name] || (OBJECT_COLLECTIONS.includes(name) ? {} : []))]
      )
    )
    .catch((e) => console.error(`"${name}" saqlashda xato:`, e.message));
}

// ---------- Umumiy API ----------
async function loadAll() {
  await initStorage();
  if (mode === 'postgres') {
    await loadAllFromPostgres();
  } else {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const name of COLLECTIONS) store[name] = loadCollectionFile(name);
  }
  await seed();
}

function saveAll() {
  for (const name of COLLECTIONS) saveCollection(name);
}

function saveCollection(name) {
  if (mode === 'postgres') {
    saveCollectionPostgres(name);
  } else {
    saveCollectionFile(name);
  }
}

function nextId(collectionName) {
  const items = store[collectionName];
  return items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
}

function flushWrites() {
  return writeQueue;
}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

async function seed() {
  const hasAdmin = store.users.some((u) => u.role === 'admin');
  if (!hasAdmin) {
    store.users.push({
      id: nextId('users'),
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      role: 'admin',
      fullName: 'Administrator',
    });
    saveCollection('users');
    console.log('Admin yaratildi: login=admin, parol=admin123');
  }
}

module.exports = {
  store,
  loadAll,
  saveAll,
  saveCollection,
  flushWrites,
  nextId,
  hashPassword,
  verifyPassword,
  get mode() {
    return mode;
  },
};