/* =========================================================
   MomentoBooth PWA — Application principale (v4)
   Tap = minuteur · swipe = filtre en direct · masques visage
   · mode AUTO · portrait (flou) · GIF animé · flash · paramètres
   ========================================================= */
import { FILTERS, filterById, applyPixelFilter, MASK_ICONS } from "./filters.js?v=16";
import { drawMask } from "./masks.js?v=16";
import { FRAMES, drawFrame, framePreview, FRAME_TEXTS } from "./frames.js?v=16";

/* ---------- État ---------- */  const state = {
  stream: null,
  facing: "user",
  filterId: "original",
  backdrop: null,
  chromaEnabled: false,
  timerSeconds: 5,
  counting: false,
  countingPaused: false,
  _resumeCountdown: null,
  logoEnabled: true,      // logo MomentoBooth rogné sur la photo
  logoImage: null,
  autoMode: false,
  autoStableSince: 0,
  autoLastNose: null,
  autoArmed: false,
  portraitMode: false,   // capture double + GIF à chaque prise
  flashMode: "auto",     // auto | on | off
  qualityMax: true,
  trackEnabled: true,
  latestPhoto: null,
  latestGif: null,
  publicUrl: "",
  lastLocalId: null,     // id IndexedDB de la dernière photo
  frameId: "none",       // cadre anniversaire
  frameText: { ...FRAME_TEXTS.default },   // titres éditables
  deleteEnabled: false,  // autoriser la suppression des photos
  landmarker: null,
  face: null,
  faceMask: null,
};

/* ---------- Version (anti-cache) ---------- */
const APP_VERSION = "16"; // ⚠️ doit MATCHER data-app-version de index.html + ?v=16 du SW

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = { capture: $("screen-capture"), result: $("screen-result"), gallery: $("screen-gallery") };
const camera = $("camera");
const cameraZone = $("camera-zone");
const stickerCanvas = $("sticker-canvas");
const filterTrack = $("filter-track");
const countdownEl = $("countdown");
const countdownNumber = $("countdown-number");
const sheetMap = {
  "sheet-timer": $("sheet-timer"),
  "sheet-backdrop": $("sheet-backdrop"),
  "sheet-settings": $("sheet-settings"),
  "sheet-frames": $("sheet-frames"),
};

/* Diagnostic visuel (petite pastille) : s'affiche seulement en cas de souci
   caméra — à copier-coller à l'assistant pour un diagnostic exact. */
function showCamDiag(detail) {
  try {
    let pill = $("cam-diag");
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "cam-diag";
      pill.className = "cam-diag";
      document.body.appendChild(pill);
    }
    pill.textContent = `v${APP_VERSION} | ${detail} | https:${location.protocol === "https:" ? "OUI" : "NON"} | mediaDevices:${navigator.mediaDevices ? "ok" : "absent"}`;
    pill.classList.add("show");
    console.error("[MomentoBooth] diagnostic:", pill.textContent);
  } catch { /* ignore */ }
}

/* ---------- Helpers ---------- */
/* Toast : créé dynamiquement au premier message — AUCUN élément permanent
   dans le HTML (le div vide restait visible en pilule permanente sur l'écran). */
function toast(message) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

/* --- Audio : contexte partagé + sons d'interface forts --- */
let _audioCtx = null;
function audioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (_audioCtx.state === "suspended") { try { _audioCtx.resume(); } catch {} }
  return _audioCtx;
}

/* Son simple : oscillo + enveloppe. gain 0..1 (fort par défaut) */
function playBeep(freq = 880, duration = 0.14, gain = 0.5, type = "sine") {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = type;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.01, gain), now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch { /* no audio */ }
}

/* Sons d'interface dédiés (plus forts, plus riches) */
function sfxTick() {
  playBeep(720, 0.09, 0.45, "square");
  playBeep(1080, 0.06, 0.18, "sine");
}
function sfxFinal() {
  playBeep(660, 0.12, 0.5, "triangle");
  setTimeout(() => playBeep(880, 0.14, 0.55, "triangle"), 130);
  setTimeout(() => playBeep(1320, 0.28, 0.6, "triangle"), 260);
}
function sfxShutter() {
  playBeep(220, 0.12, 0.55, "sawtooth");
  playBeep(1800, 0.06, 0.25, "sine");
}
function sfxOpen() { playBeep(560, 0.07, 0.32, "sine"); playBeep(840, 0.08, 0.28, "sine"); }
function sfxClose() { playBeep(700, 0.06, 0.25, "sine"); }

/* =========================================================
   CAPACITÉS PWA iOS
   ========================================================= */

/* Wake Lock : garde l'écran allumé pendant la capture (iOS 16.4+) */
let _wakeLock = null;
async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator) || _wakeLock) return;
    _wakeLock = await navigator.wakeLock.request("screen");
    _wakeLock.addEventListener("release", () => { _wakeLock = null; });
  } catch { _wakeLock = null; }
}
function releaseWakeLock() {
  try { _wakeLock?.release(); } catch {}
  _wakeLock = null;
}

/* Stockage persistant : évite que iOS purge les photos IndexedDB */
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const persisted = await navigator.storage.persist();
      if (!persisted) console.warn("[MomentoBooth] Stockage persistant refusé");
    }
  } catch { /* non supporté */ }
}

/* Flash plein écran — mode auto : flash seulement si scène sombre */
function isSceneDark() {
  try {
    if (!camera.videoWidth) return false;
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(camera, 0, 0, 96, 96);
    const data = ctx.getImageData(0, 0, 96, 96).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    const avg = sum / (96 * 96);
    return avg < 60; // seuil de luminosité
  } catch { return false; }
}

function flash() {
  if (state.flashMode === "off") return;
  if (state.flashMode === "auto" && !isSceneDark()) return;
  const overlay = $("flash-overlay");
  if (!overlay) return;
  /* ⚠️ Fallback JS : fonctionne MÊME avec « Réduire les animations » activé
     sur iPhone (ce réglage désactive les animations CSS → le flash ne
     s'affichait jamais). */
  overlay.style.transition = "none";
  overlay.style.opacity = "0.95";
  setTimeout(() => {
    overlay.style.transition = "opacity .55s ease-out";
    overlay.style.opacity = "0";
  }, 70);
  /* En plus, l'animation CSS quand elle est autorisée */
  overlay.classList.remove("go");
  void overlay.offsetWidth;
  overlay.classList.add("go");
}

/* =========================================================
   CAMÉRA
   ========================================================= */
