const CACHE_NAME = 'borooz-v1';
const urlsToCache = [
  'index.html',
  'admin.html',
  'css/style.css',
  'js/app.js',
  'js/database.js',
  'js/ads.js',
  'manifest.json',
  'admin-manifest.json',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) return response;
      return fetch(event.request).catch(function() {
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
        return new Response('', { status: 408 });
      });
    })
  );
});