/* splash-kill.js — retire le splash immédiatement si on est sur le portail
   de rôle (?role=) ou si l'utilisateur a déjà choisi un mode.
   Chargé en <script src> pour respecter le CSP 'self'. */
(function () {
  try {
    var p = new URLSearchParams(location.search);
    var hasRole = p.has("role");
    var stored = localStorage.getItem("momentobooth-role");
    if (!hasRole && !stored) return;
    var s = document.getElementById("app-splash");
    if (s) {
      s.classList.add("done");
      setTimeout(function () { s.remove(); }, 50);
    }
  } catch (e) {
    /* silencieux : si CSP ou localStorage pas dispo, le splash s'auto-retire en 8s */
  }
})();
