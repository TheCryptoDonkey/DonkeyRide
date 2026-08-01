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

const CACHE_NAME = 'donkeyride-v2';
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
