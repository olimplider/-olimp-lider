(function () {
  if (API.getRole() !== 'teacher') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('userInfo').textContent = '👤 ' + API.getFullName();

  function tAvatar(p) {
    const initials = ((p.fullName || '').split(' ').map((x) => x[0]).join('') || 'T').slice(0, 2).toUpperCase();
    if (p.photo) return `<img class="avatar" style="border-radius:50%;object-fit:cover" src="${escapeHtml(p.photo)}" alt="foto">`;
    return `<span class="avatar" style="border-radius:50%">${escapeHtml(initials)}</span>`;
  }

  function renderSidebarUser() {
    if (!me) return;
    document.getElementById('userInfo').innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">' + tAvatar(me.teacher) +
      '<div><div>' + escapeHtml(me.teacher.fullName) + '</div><div class="sub" style="font-weight:400">' + escapeHtml(me.teacher.position || 'O\'qituvchi') + '</div></div></div>';
  }

  const content = document.getElementById('content');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const pageTitle = document.getElementById('pageTitle');
  const topbarActions = document.getElementById('topbarActions');

  let me = null;
  let attClassName = '';
  let attDate = todayStr();
  let _jCurrent = null;
  let _jBusy = false;

  const TITLES = {
    dashboard: 'Dashbord',
    grades: 'Baholar',
    attendance: 'Davomat',
    tests: 'Nazorat topshiriqlari',
    stats: 'Statistika (oylik)',
  };

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (type === 'error' ? '#dc2626' : '#16a34a') + ';color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.2);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function showModal(html) {
    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');
  }
  function closeModal() {
    modalOverlay.classList.remove('open');
  }
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  async function loadMe() {
    if (!me) {
      me = await API.get('/api/teacher/me');
      renderSidebarUser();
    }
    return me;
  }

  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      navigate(btn.dataset.section);
    });
  });

  async function navigate(section) {
    pageTitle.textContent = TITLES[section];
    topbarActions.innerHTML = '';
    content.innerHTML = '<div class="empty-state">Yuklanmoqda...</div>';
    try {
      if (section === 'dashboard') await renderDashboard();
      else if (section === 'grades') await renderGrades();
      else if (section === 'attendance') await renderAttendance();
      else if (section === 'tests') await renderTests();
      else if (section === 'stats') await renderStats();
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  function classOptions(sel, placeholder) {
    return `<option value="">— ${placeholder} —</option>` + me.teacher.classes.map((c) => `<option value="${escapeHtml(c)}" ${c === sel ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  }

  function subjectOptions(sel) {
    const list = me.teacher.subjects.length ? me.teacher.subjects : SUBJECTS;
    return `<option value="">— Fan tanlang —</option>` + list.map((s) => `<option value="${escapeHtml(s)}" ${s === sel ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  }

  // ---------- DASHBORD ----------
  async function renderDashboard() {
    await loadMe();
    const st = await API.get('/api/teacher/stats');
    let totalStudents = 0;
    st.classes.forEach((c) => (totalStudents += c.count));

    const classCards = st.classes.map((c) => `
      <div class="stat-card">
        <div class="stat-icon purple"><span style="font-size:16px;font-weight:700">${escapeHtml(c.className)}</span></div>
        <div><div class="stat-value">${c.count}</div><div class="stat-label">o'quvchi • o'rt: ${c.avg ?? '—'}</div></div>
      </div>`).join('');

    const panels = st.classes.map((c) => `
      <div class="panel">
        <div class="panel-header"><h3>${escapeHtml(c.className)} sinf</h3><span class="badge badge-blue">${c.gradesCount} baho, ${c.testsCount} nazorat</span></div>
        <div class="panel-body">
          <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin:0">
            <div class="stat-card"><div class="stat-icon green"><span style="font-size:16px">✓</span></div><div><div class="stat-value">${c.present}</div><div class="stat-label">Keldi</div></div></div>
            <div class="stat-card"><div class="stat-icon amber"><span style="font-size:16px">⏰</span></div><div><div class="stat-value">${c.late}</div><div class="stat-label">Kechikdi</div></div></div>
            <div class="stat-card"><div class="stat-icon red"><span style="font-size:16px">✗</span></div><div><div class="stat-value">${c.absent}</div><div class="stat-label">Kelmadi</div></div></div>
          </div>
        </div>
      </div>`).join('');

    const topList = st.topStudents && st.topStudents.length ? `
      <div class="panel">
        <div class="panel-header"><h3>Eng yaxshi o'quvchilar</h3></div>
        <div class="panel-body">
          ${st.topStudents.map((p, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(212,175,55,.15)">
            <div style="display:flex;align-items:center;gap:10px"><span class="badge badge-gold" style="min-width:26px">${i + 1}</span><b>${escapeHtml(p.fullName)}</b><span class="muted">${escapeHtml(p.className)}</span></div>
            <span class="badge badge-blue">${p.avg ?? '—'}</span>
          </div>`).join('')}
        </div>
      </div>` : '';

    const subjectList = st.subjects.length ? `
      <div class="panel">
        <div class="panel-header"><h3>Fanlar bo'yicha o'rtacha (${st.month}-oy)</h3></div>
        <div class="panel-body">
          ${st.subjects.map((s) => {
            const pct = (s.avg / 5) * 100;
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="min-width:140px;font-size:14px"><b>${escapeHtml(s.subject)}</b><span class="muted"> — ${s.count}</span></div>
              <div class="progress"><div style="width:${pct}%;background:${s.avg >= 4 ? '#16a34a' : s.avg >= 3 ? '#d97706' : '#dc2626'}"></div></div>
              <div style="min-width:40px;text-align:right;font-weight:700">${s.avg}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    content.innerHTML = `
      <div class="panel profile-card">
        <div class="profile-avatar">${(me.teacher.photo
          ? '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + escapeHtml(me.teacher.photo) + '" alt="foto">'
          : '<span class="avatar" style="width:64px;height:64px;font-size:22px;border-radius:50%">' + escapeHtml(((me.teacher.fullName || 'T').split(' ').map((x) => x[0]).join('') || 'T').slice(0, 2).toUpperCase()) + '</span>')}</div>
        <div class="profile-info">
          <h3>${escapeHtml(me.teacher.fullName)}</h3>
          <div class="sub">${escapeHtml(me.teacher.position || 'O\'qituvchi')}</div>
          <div class="sub">Login: ${escapeHtml(me.user.username)}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-outline btn-sm" onclick="window.appProfileEdit()">Profilni tahrirlash</button>
        </div>
      </div>
      <div class="stats-grid">${classCards}</div>
      <div class="panel" style="background:linear-gradient(135deg,#4f46e5,#1e1b4b);color:#fff">
        <div class="topbar" style="position:static;background:transparent;border:0;padding:0 0 6px">
          <span style="font-size:15px;font-weight:700">Jami: ${totalStudents} o'quvchi • ${st.classes.length} sinf</span>
          <button class="btn btn-outline btn-sm" onclick="window.appNav('stats')">Batafsil statistika</button>
        </div>
      </div>
      ${panels}
      ${subjectList}
      ${topList}`;
  }

  // ---------- PROFIL ----------
  function appProfileEdit() {
    if (!me) return;
    showModal(`
      <div class="modal-title">Profilni tahrirlash</div>
      <div class="form-group"><label>F.I.Sh.</label><input id="tpName" value="${escapeHtml(me.teacher.fullName)}" disabled></div>
      <div class="form-group"><label>Lavozim</label><input id="tpPosition" value="${escapeHtml(me.teacher.position || '')}" placeholder="masalan: Matematika o'qituvchisi"></div>
      <div class="form-group"><label>Rasm</label><div style="display:flex;align-items:center;gap:12px">
        <div id="tpPhotoPrev">${me.teacher.photo
          ? '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + escapeHtml(me.teacher.photo) + '" alt="foto">'
          : '<span class="avatar" style="width:64px;height:64px;font-size:22px;border-radius:50%">' + escapeHtml(((me.teacher.fullName || 'T').split(' ').map((x) => x[0]).join('') || 'T').slice(0, 2).toUpperCase()) + '</span>'}</div>
        <input type="file" id="tpPhotoInp" accept="image/*" style="font-size:13px">
      </div></div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="tpSave">Saqlash</button>
      </div>`);

    const inp = document.getElementById('tpPhotoInp');
    inp.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => { document.getElementById('tpPhotoPrev').innerHTML = '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + ev.target.result + '">'; };
      r.readAsDataURL(f);
    });

    document.getElementById('tpSave').addEventListener('click', async () => {
      const btn = document.getElementById('tpSave');
      btn.disabled = true;
      try {
        const position = document.getElementById('tpPosition').value.trim();
        await API.put('/api/teacher/me', { position });
        const file = inp.files[0];
        if (file) {
          const fd = new FormData();
          fd.append('photo', file);
          await API.post('/api/teacher/photo', fd, true);
        }
        me = await API.get('/api/teacher/me');
        renderSidebarUser();
        closeModal();
        toast('Profil saqlandi');
        await renderDashboard();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  // ---------- BAHOLAR (JURNAL) ----------
  async function renderGrades() {
    await loadMe();
    if (!me.teacher.classes.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Sizga sinf biriktirilmagan</h4><p class="muted">Administratordan so\'rang.</p></div></div>';
      return;
    }
    const now = new Date();

    topbarActions.innerHTML = `<div class="toolbar">
      <select id="jClass">${classOptions('', 'Sinf')}</select>
      <select id="jSubject">${subjectOptions('')}</select>
      <select id="jMonth">${renderMonthsSelect(now.getMonth() + 1)}</select>
      <select id="jYear">${renderYearsSelect()}</select>
      <button class="btn btn-outline" onclick="window.appExportGrades()" title="Oylik baholarni Word hujjat qilib yuklab olish"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Word</button>
    </div>`;

    ['jClass', 'jSubject', 'jMonth', 'jYear'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => renderJournal());
    });

    await renderJournal();
  }

  function journalDays(month, year) {
    const W = ['Ya', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];
    const days = [];
    const last = new Date(year, month, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow === 0) continue;
      days.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d, weekday: W[dow] });
    }
    return days;
  }

  async function renderJournal() {
    const cls = document.getElementById('jClass').value;
    const subj = document.getElementById('jSubject').value;
    const month = Number(document.getElementById('jMonth').value);
    const year = Number(document.getElementById('jYear').value);

    if (!cls || !subj) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Sinf va fanni tanlang</h4><p class="muted">Jurnal tanlagan sinf va fan uchun oy davomida kunlik baholash jadvali.</p></div></div>';
      return;
    }

    const students = await API.get('/api/teacher/students?className=' + encodeURIComponent(cls));
    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Bu sinfda o\'quvchi yo\'q</h4></div></div>';
      return;
    }

    const grades = await API.get('/api/teacher/grades?className=' + encodeURIComponent(cls) + '&subject=' + encodeURIComponent(subj) + '&month=' + month + '&year=' + year);
    const map = {};
    grades.forEach((g) => { map[g.studentId + '|' + g.date] = g.score; });
    _jCurrent = { className: cls, subject: subj, month, year };

    const days = journalDays(month, year);
    const head = '<th class="jname">O\'quvchi</th>' + days.map((d) => `<th class="jhead"><div class="jday">${d.day}</div><div class="jwd">${escapeHtml(d.weekday)}</div></th>`).join('') + '<th class="jhead javghead">O\'rtacha</th>';

    const rows = students.map((s) => {
      let sum = 0, n = 0;
      const cells = days.map((d) => {
        const score = map[s.id + '|' + d.date];
        if (score) { sum += score; n++; }
        return `<td><button class="jcell ${score ? 's' + score : 's0'}" onclick="window.appJCell(${s.id},'${d.date}',this)">${score || ''}</button></td>`;
      }).join('');
      const avg = n ? (sum / n).toFixed(1) : '';
      return `<tr><td class="jname"><b>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</b></td>${cells}<td class="javg">${avg}</td></tr>`;
    }).join('');

    content.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>${escapeHtml(cls)} • ${escapeHtml(subj)} • ${monthNames()[month - 1]} ${year}</h3><span class="badge badge-blue">${students.length} o'quvchi</span></div>
        <div class="hint" style="padding:12px 14px 0">Katakka bosish bahoni aylantiradi: bo'sh → 5 → 4 → 3 → 2 → 1 → bo'sh. Har bir bosish zudlik bilan saqlanadi. (Yakshanba — dars kuni emas)</div>
        <div class="table-wrap journal-wrap">
          <table class="journal">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function jCell(studentId, date, btn) {
    if (_jBusy || !_jCurrent) return;
    _jBusy = true;
    try {
      const raw = btn ? btn.textContent.trim() : '';
      const cur = raw !== '' ? Number(raw) : 0;
      const seq = [5, 4, 3, 2, 1, null];
      const idx = seq.indexOf(cur);
      const next = idx === -1 ? 5 : seq[idx + 1];
      await API.post('/api/teacher/grades/cell', { className: _jCurrent.className, subject: _jCurrent.subject, date, studentId, score: next });
      if (btn) {
        btn.textContent = next === null ? '' : next;
        btn.className = 'jcell ' + (next === null ? 's0' : 's' + next);
        const row = btn.closest('tr');
        if (row) {
          let sum = 0, n = 0;
          row.querySelectorAll('.jcell').forEach((b) => { const v = Number(b.textContent.trim()); if (v) { sum += v; n++; } });
          const avgTd = row.querySelector('.javg');
          if (avgTd) avgTd.textContent = n ? (sum / n).toFixed(1) : '';
        }
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      _jBusy = false;
    }
  }

  // ---------- DAVOMAT ----------
  async function renderAttendance() {
    await loadMe();
    if (!me.teacher.classes.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Sizga sinf biriktirilmagan</h4></div></div>';
      return;
    }

    topbarActions.innerHTML = `<div class="toolbar">
      <select id="aClass">${classOptions(attClassName, 'Sinf')}</select>
      <input type="date" id="aDate" class="date-pick" value="${attDate}">
    </div>`;

    document.getElementById('aClass').addEventListener('change', (e) => { attClassName = e.target.value; renderAttTable(); });
    document.getElementById('aDate').addEventListener('change', (e) => { attDate = e.target.value; renderAttTable(); });

    await renderAttTable();
  }

  async function renderAttTable() {
    if (!attClassName) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Sinfni tanlang</h4></div></div>';
      return;
    }
    const students = await API.get('/api/teacher/students?className=' + encodeURIComponent(attClassName));
    const att = await API.get('/api/teacher/attendance?className=' + encodeURIComponent(attClassName) + '&date=' + attDate);
    const map = {};
    att.forEach((a) => (map[a.studentId] = a.status));

    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Bu sinfda o\'quvchi yo\'q</h4></div></div>';
      return;
    }

    const rows = students.map((s) => {
      const st = map[s.id] || null;
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div></div></div></td>
        <td><button class="btn btn-sm ${st === 'present' ? 'btn-success' : 'btn-ghost'}" onclick="window.appSetTAtt(${s.id},'present',this)">✓ Keldi</button></td>
        <td><button class="btn btn-sm ${st === 'late' ? 'btn-outline' : 'btn-ghost'}" onclick="window.appSetTAtt(${s.id},'late',this)" style="border-color:#d97706;color:#d97706">⏰ Kechikdi</button></td>
        <td><button class="btn btn-sm ${st === 'absent' ? 'btn-danger' : 'btn-ghost'}" onclick="window.appSetTAtt(${s.id},'absent',this)">✗ Kelmadi</button></td>
      </tr>`;
    }).join('');

    let p = 0, a = 0, l = 0;
    students.forEach((s) => {
      const st = map[s.id];
      if (st === 'present') p++;
      else if (st === 'absent') a++;
      else if (st === 'late') l++;
    });

    content.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-icon green"><span style="font-size:18px">✓</span></div><div><div class="stat-value">${p}</div><div class="stat-label">Keldi</div></div></div>
        <div class="stat-card"><div class="stat-icon amber"><span style="font-size:18px">⏰</span></div><div><div class="stat-value">${l}</div><div class="stat-label">Kechikdi</div></div></div>
        <div class="stat-card"><div class="stat-icon red"><span style="font-size:18px">✗</span></div><div><div class="stat-value">${a}</div><div class="stat-label">Kelmadi</div></div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>${escapeHtml(attClassName)} • ${escapeHtml(attDate)}</h3>
        <button class="btn btn-outline btn-sm" onclick="window.appMarkAllPresent()">Hammasini belgilash</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>O'quvchi</th><th>Keldi</th><th>Kechikdi</th><th>Kelmadi</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  async function setTAtt(studentId, status) {
    const records = [{ studentId, status }];
    await API.post('/api/teacher/attendance/bulk', { className: attClassName, date: attDate, records });
  }

  async function markAllPresent() {
    const students = await API.get('/api/teacher/students?className=' + encodeURIComponent(attClassName));
    const records = students.map((s) => ({ studentId: s.id, status: 'present' }));
    await API.post('/api/teacher/attendance/bulk', { className: attClassName, date: attDate, records });
    toast('Barchasi "Keldi" deb belgilandi');
    await renderAttTable();
  }

  // ---------- NAZORAT ----------
  async function renderTests() {
    await loadMe();
    const tests = await API.get('/api/tests');

    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-primary" onclick="window.appNewTest()">+ Yangi nazorat</button>
    </div>`;

    if (!tests.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>Hali nazorat top`shiriqlari yo\'q</h4><p class="muted">"Yangi nazorat" tugmasi orqali qo\'shing.</p></div></div>';
      return;
    }

    const cards = tests.map((t) => `
      <div class="panel">
        <div class="panel-header"><h3>${escapeHtml(t.title)}</h3><span class="badge badge-blue">${escapeHtml(t.subject)}</span></div>
        <div class="panel-body" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <span class="badge badge-purple">${escapeHtml(t.className)}</span>
          <span class="muted">${escapeHtml(t.date)} • max ${t.maxScore} ball</span>
          <span class="badge badge-green">${t.resultsCount} o'quvchi</span>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" onclick="window.appFillTest(${t.id})">Natijalar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appDelTest(${t.id})">O'chirish</button>
          </div>
        </div>
      </div>`).join('');

    content.innerHTML = cards;
  }

  async function newTestModal() {
    await loadMe();
    const classes = me.teacher.classes;
    showModal(`
      <div class="modal-title">Yangi nazorat topshiriq</div>
      <div class="form-group"><label>Nomi *</label><input id="ntTitle" placeholder="Masalan: 1-chorak nazorat ishi"></div>
      <div class="form-grid">
        <div class="form-group"><label>Sinf *</label><select id="ntClass">${classOptions('', 'Sinf')}</select></div>
        <div class="form-group"><label>Fan *</label><select id="ntSubject">${subjectOptions('')}</select></div>
        <div class="form-group"><label>Sana</label><input type="date" id="ntDate" class="date-pick" value="${todayStr()}"></div>
        <div class="form-group"><label>Maksimal ball</label><input type="number" id="ntMax" value="100" min="1"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="ntSave">Yaratish</button>
      </div>`);
    document.getElementById('ntSave').addEventListener('click', async () => {
      const body = {
        title: document.getElementById('ntTitle').value.trim(),
        className: document.getElementById('ntClass').value,
        subject: document.getElementById('ntSubject').value,
        date: document.getElementById('ntDate').value || todayStr(),
        maxScore: Number(document.getElementById('ntMax').value) || 100,
      };
      if (!body.title || !body.className || !body.subject) return toast("Nomi, sinf va fan majburiy", 'error');
      try {
        await API.post('/api/tests', body);
        closeModal();
        toast('Nazorat yaratildi');
        renderTests();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function fillTestModal(testId) {
    const tests = await API.get('/api/tests');
    const t = tests.find((x) => x.id === testId);
    if (!t) return;
    const students = await API.get('/api/teacher/students?className=' + encodeURIComponent(t.className));
    const map = {};
    (t.results || []).forEach((r) => (map[r.studentId] = r.score));

    const rows = students.map((s) => `
      <tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div></div></div></td>
        <td><input type="number" class="test-score" data-id="${s.id}" min="0" max="${t.maxScore}" value="${map[s.id] !== undefined ? map[s.id] : ''}" placeholder="—"></td>
      </tr>`).join('');

    showModal(`
      <div class="modal-title">${escapeHtml(t.title)} — natijalar (max ${t.maxScore})</div>
      ${students.length ? `<div style="max-height:340px;overflow:auto"><table><thead><tr><th>O'quvchi</th><th style="width:110px">Ball</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="hint">Bu sinfda o\'quvchi yo\'q.</div>'}
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="ftSave">Saqlash</button>
      </div>`);

    document.getElementById('ftSave').addEventListener('click', async () => {
      const results = [...document.querySelectorAll('.test-score')].map((el) => ({ studentId: Number(el.dataset.id), score: el.value.trim() === '' ? 0 : Number(el.value) })).filter((x) => !isNaN(x.score));
      try {
        await API.put('/api/tests/' + testId + '/results', { results });
        closeModal();
        toast('Natijalar saqlandi');
        renderTests();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function deleteTest(id) {
    if (!confirm('Nazorat natijalari bilan o\'chirilsinmi?')) return;
    await API.del('/api/tests/' + id);
    toast('O\'chirildi');
    renderTests();
  }

  // ---------- STATISTIKA ----------
  async function renderStats() {
    await loadMe();
    const now = new Date();
    const selMonth = now.getMonth() + 1;
    const selYear = now.getFullYear();
    topbarActions.innerHTML = `<div class="toolbar">
      <select id="stMonth">${renderMonthsSelect(selMonth)}</select>
      <select id="stYear">${renderYearsSelect()}</select>
    </div>`;

    document.getElementById('stMonth').addEventListener('change', () => renderStats());
    document.getElementById('stYear').addEventListener('change', () => renderStats());

    const month = Number(document.getElementById('stMonth').value);
    const year = Number(document.getElementById('stYear').value);
    const st = await API.get('/api/teacher/stats?month=' + month + '&year=' + year);

    const classCards = st.classes.map((c) => `
      <div class="panel">
        <div class="panel-header"><h3>${escapeHtml(c.className)}</h3><span class="badge badge-blue">O'rt: ${c.avg ?? '—'}</span></div>
        <div class="panel-body">
          <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin:0">
            <div class="stat-card"><div class="stat-icon green"><span style="font-size:16px">✓</span></div><div><div class="stat-value">${c.present}</div><div class="stat-label">Keldi</div></div></div>
            <div class="stat-card"><div class="stat-icon amber"><span style="font-size:16px">⏰</span></div><div><div class="stat-value">${c.late}</div><div class="stat-label">Kechikdi</div></div></div>
            <div class="stat-card"><div class="stat-icon red"><span style="font-size:16px">✗</span></div><div><div class="stat-value">${c.absent}</div><div class="stat-label">Kelmadi</div></div></div>
            <div class="stat-card"><div class="stat-icon purple"><span style="font-size:16px">${c.testsCount}</span></div><div><div class="stat-label">Nazorat</div></div></div>
          </div>
        </div>
      </div>`).join('');

    const studentRows = st.perStudent.map((p) => `
      <tr>
        <td><div class="student-cell"><b>${escapeHtml(p.fullName)}</b><div class="sub">${escapeHtml(p.className)}</div></div></td>
        <td><span class="badge ${p.avg === null ? '' : p.avg >= 4 ? 'badge-green' : p.avg >= 3 ? 'badge-amber' : 'badge-red'}">${p.avg ?? '—'}</span></td>
        <td>${p.count}</td>
      </tr>`).join('');

    const subjectRows = st.subjects.map((s) => `
      <tr><td>${escapeHtml(s.subject)}</td><td><span class="badge badge-blue">${s.avg}</span></td><td>${s.count}</td></tr>`).join('');

    content.innerHTML = `
      <div class="stats-grid">${classCards}</div>
      <div class="panel">
        <div class="panel-header"><h3>Fanlar bo'yicha o'rtacha</h3></div>
        ${subjectRows ? `<div class="table-wrap"><table><thead><tr><th>Fan</th><th>O'rtacha</th><th>Baho soni</th></tr></thead><tbody>${subjectRows}</tbody></table></div>` : '<div class="panel-body"><p class="empty-note">Bu oyda baho kiritilmagan.</p></div>'}
      </div>
      <div class="panel">
        <div class="panel-header"><h3>O'quvchilar bo'yicha</h3></div>
        ${studentRows ? `<div class="table-wrap"><table><thead><tr><th>O'quvchi</th><th>O'rtacha baho</th><th>Baho soni</th></tr></thead><tbody>${studentRows}</tbody></table></div>` : '<div class="panel-body"><p class="empty-note">Bu oyda ma\'lumot yo\'q.</p></div>'}
      </div>`;
  }

  // ---------- Chiqish ----------
  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('fullName');
    window.location.href = '/login.html';
  });

  // ---------- Global ----------
  window.appNav = (s) => {
    document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === s));
    navigate(s);
  };
  window.appCloseModal = closeModal;
  window.appProfileEdit = () => appProfileEdit();
  window.appNewTest = () => newTestModal();
  window.appFillTest = (id) => fillTestModal(id);
  window.appDelTest = (id) => deleteTest(id);
  window.appExportGrades = async () => {
    if (!_jCurrent) {
      toast('Avval sinf va fanni tanlang', 'error');
      return;
    }
    toast('Word hujjat tayyorlanmoqda...');
    try {
      const q = 'className=' + encodeURIComponent(_jCurrent.className) +
        '&subject=' + encodeURIComponent(_jCurrent.subject) +
        '&month=' + _jCurrent.month + '&year=' + _jCurrent.year;
      const res = await fetch('/api/export/grades?' + q, { headers: { Authorization: 'Bearer ' + API.getToken() } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Yuklab olishda xato');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (_jCurrent.className + '_' + _jCurrent.subject + '_' + _jCurrent.month + '_' + _jCurrent.year + '.docx').replace(/\s+/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Word fayl yuklab olindi');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  window.appMarkAllPresent = () => markAllPresent();
  window.appJCell = (id, date, btn) => jCell(id, date, btn);
  window.appRefresh = async () => {
    const btn = document.querySelector('.nav-item[data-section].active');
    if (!btn) return;
    const y = window.scrollY;
    await navigate(btn.dataset.section);
    if (y) window.scrollTo(0, y);
  };
  window.appSetTAtt = async (id, status) => {
    await setTAtt(id, status);
    await renderAttTable();
  };

  // start
  initContact('contactLinks');
  initContact('contactTop');
  initClock('clock');
  navigate('dashboard');
})();