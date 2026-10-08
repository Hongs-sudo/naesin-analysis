// 수도 내신분석 — 설치형 앱용 서비스 워커
// 항상 인터넷의 최신 파일을 먼저 쓰고, 연결이 끊겼을 때만 저장해 둔 화면을 보여 준다.
// 시험 데이터(Firestore)와 AI 호출은 건드리지 않는다.
const CACHE = 'sudo-naesin-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
