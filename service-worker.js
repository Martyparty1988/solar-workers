const CACHE_VERSION = 'v1';
const CACHE_NAME = `solar-workers-${CACHE_VERSION}`;
const CORE_ASSETS = ['/', '/index.html', '/styles.css', '/js/pwa.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('solar-workers-') && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith((async () => {
    try {
      const net = await fetch(req);
      // Try to update runtime cache for GETs
      if (req.method === 'GET') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