async function startCamera() {
  console.log("[MomentoBooth] startCamera appelé");
  const errorEl = $("camera-error");
  try {
    const facing = state.facing === "user" ? "user" : "environment";
    // Essai progressif : 2560 → 1920 → 1280 → sans contrainte.
    // iPhone 11 (front ≤ ~1920×1080) échoue parfois sur les grosses contraintes.
    const attempts = [
      { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1920 } },
      { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
      { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      { facingMode: facing },
    ];
    let stream = null, lastError = null;
    for (const video of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        break;
      } catch (error) { lastError = error; }
    }
    if (!stream) throw lastError || new Error("getUserMedia failed");
    state.stream = stream;
    camera.srcObject = state.stream;
    await camera.play().catch(() => {});
    // On re-synchronise les miniatures avec le vrai flux
    filterThumbs.forEach((item) => { if (item.video && item.hydrated) { item.video.srcObject = state.stream; } });
    buildFilterStrip();
    // Caméra OK → masque l'écran d'erreur s'il était visible
    if (errorEl) errorEl.classList.add("hidden");
    console.log("[MomentoBooth] caméra OK", camera.videoWidth, "x", camera.videoHeight);
    // ⚠️ Watchdog : si la vidéo reste NOIRE (aucune dimension après 2,5 s),
    // on ré-attache le flux (bug iOS connu) puis on affiche un diagnostic.
    setTimeout(() => {
      if (camera.videoWidth === 0 && state.stream) {
        try {
          camera.srcObject = null;
          camera.srcObject = state.stream;
          camera.play().catch(() => {});
        } catch { /* ignore */ }
      }
      if (camera.videoWidth === 0) {
        showCamDiag("flux obtenu mais vidéo noire (width=0)");
      }
    }, 2500);
  } catch (error) {
    // ⚠️ Affiche un écran clair + bouton réessayer au lieu d'un écran noir
    console.error("[MomentoBooth] getUserMedia échec:", error?.name, error?.message);
    showCamDiag(`erreur ${error?.name || "inconnue"}: ${error?.message || ""}`);
    if (errorEl) errorEl.classList.remove("hidden");
    const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    const textEl = errorEl?.querySelector(".camera-error-text");
    if (textEl) {
      textEl.textContent = denied
        ? "Caméra bloquée sur cet iPhone. Réglages → Safari → Caméra → autoriser ce site, puis rechargez. (Si l'app est sur l'écran d'accueil : Réglages → Confidentialité → Caméra.)"
        : `Impossible d'ouvrir la caméra (${error?.name || "erreur inconnue"}). Autorisez l'accès : Réglages → Safari → Caméra, puis rechargez.`;
    }
    toast(denied ? "Caméra bloquée (Réglages → Safari → Caméra)" : "Caméra indisponible : autorisez l'accès");
  }
}

async function flipCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((t) => t.stop());
  state.facing = state.facing === "user" ? "environment" : "user";
  await startCamera();
}

/* =========================================================
   FILTRES : miniatures — vidéo live pour couleurs,
   icône SVG travaillée pour les masques
   ========================================================= */
let filterThumbs = [];
function buildFilterStrip() {
  filterTrack.innerHTML = "";
  filterThumbs = FILTERS.map((filter, index) => {
    const thumb = document.createElement("div");
    thumb.className = `filter-thumb${index === 0 ? " active" : ""}`;
    thumb.dataset.filter = filter.id;

    if (filter.color) {
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.filter = filter.css;
      video.setAttribute("aria-hidden", "true");
      thumb.appendChild(video);
      thumb._video = video;
    } else {
      // Masque : icône SVG travaillée
      const iconWrap = document.createElement("div");
      iconWrap.className = "filter-icon";
      iconWrap.innerHTML = filter.icon || MASK_ICONS[filter.mask] || "";
      thumb.appendChild(iconWrap);
    }

    const name = document.createElement("span");
    name.className = "filter-name";
    name.textContent = filter.name;
    thumb.appendChild(name);

    thumb.addEventListener("click", () => selectFilter(filter.id, thumb));
    filterTrack.appendChild(thumb);
    return { thumb, video: thumb._video, hydrated: false };
  });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const index = Array.from(filterTrack.children).indexOf(entry.target);
      const item = filterThumbs[index];
      if (!item || !item.video) continue;
      if (entry.isIntersecting && !item.hydrated) {
        item.video.srcObject = state.stream;
        item.hydrated = true;
      } else if (!entry.isIntersecting && item.hydrated) {
        item.video.srcObject = null;
        item.hydrated = false;
      }
    }
  }, { root: filterTrack, threshold: 0.15 });
  filterThumbs.forEach((item) => item.video && observer.observe(item.thumb));
}

function selectFilter(id, thumbEl) {
  state.filterId = id;
  // ⚠️ CRITIQUE : applique le filtre EN LIVE sur la grande caméra
  const filter = filterById(id);
  camera.style.filter = filter.css || "none";
  filterThumbs.forEach((item) => item.thumb.classList.toggle("active", item.thumb === thumbEl));
  if (thumbEl) thumbEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  // Vibreur léger
  try { navigator.vibrate?.(10); } catch {}
}

/* =========================================================
   GESTES : tap = minuteur · swipe = filtre en direct
   Pointer events au niveau document (fiable iOS)
   ========================================================= */
let swipeStartX = 0, swipeStartY = 0, swipeRefX = 0, isSwiping = false, swipeActive = false;
const SWIPE_STEP = 56;

function gestureTarget(event) {
  // Ignorer les gestes sur la barre, les filtres, les sheets et les boutons
  if (event.target.closest(".filter-strip")) return "strip";
  if (event.target.closest(".bottom-bar")) return "ui";
  if (event.target.closest(".sheet")) return "ui";
  if (event.target.closest(".result-actions")) return "ui";
  if (event.target.closest(".gallery-head") || event.target.closest(".gallery-tools")) return "ui";
  return "cam";
}

document.addEventListener("pointerdown", (event) => {
  // Pendant le compte à rebours : un tap = pause / reprise
  if (state.counting) {
    toggleCountdownPause();
    return;
  }
  if (gestureTarget(event) !== "cam") return;
  if (screens.result.classList.contains("active") || screens.gallery.classList.contains("active")) return;
  swipeActive = true;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeRefX = swipeStartX;
  isSwiping = false;
}, { passive: true });

document.addEventListener("pointermove", (event) => {
  if (!swipeActive || state.counting) return;
  const dx = event.clientX - swipeRefX;
  const dy = Math.abs(event.clientY - swipeStartY);
  if (Math.abs(dx) < SWIPE_STEP) return;
  if (dy > Math.abs(dx) * 1.4) return; // vertical → pas un swipe
  isSwiping = true;
  const steps = Math.round(dx / SWIPE_STEP);
  if (steps !== 0) {
    const index = FILTERS.findIndex((f) => f.id === state.filterId);
    const next = Math.max(0, Math.min(FILTERS.length - 1, index + steps));
    const thumb = document.querySelector(`.filter-thumb[data-filter="${FILTERS[next].id}"]`);
    selectFilter(FILTERS[next].id, thumb);
    swipeRefX += steps * SWIPE_STEP;
  }
}, { passive: true });

document.addEventListener("pointerup", (event) => {
  if (!swipeActive) return;
  swipeActive = false;
  if (state.counting) return;
  if (isSwiping) return; // c'était un swipe
  if (gestureTarget(event) !== "cam") return;
  openSheet("sheet-timer");
}, { passive: true });

