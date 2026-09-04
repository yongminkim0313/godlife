/**
 * 오프라인 캐싱 (기획서 3.2)의 앱 셸 담당.
 * 일정 데이터 자체는 localStorage에 있으므로, 서비스 워커는 HTML/JS/CSS만 캐시해
 * 네트워크 없이도 앱이 뜨게 만든다.
 *
 * PRECACHE 목록과 CACHE 이름은 빌드할 때 실제 산출물로 치환된다
 * (src/build/precache-plugin.ts). 개발 서버에서는 워커를 등록하지 않는다.
 */
const CACHE = 'godlife-__CACHE_VERSION__';
const PRECACHE = '__PRECACHE_MANIFEST__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 한 파일이라도 실패하면 addAll이 통째로 실패하므로 개별로 담는다.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
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
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 날씨 API 등 외부 요청은 그대로 통과

  /*
   * ignoreVary가 핵심이다. 정적 서버는 보통 'Vary: Origin'을 붙이는데, precache는
   * cache.add(url)로 담아 Origin 헤더가 없는 반면 <script type="module">은 CORS
   * 요청이라 Origin을 보낸다. 기본 매칭은 이 차이를 다른 응답으로 보고 미스를 내서,
   * 캐시에 파일이 있는데도 오프라인에서 앱이 빈 화면으로 뜬다.
   * 해시가 붙은 산출물이라 URL만 같으면 같은 파일이므로 Vary는 무시해도 안전하다.
   */
  const fromCache = (req) => caches.match(req, { ignoreVary: true });

  // 내비게이션은 network-first, 실패하면 캐시된 앱 셸.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await fromCache('/index.html')) ?? (await fromCache('/')) ?? Response.error()),
    );
    return;
  }

  // 정적 자산은 stale-while-revalidate. 해시가 붙어 있어 캐시 우선이 안전하다.
  event.respondWith(
    fromCache(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        // 네트워크도 캐시도 없으면 undefined가 아니라 오류 응답을 돌려줘야 한다.
        // respondWith(undefined)는 그 자체로 하드 실패가 된다.
        .catch(() => cached ?? Response.error());
      return cached || network;
    }),
  );
});
