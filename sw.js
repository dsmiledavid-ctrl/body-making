// Offline support. Network first (so updates arrive as soon as she is online),
// cached copy when the studio has no signal. Bump CACHE on every release.
const CACHE = 'bm-1.6.0';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'i18n.js',
  'vendor/jsQR.js', 'vendor/qrcode.js', 'manifest.webmanifest',
  'icons/logo.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // cache: 'no-cache' = always ask GitHub if the file changed (it otherwise lets
  // phones reuse a copy for 10 minutes, which held back updates).
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
