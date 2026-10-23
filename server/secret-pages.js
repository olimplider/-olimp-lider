// ---------- Maxfiy sahifa manzillari ----------
// Sahifalar oddiy nomlarda emas, maxfiy kalit orqali ochiladi.
// Kalitlar hech qaerda brauzer kodida ko'rinmaydi: /api/auth/login
// javobida `redirect` maydoni qaytariladi.

const GATE_PATH = '/site';

// Har bir kalit -> sahifa fayli. views/ papkasi express.static dan tashqarida.
const SECRET_PAGES = {
  '.k7m2q9?x4p8r': 'login.html',
  '.b3ntv8?m6zq1': 'admin.html',
  '.h4kcw2?p9dtx': 'teacher.html',
  '.j7rfn3?w2vyb': 'parent.html',
  '.q5slmz?c8gtd': 'doctor.html',
  '.x9v2m7?k4nz1': 'branch-admin.html',
};

// Rol -> kalit (login javobida redirect uchun)
const ROLE_KEYS = {
  admin: '.b3ntv8?m6zq1',
  teacher: '.h4kcw2?p9dtx',
  parent: '.j7rfn3?w2vyb',
  doctor: '.q5slmz?c8gtd',
  branch_admin: '.x9v2m7?k4nz1',
};

const LOGIN_KEY = '.k7m2q9?x4p8r';

function pageUrl(key) {
  return GATE_PATH + '?' + key;
}

function roleUrl(role) {
  return pageUrl(ROLE_KEYS[role] || ROLE_KEYS.parent);
}

function loginUrl() {
  return pageUrl(LOGIN_KEY);
}

// So'rovdan maxfiy kalitni ajratib olish. Ikkinchi '?' ham kalitning qismi:
// /site?.b3ntv8?m6zq1  ->  ".b3ntv8?m6zq1"
function extractKey(originalUrl) {
  const raw = String(originalUrl || '');
  const i = raw.indexOf('?');
  if (i === -1) return '';
  return raw.slice(i + 1);
}

function pageForKey(key) {
  return SECRET_PAGES[key] || null;
}

module.exports = {
  GATE_PATH,
  SECRET_PAGES,
  ROLE_KEYS,
  LOGIN_KEY,
  pageUrl,
  roleUrl,
  loginUrl,
  extractKey,
  pageForKey,
};
