// FarriTech Mobile Service Worker
const CACHE_NAME = 'farritech-mobile-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Network first — always get fresh data from Firebase
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
