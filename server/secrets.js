// ---------- Parollarni qaytarib olinadigan holda saqlash ----------
// Parollar ikki ko'rinishda saqlanadi:
//   1) passwordHash - bcrypt hash (kirish uchun, qaytarib bo'lmaydi)
//   2) pwEnc        - AES-256-GCM shifrlangan parol (ko'rsatish/chop etish uchun)
//
// Kalit PASSWORD_KEY orqali keladi va .env.local da saqlanadi (git'ga tushmaydi).
// Kalit yo'qolsa parolni qaytarib bo'lmaydi, lekin kirish ishlayveradi (hash saqlanadi).
const crypto = require('crypto');

let warned = false;

function getKey() {
  const raw = process.env.PASSWORD_KEY || process.env.JWT_SECRET || 'olimp-dev-fallback-key';
  if (!process.env.PASSWORD_KEY && !warned) {
    warned = true;
    console.log('Telegram/Parol: PASSWORD_KEY yo\'q - JWT_SECRET dan foydalanilmoqda (ishlaydi, lekin maxfiylik pasayadi)');
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

// Parolni shifrlash -> "iv.tag.cipher" (base64)
function encrypt(plain) {
  if (!plain) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('base64') + '.' + tag.toString('base64') + '.' + data.toString('base64');
  } catch (e) {
    console.error('Parolni shifrlashda xato:', e.message);
    return '';
  }
}

// Shifrlangan parolni ochish
function decrypt(value) {
  if (!value) return '';
  try {
    const parts = String(value).split('.');
    if (parts.length !== 3) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(parts[0], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
    const data = Buffer.from(parts[2], 'base64');
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
}

// Yangi kalit yaratish (bir marta, .env.local uchun)
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { encrypt, decrypt, generateKey };
