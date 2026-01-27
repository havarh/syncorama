const CACHE_NAME = 'syncorama-v1';
const urlsToCache = [
    'index.php',
    'style.css',
    'script.js',
    'manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    // For API requests, always go to network
    if (event.request.url.includes('api.php')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // For other requests, try cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
