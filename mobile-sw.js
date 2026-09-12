// FarriTech Mobile Service Worker
const CACHE_NAME = 'farritech-mobile-v2';

// The app shell: small set of files needed to boot the UI instantly on repeat opens.
const APP_SHELL = [
  '/mobile',
  '/mobile-manifest.json',
  '/public/farritech_logo_square.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {}) // don't fail install if e.g. offline during first install
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

// Hosts safe to cache: the app shell itself plus third-party libraries that rarely
// change and are expensive to re-download on cellular (fonts, Maps, Stripe.js).
const CACHE_FIRST_ORIGINS = new Set([
  self.location.origin,
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://maps.googleapis.com',
  'https://js.stripe.com',
  'https://www.gstatic.com', // Firebase SDK scripts
]);

self.addEventListener('fetch', event => {
  const req = event.request;

  // Never intercept non-GET requests (payments, SMS, email, Firestore writes, etc.)
  // — those must always go straight to the network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin API calls (e.g. /api/*) must always be fresh — never cached.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  if (CACHE_FIRST_ORIGINS.has(url.origin)) {
    // Stale-while-revalidate: serve the cached copy instantly if we have one
    // (so the app opens fast even on a slow connection), and refresh it in
    // the background so the next open gets any update.
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Everything else (Firebase Firestore/Auth channels, etc.): network first,
  // falling back to cache only if the network is unreachable.
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
