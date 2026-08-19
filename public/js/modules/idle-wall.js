/* =========================================================
   modules/idle-wall.js (v122)
   Scène de veille "Mur des photos" — chargée en différé
   par app.js quand enterIdle() est appelé pour la première
   fois. Évite de parser cette logique à chaque démarrage,
   alors qu'elle n'est visible qu'après 30 s d'inactivité.
   ========================================================= */
let _idleWallUrls = [];
let _moduleReady = false;

async function populateIdleWallScene() {
  const grid = document.getElementById("idle-wall-grid");
  const countEl = document.getElementById("idle-wall-count");
  const scene = document.querySelector('.idle-scene[data-idle-scene="5"]');
  if (!grid) return;
  _idleWallUrls.forEach((url) => URL.revokeObjectURL(url));
  _idleWallUrls = [];
  let entries = [];
  try { entries = await (window.mbLoadLocal?.() ?? Promise.resolve([])); } catch { entries = []; }
  let photosOnly = entries.filter((entry) => entry.mediaType !== "gif" && entry.blob);
  // Fallback serveur : si l'appareil n'a pas assez de photos locales
  // (cas de l'iPad invité qui n'a jamais capturé), on tire depuis
  // /api/gallery pour peupler le mur avec les vraies photos serveur.
  if (photosOnly.length < 3) {
    try {
      const res = await fetch("/api/gallery", { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        const remoteCaptures = Array.isArray(body.captures) ? body.captures : [];
        const remotePhotos = [];
        for (const cap of remoteCaptures) {
          const variants = cap.variants || {};
          const variantUrl = variants.filtered || variants.original;
          if (variantUrl) remotePhotos.push({ url: variantUrl, date: cap.createdAt || 0 });
        }
        if (remotePhotos.length >= 3) {
          photosOnly = remotePhotos
            .sort((a, b) => (b.date || 0) - (a.date || 0))
            .slice(0, 5)
            .map((p) => ({ label: "remote", blob: null, remoteUrl: p.url, date: p.date }));
        }
      }
    } catch { /* serveur injoignable : on garde la pool locale */ }
  }
  const styled = photosOnly.filter((entry) => entry.label !== "Original" && entry.label !== "remote");
  const pool = (styled.length ? styled : photosOnly).sort((a, b) => (b.date || 0) - (a.date || 0));
  const recent = pool.slice(0, 5);
  grid.innerHTML = "";
  recent.forEach((entry) => {
    const img = document.createElement("img");
    if (entry.remoteUrl) {
      img.src = entry.remoteUrl;
    } else {
      const url = URL.createObjectURL(entry.blob);
      _idleWallUrls.push(url);
      img.src = url;
    }
    img.alt = "";
    grid.appendChild(img);
  });
  const total = photosOnly.length;
  if (countEl) {
    countEl.textContent = total === 0
      ? "Soyez les premiers à immortaliser la soirée !"
      : `Déjà ${total} photo${total > 1 ? "s" : ""} prise${total > 1 ? "s" : ""} ce soir`;
  }
  if (scene) scene.classList.toggle("idle-scene-wall-empty", total === 0);
}

// Expose pour app.js (premier appel via dynamic import, suivants via window).
window.mbPopulateIdleWall = populateIdleWallScene;

export { populateIdleWallScene };
