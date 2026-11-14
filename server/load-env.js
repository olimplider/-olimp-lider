// =============================================================================
//  .env.local ni yuklaydi (dotenv o'rniga, minimal).
//
//  Nima uchun alohida modul:
//  server/index.js da `require('./db')` .env.local yuklashdan OLDIN bajariladi.
//  db.js esa modul yuklanganda process.env.DATABASE_URL ni o'qiydi -> null bo'lib,
//  butun ilova JSON fayl rejimiga (bo'sh data/) o'tib ketardi va production
//  bazasi (Neon) ishlatilmasdi.
//  Shu sababli bu modul index.js, db.js va telegram.js dan BIRINCHI bo'lib
//  chaqirilishi shart.
//
//  TELEGRAM_BOT_TOKEN / DATABASE_URL / PASSWORD_KEY kabi maxfiy qiymatlar
//  shu yerda keladi, git'ga tushmaydi.
// =============================================================================
const fs = require('fs');
const path = require('path');

try {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
} catch (e) {
  // muhit fayli yo'q - normal (PM2 env orqali ishlash mumkin)
}

module.exports = {};
