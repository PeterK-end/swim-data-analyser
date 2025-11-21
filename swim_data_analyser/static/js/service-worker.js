// Cache name changes automatically when Django git_version changes
const CACHE_NAME = "swim-cache-v{{ git_version }}";

// Only cache STATIC assets that do NOT use Webpack hashing.
// Hashed bundles (main.[hash].js) MUST NOT be listed here.
const urlsToCache = [
    // App shell
    "/",

    // Static CSS (not fingerprinted)
    "/static/css/ia-mono.css",
    "/static/css/styles.css",

    // Fonts
    "/static/fonts/ia-duo/iAWriterDuoS-Regular.woff2",
    "/static/fonts/ia-quattro/iAWriterQuattroS-Regular.woff2",
    "/static/fonts/ia-quattro/iAWriterQuattroS-Italic.woff2",
    "/static/fonts/ia-quattro/iAWriterQuattroS-Bold.woff2",
    "/static/fonts/ia-quattro/iAWriterQuattroS-BoldItalic.woff2",

    // Graphics & icons
    "/static/icons/analyse-icon.svg",
    "/static/icons/edit-icon.svg",
    "/static/icons/git-logo.svg",
    "/static/favicon.svg",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png",

    // Example data
    "/static/data/example.fit",
];

// ---------------------------------------------------------------------------
// INSTALL — precache STATIC assets (NOT hashed JS bundles)
// ---------------------------------------------------------------------------
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(urlsToCache)
        )
    );
    self.skipWaiting();  // activate new SW immediately
});

// ---------------------------------------------------------------------------
// ACTIVATE — delete old caches when git_version changes
// ---------------------------------------------------------------------------
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cache => cache !== CACHE_NAME)
                    .map(cache => caches.delete(cache))
            );
        })
    );
    self.clients.claim(); // control all pages instantly
});

// ---------------------------------------------------------------------------
// FETCH — cache-first for static assets, network-first for everything else
// ---------------------------------------------------------------------------
self.addEventListener("fetch", event => {
    const req = event.request;
    const url = new URL(req.url);

    // Never serve cached Webpack JS bundles
    // (they have hashes, browser cache handles them perfectly)
    if (url.pathname.startsWith("/static/js/dist/")) {
        return; // use normal network request
    }

    // Cache-first for static assets
    if (url.pathname.startsWith("/static/")) {
        event.respondWith(
            caches.match(req).then(res => res || fetch(req))
        );
        return;
    }

    // Network-first for dynamic requests
    event.respondWith(
        fetch(req).catch(() => caches.match(req))
    );
});
