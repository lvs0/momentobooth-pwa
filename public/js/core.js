/* =========================================================
   MomentoBooth — core entry point (v124)

   Responsabilités :
   1. Poser le role "pending" et la pastille de diagnostic avant
      de parser le monolithe app.js.
   2. Réveiller le splash / cam-diag le plus tôt possible pour
      qu'un module cassé ne fige jamais l'interface.
   3. Importer app.js (et ses dépendances) en différé, après le
      premier paint, pour libérer le main thread au démarrage
      (gain mesurable sur tablette Huawei et iPhone).
   4. Une fois app.js prêt, charger phase3.js (UX/PWA) en
      arrière-plan : la donation + install prompt ne sont pas
      bloquants.

   Les modules fonctionnels lourds (idle-wall, preroll) ne
   sont importés qu'à la demande par app.js lui-même (voir
   public/js/modules/*).
   ========================================================= */
const APP_VERSION = "127"; // Lévy 2026-08-22 — P0 audit fixes: gallery toggle, idle tap, settings overlap
const FALLBACK_SPLASH_MS = 2500;

// Diagnostic précoce : posé avant même que app.js ne soit parsé.
// Si app.js plante ou met trop de temps, le cam-diag s'affiche.
const $ = (id) => document.getElementById(id);
const splash = $("splash");
const camDiag = $("cam-diag");
const hideSplash = () => {
  try { splash?.classList.add("hidden"); } catch {}
};
const showCamDiag = (msg) => {
  try {
    if (!camDiag) return;
    camDiag.classList.remove("hidden");
    const t = camDiag.querySelector(".cam-diag-text");
    if (t) t.textContent = msg;
  } catch {}
};

// Expose un état minimal pour que les handlers inline du DOM
// (ex. role-gate) puissent vérifier l'état d'amorçage.
window.mbDeviceRole = "pending";
window.mbBootStartedAt = performance.now();
window.mbAppBooting = true;

// Si app.js ne se charge pas en un temps raisonnable, on affiche
// un diagnostic explicite (évite le rideau noir silencieux sur
// iPad/iPhone en réseau instable).
let _bootWatchdog = setTimeout(() => {
  if (window.mbAppBooting && !window.__mbAppBooted) {
    showCamDiag("Démarrage lent… touchez pour réessayer");
  }
}, FALLBACK_SPLASH_MS);
const _clearWatchdog = () => {
  if (_bootWatchdog) { clearTimeout(_bootWatchdog); _bootWatchdog = null; }
};

// Une fois app.js signal prêt, on coupe la surveillance.
const _onBooted = () => {
  window.mbAppBooting = false;
  _clearWatchdog();
};
window.addEventListener("mb-app-booted", _onBooted, { once: true });

// Charge app.js en différé. On laisse le navigateur peindre le
// splash + role-gate avant de payer le coût de parse de 365 KB.
// requestIdleCallback n'est pas dispo partout → fallback setTimeout.
const scheduleAppLoad = () => {
  const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
  ric(async () => {
    try {
      await import(`/js/app.js?v=${APP_VERSION}`);
    } catch (err) {
      console.error("[MomentoBooth] échec import app.js :", err);
      showCamDiag(`Démarrage impossible : ${err?.message || "erreur"}`);
    }
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleAppLoad, { once: true });
} else {
  scheduleAppLoad();
}

// v124.0.4 — Garde "QR placeholder" : on ne révèle #tablet-qr-access que
// quand app.js a posé un vrai src sur #tablet-qr-image (sinon le bouton
// s'affiche avec une image 1x1 transparente = esthétique-vide). On observe
// l'attribut src et on révèle le container dès qu'il devient non-placeholder.
(function guardTabletQr() {
  const PLACEHOLDER_PREFIX = "data:image/gif;base64,R0lGOD";
  const img = document.getElementById("tablet-qr-image");
  const wrap = document.getElementById("tablet-qr-access");
  if (!img || !wrap) return;
  const revealIfReal = () => {
    const src = img.getAttribute("src") || "";
    if (src && !src.startsWith(PLACEHOLDER_PREFIX)) {
      wrap.removeAttribute("hidden");
    }
  };
  // Cas 1 : src déjà posé avant que ce script tourne
  revealIfReal();
  // Cas 2 : src posé plus tard
  new MutationObserver(revealIfReal).observe(img, {
    attributes: true,
    attributeFilter: ["src"],
  });
})();

// v124.0.4 — Secours idle overlay : si app.js n'a pas chargé (crash iOS)
// et qu'on est bloqué sur l'écran de veille, un tap sur l'overlay révèle
// le cam-diag pour que l'user puisse forcer un reload. Le handler normal
// d'app.js reste prioritaire (celui-ci ne fait que révéler cam-diag).
(function guardIdleOverlay() {
  const idle = document.getElementById("idle-overlay");
  if (!idle) return;
  let lastTap = 0;
  idle.addEventListener("pointerdown", function () {
    const now = Date.now();
    if (now - lastTap < 2000) return; // anti double-tap
    lastTap = now;
    if (window.mbAppBooting) {
      // app.js pas encore prêt : on montre cam-diag pour informer l'user
      showCamDiag("Démarrage en cours… touchez encore pour rafraîchir");
    }
    // Si app.js est planté (mbAppBooting=false mais l'écran est figé),
    // on propose un refresh manuel
    if (!window.mbAppBooting && document.visibilityState === "visible") {
      // On évite le spam : on n'agit qu'après un délai long
      if (typeof window.__mbIdleRefreshTried === "undefined") {
        window.__mbIdleRefreshTried = 0;
      }
      window.__mbIdleRefreshTried++;
      if (window.__mbIdleRefreshTried >= 5) {
        showCamDiag("L'application semble bloquée. Touchez 'Réessayer' ou videz le cache.");
      }
    }
  }, { passive: true });
})();

// Cleanup __mbFallbackStream pour éviter l'accumulation de streams sur
// Safari iOS (cause fréquente de "Un problème récurrent est survenu").
// On stoppe toutes les pistes du fallback stream global sur beforeunload
// et sur pagehide (le second est plus fiable sur iOS PWA).
function cleanupFallbackStream() {
  try {
    const stream = window.__mbFallbackStream;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach(function (t) {
        try { t.stop(); } catch (_) {}
      });
    }
    window.__mbFallbackStream = null;
  } catch (_) {}
}
window.addEventListener("pagehide", cleanupFallbackStream);
window.addEventListener("beforeunload", cleanupFallbackStream);
// iOS PWA en background : on libère aussi quand la page perd le focus.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") cleanupFallbackStream();
});

// Une fois l'app prête, on charge phase3 (UX/PWA) en arrière-plan.
// Aucun blocage : la donation + install prompt sont des bonus.
window.addEventListener("mb-app-booted", () => {
  const ric2 = window.requestIdleCallback || ((cb) => setTimeout(cb, 150));
  ric2(async () => {
    try { await import(`/js/phase3.js?v=${APP_VERSION}`); }
    catch (err) { console.warn("[MomentoBooth] phase3 non chargé :", err); }
  });
}, { once: true });
