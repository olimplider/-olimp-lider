(function () {
  const role = API.getRole();
  if (role !== 'admin' && role !== 'branch_admin') {
    goLogin();
    return;
  }

  const isBranchAdmin = role === 'branch_admin' || window.isBranchAdmin === true;

  document.getElementById('userInfo').textContent = '👤 ' + API.getFullName();

  const content = document.getElementById('content');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const pageTitle = document.getElementById('pageTitle');
  const topbarActions = document.getElementById('topbarActions');

  // Filial paneli sarlavhasini o'rnatish
  if (isBranchAdmin) {
    const branchName = API.getBranchName();
    if (branchName) {
      document.getElementById('pageTitle').textContent = 'Dashbord';
      const h2 = document.querySelector('.sidebar-header h2');
      const span = document.querySelector('.sidebar-header span');
      if (h2) h2.textContent = 'OLIMP-LIDER';
      if (span) span.textContent = branchName + '-MAKTAB FILIALI';
      document.title = 'OLIMP-LIDER — ' + branchName + '-MAKTAB FILIALI';
    }
  }

  let students = [];
  let currentSection = 'dashboard';

  // ---------- Umumiy ----------
  function showModal(html) {
    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');
  }
  function closeModal() {
    modalOverlay.classList.remove('open');
  }
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  async function loadStudents(force = false) {
    if (!force && students.length) return students;
    students = await API.get('/api/students');
    return students;
  }

  // ---------- UMUMIY QIDIRUV / FILTR / SARALASH ----------
  // Har bir bo'lim o'z holatini fState ichida saqlaydi.
  const fState = {
    students: { q: '', cls: '', pay: 'all', fee: 'all', sort: 'name' },
    payments: { q: '', cls: '', status: 'all', sort: 'name' },
    attendance: { q: '', status: 'all', sort: 'name' },
  };

  // Ism, familya, otasining ismi, sinf, ota-ona ismi yoki telefon bo'yicha
  function matchStudent(s, q) {
    if (!q) return true;
    const n = String(q).trim().toLowerCase();
    if (!n) return true;
    return [s.lastName, s.firstName, s.patronymic, s.className, s.parentName, s.parentPhone, s.address]
      .some((f) => String(f || '').toLowerCase().includes(n));
  }

  function className(s) {
    return s.className || '(sinsiz)';
  }

  // Umumiy filtr: qidiruv + sinf, keyin saralash
  function filterStudents(list, st) {
    let out = list.filter((s) => matchStudent(s, st.q));
    if (st.cls) out = out.filter((s) => className(s) === st.cls);
    if (st.status && st.status !== 'all') out = out.filter((s) => st.statusFn(s));
    if (st.sort === 'name') out = out.slice().sort((a, b) => String(a.lastName || '').localeCompare(String(b.lastName || '')) || String(a.firstName || '').localeCompare(String(b.firstName || '')));
    else if (st.sort === 'nameDesc') out = out.slice().sort((a, b) => String(b.lastName || '').localeCompare(String(a.lastName || '')) || String(a.firstName || '').localeCompare(String(b.firstName || '')));
    else if (st.sort === 'class') out = out.slice().sort((a, b) => className(a).localeCompare(className(b), 'uz') || String(a.lastName || '').localeCompare(String(b.lastName || '')));
    else if (st.sort === 'fee') out = out.slice().sort((a, b) => (Number(b.monthlyFee) || 0) - (Number(a.monthlyFee) || 0));
    return out;
  }

  // Filtr satri HTML'i
  function filterBar(id, st, opts = {}) {
    const o = Object.assign({ search: true, cls: true, pay: false, fee: false, status: null, sort: 'name,nameDesc|Ism,familya|Sinf|Sinf|To\'lov', extra: '' }, opts);
    let h = '<div class="filter-bar">';
    if (o.search) {
      h += `<div class="search-box">
        <span class="s-ico">🔍</span>
        <input type="search" id="${id}Q" placeholder="Ism, familya, telefon..." value="${escapeHtml(st.q)}" autocomplete="off">
        <button class="s-clear" type="button" data-clear="${id}Q" title="Tozalash"${st.q ? '' : ' hidden'}>×</button>
      </div>`;
    }
    if (o.cls) {
      const opts2 = (opts.classOptions || []).map((c) => `<option value="${escapeHtml(c)}"${c === st.cls ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
      h += `<select id="${id}Cls" class="f-select"><option value="">Barcha sinflar</option>${opts2}</select>`;
    }
    if (o.pay) {
      h += `<select id="${id}Pay" class="f-select">
        <option value="all"${st.pay === 'all' ? ' selected' : ''}>To'lov: barchasi</option>
        <option value="paid"${st.pay === 'paid' ? ' selected' : ''}>Faqat to'langan</option>
        <option value="unpaid"${st.pay === 'unpaid' ? ' selected' : ''}>Faqat to'lanmagan</option>
      </select>`;
    }
    if (o.fee) {
      h += `<select id="${id}Fee" class="f-select">
        <option value="all"${st.fee === 'all' ? ' selected' : ''}>To'lov summasi: barchasi</option>
        <option value="has"${st.fee === 'has' ? ' selected' : ''}>Summasi bor</option>
        <option value="none"${st.fee === 'none' ? ' selected' : ''}>Summasi yo'q</option>
      </select>`;
    }
    if (o.status) {
      h += `<select id="${id}St" class="f-select">${o.status.map((s) =>
        `<option value="${s[0]}"${st.status === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}</select>`;
    }
    h += `<select id="${id}Sort" class="f-select"><option value="name"${st.sort === 'name' ? ' selected' : ''}>A → Z (familiya)</option><option value="nameDesc"${st.sort === 'nameDesc' ? ' selected' : ''}>Z → A (familiya)</option><option value="class"${st.sort === 'class' ? ' selected' : ''}>Sinf bo'yicha</option><option value="fee"${st.sort === 'fee' ? ' selected' : ''}>To'lov summasi</option></select>`;
    h += o.extra;
    h += `<button class="btn btn-ghost btn-sm" onclick="window.appResetFilter('${id}')">↺ Tozalash</button>`;
    h += '<span class="f-count" id="' + id + 'Count"></span>';
    h += '</div>';
    return h;
  }

  // Filtr maydonlarini hodisalarga ulash
  function bindFilterBar(id, st, onChange) {
    const q = document.getElementById(id + 'Q');
    if (q) {
      let t = null;
      q.addEventListener('input', (e) => {
        st.q = e.target.value;
        const c = document.querySelector(`[data-clear="${id}Q"]`);
        if (c) c.hidden = !st.q;
        clearTimeout(t);
        t = setTimeout(onChange, 180);
      });
    }
    document.querySelectorAll(`[data-clear="${id}Q"]`).forEach((b) =>
      b.addEventListener('click', () => { st.q = ''; onChange(); }));
    [['Cls', 'cls'], ['Pay', 'pay'], ['Fee', 'fee'], ['St', 'status'], ['Sort', 'sort']].forEach(([k, key]) => {
      const el = document.getElementById(id + k);
      if (el) el.addEventListener('change', (e) => { st[key] = e.target.value; onChange(); });
    });
  }

  function setCount(id, shown, total) {
    const el = document.getElementById(id + 'Count');
    if (el) el.textContent = shown === total ? `${total} ta` : `${shown} / ${total} ta`;
  }

  // ---------- BULK AMALLAR ----------
  const BULK_ACTIONS = {
    students: [
      { label: '✉️ Xabar yuborish', cls: 'btn-primary', fn: 'appBulkMessage' },
      { label: '📚 Sinfga o\'tkazish', cls: 'btn-outline', fn: 'appBulkMove' },
      { label: '🗑️ O\'chirish', cls: 'btn-danger', fn: 'appBulkDelete' },
    ],
    payments: [
      { label: '✓ To\'langan qilish', cls: 'btn-success', fn: 'appBulkPay', arg: 'true' },
      { label: '✗ To\'lanmagan qilish', cls: 'btn-outline', fn: 'appBulkPay', arg: 'false' },
    ],
    attendance: [
      { label: '✓ Keldi', cls: 'btn-success', fn: 'appBulkAtt', arg: 'present' },
      { label: '⏰ Kechikdi', cls: 'btn-outline', fn: 'appBulkAtt', arg: 'late' },
      { label: '✗ Kelmadi', cls: 'btn-danger', fn: 'appBulkAtt', arg: 'absent' },
    ],
  };

  function bulkBarHtml(scope) {
    const acts = BULK_ACTIONS[scope] || [];
    if (!selected.size || !acts.length) return '';
    return `<div class="bulk-bar">
      <span class="bulk-n">☑️ Tanlangan: <b>${selected.size}</b></span>
      ${acts.map((a) => `<button class="btn btn-sm ${a.cls}" onclick="window.${a.fn}(${a.arg === undefined ? '' : JSON.stringify(a.arg)})">${a.label}</button>`).join('')}
      <button class="btn btn-ghost btn-sm" onclick="window.appSelClear()">Bekor qilish</button>
    </div>`;
  }

  function classOptions() {
    return [...new Set(students.map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));
  }

  // ---------- KO'P TANLASH (BULK) ----------
  const selected = new Set();
  let bulkScope = 'students';

  function clearSel() {
    selected.clear();
  }

  function selIds() {
    return [...selected];
  }

  // Jadval boshqaruv ustuni
  function selCell(id) {
    return `<td class="rowsel"><input type="checkbox" class="sel-chk" data-sid="${id}"${selected.has(id) ? ' checked' : ''}></td>`;
  }

  function selHead(allIds) {
    const all = allIds.length > 0 && allIds.every((i) => selected.has(i));
    return `<th class="rowsel"><input type="checkbox" class="sel-all"${all ? ' checked' : ''} title="Barchasini tanlash"></th>`;
  }

  function bindSel(onChange) {
    document.querySelectorAll('.sel-all').forEach((c) =>
      c.addEventListener('change', () => {
        const ids = [...document.querySelectorAll('.sel-chk')].map((x) => Number(x.dataset.sid));
        if (c.checked) ids.forEach((i) => selected.add(i));
        else selected.clear();
        onChange();
      }));
    document.querySelectorAll('.sel-chk').forEach((c) =>
      c.addEventListener('change', () => {
        const id = Number(c.dataset.sid);
        if (c.checked) selected.add(id);
        else selected.delete(id);
        onChange();
      }));
  }

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (type === 'error' ? '#dc2626' : '#16a34a') + ';color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.2);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- Navigatsiya ----------
  const NAV_TITLES = {
    dashboard: 'Boshqaruv paneli',
    students: "O'quvchilar",
    payments: 'Oylik to\'lovlar',
    classes: 'Sinflar',
    schedule: 'Dars jadvali',
    attendance: 'Davomat',
    grades: 'Baholar',
    teachers: "O'qituvchilar",
    doctors: 'Shifokorlar',
    subjects: 'Fanlar',
    telegram: 'Telegram bot',
    settings: 'Sozlamalar',
    branches: 'Filiallar',
  };

  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.section === 'chat') {
        window.CHAT.open();
        return;
      }
    document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    scrollNavIntoView(btn);
    navigateTo(btn.dataset.section);
    });
  });

  // Filiallar nav itemni faqat super_admin/admin ko'radi
  const navBranches = document.getElementById('navBranches');
  if (navBranches) {
    if (role === 'super_admin' || role === 'admin') {
      navBranches.style.display = '';
    } else {
      navBranches.style.display = 'none';
    }
  }

  async function navigateTo(section) {
    currentSection = section;
    pageTitle.textContent = NAV_TITLES[section];
    topbarActions.innerHTML = '';
    content.innerHTML = '<div class="empty-state">Yuklanmoqda...</div>';
    try {
      if (section === 'dashboard') await renderDashboard();
      else if (section === 'students') await renderStudents();
      else if (section === 'payments') await renderPayments();
      else if (section === 'classes') await renderClasses();
      else if (section === 'schedule') await renderSchedule();
      else if (section === 'attendance') await renderAttendance();
      else if (section === 'grades') await renderGrades();
      else if (section === 'teachers') await renderTeachers();
      else if (section === 'doctors') await renderDoctors();
      else if (section === 'subjects') await renderSubjects();
      else if (section === 'telegram') await renderTelegram();
      else if (section === 'settings') renderSettings();
      else if (section === 'branches') await renderBranches();
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  // ---------- DASHBORD ----------
  const QUICK = [
    { ico: '📋', label: "Bugungi davomat", sub: 'Kelishni belgilash', sec: 'attendance' },
    { ico: '💰', label: "Oylik to'lovlar", sub: 'To\'lov holati', sec: 'payments' },
    { ico: '➕', label: "O'quvchi qo'shish", sub: 'Yangi o\'quvchi', sec: '_add' },
    { ico: '💬', label: 'Xabar yuborish', sub: "Ota-onalarga", sec: '_chat' },
    { ico: '📚', label: 'Dars jadvali', sub: 'Haftalik jadval', sec: 'schedule' },
    { ico: '📄', label: 'Word hisobot', sub: 'Sinflar ro\'yxati', sec: 'classes' },
  ];

  function quickGridHtml() {
    return '<div class="quick-grid">' + QUICK.map((q) =>
      `<button class="quick-btn" onclick="window.appQuick('${q.sec}')">
        <span class="q-ico">${q.ico}</span>
        <span class="q-txt"><span class="q-label">${q.label}</span><span class="q-sub">${q.sub}</span></span>
      </button>`).join('') + '</div>';
  }

  window.appQuick = async (sec) => {
    if (sec === '_add') return studentModal();
    if (sec === '_chat') return window.CHAT.open();
    if (sec === 'attendance') { attendDate = todayStr(); attendClass = ''; }
    if (sec === 'payments') { const d = new Date(); payMonth = d.getMonth() + 1; payYear = d.getFullYear(); }
    document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
    const nav = document.querySelector('.nav-item[data-section="' + sec + '"]');
    if (nav) nav.classList.add('active');
    scrollNavIntoView(nav);
    await navigateTo(sec);
  };

  async function renderDashboard() {
    const stats = await API.get('/api/stats');
    const total = stats.totalStudents || 0;
    const payPercent = total ? Math.round((stats.paidThisMonth / total) * 100) : 0;

    const cards = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon purple">${ICONS.students}</div><div><div class="stat-value">${total}</div><div class="stat-label">Jami o'quvchilar</div></div></div>
        <div class="stat-card"><div class="stat-icon green">${ICONS.attendance}</div><div><div class="stat-value">${stats.presentToday}</div><div class="stat-label">Bugun keldi</div></div></div>
        <div class="stat-card"><div class="stat-icon red">${ICONS.attendance}</div><div><div class="stat-value">${stats.absentToday}</div><div class="stat-label">Bugun kelmadi</div></div></div>
        <div class="stat-card"><div class="stat-icon blue">${ICONS.payments}</div><div><div class="stat-value">${stats.paidThisMonth}</div><div class="stat-label">Bu oy to'ladi</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">${ICONS.grades}</div><div><div class="stat-value">${stats.avgGrade ?? '—'}</div><div class="stat-label">O'rtacha baho</div></div></div>
      </div>
    `;

    const panels = `
      <div class="panel">
        <div class="panel-header"><h3>Bu oydagi to'lov holati</h3><span class="badge badge-blue">${payPercent}%</span></div>
        <div class="panel-body">
          <div class="progress-wrap">
            <div class="progress"><div style="width:${payPercent}%;background:linear-gradient(90deg,#d4af37,#b8922e);"></div></div>
            <span style="font-size:14px;font-weight:600">${stats.paidThisMonth} / ${total}</span>
          </div>
          ${total === 0 ? '<p class="empty-note" style="margin-top:14px">Hali o\'quvchi qo\'shilmagan.</p>' : ''}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Bugungi davomat</h3><button class="btn btn-outline btn-sm" onclick="window.appNav('attendance')">Davomatga o'tish</button></div>
        <div class="panel-body">
          <div class="stats-grid" style="margin:0">
            <div class="stat-card"><div class="stat-icon green">${ICONS.students}</div><div><div class="stat-value">${stats.presentToday}</div><div class="stat-label">Keldi</div></div></div>
            <div class="stat-card"><div class="stat-icon red">${ICONS.students}</div><div><div class="stat-value">${stats.absentToday}</div><div class="stat-label">Kelmadi</div></div></div>
            <div class="stat-card"><div class="stat-icon amber">${ICONS.students}</div><div><div class="stat-value">${stats.unmarkedToday}</div><div class="stat-label">Belgilanmagan</div></div></div>
          </div>
        </div>
      </div>
    `;

    content.innerHTML = quickGridHtml() + cards + panels;
  }

  // ---------- O'QUVCHILAR ----------
  let classFilter = '';
  let stuPayMap = {};   // studentId -> to'langan (joriy oy)

  async function loadPayMap(month, year) {
    const list = await API.get('/api/payments?month=' + month + '&year=' + year);
    const m = {};
    list.forEach((p) => { m[p.studentId] = p.paid; });
    return m;
  }

  async function renderStudents() {
    students = await loadStudents(true);
    const classes = classOptions();
    if (classFilter && !classes.includes(classFilter)) classFilter = '';
    const now = new Date();
    stuPayMap = await loadPayMap(now.getMonth() + 1, now.getFullYear());

    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-outline" onclick="window.appExportWord()">${ICONS.doc.replace('width="18"', 'width="16"')} Word (docx)</button>
      <button class="btn btn-primary" onclick="window.appAddStudent()">${ICONS.students.replace('width="18"', 'width="16"')} O'quvchi qo'shish</button>
    </div>`;

    renderStudentTable(classes);
  }

  function studentList() {
    const st = fState.students;
    st.cls = classFilter;
    let list = filterStudents(students, st);
    if (st.pay === 'paid') list = list.filter((s) => stuPayMap[s.id]);
    if (st.pay === 'unpaid') list = list.filter((s) => !stuPayMap[s.id]);
    if (st.fee === 'has') list = list.filter((s) => Number(s.monthlyFee) > 0);
    if (st.fee === 'none') list = list.filter((s) => !(Number(s.monthlyFee) > 0));
    return list;
  }

  function renderStudentTable(classes) {
    if (!students.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state">
        <h4>Hali o'quvchilar yo'q</h4>
        <p class="muted">Birinchi o'quvchini qo'shish uchun yuqoridagi tugmani bosing.</p>
      </div></div>`;
      return;
    }

    const list = studentList();
    const clsList = classes || classOptions();

    if (!list.length) {
      content.innerHTML = `<div class="panel">${filterBar('St', fState.students, { pay: true, fee: true, classOptions: clsList })}
        <div class="empty-state"><h4>Hech qanday o'quvchi topilmadi</h4><p class="muted">Qidiruv yoki filtrni o'zgartirib ko'ring.</p></div></div>`;
      bindFilterBar('St', fState.students, () => { classFilter = fState.students.cls; renderStudentTable(clsList); });
      return;
    }

    const rows = list.map((s, i) => {
      const paid = stuPayMap[s.id];
      return `<tr class="${selected.has(s.id) ? 'sel-row' : ''}">
        ${selCell(s.id)}
        <td class="rownum">${i + 1}</td>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.patronymic)}</div></div></div></td>
        <td><span class="badge badge-purple">${escapeHtml(s.className) || '—'}</span></td>
        <td>${s.monthlyFee ? s.monthlyFee.toLocaleString('ru-RU') + ' so\'m' : '—'}</td>
        <td><span class="pay-status ${paid ? 'ok' : 'no'}">${paid ? '✓ To\'langan' : '✗ To\'lanmagan'}</span></td>
        <td>${escapeHtml(s.parentName) || '—'}<div class="sub">${escapeHtml(s.parentPhone) || ''}</div></td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appEditStudent(${s.id})">Tahrirlash</button>
          <button class="btn btn-outline btn-sm" title="Ota-ona login/paroli" onclick="window.appParentCred(${s.id})">🔑 Kirish</button>
          <button class="btn btn-danger btn-sm" onclick="window.appDeleteStudent(${s.id})">O'chirish</button>
        </td>
      </tr>`;
    }).join('');

    content.innerHTML = `<div class="panel">
      <div class="panel-header"><h3>O'quvchilar</h3><span class="badge badge-blue">${list.length} ta</span></div>
      ${filterBar('St', fState.students, { pay: true, fee: true, classOptions: clsList })}
      ${bulkBarHtml('students')}
      <div class="table-wrap"><table>
        <thead><tr>${selHead(list.map((s) => s.id))}<th style="width:52px">T/r</th><th>O'quvchi</th><th>Sinf</th><th>Oylik to'lov</th><th>To'lov</th><th>Ota-ona</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;

    bindFilterBar('St', fState.students, () => { classFilter = fState.students.cls; renderStudentTable(clsList); });
    bindSel(() => renderStudentTable(clsList));
    setCount('St', list.length, students.length);
  }

  // Klassani o'zgartirish (filter holati bilan sinxron)
  function syncClassFilter(v) {
    classFilter = v || '';
    fState.students.cls = classFilter;
  }

  function genPassword(len = 8) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let p = '';
    for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
  }

  function genUsername(lastName, firstName) {
    const base = ((lastName || '') + '.' + (firstName || '')).toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 24) || 'otaona';
    return base;
  }

  function studentModal(student = null, prefillClass = '') {
    const s = student || {};
    const isEdit = !!student;
    const fee = s.monthlyFee || '';

    const existingClasses = [...new Set(students.map((x) => x.className).filter(Boolean))].sort();
    const classOptions = existingClasses.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
    const autoUser = genUsername(s.lastName || '', s.firstName || '');
    const autoPass = genPassword();

    showModal(`
      <div class="modal-header"><h3>${isEdit ? 'O\'quvchini tahrirlash' : 'Yangi o\'quvchi qo\'shish'}</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        ${isEdit ? `<div class="form-group"><label>Rasm (3x4)</label><div style="display:flex;align-items:center;gap:12px">
          <div id="photoPreview">${avatarHtml(s)}</div>
          <input type="file" id="photoInput" accept="image/*" style="font-size:13px">
        </div></div>` : ''}
        <div class="form-grid">
          <div class="form-group"><label>Familya *</label><input id="fLastName" value="${escapeHtml(s.lastName)}" placeholder="Aliyev"></div>
          <div class="form-group"><label>Ism *</label><input id="fFirstName" value="${escapeHtml(s.firstName)}" placeholder="Ali"></div>
          <div class="form-group"><label>Otasining ismi</label><input id="fPatronymic" value="${escapeHtml(s.patronymic)}" placeholder="Valiyevich"></div>
          <div class="form-group"><label>Sinf</label>
            <input id="fClass" list="classListDl" value="${escapeHtml(prefillClass || s.className)}" placeholder="masalan: 7-A">
            <datalist id="classListDl">${classOptions}</datalist>
          </div>
          <div class="form-group"><label>Tug'ilgan sana</label><input id="fBirth" type="date" value="${escapeHtml(s.birthDate)}"></div>
          <div class="form-group"><label>Oylik to'lov (so'm)</label><input id="fFee" type="number" value="${fee}"></div>
          <div class="form-group full"><label>Manzil</label><input id="fAddress" value="${escapeHtml(s.address)}"></div>
          <div class="form-group"><label>Ota-onaning ismi</label><input id="fParentName" value="${escapeHtml(s.parentName)}"></div>
          <div class="form-group"><label>Ota-ona telefoni</label><input id="fParentPhone" value="${escapeHtml(s.parentPhone)}" placeholder="+998 90 123 45 67"></div>
        </div>
        ${!isEdit ? `<div class="hint">Ota-ona kirishi AVTOMAT yaratiladi. Ular shu login va parol orqali farzandini masofadan kuzatadi. Kerak bo'lsa o'zgartirishingiz mumkin:</div>
        <div class="form-grid">
          <div class="form-group"><label>Ota-ona logini</label><div style="display:flex;gap:8px"><input id="fParentUser" value="${escapeHtml(autoUser)}"><button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('fParentUser').value=window.appGenUser(document.getElementById('fLastName').value,document.getElementById('fFirstName').value)">⟳</button></div></div>
          <div class="form-group"><label>Ota-ona paroli</label><div style="display:flex;gap:8px"><input id="fParentPass" value="${escapeHtml(autoPass)}"><button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('fParentPass').value=window.appGenPass()">⟳</button></div></div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
        ${!isEdit ? `<button class="btn btn-outline" id="saveStudentMoreBtn" title="Saqlaydi va shu sinf uchun yana bo'sh forma ochadi">Qo'shish va yana qo'shish</button>` : ''}
        <button class="btn btn-primary" id="saveStudentBtn">${isEdit ? 'Saqlash' : 'Qo\'shish'}</button>
      </div>
    `);

    const pp = document.getElementById('photoInput');
    if (pp) {
      pp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            document.getElementById('photoPreview').innerHTML = '<img class="avatar" style="width:64px;height:64px;border-radius:12px" src="' + ev.target.result + '">';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    const doSave = async (more) => {
      const btn = document.getElementById(more ? 'saveStudentMoreBtn' : 'saveStudentBtn');
      btn.disabled = true;
      try {
        const body = {
          lastName: document.getElementById('fLastName').value,
          firstName: document.getElementById('fFirstName').value,
          patronymic: document.getElementById('fPatronymic').value,
          className: document.getElementById('fClass').value,
          birthDate: document.getElementById('fBirth').value,
          monthlyFee: document.getElementById('fFee').value,
          address: document.getElementById('fAddress').value,
          parentName: document.getElementById('fParentName').value,
          parentPhone: document.getElementById('fParentPhone').value,
        };
        let result;
        if (isEdit) {
          result = await API.put('/api/students/' + s.id, body);
        } else {
          body.parentUsername = document.getElementById('fParentUser').value;
          body.parentPassword = document.getElementById('fParentPass').value;
          result = await API.post('/api/students', body);
        }

        const photoFile = pp ? pp.files[0] : null;
        if (photoFile && isEdit) {
          const compressed = await compressImage(photoFile, 400, 533, 0.7);
          const fd = new FormData();
          fd.append('photo', compressed);
          await API.post('/api/students/' + s.id + '/photo', fd, true);
        }

        if (more) {
          closeModal();
          toast('O\'quvchi qo\'shildi');
          studentModal(null, body.className);
        } else {
          closeModal();
          if (!isEdit && result.parentUsername) {
            showCredentialsModal(result);
          } else {
            const y = window.scrollY;
            toast(isEdit ? 'Saqlanib qo\'yildi' : 'O\'quvchi qo\'shildi');
            await renderStudents();
            if (y) window.scrollTo(0, y);
          }
        }
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    };
    document.getElementById('saveStudentBtn').addEventListener('click', () => doSave(false));
    const moreBtn = document.getElementById('saveStudentMoreBtn');
    if (moreBtn) moreBtn.addEventListener('click', () => doSave(true));
  }

  function showCredentialsModal(st) {
    modalContent.innerHTML = `
      <div class="modal-header"><h3>Ota-ona kirishi yaratildi</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <p style="margin-bottom:16px">O'quvchi <b>${escapeHtml(st.lastName)} ${escapeHtml(st.firstName)}</b> uchun ota-ona kirishi yaratildi. Quyidagi ma'lumotlarni ota-onaga topshiring:</p>
        <div style="background:var(--card-2);border:1px solid var(--border);border-radius:12px;padding:16px 18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div><div class="muted">Login</div><div style="font-size:16px;font-weight:700" id="credUser">${escapeHtml(st.parentUsername)}</div></div>
            <button class="btn btn-outline btn-sm" onclick="window.appCopy('credUser')">Nusxalash</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div><div class="muted">Parol</div><div style="font-size:16px;font-weight:700" id="credPass">${escapeHtml(st.parentPassword)}</div></div>
            <button class="btn btn-outline btn-sm" onclick="window.appCopy('credPass')">Nusxalash</button>
          </div>
        </div>
        <p style="margin-top:14px" class="muted">Sayt manzili: <b>${location.origin}</b>. Ota-ona kirish login sahifasidan farzandini kuzatadi.</p>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="showCredentialsModal._done()">Yopish</button></div>
    `;
    showCredentialsModal._done = async () => {
      const y = window.scrollY;
      closeModal();
      await renderStudents();
      if (y) window.scrollTo(0, y);
    };
    modalOverlay.classList.add('open');
  }

  async function editStudent(id) {
    await loadStudents();
    const s = students.find((x) => x.id === id);
    if (s) studentModal(s);
  }

  async function deleteStudent(id) {
    await loadStudents();
    const s = students.find((x) => x.id === id);
    if (!s) return;
    if (!confirm('O\'quvchi "' + s.lastName + ' ' + s.firstName + '" va uning barcha ma\'lumotlari o\'chiriladi. Davom etasizmi?')) return;
    const y = window.scrollY;
    await API.del('/api/students/' + id);
    toast('O\'quvchi o\'chirildi');
    await renderStudents();
    if (y) window.scrollTo(0, y);
  }

  // ---------- Ota-ona login/parolini ko'rish / qayta yaratish ----------
  async function parentCred(id) {
    await loadStudents();
    const s = students.find((x) => x.id === id);
    if (!s) return;

    showModal(`
      <div class="modal-header"><h3>Ota-ona kirishi — ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <div class="hint">Bu oynada ota-ona logini va paroli ko'rinadi. "Yangi parol yaratish" tugmasini bossangiz, parol yangilanadi.</div>
        <div style="background:var(--card-2);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div><div class="muted">Ota-ona logini (o'zgartirish mumkin)</div>
              <div style="display:flex;gap:8px;align-items:center"><input id="pcUser" style="width:auto;flex:1;font-weight:700" value="yuklanmoqda..."></div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="window.appCopyPc('pcUser')">Nusxalash</button>
          </div>
        </div>
        <div style="background:var(--success-light);border:1px solid var(--success);border-radius:12px;padding:16px 18px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div><div class="muted">Parol</div>
              <div style="font-size:16px;font-weight:700;letter-spacing:.5px" id="pcPass">yuklanmoqda...</div>
            </div>
            <button class="btn btn-sm btn-outline" onclick="window.appCopyPc('pcPass')">Nusxalash</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Yopish</button>
        <button class="btn btn-primary" id="pcSaveBtn">Yangi parol yaratish</button>
      </div>
    `);

    const result = await API.get('/api/students/' + id + '/parent-credentials').catch((e) => null);

    if (result) {
      document.getElementById('pcUser').value = result.parentUsername;
      document.getElementById('pcPass').textContent = result.parentPassword || '—';
    } else {
      document.getElementById('pcUser').value = '';
      document.getElementById('pcPass').textContent = '—';
      const h = document.querySelector('.modal .hint');
      if (h) h.textContent = 'Bu o\'quvchi uchun ota-ona kirishi hali yo\'q. "Yangi parol yaratish" tugmasi orqali yarating: login ham avtomatik tayyorlanadi.';
    }

    document.getElementById('pcSaveBtn').addEventListener('click', async () => {
      const btn = document.getElementById('pcSaveBtn');
      btn.disabled = true;
      try {
        const body = { username: document.getElementById('pcUser').value.trim() };
        const res = await API.post('/api/students/' + id + '/parent-credentials', body);
        if (res.parentUsername && !document.getElementById('pcUser').value.trim()) {
          document.getElementById('pcUser').value = res.parentUsername;
        }
        document.getElementById('pcPass').textContent = res.parentPassword;
        window.__pcLatest = res;
        toast('Yangi parol yaratildi');
        btn.disabled = false;
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  // ---------- TO'LOVLAR ----------
  const now = new Date();
  let payMonth = now.getMonth() + 1;
  let payYear = now.getFullYear();

  async function renderPayments() {
    students = await loadStudents(true);
    const classes = classOptions();
    if (fState.payments.cls && !classes.includes(fState.payments.cls)) fState.payments.cls = '';
topbarActions.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-ghost btn-sm" onclick="window.appSidebarToggle()" aria-label="Menyuni ochish" style="width:38px;height:38px;padding:0;display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <select id="payMonthSel">${renderMonthsSelect(payMonth)}</select>
        <select id="payYearSel">${renderYearsSelect()}</select>
      </div>`;

    document.getElementById('payMonthSel').addEventListener('change', (e) => { payMonth = Number(e.target.value); renderPayTable(); });
    document.getElementById('payYearSel').addEventListener('change', (e) => { payYear = Number(e.target.value); renderPayTable(); });

    await renderPayTable();
  }

  // Faqat joriy ekranda KO'RINAYOTGAN to'lanmagan o'quvchilarga eslatma
  window.appPayRemind = async () => {
    let list;
    try {
      list = payList().filter((s) => !payMapLive[s.id] && Number(s.monthlyFee) > 0);
    } catch (e) { return toast(e.message, 'error'); }
    if (!list.length) return toast('Bu ro\'yxatda to\'lanmagan o\'quvchi yo\'q', 'error');
    const ids = list.map((s) => s.id);
    let d;
    try {
      d = await API.post('/api/telegram/remind-payments', { month: payMonth, year: payYear, studentIds: ids, preview: true });
    } catch (e) { return toast(e.message, 'error'); }
    if (!d.list || !d.list.length) return toast(d.message || 'Topilmadi', 'error');

    const label = monthNames()[payMonth - 1] + ' ' + payYear;
    const sample = d.list.slice(0, 8).map((x, i) => `${i + 1}. ${escapeHtml(x.fio)} (${escapeHtml(x.className || '—')}) — ${x.fee.toLocaleString('ru-RU')} so'm${x.linked ? '' : ' — <i>Telegram\'ga ulanmagan</i>'}`).join('<br>');

    showModal(`
      <div class="modal-header"><h3>📢 To'lov eslatmasini yuborish</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <div class="tg-stat-grid">
          <div><span>Ota-onalar</span><b>${d.targeted}</b></div>
          <div><span>Telegram'da bor</span><b>${d.linked}</b></div>
          <div><span>Ulanmagan</span><b>${d.targeted - d.linked}</b></div>
          <div><span>Jami qarz</span><b>${Number(d.debt).toLocaleString('ru-RU')} so'm</b></div>
        </div>
        <div class="hint" style="margin:14px 0 8px">Sana: <b>${escapeHtml(label)}</b> · Ro'yxat: ${fState.payments.cls ? escapeHtml(fState.payments.cls) + ' sinfi' : 'barcha sinflar'}${fState.payments.status === 'unpaid' ? ', faqat to\'lanmaganlar' : ''}${fState.payments.q ? ', qidiruv: "' + escapeHtml(fState.payments.q) + '"' : ''}</div>
        <div class="tg-preview-list">${sample}${d.list.length > 8 ? `<br><i>... va yana ${d.list.length - 8} ta</i>` : ''}</div>
        <div class="hint" style="margin-top:14px">Har bir ota-onaga faqat <b>o'z farzandining</b> to'lovi haqida xabar boradi. Boshqa oilalarning ma'lumati ko'rinmaydi.</div>
        ${d.linked === 0 ? '<div class="alert-error" style="display:block;margin-top:12px">Hozircha hech kim Telegram\'ga ulanmagan — xabar hech kimga yetib bormaydi. Avval ota-onalarni ulang.</div>' : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="prGo"${d.linked ? '' : ' disabled'}>Ha, yuborish</button>
      </div>`);

    const go = document.getElementById('prGo');
    if (go && d.linked) {
      go.addEventListener('click', async () => {
        go.disabled = true;
        go.textContent = 'Yuborilmoqda...';
        try {
          const r = await API.post('/api/telegram/remind-payments', { month: payMonth, year: payYear, studentIds: ids });
          closeModal();
          toast(`✅ ${r.sent} ta yuborildi · ${r.noLink} ta ulanmagan · ${r.failed} ta xato`);
          if (r.noLink) toast(`${r.noLink} ta ota-onaning Telegram'i yo'q — ularga boshqa usul bilan xabar bering`, 'error');
        } catch (e) {
          toast(e.message, 'error');
          go.disabled = false;
          go.textContent = 'Ha, yuborish';
        }
      });
    }
  }

  function payList() {
    const st = fState.payments;
    let list = filterStudents(students, st);
    if (st.status === 'paid') list = list.filter((s) => payMapLive[s.id]);
    if (st.status === 'unpaid') list = list.filter((s) => !payMapLive[s.id]);
    return list;
  }

  let payMapLive = {};

  async function renderPayTable() {
    const payments = await API.get('/api/payments?month=' + payMonth + '&year=' + payYear);
    const map = {};
    payMapLive = {};
    payments.forEach((p) => { map[p.studentId] = p; payMapLive[p.studentId] = p.paid; });

    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchilar yo\'q</h4></div></div>';
      return;
    }

    const classes = classOptions();
    const list = payList();
    const labelName = monthNames()[payMonth - 1];

    let paidCount = list.filter((s) => payMapLive[s.id]).length;
    const rows = list.map((s, i) => {
      const paid = !!payMapLive[s.id];
      return `<tr class="${selected.has(s.id) ? 'sel-row' : ''}${paid ? '' : ' pay-row-unpaid'}">
        ${selCell(s.id)}
        <td class="rownum">${i + 1}</td>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td>${s.monthlyFee ? s.monthlyFee.toLocaleString('ru-RU') + ' so\'m' : '—'}</td>
        <td class="switch-cell"><label class="switch"><input type="checkbox" data-pid="${s.id}" ${paid ? 'checked' : ''}><span class="slider"></span></label></td>
        <td><span class="pay-status ${paid ? 'badge-ok' : 'badge-no'}" id="ps-${s.id}">${paid ? 'To\'langan' : 'To\'lanmagan'}</span></td>
      </tr>`;
    }).join('');

    const pct = list.length ? Math.round((paidCount / list.length) * 100) : 0;

    content.innerHTML = `<div class="panel">
      <div class="panel-header"><h3>${escapeHtml(labelName)}</h3><span class="badge badge-blue">${paidCount} / ${list.length} to'lagan (${pct}%)</span></div>
      <div class="panel-body" style="padding-top:10px">
        <div class="progress-wrap" style="margin-bottom:0"><div class="progress"><div style="width:${pct}%;background:linear-gradient(90deg,#d4af37,#b8922e)"></div></div></div>
      </div>
      ${filterBar('Pay', fState.payments, { classOptions: classes, status: [['all', 'Holat: barchasi'], ['paid', 'Faqat to\'langan'], ['unpaid', 'Faqat to\'lanmagan']] })}
      ${bulkBarHtml('payments')}
      <div class="table-wrap"><table>
        <thead><tr>${selHead(list.map((s) => s.id))}<th style="width:52px">T/r</th><th>O'quvchi</th><th>Oylik to'lov</th><th style="text-align:center">To'lov</th><th>Holat</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

    bindFilterBar('Pay', fState.payments, () => renderPayTable());
    bindSel(() => renderPayTable());
    setCount('Pay', list.length, students.length);

    document.querySelectorAll('.switch input').forEach((chk) => {
      chk.addEventListener('change', async (e) => {
        const pid = Number(chk.dataset.pid);
        const paid = chk.checked;
        await API.post('/api/payments/toggle', { studentId: pid, month: payMonth, year: payYear, paid });
        const st = document.getElementById('ps-' + pid);
        if (st) {
          st.className = 'pay-status ' + (paid ? 'badge-ok' : 'badge-no');
          st.textContent = paid ? 'To\'langan' : 'To\'lanmagan';
        }
        const row = chk.closest('tr');
        if (row) row.classList.toggle('pay-row-unpaid', !paid);
        toast(paid ? (labelName + ' uchun to\'lov tasdiqlandi') : 'To\'lov bekor qilindi');
      });
    });
  }

  // ---------- DAVOMAT ----------
  let attendDate = todayStr();
  let attendClass = '';

  async function renderAttendance() {
    students = await loadStudents(true);
    const classes = [...new Set(students.map((s) => s.className || '(sinsiz)'))].sort();
    topbarActions.innerHTML = `
      <div class="toolbar">
        <input type="date" id="attDate" class="date-pick" value="${attendDate}">
        <select id="attClass">
          <option value="">Barcha sinflar</option>
          ${classes.map((c) => `<option value="${escapeHtml(c)}" ${c === attendClass ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>`;

    document.getElementById('attDate').addEventListener('change', (e) => {
      attendDate = e.target.value;
      renderAttTable();
    });

    document.getElementById('attClass').addEventListener('change', (e) => {
      attendClass = e.target.value;
      renderAttTable();
    });

    await renderAttTable();
  }

  function attList() {
    const st = fState.attendance;
    st.cls = attendClass;
    st.statusFn = (s) => {
      const v = attMapLive[s.id] || null;
      if (st.status === 'all') return true;
      if (st.status === 'none') return !v;
      return v === st.status;
    };
    return filterStudents(students, st);
  }

  let attMapLive = {};

  async function renderAttTable() {
    const att = await API.get('/api/attendance?date=' + attendDate);
    const map = {};
    attMapLive = {};
    att.forEach((a) => { map[a.studentId] = a.status; attMapLive[a.studentId] = a.status; });

    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchilar yo\'q</h4></div></div>';
      return;
    }

    const classes = [...new Set(students.map((s) => s.className || '(sinsiz)'))].sort();
    const list = attList();

    const rows = list.map((s, i) => {
      const st = map[s.id] || null;
      return `<tr class="${selected.has(s.id) ? 'sel-row' : ''}">
        ${selCell(s.id)}
        <td class="rownum">${i + 1}</td>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td><button class="btn btn-sm ${st === 'present' ? 'btn-success' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'present')">✓ Keldi</button></td>
        <td><button class="btn btn-sm ${st === 'late' ? 'btn-outline' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'late')" style="border-color:#d97706;color:#d97706">⏰ Kechikdi</button></td>
        <td><button class="btn btn-sm ${st === 'absent' ? 'btn-danger' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'absent')">✗ Kelmadi</button></td>
        <td><button class="btn btn-sm btn-ghost" onclick="window.appSetAtt(${s.id},null)" title="Belgini olib tashlash">✕</button></td>
      </tr>`;
    }).join('');

    let p = 0, a = 0, l = 0, u = 0;
    list.forEach((s) => {
      const st = map[s.id];
      if (st === 'present') p++;
      else if (st === 'absent') a++;
      else if (st === 'late') l++;
      else u++;
    });

    content.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="stat-card"><div class="stat-icon green"><span style="font-size:18px">✓</span></div><div><div class="stat-value">${p}</div><div class="stat-label">Keldi</div></div></div>
        <div class="stat-card"><div class="stat-icon amber"><span style="font-size:18px">⏰</span></div><div><div class="stat-value">${l}</div><div class="stat-label">Kechikdi</div></div></div>
        <div class="stat-card"><div class="stat-icon red"><span style="font-size:18px">✗</span></div><div><div class="stat-value">${a}</div><div class="stat-label">Kelmadi</div></div></div>
        <div class="stat-card"><div class="stat-icon blue"><span style="font-size:18px">?</span></div><div><div class="stat-value">${u}</div><div class="stat-label">Belgilanmagan</div></div></div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>O'quvchilar davomati${attendClass ? ' • ' + escapeHtml(attendClass) : ''}</h3>
          <div class="toolbar">
            <select id="bulkAttSt">
              <option value="present">Hammasini: Keldi</option>
              <option value="late">Hammasini: Kechikdi</option>
              <option value="absent">Hammasini: Kelmadi</option>
              <option value="clear">Barchasini tozalash</option>
            </select>
            <button class="btn btn-outline btn-sm" onclick="window.appBulkStudents()">Qo'llash</button>
          </div>
        </div>
        ${filterBar('Att', fState.attendance, { classOptions: classes, status: [['all', 'Davomat: barchasi'], ['present', 'Faqat keldi'], ['late', 'Faqat kechikdi'], ['absent', 'Faqat kelmadi'], ['none', 'Faqat belgilanmagan']] })}
        ${bulkBarHtml('attendance')}
        <div class="table-wrap"><table>
          <thead><tr>${selHead(list.map((s) => s.id))}<th style="width:52px">T/r</th><th>O'quvchi</th><th>Keldi</th><th>Kechikdi</th><th>Kelmadi</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      <div id="teacherAttPanel"></div>`;

    bindFilterBar('Att', fState.attendance, () => { attendClass = fState.attendance.cls; const d = document.getElementById('attClass'); if (d) d.value = attendClass; renderAttTable(); });
    bindSel(() => renderAttTable());
    setCount('Att', list.length, students.length);

    await renderTeacherAtt();
  }

  async function renderTeacherAtt() {
    const panel = document.getElementById('teacherAttPanel');
    if (!panel) return;
    let teachers = [];
    try { teachers = await API.get('/api/teachers'); } catch (e) { panel.innerHTML = ''; return; }
    const att = await API.get('/api/teacher-attendance?date=' + attendDate);
    const map = {};
    att.forEach((a) => { map[a.teacherId] = a.status; });

    if (!teachers.length) { panel.innerHTML = ''; return; }

    const rows = teachers.map((t) => {
      const st = map[t.id] || null;
      return `<tr>
        <td><div class="student-cell"><div class="avatar">${escapeHtml((t.fullName || 'T').trim()[0].toUpperCase())}</div><div><div class="name">${escapeHtml(t.fullName)}</div><div class="sub">${escapeHtml((t.subjects || []).join(', '))}</div></div></div></td>
        <td><button class="btn btn-sm ${st === 'present' ? 'btn-success' : 'btn-ghost'}" onclick="window.appSetTAtt(${t.id},'present')">✓ Keldi</button></td>
        <td><button class="btn btn-sm ${st === 'late' ? 'btn-outline' : 'btn-ghost'}" onclick="window.appSetTAtt(${t.id},'late')" style="border-color:#d97706;color:#d97706">⏰ Kechikdi</button></td>
        <td><button class="btn btn-sm ${st === 'absent' ? 'btn-danger' : 'btn-ghost'}" onclick="window.appSetTAtt(${t.id},'absent')">✗ Kelmadi</button></td>
        <td><button class="btn btn-sm btn-ghost" onclick="window.appSetTAtt(${t.id},null)" title="Belgini olib tashlash">✕</button></td>
      </tr>`;
    }).join('');

    let p = 0, a = 0, l = 0;
    teachers.forEach((t) => {
      const st = map[t.id];
      if (st === 'present') p++;
      else if (st === 'absent') a++;
      else if (st === 'late') l++;
    });

    panel.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>O'qituvchilar davomati</h3>
          <div class="toolbar">
            <select id="bulkTAttSt">
              <option value="present">Hammasini: Keldi</option>
              <option value="late">Hammasini: Kechikdi</option>
              <option value="absent">Hammasini: Kelmadi</option>
              <option value="clear">Barchasini tozalash</option>
            </select>
            <button class="btn btn-outline btn-sm" onclick="window.appBulkTeachers()">Qo'llash</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>O'qituvchi</th><th>Keldi</th><th>Kechikdi</th><th>Kelmadi</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  async function setAttendance(studentId, status) {
    await API.post('/api/attendance', { studentId, date: attendDate, status });
  }

  async function setTeacherAtt(teacherId, status) {
    await API.post('/api/teacher-attendance', { teacherId, date: attendDate, status });
  }

  async function bulkStudents() {
    const st = document.getElementById('bulkAttSt').value;
    const status = st === 'clear' ? null : st;
    const list = attendClass ? students.filter((s) => (s.className || '(sinsiz)') === attendClass) : students;
    for (const s of list) await setAttendance(s.id, status);
    toast('Qo\'llandi');
    await renderAttTable();
  }

  async function bulkTeachers() {
    const st = document.getElementById('bulkTAttSt').value;
    const status = st === 'clear' ? null : st;
    const teachers = await API.get('/api/teachers');
    for (const t of teachers) await setTeacherAtt(t.id, status);
    toast('Qo\'llandi');
    await renderTeacherAtt();
  }

  // ---------- BAHOLAR ----------
  let gradeStudentId = null;
  let gradeQ = '';
  let gradeClass = '';

  function gradeFiltered() {
    return students.filter((s) => matchStudent(s, gradeQ) && (!gradeClass || s.className === gradeClass));
  }

  function gradeOptionsHtml() {
    const list = gradeFiltered();
    const sel = students.find((s) => s.id === gradeStudentId);
    return `<option value="">— O'quvchini tanlang —</option>` + list.map((s) =>
      `<option value="${s.id}" ${s.id === sel?.id ? 'selected' : ''}>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)} (${escapeHtml(s.className)})</option>`).join('');
  }

  async function renderGrades() {
    students = await loadStudents(true);
    const classes = classOptions();
    if (gradeClass && !classes.includes(gradeClass)) gradeClass = '';
    let cur = students.find((s) => s.id === gradeStudentId);
    if (!cur && students.length) cur = students[0];
    if (cur) gradeStudentId = cur.id;
    const selectedStu = cur;

    const clsOpts = `<option value="">Barcha sinflar</option>` + classes.map((c) =>
      `<option value="${escapeHtml(c)}"${c === gradeClass ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');

    topbarActions.innerHTML = `<div class="toolbar">
      <div class="search-box">
        <span class="s-ico">🔍</span>
        <input type="search" id="gradeSearch" placeholder="O'quvchini qidiring..." value="${escapeHtml(gradeQ)}" autocomplete="off" style="min-width:190px">
      </div>
      <select id="gradeCls" style="min-width:130px">${clsOpts}</select>
      <select id="gradeStudentSel" style="min-width:220px">${gradeOptionsHtml()}</select>
      ${selectedStu ? '<button class="btn btn-primary btn-sm" onclick="window.appAddGrade()">+ Baho qo\'shish</button>' : ''}
    </div>`;

    const gSearch = document.getElementById('gradeSearch');
    let gt = null;
    gSearch.addEventListener('input', (e) => {
      gradeQ = e.target.value;
      clearTimeout(gt);
      gt = setTimeout(() => { document.getElementById('gradeStudentSel').innerHTML = gradeOptionsHtml(); }, 150);
    });

    document.getElementById('gradeCls').addEventListener('change', (e) => {
      gradeClass = e.target.value;
      document.getElementById('gradeStudentSel').innerHTML = gradeOptionsHtml();
    });

    document.getElementById('gradeStudentSel').addEventListener('change', (e) => {
      gradeStudentId = Number(e.target.value);
      renderGrades();
    });

    if (!selectedStu) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchi tanlang</h4></div></div>';
      return;
    }

    const grades = await API.get('/api/grades?studentId=' + selectedStu.id);
    const bySubject = {};
    grades.forEach((g) => {
      if (!bySubject[g.subject]) bySubject[g.subject] = [];
      bySubject[g.subject].push(g);
    });

    const subjectCards = Object.keys(bySubject).map((subj) => {
      const arr = bySubject[subj];
      const avg = (arr.reduce((a, b) => a + b.score, 0) / arr.length).toFixed(2);
      const scoreHtml = arr.map((g) => `<span class="badge ${g.score >= 4 ? 'badge-green' : g.score === 3 ? 'badge-amber' : 'badge-red'}" style="margin:2px">${g.score}</span>`).join(' ');
      return `<div class="panel">
        <div class="panel-header"><h3>${escapeHtml(subj)}</h3><span class="badge badge-blue">O'rt.: ${avg}</span></div>
        <div class="panel-body">
          ${scoreHtml}
          <div style="margin-top:8px">${arr.map((g) => `<span class="muted" title="${g.date}">${escapeHtml(g.date)}</span> <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appDelGrade(${g.id})">×</button><br>`).join('')}</div>
        </div>
      </div>`;
    }).join('');

    content.innerHTML = `
      ${gradeHeader(selected, grades)}
      ${subjectCards || '<div class="panel"><div class="empty-state"><h4>Hali baholar yo\'q</h4><p class="muted">Yuqoridagi "Baho qo\'shish" tugmasi orqali baho kiriting.</p></div></div>'}`;
  }

  function gradeHeader(s, grades) {
    if (!grades.length) return '';
    const avg = (grades.reduce((a, b) => a + b.score, 0) / grades.length).toFixed(2);
    const balls = grades.filter((g) => g.score === 5).length;
    const fours = grades.filter((g) => g.score === 4).length;
    const threes = grades.filter((g) => g.score === 3).length;
    return `<div class="panel" style="background:linear-gradient(135deg,#0c0f0a,#151a10);color:#fff;border-color:rgba(212,175,55,.45)">
      <div class="panel-body" style="display:flex;align-items:center;gap:20px">
        ${avatarHtml(s)}
        <div><h3 style="font-size:18px">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</h3><div style="opacity:.9;font-size:14px">${escapeHtml(s.className)} — ${escapeHtml(s.patronymic)}</div></div>
        <div style="margin-left:auto;text-align:center;background:rgba(255,255,255,.15);border-radius:14px;padding:10px 18px">
          <div style="font-size:26px;font-weight:800">${avg}</div><div style="font-size:12px;opacity:.9">o'rtacha baho</div>
        </div>
        <div style="display:flex;gap:8px">
          <span class="badge" style="background:#052e16;color:#4ade80">5: ${balls}</span>
          <span class="badge" style="background:#082f49;color:#60a5fa">4: ${fours}</span>
          <span class="badge" style="background:#451a03;color:#fbbf24">3: ${threes}</span>
        </div>
      </div>
    </div>`;
  }

  function addGradeModal() {
    const selected = students.find((s) => s.id === gradeStudentId);
    if (!selected) return;
    showModal(`
      <div class="modal-header"><h3>Baho qo'shish</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <p class="muted" style="margin-bottom:14px">O'quvchi: <b>${escapeHtml(selected.lastName)} ${escapeHtml(selected.firstName)}</b> (${escapeHtml(selected.className)})</p>
        <div class="form-grid">
          <div class="form-group"><label>Fan *</label><select id="gSubject">
            ${SUBJECTS.map((s) => `<option>${s}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>Baho (2–5) *</label>
            <select id="gScore"><option value="5">5 — a'lo</option><option value="4" selected>4 — yaxshi</option><option value="3">3 — qoniqarli</option><option value="2">2 — qoniqarsiz</option></select>
          </div>
          <div class="form-group full"><label>Sana</label><input type="date" id="gDate" value="${todayStr()}"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="saveGradeBtn">Saqlash</button>
      </div>
    `);

    document.getElementById('saveGradeBtn').addEventListener('click', async () => {
      const btn = document.getElementById('saveGradeBtn');
      btn.disabled = true;
      try {
        await API.post('/api/grades', {
          studentId: gradeStudentId,
          subject: document.getElementById('gSubject').value,
          score: Number(document.getElementById('gScore').value),
          date: document.getElementById('gDate').value,
        });
        closeModal();
        toast('Baho saqlandi');
        await renderGrades();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  async function deleteGrade(id) {
    await API.del('/api/grades/' + id);
    toast('Baho o\'chirildi');
    await renderGrades();
  }

  // ---------- SINFLAR ----------
  async function renderClasses() {
    const classes = await API.get('/api/classes');
    topbarActions.innerHTML = `<button class="btn btn-outline btn-sm" onclick="window.appNav('students')">O'quvchi qo'shish</button>`;

    if (!classes.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state">
        <h4>Hali sinflar yo'q</h4>
        <p class="muted">O'quvchi qo'shganda "Sinf" maydonini to'ldirilsa, u avtomatik sinfga qo'shiladi.</p>
      </div></div>`;
      return;
    }

    const summary = classes.reduce((a, c) => a + c.count, 0);
    const rows = classes.map((c, i) => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:12px"><span class="avatar">${escapeHtml(c.name)}</span><div><div class="name">${escapeHtml(c.name)} sinfi</div><div class="sub">${c.count} ta o'quvchi</div></div></div></td>
        <td><span class="badge badge-blue">${c.count} o'quvchi</span></td>
        <td>${c.totalFee ? c.totalFee.toLocaleString('ru-RU') + ' so\'m/oy' : '—'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appOpenClass('${escapeHtml(c.name)}')">O'quvchilarini ko'rish</button>
          <button class="btn btn-outline btn-sm" onclick="window.appExportParents('${escapeHtml(c.name)}')">Login/parol (Word)</button>
          <button class="btn btn-outline btn-sm" onclick="window.appExportShort('${escapeHtml(c.name)}')">Qisqa ro'yxat (Word)</button>
          <button class="btn btn-outline btn-sm" onclick="window.appExportPayments('${escapeHtml(c.name)}')">To'lovlar (Word)</button>
          <button class="btn btn-danger btn-sm" onclick="window.appDeleteClass('${escapeHtml(c.name)}')">Sinfni o'chirish</button>
        </td>
      </tr>`).join('');

    content.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>Sinflar</h3><span class="badge badge-purple">Jami: ${summary} o'quvchi</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Sinf</th><th>O'quvchilar soni</th><th>Oylik to'lov (sinf bo'yicha)</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  async function openClass(name) {
    classFilter = name;
    document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
    const stNav = document.querySelector('[data-section="students"]');
    stNav.classList.add('active');
    scrollNavIntoView(stNav);
    navigateTo('students');
  }

  // ---------- DARS JADVALI (admin: to'liq boshqaruv) ----------
  let schedClass = '';
  const SHORT_DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

  async function renderSchedule() {
    await loadStudents(true);
    const classes = [...new Set(students.map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));
    const teachers = await API.get('/api/teachers');
    topbarActions.innerHTML = '';

    if (!classes.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state"><h4>Dars jadvali uchun sinf kerak</h4><p class="muted">Avval o'quvchi qo'shib, sinf nomini belgilang.</p></div></div>`;
      return;
    }
    if (!schedClass || !classes.includes(schedClass)) schedClass = classFilter && classes.includes(classFilter) ? classFilter : classes[0];

    const classOpts = classes.map((c) => `<option value="${escapeHtml(c)}"${c === schedClass ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    content.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h3>Dars jadvali</h3>
          <div class="panel-actions">
            <select id="schedClass" class="select-inline" onchange="window.appSchedClass(this.value)">${classOpts}</select>
            <button class="btn btn-outline btn-sm" onclick="window.appSchedClear()">Tozalash</button>
            <button class="btn btn-primary btn-sm" onclick="window.appSchedSave()">Saqlash</button>
          </div>
        </div>
        <p class="muted" style="margin-bottom:12px">Har katakda fan va o'qituvchini tanlang. Bo'sh kataklar saqlanganda tushirib qoldiriladi.</p>
        <div class="sched-wrap" id="schedWrap"></div>
      </div>`;
    await drawSchedGrid(teachers);
  }

  async function drawSchedGrid(teachers) {
    const cls = schedClass;
    const data = await API.get('/api/schedule?className=' + encodeURIComponent(cls));
    const days = data.days;
    const lessonCount = data.lessonCount;
    const map = {};
    data.slots.forEach((s) => { map[s.dayOfWeek + '|' + s.lessonNo] = s; });

    // faqat shu sinfda dars beradigan o'qituvchilar
    const clsTeachers = teachers.filter((t) => Array.isArray(t.classes) && t.classes.includes(cls));
    const teacherOptions = (tids) => '<option value="">—</option>' + clsTeachers
      .map((t) => `<option value="${t.id}"${tids.includes(t.id) ? ' selected' : ''}>${escapeHtml(t.fullName)}</option>`).join('');

    const subjects = await getSubjects();
    const subjOpts = (sel) => '<option value="">—</option>' + subjects.map((s) =>
      `<option value="${escapeHtml(s)}"${s === sel ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');

    let head = '<th class="snum">T/r</th>' + Array.from({ length: days }, (_, i) =>
      `<th class="sday">${SHORT_DAYS[i]}<div class="sdayfull">${escapeHtml(data.dayNames[i])}</div></th>`).join('');
    let rows = '';
    for (let no = 1; no <= lessonCount; no++) {
      rows += '<tr><td class="snum">' + no + '</td>';
      for (let d = 1; d <= days; d++) {
        const slot = map[d + '|' + no] || {};
        rows += `<td class="scell">
          <select class="sched-in" data-d="${d}" data-n="${no}" data-k="subject">${subjOpts(slot.subject || '')}</select>
          <select class="sched-in" data-d="${d}" data-n="${no}" data-k="teacherId">${teacherOptions(slot.teacherId ? [slot.teacherId] : [])}</select>
        </td>`;
      }
      rows += '</tr>';
    }
    document.getElementById('schedWrap').innerHTML =
      `<table class="sched"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  let _subjects = [];

  window.appSchedClass = async (v) => {
    schedClass = v;
    const teachers = await API.get('/api/teachers');
    await drawSchedGrid(teachers);
  };

  window.appSchedSave = async () => {
    const slots = [...document.querySelectorAll('#schedWrap .sched-in[data-k="subject"]')].map((sel) => {
      const d = sel.dataset.d, n = sel.dataset.n;
      const t = document.querySelector(`#schedWrap .sched-in[data-k="teacherId"][data-d="${d}"][data-n="${n}"]`);
      return { dayOfWeek: Number(d), lessonNo: Number(n), subject: sel.value, teacherId: t && t.value ? Number(t.value) : null };
    }).filter((s) => s.subject);
    try {
      await API.put('/api/schedule', { className: schedClass, slots });
      toast('Dars jadvali saqlandi (' + slots.length + ' ta dars)');
    } catch (e) { toast(e.message, 'error'); }
  };

  window.appSchedClear = async () => {
    if (!confirm(schedClass + ' sinfi dars jadvali to\'lanadimi?')) return;
    try {
      await API.del('/api/schedule?className=' + encodeURIComponent(schedClass));
      toast('Dars jadvali tozalandi');
      await renderSchedule();
    } catch (e) { toast(e.message, 'error'); }
  };

  async function deleteClass(name) {
    if (!confirm('"' + name + '" sinfi va undagi barcha o\'quvchilarni (to\'lov, davomat, baholar bilan) o\'chirasizmi?')) return;
    await API.del('/api/classes/' + encodeURIComponent(name));
    toast(name + ' sinfi o\'chirildi');
    await renderClasses();
  }

  // ---------- SOZLAMALAR ----------
  function renderSettings() {
    Promise.all([Promise.resolve(), renderContactSettings()]).then(([, contactPanel]) => {
      topbarActions.innerHTML = '';
      content.innerHTML = `
        <div class="panel" style="max-width:560px">
          <div class="panel-header"><h3>Login va parolni o'zgartirish</h3></div>
          <div class="panel-body">
            <div class="hint">Parolni o'zgartirish uchun joriy parolni kiritish shart. Yangi login oldingi login o'rniga o'tadi.</div>
            <div class="form-group"><label>Joriy parol *</label><input type="password" id="sCurPass" placeholder="Hozirgi parolingiz"></div>
            <div class="form-grid">
              <div class="form-group"><label>Yangi login</label><input id="sUser" placeholder="yangi login (kiritmasangiz o'zgarmaydi)"></div>
              <div class="form-group"><label>Yangi parol</label><input type="password" id="sNewPass" placeholder="yangi parol (kamida 4 belgi)"></div>
            </div>
            <button class="btn btn-primary" id="saveSettingsBtn">Saqlash</button>
          </div>
        </div>
        ${contactPanel}`;

      document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveSettingsBtn');
        btn.disabled = true;
        try {
          const body = { currentPassword: document.getElementById('sCurPass').value };
          const newUser = document.getElementById('sUser').value.trim();
          const newPass = document.getElementById('sNewPass').value;
          if (newUser) body.username = newUser;
          if (newPass) body.newPassword = newPass;
          await API.post('/api/auth/update', body);
          toast('Ma\'lumotlar saqlandi');
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('fullName');
          setTimeout(() => { goLogin(); }, 900);
        } catch (e) {
          toast(e.message, 'error');
          btn.disabled = false;
        }
      });

      document.getElementById('saveContactBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveContactBtn');
        btn.disabled = true;
        try {
          await API.put('/api/settings', {
            phone: document.getElementById('sPhone').value.trim(),
            telegram: document.getElementById('sTelegram').value.trim(),
            instagram: document.getElementById('sInstagram').value.trim(),
          });
          toast('Bog\'lanish ma\'lumotlari saqlandi');
initContact('contactLinks');
initContact('contactTop');
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // ---------- FILIALLAR (super_admin/admin) ----------
  async function renderBranches() {
    topbarActions.innerHTML = `
      <button class="btn btn-primary" id="addBranchBtn">+ Filial qo'shish</button>
    `;
    content.innerHTML = '<div class="empty-state">Yuklanmoqda...</div>';
    try {
      const branches = await API.get('/api/branches');
      content.innerHTML = `
        <div class="panel">
          <div class="panel-header"><h3>Filiallar boshqaruvi</h3></div>
          <div class="panel-body">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Filial nomi</th>
                    <th>Maktab raqami</th>
                    <th>Manzil</th>
                    <th>Telefon</th>
                    <th>O'quvchilar</th>
                    <th>O'quvchilar</th>
                    <th>Shifokorlar</th>
                    <th>Holat</th>
                    <th>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  ${branches.map((b) => `
                    <tr>
                      <td><strong>${escapeHtml(b.name)}</strong></td>
                      <td>${escapeHtml(b.school_number || '-')}</td>
                      <td>${escapeHtml(b.address || '-')}</td>
                      <td>${escapeHtml(b.phone || '-')}</td>
                      <td>${b.student_count}</td>
                      <td>${b.teacher_count}</td>
                      <td>${b.doctor_count}</td>
                      <td><span class="badge badge-${b.is_active ? 'success' : 'danger'}">${b.is_active ? 'Faol' : "No'faol"}</span></td>
                      <td>
                        <button class="btn btn-sm btn-outline" onclick="window.appEditBranch(${b.id})">Tahrirlash</button>
                        ${b.student_count === 0 && b.teacher_count === 0 && b.doctor_count === 0 ? `<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="window.appDeleteBranch(${b.id})">O'chirish</button>` : '<span class="muted">—</span>'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      document.getElementById('addBranchBtn').addEventListener('click', () => {
        const html = `
          <div class="modal-header"><h3>Yangi filial qo'shish</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
          <div class="modal-body">
            <div class="form-group"><label>Filial nomi *</label><input id="nbName" placeholder="Masalan: 168-maktab"></div>
            <div class="form-group"><label>Maktab raqami</label><input id="nbNumber" placeholder="168"></div>
            <div class="form-group"><label>Manzil</label><input id="nbAddress" placeholder="Manzil"></div>
            <div class="form-group"><label>Telefon</label><input id="nbPhone" placeholder="+998 90 123 45 67"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
            <button class="btn btn-primary" id="saveBranchBtn">Saqlash</button>
          </div>
        `;
        showModal(html);
        document.getElementById('saveBranchBtn').addEventListener('click', async () => {
          const btn = document.getElementById('saveBranchBtn');
          btn.disabled = true;
          try {
            await API.post('/api/branches', {
              name: document.getElementById('nbName').value.trim(),
              school_number: document.getElementById('nbNumber').value.trim(),
              address: document.getElementById('nbAddress').value.trim(),
              phone: document.getElementById('nbPhone').value.trim(),
            });
            toast('Filial qo\'shildi');
            closeModal();
            await renderBranches();
          } catch (e) {
            toast(e.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  window.appEditBranch = async (id) => {
    try {
      const branches = await API.get('/api/branches');
      const b = branches.find((x) => x.id === id);
      if (!b) return;
      const users = await API.get('/api/users');
      const admins = users.filter((u) => u.role === 'admin' || u.role === 'super_admin');
      const html = `
        <div class="modal-header"><h3>Filialni tahrirlash — ${escapeHtml(b.name)}</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Filial nomi *</label><input id="ebName" value="${escapeHtml(b.name)}"></div>
          <div class="form-group"><label>Maktab raqami</label><input id="ebNumber" value="${escapeHtml(b.school_number || '')}"></div>
          <div class="form-group"><label>Manzil</label><input id="ebAddress" value="${escapeHtml(b.address || '')}"></div>
          <div class="form-group"><label>Telefon</label><input id="ebPhone" value="${escapeHtml(b.phone || '')}"></div>
          <div class="form-group"><label>Holat</label><select id="ebActive"><option value="1" ${b.is_active ? 'selected' : ''}>Faol</option><option value="0" ${!b.is_active ? 'selected' : ''}>No'faol</option></select></div>
          <div class="form-group"><label>Filial admini</label><select id="ebAdminId"><option value="">Tanlanmagan</option>${admins.map((a) => `<option value="${a.id}" ${b.admin_id === a.id ? 'selected' : ''}>${escapeHtml(a.username || a.fullName)}</option>`).join('')}</select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
          <button class="btn btn-primary" id="updateBranchBtn">Saqlash</button>
        </div>
      `;
      showModal(html);
      document.getElementById('updateBranchBtn').addEventListener('click', async () => {
        const btn = document.getElementById('updateBranchBtn');
        btn.disabled = true;
        try {
          await API.put('/api/branches/' + id, {
            name: document.getElementById('ebName').value.trim(),
            school_number: document.getElementById('ebNumber').value.trim(),
            address: document.getElementById('ebAddress').value.trim(),
            phone: document.getElementById('ebPhone').value.trim(),
            is_active: document.getElementById('ebActive').value === '1',
            admin_id: document.getElementById('ebAdminId').value ? Number(document.getElementById('ebAdminId').value) : null,
          });
          toast('Filial saqlandi');
          closeModal();
          await renderBranches();
        } catch (e) {
          toast(e.message, 'error');
          btn.disabled = false;
        }
      });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  window.appDeleteBranch = async (id) => {
    if (!confirm("Filialni o'chirishingizga ishonchingiz komilmi?")) return;
    try {
      await API.del('/api/branches/' + id);
      toast('Filial o\'chirildi');
      await renderBranches();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ---------- Chiqish ----------
  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('fullName');
    goLogin();
  });

  // ---------- KONTAKT (sozlamalar) ----------
  async function renderContactSettings() {
    const s = await API.get('/api/settings');
    return `
      <div class="panel" style="max-width:560px">
        <div class="panel-header"><h3>Bog'lanish ma'lumotlari</h3></div>
        <div class="panel-body">
          <div class="hint">Bu ma'lumotlar barcha panelarda (login sahifasi, o'quvchilar, ota-onalar, o'qituvchilar) ko'rinadi.</div>
          <div class="form-grid">
            <div class="form-group"><label>Telefon raqam</label><input id="sPhone" value="${escapeHtml(s.phone)}" placeholder="+998 90 123 45 67"></div>
            <div class="form-group"><label>Telegram</label><input id="sTelegram" value="${escapeHtml(s.telegram)}" placeholder="@lider_club yoki https://t.me/..."></div>
            <div class="form-group"><label>Instagram</label><input id="sInstagram" value="${escapeHtml(s.instagram)}" placeholder="@olim_lider yoki https://instagram.com/..."></div>
          </div>
          <button class="btn btn-primary" id="saveContactBtn">Saqlash</button>
        </div>
      </div>`;
  }

  // ---------- O'QITUVCHILAR ----------
  async function renderTeachers() {
    const teachers = await API.get('/api/teachers');
    const classes = [...new Set((await loadStudents(true)).map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));

    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-primary" onclick="window.appTeacherModal()">${ICONS.students.replace('width="18"', 'width="16"')} O'qituvchi qo'shish</button>
    </div>`;

    if (!teachers.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state"><h4>Hali o'qituvchilar yo'q</h4><p class="muted">Birinchi o'qituvchini qo'shing — unga fan va sinflar biriktirasiz.</p></div></div>`;
      return;
    }

    const rows = teachers.map((t) => `
      <tr>
        <td><div class="student-cell">${tAvatar(t)}<div><div class="name">${escapeHtml(t.fullName)}</div><div class="sub">${escapeHtml(t.position || 'O\'qituvchi')} • Login: ${escapeHtml(t.username || '—')}</div></div></div></td>
        <td>${(t.subjects || []).map((s) => `<span class="badge badge-blue" style="margin:2px">${escapeHtml(s)}</span>`).join('') || '—'}</td>
        <td>${(t.classes || []).map((c) => `<span class="badge badge-purple" style="margin:2px">${escapeHtml(c)}</span>`).join('') || '—'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appTeacherCred(${t.id})">Kirish ma'lumotlari</button>
          <button class="btn btn-outline btn-sm" onclick="window.appTeacherModal(${t.id})">Tahrirlash</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appDelTeacher(${t.id})">O'chirish</button>
        </td>
      </tr>`).join('');

    content.innerHTML = `<div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>O'qituvchi</th><th>Fanlari</th><th>Sinflari</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  async function teacherModal(id) {
    const teachers = await API.get('/api/teachers');
    const t = id != null ? teachers.find((x) => x.id === id) : null;
    const classes = [...new Set((await loadStudents(true)).map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));
    const subjects = await getSubjects();

    const subjBoxes = subjects.map((s) => `<label class="chip"><input type="checkbox" class="t-subj" value="${escapeHtml(s)}" ${t && t.subjects.includes(s) ? 'checked' : ''}> ${escapeHtml(s)}</label>`).join('');
    const classBoxes = classes.length
      ? classes.map((c) => `<label class="chip"><input type="checkbox" class="t-class" value="${escapeHtml(c)}" ${t && t.classes.includes(c) ? 'checked' : ''}> ${escapeHtml(c)}</label>`).join('')
      : '<span class="muted">Avval o\'quvchilar qo\'shilsin — sinflar shu yerda paydo bo\'ladi.</span>';

    showModal(`
      <div class="modal-title">${t ? "O'qituvchini tahrirlash" : "Yangi o'qituvchi"}</div>
      <div class="form-group"><label>To'liq ismi *</label><input id="tName" value="${escapeHtml((t && t.fullName) || '')}" placeholder="Masalan: Sobirov Aziz Olimovich"></div>
      <div class="form-group"><label>Lavozim</label><input id="tPosition" value="${escapeHtml((t && t.position) || '')}" placeholder="masalan: Matematika o'qituvchisi"></div>
      <div class="form-group"><label>Fanlari</label><div class="chip-group">${subjBoxes}</div></div>
      <div class="form-group"><label>Sinflari</label><div class="chip-group">${classBoxes}</div></div>
      <div class="form-grid">
        <div class="form-group"><label>Rasm</label><div style="display:flex;align-items:center;gap:12px">
          <div id="tPhotoPrev">${t ? tAvatar(t) : '<span class="avatar">A</span>'}</div>
          <input type="file" id="tPhotoInp" accept="image/*" style="font-size:13px">
        </div></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>Login (bo'masa avtomatik)</label><input id="tUser" value="${escapeHtml((t && t.username) || '')}" placeholder="ixtiyoriy"></div>
        <div class="form-group"><label>Parol (bo'masa avtomatik)</label><input id="tPass" placeholder="kamida 4 belgi"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor qilish</button>
        <button class="btn btn-primary" id="tSave">${t ? 'Saqlash' : "Qo'shish"}</button>
      </div>`);

    const tPhotoInp = document.getElementById('tPhotoInp');
    if (tPhotoInp) {
      tPhotoInp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          document.getElementById('tPhotoPrev').innerHTML = '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + ev.target.result + '">';
        };
        reader.readAsDataURL(file);
      });
    }

    if (t) {
      const userInput = document.getElementById('tUser');
      userInput.addEventListener('input', () => {});
    }

    document.getElementById('tSave').addEventListener('click', async () => {
      const fullName = document.getElementById('tName').value.trim();
      if (!fullName) return toast("Ism kiritilmagan", 'error');
      const position = document.getElementById('tPosition').value.trim();
      const subjects = [...document.querySelectorAll('.t-subj:checked')].map((x) => x.value);
      const classesSel = [...document.querySelectorAll('.t-class:checked')].map((x) => x.value);
      const body = { fullName, position, subjects, classes: classesSel };
      const username = document.getElementById('tUser').value.trim();
      const password = document.getElementById('tPass').value;
      const photoFile = tPhotoInp ? tPhotoInp.files[0] : null;
      const compressed = photoFile ? await compressImage(photoFile, 400, 533, 0.7) : null;
      try {
        if (t) {
          await API.put('/api/teachers/' + t.id, body);
          if (compressed) {
            const fd = new FormData();
            fd.append('photo', compressed);
            await API.post('/api/teachers/' + t.id + '/photo', fd, true);
          }
          toast('Saqlanmadi');
        } else {
          if (username) body.username = username;
          if (password) body.password = password;
          const r = await API.post('/api/teachers', body);
          if (compressed) {
            const fd = new FormData();
            fd.append('photo', compressed);
            await API.post('/api/teachers/' + r.teacher.id + '/photo', fd, true);
          }
          closeModal();
          showTeacherCredentials(r);
        }
        await renderTeachers();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  function showTeacherCredentials(data) {
    showModal(`
      <div class="modal-title">Yangi o'qituvchi tayyor</div>
      <div class="cred-card">
        <div class="cred-row"><span>Login</span><div><code id="credU">${escapeHtml(data.username)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credU')">Nusxa</button></div></div>
        <div class="cred-row"><span>Parol</span><div><code id="credP">${escapeHtml(data.password)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credP')">Nusxa</button></div></div>
      </div>
      <div class="hint">Ma'lumotni o'qituvchiga yetkazing — u teacher paneliga shular bilan kiradi.</div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="window.appCloseModal()">Yopish</button></div>`);
  }

  async function teacherCred(id) {
    const cred = await API.get('/api/teachers/' + id + '/credentials').catch(() => null);
    showModal(`
      <div class="modal-title">Kirish ma'lumotlari</div>
      ${cred ? `
      <div class="cred-card">
        <div class="cred-row"><span>Login</span><div><code id="tcU">${escapeHtml(cred.username)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('tcU')">Nusxa</button></div></div>
        <div class="cred-row"><span>Parol</span><div><code id="tcP">${escapeHtml(cred.password || '—')}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('tcP')">Nusxa</button></div></div>
      </div>` : `
      <div class="hint">Bu o'qituvchi uchun kirish yozuvi hali yaratilmagan.</div>`}
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Yopish</button>
        <button class="btn btn-primary" id="tcRegen">Yangi parol yaratish</button>
      </div>`);
    document.getElementById('tcRegen').addEventListener('click', async () => {
      try {
        const r = await API.post('/api/teachers/' + id + '/credentials', {});
        showModal(`
          <div class="modal-title">Yangi parol tayyor</div>
          <div class="cred-card">
            <div class="cred-row"><span>Login</span><div><code id="credU">${escapeHtml(r.username)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credU')">Nusxa</button></div></div>
            <div class="cred-row"><span>Parol</span><div><code id="credP">${escapeHtml(r.password)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credP')">Nusxa</button></div></div>
          </div>
          <div class="modal-actions"><button class="btn btn-primary" onclick="window.appCloseModal()">Yopish</button></div>`);
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function deleteTeacher(id) {
    if (!confirm('O\'qituvchini va uning hisobini o\'chirasizmi?')) return;
    await API.del('/api/teachers/' + id);
    toast("O'qituvchi o'chirildi");
    await renderTeachers();
  }

  function tAvatar(t) {
    const initials = ((t.fullName || '').split(' ').map((x) => x[0]).join('') || 'T').slice(0, 2).toUpperCase();
    const src = t.photoUrl || t.photo;
    if (src) return `<img class="avatar" style="border-radius:50%;object-fit:cover" src="${escapeHtml(src)}" alt="foto" loading="lazy">`;
    return `<span class="avatar" style="border-radius:50%">${escapeHtml(initials)}</span>`;
  }

  // ---------- SHIFOKORLAR ----------
  async function renderDoctors() {
    const doctors = await API.get('/api/doctors');

    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-primary" onclick="window.appDoctorModal()">${ICONS.students.replace('width="18"', 'width="16"')} Shifokor qo'shish</button>
    </div>`;

    if (!doctors.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state"><h4>Hali shifokorlar yo'q</h4><p class="muted">Birinchi shifokorni qo'shing — u 086-formalarni nazorat qiladi va kunlik sog'liq tekshiruvini olib boradi.</p></div></div>`;
      return;
    }

    const rows = doctors.map((d) => `
      <tr>
        <td><div class="student-cell">${tAvatar(d)}<div><div class="name">${escapeHtml(d.fullName)}</div><div class="sub">${escapeHtml(d.position || 'Shifokor')} • Login: ${escapeHtml(d.username || '—')}</div></div></div></td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appDoctorCred(${d.id})">Kirish ma'lumotlari</button>
          <button class="btn btn-outline btn-sm" onclick="window.appDoctorModal(${d.id})">Tahrirlash</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appDelDoctor(${d.id})">O'chirish</button>
        </td>
      </tr>`).join('');

    content.innerHTML = `<div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>Shifokor</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  }

  async function doctorModal(id) {
    const doctors = await API.get('/api/doctors');
    const d = id != null ? doctors.find((x) => x.id === id) : null;

    showModal(`
      <div class="modal-title">${d ? 'Shifokorni tahrirlash' : "Yangi shifokor"}</div>
      <div class="form-group"><label>To'liq ismi *</label><input id="dName" value="${escapeHtml((d && d.fullName) || '')}" placeholder="Masalan: Karimova Malika Davronovna"></div>
      <div class="form-group"><label>Lavozim</label><input id="dPosition" value="${escapeHtml((d && d.position) || '')}" placeholder="masalan: Tibbiy xodim"></div>
      <div class="form-grid">
        <div class="form-group"><label>Rasm</label><div style="display:flex;align-items:center;gap:12px">
          <div id="dPhotoPrev">${d ? tAvatar(d) : '<span class="avatar" style="border-radius:50%">SH</span>'}</div>
          <input type="file" id="dPhotoInp" accept="image/*" style="font-size:13px">
        </div></div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>Login (bo'masa avtomatik)</label><input id="dUser" value="${escapeHtml((d && d.username) || '')}" placeholder="ixtiyoriy"></div>
        <div class="form-group"><label>Parol (bo'masa avtomatik)</label><input id="dPass" placeholder="kamida 4 belgi"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor qilish</button>
        <button class="btn btn-primary" id="dSave">${d ? 'Saqlash' : "Qo'shish"}</button>
      </div>`);

    const dPhotoInp = document.getElementById('dPhotoInp');
    if (dPhotoInp) {
      dPhotoInp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          document.getElementById('dPhotoPrev').innerHTML = '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + ev.target.result + '">';
        };
        reader.readAsDataURL(file);
      });
    }

    document.getElementById('dSave').addEventListener('click', async () => {
      const fullName = document.getElementById('dName').value.trim();
      if (!fullName) return toast("Ism kiritilmagan", 'error');
      const position = document.getElementById('dPosition').value.trim();
      const body = { fullName, position };
      const username = document.getElementById('dUser').value.trim();
      const password = document.getElementById('dPass').value;
      const photoFile = dPhotoInp ? dPhotoInp.files[0] : null;
      const compressed = photoFile ? await compressImage(photoFile, 400, 533, 0.7) : null;
      try {
        if (d) {
          await API.put('/api/doctors/' + d.id, body);
          if (compressed) {
            const fd = new FormData();
            fd.append('photo', compressed);
            await API.post('/api/doctors/' + d.id + '/photo', fd, true);
          }
          toast('Saqlanmadi');
        } else {
          if (username) body.username = username;
          if (password) body.password = password;
          const r = await API.post('/api/doctors', body);
          if (compressed) {
            const fd = new FormData();
            fd.append('photo', compressed);
            await API.post('/api/doctors/' + r.doctor.id + '/photo', fd, true);
          }
          closeModal();
          doctorCredShow(r.username, r.password);
        }
        await renderDoctors();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  function doctorCredShow(username, password) {
    showModal(`
      <div class="modal-title">Yangi shifokor tayyor</div>
      <div class="cred-card">
        <div class="cred-row"><span>Login</span><div><code id="credU">${escapeHtml(username)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credU')">Nusxa</button></div></div>
        <div class="cred-row"><span>Parol</span><div><code id="credP">${escapeHtml(password)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('credP')">Nusxa</button></div></div>
      </div>
      <div class="hint">Ma'lumotni shifokorga yetkazing — u doctor paneliga shular bilan kiradi.</div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="window.appCloseModal()">Yopish</button></div>`);
  }

  async function doctorCred(id) {
    const cred = await API.get('/api/doctors/' + id + '/credentials').catch(() => null);
    showModal(`
      <div class="modal-title">Kirish ma'lumotlari</div>
      ${cred ? `
      <div class="cred-card">
        <div class="cred-row"><span>Login</span><div><code id="dcU">${escapeHtml(cred.username)}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('dcU')">Nusxa</button></div></div>
        <div class="cred-row"><span>Parol</span><div><code id="dcP">${escapeHtml(cred.password || '—')}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('dcP')">Nusxa</button></div></div>
      </div>` : `
      <div class="hint">Bu shifokor uchun kirish yozuvi hali yaratilmagan.</div>`}
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Yopish</button>
        <button class="btn btn-primary" id="dcRegen">Yangi parol yaratish</button>
      </div>`);
    document.getElementById('dcRegen').addEventListener('click', async () => {
      const r = await API.post('/api/doctors/' + id + '/credentials', {});
      doctorCredShow(r.username, r.password);
    });
  }

  async function deleteDoctor(id) {
    if (!confirm('Shifokorni va uning hisobini o\'chirasizmi?')) return;
    await API.del('/api/doctors/' + id);
    toast('Shifokor o\'chirildi');
    await renderDoctors();
  }

  // ---------- FANLAR ----------
  async function renderSubjects() {
    const subs = await getSubjects();
    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-primary" onclick="window.appAddSubject()">+ Fan qo'shish</button>
    </div>`;

    const chips = subs.map((s, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px">
        <span style="font-weight:600">${escapeHtml(s)}</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="window.appEditSubject(${i})">Tahrirlash</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appDelSubject(${i})">O'chirish</button>
        </div>
      </div>`).join('');

    content.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>Fanlar ro'yxati</h3><span class="badge badge-blue">${subs.length} ta fan</span></div>
        <div class="panel-body">
          ${chips || '<p class="empty-note">Hali fan yo\'q. "Fan qo\'shish" tugmasini bosing.</p>'}
          <div class="hint" style="margin-top:12px">Bu ro'yxat o'qituvchi biriktirishda va o'qituvchi jurnalida ishlatiladi. Nom o'zgartirilsa, eski baholar va nazoratlar avtomatik yangi nomga o'tadi.</div>
        </div>
      </div>`;
  }

  // ---------- TELEGRAM BOT ----------
  let tgData = null;

  async function renderTelegram() {
    topbarActions.innerHTML = '';
    let d;
    try {
      d = await API.get('/api/telegram/status');
    } catch (e) {
      content.innerHTML = `<div class="panel"><div class="empty-state"><h4>Xato</h4><p class="muted">${escapeHtml(e.message)}</p></div></div>`;
      return;
    }
    tgData = d;

    if (!d.configured || !d.bot) {
      content.innerHTML = `<div class="panel"><div class="empty-state">
        <h4>Bot sozlanmagan</h4>
        <p class="muted">Serverda <code>TELEGRAM_BOT_TOKEN</code> o'zgaruvchisi yo'q. .env.local fayliga yozing va serverni qayta ishga tushiring.</p>
      </div></div>`;
      return;
    }

    const pct = d.total ? Math.round((d.linked / d.total) * 100) : 0;
    const notLinked = d.list.filter((x) => !x.linked);
    const yesLinked = d.list.filter((x) => x.linked);
    const classes = [...new Set(d.list.map((x) => x.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));

    const rowOf = (x) => `<tr>
      ${selCell(x.userId)}
      <td><b>${escapeHtml(x.name || '—')}</b><div class="sub">${escapeHtml(x.parentName || '')}</div></td>
      <td><span class="badge badge-purple">${escapeHtml(x.className || '—')}</span></td>
      <td>${escapeHtml(x.phone || '—')}</td>
      <td>${x.linked
        ? `<span class="pay-status ok">✓ Ulangan${x.tgUsername ? ' (@' + escapeHtml(x.tgUsername) + ')' : ''}</span>`
        : '<span class="pay-status no">✗ Ulanmagan</span>'}</td>
      <td class="actions">
        <button class="btn btn-outline btn-sm" onclick="window.appTgLink(${x.userId})">🔗 Havola</button>
        ${x.linked ? `<button class="btn btn-danger btn-sm" onclick="window.appTgUnlink(${x.userId})">Uzish</button>` : ''}
      </td>
    </tr>`;

    content.innerHTML = `
      <div class="panel">
        <div class="panel-header"><h3>Telegram bot</h3><span class="badge badge-blue">@${escapeHtml(d.bot.username)}</span></div>
        <div class="panel-body">
          <div class="progress-wrap" style="margin-bottom:10px"><div class="progress"><div style="width:${pct}%;background:linear-gradient(90deg,#d4af37,#b8922e)"></div></div><span style="font-size:14px;font-weight:600">${d.linked} / ${d.total} ota-ona ulangan (${pct}%)</span></div>
          <div class="hint">Ota-ona saytga kirib "Telegram\'ga ulash" tugmasini bosadi — shundan keyin shu yerda xabar oladi. Ulanmagan ota-onalarga xabar yetib bormaydi.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>✉️ Xabar yuborish</h3></div>
        <div class="panel-body">
          <div class="form-group"><label>Xabar matni</label><textarea id="tgText" rows="4" maxlength="4000" placeholder="Hurmatli ota-ona, ... "></textarea></div>
          <div class="form-group"><label>Kimga</label>
            <select id="tgAudience">
              <option value="all">Barcha ota-onalar</option>
              ${classes.map((c) => `<option value="cls:${escapeHtml(c)}">Faqat ${escapeHtml(c)} sinfi</option>`).join('')}
              <option value="selected">Tanlangan ota-onalar (pastdagi jadvaldan)</option>
            </select>
          </div>
          <div class="panel-actions">
            <button class="btn btn-primary" onclick="window.appTgSend()">Yuborish</button>
          </div>
          <div class="hint" id="tgResult"></div>
          <div class="hint" style="margin-top:10px">Oylik to'lov eslatmasi <b>Oylik to'lovlar</b> bo'limidan yuboriladi — u yerda faqat to'lanmaganlar ko'rinadi.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Ulanmagan ota-onalar</h3><span class="badge badge-amber">${notLinked.length}</span></div>
        ${notLinked.length ? `<div class="table-wrap"><table>
          <thead><tr><th style="width:52px">T/r</th><th>O'quvchi</th><th>Ota-ona</th><th>Telefon</th><th></th></tr></thead>
          <tbody>${notLinked.map((x, i) => `<tr><td class="rownum">${i + 1}</td>
            <td><b>${escapeHtml(x.name || '—')}</b></td>
            <td><span class="badge badge-purple">${escapeHtml(x.className || '—')}</span></td>
            <td>${escapeHtml(x.phone || '—')}</td>
            <td class="actions"><button class="btn btn-outline btn-sm" onclick="window.appTgLink(${x.userId})">🔗 Havola</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="panel-body"><p class="empty-note">Barcha ota-onalar ulangan ✅</p></div>'}
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Ulangan ota-onalar</h3><span class="badge badge-blue">${yesLinked.length}</span></div>
        ${yesLinked.length ? `<div class="table-wrap"><table>
          <thead><tr><th style="width:52px">T/r</th><th>O'quvchi</th><th>Sinf</th><th>Telefon</th><th>Holat</th><th></th></tr></thead>
          <tbody>${yesLinked.map((x, i) => `<tr><td class="rownum">${i + 1}</td>
            <td><b>${escapeHtml(x.name || '—')}</b><div class="sub">${escapeHtml(x.parentName || '')}</div></td>
            <td><span class="badge badge-purple">${escapeHtml(x.className || '—')}</span></td>
            <td>${escapeHtml(x.phone || '—')}</td>
            <td>${x.linked ? `<span class="pay-status ok">✓ Ulangan${x.tgUsername ? ' (@' + escapeHtml(x.tgUsername) + ')' : ''}</span>` : ''}</td>
            <td class="actions">
              <button class="btn btn-outline btn-sm" onclick="window.appTgLink(${x.userId})">🔗 Havola</button>
              <button class="btn btn-danger btn-sm" onclick="window.appTgUnlink(${x.userId})">Uzish</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="panel-body"><p class="empty-note">Hali hech kim ulanmagan.</p></div>'}
      </div>`;
  }

  window.appTgSend = async () => {
    const text = document.getElementById('tgText').value.trim();
    const aud = document.getElementById('tgAudience').value;
    const box = document.getElementById('tgResult');
    if (!text) return toast('Xabar matni kiritilmagan', 'error');
    if (aud === 'selected' && !selected.size) return toast('Jadvaldan ota-onalarni tanlang (chapdagi checkbox)', 'error');
    const body = { text };
    if (aud.startsWith('cls:')) body.className = aud.slice(4);
    if (aud === 'selected') body.studentIds = [...selected];
    if (!confirm('Yuborishni tasdiqlaysizmi?')) return;
    box.textContent = 'Yuborilmoqda...';
    try {
      const r = await API.post('/api/telegram/broadcast', body);
      box.innerHTML = `✅ Yuborildi: <b>${r.sent}</b> · ulanmagan: <b>${r.noLink}</b> · xato: <b>${r.failed}</b>`;
      clearSel();
      toast('Xabar yuborildi');
    } catch (e) {
      box.textContent = '';
      toast(e.message, 'error');
    }
  };

  window.appTgRemind = () => toast('Eslatma endi "Oylik to\'lovlar" bo\'limidan yuboriladi');

  window.appTgLink = async (userId) => {
    try {
      const r = await API.post('/api/telegram/relink', { userId });
      const text = '📱 Bu Telegram bot havolasini ota-onaga yuboring:\n\n' + r.linkUrl + '\n\n(Ota-ona havolani bosganda avtomatik ulanadi)';
      showModal(`
        <div class="modal-header"><h3>Telegram ulash havolasi</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Havola</label><input id="tgLinkUrl" readonly value="${escapeHtml(r.linkUrl || '')}"></div>
          <div class="hint">Eski kod bekor qilindi. Ota-ona ushbu havolani Telegram'da bosishi kerak.</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="window.appCloseModal()">Yopish</button>
          <button class="btn btn-primary" onclick="window.appCopyTgLink()">Nusxalash</button>
        </div>`);
    } catch (e) { toast(e.message, 'error'); }
  };

  window.appCopyTgLink = () => {
    const el = document.getElementById('tgLinkUrl');
    if (el) { el.select(); navigator.clipboard.writeText(el.value).then(() => toast('Nusxalandi')); }
  };

  window.appTgUnlink = async (userId) => {
    if (!confirm('Bu ota-onaning Telegram ulanishini uzamizmi?')) return;
    try {
      await API.post('/api/telegram/unlink', { userId });
      toast('Uzildi');
      await renderTelegram();
    } catch (e) { toast(e.message, 'error'); }
  };

  async function subjectModal(idx) {
    const subs = await getSubjects();
    const current = (idx !== null && idx !== undefined) ? subs[idx] : '';
    showModal(`
      <div class="modal-title">${current ? 'Fanni tahrirlash' : 'Yangi fan'}</div>
      <div class="form-group"><label>Fan nomi *</label><input id="subjName" value="${escapeHtml(current || '')}" placeholder="Masalan: Diniy ta'limotlar"></div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="subjSave">${current ? 'Saqlash' : "Qo'shish"}</button>
      </div>`);
    const saveBtn = document.getElementById('subjSave');
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('subjName').value.trim();
      if (!name) return toast('Nom kiritilmagan', 'error');
      saveBtn.disabled = true;
      try {
        if (current) await API.put('/api/subjects/' + encodeURIComponent(current), { name });
        else await API.post('/api/subjects', { name });
        resetSubjectsCache();
        closeModal();
        toast('Fan saqlandi');
        await renderSubjects();
      } catch (e) {
        toast(e.message, 'error');
        saveBtn.disabled = false;
      }
    });
  }

  async function deleteSubject(idx) {
    const subs = await getSubjects();
    const name = subs[idx];
    if (!name) return;
    if (!confirm('"' + name + '" fanini o\'chirasizmi? O\'qituvchilardan bu fan olib tashlanadi.')) return;
    try {
      await API.del('/api/subjects/' + encodeURIComponent(name));
      resetSubjectsCache();
      toast("Fan o'chirildi");
      await renderSubjects();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- Global funksiyalar ----------
  window.appNav = (s) => {
    document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.toggle('active', b.dataset.section === s));
    navigateTo(s);
  };
  window.appRefresh = async () => {
    const btn = document.querySelector('.nav-item[data-section].active');
    if (!btn) return;
    const y = window.scrollY;
    await navigateTo(btn.dataset.section);
    if (y) window.scrollTo(0, y);
  };
  window.appCloseModal = closeModal;
  window.appSelClear = () => {
    clearSel();
    const btn = document.querySelector('.nav-item[data-section].active');
    if (btn) navigateTo(btn.dataset.section);
  };
  window.appResetFilter = (id) => {
    const map = { St: fState.students, Pay: fState.payments, Att: fState.attendance };
    const st = map[id];
    if (!st) return;
    st.q = ''; st.cls = ''; st.pay = 'all'; st.fee = 'all'; st.status = 'all'; st.sort = 'name';
    if (id === 'St') classFilter = '';
    if (id === 'Att') attendClass = '';
    const btn = document.querySelector('.nav-item[data-section].active');
    if (btn) navigateTo(btn.dataset.section);
  };
  window.appBulkPay = async (paid) => {
    const ids = selIds();
    if (!ids.length) return;
    const labelName = monthNames()[payMonth - 1];
    const yes = paid === true || paid === 'true';
    if (!confirm(`${ids.length} ta o'quvchining ${labelName} to'lovini ${yes ? "to'langan" : "to'lanmagan"} qilamizmi?`)) return;
    for (const id of ids) await API.post('/api/payments/toggle', { studentId: id, month: payMonth, year: payYear, paid: yes });
    clearSel();
    toast(`${ids.length} ta to'lov yangilandi`);
    await renderPayTable();
  };
  window.appBulkAtt = async (status) => {
    const ids = selIds();
    if (!ids.length) return;
    const labels = { present: 'Keldi', late: 'Kechikdi', absent: 'Kelmadi' };
    if (!confirm(`${ids.length} ta o'quvchining davomatini "${labels[status]}" deb belgilaymizmi?`)) return;
    for (const id of ids) await API.post('/api/attendance', { studentId: id, date: attendDate, status });
    clearSel();
    toast(`${ids.length} ta davomat yangilandi`);
    await renderAttTable();
  };
  window.appBulkMove = () => {
    const ids = selIds();
    if (!ids.length) return;
    const classes = classOptions();
    showModal(`
      <div class="modal-header"><h3>${ids.length} ta o'quvchini sinfga o'tkazish</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Yangi sinf</label>
          <select id="bmCls">${classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
        </div>
        <div class="hint">O'quvchilar eski sinfdan chiqariladi. To'lov, davomat va baholar saqlanib qoladi.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="bmGo">O'tkazish</button>
      </div>`);
    document.getElementById('bmGo').addEventListener('click', async () => {
      const cls = document.getElementById('bmCls').value;
      if (!cls) return;
      document.getElementById('bmGo').disabled = true;
      try {
        for (const id of ids) await API.put('/api/students/' + id, { className: cls });
        closeModal();
        clearSel();
        toast(`${ids.length} ta o'quvchi "${cls}" sinfiga o'tkazildi`);
        students = [];
        await renderStudents();
      } catch (e) { toast(e.message, 'error'); document.getElementById('bmGo').disabled = false; }
    });
  };
  window.appBulkDelete = async () => {
    const ids = selIds();
    if (!ids.length) return;
    const names = ids.map((i) => { const s = students.find((x) => x.id === i); return s ? s.lastName : ''; }).filter(Boolean);
    if (!confirm(`${ids.length} ta o'quvchining barcha ma\'lumotlari (to\'lov, davomat, baholar, tibbiy) butunlay o\'chiriladi.\n\nDavom etasizmi?`)) return;
    const typed = prompt(`Tasdiqlash uchun ${ids.length} raqamini yozing:`);
    if (String(typed).trim() !== String(ids.length)) return toast('Raqam mos kelmadi — bekor qilindi', 'error');
    for (const id of ids) {
      try { await API.del('/api/students/' + id); } catch (e) { /* davom etamiz */ }
    }
    closeModal();
    clearSel();
    students = [];
    toast(`${ids.length} ta o'quvchi o'chirildi`, 'error');
    await renderStudents();
  };
  window.appBulkMessage = () => {
    const ids = selIds();
    if (!ids.length) return;
    if (ids.length > 50 && !confirm(`${ids.length} ta ota-onaga xabar yuborasizmi? Ko'p xabar osongina spamga tushishi mumkin.`)) return;
    showModal(`
      <div class="modal-header"><h3>${ids.length} ta ota-onaga xabar</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Xabar matni *</label>
          <textarea id="bmText" rows="5" maxlength="2000" placeholder="Masalan: Hurmatli ota-ona, ertaga mashq 8:00 da boshlanadi. Davomatni tekshirib boring."></textarea>
        </div>
        <div class="hint">Xabar sayt ichidagi xabarlar orqali yuboriladi. Har bir ota-ona o'z farzandiga tegishli xabarni oladi.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="bmSend">Yuborish</button>
      </div>`);
    const btn = document.getElementById('bmSend');
    btn.addEventListener('click', async () => {
      const text = document.getElementById('bmText').value.trim();
      if (!text) return toast('Xabar matni kiritilmagan', 'error');
      btn.disabled = true;
      btn.textContent = 'Yuborilmoqda...';
      try {
        const r = await API.post('/api/chat/bulk', { studentIds: ids, text });
        closeModal();
        clearSel();
        toast(`${r.sent} ta ota-onaga yuborildi` + (r.skipped ? ` (${r.skipped} ta ota-ona topilmadi)` : ''));
        students = [];
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Yuborish';
      }
    });
  };
  window.appAddStudent = () => studentModal();
  window.appEditStudent = (id) => editStudent(id);
  window.appDeleteStudent = (id) => deleteStudent(id);
  window.appSetAtt = async (id, status) => {
    if (_setAttInProgress) return;
    _setAttInProgress = true;
    await setAttendance(id, status);
    await renderAttTable();
    _setAttInProgress = false;
  };
  window.appSetTAtt = async (id, status) => {
    if (_setAttInProgress) return;
    _setAttInProgress = true;
    await setTeacherAtt(id, status);
    await renderTeacherAtt();
    _setAttInProgress = false;
  };
  window.appBulkStudents = () => bulkStudents();
  window.appBulkTeachers = () => bulkTeachers();
  window.appAddGrade = () => addGradeModal();
  window.appDelGrade = (id) => deleteGrade(id);
  window.appGenPass = genPassword;
  window.appGenUser = genUsername;
  window.appCopy = (id) => {
    const el = document.getElementById(id);
    const text = el.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
      toast('Nusxalandi');
    });
  };
  window.appOpenClass = (name) => openClass(name);
  window.appDeleteClass = (name) => deleteClass(name);
  window.appParentCred = (id) => parentCred(id);
  window.appTeacherModal = (id) => teacherModal(id);
  window.appTeacherCred = (id) => teacherCred(id);
  window.appDelTeacher = (id) => deleteTeacher(id);
  window.appDoctorModal = (id) => doctorModal(id);
  window.appDoctorCred = (id) => doctorCred(id);
  window.appDelDoctor = (id) => deleteDoctor(id);
  window.appAddSubject = () => subjectModal();
  window.appEditSubject = (idx) => subjectModal(idx);
  window.appDelSubject = (idx) => deleteSubject(idx);
  window.appCopyTxt = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim()).then(() => toast('Nusxalandi'));
  };
  window.appExportWord = async () => {
    const className = classFilter || '';
    const target = className || 'barcha_sinflar';
    toast('Word hujjat tayyorlanmoqda...');
    try {
      const res = await fetch('/api/export/class?className=' + encodeURIComponent(className), {
        headers: { Authorization: 'Bearer ' + API.getToken() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Yuklab olishda xato');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = target + '_oquvchilar.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Word fayl yuklab olindi');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  window.appExportParents = async (className) => {
    if (!className) return;
    if (!confirm(className + ' sinfi ota-onalari uchun YANGI parollar yaratiladi (joriy parollar bekor bo`ladi). Davom etilsinmi?')) return;
    toast('Login/parollar tayyorlanmoqda...');
    try {
      const res = await fetch('/api/export/parents?className=' + encodeURIComponent(className), {
        headers: { Authorization: 'Bearer ' + API.getToken() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Yuklab olishda xato');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = className + '_ota-ona_login_parol.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Word fayl yuklab olindi. Parollar yangilandi!');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  window.appExportShort = async (className) => {
    if (!className) return;
    toast('Qisqa ro`yxat tayyorlanmoqda...');
    try {
      const res = await fetch('/api/export/shortlist?className=' + encodeURIComponent(className), {
        headers: { Authorization: 'Bearer ' + API.getToken() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Yuklab olishda xato');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = className + '_qisqa_royxat.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Word fayl yuklab olindi');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  window.appExportPayments = async (className) => {
    if (!className) return;
    const year = new Date().getFullYear();
    toast('To`lovlar jadvali tayyorlanmoqda...');
    try {
      const res = await fetch('/api/export/payments?className=' + encodeURIComponent(className) + '&year=' + year, {
        headers: { Authorization: 'Bearer ' + API.getToken() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Yuklab olishda xato');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = className + '_' + year + '-' + (year + 1) + '_tolovlar.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Word fayl yuklab olindi');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
window.appCopyPc = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.value || el.textContent.trim()).then(() => toast('Nusxalandi'));
};

window.appSidebarToggle = () => {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
};

window.appSidebarClose = () => {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('open');
};

// Swipe gesture for sidebar on mobile
let _swipeStartX = 0;
let _swipeStartTime = 0;

function initSidebarSwipe() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  let startX = 0;
  let startTime = 0;

  document.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 900) return;
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    const touch = e.touches[0];
    startX = touch.clientX;
    startTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (window.innerWidth > 900) return;
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || !sidebar.classList.contains('open')) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    
    // Swipe left to close (negative deltaX)
    if (deltaX < -50 && Date.now() - startTime < 300) {
      window.appSidebarClose();
    }
    // Swipe right from left edge to open
    if (deltaX > 50 && Date.now() - startTime < 300 && !document.querySelector('.sidebar.open')) {
      window.appSidebarToggle();
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (window.innerWidth > 900) return;
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaTime = Date.now() - startTime;
    
    // Swipe left to close (swipe from right to left)
    if (deltaX < -80 && deltaTime < 300) {
      window.appSidebarClose();
    }
    // Swipe right from left edge to open
    if (deltaX > 80 && Date.now() - startTime < 300 && !document.querySelector('.sidebar.open')) {
      window.appSidebarToggle();
    }
  }, { passive: true });
}

// Initialize swipe on load
document.addEventListener('DOMContentLoaded', initSidebarSwipe);

  // start
initContact('contactLinks');
  initContact('contactTop');
  initClock('clock');
  navigateTo('dashboard');
})();