document.addEventListener("pointercancel", () => { swipeActive = false; });

/* =========================================================
   MINUTEUR
   ========================================================= */
function buildTimerOptions() {
  const box = $("timer-options");
  if (!box) return;
  box.innerHTML = "";
  const durations = [
    { s: 5, label: "5", sub: "secondes", big: "5s" },
    { s: 10, label: "10", sub: "secondes", big: "10s" },
    { s: 15, label: "15", sub: "secondes", big: "15s" },
    { s: 20, label: "20", sub: "secondes", big: "20s" },
  ];
  durations.forEach((d, index) => {
    const chip = document.createElement("button");
    chip.className = `timer-chip big${index === 0 ? " active" : ""}`;
    chip.innerHTML = `${d.big}<small>${d.sub}</small>`;
    chip.addEventListener("click", () => {
      state.timerSeconds = d.s;
      document.querySelectorAll(".timer-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      sheetMap["sheet-timer"].classList.remove("open");
      sfxOpen();
      startCountdown();
    });
    box.appendChild(chip);
  });
}

/* Pause / reprise au tap pendant le compte à rebours */
function toggleCountdownPause() {
  if (!state.counting) return;
  state.countingPaused = !state.countingPaused;
  const pauseBadge = $("countdown-pause");
  if (pauseBadge) pauseBadge.classList.toggle("hidden", !state.countingPaused);
  countdownEl.classList.toggle("paused", state.countingPaused);
  sfxOpen();
  if (!state.countingPaused && state._resumeCountdown) {
    const resume = state._resumeCountdown;
    state._resumeCountdown = null;
    resume();
  }
}

async function startCountdown() {
  if (state.counting) return;
  state.counting = true;
  state.countingPaused = false;
  const pauseBadge = $("countdown-pause");
  if (pauseBadge) pauseBadge.classList.add("hidden");
  countdownEl.classList.remove("paused");
  document.body.classList.add("ui-hidden"); // masque l'interface pendant le compte à rebours
  document.body.classList.add("counting-mode");
  requestWakeLock(); // l'écran ne s'éteint pas pendant le compte à rebours
  countdownEl.classList.remove("hidden");
  let remaining = state.timerSeconds;
  countdownNumber.textContent = String(remaining);

  const tick = async () => {
    // Si l'utilisateur a mis en pause, on attend la reprise
    if (state.countingPaused) {
      await new Promise((resolve) => { state._resumeCountdown = resolve; });
    }
    sfxTick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    remaining -= 1;
    if (remaining > 0) {
      countdownNumber.textContent = String(remaining);
      return tick();
    }
    sfxFinal();
    countdownEl.classList.add("hidden");
    try {
      await capture();
    } finally {
      // ⚠️ Toujours réafficher l'interface même si la capture échoue,
      // sinon l'app reste verrouillée ("plus rien ne marche")
      document.body.classList.remove("ui-hidden");
      document.body.classList.remove("counting-mode");
      releaseWakeLock();
      state.counting = false;
      state._resumeCountdown = null;
    }
    return null;
  };
  await tick();
}

/* =========================================================
   DÉTECTION VISAGE + TRACK + MODE AUTO
   ========================================================= */
async function initFaceLandmarker() {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("./mediapipe/vision_bundle.mjs?v=16");
    const fileset = await FilesetResolver.forVisionTasks("./mediapipe/wasm");
    state.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "./mediapipe/face_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceSegmentationMasks: true,
    });
  } catch { state.landmarker = null; }
}

function detectFace() {
  if (!state.landmarker || !state.stream) return;
  try {
    const result = state.landmarker.detectForVideo(camera, performance.now());
    state.face = result.faceLandmarks?.[0] ?? null;
    state.faceMask = result.segmentationMasks?.[0] ?? null;
    updateAutoMode();
    drawLiveOverlay();
  } catch { state.face = null; state.faceMask = null; }
}

/* Overlay live : masque + tracker */
function drawLiveOverlay() {
  const ctx = stickerCanvas.getContext("2d");
  ctx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
  const filter = filterById(state.filterId);

  if (filter.mask !== "none" && state.face && state.face.length > 30) {
    drawMask(ctx, stickerCanvas.width, stickerCanvas.height, state.face, filter.mask);
  }

  // Tracker visage : cadre doré sur les visages, disparaît après délai
  if (state.trackEnabled || state.autoMode) {
    drawHeadTracker(ctx);
  }
}

function faceBox(face, cw, ch, vw, vh) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of face) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  return {
    x: minX * vw * scale + ox,
    y: minY * vh * scale + oy,
    w: (maxX - minX) * vw * scale,
    h: (maxY - minY) * vh * scale,
  };
}

function drawHeadTracker(ctx) {
  if (!state.face || state.face.length < 30) {
    // Visage quitté → le prochain visage aura un nouveau tracker
    state._trackStart = null;
    return;
  }
  const cw = stickerCanvas.width, ch = stickerCanvas.height;
  const vw = camera.videoWidth || 1280, vh = camera.videoHeight || 960;
  const box = faceBox(state.face, cw, ch, vw, vh);
  const now = performance.now();
  // Le cadre apparaît dès qu'un visage est détecté, disparaît après 2,5 s
  if (!state._trackStart) state._trackStart = now;
  if (now - state._trackStart > 2500) {
    state._trackStart = null;
    return;
  }
  ctx.save();
  ctx.strokeStyle = state.autoMode ? "rgba(240,201,106,.95)" : "rgba(125,211,252,.9)";
  ctx.lineWidth = 4;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.roundRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16, 22);
  ctx.stroke();
  // Coins accentués (curseur)
  const k = 18;
  ctx.lineWidth = 6;
  ctx.beginPath();
  const X = box.x - 10, Y = box.y - 10, W = box.w + 20, H = box.h + 20;
  ctx.moveTo(X, Y + k); ctx.lineTo(X, Y); ctx.lineTo(X + k, Y);
  ctx.moveTo(X + W - k, Y); ctx.lineTo(X + W, Y); ctx.lineTo(X + W, Y + k);
  ctx.moveTo(X + W, Y + H - k); ctx.lineTo(X + W, Y + H); ctx.lineTo(X + W - k, Y + H);
  ctx.moveTo(X + k, Y + H); ctx.lineTo(X, Y + H); ctx.lineTo(X, Y + H - k);
  ctx.stroke();
  ctx.restore();
}

