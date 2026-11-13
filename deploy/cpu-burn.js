#!/usr/bin/env node
// =============================================================================
//  OLIMP-LIDER — CPU yuk generatori (Oracle Always Free idle-reclaim himoyasi)
//
//  Oracle instance "idle" deb hisoblanmasligi uchun CPU 95-percentile
//  ko'rsatkichi 20% dan yuqori bo'lishi kerak. Bu skript bitta iteratsiyada
//  ~0.5-1 sekundlik to'liq CPU yuk yaratadi.
//
//  Ishga tushirish:  node cpu-burn.js [sekundlar]
//  Standart: 25 sekund (har 1 daqiqada cron orqali chaqiriladi)
//
//  Nima uchun alohida fayl: Node 24 `node -e` kodini TypeScript deb
//  kompilyatsiya qiladi va require() bilan muammo chiqadi. Fayl orqali
//  chaqirish har qanday Node versiyalarida ishlaydi.
// =============================================================================
'use strict';

const crypto = require('crypto');
const os = require('os');

const seconds = Number(process.argv[2]) || 25;
const CHUNK = Buffer.alloc(4 * 1024 * 1024); // 4 MB
const ROUNDS = 40;

function burnRound() {
  let h = Buffer.alloc(0);
  for (let i = 0; i < ROUNDS; i++) {
    h = crypto.createHash('sha256').update(Buffer.concat([h, CHUNK])).digest();
  }
  return h;
}

const end = Date.now() + seconds * 1000;
let rounds = 0;

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

while (Date.now() < end) {
  burnRound();
  rounds++;
}

const elapsed = ((Date.now() - (end - seconds * 1000)) / 1000).toFixed(1);
process.stdout.write(
  `cpu-burn: ${rounds} iteratsiya / ${elapsed}s / ${os.cpus().length} vCPU\n`
);
