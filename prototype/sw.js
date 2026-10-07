// Service worker for the installed web app (iPhone and Android home screen).
// Pages: network first, the last copy when offline. Static files: served from cache and refreshed in the background.
// API calls (auth, chat stream, payments) are never cached or intercepted.
const CACHE = 'anna-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './assets/app/icon-192.png', './assets/institute-emblem-gold.svg'];
const STATIC = /\.(?:css|js|svg|png|jpg|webp|woff2)$/;
const OFFLINE_PAGE = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Нет соединения</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#130d0b;color:#f6eee3;font:16px/1.5 Arial,sans-serif;text-align:center;padding:24px">
<div><p style="color:#f5d985;font-size:20px;margin:0 0 8px">Нет соединения</p><p style="margin:0;color:#cbbcaf">Проверьте интернет и обновите страницу.</p></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('anna-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Only the app page itself becomes the offline copy, never another HTML response.
    const path = new URL(request.url).pathname;
    if (response.ok && (path === '/' || path.endsWith('/index.html'))) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('./index.html')) ?? new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached ?? fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
  if (STATIC.test(url.pathname)) event.respondWith(staleWhileRevalidate(request));
});
