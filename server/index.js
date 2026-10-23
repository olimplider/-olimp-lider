const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const db = require('./db');
const secretPages = require('./secret-pages');
const telegram = require('./telegram');
const secrets = require('./secrets');

// ---------- .env.local yuklash (dotenv o'rniga, minimal) ----------
// TELEGRAM_BOT_TOKEN kabi maxfiy qiymatlar shu yerda, git'ga tushmaydi.
try {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (e) { /* muhit fayli yo'q — normal */ }

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
app.use(compression({ threshold: 1024 }));

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
  limit: 3000, // IP boshiga so'rov (chat paneli har 5s da so'raydi — Wi-Fi orqali umumiy IP bo'lsa 900 yetarli emas edi)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'So\'rovlar soni oshib ketdi. Birozdan so\'ng qayta urinib ko\'ring.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ---------- Statik frontend (faqat css/js/assets) ----------
// HTML sahifalar views/ papkasida va faqat maxfiy kalit orqali beriladi.
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const VIEWS_DIR = path.join(__dirname, '..', 'views');
app.use(express.static(CLIENT_DIR, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.js', '.css', '.json'].includes(ext)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// ---------- Maxfiy sahifalarni ochish ----------
// /site?<maxfiy-kalit>  ->  mos HTML fayl
app.get(secretPages.GATE_PATH, (req, res) => {
  const key = secretPages.extractKey(req.originalUrl);
  const file = secretPages.pageForKey(key);
  if (!file) return res.status(404).send('404');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(VIEWS_DIR, file));
});

// Eski ochiq manzillar bloklanadi: .html faqat /site orqali beriladi
app.use((req, res, next) => {
  if (/\.html$/i.test(req.path)) return res.status(404).send('404');
  next();
});

// ---------- Asosiy manzil: olimplider.uz -> kirish sahifasi ----------
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(VIEWS_DIR, 'login.html'));
});

// ---------- Rasmlar: faylda saqlanadi (DB da faqat URL) ----------
// Sabab: base64 rasm DB ga yozilsa, students kolleksiyasi 1.1 MB ga chiqadi
// va har bir saqlashda butun kolleksiya qayta yoziladi.
const PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

function savePhotoFile(buffer, mimetype, prefix) {
  const ext = PHOTO_EXT[mimetype] || '.jpg';
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return '/uploads/' + name;
}

function removePhotoFile(photoUrl) {
  if (!photoUrl || !String(photoUrl).startsWith('/uploads/')) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(String(photoUrl)))); } catch (e) { /* fayl yo'q */ }
}

function setPhoto(record, buffer, mimetype, prefix) {
  const old = record.photo;
  record.photo = savePhotoFile(buffer, mimetype, prefix);
  if (old && String(old).startsWith('/uploads/')) removePhotoFile(old);
}

// ---------- Photo endpoints (fayl yoki base64 + cache) ----------
function sendPhoto(record, res) {
  if (!record || !record.photo) return res.status(404).json({ error: 'Rasm topilmadi' });
  const p = String(record.photo);
  if (p.startsWith('/uploads/')) {
    const fp = path.join(UPLOAD_DIR, path.basename(p));
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Rasm topilmadi' });
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.sendFile(fp);
  }
  const m = p.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return res.status(404).json({ error: 'Noto\'g\'ri rasm formati' });
  const buf = Buffer.from(m[2], 'base64');
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.setHeader('ETag', require('crypto').createHash('md5').update(buf).digest('hex'));
  res.send(buf);
}

app.get('/api/students/:id/photo', (req, res) => {
  const rec = db.store.students.find((s) => s.id === Number(req.params.id));
  sendPhoto(rec, res);
});
app.get('/api/teachers/:id/photo', (req, res) => {
  const rec = db.store.teachers.find((t) => t.id === Number(req.params.id));
  sendPhoto(rec, res);
});
app.get('/api/doctors/:id/photo', (req, res) => {
  const rec = db.store.doctors.find((d) => d.id === Number(req.params.id));
  sendPhoto(rec, res);
});

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
    { id: user.id, username: user.username, role: user.role, studentId: user.studentId || null, teacherId: user.teacherId || null, doctorId: user.doctorId || null },
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

function sortStudents(list) {
  return list.slice().sort((a, b) => {
    const c = String(a.lastName || '').localeCompare(String(b.lastName || ''));
    if (c !== 0) return c;
    return String(a.firstName || '').localeCompare(String(b.firstName || ''));
  });
}

// 1- va 2-sinflar 5 kun, qolgan sinflar 6 kun
function lessonDaysFor(className) {
  const m = String(className || '').match(/^(\d+)/);
  const grade = m ? Number(m[1]) : 0;
  return grade === 1 || grade === 2 ? 5 : 6;
}

function makePassword(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let p = '';
  for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

// Parolni ikki ko'rinishda saqlash: bcrypt (kirish) + shifrlangan (ko'rsatish)
function setUserPassword(user, plainPassword) {
  user.passwordHash = db.hashPassword(plainPassword);
  user.pwEnc = secrets.encrypt(plainPassword);
}

// Foydalanuvchining saqlangan parolini olish (bo'lsa)
function userPassword(user) {
  if (!user) return '';
  if (user.pwEnc) return secrets.decrypt(user.pwEnc);
  return '';
}

// Parol saqlanmagan foydalanuvchiga bir marta parol berish (keyin barqaror)
function ensureUserPassword(user) {
  const existing = userPassword(user);
  if (existing) return existing;
  const pw = makePassword(8);
  setUserPassword(user, pw);
  return pw;
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
  res.json({ token, role: user.role, fullName: user.fullName, studentId: user.studentId || null, teacherId: user.teacherId || null, redirect: secretPages.roleUrl(user.role) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.store.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, studentId: user.studentId || null, teacherId: user.teacherId || null, redirect: secretPages.roleUrl(user.role) });
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
  db.store.schedule = db.store.schedule.map((s) => (s.subject === old ? { ...s, subject: name } : s));
  db.saveCollection('subjects');
  db.saveCollection('grades');
  db.saveCollection('tests');
  db.saveCollection('teachers');
  db.saveCollection('schedule');
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
  db.store.schedule = db.store.schedule
    .map((s) => (s.subject === name ? { ...s, subject: '', teacherId: null } : s));
  db.saveCollection('subjects');
  db.saveCollection('teachers');
  db.saveCollection('schedule');
  res.json({ ok: true, subjects: next });
});

// ---------- Dars jadvali ----------
const DAY_NAMES = ['', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const LESSON_COUNT = 6;

// GET /api/schedule?className=X  (ota-ona, o'qituvchi, admin)
app.get('/api/schedule', authRequired, (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });

  if (req.user.role === 'teacher') {
    const t = db.store.teachers.find((x) => x.id === req.user.teacherId) || null;
    if (!t || !canClass(t, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
  } else if (req.user.role === 'parent') {
    const s = db.store.students.find((x) => x.id === req.user.studentId);
    if (!s || (s.className || '(sinsiz)') !== className) return res.status(403).json({ error: 'Bu sinf farzandingizga tegishli emas' });
  }

  const days = lessonDaysFor(className);
  const slots = db.store.schedule
    .filter((s) => s.className === className)
    .map((s) => ({ dayOfWeek: Number(s.dayOfWeek), lessonNo: Number(s.lessonNo), subject: s.subject || '', teacherId: s.teacherId || null }));
  res.json({ className, days, lessonCount: LESSON_COUNT, dayNames: DAY_NAMES.slice(1, days + 1), slots });
});

// PUT /api/schedule  (admin) — sinf jadvalini to'liq almashtirish
app.put('/api/schedule', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  const className = String(b.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });
  const days = lessonDaysFor(className);
  const raw = Array.isArray(b.slots) ? b.slots : [];

  const slots = [];
  for (const r of raw) {
    const subject = String(r.subject || '').trim();
    const day = Number(r.dayOfWeek);
    const no = Number(r.lessonNo);
    if (!subject) continue;
    if (!(day >= 1 && day <= days)) continue;
    if (!(no >= 1 && no <= LESSON_COUNT)) continue;
    slots.push({ className, dayOfWeek: day, lessonNo: no, subject, teacherId: r.teacherId ? Number(r.teacherId) : null });
  }

  db.store.schedule = db.store.schedule.filter((s) => s.className !== className).concat(
    slots.map((s) => ({ id: db.nextId('schedule'), ...s }))
  );
  db.saveCollection('schedule');
  res.json({ ok: true, className, count: slots.length });
});

