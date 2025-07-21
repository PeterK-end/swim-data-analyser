const CACHE_NAME = "swim-cache-v1";
const urlsToCache = [
    // Bundled JS
    "/static/js/dist/main.js",
    "/static/js/service-worker.js",

    // CSS
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

    // Optional data
    "/static/data/example.fit"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