/* Mode AUTO */
function updateAutoMode() {
  const statusEl = $("auto-status");
  const statusText = $("auto-status-text");
  if (!state.autoMode || state.counting) {
    if (statusEl && !statusEl.classList.contains("hidden")) statusEl.classList.add("hidden");
    return;
  }
  statusEl.classList.remove("hidden");
  const face = state.face;
  const now = performance.now();
  if (!face || face.length < 30) {
    state.autoArmed = false;
    state.autoStableSince = 0;
    state.autoLastNose = null;
    statusText.textContent = "Regardez la caméra…";
    statusEl.classList.remove("armed");
    return;
  }
  const nose = face[1];
  if (!state.autoLastNose) {
    state.autoLastNose = { x: nose.x, y: nose.y };
    state.autoStableSince = now;
    statusText.textContent = "Tête détectée — restez immobile…";
    return;
  }
  const dx = (nose.x - state.autoLastNose.x) * 1000;
  const dy = (nose.y - state.autoLastNose.y) * 1000;
  const moved = Math.sqrt(dx * dx + dy * dy);
  state.autoLastNose = { x: nose.x, y: nose.y };

  if (moved > 6) {
    state.autoStableSince = now;
    state.autoArmed = false;
    statusText.textContent = "Restez immobile…";
    statusEl.classList.remove("armed");
    return;
  }
  if (now - state.autoStableSince > 2000 && !state.autoArmed) {
    state.autoArmed = true;
    statusText.textContent = "Capture !";
    statusEl.classList.add("armed");
    void capture();
  }
}

function toggleAutoMode() {
  state.autoMode = !state.autoMode;
  const btn = $("btn-auto");
  btn.classList.toggle("active", state.autoMode);
  if (!state.autoMode) {
    state.autoArmed = false;
    $("auto-status").classList.add("hidden");
    releaseWakeLock();
    toast("Mode manuel");
  } else {
    state.autoStableSince = 0;
    state.autoLastNose = null;
    requestWakeLock(); // le mode AUTO attend le visage : écran toujours allumé
    toast("Mode AUTO — placez-vous face caméra");
  }
}

/* =========================================================
   CAPTURE : simple ou portrait (double + GIF)
   ========================================================= */
function ratioOf(video) {
  return (video.videoWidth || 1280) / (video.videoHeight || 960);
}

async function capture() {
  if (state.portraitMode || state.autoMode) {
    await capturePortrait();
    return;
  }
  const blob = await grabFrame();
  state.latestPhoto = blob;
  flash();
  playBeep(1200, 0.2, 0.3);
  showResult([{ blob, label: "Photo" }]);
}

/* Portrait : photo normale + flou + GIF animé (pré + post) */
async function capturePortrait() {
  if (state.counting) return;
  state.counting = true;
  sfxShutter();
  try {
    // Le GIF démarre AVANT la capture (buffer continu) — la photo est capturée
    // pendant que le buffer tourne, puis le GIF se termine un peu APRÈS.
    gifStartPre();
    const normal = await grabFrame();
    const portrait = await grabFramePortrait();
    const gif = await grabGif(6);
    if (state.autoMode) state.autoArmed = false;
    flash();
    state.latestPhoto = normal;
    state.latestGif = gif;
    const items = [
      { blob: normal, label: "Normal" },
      { blob: portrait ? portrait.blob : normal, label: "Portrait" },
    ];
    if (gif) items.push({ blob: gif, label: "GIF", gif: true });
    showResult(items);
  } finally {
    // ⚠️ Stoppe toujours le buffer GIF (sinon fuite : intervalle à 140 ms)
    gifStopPre();
    state.counting = false;
  }
}

/* =========================================================
   GRAFFRAME : capture haute qualité avec filtre + masque
   ========================================================= */
function drawVideoFrame(ctx, video, W, H, skipFrame = false) {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = W / H;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }
  ctx.save();
  if (state.facing === "user") {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  ctx.restore();

  const filter = filterById(state.filterId);
  if (filter.ops.length) {
    const imageData = ctx.getImageData(0, 0, W, H);
    applyPixelFilter(imageData, state.filterId);
    ctx.putImageData(imageData, 0, 0);
  }

  if (filter.mask !== "none") {
    ctx.save();
    if (state.facing === "user") {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    drawMask(ctx, W, H, state.face, filter.mask);
    ctx.restore();
  }

  // Cadre anniversaire (par-dessus tout, pas de miroir)
  if (!skipFrame) drawFrame(ctx, W, H, state.frameId, state.frameText);
  // Logo MomentoBooth rogné (déjà dessiné à plat, pas de miroir)
  if (!skipFrame) drawLogo(ctx, W, H);
}

/* Logo MomentoBooth : rogné en rond, en bas à droite de la photo */
function drawLogo(ctx, W, H) {
  if (!state.logoEnabled || !state.logoImage) return;
  const size = Math.max(44, Math.min(W, H) * 0.15);
  const margin = Math.max(12, Math.min(W, H) * 0.03);
  const x = W - size - margin;
  const y = H - size - margin;
  ctx.save();
  // Rognage circulaire du logo
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(state.logoImage, x, y, size, size);
  ctx.restore();
  // Liseré blanc élégant
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();
}

function grabFrame() {
  return new Promise((resolve) => {
    const video = camera;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    const cap = state.qualityMax ? 2160 : 1440;
    const scale = Math.min(1, cap / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);
    canvas.width = W; canvas.height = H;

    /* Finalise : copie brute (sans cadre, pour re-personnaliser à l'export)
       puis cadre + logo par-dessus pour la photo livrée */
    const finalize = () => {
      try {
        const rawCanvas = document.createElement("canvas");
        rawCanvas.width = W; rawCanvas.height = H;
        rawCanvas.getContext("2d").drawImage(canvas, 0, 0);
        rawCanvas.toBlob((raw) => { state.latestRaw = raw ?? null; }, "image/jpeg", 0.97);
      } catch { state.latestRaw = null; }
      drawFrame(ctx, W, H, state.frameId, state.frameText);
      drawLogo(ctx, W, H);
      canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.97);
    };

    if (state.backdrop) {
      if (state.backdrop.type === "gradient") {
        const grad = ctx.createLinearGradient(0, 0, W, H);
        const stops = state.backdrop.css.match(/#[0-9a-f]{6}/gi) ?? [];
        stops.forEach((color, idx) => grad.addColorStop(idx / Math.max(1, stops.length - 1), color));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      } else if (state.backdrop.type === "image") {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, W, H);
          drawVideoFrame(ctx, video, W, H, true); // sans cadre → finalize l'ajoute
          finalize();
        };
        img.src = state.backdrop.url;
        return;
      }
    }

    drawVideoFrame(ctx, video, W, H, true); // contenu brut (vidéo + filtre + masque)
    finalize();
  });
}

/* Vrai flou : downscale progressif puis upscale (lisse, pas de crénelage) */
function makeBlur(src, W, H) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  // 1) downscale agressif en 3 étapes
  let w = W, h = H;
  let from = src;
  for (let i = 0; i < 3; i++) {
    w = Math.max(40, Math.round(w / 3));
    h = Math.max(30, Math.round(h / 3));
    const step = document.createElement("canvas");
    step.width = w; step.height = h;
    const sctx = step.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(from, 0, 0, w, h);
    from = step;
  }
  // 2) upscale vers la taille finale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(from, 0, 0, W, H);
  return canvas;
}

