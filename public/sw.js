/* MomentoBooth — Service Worker (offline-first PWA) */
const CACHE = "momentobooth-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/filters.js",
  "/js/mediapipe/vision_bundle.mjs",
  "/js/mediapipe/wasm/vision_wasm_internal.js",
  "/js/mediapipe/wasm/vision_wasm_internal.wasm",
  "/js/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/js/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/js/mediapipe/face_landmarker.task",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
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
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match("/index.html"));
    }),
  );
});
