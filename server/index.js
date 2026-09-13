const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'maktab-maxfiy-kalit-2026';

if (app.get('env') === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 daqiqa
  limit: 10, // IP boshiga 10 noto'g'ri urinish
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Juda ko\'p urinish qilindi. 10 daqiqadan so\'ng qayta urinib ko\'ring.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  limit: 900, // IP boshiga 900 so'rov
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'So\'rovlar soni oshib ketdi. Birozdan so\'ng qayta urinib ko\'ring.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- Statik frontend ----------
const CLIENT_DIR = path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_DIR));

app.get('/', (req, res) => res.redirect('/login.html'));

// ---------- Auth ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|jpg)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Faqat rasm fayllari ruxsat etiladi'));
  },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, studentId: user.studentId || null, teacherId: user.teacherId || null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function makeUsername(lastName, firstName) {
  const base =
    `${lastName}.${firstName}`.toLowerCase().replace(/[^\p{L}\p{N}.-]+/gu, '').slice(0, 24) || 'otaona';
  return ensureUniqueUsername(base);
}

function ensureUniqueUsername(username) {
  let candidate = username;
  let i = 1;
  while (db.store.users.some((u) => u.username === candidate)) {
    candidate = `${username}${i}`;
    i++;
  }
  return candidate;
}

function makePassword(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let p = '';
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Kirish talab qilinadi' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Muddati tugagan yoki noto`g`ri token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Ruxsat yo`q' });
  next();
}

// ---------- Auth API ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.store.users.find((u) => u.username === String(username || '').trim().toLowerCase());
  if (!user || !db.verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Login yoki parol noto`g`ri' });
  }
  const token = signToken(user);
  res.json({ token, role: user.role, fullName: user.fullName, studentId: user.studentId || null, teacherId: user.teacherId || null });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.store.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, studentId: user.studentId || null, teacherId: user.teacherId || null });
});

// ---------- Admin sozlamalari (login/parolni o'zgartirish) ----------
app.post('/api/auth/update', authRequired, (req, res) => {
  const user = db.store.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

  const { currentPassword, username, newPassword } = req.body || {};
  if (!db.verifyPassword(currentPassword || '', user.passwordHash)) {
    return res.status(400).json({ error: 'Joriy parol noto`g`ri' });
  }

  if (username !== undefined) {
    const uname = String(username).trim().toLowerCase();
    if (!uname) return res.status(400).json({ error: 'Login bo`sh bo`lmasin' });
    const taken = db.store.users.find((u) => u.username === uname && u.id !== user.id);
    if (taken) return res.status(400).json({ error: 'Bu login band, boshqasini tanlang' });
    user.username = uname;
  }

  if (newPassword) {
    if (String(newPassword).length < 4) return res.status(400).json({ error: 'Parol kamida 4 ta belgi' });
    user.passwordHash = db.hashPassword(String(newPassword));
  }

  db.saveCollection('users');
  res.json({ ok: true, username: user.username });
});

// ---------- Kontakt sozlamalari ----------
app.get('/api/settings', (req, res) => {
  const s = db.store.settings || {};
  res.json({ phone: s.phone || '', telegram: s.telegram || '', instagram: s.instagram || '' });
});

app.put('/api/settings', authRequired, adminOnly, (req, res) => {
  const s = db.store.settings || {};
  const b = req.body || {};
  for (const k of ['phone', 'telegram', 'instagram']) {
    if (b[k] !== undefined) s[k] = String(b[k]).trim();
  }
  db.store.settings = s;
  db.saveCollection('settings');
  res.json({ ok: true });
});

// ---------- Fanlar ----------
const DEFAULT_SUBJECTS = [
  'Matematika', 'Ona tili', 'Adabiyot', 'Fizika', 'Kimyo',
  'Biologiya', 'Tarix', 'Geografiya', 'Ingliz tili', 'Rus tili',
  'Informatika', 'Jismoniy tarbiya', 'Chizmachilik', 'Musiqa', 'Tasviriy san\'at',
];

function getSubjects() {
  if (!Array.isArray(db.store.subjects)) db.store.subjects = [];
  if (!db.store.subjects.length) {
    db.store.subjects = DEFAULT_SUBJECTS.slice();
    db.saveCollection('subjects');
  }
  return db.store.subjects;
}

app.get('/api/subjects', authRequired, (req, res) => {
  res.json(getSubjects());
});