/* Capture avec blur portrait */
function grabFramePortrait() {
  return new Promise((resolve) => {
    const video = camera;
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
    const cap = state.qualityMax ? 2160 : 1440;
    const scale = Math.min(1, cap / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);

    const net = document.createElement("canvas");
    net.width = W; net.height = H;
    const nctx = net.getContext("2d", { willReadFrequently: true });
    drawVideoFrame(nctx, video, W, H);

    const blurBase = makeBlur(net, W, H);

    const mask = state.faceMask;
    if (mask && typeof mask.getAsFloat32Array === "function") {
      try {
        const values = mask.getAsFloat32Array();
        const mw = mask.width, mh = mask.height;
        const imgData = nctx.createImageData(mw, mh);
        for (let i = 0; i < values.length; i++) {
          const a = Math.round(values[i] * 255);
          const col = state.facing === "user" ? mw - 1 - (i % mw) : (i % mw);
          const j = (Math.floor(i / mw) * mw + col) * 4;
          imgData.data[j] = 255;
          imgData.data[j + 1] = 255;
          imgData.data[j + 2] = 255;
          imgData.data[j + 3] = a;
        }
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = mw; maskCanvas.height = mh;
        maskCanvas.getContext("2d").putImageData(imgData, 0, 0);

        const netMasked = document.createElement("canvas");
        netMasked.width = W; netMasked.height = H;
        const mctx = netMasked.getContext("2d");
        mctx.drawImage(net, 0, 0);
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(maskCanvas, 0, 0, W, H);

        const out = document.createElement("canvas");
        out.width = W; out.height = H;
        const octx = out.getContext("2d");
        octx.drawImage(blurBase, 0, 0);
        octx.drawImage(netMasked, 0, 0);
        out.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.97);
        return;
      } catch { /* fallback */ }
    }

    // Fallback : ovale de visage net sur fond flou
    if (state.face && state.face.length > 30) {
      const l = state.face;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of l) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      const cx = (minX + maxX) / 2 * W, cy = (minY + maxY) / 2 * H;
      const rw = (maxX - minX) * W * 1.7, rh = (maxY - minY) * H * 1.9;
      const bctx = blurBase.getContext("2d");
      bctx.save();
      bctx.beginPath();
      bctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      bctx.clip();
      bctx.drawImage(net, 0, 0);
      bctx.restore();
    }
    blurBase.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.97);
  });
}

/* GIF animé : pré-enregistrement en continu + post-frames.
   Le GIF démarre UN PEU AVANT la photo (buffer) et se finit
   UN PEU APRÈS (frames supplémentaires) — comme demandé. */
const gifRec = { frames: [], running: false, W: 480, H: 0, timer: null, canvas: null, ctx: null };

function gifStartPre() {
  if (gifRec.running) return;
  const video = camera;
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
  gifRec.W = 480;
  gifRec.H = Math.max(320, Math.round(480 / (vw / vh)));
  if (!gifRec.canvas) {
    gifRec.canvas = document.createElement("canvas");
    gifRec.ctx = gifRec.canvas.getContext("2d");
  }
  gifRec.canvas.width = gifRec.W;
  gifRec.canvas.height = gifRec.H;
  gifRec.frames = [];
  gifRec.running = true;
  const tick = () => {
    if (!gifRec.running) return;
    drawVideoFrame(gifRec.ctx, camera, gifRec.W, gifRec.H);
    // Clone de la frame (copie pixel par pixel pour que chaque frame reste figée)
    const clone = document.createElement("canvas");
    clone.width = gifRec.W; clone.height = gifRec.H;
    clone.getContext("2d").drawImage(gifRec.canvas, 0, 0);
    gifRec.frames.push(clone);
    if (gifRec.frames.length > 14) gifRec.frames.shift(); // garde ~2s de buffer
  };
  tick();
  gifRec.timer = setInterval(tick, 140);
}

function gifStopPre() {
  gifRec.running = false;
  if (gifRec.timer) { clearInterval(gifRec.timer); gifRec.timer = null; }
}

/* Rend le GIF : frames pré (déjà capturées) + N frames post (capturées maintenant) */
function grabGif(postFrames = 6) {
  return new Promise((resolve) => {
    try {
      const GifWriter = window.GIF;
      if (!GifWriter) { gifStopPre(); return resolve(null); }
      gifStopPre();
      const W = gifRec.W, H = gifRec.H;
      const gif = new GifWriter({
        workers: 1,
        quality: 8,
        width: W,
        height: H,
        workerScript: "/js/vendor/gif.worker.js",
      });
      let sent = 0;
      // 1) pré : tout le buffer (le plus ancien d'abord)
      gifRec.frames.forEach((c) => { gif.addFrame(c.getContext("2d"), { copy: true, delay: 140 }); });
      const takePost = () => {
        if (sent >= postFrames) {
          gif.render();
          gif.on("finished", (blob) => resolve(blob));
          return;
        }
        drawVideoFrame(gifRec.ctx, camera, W, H);
        const clone = document.createElement("canvas");
        clone.width = W; clone.height = H;
        clone.getContext("2d").drawImage(gifRec.canvas, 0, 0);
        gif.addFrame(clone.getContext("2d"), { copy: true, delay: 140 });
        sent += 1;
        setTimeout(takePost, 140);
      };
      takePost();
    } catch { gifStopPre(); resolve(null); }
  });
}

/* =========================================================
   RÉSULTAT (grille : normal + portrait + gif)
   ========================================================= */
function showResult(items) {
  if (!items || !items.length) { toast("Capture impossible"); return; }
  const grid = $("result-grid");
  grid.innerHTML = "";
  grid.classList.toggle("multi", items.length >= 3);
  items.forEach((item, index) => {
    const wrap = document.createElement("div");
    wrap.className = "result-item";
    const img = document.createElement("img");
    img.className = item.gif ? "result-image gif" : "result-image";
    img.dataset.index = index;
    if (!item.gif) img.addEventListener("click", () => { state.latestPhoto = item.blob; });
    if (item.gif) {
      // Séquence : on voit d'abord la photo, puis après un petit temps le GIF se lance
      const photoItem = items.find((i) => !i.gif) ?? items[0];
      const photoUrl = URL.createObjectURL(photoItem.blob);
      const gifUrl = URL.createObjectURL(item.blob);
      img.src = photoUrl;
      setTimeout(() => {
        URL.revokeObjectURL(photoUrl); // libère la photo temporaire
        img.src = gifUrl;
        img.classList.add("playing");
      }, 1400);
      img.addEventListener("click", () => { if (state.latestGif) state.latestGif = item.blob; });
    } else {
      img.src = URL.createObjectURL(item.blob);
    }
    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = item.label;
    wrap.appendChild(img);
    wrap.appendChild(label);
    grid.appendChild(wrap);
  });
  $("share-status").textContent = "";
  $("share-qr-box").classList.add("hidden");
  $("share-box").style.display = "none";
  screens.capture.classList.remove("active");
  screens.result.classList.add("active");
}

