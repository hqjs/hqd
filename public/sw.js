const cacheName = 'hqd::public::v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([
    '/-/public/index.html',
    '/-/public/package.html',
    '/-/public/index.css',
    '/-/public/package.css',
    '/-/public/search.css',
    '/-/public/highlight.css',
    '/-/public/index.mjs',
    '/-/public/package.mjs',
    '/-/public/search.mjs',
    '/-/public/md5.mjs',
    '/-/public/js-origin.js',
    '/-/public/js-demo-warning.js',
    '/-/public/js-year.js',
    '/-/public/logo.js',
    '/-/public/gl-utils.js',
    '/-/public/memory-vectors.js',
    '/-/public/hqd.png',
    '/-/public/hqjs.png',
    '/-/public/info-circle-solid.svg',
    '/-/public/clipboard-solid.svg',
    '/-/public/lights.vert',
    '/-/public/lights.frag',
  ])));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
