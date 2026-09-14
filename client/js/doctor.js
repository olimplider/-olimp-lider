(function () {
  if (API.getRole() !== 'doctor') {
    window.location.href = '/login.html';
    return;
  }

  const content = document.getElementById('content');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const pageTitle = document.getElementById('pageTitle');
  const topbarActions = document.getElementById('topbarActions');

  let me = null;
  let classFilter = '';
  let healthDate = todayStr();

  const TITLES = {
    dashboard: 'Dashbord',
    medical: '086-formalar (6 oyga amal qiladi)',
    health: 'Kunlik sog\'liq tekshiruvi',
  };

  function addMonthsStr(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

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

  function personAvatar(p, size) {
    const initials = ((p.fullName || '').split(' ').map((x) => x[0]).join('') || 'DR').slice(0, 2).toUpperCase();
    const img = p.photo
      ? '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + escapeHtml(p.photo) + '" alt="foto">'
      : '<span class="avatar" style="width:64px;height:64px;font-size:22px;border-radius:50%">' + escapeHtml(initials) + '</span>';
    return img;
  }

  async function loadMe() {
    if (!me) me = await API.get('/api/doctor/me');
    return me;
  }

  async function refreshUserInfo() {
    const d = await loadMe();
    const avatar = d.doctor.photo
      ? '<img class="avatar" style="width:38px;height:38px;border-radius:50%;object-fit:cover" src="' + escapeHtml(d.doctor.photo) + '" alt="foto">'
      : '<span class="avatar" style="width:38px;height:38px;font-size:14px;border-radius:50%">' + escapeHtml((d.doctor.fullName || 'DR').slice(0, 2).toUpperCase()) + '</span>';
    document.getElementById('userInfo').innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">' + avatar +
      '<div><div>' + escapeHtml(d.doctor.fullName) + '</div><div class="sub" style="font-weight:400">' + escapeHtml(d.doctor.position || 'Shifokor') + '</div></div></div>';
  }

  async function loadStudents(date) {
    return API.get('/api/doctor/students?date=' + encodeURIComponent(date || todayStr()));
  }

  function classOptionsList(students) {
    const classes = [...new Set(students.map((s) => s.className))].sort((a, b) => a.localeCompare(b, 'uz'));
    return '<select id="dcFilter"><option value="">Barcha sinflar</option>' + classes.map((c) => '<option ' + (classFilter === c ? 'selected' : '') + '>' + escapeHtml(c) + '</option>').join('') + '</select>';
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
      else if (section === 'medical') await renderMedical();
      else if (section === 'health') await renderHealth();
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  // ---------- DASHBORD ----------
  async function renderDashboard() {
    const d = await loadMe();
    const students = await loadStudents(todayStr());

    const total = students.length;
    const checked = students.filter((s) => s.health).length;
    const issues = students.filter((s) => s.health && !s.health.healthOk).length;
    const expired086 = students.filter((s) => s.medical && s.medical.status === 'expired').length;
    const has086 = students.filter((s) => s.medical && s.medical.hasForm).length;

    content.innerHTML = `
      <div class="panel profile-card">
        <div class="profile-avatar">${personAvatar(d.doctor)}</div>
        <div class="profile-info">
          <h3>${escapeHtml(d.doctor.fullName)}</h3>
          <div class="sub">${escapeHtml(d.doctor.position || 'Shifokor')}</div>
          <div class="sub">Login: ${escapeHtml(d.user.username)}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-outline btn-sm" onclick="window.appProfileEdit()">Profilni tahrirlash</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon green">✓</div><div><div class="stat-value">${checked}</div><div class="stat-label">Bugun tekshirildi</div></div></div>
        <div class="stat-card"><div class="stat-icon red">✗</div><div><div class="stat-value">${issues}</div><div class="stat-label">Muammo bor</div></div></div>
        <div class="stat-card"><div class="stat-icon purple">086</div><div><div class="stat-value">${has086}</div><div class="stat-label">086-forma bor</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">!</div><div><div class="stat-value">${expired086}</div><div class="stat-label">086 muddati o'tgan</div></div></div>
        <div class="stat-card"><div class="stat-icon blue">${ICONS.students}</div><div><div class="stat-value">${total}</div><div class="stat-label">Jami o'quvchilar</div></div></div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Bugungi tekshiruv holati</h3><button class="btn btn-primary btn-sm" onclick="window.appNav('health')">Boshlash</button></div>
        <div class="panel-body">
          ${issues ? '<div class="alert-error" style="display:block;margin-bottom:10px">Diqqat! <b>Kunlik tekshiruvda muammo aniqlangan:</b></div>' : ''}
          ${students.filter((s) => s.health && !s.health.healthOk).map((s) => `
            <div class="health-row">
              <span class="badge badge-red">✗ Muammo</span>
              <b>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</b>
              <span class="muted">${escapeHtml(s.className)}</span>
              ${s.health.note ? '<span class="muted">— ' + escapeHtml(s.health.note) + '</span>' : ''}
            </div>`).join('') || '<p class="empty-note">Bugun muammo qayd etilmagan.</p>'}
        </div>
      </div>`;
  }

  // ---------- 086-FORMALAR ----------
  async function renderMedical() {
    const students = await loadStudents(todayStr());

    topbarActions.innerHTML = `<div class="toolbar">${classOptionsList(students)}</div>`;
    const filterEl = document.getElementById('dcFilter');
    if (filterEl) filterEl.addEventListener('change', (e) => { classFilter = e.target.value; renderMedical(); });

    const list = students.filter((s) => !classFilter || s.className === classFilter);
    const today = todayStr();

    const rows = list.map((s) => {
      const m = s.medical || { hasForm: false, status: 'none', expiresAt: null };
      const statusBadge = !m.hasForm
        ? '<span class="badge badge-red">086 yo\'q</span>'
        : m.status === 'expired'
          ? '<span class="badge badge-red">Muddati o\'tgan</span>'
          : '<span class="badge badge-green">Yaroqli</span>';
      const expiry = m.hasForm && m.expiresAt
        ? '<span class="sub">Amal qiladi: ' + escapeHtml(m.expiresAt) + (m.status === 'expired' ? ' (o\'tgan!)' : '') + '</span>'
        : '<span class="sub">6 oydan so\'ng muddati tugaydi</span>';
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td>${statusBadge}${m.hasForm ? '' : ''}</td>
        <td>${expiry}</td>
        <td class="actions">
          ${!m.hasForm || m.status === 'expired'
            ? `<button class="btn btn-outline btn-sm" onclick="window.app086On(${s.id})">086 belgilash</button>`
            : `<button class="btn btn-outline btn-sm" onclick="window.app086Edit(${s.id})">Muddatni uzaytirish</button>`}
          ${m.hasForm ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.app086Off(${s.id})">Olib tashlash</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    content.innerHTML = `<div class="panel"><div class="panel-header"><h3>086-forma holati</h3><span class="badge badge-blue">${today}</span></div>
      <div class="hint" style="padding:12px 14px 0">086-forma berilganda u <b>6 oyga</b> amal qiladi. Muddati o'tgan formani qayta belgilash kifoya.</div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>O'quvchi</th><th>Holat</th><th>Muddati</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="panel-body"><p class="empty-note">Bu sinfda o\'quvchi yo\'q.</p></div>'}
    </div>`;
  }

  async function app086On(id, expiresAt) {
    try {
      await API.post('/api/doctor/medical', { studentId: id, form086: true, expiresAt: expiresAt || undefined });
      toast('086-forma belgilandi (6 oy)');
      await renderMedical();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function app086Edit(id) {
    showModal(`
      <div class="modal-title">086-forma muddatini uzaytirish</div>
      <div class="form-group"><label>Yangi amal qilish sanasi</label><input type="date" id="medExpiry" class="date-pick" value="${addMonthsStr(6)}"></div>
      <div class="hint">Odatiy holatda 6 oy avtomatik qo'yiladi. Boshqa sanani tanlashingiz mumkin.</div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="medSave">Saqlash</button>
      </div>`);
    document.getElementById('medSave').addEventListener('click', async () => {
      await app086On(id, document.getElementById('medExpiry').value);
      closeModal();
    });
  }

  async function app086Off(id) {
    if (!confirm('086-forma holati olib tashlansinmi?')) return;
    try {
      await API.post('/api/doctor/medical', { studentId: id, form086: false });
      toast('086-forma olib tashlandi');
      await renderMedical();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- KUNLIK TEKSHIRUV ----------
  async function renderHealth() {
    const students = await loadStudents(healthDate);

    topbarActions.innerHTML = `<div class="toolbar">
      <span class="toolbar-label">Sana:</span>
      <input type="date" id="hDate" class="date-pick" value="${healthDate}">
      ${classOptionsList(students)}
    </div>`;

    document.getElementById('hDate').addEventListener('change', (e) => { healthDate = e.target.value; renderHealth(); });
    const filterEl = document.getElementById('dcFilter');
    if (filterEl) filterEl.addEventListener('change', (e) => { classFilter = e.target.value; renderHealth(); });

    const list = students.filter((s) => !classFilter || s.className === classFilter);
    const checkedCount = list.filter((s) => s.health).length;
    const issueCount = list.filter((s) => s.health && !s.health.healthOk).length;

    const rows = list.map((s) => {
      const h = s.health;
      return `<tr>
        <td><div class="student-cell">${avatarHtml(s)}<div><div class="name">${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</div><div class="sub">${escapeHtml(s.className)}</div></div></div></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm ${h && h.healthOk ? 'btn-primary' : 'btn-outline'}" onclick="window.appHealth(${s.id},'ok')">✓ Sog'lom</button>
            <button class="btn btn-sm ${h && !h.healthOk ? 'btn-danger' : 'btn-outline'}" onclick="window.appHealth(${s.id},'issue')">✗ Muammo</button>
            ${h ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.appHealthClear(${s.id})" title="Belgini olib tashlash">✕</button>` : ''}
          </div>
          ${h && h.note ? '<div class="sub" style="margin-top:6px">Izoh: ' + escapeHtml(h.note) + '</div>' : ''}
        </td>
      </tr>`;
    }).join('');

    content.innerHTML = `<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="stat-card"><div class="stat-icon green">✓</div><div><div class="stat-value">${checkedCount}</div><div class="stat-label">Tekshirildi</div></div></div>
        <div class="stat-card"><div class="stat-icon red">✗</div><div><div class="stat-value">${issueCount}</div><div class="stat-label">Muammo bor</div></div></div>
        <div class="stat-card"><div class="stat-icon blue">…</div><div><div class="stat-value">${list.length - checkedCount}</div><div class="stat-label">Hali yo'q</div></div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>O'quvchilar</h3><span class="badge badge-blue">${list.length} ta</span></div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>O'quvchi</th><th>Holat</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="panel-body"><p class="empty-note">Bu sinfda o\'quvchi yo\'q.</p></div>'}
      </div>`;
  }

  async function appHealth(id, val) {
    if (!id) return;
    if (val === 'issue') {
      showModal(`
        <div class="modal-title">Sog'liqda muammo qayd etish</div>
        <div class="form-group"><label>Izoh (ixtiyoriy)</label><input id="hzNote" placeholder="masalan: bosh og'rig'i, harorat..."></div>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
          <button class="btn btn-primary" id="hzSave">Saqlash</button>
        </div>`);
      document.getElementById('hzSave').addEventListener('click', async () => {
        try {
          await API.post('/api/doctor/healthchecks', { studentId: id, date: healthDate, healthOk: false, note: document.getElementById('hzNote').value.trim() });
          closeModal();
          toast('Muammo qayd etildi');
          await renderHealth();
        } catch (e) {
          toast(e.message, 'error');
          closeModal();
        }
      });
    } else {
      try {
        await API.post('/api/doctor/healthchecks', { studentId: id, date: healthDate, healthOk: true, note: '' });
        toast('Sog\'lom deb belgilandi');
        await renderHealth();
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  }

  async function appHealthClear(id) {
    try {
      await API.del('/api/doctor/healthchecks?studentId=' + id + '&date=' + encodeURIComponent(healthDate));
      toast('Belgi olib tashlandi');
      await renderHealth();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // ---------- PROFIL ----------
  function appProfileEdit() {
    const d = me;
    if (!d) return;
    showModal(`
      <div class="modal-title">Profilni tahrirlash</div>
      <div class="form-group"><label>F.I.Sh.</label><input id="pName" value="${escapeHtml(d.doctor.fullName)}" disabled></div>
      <div class="form-group"><label>Lavozim</label><input id="pPosition" value="${escapeHtml(d.doctor.position || '')}" placeholder="masalan: Tibbiy xodim"></div>
      <div class="form-group"><label>Rasm</label><div style="display:flex;align-items:center;gap:12px">
        <div id="pPhotoPrev">${personAvatar(d.doctor)}</div>
        <input type="file" id="pPhotoInp" accept="image/*" style="font-size:13px">
      </div></div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="window.appCloseModal()">Bekor</button>
        <button class="btn btn-primary" id="pSave">Saqlash</button>
      </div>`);

    const inp = document.getElementById('pPhotoInp');
    if (inp) {
      inp.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => { document.getElementById('pPhotoPrev').innerHTML = '<img class="avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover" src="' + ev.target.result + '">'; };
        r.readAsDataURL(f);
      });
    }

    document.getElementById('pSave').addEventListener('click', async () => {
      const btn = document.getElementById('pSave');
      btn.disabled = true;
      try {
        const position = document.getElementById('pPosition').value.trim();
        await API.put('/api/doctor/me', { position });
        const file = inp ? inp.files[0] : null;
        if (file) {
          const fd = new FormData();
          fd.append('photo', file);
          await API.post('/api/doctor/photo', fd, true);
        }
        me = null;
        await loadMe();
        await refreshUserInfo();
        closeModal();
        toast('Profil saqlandi');
        await renderDashboard();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
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
  window.appRefresh = async () => {
    const btn = document.querySelector('.nav-item[data-section].active');
    if (!btn) return;
    const y = window.scrollY;
    await navigate(btn.dataset.section);
    if (y) window.scrollTo(0, y);
  };
  window.appProfileEdit = () => appProfileEdit();
  window.app086On = (id) => app086On(id);
  window.app086Off = (id) => app086Off(id);
  window.app086Edit = (id) => app086Edit(id);
  window.appHealth = (id, val) => appHealth(id, val);
  window.appHealthClear = (id) => appHealthClear(id);

  // start
  initContact('contactLinks');
  initContact('contactTop');
  initClock('clock');
  refreshUserInfo().then(() => navigate('dashboard'));
})();