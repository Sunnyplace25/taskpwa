const CACHE = 'taskpwa-v26';
const ASSETS = ['./style.css', './app.js', './manifest.json', './icon.svg', './icon.png',
  './bg.png', './bg2.png', './bg3.png', './logo.png',
  './chara_hinata.png', './chara_hayate.png', './chara_kouta.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // index.html・JS・CSS はネットワーク優先（常に最新を取得）
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }) || caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