app.post('/api/subjects', authRequired, adminOnly, (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Fan nomi bo`sh bo`lmasin' });
  const subs = getSubjects();
  if (subs.some((s) => s.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Bunday fan allaqachon bor' });
  }
  subs.push(name);
  db.saveCollection('subjects');
  res.status(201).json({ ok: true, subjects: subs });
});

app.put('/api/subjects/:old', authRequired, adminOnly, (req, res) => {
  const old = String(req.params.old || '').trim();
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Yangi nom bo`sh bo`lmasin' });
  const subs = getSubjects();
  const idx = subs.findIndex((s) => s === old);
  if (idx < 0) return res.status(404).json({ error: 'Fan topilmadi' });
  if (subs.some((s) => s !== old && s.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: 'Bunday fan allaqachon bor' });
  }
  subs[idx] = name;
  db.store.grades = db.store.grades.map((g) => (g.subject === old ? { ...g, subject: name } : g));
  db.store.tests = db.store.tests.map((t) => (t.subject === old ? { ...t, subject: name } : t));
  db.store.teachers = db.store.teachers.map((t) =>
    Array.isArray(t.subjects) ? { ...t, subjects: t.subjects.map((s) => (s === old ? name : s)) } : t
  );
  db.saveAll();
  res.json({ ok: true, subjects: subs });
});

app.delete('/api/subjects/:name', authRequired, adminOnly, (req, res) => {
  const name = String(req.params.name || '').trim();
  const subs = getSubjects();
  const next = subs.filter((s) => s !== name);
  if (next.length === subs.length) return res.status(404).json({ error: 'Fan topilmadi' });
  db.store.subjects = next;
  db.store.teachers = db.store.teachers.map((t) =>
    Array.isArray(t.subjects) ? { ...t, subjects: t.subjects.filter((s) => s !== name) } : t
  );
  db.saveCollection('subjects');
  db.saveCollection('teachers');
  res.json({ ok: true, subjects: next });
});

// ---------- O'qituvchilar ----------
function teacherOnly(req, res, next) {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Ruxsat yo`q' });
  next();
}

function currentTeacher(req) {
  return db.store.teachers.find((t) => t.id === req.user.teacherId);
}

function canClass(teacher, className) {
  return teacher && teacher.classes && teacher.classes.includes(className);
}

app.get('/api/teachers', authRequired, adminOnly, (req, res) => {
  const list = db.store.teachers.map((t) => {
    const user = db.store.users.find((u) => u.teacherId === t.id);
    return { ...t, username: user ? user.username : null };
  });
  res.json(list);
});

app.get('/api/teacher/me', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  res.json({ teacher, user: { fullName: req.user.fullName, username: req.user.username } });
});

app.post('/api/teachers', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || '').trim();
  if (!fullName) return res.status(400).json({ error: 'To`liq ism majburiy' });

  const teacher = {
    id: db.nextId('teachers'),
    fullName,
    subjects: (Array.isArray(b.subjects) ? b.subjects : []).map((s) => String(s).trim()).filter(Boolean),
    classes: (Array.isArray(b.classes) ? b.classes : []).map((s) => String(s).trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
  };
  db.store.teachers.push(teacher);

  let username = b.username ? String(b.username).trim().toLowerCase() : makeUsername(fullName.split(' ')[0], fullName.split(' ')[1] || '');
  username = ensureUniqueUsername(username || makeUsername('oquituvchi', String(teacher.id)));
  const password = b.password && String(b.password).length >= 4 ? String(b.password) : makePassword(8);

  const user = {
    id: db.nextId('users'),
    username,
    passwordHash: db.hashPassword(password),
    role: 'teacher',
    fullName,
    teacherId: teacher.id,
    studentId: null,
  };
  db.store.users.push(user);

  db.saveCollection('teachers');
  db.saveCollection('users');
  res.status(201).json({ ok: true, teacher, username, password });
});

app.post('/api/teachers/:id/credentials', authRequired, adminOnly, (req, res) => {
  const teacher = db.store.teachers.find((t) => t.id === Number(req.params.id));
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });

  let user = db.store.users.find((u) => u.teacherId === teacher.id);
  if (!user) {
    const base = makeUsername(teacher.fullName.split(' ')[0], teacher.fullName.split(' ')[1] || '');
    user = {
      id: db.nextId('users'),
      username: ensureUniqueUsername(base || 'oquituvchi'),
      passwordHash: null,
      role: 'teacher',
      fullName: teacher.fullName,
      teacherId: teacher.id,
    };
    db.store.users.push(user);
  }

  const b = req.body || {};
  if (b.username && String(b.username).trim()) {
    const uname = String(b.username).trim().toLowerCase();
    const taken = db.store.users.find((u) => u.username === uname && u.id !== user.id);
    if (taken) return res.status(400).json({ error: 'Bu login band, boshqasini tanlang' });
    user.username = uname;
  }

  if (b.password) {
    if (String(b.password).length < 4) return res.status(400).json({ error: 'Parol kamida 4 ta belgi' });
    user.passwordHash = db.hashPassword(String(b.password));
  } else {
    user.passwordHash = db.hashPassword(makePassword(8));
  }

  db.saveCollection('users');
  res.json({ username: user.username, password: b.password ? String(b.password) : undefined, fresh: !b.password });
});

