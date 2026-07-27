const CACHE_NAME = 'borooz-v3';
const urlsToCache = [
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/database.js',
  'js/ads.js',
  'manifest.json',
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
