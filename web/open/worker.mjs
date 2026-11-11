// Only /open/ is controlled. No fetch/upload, global app caching or offline installation.
const cacheName = 'kairos.direct-open.v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname) || !/\/Kairos-[A-F\d-]+\.workout$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const response = await (await caches.open(cacheName)).match(event.request.url);
    return response ?? new Response('训练文件已失效，请返回 Kairos 计划页刷新后重新下载。', {
      status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  })());
});
