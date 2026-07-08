// Workbox generateSW config — run after `expo export --platform web` against the
// `dist/` output to produce `dist/sw.js`.
//
// How this satisfies "cache the UI, fast loads, but bust on any UI change":
//   - Every asset Metro emits is content-hashed (…/_expo/static/js/web/*.<hash>.js).
//     Workbox precaches each with a content revision, so a changed bundle becomes a
//     new precache entry and the stale one is purged on activate.
//   - skipWaiting + clientsClaim make a freshly-deployed SW take control on the next
//     load (no manual cache clear, no waiting for all tabs to close).
//   - navigateFallback serves the precached app shell so the app boots offline.
//   - /api GETs use NetworkFirst so data is fresh online and still available offline.
module.exports = {
  globDirectory: "dist",
  globPatterns: ["**/*.{js,css,html,png,svg,jpg,ico,json,woff,woff2,ttf}"],
  swDest: "dist/sw.js",

  // App-shell offline support: unmatched navigations fall back to the SPA entry.
  navigateFallback: "/index.html",
  // …except API requests, which must hit the network / runtime cache, never the shell.
  navigateFallbackDenylist: [/^\/api\//],

  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,

  // Expo's main bundle can be several MB — precache it anyway.
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,

  runtimeCaching: [
    {
      // Read-only API data: fresh when online, last-known copy when offline.
      // (Auth endpoints and non-GET requests are intentionally never cached.)
      urlPattern: ({ url, request }) =>
        request.method === "GET" &&
        url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/auth/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "orbit-api",
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};
