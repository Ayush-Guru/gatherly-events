const CACHE_NAME = 'gatherly-shell-v2';
const SHELL = ['/index.html', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gatherly-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache private API/auth traffic, cross-origin resources, or non-GETs.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put('/index.html', response.clone()); } return response; }
      catch { return (await caches.match('/index.html')) || Response.error(); }
    })());
  } else if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); } return response; }
      catch { return (await caches.match(request)) || Response.error(); }
    })());
  }
});
