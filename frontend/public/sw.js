/* SignLanguage Pro service worker.
   - Network-first for app shell.
   - Cache-first for the offline dictionary pack (/api/offline/pack).
   - Other /api/* calls are bypassed (always live).
   - Provides offline fallback for navigation requests. */
const CACHE = "signlanguage-pro-v2";
const OFFLINE_CACHE = "signlanguage-pro-offline-v2";
const STATIC = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== OFFLINE_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Helper: stale-while-revalidate for the offline pack
async function staleWhileRevalidate(req) {
  const cache = await caches.open(OFFLINE_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cache the offline pack endpoint specifically (other /api/* stay live)
  if (url.pathname.endsWith("/api/offline/pack")) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cache the dictionary endpoint (without query) too — useful while offline
  if (url.pathname.endsWith("/api/dictionary")) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Skip everything else under /api/
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: network-first with offline fallback
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((m) => m || caches.match("/") || new Response("Sin conexión", { status: 503 })),
        ),
    );
    return;
  }

  // Static assets: network-first, fall back to cache
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
