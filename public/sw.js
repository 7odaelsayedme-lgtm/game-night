// عامل الخدمة: يجعل الموقع قابلًا للتثبيت كتطبيق ويفتح الواجهة بسرعة.
// الشبكة أولًا دائمًا (حتى تصل التحديثات فورًا)، والنسخة المحفوظة فقط عند انقطاع الإنترنت.
// لا يتدخل أبدًا في الاتصال اللحظي للعب (/socket.io).
const CACHE = 'sahra-v1';
const SHELL = [
  '/', '/css/styles.css', '/fonts/fonts.css', '/js/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/fonts/lalezar-arabic-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname === '/health') return;

  const isPage = e.request.mode === 'navigate';
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isPage ? '/' : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(isPage ? '/' : e.request).then((r) => r || Response.error())),
  );
});
