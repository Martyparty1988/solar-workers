self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Try network first, fall back to cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      return res;
    } catch {
      const cache = await caches.open('runtime');
      const match = await cache.match(event.request);
      if (match) return match;
      // fallback: cache the root for navigations
      if (event.request.mode === 'navigate') {
        return cache.match('/index.html');
      }
      return new Response('Offline', { status: 503 });
    }
  })());
});
