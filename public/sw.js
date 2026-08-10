/* MomentoBooth — Service Worker (offline-first PWA) */
const CACHE = "momentobooth-v82";
/* ⚠️ Les URLs versionnées (?v=76) doivent MATCHER celles de index.html ET les imports de app.js :
   sinon l'iPhone peut servir un mélange de versions (HTML neuf + JS vieux)
   → crash de init() → plus de caméra. */
const ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css?v=76",
  "/js/app.js?v=76",
  "/js/filters.js?v=76",
  "/js/masks.js?v=76",
  "/js/frames.js?v=76",
  "/js/animations.js?v=76",
  "/mediapipe/vision_bundle.mjs?v=76",
  "/mediapipe/wasm/vision_wasm_internal.js",
  "/mediapipe/wasm/vision_wasm_internal.wasm",
  "/mediapipe/face_landmarker.task",
  "/manifest.webmanifest",
  "/icons/icon-192.png?v=76",
  "/icons/icon-512.png?v=76",
  "/icons/apple-touch-icon-180.png?v=76",
  "/icons/logo-trim.png?v=76",
  "/img/tuto-swipe-1.png?v=76",
  "/img/tuto-swipe-2.png?v=76",
  "/img/idle-swipe.gif?v=76",
  "/img/idle-click.gif?v=76",
];

/* Préchargement de la navigation (réseau) — iOS 15.4+ / Safari */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
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
  // Le manifeste et le service worker doivent toujours être revalidés :
  // leurs headers no-cache ne doivent pas être contournés par le cache PWA.
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/sw.js") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request, { cacheName: CACHE })));
    return;
  }

  /* Navigation (pages) : réseau d'abord, fallback cache → jamais d'écran blanc */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            const cache = await caches.open(CACHE);
            cache.put(request, preloadResponse.clone());
            return preloadResponse;
          }
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch {
          const cached = await caches.match(request, { cacheName: CACHE });
          return cached || caches.match("/index.html", { cacheName: CACHE });
        }
      })(),
    );
    return;
  }

  /* Assets : cache d'abord (cache COURANT uniquement) puis réseau en fond.
     Les vendors optionnels GIF/ZIP sont ainsi téléchargés uniquement lors
     de leur première utilisation, puis restent disponibles hors ligne.
     ⚠️ cacheName: CACHE → on ne sert JAMAIS une vieille version depuis un
     ancien cache (le bug « l'iPhone affiche l'ancienne version »). */
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) {
        // Revalidation en arrière-plan (stale-while-revalidate)
        fetch(request).then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
        }).catch(() => {});
        return cached;
      }
      const network = await fetch(request).catch(() => null);
      if (network && network.ok && url.origin === self.location.origin) {
        const clone = network.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
      }
      return network || caches.match("/index.html", { cacheName: CACHE });
    })(),
  );
});
