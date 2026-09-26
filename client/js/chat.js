(function () {
  if (typeof API === 'undefined') return;
  const role = API.getRole();
  if (!role) return;

  let active = false;
  let currentWith = null;
  let pollTimer = null;
  let unreadTimer = null;
  let contactsCache = null;
  let contactsMap = {};

  const navBtn = document.querySelector('.nav-item[data-section="chat"]');
  const content = document.getElementById('content');
  const pageTitle = document.getElementById('pageTitle');
  if (!navBtn || !content) return;

  const chatTitle = 'Xabarlar';

  window.CHAT = {
    isActive() {
      return active;
    },
    open() {
      active = true;
      currentWith = null;
      pageTitle.textContent = chatTitle;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      navBtn.classList.add('active');
      startUnreadPoll();
      renderList();
    },
    close() {
      active = false;
      currentWith = null;
      stopUnreadPoll();
      stopPoll();
    },
  };

  function loadContacts(force) {
    if (contactsCache && !force) return Promise.resolve(contactsCache);
    return API.get('/api/chat/contacts')
      .then((list) => {
        contactsCache = list || [];
        contactsMap = {};
        (contactsCache || []).forEach((c) => {
          contactsMap[c.id] = c;
        });
        return contactsCache;
      })
      .catch(() => {
        contactsCache = contactsCache || [];
        return contactsCache;
      });
  }

  function startUnreadPoll() {
    stopUnreadPoll();
    const tick = () => {
      API.get('/api/chat/unread')
        .then((d) => {
          updateBadge(d.count || 0);
        })
        .catch(() => {});
    };
    tick();
    unreadTimer = setInterval(tick, 20000);
  }

  function stopUnreadPoll() {
    if (unreadTimer) clearInterval(unreadTimer);
    unreadTimer = null;
  }

  function updateBadge(n) {
    let badge = navBtn.querySelector('.nav-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navBtn.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : n;
    } else if (badge) {
      badge.remove();
    }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const t = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (sameDay) return t;
    return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }) + ' ' + t;
  }

  function skeletonRows() {
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += '<div class="chat-row skeleton-pad" style="pointer-events:none;cursor:default">' +
        '<span class="skeleton skeleton-avatar"></span>' +
        '<span class="chat-row-main"><span class="skeleton skeleton-line w-60"></span><span class="skeleton skeleton-line w-80"></span></span>' +
        '</div>';
    }
    return out;
  }

  function renderList() {
    content.innerHTML = '<div class="chat-layout"><div class="chat-list" id="chatList">' + skeletonRows() + '</div>' +
      '<div class="chat-open" id="chatOpen"><div class="empty-state">Suhbatdoshni tanlang — xabarlar shu yerda ko\'rinadi.</div></div></div>';
    loadContacts()
      .then(() => API.get('/api/chat/conversations'))
      .then((convs) => {
        const seen = {};
        (convs || []).forEach((c) => {
          seen[c.user.id] = c;
        });
        const allByUser = {};
        (contactsCache || []).forEach((c) => {
          allByUser[c.id] = c;
        });
        // Suhbat bo'lmagan kontaktlar ham ro'yxatda ko'rinadi.
        const users = [];
        (convs || []).forEach((c) => {
          users.push({ conv: c, user: c.user, hasConv: true });
        });
        (contactsCache || []).forEach((c) => {
          if (!seen[c.id]) users.push({ conv: null, user: c, hasConv: false });
        });

        const rows = users.map((it) => {
          const c = it.user;
          const conv = it.conv;
          const avatar = c.avatar
            ? '<img class="avatar" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex:none" src="' + escapeHtml(c.avatar) + '" alt="" loading="lazy">'
            : '<span class="avatar" style="width:42px;height:42px;border-radius:50%;flex:none">' + escapeHtml(((c.fullName || c.label || '?').split(' ').map((x) => x[0]).join('') || 'U').slice(0, 2).toUpperCase()) + '</span>';
          const preview = conv && conv.last ? escapeHtml(conv.last.text) : 'Suhbatni boshlash';
          const when = conv && conv.last ? '<span class="chat-time">' + escapeHtml(fmtTime(conv.last.at)) + '</span>' : '';
          const unread = conv && conv.unread ? '<span class="chat-unread">' + (conv.unread > 99 ? '99+' : conv.unread) + '</span>' : '';
          const sub = '<span class="sub">' + escapeHtml(c.roleName) + ' • ' + escapeHtml(c.label) + '</span>';
          return '<button class="chat-row" data-id="' + c.id + '">' + avatar + '<span class="chat-row-main">' +
            '<span class="chat-row-head"><b>' + escapeHtml(c.fullName) + '</b>' + when + '</span>' +
            sub + '<span class="chat-preview ' + (unread ? 'chat-preview-unread' : '') + '">' + preview + '</span></span>' +
            unread + '</button>';
        }).join('');

        content.innerHTML = '<div class="chat-layout">' +
          '<div class="chat-list" id="chatList">' + (rows || '<div class="empty-state">Suhbatdosh topilmadi</div>') + '</div>' +
          '<div class="chat-open" id="chatOpen"><div class="empty-state">Suhbatdoshni tanlang — xabarlar shu yerda ko\'rinadi.</div></div>' +
          '</div>';

        content.querySelectorAll('.chat-row').forEach((btn) => {
          btn.addEventListener('click', () => openConv(Number(btn.dataset.id)));
        });
      })
      .catch((e) => {
        content.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
      });
  }

  function openConv(otherId) {
    currentWith = otherId;
    API.post('/api/chat/read', { of: otherId }).catch(() => {});
    renderMessages(otherId);
    // Suhbat listida unreadni yashiramiz
    const row = content.querySelector('.chat-row[data-id="' + otherId + '"]');
    if (row) {
      const u = row.querySelector('.chat-unread');
      if (u) u.remove();
    }
    const other = contactsMap[otherId] || {};
    const list = document.getElementById('chatList');
    const open = document.getElementById('chatOpen');
    if (list) list.classList.add('chat-list-hide-mobile');
    if (open) open.classList.add('chat-open-show');
    const title = document.getElementById('chatHeadTitle');
    if (title) title.textContent = other.fullName || ('ID ' + otherId);
  }

  function renderMessages(otherId) {
    const open = document.getElementById('chatOpen');
    if (!open) return;
    const other = contactsMap[otherId] || {};
    open.innerHTML = '<div class="chat-msgs">' +
      '<div class="skeleton skeleton-line w-60" style="height:38px;border-radius:14px;max-width:70%"></div>' +
      '<div class="skeleton skeleton-line w-40" style="height:38px;border-radius:14px;max-width:60%;align-self:flex-end"></div>' +
      '<div class="skeleton skeleton-line w-80" style="height:38px;border-radius:14px;max-width:70%"></div>' +
      '</div>';
    API.get('/api/chat/history?with=' + encodeURIComponent(otherId))
      .then((msgs) => {
        API.post('/api/chat/read', { of: otherId }).catch(() => {});
        const bubbles = (msgs || []).map((m) => {
          const mine = String(m.from) === String(otherId) ? false : true;
          const cls = mine ? 'bubble mine' : 'bubble';
          return '<div class="' + cls + '"><div class="bubble-text">' + escapeHtml(m.text) + '</div><div class="bubble-time">' + escapeHtml(fmtTime(m.createdAt)) + (mine ? '' : (m.read ? ' • o\'qildi' : '')) + '</div></div>';
        });
        open.innerHTML =
          '<div class="chat-head" id="chatHead">' +
            '<button class="btn btn-outline btn-sm chat-back" id="chatBack">←</button>' +
            '<b id="chatHeadTitle">' + escapeHtml(other.fullName || '') + '</b>' +
            '<span class="sub">' + escapeHtml(other.roleName || '') + '</span>' +
          '</div>' +
          '<div class="chat-msgs" id="chatMsgs">' + (bubbles || '<div class="empty-state">Xabarlar yo\'q</div>') + '</div>' +
          '<form class="chat-form" id="chatForm"><textarea id="chatInput" rows="2" maxlength="2000" placeholder="Xabar yozing..."></textarea><button type="submit" class="btn btn-primary">Yuborish</button></form>';

        document.getElementById('chatBack').addEventListener('click', () => {
          currentWith = null;
          renderList();
        });
        document.getElementById('chatForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = document.getElementById('chatInput');
          const txt = input.value.trim();
          if (!txt) return;
          input.disabled = true;
          try {
            const msg = await API.post('/api/chat/send', { to: otherId, text: txt });
            input.value = '';
            const msgs = document.getElementById('chatMsgs');
            const div = document.createElement('div');
            div.className = 'bubble mine';
            div.innerHTML = '<div class="bubble-text">' + escapeHtml(msg.text) + '</div><div class="bubble-time">' + escapeHtml(fmtTime(msg.createdAt)) + '</div>';
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;
            // List viewdagi previewni yangilaymiz
            refreshConversationPreview(otherId, msg);
          } catch (err) {
            alert(err.message);
          } finally {
            input.disabled = false;
            input.focus();
          }
        });
        const msgsBox = document.getElementById('chatMsgs');
        msgsBox.scrollTop = msgsBox.scrollHeight;
        startPoll(otherId);
      })
      .catch((e) => {
        open.innerHTML = '<div class="alert-error" style="display:block;max-width:500px;margin:20px auto;">' + escapeHtml(e.message) + '</div>';
      });
  }

  function refreshConversationPreview(otherId, msg) {
    const row = content.querySelector('.chat-row[data-id="' + otherId + '"]');
    if (!row) return;
    const preview = row.querySelector('.chat-preview');
    const time = row.querySelector('.chat-time');
    if (preview) preview.textContent = msg.text;
    if (time) time.textContent = fmtTime(msg.createdAt);
    const head = row.parentElement;
    if (head && head.firstChild) head.insertBefore(row, head.firstChild);
  }

  function startPoll(otherId) {
    stopPoll();
    pollTimer = setInterval(() => {
      if (!active || currentWith !== otherId) return;
      API.get('/api/chat/history?with=' + encodeURIComponent(otherId))
        .then((msgs) => {
          const msgsEl = document.getElementById('chatMsgs');
          if (!msgsEl) return;
          const existing = [...msgsEl.querySelectorAll('.bubble')];
          if (existing.length === (msgs || []).length) return;
          API.post('/api/chat/read', { of: otherId }).catch(() => {});
          renderMessages(otherId);
        })
        .catch(() => {});
    }, 5000);
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // Nav button bosilganda
  navBtn.addEventListener('click', () => {
    window.CHAT.open();
  });
})();
