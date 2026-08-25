// Service worker mínimo: solo existe para que el navegador considere el
// sitio "instalable" (PWA) y para dar algo de resiliencia offline. Siempre
// intenta la red primero y solo cae a caché si no hay conexión — nunca sirve
// contenido cacheado habiendo red, para no mostrar precios/stock
// desactualizados en la pescadería ni en el catálogo público.
const CACHE = 'arrantza-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  );
});