// DELETE /api/schedule?className=X  (admin)
app.delete('/api/schedule', authRequired, adminOnly, (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });
  db.store.schedule = db.store.schedule.filter((s) => s.className !== className);
  db.saveCollection('schedule');
  res.json({ ok: true });
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
    const { photo, ...rest } = t;
    return { ...rest, photoUrl: photo ? '/api/teachers/' + t.id + '/photo' : null, username: user ? user.username : null };
  });
  res.json(list);
});

app.get('/api/teacher/me', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  res.json({ teacher, user: { fullName: req.user.fullName, username: req.user.username } });
});

app.put('/api/teacher/me', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const b = req.body || {};
  if (b.position !== undefined) {
    teacher.position = String(b.position || '').trim();
    db.saveCollection('teachers');
  }
  res.json({ ok: true, teacher });
});

app.post('/api/teacher/photo', authRequired, teacherOnly, upload.single('photo'), (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  setPhoto(teacher, req.file.buffer, req.file.mimetype, 't' + teacher.id);
  db.saveCollection('teachers');
  res.json({ photo: teacher.photo });
});

app.post('/api/teachers', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || '').trim();
  if (!fullName) return res.status(400).json({ error: 'To`liq ism majburiy' });

  const teacher = {
    id: db.nextId('teachers'),
    fullName,
    position: String(b.position || '').trim(),
    photo: b.photo || null,
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
    pwEnc: secrets.encrypt(password),
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
    setUserPassword(user, String(b.password));
  } else {
    setUserPassword(user, makePassword(8));
  }

  db.saveCollection('users');
  res.json({ username: user.username, password: b.password ? String(b.password) : userPassword(user), fresh: !b.password });
});

// O'qituvchi login/parolini KO'RISH (parol o'zgartirilmaydi)
app.get('/api/teachers/:id/credentials', authRequired, adminOnly, (req, res) => {
  const teacher = db.store.teachers.find((t) => t.id === Number(req.params.id));
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const user = db.store.users.find((u) => u.role === 'teacher' && u.teacherId === teacher.id);
  if (!user) return res.status(404).json({ error: 'Kirish yozuvi topilmadi' });
  res.json({ username: user.username, password: userPassword(user) });
});

app.put('/api/teachers/:id', authRequired, adminOnly, (req, res) => {
  const teacher = db.store.teachers.find((t) => t.id === Number(req.params.id));
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const b = req.body || {};
  if (b.fullName !== undefined) teacher.fullName = String(b.fullName).trim();
  if (b.position !== undefined) teacher.position = String(b.position || '').trim();
  if (b.photo !== undefined) {
    // Faqat serverda saqlangan fayl yoki null — tashqi data URL qabul qilinmaydi
    const v = b.photo ? String(b.photo) : null;
    if (v && !v.startsWith('/uploads/')) return res.status(400).json({ error: 'Rasmni faqat fayl orqali o`zgartiring' });
    if (v !== teacher.photo) removePhotoFile(teacher.photo);
    teacher.photo = v;
  }
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
  db.store.teacher_attendance = db.store.teacher_attendance.filter((a) => a.teacherId !== id);
  db.saveCollection('teachers');
  db.saveCollection('users');
  db.saveCollection('tests');
  db.saveCollection('teacher_attendance');
  res.json({ ok: true });
});

// ---------- Shifokorlar ----------
function doctorOnly(req, res, next) {
  if (req.user.role !== 'doctor') return res.status(403).json({ error: 'Ruxsat yo`q' });
  next();
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function medicalView(m) {
  if (!m) return { hasForm: false, status: 'none', expiresAt: null, lastCheckedAt: null };
  if (!m.form086) return { hasForm: false, status: 'none', expiresAt: null, lastCheckedAt: m.lastCheckedAt || null };
  const expired = !m.expiresAt || m.expiresAt < new Date().toISOString().slice(0, 10);
  return {
    hasForm: true,
    status: expired ? 'expired' : 'ok',
    expiresAt: m.expiresAt || null,
    lastCheckedAt: m.lastCheckedAt || null,
  };
}

app.get('/api/doctors', authRequired, adminOnly, (req, res) => {
  const list = db.store.doctors.map((d) => {
    const user = db.store.users.find((u) => u.doctorId === d.id);
    const { photo, ...rest } = d;
    return { ...rest, photoUrl: photo ? '/api/doctors/' + d.id + '/photo' : null, username: user ? user.username : null };
  });
  res.json(list);
});

app.post('/api/doctors', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || '').trim();
  if (!fullName) return res.status(400).json({ error: 'To`liq ism majburiy' });

  const doctor = {
    id: db.nextId('doctors'),
    fullName,
    position: String(b.position || '').trim(),
    photo: b.photo || null,
    createdAt: new Date().toISOString(),
  };
  db.store.doctors.push(doctor);

  let username = b.username ? String(b.username).trim().toLowerCase() : makeUsername(fullName.split(' ')[0], fullName.split(' ')[1] || '');
  username = ensureUniqueUsername(username || makeUsername('shifokor', String(doctor.id)));
  const password = b.password && String(b.password).length >= 4 ? String(b.password) : makePassword(8);

const user = {
    id: db.nextId('users'),
    username,
    passwordHash: db.hashPassword(password),
    pwEnc: secrets.encrypt(password),
    role: 'doctor',
    fullName,
    doctorId: doctor.id,
    studentId: null,
    teacherId: null,
  };
  db.store.users.push(user);

  db.saveCollection('doctors');
  db.saveCollection('users');
  res.status(201).json({ ok: true, doctor, username, password });
});

app.post('/api/doctors/:id/credentials', authRequired, adminOnly, (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === Number(req.params.id));
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });

  let user = db.store.users.find((u) => u.doctorId === doctor.id);
  if (!user) {
    const base = makeUsername(doctor.fullName.split(' ')[0], doctor.fullName.split(' ')[1] || '');
    user = {
      id: db.nextId('users'),
      username: ensureUniqueUsername(base || 'shifokor'),
      passwordHash: null,
      role: 'doctor',
      fullName: doctor.fullName,
      doctorId: doctor.id,
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
    setUserPassword(user, String(b.password));
  } else {
    setUserPassword(user, makePassword(8));
  }
  if (user.fullName !== doctor.fullName) user.fullName = doctor.fullName;

  db.saveCollection('users');
  res.json({ username: user.username, password: b.password ? String(b.password) : userPassword(user), fresh: !b.password });
});

// Shifokor login/parolini KO'RISH (parol o'zgartirilmaydi)
app.get('/api/doctors/:id/credentials', authRequired, adminOnly, (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === Number(req.params.id));
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  const user = db.store.users.find((u) => u.role === 'doctor' && u.doctorId === doctor.id);
  if (!user) return res.status(404).json({ error: 'Kirish yozuvi topilmadi' });
  res.json({ username: user.username, password: userPassword(user) });
});

app.put('/api/doctors/:id', authRequired, adminOnly, (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === Number(req.params.id));
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  const b = req.body || {};
  if (b.fullName !== undefined) doctor.fullName = String(b.fullName).trim();
  if (b.position !== undefined) doctor.position = String(b.position || '').trim();
  if (b.photo !== undefined) {
    const v = b.photo ? String(b.photo) : null;
    if (v && !v.startsWith('/uploads/')) return res.status(400).json({ error: 'Rasmni faqat fayl orqali o`zgartiring' });
    if (v !== doctor.photo) removePhotoFile(doctor.photo);
    doctor.photo = v;
  }
  const user = db.store.users.find((u) => u.doctorId === doctor.id);
  if (user) user.fullName = doctor.fullName;
  db.saveCollection('doctors');
  db.saveCollection('users');
  res.json({ ok: true });
});

app.post('/api/doctors/:id/photo', authRequired, adminOnly, upload.single('photo'), (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === Number(req.params.id));
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  setPhoto(doctor, req.file.buffer, req.file.mimetype, 'd' + doctor.id);
  db.saveCollection('doctors');
  res.json({ photo: doctor.photo });
});