app.put('/api/teachers/:id', authRequired, adminOnly, (req, res) => {
  const teacher = db.store.teachers.find((t) => t.id === Number(req.params.id));
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const b = req.body || {};
  if (b.fullName !== undefined) teacher.fullName = String(b.fullName).trim();
  if (b.subjects !== undefined) teacher.subjects = (Array.isArray(b.subjects) ? b.subjects : []).map((s) => String(s).trim()).filter(Boolean);
  if (b.classes !== undefined) teacher.classes = (Array.isArray(b.classes) ? b.classes : []).map((s) => String(s).trim()).filter(Boolean);
  const user = db.store.users.find((u) => u.teacherId === teacher.id);
  if (user) user.fullName = teacher.fullName;
  db.saveCollection('teachers');
  db.saveCollection('users');
  res.json({ ok: true });
});

app.delete('/api/teachers/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  db.store.teachers = db.store.teachers.filter((t) => t.id !== id);
  db.store.users = db.store.users.filter((u) => !(u.role === 'teacher' && u.teacherId === id));
  db.store.tests = db.store.tests.filter((t) => t.teacherId !== id);
  db.saveAll();
  res.json({ ok: true });
});

// ---------- O'qituvchi: sinf o'quvchilari ----------
app.get('/api/teacher/students', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const className = String(req.query.className || '').trim();
  if (!canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
  const list = db.store.students.filter((s) => (s.className || '(sinsiz)') === className);
  res.json(list);
});

// ---------- O'qituvchi: baholar ----------
app.get('/api/teacher/grades', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const className = String(req.query.className || '').trim();
  const subject = String(req.query.subject || '').trim();
  const date = String(req.query.date || '').trim();
  const month = String(req.query.month || '').trim();
  const year = String(req.query.year || '').trim();
  if (!canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });

  const ids = new Set(db.store.students.filter((s) => (s.className || '(sinsiz)') === className).map((s) => s.id));
  let list = db.store.grades.filter((g) => ids.has(g.studentId) && (!subject || g.subject === subject) && (!date || g.date === date));
  if (month && year) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    list = list.filter((g) => g.date.startsWith(prefix));
  }
  res.json(list);
});

// Bitta bahoni qo'yish yoki o'chirish (jurnal uchun)
app.post('/api/teacher/grades/cell', authRequired, (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject || '').trim();
  const className = String(b.className || '').trim();
  const date = String(b.date || new Date().toISOString().slice(0, 10));
  const studentId = Number(b.studentId);
  const student = db.store.students.find((s) => s.id === studentId);
  if (!student || (student.className || '(sinsiz)') !== className) return res.status(400).json({ error: 'O`quvchi topilmadi' });
  if (!subject) return res.status(400).json({ error: 'Fan ko`rsatilmagan' });

  if (req.user.role === 'teacher') {
    const teacher = currentTeacher(req);
    if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
    if (!canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
    if (!teacher.subjects.includes(subject)) return res.status(403).json({ error: 'Bu fan sizga biriktirilmagan' });
  }

  const score = b.score === null || b.score === '' || b.score === undefined ? null : Number(b.score);
  const existing = db.store.grades.find((g) => g.studentId === studentId && g.subject === subject && g.date === date);
  if (score === null || !(score >= 1 && score <= 5)) {
    if (existing) db.store.grades = db.store.grades.filter((g) => g !== existing);
  } else {
    if (existing) existing.score = score;
    else db.store.grades.push({ id: db.nextId('grades'), studentId, subject, score, date });
  }
  db.saveCollection('grades');
  res.json({ ok: true });
});

