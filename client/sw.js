const CACHE_NAME = 'olimp-lider-v15';
// FAQAT o'zgarmaydigan og'ir fayllar (rasm/manifest) keshga oldindan olinadi.
// JS/CSS ataylab ro'yxatda yo'q: ular network-first bilan olinadi, aks holda
// yangi kod hech qachon foydalanuvchiga yetib bormaydi.
const STATIC_ASSETS = [
  '/assets/logo-emblem.png',
  '/assets/banner.jpg',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - implement cache strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return;
  
  const urlPath = url.pathname;
  
  // API requests - network first, fallback to cache
  if (urlPath.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }

  // JS/CSS/HTML — network-first: yangilangan kod darhol yetib boradi.
  // Tarmoq bo'lmasa keshdan beriladi (offline rejim).
  if (urlPath.startsWith('/js/') || urlPath.startsWith('/css/') ||
      urlPath === '/' || urlPath.endsWith('.html') ||
      event.request.mode === 'navigate') {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }

  // Rasmlar - cache first (o'zgarmaydi, tez yuklanadi)
  if (urlPath.startsWith('/assets/') ||
      urlPath.endsWith('.png') ||
      urlPath.endsWith('.jpg') ||
      urlPath.endsWith('.jpeg') ||
      urlPath.endsWith('.ico') ||
      urlPath.endsWith('.woff2') ||
      urlPath.endsWith('.woff')) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }

  // Default: network first
  event.respondWith(networkFirstStrategy(event.request));
});

// Network first strategy
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return (await caches.match('/')) || new Response('Offline', { status: 503 });
    }
    throw error;
  }
}

// Cache first strategy
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-payments') {
    event.waitUntil(syncPayments());
  } else if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncPayments() {
  // Sync offline payments when online
  console.log('Syncing payments...');
}

async function syncAttendance() {
  // Sync offline attendance
  console.log('Syncing attendance...');
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Yangi xabar keldi',
    icon: '/assets/logo-emblem.png',
    badge: '/assets/logo-emblem.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Ochish' },
      { action: 'close', title: 'Yopish' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'OLIMP-LIDER', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open') {
    event.waitUntil(clients.openWindow('/'));
  }
});