app.delete('/api/doctors/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  db.store.doctors = db.store.doctors.filter((d) => d.id !== id);
  db.store.users = db.store.users.filter((u) => !(u.role === 'doctor' && u.doctorId === id));
  db.saveCollection('doctors');
  db.saveCollection('users');
  res.json({ ok: true });
});

// ---------- Shifokor paneli ----------
app.get('/api/doctor/me', authRequired, doctorOnly, (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === req.user.doctorId);
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  res.json({ doctor, user: { fullName: req.user.fullName, username: req.user.username } });
});

app.put('/api/doctor/me', authRequired, doctorOnly, (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === req.user.doctorId);
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  const b = req.body || {};
  if (b.position !== undefined) {
    doctor.position = String(b.position || '').trim();
    db.saveCollection('doctors');
  }
  res.json({ ok: true, doctor });
});

app.post('/api/doctor/photo', authRequired, doctorOnly, upload.single('photo'), (req, res) => {
  const doctor = db.store.doctors.find((d) => d.id === req.user.doctorId);
  if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  setPhoto(doctor, req.file.buffer, req.file.mimetype, 'd' + doctor.id);
  db.saveCollection('doctors');
  res.json({ photo: doctor.photo });
});

// Sog'liq kartasi: o'quvchilar + 086 holati + bugungi tekshiruv
app.get('/api/doctor/students', authRequired, doctorOnly, (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const students = db.store.students.map((s) => {
    const med = medicalView(db.store.medical.find((m) => m.studentId === s.id));
    const check = db.store.healthchecks.find((h) => h.studentId === s.id && h.date === date);
    return {
      id: s.id,
      lastName: s.lastName,
      firstName: s.firstName,
      patronymic: s.patronymic || '',
      className: s.className || '(sinsiz)',
      photoUrl: s.photo ? '/api/students/' + s.id + '/photo' : null,
      medical: med,
      health: check ? { healthOk: check.healthOk, note: check.note || '' } : null,
    };
  });
  res.json(students);
});

// 086-forma (6 oyga amal qiladi)
app.post('/api/doctor/medical', authRequired, doctorOnly, (req, res) => {
  const b = req.body || {};
  const studentId = Number(b.studentId);
  const student = db.store.students.find((s) => s.id === studentId);
  if (!student) return res.status(400).json({ error: 'O`quvchi topilmadi' });

  let rec = db.store.medical.find((m) => m.studentId === studentId);
  if (!rec) {
    rec = { id: db.nextId('medical'), studentId };
    db.store.medical.push(rec);
  }

  const form086 = !!b.form086;
  rec.form086 = form086;
  const today = new Date().toISOString().slice(0, 10);
  if (form086) {
    rec.lastCheckedAt = today;
    rec.expiresAt = b.expiresAt && String(b.expiresAt).trim() ? String(b.expiresAt).trim() : addMonths(today, 6);
  } else {
    rec.expiresAt = null;
  }

  db.saveCollection('medical');
  res.json({ ok: true, medical: medicalView(rec) });
});

app.get('/api/doctor/medical', authRequired, doctorOnly, (req, res) => {
  res.json(db.store.medical.map((m) => ({ studentId: m.studentId, form086: !!m.form086, expiresAt: m.expiresAt || null, lastCheckedAt: m.lastCheckedAt || null })));
});

// Kunlik sog'liq tekshiruvi
app.get('/api/doctor/healthchecks', authRequired, doctorOnly, (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const list = db.store.healthchecks.filter((h) => h.date === date).map((h) => {
    const s = db.store.students.find((x) => x.id === h.studentId);
    return { ...h, studentName: s ? `${s.lastName} ${s.firstName}` : '' };
  });
  res.json(list);
});

app.post('/api/doctor/healthchecks', authRequired, doctorOnly, (req, res) => {
  const b = req.body || {};
  const studentId = Number(b.studentId);
  const student = db.store.students.find((s) => s.id === studentId);
  if (!student) return res.status(400).json({ error: 'O`quvchi topilmadi' });
  const date = String(b.date || new Date().toISOString().slice(0, 10));
  const healthOk = !!b.healthOk;

  const existing = db.store.healthchecks.find((h) => h.studentId === studentId && h.date === date);
  if (existing) {
    existing.healthOk = healthOk;
    existing.note = String(b.note || '').trim();
    existing.checkedAt = new Date().toISOString();
  } else {
    db.store.healthchecks.push({
      id: db.nextId('healthchecks'),
      studentId,
      date,
      healthOk,
      note: String(b.note || '').trim(),
      checkedAt: new Date().toISOString(),
    });
  }
  db.saveCollection('healthchecks');
  res.json({ ok: true });
});

app.delete('/api/doctor/healthchecks', authRequired, doctorOnly, (req, res) => {
  const studentId = Number(req.query.studentId);
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  db.store.healthchecks = db.store.healthchecks.filter((h) => !(h.studentId === studentId && h.date === date));
  db.saveCollection('healthchecks');
  res.json({ ok: true });
});

// ---------- O'qituvchi: sinf o'quvchilari ----------
app.get('/api/teacher/students', authRequired, teacherOnly, (req, res) => {
  const teacher = currentTeacher(req);
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  const className = String(req.query.className || '').trim();
  if (!canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
  const list = sortStudents(db.store.students.filter((s) => (s.className || '(sinsiz)') === className)).map((s) => {
    const { photo, ...rest } = s;
    return { ...rest, photoUrl: photo ? '/api/students/' + s.id + '/photo' : null };
  });
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
  const absentIds = [];
  for (const rec of b.records) {
    const status = rec.status;
    if (!ids.has(Number(rec.studentId)) || !['present', 'absent', 'late'].includes(status)) continue;
    const existing = db.store.attendance.find((a) => a.studentId === Number(rec.studentId) && a.date === date);
    if (existing) existing.status = status;
    else db.store.attendance.push({ id: db.nextId('attendance'), studentId: Number(rec.studentId), date, status });
    if (status === 'absent') absentIds.push(Number(rec.studentId));
    count++;
  }
  db.saveCollection('attendance');

  // Telegram: "kelmadi" xabarlari ota-onalarga
  if (absentIds.length && telegram.configured()) {
    const targetIds = [];
    for (const sid of absentIds) {
      const st = db.store.students.find((s) => s.id === sid);
      const p = st ? telegram.parentUserOf(st) : null;
      if (p) targetIds.push(p.id);
    }
    if (targetIds.length) {
      Promise.all(targetIds.map((pid) => {
        const st = db.store.students.find((s) => {
          const u = telegram.parentUserOf(s);
          return u && u.id === pid;
        });
        return telegram.notifyParents([pid], telegram.textAbsence(st), 'absence');
      })).catch((e) => console.error('Telegram (absence):', e.message));
    }
  }

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
  res.json(sortStudents(db.store.students).map((s) => {
    const { photo, ...rest } = s;
    return { ...rest, photoUrl: photo ? '/api/students/' + s.id + '/photo' : null };
  }));
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
  invalidateStudentMap();

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
    pwEnc: secrets.encrypt(parentPassword),
    role: 'parent',
    fullName: student.parentName || `${student.firstName} ning ota-onasi`,
    studentId: student.id,
  });

  db.saveCollection('students');
  db.saveCollection('users');
  res.status(201).json({ ...student, parentUsername, parentPassword });
});

app.put('/api/students/:id', authRequired, adminOnly, async (req, res) => {
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
  invalidateStudentMap();
  db.saveCollection('students');
  await db.flushWrites();
  res.json(student);
});

