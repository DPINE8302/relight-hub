const VERSION = "relight-offline-63f6dd9a0e12";
const ROUTES = ["/", "/play", "/after", "/wall", "/privacy", "/puff-world", "/light-trail", "/games/puff-world-inside/index.html"];
const FONTS = ["/fonts/LINESeedSansTH_W_Rg.woff2", "/fonts/LINESeedSansTH_W_Bd.woff2", "/fonts/LINESeedSansTH_W_XBd.woff2", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const assets = new Set(FONTS);
    for (const path of ROUTES) {
      const response = await fetch(path, { cache: "reload", headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error("Offline page unavailable");
      const html = await response.clone().text();
      await cache.put(path, response);
      for (const match of html.matchAll(/\/_next\/static\/[^"'<>\s\\]+?\.(?:js|css)/g)) assets.add(match[0]);
    }
    const game = await fetch("/games/puff-world-inside/offline-assets.json", { cache: "reload" });
    if (!game.ok) throw new Error("Offline game manifest unavailable");
    for (const path of (await game.json()).assets) assets.add(path);
    assets.add("/games/puff-world-preview-world.png");
    await cache.addAll([...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith("relight-offline-") && name !== VERSION) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/wall/manage") || url.pathname.startsWith("/analytics")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && ROUTES.includes(url.pathname)) {
          const cache = await caches.open(VERSION);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        const cached = await (await caches.open(VERSION)).match(url.pathname);
        return cached || new Response("หน้านี้ยังไม่ได้บันทึกไว้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/games/") || url.pathname === "/favicon.svg") {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