app.post('/api/teacher/grades/bulk', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const b = req.body || {};
  const date = String(b.date || new Date().toISOString().slice(0, 10));
  const subject = String(b.subject || '').trim();
  if (!b.className || !subject || !Array.isArray(b.scores)) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  if (!canClass(teacher, b.className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
  if (!teacher.subjects.includes(subject)) return res.status(403).json({ error: 'Bu fan sizga biriktirilmagan' });

  const ids = new Set(db.store.students.filter((s) => (s.className || '(sinsiz)') === b.className).map((s) => s.id));
  let count = 0;
  for (const rec of b.scores) {
    const score = Number(rec.score);
    if (!ids.has(Number(rec.studentId)) || !(score >= 1 && score <= 5)) continue;
    const existing = db.store.grades.find((g) => g.studentId === Number(rec.studentId) && g.subject === subject && g.date === date);
    if (existing) existing.score = score;
    else db.store.grades.push({ id: db.nextId('grades'), studentId: Number(rec.studentId), subject, score, date });
    count++;
  }
  db.saveCollection('grades');
  res.json({ ok: true, count });
});

// ---------- O'qituvchi: davomat ----------
app.get('/api/teacher/attendance', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const date = String(req.query.date || '').trim();
  const className = String(req.query.className || '').trim();
  if (!date || !canClass(teacher, className)) return res.status(403).json({ error: 'Ruxsat yo`q' });
  const ids = new Set(db.store.students.filter((s) => (s.className || '(sinsiz)') === className).map((s) => s.id));
  res.json(db.store.attendance.filter((a) => a.date === date && ids.has(a.studentId)));
});

app.post('/api/teacher/attendance/bulk', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const b = req.body || {};
  const date = String(b.date || '').trim();
  if (!date || !b.className || !Array.isArray(b.records)) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  if (!canClass(teacher, b.className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });

  const ids = new Set(db.store.students.filter((s) => (s.className || '(sinsiz)') === b.className).map((s) => s.id));
  let count = 0;
  for (const rec of b.records) {
    const status = rec.status;
    if (!ids.has(Number(rec.studentId)) || !['present', 'absent', 'late'].includes(status)) continue;
    const existing = db.store.attendance.find((a) => a.studentId === Number(rec.studentId) && a.date === date);
    if (existing) existing.status = status;
    else db.store.attendance.push({ id: db.nextId('attendance'), studentId: Number(rec.studentId), date, status });
    count++;
  }
  db.saveCollection('attendance');
  res.json({ ok: true, count });
});

// ---------- Nazorat topshiriqlari ----------
app.get('/api/tests', authRequired, (req, res) => {
  const className = String(req.query.className || '').trim();
  let list = db.store.tests;
  if (req.user.role === 'teacher') list = list.filter((t) => t.teacherId === req.user.teacherId);
  if (className) list = list.filter((t) => t.className === className);
  list = list
    .map((t) => ({ ...t, resultsCount: Array.isArray(t.results) ? t.results.length : 0 }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});

app.post('/api/tests', authRequired, (req, res) => {
  let teacher = null;
  if (req.user.role === 'teacher') {
    teacher = currentTeacher(req);
    if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  }
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const className = String(b.className || '').trim();
  const subject = String(b.subject || '').trim();
  if (!title || !className || !subject) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  if (teacher && !canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });

  db.store.tests.push({
    id: db.nextId('tests'),
    title,
    className,
    subject,
    teacherId: teacher ? teacher.id : null,
    date: b.date || new Date().toISOString().slice(0, 10),
    maxScore: Number(b.maxScore) || 100,
    results: Array.isArray(b.results) ? b.results : [],
    createdAt: new Date().toISOString(),
  });
  db.saveCollection('tests');
  res.status(201).json({ ok: true });
});

app.put('/api/tests/:id/results', authRequired, (req, res) => {
  const test = db.store.tests.find((t) => t.id === Number(req.params.id));
  if (!test) return res.status(404).json({ error: 'Nazorat topilmadi' });
  if (req.user.role === 'teacher' && test.teacherId !== req.user.teacherId) {
    return res.status(403).json({ error: 'Bu nazorat sizga tegishli emas' });
  }
  const results = (req.body || {}).results;
  if (!Array.isArray(results)) return res.status(400).json({ error: 'Natijalar kiritilmagan' });
  for (const r of results) {
    const score = Number(r.score);
    const idx = test.results.findIndex((x) => x.studentId === Number(r.studentId));
    if (idx >= 0) test.results[idx].score = score;
    else test.results.push({ studentId: Number(r.studentId), score });
  }
  db.saveCollection('tests');
  res.json({ ok: true });
});

app.delete('/api/tests/:id', authRequired, (req, res) => {
  const test = db.store.tests.find((t) => t.id === Number(req.params.id));
  if (!test) return res.status(404).json({ error: 'Nazorat topilmadi' });
  if (req.user.role === 'teacher' && test.teacherId !== req.user.teacherId) {
    return res.status(403).json({ error: 'Bu nazorat sizga tegishli emas' });
  }
  db.store.tests = db.store.tests.filter((t) => t.id !== Number(req.params.id));
  db.saveCollection('tests');
  res.json({ ok: true });
});

// ---------- O'qituvchi: oylik statistika ----------
app.get('/api/teacher/stats', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  const byClass = {};
  const perStudent = [];
  const subjectMap = {};

  for (const className of teacher.classes) {
    const studs = db.store.students.filter((s) => (s.className || '(sinsiz)') === className);
    const ids = new Set(studs.map((s) => s.id));
    const classGrades = db.store.grades.filter((g) => ids.has(g.studentId) && g.date.startsWith(prefix));
    const classAtt = db.store.attendance.filter((a) => ids.has(a.studentId) && a.date.startsWith(prefix));
    const classTests = db.store.tests.filter((t) => t.className === className && t.date.startsWith(prefix));
    const classStudentGrades = db.store.grades.filter((g) => ids.has(g.studentId));

    const avg = classGrades.length ? classGrades.reduce((a, b) => a + b.score, 0) / classGrades.length : null;
    byClass[className] = {
      className,
      count: studs.length,
      gradesCount: classGrades.length,
      testsCount: classTests.length,
      avg: avg ? Number(avg.toFixed(2)) : null,
      present: classAtt.filter((a) => a.status === 'present').length,
      absent: classAtt.filter((a) => a.status === 'absent').length,
      late: classAtt.filter((a) => a.status === 'late').length,
    };

    for (const s of studs) {
      const g = classStudentGrades.filter((x) => x.studentId === s.id);
      const sAvg = g.length ? g.reduce((a, b) => a + b.score, 0) / g.length : null;
      perStudent.push({ id: s.id, fullName: `${s.lastName} ${s.firstName}`, className, avg: sAvg ? Number(sAvg.toFixed(2)) : null, count: g.length });
    }
    for (const g of classGrades) {
      if (!subjectMap[g.subject]) subjectMap[g.subject] = [];
      subjectMap[g.subject].push(g.score);
    }
  }

  const subjects = Object.entries(subjectMap).map(([subject, arr]) => {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { subject, avg: Number(avg.toFixed(2)), count: arr.length };
  });

  for (const className of Object.keys(byClass)) {
    for (const p of perStudent) if (p.className === className) {
      const t = db.store.tests.filter((x) => x.className === className && x.date.startsWith(prefix));
      p.testAvg = null;
    }
  }

  const topStudents = perStudent.filter((p) => p.avg !== null).sort((a, b) => b.avg - a.avg).slice(0, 5);

  res.json({ month, year, classes: Object.values(byClass), subjects, perStudent, topStudents });
});