app.delete('/api/students/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!db.store.students.some((s) => s.id === id)) return res.status(404).json({ error: 'O`quvchi topilmadi' });
  db.store.students = db.store.students.filter((s) => s.id !== id);
  invalidateStudentMap();
  db.store.users = db.store.users.filter((u) => !(u.role === 'parent' && u.studentId === id));
  db.store.payments = db.store.payments.filter((p) => p.studentId !== id);
  db.store.attendance = db.store.attendance.filter((a) => a.studentId !== id);
  db.store.grades = db.store.grades.filter((g) => g.studentId !== id);
  db.store.medical = db.store.medical.filter((m) => m.studentId !== id);
  db.store.healthchecks = db.store.healthchecks.filter((h) => h.studentId !== id);
  db.store.tests = db.store.tests.map((t) =>
    Array.isArray(t.results) ? { ...t, results: t.results.filter((r) => r.studentId !== id) } : t
  );
  db.saveCollection('students');
  db.saveCollection('users');
  db.saveCollection('payments');
  db.saveCollection('attendance');
  db.saveCollection('grades');
  db.saveCollection('medical');
  db.saveCollection('healthchecks');
  db.saveCollection('tests');
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
  invalidateStudentMap();
  db.store.users = db.store.users.filter((u) => !(u.role === 'parent' && ids.includes(u.studentId)));
  db.store.payments = db.store.payments.filter((p) => !ids.includes(p.studentId));
  db.store.attendance = db.store.attendance.filter((a) => !ids.includes(a.studentId));
  db.store.grades = db.store.grades.filter((g) => !ids.includes(g.studentId));
  db.saveCollection('students');
  db.saveCollection('users');
  db.saveCollection('payments');
  db.saveCollection('attendance');
  db.saveCollection('grades');
  db.saveCollection('medical');
  db.saveCollection('healthchecks');
  db.saveCollection('tests');
  db.saveCollection('schedule');
  res.json({ ok: true, removed: ids.length });
});

// ---------- Sinf o'quvchilari ro'yxatini Word (docx) qilib yuklab olish ----------
app.get('/api/export/class', authRequired, adminOnly, async (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });

  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

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

// ---------- Ota-ona login/parollarini Word (docx) qilib yuklab olish ----------
// Har bir ota-ona uchun YANGI parol yaratadi, saqlaydi va Word ga yozadi
app.get('/api/export/parents', authRequired, adminOnly, async (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });
  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
const rows = students.map((s) => {
    let u = db.store.users.find((x) => x.role === 'parent' && x.studentId === s.id);
    if (!u) {
      u = { id: db.nextId('users'), username: ensureUniqueUsername(makeUsername(s.lastName, s.firstName)), passwordHash: null, role: 'parent', fullName: s.parentName || (s.firstName + ' ning ota-onasi'), studentId: s.id };
      db.store.users.push(u);
    }
    // Parolni qayta yaratmaslik: mavjud bo'lsa o'shasini, yo'q bo'lsa yaratish
    const pw = ensureUserPassword(u);
    return { fio: (s.lastName + ' ' + s.firstName + ' ' + (s.patronymic || '')).trim(), parent: s.parentName || '-', login: u.username, pw };
  });
  db.saveCollection('users');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, VerticalAlign, BorderStyle, PageOrientation, AlignmentType } = require('docx');
  const TNR = 'Times New Roman';
  const FN = (size) => ({ font: TNR, size });
  const PAGE_W = 11906, M_SIDE = 567, M_TB = 720;
  const USABLE = PAGE_W - M_SIDE * 2;
  const COLS = [700, 3400, 2672, 2000, 2000];
  const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const cell = (text, o) => new TableCell({
    width: { size: COLS[o.col], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.sh ? { fill: o.sh, color: 'auto' } : undefined,
    borders: { top: B, bottom: B, left: B, right: B },
    children: [new Paragraph({ ...(o.align ? { alignment: o.align } : {}), spacing: { before: 40, after: 40 }, children: [new TextRun({ text, bold: !!(o.bold || o.head), ...FN(o.size || 22) })] })],
  });
  const head = new TableRow({ tableHeader: true, children: [
    cell('T/r', { col: 0, head: 1, align: AlignmentType.CENTER, sh: 'DCE6F1' }),
    cell("O`quvchi (F.I.Sh.)", { col: 1, head: 1, sh: 'DCE6F1' }),
    cell('Ota-onasi', { col: 2, head: 1, sh: 'DCE6F1' }),
    cell('Login', { col: 3, head: 1, align: AlignmentType.CENTER, sh: 'DCE6F1' }),
    cell('Parol', { col: 4, head: 1, align: AlignmentType.CENTER, sh: 'DCE6F1' }),
  ]});
  const body = rows.map((r, i) => new TableRow({ children: [
    cell(String(i + 1), { col: 0, align: AlignmentType.CENTER }),
    cell(r.fio, { col: 1 }),
    cell(r.parent, { col: 2 }),
    cell(r.login, { col: 3, align: AlignmentType.CENTER, bold: 1 }),
    cell(r.pw, { col: 4, align: AlignmentType.CENTER, bold: 1 }),
  ]}));
  const doc = new Document({
    styles: { default: { document: { run: { font: TNR, size: 22 } } } },
    sections: [{ properties: { page: { orientation: PageOrientation.PORTRAIT, size: { width: PAGE_W, height: 16838 }, margin: { top: M_TB, right: M_SIDE, bottom: M_TB, left: M_SIDE } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'OLIMP-LIDER MAXSUS HARBIY SPORT KLUBI', bold: true, ...FN(28) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: className + ' sinfi ota-onalari uchun login va parollar', bold: true, ...FN(26) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: "O`quvchilar soni: " + rows.length + "   |   Sana: " + new Date().toLocaleDateString('uz-UZ'), ...FN(22) })] }),
        new Table({ width: { size: USABLE, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: COLS, rows: [head, ...body] }),
        new Paragraph({ spacing: { before: 260 }, children: [new TextRun({ text: 'Eslatma: parollar yangi yaratildi va tizimda yangilandi.', italics: true, ...FN(20) })] }),
      ] }],
  });
  const buffer = await Packer.toBuffer(doc);
  const safe = className.replace(/[^\w\d-]+/g, '_') || 'sinf';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '_ota-ona_login_parol.docx"');
  res.send(buffer);
});

// ---------- O'quvchilar qisqa ro'yxatini Word (docx) qilib yuklab olish (FAMILYA I.O.) ----------
app.get('/api/export/shortlist', authRequired, adminOnly, async (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });
  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const rows = students.map((s) => {
    const last = String(s.lastName || '').trim().toUpperCase();
    const fi = s.firstName ? ' ' + s.firstName.trim().charAt(0).toUpperCase() + '.' : '';
    const pi = s.patronymic ? s.patronymic.trim().charAt(0).toUpperCase() : '';
    return last + fi + pi;
  });
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, VerticalAlign, BorderStyle, PageOrientation, AlignmentType } = require('docx');
  const TNR = 'Times New Roman';
  const FN = (size) => ({ font: TNR, size });
  const PAGE_W = 11906, M_SIDE = 567, M_TB = 720;
  const USABLE = PAGE_W - M_SIDE * 2;
  const COLS = [1400, 9372];
  const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const cell = (text, o) => new TableCell({
    width: { size: COLS[o.col], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.sh ? { fill: o.sh, color: 'auto' } : undefined,
    borders: { top: B, bottom: B, left: B, right: B },
    children: [new Paragraph({ ...(o.align ? { alignment: o.align } : {}), spacing: { before: 40, after: 40 }, children: [new TextRun({ text, bold: !!(o.bold || o.head), ...FN(o.size || 22) })] })],
  });
  const head = new TableRow({ tableHeader: true, children: [
    cell('T/r', { col: 0, head: 1, align: AlignmentType.CENTER, sh: 'DCE6F1' }),
    cell('F.I.Sh. (qisqa)', { col: 1, head: 1, sh: 'DCE6F1' }),
  ]});
  const body = rows.map((fio, i) => new TableRow({ children: [
    cell(String(i + 1), { col: 0, align: AlignmentType.CENTER }),
    cell(fio, { col: 1, bold: 1 }),
  ]}));
  const doc = new Document({
    styles: { default: { document: { run: { font: TNR, size: 22 } } } },
    sections: [{ properties: { page: { orientation: PageOrientation.PORTRAIT, size: { width: PAGE_W, height: 16838 }, margin: { top: M_TB, right: M_SIDE, bottom: M_TB, left: M_SIDE } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'OLIMP-LIDER MAXSUS HARBIY SPORT KLUBI', bold: true, ...FN(28) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: className + " sinf o`quvchilarining qisqa ro`yxati", bold: true, ...FN(26) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: "O`quvchilar soni: " + rows.length + "   |   Sana: " + new Date().toLocaleDateString('uz-UZ'), ...FN(22) })] }),
        new Table({ width: { size: USABLE, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: COLS, rows: [head, ...body] }),
      ] }],
  });
  const buffer = await Packer.toBuffer(doc);
  const safe = className.replace(/[^\w\d-]+/g, '_') || 'sinf';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '_qisqa_royxat.docx"');
  res.send(buffer);
});

