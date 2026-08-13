/**
 * DonkeyRide service worker.
 *
 * Strategy:
 * - API and WebSocket traffic: network only (live coordination must never be
 *   served stale).
 * - Hashed build assets (/assets/*): cache-first — content-addressed, immutable.
 * - Navigations: network-first with cached app-shell fallback, so the app
 *   still opens in a car park with no signal.
 */

const CACHE_NAME = 'donkeyride-v4';
// Two app shells: rider ('/') and driver ('/provide')
const APP_SHELL = ['/', '/provide', '/manifest.webmanifest', '/manifest-driver.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Web Push job alerts — payload arrives E2E encrypted (RFC 8291)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — show a generic alert
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DonkeyRide', {
      body: data.body || 'Open the app for details',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'donkeyride',
      data: { url: data.url || '/provide' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/provide';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          if (win.navigate) win.navigate(url);
          return win.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return; // mutations always hit the network
  }

  // Live data — never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/rides') || url.pathname === '/health' || url.pathname === '/info') {
    return;
  }

  // Immutable hashed build assets — cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
      )
    );
    return;
  }

  // Navigations — network-first, fall back to the right app shell offline
  if (event.request.mode === 'navigate') {
    const isDriverPath = url.pathname.startsWith('/provide') || url.pathname.startsWith('/drive');
    const shellKey = isDriverPath ? '/provide' : '/';
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(shellKey, copy));
          return response;
        })
        .catch(() => caches.match(shellKey))
    );
  }
});