// ---------- O'quvchilar ----------
app.get('/api/students', authRequired, adminOnly, (req, res) => {
  res.json(db.store.students);
});

app.post('/api/students', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.firstName || !b.lastName) return res.status(400).json({ error: 'Ism va familya majburiy' });

  const student = {
    id: db.nextId('students'),
    firstName: String(b.firstName).trim(),
    lastName: String(b.lastName).trim(),
    patronymic: String(b.patronymic || '').trim(),
    className: String(b.className || '').trim(),
    birthDate: b.birthDate || null,
    monthlyFee: Number(b.monthlyFee) || 0,
    address: String(b.address || '').trim(),
    parentName: String(b.parentName || '').trim(),
    parentPhone: String(b.parentPhone || '').trim(),
    photo: null,
    createdAt: new Date().toISOString(),
  };

  db.store.students.push(student);

  // Ota-ona uchun login/parolni avtomatik yaratish
  let parentUsername = b.parentUsername ? String(b.parentUsername).trim().toLowerCase() : null;
  let parentPassword = b.parentPassword ? String(b.parentPassword) : null;
  if (!parentUsername) parentUsername = makeUsername(student.lastName, student.firstName);
  if (!parentPassword || String(parentPassword).length < 4) parentPassword = makePassword(8);
  parentUsername = ensureUniqueUsername(parentUsername);

  db.store.users.push({
    id: db.nextId('users'),
    username: parentUsername,
    passwordHash: db.hashPassword(parentPassword),
    role: 'parent',
    fullName: student.parentName || `${student.firstName} ning ota-onasi`,
    studentId: student.id,
  });

  db.saveCollection('students');
  db.saveCollection('users');
  res.status(201).json({ ...student, parentUsername, parentPassword });
});

app.put('/api/students/:id', authRequired, adminOnly, (req, res) => {
  const student = db.store.students.find((s) => s.id === Number(req.params.id));
  if (!student) return res.status(404).json({ error: 'O`quvchi topilmadi' });
  const b = req.body || {};
  if (b.firstName) student.firstName = String(b.firstName).trim();
  if (b.lastName) student.lastName = String(b.lastName).trim();
  if (b.patronymic !== undefined) student.patronymic = String(b.patronymic || '').trim();
  if (b.className !== undefined) student.className = String(b.className || '').trim();
  if (b.birthDate !== undefined) student.birthDate = b.birthDate || null;
  if (b.monthlyFee !== undefined) student.monthlyFee = Number(b.monthlyFee) || 0;
  if (b.address !== undefined) student.address = String(b.address || '').trim();
  if (b.parentName !== undefined) student.parentName = String(b.parentName || '').trim();
  if (b.parentPhone !== undefined) student.parentPhone = String(b.parentPhone || '').trim();
  db.saveCollection('students');
  res.json(student);
});

