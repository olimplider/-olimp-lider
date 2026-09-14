(function () {
  if (API.getRole() !== 'parent') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('userInfo').textContent = '👤 ' + API.getFullName();

  const content = document.getElementById('content');
  const pageTitle = document.getElementById('pageTitle');

  let data = null;
  let section = 'overview';

  const TITLES = {
    overview: 'Umumiy holat',
    grades: 'Baholar',
    attendance: 'Davomat',
    diary: 'Kundalik',
    payments: 'To\'lovlar',
    teachers: 'O\'qituvchilar',
  };

  async function loadData(force = false) {
    if (data && !force) return data;
    data = await API.get('/api/parent');
    return data;
  }

  document.querySelectorAll('.nav-item[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item[data-section]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      section = btn.dataset.section;
      pageTitle.textContent = TITLES[section];
      render();
    });
  });

  async function render() {
    content.innerHTML = '<div class="empty-state">Yuklanmoqda...</div>';
    try {
      await loadData();
      if (section === 'overview') renderOverview();
      else if (section === 'grades') renderGrades();
      else if (section === 'attendance') renderAttendance();
      else if (section === 'diary') renderDiary();
      else if (section === 'teachers') renderTeachers();
      else if (section === 'payments') renderPayments();
    } catch (e) {
      content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
    }
  }

  function hero() {
    const s = data.student;
    return `
      <div class="parent-hero">
        ${s.photo ? `<img class="avatar" src="${escapeHtml(s.photo)}" alt="foto">` : `<span class="avatar">${escapeHtml((s.lastName + s.firstName).slice(0, 2))}</span>`}
        <div>
          <h2>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</h2>
          <div class="meta">${escapeHtml(s.patronymic)} • ${escapeHtml(s.className)} sinfi</div>
          <div class="meta">${escapeHtml(s.parentName)} • ${escapeHtml(s.parentPhone)}</div>
        </div>
        <div class="avg-circle">${data.avgGrade ? data.avgGrade.toFixed(2) : '—'}<span>o'rt. baho</span></div>
      </div>`;
  }

  function renderOverview() {
    const s = data.student;
    const att = data.attendance;
    const lastMonth = new Date();
    const totalDays = att.length;
    const presentDays = att.filter((a) => a.status === 'present').length;
    const absentDays = att.filter((a) => a.status === 'absent').length;
    const lateDays = att.filter((a) => a.status === 'late').length;

    const month = lastMonth.getMonth() + 1;
    const year = lastMonth.getFullYear();
    const pay = data.payments.find((p) => p.month === month && p.year === year);
    const paid = pay ? pay.paid : false;

    content.innerHTML = `
      ${hero()}
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon green">✓</div><div><div class="stat-value">${presentDays}</div><div class="stat-label">Kelgan kunlari</div></div></div>
        <div class="stat-card"><div class="stat-icon red">✗</div><div><div class="stat-value">${absentDays}</div><div class="stat-label">Kelmagan kunlari</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">⏰</div><div><div class="stat-value">${lateDays}</div><div class="stat-label">Kechikkan kunlari</div></div></div>
        <div class="stat-card"><div class="stat-icon ${paid ? 'green' : 'red'}">${ICONS.payments}</div><div><div class="stat-value">${paid ? 'To\'langan' : 'To\'lanmagan'}</div><div class="stat-label">${monthNames()[month - 1]} oyi uchun</div></div></div>
      </div>
      <div class="panel">
        <div class="panel-header"><h3>Fanlar bo'yicha o'rtacha</h3></div>
        <div class="panel-body">
          ${data.subjectAverages.length ? data.subjectAverages.map((sa) => {
            const pct = (sa.avg / 5) * 100;
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="min-width:130px;font-size:14px"><b>${escapeHtml(sa.subject)}</b><span class="muted"> — ${sa.count} baho</span></div>
              <div class="progress"><div style="width:${pct}%;background:${sa.avg >= 4 ? '#16a34a' : sa.avg >= 3 ? '#d97706' : '#dc2626'}"></div></div>
              <div style="min-width:40px;text-align:right;font-weight:700">${sa.avg.toFixed(2)}</div>
            </div>`;
          }).join('') : '<p class="empty-note">Hali baholar kiritilmagan.</p>'}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Sog'liq holati</h3></div>
        <div class="panel-body">
          <div class="health-row">
            <span class="badge ${data.medical && data.medical.hasForm ? (data.medical.status === 'expired' ? 'badge-red' : 'badge-green') : 'badge-red'}">
              ${data.medical && data.medical.hasForm ? (data.medical.status === 'expired' ? '086 muddati o\'tgan' : '086-forma yaroqli') : '086-forma yo\'q'}
            </span>
            ${data.medical && data.medical.expiresAt ? `<span class="muted">Amal qiladi: ${escapeHtml(data.medical.expiresAt)}</span>` : '<span class="muted">6 oyga amal qiladi</span>'}
          </div>
          <div class="health-row">
            ${data.todayHealth
              ? (data.todayHealth.healthOk
                  ? '<span class="badge badge-green">✓ Bugun sog\'lom</span>'
                  : '<span class="badge badge-red">✗ Bugun holatda muammo bor</span>')
              : '<span class="badge badge-blue">… Bugun tekshiruv yozilmagan</span>'}
            ${data.todayHealth && data.todayHealth.note ? '<span class="muted">— ' + escapeHtml(data.todayHealth.note) + '</span>' : ''}
          </div>
          ${data.healthHistory && data.healthHistory.length ? `
            <div class="sub" style="margin-top:8px">So'nggi tekshiruvlar (${data.healthHistory.length} ta):</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
              ${data.healthHistory.slice(0, 14).map((h) => `<span class="badge ${h.healthOk ? 'badge-green' : 'badge-red'}" style="margin:0">${escapeHtml(h.date)} ${h.healthOk ? '✓' : '✗'}</span>`).join('')}
            </div>` : ''}
        </div>
      </div>
    `;
  }

  function renderGrades() {
    const bySubject = {};
    data.grades.forEach((g) => {
      if (!bySubject[g.subject]) bySubject[g.subject] = [];
      bySubject[g.subject].push(g);
    });

    const cards = Object.keys(bySubject).map((subj) => {
      const arr = bySubject[subj];
      const avg = (arr.reduce((a, b) => a + b.score, 0) / arr.length).toFixed(2);
      return `<div class="panel">
        <div class="panel-header"><h3>${escapeHtml(subj)}</h3><span class="badge badge-blue">O'rtacha: ${avg}</span></div>
        <div class="panel-body">
          ${arr.map((g) => `<span class="badge ${g.score >= 4 ? 'badge-green' : g.score === 3 ? 'badge-amber' : 'badge-red'}" style="margin:3px">${escapeHtml(g.date)}: ${g.score}</span>`).join('') || '<span class="muted">Baho yo\'q</span>'}
        </div>
      </div>`;
    }).join('');

    content.innerHTML = `${hero()}${cards || '<div class="panel"><div class="empty-state"><h4>Baholar yo\'q</h4></div></div>'}`;
  }

  function renderAttendance() {
    const rows = data.attendance.slice().sort((a, b) => b.date.localeCompare(a.date)).map((a) => {
      const badges = { present: 'badge-green', absent: 'badge-red', late: 'badge-amber' };
      const texts = { present: '✓ Keldi', absent: '✗ Kelmadi', late: '⏰ Kechikdi' };
      return `<tr><td>${escapeHtml(a.date)}</td><td><span class="badge ${badges[a.status]}">${texts[a.status]}</span></td></tr>`;
    }).join('');

    content.innerHTML = `${hero()}
      <div class="panel"><div class="panel-header"><h3>Davomat yozuvlari</h3><span class="muted">${data.attendance.length} ta yozuv</span></div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>Sana</th><th>Holat</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="panel-body"><p class="empty-note">Hali davomat yozuvlari yo'q.</p></div>`}</div>`;
  }

  function renderDiary() {
    const W = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
    const days = (data.diary || []).map((d) => {
      const dt = new Date(d.date + 'T00:00:00');
      const weekday = W[dt.getDay()];
      const attBadge = d.attendance ? `<span class="badge ${d.attendance === 'present' ? 'badge-green' : d.attendance === 'late' ? 'badge-amber' : 'badge-red'}">${d.attendance === 'present' ? '✓ Keldi' : d.attendance === 'late' ? '⏰ Kechikdi' : '✗ Kelmadi'}</span>` : '';
      const entries = d.entries.map((en) => `
        <div class="diary-entry">
          <span class="diary-subj">${escapeHtml(en.subject)}</span>
          <span class="diary-score ${en.score >= 4 ? 'g' : en.score === 3 ? 'a' : 'r'}">${en.score}</span>
        </div>`).join('');
      const note = entries || '<span class="muted">Baho kiritilmagan</span>';
      return `
        <div class="panel diary-day">
          <div class="panel-header"><h3>${escapeHtml(d.date)} <span class="muted" style="text-transform:none;font-weight:400">— ${weekday}</span></h3>${attBadge}</div>
          <div class="panel-body diary-body">${note}</div>
        </div>`;
    }).join('');

    content.innerHTML = `${hero()}
      ${days || '<div class="panel"><div class="empty-state"><h4>Hali kunlik yozuvlar yo\'q</h4><p class="muted">O\'qituvchi baho yoki davomat kiritganda, kundalik shaklida shu yerda ko\'rinadi.</p></div></div>'}`;
  }

  function renderTeachers() {
    const list = data.teachers || [];
    const cards = list.map((t) => {
      const avatar = t.photo
        ? '<img class="avatar" style="width:56px;height:56px;border-radius:50%;object-fit:cover" src="' + escapeHtml(t.photo) + '" alt="foto">'
        : '<span class="avatar" style="width:56px;height:56px;border-radius:50%">' + escapeHtml((t.fullName.split(' ').map((x) => x[0]).join('') || 'T').slice(0, 2)) + '</span>';
      return `
        <div class="panel">
          <div style="display:flex;gap:14px;align-items:center">
            ${avatar}
            <div>
              <div style="font-weight:700;font-size:15px">${escapeHtml(t.fullName)}</div>
              <div class="sub">${escapeHtml(t.position || 'O\'qituvchi')}</div>
            </div>
          </div>
          <div class="panel-body" style="margin-top:6px">
            <div class="sub" style="margin-bottom:6px">Dars o'tadigan fanlari:</div>
            ${(t.subjects || []).map((s) => '<span class="badge badge-blue" style="margin:2px">' + escapeHtml(s) + '</span>').join('') || '<span class="muted">Fan biriktirilmagan</span>'}
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `${hero()}
      <div class="panel"><div class="panel-header"><h3>${escapeHtml(data.student.className)} sinf o'qituvchilari</h3><span class="badge badge-blue">${list.length} ta</span></div></div>
      ${list.length ? cards : '<div class="panel"><div class="empty-state"><h4>Hali ma\'lumot yo\'q</h4><p class="muted">O\'qituvchilar sinfga biriktirilganda shu yerda ko\'rinadi.</p></div></div>'}`;
  }

  function renderPayments() {
    const nowYear = new Date().getFullYear();
    const years = [nowYear - 1, nowYear, nowYear + 1];
    rows = [];
    years.forEach((y) => {
      for (let m = 1; m <= 12; m++) {
        const p = data.payments.find((x) => x.month === m && x.year === y);
        const paid = p ? p.paid : false;
        rows.push(`<tr><td>${monthNames()[m - 1]} ${y}</td><td>${paid ? '<span class="badge badge-green">✓ To\'langan</span>' : '<span class="badge badge-red">✗ To\'lanmagan</span>'}</td></tr>`);
      }
    });

    let paidCount = 0;
    const today = new Date();
    data.payments.forEach((p) => {
      if (p.paid && p.year === today.getFullYear()) paidCount++;
    });

    content.innerHTML = `${hero()}
      <div class="panel"><div class="panel-header"><h3>To'lovlar tarixi</h3><span class="badge badge-blue">${nowYear}: ${paidCount} oy to'langan</span></div>
      <div class="table-wrap"><table><thead><tr><th>Oy</th><th>Holat</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('fullName');
    window.location.href = '/login.html';
  });

  let rows = [];
  window.appRefresh = async () => {
    const y = window.scrollY;
    await render();
    if (y) window.scrollTo(0, y);
  };
  initContact('contactLinks');
  initContact('contactTop');
  initClock('clock');
  render();
})();