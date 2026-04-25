/* Minimal service worker — enables PWA "Install" on Android/Chrome.
   Network-first: we don't aggressively cache because the live AI app
   needs fresh API responses. Static assets fall back to cache. */
const CACHE = "signlanguage-pro-v1";
const STATIC = ["/", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API or backend calls
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  // Network-first for everything else
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
