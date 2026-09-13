const API = {
  getToken() {
    return localStorage.getItem('token');
  },

  setToken(token) {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },

  getRole() {
    return localStorage.getItem('role');
  },

  getFullName() {
    return localStorage.getItem('fullName') || '';
  },

  async request(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      window.location.href = '/login.html';
      throw new Error('Session tugagan');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Server xatosi');
    return data;
  },

  get(url) {
    return this.request(url);
  },

  post(url, body, isForm = false) {
    return this.request(url, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body || {}),
    });
  },

  put(url, body) {
    return this.request(url, { method: 'PUT', body: JSON.stringify(body || {}) });
  },

  del(url) {
    return this.request(url, { method: 'DELETE' });
  },
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function avatarHtml(student) {
  const initials = ((student.lastName || '') + (student.firstName || '')).slice(0, 2).toUpperCase();
  if (student.photo) {
    return `<img class="avatar" src="${escapeHtml(student.photo)}" alt="foto">`;
  }
  return `<span class="avatar">${escapeHtml(initials)}</span>`;
}

const ICONS = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  students: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  payments: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  attendance: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>',
  grades: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7"/><path d="M9 11h5"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

const SUBJECTS = [
  'Matematika', 'Ona tili', 'Adabiyot', 'Fizika', 'Kimyo',
  'Biologiya', 'Tarix', 'Geografiya', 'Ingliz tili', 'Rus tili',
  'Informatika', 'Jismoniy tarbiya', 'Chizmachilik', 'Musiqa', 'Tasviriy san\'at',
];

function monthNames() {
  return ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
}

function renderMonthsSelect(selected) {
  const names = monthNames();
  return names.map((m, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${m}</option>`).join('');
}

function renderYearsSelect() {
  const y = new Date().getFullYear();
  return `<option>${y}</option><option>${y + 1}</option>`;
}