// ---------- Sinf oylik to'lovlar jadvalini Word (docx) qilib yuklab olish (12 oy + Imzo) ----------
app.get('/api/export/payments', authRequired, adminOnly, async (req, res) => {
  const className = String(req.query.className || '').trim();
  if (!className) return res.status(400).json({ error: 'Sinf nomi ko`rsatilmagan' });
  const year = Number(req.query.year) || new Date().getFullYear();
  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const paidById = {};
  db.store.payments
    .filter((p) => p.paid)
    .forEach((p) => { (paidById[p.studentId] = paidById[p.studentId] || new Set()).add(Number(p.month) + '-' + Number(p.year)); });
  const ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
  const rows = students.map((s) => {
    const last = String(s.lastName || '').trim().toUpperCase();
    const fi = s.firstName ? ' ' + s.firstName.trim().charAt(0).toUpperCase() + '.' : '';
    const pi = s.patronymic ? s.patronymic.trim().charAt(0).toUpperCase() : '';
    const paid = paidById[s.id] || new Set();
    return { fio: last + fi + pi, months: ORDER.map((m) => paid.has(m + '-' + (m >= 9 ? year : year + 1))) };
  });
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, VerticalAlign, BorderStyle, PageOrientation, AlignmentType } = require('docx');
  const TNR = 'Times New Roman';
  const FN = (size) => ({ font: TNR, size });
  const MONTHS = ['Sen', 'Okt', 'Noy', 'Dek', 'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg'];
  const PAGE_W = 16838, M_SIDE = 567, M_TB = 567;
  const USABLE = PAGE_W - M_SIDE * 2;
  const COLS = [600, 3000].concat(Array(12).fill(800), [2504]);
  const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const cell = (text, o) => new TableCell({
    width: { size: COLS[o.col], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.sh ? { fill: o.sh, color: 'auto' } : undefined,
    borders: { top: B, bottom: B, left: B, right: B },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 30, after: 30 }, children: [new TextRun({ text, bold: !!(o.bold || o.head), ...FN(o.size || 20) })] })],
  });
  const headCells = [cell('T/r', { col: 0, head: 1, sh: 'DCE6F1' }), cell('F.I.Sh.', { col: 1, head: 1, sh: 'DCE6F1' })]
    .concat(MONTHS.map((m, i) => cell(m, { col: 2 + i, head: 1, size: 18, sh: 'DCE6F1' })))
    .concat([cell('Imzo', { col: 14, head: 1, sh: 'DCE6F1' })]);
  const head = new TableRow({ tableHeader: true, children: headCells });
  const body = rows.map((r, i) => new TableRow({ children: [cell(String(i + 1), { col: 0 }), cell(r.fio, { col: 1, size: 18 })]
    .concat(r.months.map((ok, j) => ok ? cell('+', { col: 2 + j, bold: 1, sh: 'C6EFCE' }) : cell('', { col: 2 + j })))
    .concat([cell('', { col: 14 })]) }));
  const doc = new Document({
    styles: { default: { document: { run: { font: TNR, size: 20 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: M_TB, right: M_SIDE, bottom: M_TB, left: M_SIDE } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'OLIMP-LIDER MAXSUS HARBIY SPORT KLUBI', bold: true, ...FN(28) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: className + ' sinfi — ' + year + '/' + (year + 1) + " o`quv yili oylik to`lovlar jadvali", bold: true, ...FN(26) })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "O`quvchilar soni: " + rows.length + "   |   Sana: " + new Date().toLocaleDateString('uz-UZ'), ...FN(20) })] }),
        new Table({ width: { size: USABLE, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: COLS, rows: [head, ...body] }),
        new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'Qabul qiluvchi (mas`ul xodim) imzosi: _________________  / _________________ /', ...FN(22) })] }),
      ] }],
  });
  const buffer = await Packer.toBuffer(doc);
  const safe = className.replace(/[^\w\d-]+/g, '_') || 'sinf';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '_' + year + '-' + (year + 1) + '_tolovlar.docx"');
  res.send(buffer);
});

// ---------- Oylik baholarni Word (docx) qilib yuklab olish ----------
const monthNamesUz = () => ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
app.get('/api/export/grades', authRequired, async (req, res) => {
  const className = String(req.query.className || '').trim();
  const subject = String(req.query.subject || '').trim();
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!className || !subject || !month || !year) return res.status(400).json({ error: 'Sinf, fan, oy va yil ko`rsatilishi shart' });

  if (req.user.role === 'teacher') {
    const teacher = currentTeacher(req);
    if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
    if (!canClass(teacher, className)) return res.status(403).json({ error: 'Bu sinf sizga biriktirilmagan' });
    if (!teacher.subjects.includes(subject)) return res.status(403).json({ error: 'Bu fan sizga biriktirilmagan' });
  } else if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ruxsat yo`q' });
  }

  const students = db.store.students
    .filter((s) => (s.className || '(sinsiz)') === className)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  if (!students.length) return res.status(400).json({ error: 'Bu sinfda o`quvchi yo`q' });

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const ids = new Set(students.map((s) => s.id));
  const grades = db.store.grades.filter((g) => ids.has(g.studentId) && g.subject === subject && g.date.startsWith(prefix));
  const map = {};
  grades.forEach((g) => { map[g.studentId + '|' + g.date] = g.score; });

  const W = ['Ya', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];
  const days = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue;
    days.push({ date: `${prefix}-${String(d).padStart(2, '0')}`, day: d, weekday: W[dow] });
  }

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, VerticalAlign, BorderStyle, PageOrientation, AlignmentType } = require('docx');
  const TNR = 'Times New Roman';
  const FN = (size) => ({ font: TNR, size });
  const PAGE_W = 16838, PAGE_H = 11906;
  const LEFT_RIGHT = 567;
  const USABLE = PAGE_W - LEFT_RIGHT * 2;
  const NAME_COL = 3600, INDEX_COL = 560, AVG_COL = 900;
  const DAY_COL = Math.max(560, Math.floor((USABLE - INDEX_COL - NAME_COL - AVG_COL) / Math.max(days.length, 1)));
  const COLS = [INDEX_COL, NAME_COL, ...days.map(() => DAY_COL), AVG_COL];
  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };

  const cell = (text, opts = {}) =>
    new TableCell({
      width: { size: COLS[opts.col], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: opts.shading ? { fill: opts.shading, color: 'auto' } : undefined,
      borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
      children: [
        new Paragraph({
          alignment: opts.align || undefined,
          spacing: { before: 20, after: 20 },
          children: [new TextRun({ text, bold: !!(opts.bold || opts.header), ...FN(opts.size || 20) })],
        }),
      ],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('T/r', { col: 0, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
      cell("O'quvchi F.I.Sh.", { col: 1, header: true, shading: 'DCE6F1' }),
      ...days.map((d) => cell(String(d.day), { col: 2, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1', size: 18 })),
      cell('Ort.', { col: COLS.length - 1, header: true, align: AlignmentType.CENTER, shading: 'DCE6F1' }),
    ],
  });

  const bodyRows = students.map((s, i) => {
    let sum = 0, n = 0;
    const dayCells = days.map((d, idx) => {
      const score = map[s.id + '|' + d.date];
      if (score) { sum += score; n++; }
      return cell(score ? String(score) : '', { col: 2 + idx, align: AlignmentType.CENTER, size: 18 });
    });
    const avg = n ? (sum / n).toFixed(1) : '';
    return new TableRow({
      children: [
        cell(String(i + 1), { col: 0, align: AlignmentType.CENTER }),
        cell(`${s.lastName} ${s.firstName}`.trim(), { col: 1 }),
        ...dayCells,
        cell(avg, { col: COLS.length - 1, align: AlignmentType.CENTER }),
      ],
    });
  });

  const names = monthNamesUz();
  const doc = new Document({
    styles: { default: { document: { run: { font: TNR, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            orientation: PageOrientation.LANDSCAPE,
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: LEFT_RIGHT, right: LEFT_RIGHT, bottom: LEFT_RIGHT, left: LEFT_RIGHT },
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
            spacing: { after: 60 },
            children: [new TextRun({ text: `${className} sinf o\u2018quvchilarining "${subject}" fanidan baholari`, bold: true, ...FN(26) })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: `${names[month - 1]} ${year}   |   O\u2018quvchilar soni: ${students.length}   |   Sana: ${new Date().toLocaleDateString('uz-UZ')}`, ...FN(22) })],
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
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${subject.replace(/\s+/g, '_')}_${month}_${year}.docx"`);
  res.send(buffer);
});