function showCapture() {
  screens.result.classList.remove("active");
  screens.gallery.classList.remove("active");
  screens.capture.classList.add("active");
  state.publicUrl = "";
  $("share-qr-box").classList.add("hidden");
  $("share-status").textContent = "";
}

async function shareMethod(method) {
  const status = $("share-status");
  const publicUrl = state.publicUrl || window.location.href;
  const text = "Ma photo MomentoBooth 📸";
  try {
    if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "WhatsApp ouvert ✓";
    } else if (method === "sms") {
      window.open(`sms:?&body=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "SMS ouvert ✓";
    } else if (method === "email") {
      window.open(`mailto:?subject=${encodeURIComponent("Ma photo MomentoBooth")}&body=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "Email ouvert ✓";
    } else if (method === "native") {
      if (navigator.share) {
        navigator.share({ title: "MomentoBooth", text, url: publicUrl }).then(() => {
          status.textContent = "Partagé ✓";
        }).catch(() => {});
      } else {
        status.textContent = "Partage natif indisponible";
      }
    } else if (method === "qrcode") {
      $("share-qr-box").classList.remove("hidden");
      $("share-qr").src = `/api/qr?url=${encodeURIComponent(publicUrl)}`;
      status.textContent = "QR affiché — scannez pour la photo";
    } else if (method === "download") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(state.latestPhoto);
      a.download = `momentobooth-${Date.now()}.jpg`;
      a.click();
      status.textContent = "Téléchargé ✓";
    } else if (method === "download-gif") {
      if (state.latestGif) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(state.latestGif);
        a.download = `momentobooth-${Date.now()}.gif`;
        a.click();
        status.textContent = "GIF téléchargé ✓";
      } else {
        status.textContent = "Pas de GIF (mode photo simple)";
      }
    } else if (method === "photos") {
      await saveToPhotos(state.latestPhoto);
    }
  } catch { status.textContent = "Erreur partage"; }
}

/* =========================================================
   GALERIE
   ========================================================= */
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("momentobooth", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveLocal(blob) {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("photos", "readwrite");
    tx.objectStore("photos").put({ id, blob, date: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}
async function loadLocal() {
  const d = await db();
  return new Promise((resolve) => {
    const tx = d.transaction("photos", "readonly");
    const req = tx.objectStore("photos").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => resolve([]);
  });
}

async function uploadPhoto(blob) {
  const id = await saveLocal(blob);
  state.lastLocalId = id;
  const form = new FormData();
  form.append("photo", blob, `${id}.jpg`);
  try {
    const response = await fetch("/api/photos", { method: "POST", body: form });
    if (response.ok) {
      const data = await response.json();
      state.publicUrl = data.publicUrl || data.url || "";
    }
  } catch { /* serveur optionnel */ }
}

async function renderGallery() {
  const grid = $("gallery-grid");
  grid.innerHTML = "";
  const photos = await loadLocal();
  let serverPhotos = [];
  try {
    const response = await fetch("/api/photos", { cache: "no-store" });
    if (response.ok) serverPhotos = (await response.json()).photos ?? [];
  } catch { /* serveur optionnel */ }
  const serverById = new Map(serverPhotos.map((p) => [p.id, p]));
  const unique = new Map();
  photos.forEach((p) => unique.set(p.id, p));
  serverPhotos.forEach((p) => { if (!unique.has(p.id)) unique.set(p.id, p); });
  const all = [...unique.values()].sort((a, b) => (b.date ?? b.createdAt ?? 0) - (a.date ?? a.createdAt ?? 0));
  $("gallery-count").textContent = `${all.length} photo${all.length > 1 ? "s" : ""}`;
  if (!all.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:60px 20px;font-size:18px;font-weight:700">Aucune photo — touchez l\'écran pour commencer !</p>';
    return;
  }
  all.forEach((photo) => {
    const wrap = document.createElement("div");
    wrap.className = "gallery-cell";
    const img = document.createElement("img");
    img.src = photo.blob ? URL.createObjectURL(photo.blob) : (serverById.get(photo.id)?.url ?? "");
    img.loading = "lazy";
    img.addEventListener("click", () => {
      if (photo.blob) { state.latestPhoto = photo.blob; state.latestRaw = photo.blob; }
      else fetch(serverById.get(photo.id).url).then((r) => r.blob()).then((blob) => { state.latestPhoto = blob; state.latestRaw = blob; });
      if (photo.blob) state.lastLocalId = photo.id; // commentaire sur cette photo locale
      screens.gallery.classList.remove("active");
      screens.result.classList.add("active");
      $("result-grid").innerHTML = "";
      $("result-grid").classList.remove("multi");
      const rwrap = document.createElement("div");
      rwrap.className = "result-item";
      const rimg = document.createElement("img");
      rimg.src = img.src;
      rimg.className = "result-image";
      rwrap.appendChild(rimg);
      $("result-grid").appendChild(rwrap);
      $("share-box").style.display = "none";
      $("share-status").textContent = "";
      $("share-qr-box").classList.add("hidden");
      // Commentaire existant
      const savedComment = photos.find((p) => p.id === photo.id)?.comment;
      $("photo-comment").value = savedComment || "";
    });
    wrap.appendChild(img);
    // Heure de la photo (date stockée en IndexedDB / serveur)
    const ts = photo.date ?? photo.createdAt ?? null;
    if (ts) {
      const timeBadge = document.createElement("span");
      timeBadge.className = "gallery-time";
      const d = new Date(ts);
      timeBadge.textContent = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      wrap.appendChild(timeBadge);
    }
    // Badge commentaire
    if (photo.comment) {
      const badge = document.createElement("span");
      badge.className = "gallery-comment";
      badge.textContent = "💬";
      badge.title = photo.comment;
      wrap.appendChild(badge);
    }
    // Bouton suppression (si activé)
    if (state.deleteEnabled) {
      const delBtn = document.createElement("button");
      delBtn.className = "gallery-delete";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Supprimer cette photo ?")) return;
        await deletePhoto(photo.id, serverById.has(photo.id));
        renderGallery();
      });
      wrap.appendChild(delBtn);
    }
    grid.appendChild(wrap);
  });
}

async function deletePhoto(id, isServer) {
  // Local
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch { /* pas en local */ }
  // Serveur
  if (isServer) {
    try { await fetch(`/api/photos/${id}`, { method: "DELETE" }); } catch { /* serveur optionnel */ }
  }
  toast("Photo supprimée");
}

/* Export ZIP de toutes les photos */
async function exportZip() {
  if (!window.JSZip) { toast("ZIP indisponible"); return; }
  const photos = await loadLocal();
  if (!photos.length) { toast("Aucune photo locale"); return; }
  toast("Création du ZIP…");
  const zip = new JSZip();
  const folder = zip.folder("momentobooth");
  const names = new Set();
  photos.forEach((photo) => {
    let name = `photo-${photo.id.split("-").pop() || photo.id}.jpg`;
    while (names.has(name)) name = `photo-${Math.random().toString(36).slice(2, 6)}.jpg`;
    names.add(name);
    folder.file(name, photo.blob);
  });
  try {
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `momentobooth-${Date.now()}.zip`;
    a.click();
    toast(`ZIP exporté (${photos.length} photos)`);
  } catch { toast("Erreur export ZIP"); }
}

/* Enregistrer toutes les photos dans la galerie iOS (Web Share API files) */
async function saveAllToPhotos() {
  const photos = await loadLocal();
  if (!photos.length) { toast("Aucune photo locale"); return; }
  const files = photos.map((p) => new File([p.blob], `momentobooth-${p.id}.jpg`, { type: "image/jpeg" }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: "MomentoBooth" });
      toast("Enregistrées dans Photos ✓");
    } catch { toast("Partage annulé"); }
  } else {
    // Fallback : télécharger une par une
    files.forEach((file, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
    }, i * 500));
    toast("Téléchargement des photos…");
  }
}

