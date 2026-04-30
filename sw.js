const CACHE = 'taskpwa-v12';
const ASSETS = ['./style.css', './app.js', './manifest.json', './icon.svg', './icon.png',
  './bg.png', './bg2.png', './bg3.png', './logo.png',
  './chara_hinata.png', './chara_hayate.png', './chara_kouta.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    self.clients.claim().then(() =>
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
    ).then(() => self.clients.matchAll({ type: 'window' }))
     .then(clients => clients.forEach(client => client.navigate(client.url)))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // index.html はネットワーク優先（常に最新を取得）
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
