// Offline cache: downloads every app file once, then works with no internet.
const CACHE = "pose-studio-standalone-v3";
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const files = await (await fetch("files.json", { cache: "no-cache" })).json();
    const cache = await caches.open(CACHE);
    await cache.addAll(files);
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const u = new URL(e.request.url);
    if (e.request.mode === "navigate" || u.pathname.endsWith("/index.html")) {
      try { const r = await fetch(e.request); return r; } catch (_) {}
    }
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(e.request); } catch (_) { return new Response("offline", { status: 503 }); }
  })());
});