app.post('/api/students/:id/photo', authRequired, adminOnly, upload.single('photo'), (req, res) => {
  const student = db.store.students.find((s) => s.id === Number(req.params.id));
  if (!student) return res.status(404).json({ error: 'O`quvchi topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });

  setPhoto(student, req.file.buffer, req.file.mimetype, 's' + student.id);
  db.saveCollection('students');
  res.json({ photo: student.photo });
});

app.post('/api/teachers/:id/photo', authRequired, adminOnly, upload.single('photo'), (req, res) => {
  const teacher = db.store.teachers.find((t) => t.id === Number(req.params.id));
  if (!teacher) return res.status(404).json({ error: 'O`qituvchi topilmadi' });
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  setPhoto(teacher, req.file.buffer, req.file.mimetype, 't' + teacher.id);
  db.saveCollection('teachers');
  res.json({ photo: teacher.photo });
});

// ---------- Telegram bot: ota-ona uchun ----------
app.get('/api/telegram/my', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me || me.role !== 'parent') return res.status(403).json({ error: 'Faqat ota-ona uchun' });
  const l = telegram.linkForUser(me.id);
  res.json({
    configured: telegram.configured(),
    bot: telegram.botInfo(),
    linked: !!l,
    linkUrl: l ? null : telegram.linkUrlFor(me),
  });
});

app.post('/api/telegram/my/rotate', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me || me.role !== 'parent') return res.status(403).json({ error: 'Faqat ota-ona uchun' });
  res.json({ ok: true, linkUrl: telegram.rotateCode(me.id) });
});

// ---------- Telegram bot: admin uchun ----------
app.get('/api/telegram/status', authRequired, adminOnly, (req, res) => {
  const parents = db.store.users.filter((u) => u.role === 'parent');
  const links = telegram.links();
  const byUser = new Map(links.map((l) => [l.userId, l]));
  const list = parents.map((u) => {
    const st = db.store.students.find((s) => s.id === u.studentId);
    const l = byUser.get(u.id);
    return {
      userId: u.id,
      name: st ? telegram.fio(st) : u.fullName,
      className: st ? st.className : '',
      parentName: u.fullName,
      phone: st ? st.parentPhone : '',
      linked: !!l,
      tgUsername: l ? l.tgUsername : '',
      linkedAt: l ? l.linkedAt : null,
      linkUrl: l ? null : telegram.linkUrlFor(u),
    };
  });
  list.sort((a, b) => (a.className || '').localeCompare(b.className || '') || String(a.name).localeCompare(String(b.name)));
  res.json({
    configured: telegram.configured(),
    bot: telegram.botInfo(),
    total: parents.length,
    linked: list.filter((x) => x.linked).length,
    list,
  });
});

app.post('/api/telegram/broadcast', authRequired, adminOnly, async (req, res) => {
  const b = req.body || {};
  const text = String(b.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'Xabar matni kiritilmadi' });
  let users = db.store.users.filter((u) => u.role === 'parent');
  if (b.className) users = users.filter((u) => {
    const st = db.store.students.find((s) => s.id === u.studentId);
    return st && st.className === b.className;
  });
  if (Array.isArray(b.studentIds) && b.studentIds.length) {
    const ids = new Set(b.studentIds.map(Number));
    users = users.filter((u) => ids.has(u.studentId));
  }
  if (!users.length) return res.status(400).json({ error: 'Ota-ona topilmadi' });
  const r = await telegram.notifyParents(users.map((u) => u.id), text, 'manual');
  res.json(Object.assign({ targeted: users.length }, r));
});

// Oylik to'lov eslatmasi. studentIds berilsa FAQAT shu o'quvchilarga boradi
// (admin panelida ko'rinayotgan qatorlar). Berilmasa — butun oy qarzdorlari.
// preview: true — hech narsa yubormaydi, faqat kimga borishini qaytaradi.
app.post('/api/telegram/remind-payments', authRequired, adminOnly, async (req, res) => {
  const b = req.body || {};
  const now = new Date();
  const month = Number(b.month) || now.getMonth() + 1;
  const year = Number(b.year) || now.getFullYear();
  const preview = !!b.preview;

  const payments = db.store.payments.filter((p) => p.month === month && p.year === year);
  const paidIds = new Set(payments.filter((p) => p.paid).map((p) => p.studentId));

  let pool = db.store.students.filter((s) => Number(s.monthlyFee) > 0 && !paidIds.has(s.id));
  // studentIds berilgan bo'lsa — QAT'IY shu ro'yxat. Bo'sh massiv ham "hech kim"
  // degani (butun sinflarga ketib qolmasligi uchun).
  if (Array.isArray(b.studentIds)) {
    const ids = new Set(b.studentIds.map(Number));
    pool = pool.filter((s) => ids.has(s.id));
  }

  const items = [];
  for (const s of pool) {
    const u = telegram.parentUserOf(s);
    if (!u) continue;
    items.push({ userId: u.id, text: telegram.textDebtOne(s, month, year) });
  }

  if (!items.length) {
    return res.json({ sent: 0, noLink: 0, failed: 0, targeted: 0, debt: 0, preview, message: 'To\'lanmagan o\'quvchi topilmadi' });
  }

  const stats = {
    targeted: items.length,
    debt: pool.reduce((a, s) => a + (Number(s.monthlyFee) || 0), 0),
    linked: items.filter((it) => telegram.linkForUser(it.userId)).length,
    list: pool.map((s) => ({
      id: s.id,
      fio: telegram.fio(s),
      className: s.className || '',
      fee: Number(s.monthlyFee || 0),
      linked: !!telegram.linkForUser(telegram.parentUserOf(s).id),
    })),
    preview,
  };

  if (preview) return res.json(stats);

  const r = await telegram.notifyParentsEach(items, 'payment');
  res.json(Object.assign({}, stats, r));
});

app.post('/api/telegram/relink', authRequired, adminOnly, (req, res) => {
  const userId = Number((req.body || {}).userId);
  const u = db.store.users.find((x) => x.id === userId && x.role === 'parent');
  if (!u) return res.status(404).json({ error: 'Ota-ona topilmadi' });
  res.json({ ok: true, linkUrl: telegram.rotateCode(userId) });
});

app.post('/api/telegram/unlink', authRequired, adminOnly, (req, res) => {
  const userId = Number((req.body || {}).userId);
  res.json({ ok: telegram.unlinkUser(userId) });
});

