(function () {
  if (API.getRole() !== 'parent') {
    goLogin();
    return;
  }

  document.getElementById('userInfo').textContent = '👤 ' + API.getFullName();

  const content = document.getElementById('content');
  const pageTitle = document.getElementById('pageTitle');

  let data = null;
  let section = 'overview';

  const TITLES = {
    overview: 'Umumiy holat',
    student: 'Farzand ma\'lumotlari',
    grades: 'Baholar',
    attendance: 'Davomat',
    schedule: 'Dars jadvali',
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
      if (btn.dataset.section === 'chat') {
        window.CHAT.open();
        return;
      }
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
      else if (section === 'student') renderStudent();
      else if (section === 'grades') renderGrades();
      else if (section === 'attendance') renderAttendance();
      else if (section === 'schedule') await renderSchedule();
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
        ${(s.photoUrl || s.photo) ? `<img class="avatar" src="${escapeHtml(s.photoUrl || s.photo)}" alt="foto" loading="lazy">` : `<span class="avatar">${escapeHtml((s.lastName + s.firstName).slice(0, 2))}</span>`}
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
              <div class="progress"><div style="width:${pct}%;background:${sa.avg >= 4 ? '#d4af37' : sa.avg >= 3 ? '#b8922e' : '#dc2626'}"></div></div>
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

  function renderStudent() {
    const s = data.student;
    const photoHtml = (s.photoUrl || s.photo)
      ? '<img class="avatar" style="width:84px;height:84px;border-radius:50%;object-fit:cover" src="' + escapeHtml(s.photoUrl || s.photo) + '" alt="foto">'
      : '<span class="avatar" style="width:84px;height:84px;border-radius:50%;font-size:30px">' + escapeHtml((s.lastName + s.firstName).slice(0, 2)) + '</span>';

    content.innerHTML = `${hero()}
      <div class="panel">
        <div class="panel-header"><h3>Farzand ma'lumotlari</h3><span class="badge badge-blue">O'zingiz tahrirlaysiz</span></div>
        <div class="panel-body">

          <div style="display:flex;align-items:center;gap:18px;margin-bottom:20px;flex-wrap:wrap">
            <div id="stuPhoto" style="flex:none">${photoHtml}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label class="btn btn-outline btn-sm" style="cursor:pointer">Rasm yuklash
                <input type="file" id="stuPhotoInput" accept="image/*" style="display:none">
              </label>
              ${(s.photoUrl || s.photo) ? '<button class="btn btn-danger btn-sm" id="stuPhotoRemove">Rasmdan olib tashlash</button>' : ''}
              <span class="sub" style="font-size:12px">JPG/PNG, rasm avtomatik kichraytiriladi</span>
            </div>
          </div>

          <div class="form-grid">
            <div><label class="toolbar-label">Familiya *</label><input type="text" id="stLastName" value="${escapeHtml(s.lastName)}" placeholder="Familiya"></div>
            <div><label class="toolbar-label">Ism *</label><input type="text" id="stFirstName" value="${escapeHtml(s.firstName)}" placeholder="Ism"></div>
            <div class="full"><label class="toolbar-label">Otasining ismi</label><input type="text" id="stPatronymic" value="${escapeHtml(s.patronymic || '')}" placeholder="Otasining ismi"></div>
            <div><label class="toolbar-label">Tug'ilgan sana</label><input type="date" id="stBirthDate" value="${escapeHtml(s.birthDate || '')}"></div>
            <div><label class="toolbar-label">Telefon raqam</label><input type="tel" id="stPhone" value="${escapeHtml(s.parentPhone || '')}" placeholder="+998 90 123 45 67"></div>
            <div class="full"><label class="toolbar-label">Manzil</label><input type="text" id="stAddress" value="${escapeHtml(s.address || '')}" placeholder="Yashash manzili"></div>
            <div class="full"><label class="toolbar-label">Ota-onaning F.I.Sh</label><input type="text" id="stParentName" value="${escapeHtml(s.parentName || '')}" placeholder="Ota-ona F.I.Sh"></div>
          </div>

          <div class="modal-actions" style="margin-top:20px">
            <button class="btn btn-primary" id="stSave">Saqlash</button>
          </div>
        </div>
      </div>
    `;

    const preview = document.getElementById('stuPhoto');
    const fileInp = document.getElementById('stuPhotoInput');
    if (fileInp) {
      fileInp.addEventListener('change', async () => {
        if (!fileInp.files || !fileInp.files[0]) return;
        const btn = fileInp.closest('label');
        if (btn) btn.disabled = true;
        try {
          const compressed = await compressImage(fileInp.files[0], 400, 533, 0.7);
          const fd = new FormData();
          fd.append('photo', compressed);
          const r = await API.post('/api/parent/student/photo', fd, true);
          data.student.photoUrl = r.photoUrl;
          data.student.photo = r.photoUrl;
          preview.innerHTML = '<img class="avatar" style="width:84px;height:84px;border-radius:50%;object-fit:cover" src="' + escapeHtml(r.photoUrl) + '?v=' + Date.now() + '" alt="foto">';
          if (!document.getElementById('stuPhotoRemove')) {
            const wrap = preview.parentElement.querySelector('div');
            const rm = document.createElement('button');
            rm.className = 'btn btn-danger btn-sm';
            rm.id = 'stuPhotoRemove';
            rm.textContent = 'Rasmdan olib tashlash';
            wrap.appendChild(rm);
            rm.addEventListener('click', removePhoto);
          }
          toastSuccess('Rasm saqlandi');
        } catch (e) {
          toastError(e.message || 'Rasm yuklashda xatolik');
        } finally {
          if (btn) btn.disabled = false;
          fileInp.value = '';
        }
      });
    }
    document.getElementById('stSave').addEventListener('click', saveStudent);
    const rm = document.getElementById('stuPhotoRemove');
    if (rm) rm.addEventListener('click', removePhoto);
  }

  async function saveStudent() {
    const body = {
      lastName: document.getElementById('stLastName').value,
      firstName: document.getElementById('stFirstName').value,
      patronymic: document.getElementById('stPatronymic').value,
      birthDate: document.getElementById('stBirthDate').value || null,
      parentPhone: document.getElementById('stPhone').value,
      address: document.getElementById('stAddress').value,
      parentName: document.getElementById('stParentName').value,
    };
    const btn = document.getElementById('stSave');
    btn.disabled = true;
    try {
      const upd = await API.put('/api/parent/student', body);
      data.student = { ...data.student, ...upd };
      localStorage.setItem('fullName', upd.parentName || API.getFullName());
      document.getElementById('userInfo').textContent = '👤 ' + (upd.parentName || API.getFullName());
      toastSuccess('Ma\'lumotlar saqlandi');
      renderStudent();
    } catch (e) {
      toastError(e.message || 'Saqlashda xatolik');
      btn.disabled = false;
    }
  }

  async function removePhoto() {
    try {
      await API.del('/api/parent/student/photo');
      data.student.photo = null;
      data.student.photoUrl = null;
      toastSuccess('Rasm o\'chirildi');
      renderStudent();
    } catch (e) {
      toastError(e.message || 'Xatolik');
    }
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

  // ---------- DARS JADVALI (ota-ona uchun, faqat ko'rish) ----------
  const SHORT_DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

  async function renderSchedule() {
    const cls = (data.student && data.student.className) || '';
    if (!cls) {
      content.innerHTML = `${hero()}<div class="panel"><div class="empty-state"><h4>Farzandingizga sinf biriktirilmagan</h4></div></div>`;
      return;
    }
    let d;
    try {
      d = await API.get('/api/schedule?className=' + encodeURIComponent(cls));
    } catch (e) {
      content.innerHTML = `${hero()}<div class="panel"><div class="empty-state"><h4>Dars jadvali hali kiritilmagan</h4></div></div>`;
      return;
    }
    const map = {};
    d.slots.forEach((s) => { map[s.dayOfWeek + '|' + s.lessonNo] = s; });

    const head = '<th class="snum">T/r</th>' + Array.from({ length: d.days }, (_, i) =>
      `<th class="sday">${SHORT_DAYS[i]}<div class="sdayfull">${escapeHtml(d.dayNames[i])}</div></th>`).join('');
    let rows = '';
    for (let no = 1; no <= d.lessonCount; no++) {
      rows += '<tr><td class="snum">' + no + '</td>';
      for (let day = 1; day <= d.days; day++) {
        const s = map[day + '|' + no];
        rows += `<td class="scell">${s && s.subject
          ? `<div class="ssubject">${escapeHtml(s.subject)}</div>`
          : '<div class="sempty">—</div>'}</td>`;
      }
      rows += '</tr>';
    }

    content.innerHTML = `${hero()}
      <div class="panel">
        <div class="panel-header"><h3>Dars jadvali — ${escapeHtml(cls)} sinf</h3><span class="badge badge-blue">${d.days} kun</span></div>
        <div class="sched-wrap"><table class="sched"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
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
      const avatar = (t.photoUrl || t.photo)
        ? '<img class="avatar" style="width:56px;height:56px;border-radius:50%;object-fit:cover" src="' + escapeHtml(t.photoUrl || t.photo) + '" alt="foto" loading="lazy">'
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
    goLogin();
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
