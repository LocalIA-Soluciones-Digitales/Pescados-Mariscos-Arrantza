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

// Avisos push del panel de gestión (pedidos, reservas, solicitudes de
// hostelería) — los envía la Edge Function push-notify.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Arrantza', {
      body: data.body || '',
      icon: '/logo-192.png',
      badge: '/logo-192.png',
      tag: data.tag,
      // Que suene y vibre (si el móvil no está en silencio): nunca aviso
      // silencioso, y si llega otro con la misma etiqueta vuelve a sonar.
      silent: false,
      renotify: Boolean(data.tag),
      vibrate: [200, 100, 200, 100, 400],
      data: { url: data.url || '/admin' },
    }),
  );
});

// Al tocar el aviso: reutiliza la ventana del panel si ya está abierta
// (navegándola a la pestaña correspondiente) o abre una nueva.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const panel = windows.find((w) => new URL(w.url).pathname.startsWith('/admin'));
      if (panel) {
        return panel.navigate(url).then((w) => (w || panel).focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