// ---------- Ota-ona login/parolini ko'rish va qayta yaratish ----------
app.get('/api/students/:id/parent-credentials', authRequired, adminOnly, (req, res) => {
  const user = db.store.users.find((u) => u.role === 'parent' && u.studentId === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Ota-ona kirish yozuvi topilmadi' });
  res.json({ parentUsername: user.username, parentPassword: userPassword(user) });
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

  const pw = ensureUserPassword(user);
  db.saveCollection('users');
  res.json({ parentUsername: user.username, parentPassword: userPassword(user) });
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
  if (!studentId || !date) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  const valid = ['present', 'absent', 'late', null];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status noto`g`ri' });

  const existing = db.store.attendance.find((a) => a.studentId === studentId && a.date === date);
  if (status === null) {
    if (existing) db.store.attendance = db.store.attendance.filter((a) => a !== existing);
  } else if (existing) {
    existing.status = status;
  } else {
    db.store.attendance.push({ id: db.nextId('attendance'), studentId, date, status });
  }
  db.saveCollection('attendance');

  // Telegram: "kelmadi" xabari ota-onaga
  if (status === 'absent' && telegram.configured()) {
    const st = db.store.students.find((s) => s.id === studentId);
    const p = st ? telegram.parentUserOf(st) : null;
    if (p) {
      telegram.notifyParents([p.id], telegram.textAbsence(st), 'absence')
        .catch((e) => console.error('Telegram (absence):', e.message));
    }
  }

  res.json({ ok: true });
});

// ---------- O'qituvchi davomati (admin) ----------
app.get('/api/teacher-attendance', authRequired, adminOnly, (req, res) => {
  const date = String(req.query.date || '').trim();
  res.json(date ? db.store.teacher_attendance.filter((a) => a.date === date) : db.store.teacher_attendance);
});

app.post('/api/teacher-attendance', authRequired, adminOnly, (req, res) => {
  const { teacherId, date, status } = req.body || {};
  if (!teacherId || !date) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  const valid = ['present', 'absent', 'late', null];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status noto`g`ri' });

  const tid = Number(teacherId);
  const existing = db.store.teacher_attendance.find((a) => a.teacherId === tid && a.date === date);
  if (status === null) {
    if (existing) db.store.teacher_attendance = db.store.teacher_attendance.filter((a) => a !== existing);
  } else if (existing) {
    existing.status = status;
  } else {
    db.store.teacher_attendance.push({ id: db.nextId('teacher_attendance'), teacherId: tid, date, status });
  }
  db.saveCollection('teacher_attendance');
  res.json({ ok: true });
});

app.post('/api/teacher-attendance/bulk', authRequired, adminOnly, (req, res) => {
  const b = req.body || {};
  const date = String(b.date || '').trim();
  if (!date || !Array.isArray(b.records)) return res.status(400).json({ error: 'Ma`lumot to`liq emas' });
  const valid = ['present', 'absent', 'late'];
  let count = 0;
  for (const rec of b.records) {
    const status = rec.status;
    const tid = Number(rec.teacherId);
    if (!valid.includes(status) || !db.store.teachers.some((t) => t.id === tid)) continue;
    const existing = db.store.teacher_attendance.find((a) => a.teacherId === tid && a.date === date);
    if (existing) existing.status = status;
    else db.store.teacher_attendance.push({ id: db.nextId('teacher_attendance'), teacherId: tid, date, status });
    count++;
  }
  db.saveCollection('teacher_attendance');
  res.json({ ok: true, count });
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
  if (s < 1 || s > 5) return res.status(400).json({ error: 'BahO 1–5 oralig`ida bo`lishi kerak' });

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
  const { photo: _sp, ...studentView } = student;
  studentView.photoUrl = _sp ? '/api/students/' + student.id + '/photo' : null;

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

  const teachers = db.store.teachers
    .filter((t) => t.classes && t.classes.includes(student.className))
    .map((t) => ({
      id: t.id,
      fullName: t.fullName,
      position: t.position || '',
      photoUrl: t.photo ? '/api/teachers/' + t.id + '/photo' : null,
      subjects: t.subjects || [],
    }));

  const medical = medicalView(db.store.medical.find((m) => m.studentId === student.id));
  const today = new Date().toISOString().slice(0, 10);
  const todayHealth =
    db.store.healthchecks.find((h) => h.studentId === student.id && h.date === today) || null;
  const healthHistory = db.store.healthchecks
    .filter((h) => h.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((h) => ({ date: h.date, healthOk: !!h.healthOk, note: h.note || '' }));

  res.json({ student, grades, attendance, payments, subjectAverages, avgGrade, diary, teachers, medical, todayHealth, healthHistory });
});

// ---------- Ota-ona: farzand ma'lumotlarini o'zi tahrirlashi ----------
function parentOf(req, res) {
  if (req.user.role !== 'parent') {
    res.status(403).json({ error: 'Ruxsat yo`q' });
    return null;
  }
  const student = db.store.students.find((s) => s.id === req.user.studentId);
  if (!student) {
    res.status(404).json({ error: 'Farzand topilmadi' });
    return null;
  }
  return student;
}

app.put('/api/parent/student', authRequired, (req, res) => {
  const student = parentOf(req, res);
  if (!student) return;
  const b = req.body || {};
  if (b.firstName !== undefined && !String(b.firstName).trim()) return res.status(400).json({ error: 'Ism bo`sh bo`lishi mumkin emas' });
  if (b.lastName !== undefined && !String(b.lastName).trim()) return res.status(400).json({ error: 'Familiya bo`sh bo`lishi mumkin emas' });
  if (b.birthDate !== undefined && b.birthDate !== null) {
    const bd = String(b.birthDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return res.status(400).json({ error: 'Tug`ilgan sana noto`g`ri formatda' });
  }
  if (b.firstName !== undefined) student.firstName = String(b.firstName).trim();
  if (b.lastName !== undefined) student.lastName = String(b.lastName).trim();
  if (b.patronymic !== undefined) student.patronymic = String(b.patronymic || '').trim();
  if (b.birthDate !== undefined) student.birthDate = b.birthDate || null;
  if (b.address !== undefined) student.address = String(b.address || '').trim();
  if (b.parentPhone !== undefined) student.parentPhone = String(b.parentPhone || '').trim();
  if (b.parentName !== undefined) student.parentName = String(b.parentName || '').trim();

  const user = db.store.users.find((u) => u.role === 'parent' && u.studentId === student.id);
  if (user && student.parentName) user.fullName = student.parentName;

  db.saveCollection('students');
  db.saveCollection('users');
  const { photo, ...rest } = student;
  res.json({ ...rest, photoUrl: photo ? '/api/students/' + student.id + '/photo' : null });
});

app.post('/api/parent/student/photo', authRequired, upload.single('photo'), (req, res) => {
  const student = parentOf(req, res);
  if (!student) return;
  if (!req.file) return res.status(400).json({ error: 'Rasm yuklanmadi' });
  setPhoto(student, req.file.buffer, req.file.mimetype, 's' + student.id);
  db.saveCollection('students');
  res.json({ photoUrl: '/api/students/' + student.id + '/photo' });
});

app.delete('/api/parent/student/photo', authRequired, (req, res) => {
  const student = parentOf(req, res);
  if (!student) return;
  removePhotoFile(student.photo);
  student.photo = null;
  db.saveCollection('students');
  res.json({ ok: true });
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

// ---------- Chat (xabarlashish) ----------
function chatAvatar(user) {
  if (!user) return null;
  if (user.role === 'parent' && user.studentId) {
    const st = db.store.students.find((s) => s.id === user.studentId);
    if (st && st.photo) return '/api/students/' + st.id + '/photo';
  }
  if (user.role === 'teacher' && user.teacherId) {
    const t = db.store.teachers.find((x) => x.id === user.teacherId);
    if (t && t.photo) return '/api/teachers/' + t.id + '/photo';
  }
  if (user.role === 'doctor' && user.doctorId) {
    const d = db.store.doctors.find((x) => x.id === user.doctorId);
    if (d && d.photo) return '/api/doctors/' + d.id + '/photo';
  }
  return null;
}

function chatLabel(user) {
  if (!user) return 'Foydalanuvchi';
  if (user.role === 'parent' && user.studentId) {
    const st = db.store.students.find((s) => s.id === user.studentId);
    return st ? `${st.className || '?'} sinf • ${user.fullName}` : user.fullName;
  }
  return user.fullName || user.username;
}

function roleName(r) {
  return { admin: 'Admin', teacher: 'O`qituvchi', doctor: 'Shifokor', parent: 'Ota-ona' }[r] || r;
}

// Kimga yozish mumkin: rolga qarab kontaktlar
// ---------- Chat kontaktlari (N+1 tuzatildi) ----------
// Eski kod: har bir ota-ona uchun students ichidan .find() -> O(n*m).
// Endi Map bir marta quriladi -> O(n).
let _studentMapCache = null;
function studentMap() {
  if (!_studentMapCache) {
    _studentMapCache = new Map(db.store.students.map((s) => [s.id, s]));
  }
  return _studentMapCache;
}
function invalidateStudentMap() {
  _studentMapCache = null;
}

function chatContactsForUser(me) {
  const all = db.store.users;
  const contacts = [];
  const otherIds = new Set();

  if (me.role === 'admin') {
    // Admin ham mavjud foydalanuvchilarga yozishi mumkin.
    for (const u of all) {
      if (u.id === me.id) continue;
      otherIds.add(u.id);
    }
  } else if (me.role === 'parent') {
    const st = studentMap().get(me.studentId);
    if (st) {
      const teachers = db.store.teachers;
      const tById = new Map(teachers.map((t) => [t.id, t]));
      for (const tu of all) {
        if (tu.role !== 'teacher') continue;
        const t = tById.get(tu.teacherId);
        if (t && t.classes && t.classes.includes(st.className)) otherIds.add(tu.id);
      }
    }
    // Admin va shifokor ham ota-ona uchun mavjud.
    for (const u of all) {
      if (u.role === 'admin' || u.role === 'doctor') otherIds.add(u.id);
    }
  } else if (me.role === 'teacher') {
    const t = db.store.teachers.find((x) => x.id === me.teacherId);
    if (t && t.classes) {
      const classes = t.classes;
      const sm = studentMap();
      for (const pu of all) {
        if (pu.role !== 'parent' || !pu.studentId) continue;
        const st = sm.get(pu.studentId);
        if (st && classes.includes(st.className)) otherIds.add(pu.id);
      }
    }
    for (const u of all) {
      if (u.role === 'admin' || u.role === 'doctor') otherIds.add(u.id);
    }
  } else if (me.role === 'doctor') {
    for (const u of all) {
      if (u.id === me.id) continue;
      if (u.role === 'parent' || u.role === 'teacher' || u.role === 'admin') otherIds.add(u.id);
    }
  }

  for (const id of otherIds) {
    const u = all.find((x) => x.id === id);
    if (!u) continue;
    contacts.push({
      id: u.id,
      role: u.role,
      roleName: roleName(u.role),
      fullName: u.fullName,
      label: chatLabel(u),
      avatar: chatAvatar(u),
    });
  }
  return contacts;
}

function messageWith(meId, otherId) {
  const all = db.store.users;
  const u = all.find((x) => x.id === otherId);
  if (!u) return null;
  const userIds = new Set();
  for (const c of chatContactsForUser(u)) userIds.add(c.id);
  return userIds.has(meId);
}

app.get('/api/chat/contacts', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  res.json(chatContactsForUser(me));
});

app.get('/api/chat/conversations', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const all = db.store.users;
  const convMap = {};
  for (const m of db.store.messages) {
    if (m.from !== me.id && m.to !== me.id) continue;
    const otherId = m.from === me.id ? m.to : m.from;
    if (!convMap[otherId]) convMap[otherId] = [];
    convMap[otherId].push(m);
  }
  const convs = Object.keys(convMap)
    .map((oid) => {
      const o = Number(oid);
      const usr = all.find((x) => x.id === o);
      if (!usr || !messageWith(me.id, o)) return null;
      const msgs = convMap[oid].slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.to === me.id && !m.read).length;
      return {
        user: { id: usr.id, role: usr.role, roleName: roleName(usr.role), fullName: usr.fullName, label: chatLabel(usr), avatar: chatAvatar(usr) },
        last: last ? { text: last.text, at: last.createdAt, fromMe: last.from === me.id } : null,
        unread,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.last ? new Date(b.last.at).getTime() : 0) - (a.last ? new Date(a.last.at).getTime() : 0));
  res.json(convs);
});

app.get('/api/chat/history', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const otherId = Number(req.query.with) || req.query.with;
  if (!otherId || otherId === me.id) return res.status(400).json({ error: 'Suhbatdosh ko`rsatilmagan' });
  const other = db.store.users.find((x) => x.id === otherId);
  if (!other) return res.status(404).json({ error: 'Suhbatdosh topilmadi' });
  if (!messageWith(me.id, otherId)) return res.status(403).json({ error: 'Bu foydalanuvchi bilan suhbatlashish mumkin emas' });
  const conv = db.store.messages
    .filter((m) => (m.from === me.id && m.to === otherId) || (m.from === otherId && m.to === me.id))
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  res.json(conv);
});

app.post('/api/chat/send', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const { to, text } = req.body || {};
  const toId = Number(to);
  const other = db.store.users.find((x) => x.id === toId);
  if (!other) return res.status(400).json({ error: 'Qabul qiluvchi topilmadi' });
  if (!messageWith(me.id, toId)) return res.status(403).json({ error: 'Bu foydalanuvchiga yozish mumkin emas' });
  const msgText = String(text || '').trim().slice(0, 2000);
  if (!msgText) return res.status(400).json({ error: 'Xabar kiritilmadi' });
  const msg = {
    id: db.nextId('messages'),
    from: me.id,
    to: toId,
    text: msgText,
    createdAt: new Date().toISOString(),
    read: false,
  };
  db.store.messages.push(msg);
  db.saveCollection('messages');
  res.status(201).json(msg);
});

// Tanlangan o'quvchilarning ota-onalariga bir xil xabar (bitta saqlash bilan)
app.post('/api/chat/bulk', authRequired, async (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const b = req.body || {};
  const sIds = Array.isArray(b.studentIds) ? b.studentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const text = String(b.text || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'Xabar kiritilmadi' });
  if (!sIds.length) return res.status(400).json({ error: 'O\'quvchi tanlanmagan' });
  if (sIds.length > 400) return res.status(400).json({ error: 'Bir vaqtda 400 tagacha xabar yuboriladi' });

  // O'quvchi ID -> ota-ona foydalanuvchi ID
  const parentOf = {};
  for (const u of db.store.users) {
    if (u.role === 'parent' && u.studentId && !parentOf[u.studentId]) parentOf[u.studentId] = u.id;
  }
  const allowed = new Set(chatContactsForUser(me).map((c) => c.id));
  const wanted = [...new Set(sIds)];
  const targets = wanted.map((sid) => parentOf[sid]).filter((uid) => uid && allowed.has(uid));
  const noParent = wanted.length - targets.length;

  if (!targets.length) return res.status(403).json({ error: 'Hech bir ota-onaga yozish mumkin emas' });

  const now = new Date().toISOString();
  let id = db.nextId('messages');
  for (const to of targets) {
    db.store.messages.push({ id: id++, from: me.id, to, text, createdAt: now, read: false });
  }
  db.saveCollection('messages');
  res.status(201).json({ sent: targets.length, skipped: noParent });
});

