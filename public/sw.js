/* MomentoBooth — Service Worker (offline-first PWA) */
const CACHE = "momentobooth-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/filters.js",
  "/js/masks.js",
  "/js/frames.js",
  "/js/vendor/gif.js",
  "/js/vendor/gif.worker.js",
  "/js/vendor/jszip.min.js",
  "/js/mediapipe/vision_bundle.mjs",
  "/js/mediapipe/wasm/vision_wasm_internal.js",
  "/js/mediapipe/wasm/vision_wasm_internal.wasm",
  "/js/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/js/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/js/mediapipe/face_landmarker.task",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/logo.png",
];

/* Préchargement de la navigation (réseau) — iOS 15.4+ / Safari */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
  // active le préchargement dès que possible
  if (self.registration?.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable().catch(() => {}));
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return; // réseau uniquement

  /* Navigation (pages) : réseau d'abord, fallback cache → jamais d'écran blanc */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // 1) Réponse préchargée (navigationPreload) — mise en cache pour l'offline
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            const cache = await caches.open(CACHE);
            cache.put(request, preloadResponse.clone());
            return preloadResponse;
          }
          // 2) Réseau direct
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match("/index.html");
        }
      })(),
    );
    return;
  }

  /* Assets statiques : stale-while-revalidate — cache instantané + MAJ en fond.
     Évite le problème « l'iPhone sert l'ancienne version pendant des heures ». */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => null);
      return cached || network || caches.match("/index.html");
    })(),
  );
});
