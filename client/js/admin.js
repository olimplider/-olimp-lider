(function () {
  if (API.getRole() !== 'admin') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('userInfo').textContent = '👤 ' + API.getFullName();

  const content = document.getElementById('content');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const pageTitle = document.getElementById('pageTitle');
  const topbarActions = document.getElementById('topbarActions');

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
    attendance: 'Davomat',
    grades: 'Baholar',
    teachers: "O'qituvchilar",
    subjects: 'Fanlar',
    settings: 'Sozlamalar',
  };

  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      navigateTo(btn.dataset.section);
    });
  });

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
      else if (section === 'attendance') await renderAttendance();
      else if (section === 'grades') await renderGrades();
      else if (section === 'teachers') await renderTeachers();
      else if (section === 'subjects') await renderSubjects();
      else if (section === 'settings') renderSettings();
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  // ---------- DASHBORD ----------
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
            <div class="progress"><div style="width:${payPercent}%;background:linear-gradient(90deg,#4f46e5,#16a34a);"></div></div>
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

    content.innerHTML = cards + panels;
  }

  // ---------- O'QUVCHILAR ----------
  let classFilter = '';

  async function renderStudents() {
    students = await loadStudents(true);
    const classes = [...new Set(students.map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));
    if (!classes.includes(classFilter)) classFilter = '';

    topbarActions.innerHTML = `<div class="toolbar">
      <select id="classFilter" style="min-width:150px">
        <option value="">Barcha sinflar (${students.length})</option>
        ${classes.map((c) => `<option value="${escapeHtml(c)}" ${c === classFilter ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      <button class="btn btn-outline" onclick="window.appExportWord()">${ICONS.doc.replace('width="18"', 'width="16"')} Word (docx)</button>
      <button class="btn btn-primary" onclick="window.appAddStudent()">${ICONS.students.replace('width="18"', 'width="16"')} O'quvchi qo'shish</button>
    </div>`;

    document.getElementById('classFilter').addEventListener('change', (e) => {
      classFilter = e.target.value;
      renderStudentTable();
    });

    renderStudentTable();
  }

  function renderStudentTable() {
    if (!students.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state">
        <h4>Hali o'quvchilar yo'q</h4>
        <p class="muted">Birinchi o'quvchini qo'shish uchun yuqoridagi tugmani bosing.</p>
      </div></div>`;
      return;
    }

    const list = classFilter ? students.filter((s) => s.className === classFilter) : students;

    if (!list.length) {
      content.innerHTML = `<div class="panel"><div class="empty-state"><h4>Bu sinfda o'quvchilar yo'q</h4></div></div>`;
      return;
    }

    const rows = list.map((s) => {
      const avg = '—';
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.patronymic)}</div></div></div></td>
        <td><span class="badge badge-purple">${escapeHtml(s.className) || '—'}</span></td>
        <td>${s.monthlyFee ? s.monthlyFee.toLocaleString('ru-RU') + ' so\'m' : '—'}</td>
        <td>${escapeHtml(s.parentName) || '—'}<div class="sub">${escapeHtml(s.parentPhone) || ''}</div></td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appEditStudent(${s.id})">Tahrirlash</button>
          <button class="btn btn-outline btn-sm" title="Ota-ona login/paroli" onclick="window.appParentCred(${s.id})">🔑 Kirish</button>
          <button class="btn btn-danger btn-sm" onclick="window.appDeleteStudent(${s.id})">O'chirish</button>
        </td>
      </tr>`;
    }).join('');

    content.innerHTML = `<div class="panel"><div class="panel-header"><h3>O'quvchilar</h3><span class="badge badge-blue">${list.length} ta</span></div><div class="table-wrap"><table>
      <thead><tr><th>O'quvchi</th><th>Sinf</th><th>Oylik to'lov</th><th>Ota-ona</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
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

  function studentModal(student = null) {
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
            <input id="fClass" list="classListDl" value="${escapeHtml(s.className)}" placeholder="masalan: 7-A">
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

    document.getElementById('saveStudentBtn').addEventListener('click', async () => {
      const btn = document.getElementById('saveStudentBtn');
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
          const fd = new FormData();
          fd.append('photo', photoFile);
          await API.post('/api/students/' + s.id + '/photo', fd, true);
        }

        closeModal();
        if (!isEdit && result.parentUsername) {
          showCredentialsModal(result);
        } else {
          toast(isEdit ? 'Saqlanib qo\'yildi' : 'O\'quvchi qo\'shildi');
          await renderStudents();
        }
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function showCredentialsModal(st) {
    modalContent.innerHTML = `
      <div class="modal-header"><h3>Ota-ona kirishi yaratildi</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <p style="margin-bottom:16px">O'quvchi <b>${escapeHtml(st.lastName)} ${escapeHtml(st.firstName)}</b> uchun ota-ona kirishi yaratildi. Quyidagi ma'lumotlarni ota-onaga topshiring:</p>
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:16px 18px">
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
    showCredentialsModal._done = async () => { closeModal(); await renderStudents(); };
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
    await API.del('/api/students/' + id);
    toast('O\'quvchi o\'chirildi');
    await renderStudents();
  }

  // ---------- Ota-ona login/parolini ko'rish / qayta yaratish ----------
  async function parentCred(id) {
    await loadStudents();
    const s = students.find((x) => x.id === id);
    if (!s) return;

    showModal(`
      <div class="modal-header"><h3>Ota-ona kirishi — ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h3><button class="modal-close" onclick="window.appCloseModal()">×</button></div>
      <div class="modal-body">
        <div class="hint">Bu oynada ota-ona logini ko'rinadi. Parol xavfsizlik uchun yashiringan — "Yangi parol yaratish" tugmasini bossangiz, yangi parol yaratiladi va shu yerda ko'rsatiladi. Uni ota-onaga bering.</div>
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px">
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
              <div style="font-size:16px;font-weight:700;letter-spacing:.5px" id="pcPass">— (yashiringan)</div>
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
    } else {
      document.getElementById('pcUser').value = '';
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
    topbarActions.innerHTML = `
      <div class="toolbar">
        <select id="payMonthSel">${renderMonthsSelect(payMonth)}</select>
        <select id="payYearSel">${renderYearsSelect()}</select>
      </div>`;

    document.getElementById('payMonthSel').addEventListener('change', (e) => { payMonth = Number(e.target.value); renderPayTable(); });
    document.getElementById('payYearSel').addEventListener('change', (e) => { payYear = Number(e.target.value); renderPayTable(); });

    await renderPayTable();
  }

  async function renderPayTable() {
    const payments = await API.get('/api/payments?month=' + payMonth + '&year=' + payYear);
    const map = {};
    payments.forEach((p) => { map[p.studentId] = p; });

    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchilar yo\'q</h4></div></div>';
      return;
    }

    let paidCount = 0;
    const rows = students.map((s) => {
      const p = map[s.id];
      const paid = p ? p.paid : false;
      if (paid) paidCount++;
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td>${s.monthlyFee ? s.monthlyFee.toLocaleString('ru-RU') + ' so\'m' : '—'}</td>
        <td class="switch-cell"><label class="switch"><input type="checkbox" data-pid="${s.id}" ${paid ? 'checked' : ''}><span class="slider"></span></label></td>
        <td><span class="pay-status ${paid ? 'ok' : 'no'}" id="ps-${s.id}">${paid ? '✓ To\'langan' : '✗ To\'lanmagan'}</span></td>
      </tr>`;
    }).join('');

    const pct = students.length ? Math.round((paidCount / students.length) * 100) : 0;

    content.innerHTML = `<div class="panel">
      <div class="panel-header"><h3>${renderMonthsSelect(payMonth).replace(/<option[^>]*>([^<]*)<\/option>/g, '').replace('selected', '')}</h3><span class="badge badge-blue">${paidCount} / ${students.length} to'lagan (${pct}%)</span></div>
      <div class="panel-body" style="padding-top:10px">
        <div class="progress-wrap" style="margin-bottom:16px"><div class="progress"><div style="width:${pct}%;background:linear-gradient(90deg,#16a34a,#4f46e5)"></div></div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>O'quvchi</th><th>Oylik to'lov</th><th style="text-align:center">To'lov</th><th>Holat</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

    document.querySelectorAll('.switch input').forEach((chk) => {
      chk.addEventListener('change', async (e) => {
        const pid = Number(chk.dataset.pid);
        const paid = chk.checked;
        const labelName = monthNames()[payMonth - 1];
        await API.post('/api/payments/toggle', { studentId: pid, month: payMonth, year: payYear, paid });
        const st = document.getElementById('ps-' + pid);
        if (st) {
          st.className = 'pay-status ' + (paid ? 'ok' : 'no');
          st.textContent = paid ? '✓ ' + labelName + ' uchun to\'landi' : '✗ To\'lanmagan';
        }
        toast(paid ? (labelName + ' uchun to\'lov tasdiqlandi') : 'To\'lov bekor qilindi');
      });
    });
  }

  // ---------- DAVOMAT ----------
  let attendDate = todayStr();

  async function renderAttendance() {
    students = await loadStudents(true);
    topbarActions.innerHTML = `
      <div class="toolbar">
        <input type="date" id="attDate" class="date-pick" value="${attendDate}">
        <button class="btn btn-outline btn-sm" onclick="window.appMarkAllPresent()">Hammasini belgilash</button>
      </div>`;

    document.getElementById('attDate').addEventListener('change', (e) => {
      attendDate = e.target.value;
      renderAttTable();
    });

    await renderAttTable();
  }

  async function renderAttTable() {
    const att = await API.get('/api/attendance?date=' + attendDate);
    const map = {};
    att.forEach((a) => { map[a.studentId] = a.status; });

    if (!students.length) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchilar yo\'q</h4></div></div>';
      return;
    }

    const b = (ok) => ok
      ? '<span class="badge badge-green" style="font-size:11px">Keldi</span>'
      : '<span class="badge badge-red" style="font-size:11px">Kelmadi</span>';

    const rows = students.map((s) => {
      const st = map[s.id] || null;
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td><button class="btn btn-sm ${st === 'present' ? 'btn-success' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'present',this)">✓ Keldi</button></td>
        <td><button class="btn btn-sm ${st === 'late' ? 'btn-outline' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'late',this)" style="border-color:#d97706;color:#d97706">⏰ Kechikdi</button></td>
        <td><button class="btn btn-sm ${st === 'absent' ? 'btn-danger' : 'btn-ghost'}" onclick="window.appSetAtt(${s.id},'absent',this)">✗ Kelmadi</button></td>
      </tr>`;
    }).join('');

    let p = 0, a = 0, l = 0, u = 0;
    students.forEach((s) => {
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
      <div class="panel"><div class="table-wrap"><table>
        <thead><tr><th>O'quvchi</th><th>Keldi</th><th>Kechikdi</th><th>Kelmadi</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  async function setAttendance(studentId, status) {
    await API.post('/api/attendance', { studentId, date: attendDate, status });
  }

  async function markAllPresent() {
    for (const s of students) {
      await setAttendance(s.id, 'present');
    }
    toast('Barchasi belgilandi');
    await renderAttTable();
  }

  // ---------- BAHOLAR ----------
  let gradeStudentId = null;

  async function renderGrades() {
    students = await loadStudents(true);
    let selected = students.find((s) => s.id === gradeStudentId);
    if (!selected && students.length) selected = students[0];
    if (selected) gradeStudentId = selected.id;

    topbarActions.innerHTML = `<div class="toolbar">
      <select id="gradeStudentSel" style="min-width:220px">
        <option value="">— O'quvchini tanlang —</option>
        ${students.map((s) => `<option value="${s.id}" ${s.id === selected?.id ? 'selected' : ''}>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)} (${escapeHtml(s.className)})</option>`).join('')}
      </select>
      ${selected ? '<button class="btn btn-primary btn-sm" onclick="window.appAddGrade()">+ Baho qo\'shish</button>' : ''}
    </div>`;

    document.getElementById('gradeStudentSel').addEventListener('change', (e) => {
      gradeStudentId = Number(e.target.value);
      renderGrades();
    });

    if (!selected) {
      content.innerHTML = '<div class="panel"><div class="empty-state"><h4>O\'quvchi tanlang</h4></div></div>';
      return;
    }

    const grades = await API.get('/api/grades?studentId=' + selected.id);
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
    return `<div class="panel" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff">
      <div class="panel-body" style="display:flex;align-items:center;gap:20px">
        ${avatarHtml(s)}
        <div><h3 style="font-size:18px">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</h3><div style="opacity:.9;font-size:14px">${escapeHtml(s.className)} — ${escapeHtml(s.patronymic)}</div></div>
        <div style="margin-left:auto;text-align:center;background:rgba(255,255,255,.15);border-radius:14px;padding:10px 18px">
          <div style="font-size:26px;font-weight:800">${avg}</div><div style="font-size:12px;opacity:.9">o'rtacha baho</div>
        </div>
        <div style="display:flex;gap:8px">
          <span class="badge" style="background:#22c55e;color:#fff">5: ${balls}</span>
          <span class="badge" style="background:#3b82f6;color:#fff">4: ${fours}</span>
          <span class="badge" style="background:#f59e0b;color:#fff">3: ${threes}</span>
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
        <td><div style="display:flex;align-items:center;gap:12px"><span class="avatar">${escapeHtml(c.name)}</span><div><div class="name">${escapeHtml(c.name)} sini</div><div class="sub">${c.count} ta o'quvchi</div></div></div></td>
        <td><span class="badge badge-blue">${c.count} o'quvchi</span></td>
        <td>${c.totalFee ? c.totalFee.toLocaleString('ru-RU') + ' so\'m/oy' : '—'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" onclick="window.appOpenClass('${escapeHtml(c.name)}')">O'quvchilarini ko'rish</button>
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
    document.querySelector('[data-section="students"]').classList.add('active');
    navigateTo('students');
  }

  async function deleteClass(name) {
    if (!confirm('"' + name + '" sini va undagi barcha o\'quvchilarni (to\'lov, davomat, baholar bilan) o\'chirasizmi?')) return;
    await API.del('/api/classes/' + encodeURIComponent(name));
    toast(name + ' sini o\'chirildi');
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
          setTimeout(() => { window.location.href = '/login.html'; }, 900);
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

  // ---------- Chiqish ----------
  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('fullName');
    window.location.href = '/login.html';
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
        <td><div class="name">${escapeHtml(t.fullName)}</div><div class="sub">Login: ${escapeHtml(t.username || '—')}</div></td>
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
      <div class="form-group"><label>Fanlari</label><div class="chip-group">${subjBoxes}</div></div>
      <div class="form-group"><label>Sinflari</label><div class="chip-group">${classBoxes}</div></div>
      <div class="form-grid">
        <div class="form-group"><label>Login (bo'masa avtomatik)</label><input id="tUser" value="${escapeHtml((t && t.username) || '')}" placeholder="ixtiyoriy"></div>
        <div class="form-group"><label>Parol (bo'masa avtomatik)</label><input id="tPass" placeholder="kamida 4 belgi"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor qilish</button>
        <button class="btn btn-primary" id="tSave">${t ? 'Saqlash' : "Qo'shish"}</button>
      </div>`);

    if (t) {
      const userInput = document.getElementById('tUser');
      userInput.addEventListener('input', () => {});
    }

    document.getElementById('tSave').addEventListener('click', async () => {
      const fullName = document.getElementById('tName').value.trim();
      if (!fullName) return toast("Ism kiritilmagаn", 'error');
      const subjects = [...document.querySelectorAll('.t-subj:checked')].map((x) => x.value);
      const classesSel = [...document.querySelectorAll('.t-class:checked')].map((x) => x.value);
      const body = { fullName, subjects, classes: classesSel };
      const username = document.getElementById('tUser').value.trim();
      const password = document.getElementById('tPass').value;
      try {
        if (t) {
          await API.put('/api/teachers/' + t.id, body);
          toast('Saqlanmаy');
        } else {
          if (username) body.username = username;
          if (password) body.password = password;
          const r = await API.post('/api/teachers', body);
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
    const teachers = await API.get('/api/teachers');
    const t = teachers.find((x) => x.id === id);
    if (!t) return;
    showModal(`
      <div class="modal-title">Kirish ma'lumotlari</div>
      <div class="form-group"><label>Login</label><div style="display:flex;gap:8px"><code id="tcU" style="flex:1">${escapeHtml(t.username || '')}</code><button class="btn btn-ghost btn-sm" onclick="window.appCopyTxt('tcU')">Nusxa</button></div></div>
      <div class="form-group"><label>Parol</label><div class="hint">Eski parolni ko'rish mumkin emas. "Yangi parol" tugmasi yangisini yaratib ko'rsatadi.</div></div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="tcRegen">Yangi parol yaratish</button>
      </div>`);
    document.getElementById('tcRegen').addEventListener('click', async () => {
      try {
        const r = await API.post('/api/teachers/' + t.id + '/credentials', {});
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

  // ---------- FANLAR ----------
  async function renderSubjects() {
    const subs = await getSubjects();
    topbarActions.innerHTML = `<div class="toolbar">
      <button class="btn btn-primary" onclick="window.appAddSubject()">+ Fan qo'shish</button>
    </div>`;

    const chips = subs.map((s, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid rgba(212,175,55,.25);border-radius:10px;margin-bottom:8px">
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
  window.appCloseModal = closeModal;
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
  window.appMarkAllPresent = () => markAllPresent();
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
  window.appCopyPc = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.value || el.textContent.trim()).then(() => toast('Nusxalandi'));
  };

  let _setAttInProgress = false;

  // start
initContact('contactLinks');
  initContact('contactTop');
  navigateTo('dashboard');
})();