app.post('/api/chat/read', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const of = Number(req.body && req.body.of);
  let changed = false;
  for (const m of db.store.messages) {
    if (m.from === of && m.to === me.id && !m.read) {
      m.read = true;
      m.readAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) db.saveCollection('messages');
  res.json({ ok: true });
});

app.get('/api/chat/unread', authRequired, (req, res) => {
  const me = db.store.users.find((u) => u.id === req.user.id);
  if (!me) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const count = db.store.messages.filter((m) => m.to === me.id && !m.read).length;
  res.json({ count });
});

// ---------- Jarayon to'xtatilishini boshqarish ----------
// DB yozuvlari navbatda (writeQueue) bajariladi. Jarayon to'xtatilganda
// ularni kutib tamomlaymiz — aks holda oxirgi o'zgarishlar yo'qoladi.
let _shuttingDown = false;
async function gracefulExit(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`${signal} qabul qilindi — navbatdagi yozuvlar tugaydi...`);
  try {
    await db.flushWrites();
    console.log('Barcha yozuvlar saqlandi.');
  } catch (e) {
    console.error('Yozuvni saqlashda xato:', e.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => gracefulExit('SIGINT'));
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('uncaughtException', (e) => {
  console.error('Kutilmagan xato:', e && e.stack ? e.stack : e);
  gracefulExit('uncaughtException');
});
process.on('unhandledRejection', (e) => {
  console.error('Tuzilmagan so\'rov rad etildi:', e && e.message ? e.message : e);
});

// ---------- 404 va xato ishlovchisi ----------
// API uchun JSON, boshqa uchun oddiy matn.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Topilmadi' });
  res.status(404).send('404');
});

// Express 5 async xatolarni avtomatik shu yerga yuboradi.
app.use((err, req, res, next) => {
  console.error('Xato:', err && err.message ? err.message : err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Server xatosi' });
  res.status(500).send('Server xatosi');
});

db.loadAll()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n=== OLIMP-LIDER tizimi ishlamoqda ===`);
      console.log(`Lokal manzil:  http://localhost:${PORT}`);
    });
    // Telegram bot (token bo'lmasa jimgina o'tkazib yuboriladi)
    telegram.init().catch((e) => console.error('Telegram bot:', e.message));
  })
  .catch((e) => {
    console.error('Ishga tushirishda xato:', e.message);
    process.exit(1);
  });
