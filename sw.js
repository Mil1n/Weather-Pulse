const CACHE_NAME = 'weather-pulse-v3';
const ASSETS = [
  './', './index.html', './styles.css', './script.js', './manifest.json', './icon.svg',
  './modules/api.js', './modules/constants.js', './modules/formatters.js', './modules/rules.js', './modules/storage.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
