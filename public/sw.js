/* Only public application assets belong in this cache. Never add family data. */
const CACHE_PREFIX = "mory-public-";
const CACHE_VERSION = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_ASSETS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  // A new version waits until the user accepts it or all old tabs close.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // RSC/prefetch responses and image optimization can contain private data.
  if (request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch") || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }
  const isPublicAsset = PUBLIC_ASSETS.includes(url.pathname);
  const isBuildAsset = url.pathname.startsWith("/_next/static/") && /\.(?:js|css|woff2?)$/.test(url.pathname);
  if (!isPublicAsset && !isBuildAsset) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.headers.get("cache-control")?.includes("no-store")) {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(request, response.clone());
      } catch {
        // Storage quota or a disabled cache must not break a network response.
      }
    }
    return response;
  })());
});
