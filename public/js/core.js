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
const APP_VERSION = "123";
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

// Une fois l'app prête, on charge phase3 (UX/PWA) en arrière-plan.
// Aucun blocage : la donation + install prompt sont des bonus.
window.addEventListener("mb-app-booted", () => {
  const ric2 = window.requestIdleCallback || ((cb) => setTimeout(cb, 150));
  ric2(async () => {
    try { await import(`/js/phase3.js?v=${APP_VERSION}`); }
    catch (err) { console.warn("[MomentoBooth] phase3 non chargé :", err); }
  });
}, { once: true });