app.delete('/api/students/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  db.store.students = db.store.students.filter((s) => s.id !== id);
  db.store.users = db.store.users.filter((u) => !(u.role === 'parent' && u.studentId === id));
  db.store.payments = db.store.payments.filter((p) => p.studentId !== id);
  db.store.attendance = db.store.attendance.filter((a) => a.studentId !== id);
  db.store.grades = db.store.grades.filter((g) => g.studentId !== id);
  db.saveAll();
  res.json({ ok: true });
});

// ---------- Sinflar ----------
app.get('/api/classes', authRequired, adminOnly, (req, res) => {
  const map = {};
  db.store.students.forEach((s) => {
    const name = s.className || '(sinsiz)';
    map[name] = (map[name] || 0) + 1;
  });
  const list = Object.entries(map)
    .map(([name, count]) => ({
      name,
      count,
      totalFee: db.store.students.filter((s) => (s.className || '(sinsiz)') === name).reduce((a, s) => a + (s.monthlyFee || 0), 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uz'));
  res.json(list);
});

app.delete('/api/classes/:name', authRequired, adminOnly, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const ids = db.store.students.filter((s) => (s.className || '(sinsiz)') === name).map((s) => s.id);
  if (!ids.length) return res.status(404).json({ error: 'Sinf topilmadi' });

  db.store.students = db.store.students.filter((s) => !ids.includes(s.id));
  db.store.users = db.store.users.filter((u) => !(u.role === 'parent' && ids.includes(u.studentId)));
  db.store.payments = db.store.payments.filter((p) => !ids.includes(p.studentId));
  db.store.attendance = db.store.attendance.filter((a) => !ids.includes(a.studentId));
  db.store.grades = db.store.grades.filter((g) => !ids.includes(g.studentId));
  db.saveAll();
  res.json({ ok: true, removed: ids.length });
});

// ---------- Sinf o'quvchilari ro'yxatini Word (docx) qilib yuklab olish ----------
app.get('/api/export/class', authRequired, adminOnly, async (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });

  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'uz'));

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, VerticalAlign, BorderStyle, PageOrientation, AlignmentType } = require('docx');

  const TNR = 'Times New Roman';
  const FN = (size) => ({ font: TNR, size });
  // A4 (11906 x 16838 DXA), bo'yiga (knijniy/portrait), 1 sm yon hoshiya, 1.27 sm tepa/past
  const PAGE_W = 11906;
  const LEFT_RIGHT = 567;
  const TOP_BOTTOM = 720;
  const USABLE = PAGE_W - LEFT_RIGHT * 2; // 10772
  const COLS = [700, 3300, 1800, 2500, 1700, 772]; // yig'indisi USABLE
  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };

  const cell = (text, opts = {}) =>
    new TableCell({
      width: { size: COLS[opts.col], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: opts.shading ? { fill: opts.shading, color: 'auto' } : undefined,
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      children: [
        new Paragraph(
          opts.align
            ? { alignment: opts.align, spacing: { before: 40, after: 40 }, children: [new TextRun({ text, bold: !!(opts.bold || opts.header), ...FN(opts.size || 22) })] }
            : { spacing: { before: 40, after: 40 }, children: [new TextRun({ text, bold: !!(opts.bold || opts.header), ...FN(opts.size || 22) })] }
        ),
      ],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('T/r', { col: 0, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
      cell('F.I.Sh.', { col: 1, header: true, shading: 'DCE6F1' }),
      cell("Tug'ilgan sana", { col: 2, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
      cell('Ota-onasi', { col: 3, header: true, shading: 'DCE6F1' }),
      cell('Telefon', { col: 4, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
      cell("Oylik to'lov", { col: 5, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
    ],
  });

  const bodyRows = students.map((s, i) =>
    new TableRow({
      children: [
        cell(String(i + 1), { col: 0, align: AlignmentType.CENTER }),
        cell(`${s.lastName} ${s.firstName} ${s.patronymic || ''}`.trim(), { col: 1 }),
        cell(s.birthDate || '-', { col: 2, align: AlignmentType.CENTER }),
        cell(s.parentName || '-', { col: 3 }),
        cell(s.parentPhone || '-', { col: 4, align: AlignmentType.CENTER }),
        cell(s.monthlyFee ? `${s.monthlyFee} so'm` : '-', { col: 5, align: AlignmentType.CENTER }),
      ],
    })
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: TNR, size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            orientation: PageOrientation.PORTRAIT,
            size: { width: PAGE_W, height: 16838 },
            margin: { top: TOP_BOTTOM, right: LEFT_RIGHT, bottom: TOP_BOTTOM, left: LEFT_RIGHT },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: 'OLIMP-LIDER MAXSUS HARBIY SPORT KLUBI', bold: true, ...FN(28) })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: `${className} sinf o\u2018quvchilarining umumiy ro\u2018yxati`, bold: true, ...FN(26) })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [new TextRun({ text: `O\u2018quvchilar soni: ${students.length}   |   Sana: ${new Date().toLocaleDateString('uz-UZ')}`, ...FN(22) })],
          }),
          new Table({
            width: { size: USABLE, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: COLS,
            rows: [headerRow, ...bodyRows],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = className.replace(/[^\w\d-]+/g, '_') || 'sinf';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_oquvchilar.docx"`);
  res.send(buffer);
});

app.post('/api/students/:id/photo', authRequired, adminOnly, upload.single('photo'), (req, res) => {
  const student = db.store.students.find((s) => s.id === Number(req.params.id));
  if (!student) return res.status(404).json({ error: 'O`quvchi topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });

  student.photo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  db.saveCollection('students');
  res.json({ photo: student.photo });
});

// ---------- Ota-ona login/parolini ko'rish va qayta yaratish ----------
app.get('/api/students/:id/parent-credentials', authRequired, adminOnly, (req, res) => {
  const user = db.store.users.find((u) => u.role === 'parent' && u.studentId === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Ota-ona kirish yozuvi topilmadi' });
  res.json({ parentUsername: user.username });
});

app.post('/api/students/:id/parent-credentials', authRequired, adminOnly, (req, res) => {
  const student = db.store.students.find((s) => s.id === Number(req.params.id));
  if (!student) return res.status(404).json({ error: 'O`quvchi topilmadi' });

  let user = db.store.users.find((u) => u.role === 'parent' && u.studentId === student.id);
  if (!user) {
    user = {
      id: db.nextId('users'),
      username: makeUsername(student.lastName, student.firstName),
      passwordHash: null,
      role: 'parent',
      fullName: student.parentName || `${student.firstName} ning ota-onasi`,
      studentId: student.id,
    };
    db.store.users.push(user);
  }

  const b = req.body || {};
  if (b.username && String(b.username).trim()) {
    const uname = String(b.username).trim().toLowerCase();
    const taken = db.store.users.find((u) => u.username === uname && u.id !== user.id);
    if (taken) return res.status(400).json({ error: 'Bu login band, boshqasini tanlang' });
    user.username = uname;
  }

  const newPassword = makePassword(8);
  user.passwordHash = db.hashPassword(newPassword);
  user.fullName = student.parentName || `${student.firstName} ning ota-onasi`;

  db.saveCollection('users');
  res.json({ parentUsername: user.username, parentPassword: newPassword });
});

// ---------- Oylik to'lovlar ----------
app.get('/api/payments', authRequired, (req, res) => {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (req.user.role === 'parent') {
    const list = db.store.payments.filter((p) => p.studentId === req.user.studentId);
    return res.json(list);
  }

  const studentIds = db.store.students.map((s) => s.id);
  const list = db.store.payments
    .filter((p) => studentIds.includes(p.studentId))
    .filter((p) => (!isNaN(month) ? p.month === month : true) && (!isNaN(year) ? p.year === year : true));
  res.json(list);
});

app.post('/api/payments/toggle', authRequired, adminOnly, (req, res) => {
  const { studentId, month, year, paid } = req.body || {};
  if (!studentId || !month || !year) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });

  const existing = db.store.payments.find(
    (p) => p.studentId === studentId && p.month === Number(month) && p.year === Number(year)
  );

  if (paid) {
    if (existing) {
      existing.paid = true;
      existing.paidAt = existing.paidAt || new Date().toISOString();
    } else {
      db.store.payments.push({
        id: db.nextId('payments'),
        studentId,
        month: Number(month),
        year: Number(year),
        paid: true,
        paidAt: new Date().toISOString(),
      });
    }
  } else {
    if (existing) {
      existing.paid = false;
      existing.paidAt = null;
    }
  }

  db.saveCollection('payments');
  res.json({ ok: true });
});

// ---------- Davomat ----------
app.get('/api/attendance', authRequired, (req, res) => {
  const date = req.query.date;
  let list = db.store.attendance;
  if (date) list = list.filter((a) => a.date === date);
  if (req.user.role === 'parent') list = list.filter((a) => a.studentId === req.user.studentId);
  res.json(list);
});

app.post('/api/attendance', authRequired, adminOnly, (req, res) => {
  const { studentId, date, status } = req.body || {};
  if (!studentId || !date || !status) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  const valid = ['present', 'absent', 'late'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status noto`g`ri' });

  const existing = db.store.attendance.find((a) => a.studentId === studentId && a.date === date);
  if (existing) {
    existing.status = status;
  } else {
    db.store.attendance.push({ id: db.nextId('attendance'), studentId, date, status });
  }
  db.saveCollection('attendance');
  res.json({ ok: true });
});

// ---------- Baholar ----------
app.get('/api/grades', authRequired, (req, res) => {
  const studentId =
    req.user.role === 'parent' ? Number(req.user.studentId) : Number(req.query.studentId);
  let list = db.store.grades;
  if (!isNaN(studentId)) list = list.filter((g) => g.studentId === studentId);
  res.json(list);
});

app.post('/api/grades', authRequired, adminOnly, (req, res) => {
  const { studentId, subject, score, date } = req.body || {};
  if (!studentId || !subject || !score) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  const s = Number(score);
  if (s < 1 || s > 5) return res.status(400).json({ error: 'Bahо 1–5 oralig`ida bo`lishi kerak' });

  db.store.grades.push({
    id: db.nextId('grades'),
    studentId: Number(studentId),
    subject: String(subject).trim(),
    score: s,
    date: date || new Date().toISOString().slice(0, 10),
  });
  db.saveCollection('grades');
  res.status(201).json({ ok: true });
});

app.delete('/api/grades/:id', authRequired, adminOnly, (req, res) => {
  db.store.grades = db.store.grades.filter((g) => g.id !== Number(req.params.id));
  db.saveCollection('grades');
  res.json({ ok: true });
});

// ---------- Ota-ona paneli ----------
app.get('/api/parent', authRequired, (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'Ruxsat yo`q' });
  const student = db.store.students.find((s) => s.id === req.user.studentId);
  if (!student) return res.status(404).json({ error: 'Farzand topilmadi' });

  const grades = db.store.grades.filter((g) => g.studentId === student.id);
  const attendance = db.store.attendance.filter((a) => a.studentId === student.id);
  const payments = db.store.payments.filter((p) => p.studentId === student.id);

  const subjects = {};
  for (const g of grades) {
    if (!subjects[g.subject]) subjects[g.subject] = [];
    subjects[g.subject].push(g.score);
  }
  const subjectAverages = [];
  for (const subj of Object.keys(subjects)) {
    const arr = subjects[subj];
    subjectAverages.push({ subject: subj, avg: arr.reduce((a, b) => a + b, 0) / arr.length, count: arr.length });
  }
  const avgGrade = grades.length ? grades.reduce((a, b) => a + b.score, 0) / grades.length : null;

  const dateSet = new Set([...grades.map((g) => g.date), ...attendance.map((a) => a.date)]);
  const diary = [...dateSet]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const bySubject = {};
      grades.filter((g) => g.date === date).forEach((g) => { bySubject[g.subject] = g.score; });
      return {
        date,
        attendance: attendance.find((a) => a.date === date)?.status || null,
        entries: Object.keys(bySubject).map((subject) => ({ subject, score: bySubject[subject] })),
      };
    });

  res.json({ student, grades, attendance, payments, subjectAverages, avgGrade, diary });
});

// ---------- Statistika (dashbord) ----------
app.get('/api/stats', authRequired, adminOnly, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  const totalStudents = db.store.students.length;
  const todayAttendance = db.store.attendance.filter((a) => a.date === today);
  const presentToday = todayAttendance.filter((a) => a.status === 'present').length;
  const absentToday = todayAttendance.filter((a) => a.status === 'absent').length;

  const expected = db.store.students.length;
  const thisMonthPaid = new Set(
    db.store.payments.filter((p) => p.paid && p.month === month && p.year === year).map((p) => p.studentId)
  ).size;

  const grades = db.store.grades;
  const avgSchool = grades.length ? grades.reduce((a, b) => a + b.score, 0) / grades.length : null;

  res.json({
    totalStudents,
    presentToday,
    absentToday,
    unmarkedToday: Math.max(0, expected - todayAttendance.length),
    paidThisMonth: thisMonthPaid,
    unpaidThisMonth: Math.max(0, expected - thisMonthPaid),
    avgGrade: avgSchool ? Number(avgSchool.toFixed(2)) : null,
  });
});

db.loadAll()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n=== OLIMP-LIDER tizimi ishlamoqda ===`);
      console.log(`Lokal manzil:  http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Ishga tushirishda xato:', e.message);
    process.exit(1);
  });