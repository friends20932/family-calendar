// Service Worker for Family Calendar
const CACHE_NAME = 'family-calendar-v20';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './calendar.js',
  './events.js',
  './members.js',
  './notifications.js',
];

// Install — pre-cache assets, then immediately take over
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Skip waiting so the new SW activates right away (no need to close all tabs)
  self.skipWaiting();
});

// Activate — delete old caches, claim clients, then tell all pages to reload
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open pages to reload so they get the latest code
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// Fetch — Network First; fall back to cache when offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});


// Push notification received
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '家庭行事曆提醒';
  const options = {
    body: data.body || '您有一個即將到來的活動',
    icon: data.icon || './icon-192.png',
    badge: './icon-72.png',
    tag: data.tag || 'calendar-reminder',
    data: { url: data.url || './' },
    actions: [
      { action: 'view', title: '查看行事曆' },
      { action: 'dismiss', title: '關閉' },
    ],
    requireInteraction: false,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Background alarm check (message from main thread)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SCHEDULE_CHECK') {
    checkUpcomingEvents(e.data.events);
  }
});

function checkUpcomingEvents(events) {
  if (!events || !events.length) return;
  const now = Date.now();
  events.forEach((ev) => {
    if (!ev.reminder || ev.reminder === 'none') return;
    const reminderMs = parseInt(ev.reminder, 10) * 60 * 1000;
    const eventTime = new Date(ev.datetime).getTime();
    const triggerTime = eventTime - reminderMs;
    const diff = triggerTime - now;
    if (diff > 0 && diff < 60000) {
      // Within the next minute — fire notification
      setTimeout(() => {
        self.registration.showNotification(`⏰ ${ev.title}`, {
          body: ev.description ? `${ev.description}\n📍 ${ev.location || ''}` : `活動即將開始`,
          tag: `event-${ev.id}`,
          data: { url: './' },
          requireInteraction: true,
        });
      }, diff);
    }
  });
}
