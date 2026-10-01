// ---------- Telegram bot integratsiyasi ----------
// Token .env.local -> TELEGRAM_BOT_TOKEN (git'ga tushmaydi).
// Telegram serverga faqat "Start" bosgan odamlarni taniydi, shuning uchun
// ota-ona bir marta kodli havolaga (t.me/<bot>?start=<kod>) bosadi.

const db = require('./db');

const API = 'https://api.telegram.org';
const MAX_LEN = 4096;
const SCHOOL_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const MONTHS = ['', 'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const DAY_NAMES = ['', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const ATT = { present: 'Keldi', late: 'Kechikdi', absent: 'Kelmadi' };

let TOKEN = '';
let bot = null;          // { id, username, first_name }
let offset = 0;
let pollTimer = null;
let dailyTimer = null;
let warned = false;
let lastSendAt = 0;

function token() {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

function configured() {
  return !!token();
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Telegram tezlik cheklovi: sekundiga ~30 xabar
async function throttle() {
  const gap = 34;
  const now = Date.now();
  const wait = Math.max(0, lastSendAt + gap - now);
  if (wait) await delay(wait);
  lastSendAt = Date.now();
}

async function call(method, body) {
  if (!configured()) return { ok: false, description: 'Token sozlanmagan' };
  try {
    const res = await fetch(`${API}/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

function randomCode(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < (len || 8); i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ---------- Bog'lanish (link) ----------
function links() {
  if (!Array.isArray(db.store.telegram_links)) db.store.telegram_links = [];
  return db.store.telegram_links;
}
function logs() {
  if (!Array.isArray(db.store.telegram_log)) db.store.telegram_log = [];
  return db.store.telegram_log;
}

function linkForChat(chatId) {
  return links().find((l) => String(l.chatId) === String(chatId)) || null;
}
function linkForUser(userId) {
  return links().find((l) => l.userId === userId) || null;
}
function parentByChat(chatId) {
  const l = linkForChat(chatId);
  if (!l) return null;
  return db.store.users.find((u) => u.id === l.userId && u.role === 'parent') || null;
}

function ensureCode(user) {
  if (!user.tgCode) {
    user.tgCode = randomCode(8);
    db.saveCollection('users');
  }
  return user.tgCode;
}

function linkUrlFor(user) {
  if (!bot || !bot.username) return null;
  return `https://t.me/${bot.username}?start=${ensureCode(user)}`;
}

function linkParent(user, chatId, username) {
  const existingChat = linkForChat(chatId);
  if (existingChat) {
    existingChat.userId = user.id;
    existingChat.active = true;
    existingChat.tgUsername = username || existingChat.tgUsername;
    existingChat.linkedAt = new Date().toISOString();
  } else {
    links().push({
      id: db.nextId('telegram_links'),
      userId: user.id,
      chatId: String(chatId),
      tgUsername: username || '',
      linkedAt: new Date().toISOString(),
      active: true,
    });
  }
  db.saveCollection('telegram_links');
}

function unlinkUser(userId) {
  const before = links().length;
  db.store.telegram_links = links().filter((l) => l.userId !== userId);
  const u = db.store.users.find((x) => x.id === userId);
  if (u) { u.tgCode = null; db.saveCollection('users'); }
  db.saveCollection('telegram_links');
  return before !== links().length;
}

function rotateCode(userId) {
  const u = db.store.users.find((x) => x.id === userId);
  if (!u) return null;
  u.tgCode = randomCode(8);
  db.saveCollection('users');
  unlinkUser(userId);
  return linkUrlFor(u);
}

// ---------- Yuborish ----------
function logEntry(entry) {
  logs().push(Object.assign({ id: db.nextId('telegram_log'), at: new Date().toISOString() }, entry));
  // oxirgi 1000 ta yozuvni saqlash
  if (logs().length > 1000) db.store.telegram_log = logs().slice(-1000);
}

async function sendTo(chatId, text) {
  const parts = String(text || '').split(/(.{1,4000})/su).filter(Boolean);
  let ok = 0;
  for (const part of parts) {
    await throttle();
    const r = await call('sendMessage', { chat_id: chatId, text: part, disable_web_page_preview: true });
    if (r && r.ok) ok++;
    else if (r && r.description && /chat not found|bot was blocked|kicked/i.test(r.description)) {
      logEntry({ chatId: String(chatId), text: part, kind: 'fail', error: r.description });
    }
  }
  return ok;
}

async function notifyParents(userIds, text, kind) {
  const results = { sent: 0, noLink: 0, failed: 0 };
  for (const uid of userIds) {
    const l = linkForUser(uid);
    if (!l) { results.noLink++; continue; }
    const n = await sendTo(l.chatId, text);
    if (n > 0) { results.sent++; logEntry({ userId: uid, chatId: l.chatId, text, kind: kind || 'auto', sent: true }); }
    else results.failed++;
  }
  db.saveCollection('telegram_log');
  return results;
}

// Har bir ota-onaga ALOHIDA matn (shaxsiy ma'lumot — boshqalarni ko'rmaydi).
// items: [{ userId, text }]
async function notifyParentsEach(items, kind) {
  const results = { sent: 0, noLink: 0, failed: 0 };
  for (const it of items) {
    const l = linkForUser(it.userId);
    if (!l) { results.noLink++; continue; }
    const n = await sendTo(l.chatId, it.text);
    if (n > 0) { results.sent++; logEntry({ userId: it.userId, chatId: l.chatId, text: it.text, kind: kind || 'auto', sent: true }); }
    else results.failed++;
  }
  db.saveCollection('telegram_log');
  return results;
}

function parentUserOf(student) {
  if (!student) return null;
  return db.store.users.find((u) => u.role === 'parent' && u.studentId === student.id) || null;
}

function fio(s) {
  return [s.lastName, s.firstName, s.patronymic].filter(Boolean).join(' ');
}

// ---------- Xabar matnlari ----------
function textAbsence(student) {
  const s = db.store.settings || {};
  const u = parentUserOf(student);
  const who = u ? (u.fullName && !/ota-onasi$/.test(u.fullName) ? u.fullName : s.phone || 'Administrator') : 'Administrator';
  return [
    '🔴 DAVOMAT: KELMADI',
    '',
    `O'quvchi: ${fio(student)}`,
    `Sinf: ${student.className || '—'}`,
    `Sana: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Sababni o'qituvchidan so'rang. Tel: ${who}`,
  ].join('\n');
}

// Bitta ota-onaga: FAQAT o'z farzandining to'lovi (boshqa oila ko'rinmaydi)
function textDebtOne(student, month, year) {
  const s = db.store.settings || {};
  const fee = Number(student.monthlyFee || 0);
  return [
    '💰 OYLIK TO\'LOV ESLATMASI',
    '',
    'Hurmatli ota-ona,',
    `${MONTHS[month]} ${year} oyi to'lovi hali qilinmagan.`,
    '',
    `O'quvchi: ${fio(student)}`,
    `Sinf: ${student.className || '—'}`,
    `To'lov: ${fee.toLocaleString('ru-RU')} so'm`,
    '',
    'Iltimos, to\'lovni amalga oshiring.',
    `Tel: ${s.phone || 'Administrator'}`,
  ].join('\n');
}

function textMedical(student, expiresAt) {
  return [
    '🩺 TIBBIY KORIK MUDDATI',
    '',
    `O'quvchi: ${fio(student)}`,
    `Sinf: ${student.className || '—'}`,
    `086-forma muddati: ${expiresAt}`,
    '',
    'Iltimos, shifokorga murojaat qiling.',
  ].join('\n');
}

// ---------- Ota-ona buyruqlari ----------
function parentStudent(user) {
  return db.store.students.find((s) => s.id === user.studentId) || null;
}

function cmdStart(chatId, username, code) {
  const u = code ? db.store.users.find((x) => x.role === 'parent' && x.tgCode && x.tgCode === code) : null;
  if (!u) {
    return sendTo(chatId, [
      '👋 Salom! Bu — OLIMP-LIDER klubining boti.',
      '',
      'Ulash uchun saytdagi "Telegram\'ga ulash" tugmasini bosing.',
      'Keyin shu yerga qaytib, "Start" ni bosing.',
      '',
      'Buyrumlar: /davomat /baho /qarz /jadval /farzand',
    ].join('\n'));
  }
  linkParent(u, chatId, username);
  const st = parentStudent(u);
  return sendTo(chatId, [
    '✅ Ulanildi!',
    '',
    st ? `Farzandingiz: ${fio(st)} (${st.className || '—'})` : '',
    '',
    "Endi quyidagi buyruqlarni ishlatishingiz mumkin:",
    '  /davomat — davomat',
    '  /baho — baholar',
    '  /qarz — to\'lov holati',
    '  /jadval — dars jadvali',
    '  /farzand — ma\'lumot',
    '  /stop — uzish',
  ].join('\n'));
}

function requireLink(chatId) {
  const p = parentStudent(parentByChat(chatId));
  if (!p) {
    sendTo(chatId, '⛔ Siz hali ulanmagan. Saytdan "Telegram\'ga ulash" tugmasini bosing.');
    return null;
  }
  return p;
}

function cmdHelp(chatId) {
  return sendTo(chatId, [
    'Buyruqlar:',
    '  /davomat — oxirgi 14 kunlik davomat',
    '  /baho — fanlar bo\'yicha baholar',
    '  /qarz — to\'lov holati',
    '  /jadval — haftalik dars jadvali',
    '  /farzand — farzand ma\'lumotlari',
    '  /stop — ulashni uzish',
  ].join('\n'));
}

function cmdAttendance(chatId) {
  const st = requireLink(chatId);
  if (!st) return Promise.resolve();
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const fromStr = from.toISOString().slice(0, 10);
  const rows = db.store.attendance
    .filter((a) => a.studentId === st.id && a.date >= fromStr)
    .sort((a, b) => b.date.localeCompare(a.date));
  const counts = { present: 0, late: 0, absent: 0 };
  rows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const lines = rows.slice(0, 14).map((r) => `${r.date} — ${ATT[r.status] || r.status}`);
  return sendTo(chatId, [
    '📋 DAVOMAT (oxirgi 14 kun)',
    `${fio(st)} • ${st.className || '—'}`,
    '',
    `Keldi: ${counts.present} | Kechikdi: ${counts.late} | Kelmadi: ${counts.absent}`,
    '',
    lines.length ? lines.join('\n') : 'Bozorida yozuv yo\'q.',
  ].join('\n'));
}

function cmdGrades(chatId) {
  const st = requireLink(chatId);
  if (!st) return Promise.resolve();
  const rows = db.store.grades.filter((g) => g.studentId === st.id);
  if (!rows.length) return sendTo(chatId, '📚 Hali baho qo\'shilmagan.');
  const by = {};
  for (const g of rows) {
    by[g.subject] = by[g.subject] || [];
    by[g.subject].push(Number(g.score) || 0);
  }
  const all = rows.map((g) => Number(g.score) || 0);
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  const lines = Object.keys(by).map((sub) => {
    const a = by[sub];
    const av = a.reduce((x, y) => x + y, 0) / a.length;
    return `• ${sub}: ${av.toFixed(1)} (${a.length} ta)`;
  });
  return sendTo(chatId, ['📚 BAHOLAR', `${fio(st)} • ${st.className || '—'}`, '', `O'rtacha: ${avg.toFixed(1)}`, '', ...lines].join('\n'));
}

function cmdDebt(chatId) {
  const st = requireLink(chatId);
  if (!st) return Promise.resolve();
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (m < 9) { m += 12; y -= 1; }
  const rows = [];
  for (const mo of SCHOOL_ORDER) {
    const yy = mo >= 9 ? y : y + 1;
    const p = db.store.payments.find((x) => x.studentId === st.id && x.month === mo && x.year === yy);
    if (!p || !p.paid) rows.push(MONTHS[mo]);
  }
  const paid = db.store.payments.filter((p) => p.studentId === st.id && p.paid).length;
  return sendTo(chatId, [
    '💰 TO\'LOV HOLATI',
    `${fio(st)} • ${st.className || '—'}`,
    '',
    `Oylik to'lov: ${Number(st.monthlyFee || 0).toLocaleString('ru-RU')} so'm`,
    `To'langan oylar: ${paid}`,
    '',
    rows.length ? 'To\'lanmagan: ' + rows.join(', ') : 'Barcha to\'lovlar to\'langan ✅',
  ].join('\n'));
}

function cmdSchedule(chatId) {
  const st = requireLink(chatId);
  if (!st) return Promise.resolve();
  const days = (() => {
    const g = Number((String(st.className || '').match(/^(\d+)/) || [])[1] || 0);
    return g === 1 || g === 2 ? 5 : 6;
  })();
  const rows = db.store.schedule.filter((s) => s.className === st.className);
  if (!rows.length) return sendTo(chatId, '📚 Dars jadvali hali kiritilmagan.');
  let out = ['📚 DARS JADVALI', `${fio(st)} • ${st.className || '—'}`, ''];
  for (let d = 1; d <= days; d++) {
    const day = rows.filter((r) => r.dayOfWeek === d).sort((a, b) => a.lessonNo - b.lessonNo);
    out.push(DAY_NAMES[d] + ':');
    if (!day.length) out.push('  — dars yo\'q');
    else day.forEach((r) => out.push(`  ${r.lessonNo}. ${r.subject}`));
    out.push('');
  }
  return sendTo(chatId, out.join('\n').trim());
}

function cmdChild(chatId) {
  const st = requireLink(chatId);
  if (!st) return Promise.resolve();
  return sendTo(chatId, [
    '👦 FARZAND MA\'LUMOTLARI',
    '',
    `F.I.Sh.: ${fio(st)}`,
    `Sinf: ${st.className || '—'}`,
    `Tug'ilgan: ${st.birthDate || '—'}`,
    `Telefon: ${st.parentPhone || '—'}`,
  ].join('\n'));
}

function cmdStop(chatId) {
  const l = linkForChat(chatId);
  if (l) {
    unlinkUser(l.userId);
    return sendTo(chatId, '🔌 Ulanish uzildi. Qayta ulash uchun saytadagi tugmani bosing.');
  }
  return sendTo(chatId, 'Siz ulanmagan.');
}

async function handleUpdate(u) {
  if (!u || !u.message) return;
  const chatId = u.message.chat && u.message.chat.id;
  if (!chatId) return;
  const text = String(u.message.text || '').trim();
  const username = (u.message.from && u.message.from.username) || '';
  const [cmdRaw, argRaw] = text.split(/\s+/);
  const cmd = (cmdRaw || '').split('@')[0].toLowerCase();

  try {
    if (cmd === '/start') return await cmdStart(chatId, username, argRaw);
    if (cmd === '/help' || cmd === '/yordam') return await cmdHelp(chatId);
    if (cmd === '/davomat' || cmd === '/attendance') return await cmdAttendance(chatId);
    if (cmd === '/baho' || cmd === '/grades') return await cmdGrades(chatId);
    if (cmd === '/qarz' || cmd === '/debt') return await cmdDebt(chatId);
    if (cmd === '/jadval' || cmd === '/schedule') return await cmdSchedule(chatId);
    if (cmd === '/farzand' || cmd === '/child') return await cmdChild(chatId);
    if (cmd === '/stop') return await cmdStop(chatId);

    // kod bilan ulashga urinish
    if (/^[A-Z0-9]{6,12}$/i.test(text)) {
      const p = db.store.users.find((x) => x.role === 'parent' && x.tgCode === text.toUpperCase());
      if (p) return await cmdStart(chatId, username, text.toUpperCase());
    }
    const p = parentByChat(chatId);
    if (p) return await cmdHelp(chatId);
    return sendTo(chatId, 'Noma\'lum buyruq. /help yozing.');
  } catch (e) {
    try { await sendTo(chatId, 'Xatolik yuz berdi. Keyinroq urinib ko\'ring.'); } catch (x) { /* ega e'tibor bermaydi */ }
  }
}

// ---------- Polling ----------
async function pollOnce() {
  const r = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
  if (!r || !r.ok || !Array.isArray(r.result)) return false;
  for (const u of r.result) {
    if (u.update_id >= offset) offset = u.update_id + 1;
    await handleUpdate(u);
  }
  return true;
}

function startPolling() {
  if (pollTimer) return;
  const loop = async () => {
    try {
      await pollOnce();
    } catch (e) {
      if (!warned) { warned = true; console.error('Telegram polling xato:', e.message); }
    }
    pollTimer = setTimeout(loop, 1200);
  };
  loop();
}

// ---------- Kunlik tekshiruv (086 muddati) ----------
function daysLeft(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

async function checkMedical() {
  let changed = false;
  for (const m of db.store.medical || []) {
    const left = daysLeft(m.expiresAt);
    if (left === null || left > 14 || left < 0) continue;
    if (m.tgRemindAt && daysLeft(m.tgRemindAt) === 0) continue;
    const st = db.store.students.find((s) => s.id === m.studentId);
    if (!st) continue;
    const p = parentUserOf(st);
    if (!p) continue;
    const l = linkForUser(p.id);
    if (!l) continue;
    await sendTo(l.chatId, await textMedical(st, String(m.expiresAt).slice(0, 10)));
    logEntry({ userId: p.id, chatId: l.chatId, text: '086 eslatma', kind: 'medical086', sent: true });
    m.tgRemindAt = new Date().toISOString();
    changed = true;
  }
  if (changed) db.saveCollection('medical');
}

function startDaily() {
  if (dailyTimer) return;
  const run = async () => { try { await checkMedical(); } catch (e) { /* ega e'tibor bermaydi */ } };
  setTimeout(run, 10000);
  dailyTimer = setInterval(run, 6 * 60 * 60 * 1000);
}

// ---------- Ishga tushirish ----------
async function init() {
  if (!configured()) {
    console.log('Telegram bot: token sozlanmagan (TELEGRAM_BOT_TOKEN) — bot ishlamaydi.');
    return false;
  }
  const me = await call('getMe');
  if (!me || !me.ok) {
    const d = (me && me.description) || 'server javob bermadi';
    const net = /fetch failed|ENOTFOUND|ETIMEDOUT|network/i.test(d);
    console.error('Telegram bot: ' + (net
      ? `server Telegram\'ga ulana olmadi (${d}). Bot ishlamaydi.`
      : `token noto\'g\'ri yoki bot yaroqli emas (${d}).`));
    return false;
  }
  bot = me.result;
  offset = 0;
  await call('deleteWebhook', { drop_pending_updates: false });
  startPolling();
  startDaily();
  console.log(`Telegram bot: @${bot.username} ulandi (id ${bot.id})`);
  return true;
}

module.exports = {
  init,
  configured,
  botInfo: () => (bot ? { username: bot.username, firstName: bot.first_name, id: bot.id } : null),
  links,
  logs,
  linkForUser,
  linkForChat,
  linkUrlFor,
  ensureCode,
  rotateCode,
  unlinkUser,
  notifyParents,
  notifyParentsEach,
  parentUserOf,
  textAbsence,
  textDebtOne,
  textMedical,
  fio,
  sendTo,
};
