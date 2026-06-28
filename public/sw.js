const CACHE_NAME = 'ysnew2-v1';

// 캐싱할 정적 리소스 (필요 시 추가)
const PRECACHE_URLS = [
  '/ysnew2/',
  '/ysnew2/index.html',
  '/ysnew2/manifest.json',
  '/ysnew2/icon-app.png',
  '/ysnew2/vite.svg',
  '/ysnew2/icon/chat.png'
];

// 설치 시 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// 활성화 시 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시 폴백
self.addEventListener('fetch', (event) => {
  // Supabase API 요청은 캐싱하지 않음
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 유효한 응답만 캐시 저장
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // 오프라인 시 캐시 반환
        return caches.match(event.request);
      })
  );
});
