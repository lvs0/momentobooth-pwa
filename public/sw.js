/* MomentoBooth — Service Worker de DÉSINSTALLATION.
   Ce SW remplace tout ancien SW enregistré sur cet origine.
   Il se désinstalle immédiatement après activation et purge tous les caches.
   Raison : le cache SW sur iOS/Safari peut bloquer les mises à jour critiques.
   L'application fonctionne entièrement en mode réseau-first sans cache SW. */

self.addEventListener("install", () => {
  // skipWaiting() pour remplacer immédiatement tout ancien SW en attente.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge de TOUS les caches SW de cet origine (ancienne et nouvelle version).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch { /* purge best-effort */ }
      // claim() pour contrôler les clients actifs, puis se désinscrire.
      await self.clients.claim();
      // Désinscription : ce SW ne sera plus actif après ce cycle.
      // Les prochains rechargements iront directement au réseau.
      await self.registration.unregister();
    })(),
  );
});

// Aucun handler fetch : toutes les requêtes passent directement au réseau.
