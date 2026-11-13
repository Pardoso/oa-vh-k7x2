// Guarda la app en el dispositivo para que abra sin internet.
// Los datos de las órdenes los guarda Firestore aparte (IndexedDB).
const VERSION = 'oa-v4';
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2';
const APP = ['./', 'index.html', 'styles.css', 'app.js', 'firebase-config.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs'];
const LIBS = [`${FIREBASE}/firebase-app.js`, `${FIREBASE}/firebase-firestore.js`];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (c) => {
      await c.addAll(APP);
      await Promise.all(LIBS.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'oa-pdfs').map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propia = url.origin === location.origin;
  const libreria = req.url.startsWith(FIREBASE);
  if (!propia && !libreria) return; // las llamadas a la base de datos no se tocan

  if (libreria) {
    // Versión fija: sirve desde la copia local.
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => guardar(req, res))));
    return;
  }
  // Archivos de la app: primero la red (para recibir mejoras), y si no hay señal, la copia local.
  e.respondWith(
    fetch(req)
      .then((res) => guardar(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

function guardar(req, res) {
  if (res && res.ok) {
    const copia = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copia));
  }
  return res;
}
