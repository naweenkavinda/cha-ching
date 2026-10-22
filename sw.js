const VERSION = 'v22';
const SHELL = 'receipt-snap-shell-' + VERSION;
const CDN = 'receipt-snap-cdn-v1';
const ASSETS = [
  './',
  './index.html',
  './css/theme.css',
  './css/style.css',
  './js/parser.js',
  './js/db.js',
  './js/ocr.js',
  './js/camera.js',
  './js/float.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('receipt-snap-') === 0 && k !== SHELL && k !== CDN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf(new URL(self.registration.scope).pathname) !== 0) return;
    e.respondWith(fromShell(req, e));
  } else if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(fromCdn(req));
  }
});

async function fromShell(req, e) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (cached && res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) {
    e.waitUntil(network);
    return cached;
  }
  const res = await network;
  if (res) return res;
  if (req.mode === 'navigate') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }
  return Response.error();
}

async function fromCdn(req) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
  return res;
}