/* Enregistrer une photo dans Photos iOS (Web Share API files) */
async function saveToPhotos(blob) {
  if (!blob) { toast("Pas de photo"); return; }
  const file = new File([blob], `momentobooth-${Date.now()}.jpg`, { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "MomentoBooth" }); toast("Enregistrée dans Photos ✓"); }
    catch { /* annulé */ }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    toast("Téléchargée ✓");
  }
}

/* Commentaire sur la photo courante */
async function saveComment() {
  const value = $("photo-comment").value.trim();
  if (!value) { toast("Écrivez un commentaire"); return; }
  if (!state.lastLocalId) {
    // La photo doit d'abord être sauvegardée
    toast("Sauvegardez d'abord la photo");
    return;
  }
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      const get = store.get(state.lastLocalId);
      get.onsuccess = () => {
        if (get.result) store.put({ ...get.result, comment: value });
      };
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    toast("Commentaire ajouté 💬");
  } catch { toast("Erreur commentaire"); }
}

/* =========================================================
   CADRES ANNIVERSAIRE
   ========================================================= */
function bindFrameTextEdit() {
  const input1 = $("frame-text-1");
  const input2 = $("frame-text-2");
  if (!input1 || !input2) return;
  // Pré-remplir avec le titre actuel
  input1.value = state.frameText.line1 || "";
  input2.value = state.frameText.line2 || "";
  const apply = () => {
    const line1 = input1.value.trim() || "18 ANS";
    const line2 = input2.value.trim() || "Lilou & Kenza";
    state.frameText = { line1, line2 };
    toast("Titre du cadre : « " + line1 + " / " + line2 + " » ✓");
    // Si on est sur l'écran résultat, ré-appliquer le cadre sur la photo brute
    if (screens.result.classList.contains("active")) reframeLatest();
  };
  $("btn-apply-frame-text")?.addEventListener("click", apply);
  [input1, input2].forEach((input) => {
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  });
}

/* Re-génère la photo courante avec le cadre + le titre choisis (depuis la photo brute) */
async function reframeLatest() {
  const raw = state.latestRaw;
  if (!raw) { toast("Prenez d'abord une photo"); return; }
  if (state.frameId === "none") { toast("Choisissez d'abord un cadre"); return; }
  toast("Application du cadre…");
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    drawFrame(ctx, W, H, state.frameId, state.frameText);
    drawLogo(ctx, W, H);
    canvas.toBlob((blob) => {
      if (!blob) { toast("Erreur de rendu"); return; }
      state.latestPhoto = blob;
      // Met à jour la première image du résultat (la photo)
      const firstImg = document.querySelector("#result-grid .result-image:not(.gif)");
      if (firstImg) {
        const url = URL.createObjectURL(blob);
        firstImg.onload = () => URL.revokeObjectURL(url);
        firstImg.src = url;
      }
      toast("Cadre appliqué ✓");
    }, "image/jpeg", 0.97);
  };
  img.src = URL.createObjectURL(raw);
}

function buildFrameOptions() {
  const box = $("frame-options");
  if (!box) return;
  box.innerHTML = "";
  FRAMES.forEach((frame) => {
    const chip = document.createElement("button");
    chip.className = `frame-chip${frame.id === state.frameId ? " active" : ""}`;
    chip.dataset.frame = frame.id;
    const img = document.createElement("img");
    img.src = framePreview(frame.id);
    img.alt = frame.name;
    const name = document.createElement("span");
    name.textContent = frame.name;
    chip.appendChild(img);
    chip.appendChild(name);
    chip.addEventListener("click", () => {
      state.frameId = frame.id;
      document.querySelectorAll(".frame-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      toast(frame.id === "none" ? "Cadre retiré" : `Cadre : ${frame.name}`);
      // À l'export : applique directement le cadre choisi sur la photo affichée
      if (screens.result.classList.contains("active")) reframeLatest();
    });
    box.appendChild(chip);
  });
}

/* =========================================================
   FONDS
   ========================================================= */
function buildBackdropOptions() {
  const box = $("backdrop-options");
  if (!box) return;
  box.innerHTML = "";
  const gradients = [
    { id: null, name: "Aucun", css: "" },
    { id: "sunset", name: "Coucher", css: "linear-gradient(135deg,#f97316,#db2777)" },
    { id: "ocean", name: "Océan", css: "linear-gradient(135deg,#0ea5e9,#2563eb)" },
    { id: "forest", name: "Forêt", css: "linear-gradient(135deg,#22c55e,#166534)" },
    { id: "royal", name: "Royal", css: "linear-gradient(135deg,#a855f7,#4c1d95)" },
    { id: "gold", name: "Or", css: "linear-gradient(135deg,#fbbf24,#92400e)" },
    { id: "night", name: "Nuit", css: "linear-gradient(135deg,#0f172a,#1e293b)" },
    { id: "rose", name: "Rose", css: "linear-gradient(135deg,#f472b6,#9d174d)" },
  ];
  gradients.forEach((g) => {
    const swatch = document.createElement("button");
    swatch.className = "backdrop-swatch";
    if (g.id === null) {
      swatch.classList.add("pattern");
      swatch.textContent = "✕";
    } else {
      swatch.style.background = g.css;
    }
    swatch.dataset.name = g.name;
    swatch.addEventListener("click", () => {
      state.backdrop = g.id ? { type: "gradient", css: g.css } : null;
      document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      toast(g.id ? `Fond : ${g.name}` : "Fond retiré");
    });
    box.appendChild(swatch);
  });
}

/* =========================================================
   PARAMÈTRES
   ========================================================= */
/* bindDefensif : attache un listener uniquement si l'élément existe.
   ⚠️ CRITIQUE : si l'iPhone sert un mélange de versions (cache SW),
   un élément manquant ne doit JAMAIS faire crasher init() avant la caméra. */
function on(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
}

function bindSettings() {
  on("set-portrait", "change", (e) => {
    state.portraitMode = e.target.checked;
    toast(state.portraitMode ? "Mode portrait : photo + flou + GIF" : "Mode portrait off");
  });
  // Flash : Auto / On / Off
  document.querySelectorAll("#flash-modes button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.flashMode = btn.dataset.flash;
      document.querySelectorAll("#flash-modes button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      toast(btn.dataset.flash === "auto" ? "Flash auto (si sombre)" : btn.dataset.flash === "on" ? "Flash toujours ✓" : "Flash désactivé");
      // Aperçu : l'écran flashe immédiatement pour confirmer l'activation
      if (btn.dataset.flash === "on") flash();
    });
  });
  on("set-quality", "change", (e) => {
    state.qualityMax = e.target.checked;
    toast(state.qualityMax ? "Qualité maximale (4K)" : "Qualité standard");
  });
  on("set-track", "change", (e) => { state.trackEnabled = e.target.checked; });
  // Logo sur la photo
  on("set-logo", "change", (e) => {
    state.logoEnabled = e.target.checked;
    toast(state.logoEnabled ? "Logo MomentoBooth affiché sur la photo" : "Logo retiré");
  });
  on("set-delete", "change", (e) => {
    state.deleteEnabled = e.target.checked;
    toast(state.deleteEnabled ? "Suppression des photos activée" : "Suppression désactivée");
  });
  on("btn-clear-backdrop", "click", () => {
    state.backdrop = null;
    document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
    toast("Fond désactivé");
  });
}

