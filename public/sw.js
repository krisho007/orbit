// Simple service worker for PWA installability
// Online-only approach - no caching

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating.')
  event.waitUntil(clients.claim())
})

// Network-only strategy - always fetch from network
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})


