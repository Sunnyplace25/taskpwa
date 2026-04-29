const CACHE = 'taskpwa-v4';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg',
  './bg.png', './bg2.png', './bg3.png', './logo.png',
  './chara_hinata.png', './chara_hayate.png', './chara_kouta.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