/* =========================================================
   EVENTS
   ========================================================= */
on("btn-auto", "click", toggleAutoMode);
on("btn-flip", "click", flipCamera);
on("btn-retry-camera", "click", async () => {
  const errorEl = $("camera-error");
  if (errorEl) errorEl.classList.add("hidden");
  // Relance propre : coupe l'ancien flux puis redémarre
  if (state.stream) { try { state.stream.getTracks().forEach((t) => t.stop()); } catch {} }
  state.stream = null;
  await startCamera();
});
on("btn-backdrop", "click", () => openSheet("sheet-backdrop"));
on("btn-settings", "click", () => openSheet("sheet-settings"));
on("btn-gallery", "click", async () => {
  screens.capture.classList.remove("active");
  screens.gallery.classList.add("active");
  await renderGallery();
});
on("btn-back-capture", "click", showCapture);
on("btn-back-result", "click", showCapture);
on("btn-retake", "click", showCapture);
on("btn-save", "click", async () => {
  if (!state.latestPhoto) return;
  await uploadPhoto(state.latestPhoto);
  toast("Photo sauvegardée ✓");
  const box = $("share-box");
  if (box) box.style.display = "block";
});
on("btn-export-zip", "click", exportZip);
on("btn-save-all", "click", saveAllToPhotos);
on("btn-save-comment", "click", saveComment);
on("photo-comment", "keydown", (e) => { if (e.key === "Enter") saveComment(); });
on("btn-frames", "click", () => openSheet("sheet-frames"));
on("btn-reframe", "click", () => openSheet("sheet-frames"));
on("timer-close", "click", () => sheetMap["sheet-timer"]?.classList.remove("open"));
document.querySelectorAll(".sheet-close").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".sheet")?.classList.remove("open"));
});
document.querySelectorAll(".share-chip:not(.no-method)").forEach((btn) => {
  btn.addEventListener("click", () => shareMethod(btn.dataset.method));
});
on("backdrop-file", "change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  state.backdrop = { type: "image", url };
  toast("Fond image chargé 🖼️");
});
on("chroma-check", "change", (event) => {
  state.chromaEnabled = event.target.checked;
  toast(state.chromaEnabled ? "Chroma activé" : "Chroma désactivé");
});

function openSheet(id) {
  Object.entries(sheetMap).forEach(([key, el]) => el.classList.toggle("open", key === id));
}

/* =========================================================
   INIT
   ========================================================= */
async function init() {
  /* ⚠️ Porte de sortie anti-cache : si le HTML servi par le service worker ne
     correspond pas à la version du JS (vieux cache), on désinstalle le SW et
     on recharge une fois — impossible de rester bloqué sur une vieille version. */
  console.log("[MomentoBooth] init v" + APP_VERSION);
  try {
    const htmlVersion = document.body.dataset.appVersion;
    const forced = sessionStorage.getItem("mb-force-reload");
    if ((!htmlVersion || htmlVersion !== APP_VERSION) && forced !== "1") {
      if (navigator.onLine === false) return; // hors-ligne : ne pas recharger (page blanche)
      sessionStorage.setItem("mb-force-reload", "1");
      if (navigator.serviceWorker) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      window.location.reload();
      return;
    }
    sessionStorage.removeItem("mb-force-reload");
  } catch { /* on continue normalement */ }
  function sizeStickerCanvas() {
    stickerCanvas.width = window.innerWidth;
    stickerCanvas.height = window.innerHeight;
  }
  sizeStickerCanvas();
  window.addEventListener("resize", sizeStickerCanvas);
  // L'écran peut s'éteindre pendant la capture → on relance le Wake Lock
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (state.counting || state.autoMode) requestWakeLock();
    }
  });

  /* ⚠️ 1) LA CAMÉRA D'ABORD — plus rien ne peut la bloquer.
     Avant : startCamera était après les awaits du service worker et du
     stockage persistant → s'ils traînaient (réseau, iOS Safari), la caméra
     ne démarrait JAMAIS (écran noir + interface, sans aucune erreur). */
  startCamera().catch(() => {});

  /* 2) UI — protégée individuellement, ne bloque jamais */
  try { buildBackdropOptions(); } catch {}
  try { buildTimerOptions(); } catch {}
  try { buildFrameOptions(); } catch {}
  try { bindFrameTextEdit(); } catch {}
  try { bindSettings(); } catch {}
  // Logo MomentoBooth (icône envoyée par l'utilisateur, rognée en rond)
  const logoImg = new Image();
  logoImg.onload = () => { state.logoImage = logoImg; };
  logoImg.src = "/icons/logo.png";

  /* 3) Service worker EN ARRIÈRE-PLAN — n'a plus le droit de bloquer la caméra */
  if (navigator.serviceWorker) {
    void (async () => {
      try {
        const hadController = Boolean(navigator.serviceWorker.controller);
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        await reg.update();
        // Nouvelle version active → recharger, mais JAMAIS pendant une capture
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing || !hadController) return;
          if (state.counting || state.autoMode) { // différé si capture en cours
            toast("Mise à jour prête — après la photo");
            return;
          }
          refreshing = true;
          toast("Mise à jour — rechargement…");
          setTimeout(() => window.location.reload(), 800);
        });
      } catch { /* offline ok */ }
    })();
  }

  /* 4) Stockage persistant en arrière-plan */
  requestPersistentStorage().catch(() => {});

  /* 5) Détection visage en arrière-plan (no-op tant que caméra + modèle prêts) */
  initFaceLandmarker().catch(() => {});
  setInterval(detectFace, 120);
}
init();
