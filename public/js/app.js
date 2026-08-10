/* =========================================================
   MomentoBooth PWA — Application principale (v4)
   Tap = minuteur · swipe = filtre en direct · masques visage
   · mode AUTO · portrait (flou) · GIF animé · flash · paramètres
   ========================================================= */
import { FILTERS, filterById, applyPixelFilter, MASK_ICONS } from "./filters.js";
import { drawMask } from "./masks.js";
import { FRAMES, drawFrame, framePreview, FRAME_TEXTS } from "./frames.js";
import { ANIMATIONS, animationById, startAnimation, stopAnimation } from "./animations.js";

/* ---------- État ---------- */  const state = {
  stream: null,
  facing: "user",
  // Les anciennes versions utilisaient filterId pour deux rôles ; ces états
  // indépendants empêchent désormais un accessoire d'écraser le filtre photo.
  photoFilterId: "original", // filtre couleur/image du rail droit
  accessoryId: null,          // accessoire visage du panneau, indépendant du filtre photo
  backdrop: null,
  chromaEnabled: false,
  timerSeconds: 5,
  captureCount: 1,      // nombre de photos demandées dans la prochaine série
  captureBatchActive: false,
  captureBatchItems: [],
  counting: false,
  capturing: false,     // verrou distinct du compte à rebours (évite les captures portrait annulées)
  countingPaused: false,
  _resumeCountdown: null,
  logoEnabled: false,     // conservé par compatibilité de préférences ; n'est plus dessiné
  logoImage: null,
  autoMode: false,
  autoStableSince: 0,
  autoLastNose: null,
  autoArmed: false,
  autoCooldownUntil: 0,
  autoStableSamples: 0,     // détections stables consécutives (lissage)
  autoSmoothedNose: null,   // position du nez lissée (EMA) — résiste au jitter
  autoMoveHits: 0,          // échantillons de mouvement consécutifs (grâce)
  autoDelay: 1.5,           // délai de stabilité avant la prise (secondes)
  _idleWakeSince: 0,        // stabilisation du réveil par visage
  portraitMode: false,   // capture double + GIF à chaque prise
  burstMode: false,      // rafale Flash+ : flash fort + meilleure prise automatique
  lensDeviceId: null,    // objectif choisi (deviceId) — null = auto
  fxCat: "accessory",   // catégorie du panneau : accessory | animation ; les filtres photo sont dans le rail droit
  animationId: null,     // animation overlay active (ballons, …)
  animationEngine: null,
  flashMode: "auto",     // on | auto | off — auto protège le preview et éclaire seulement si sombre
  qualityMax: false,    // mode économe par défaut; 4K activable dans Réglages
  trackEnabled: false,  // MediaPipe et cadres visage désactivés par défaut
  latestPhoto: null,
  latestGif: null,
  publicUrl: "",
  lastLocalId: null,     // id IndexedDB de la dernière photo
  frameId: "none",       // cadre anniversaire
  frameText: { ...FRAME_TEXTS.default },   // titres éditables
  deleteEnabled: false,  // autoriser la suppression des photos
  landmarker: null,
  face: null,  faceMask: null,
  faces: [],                // tous les visages détectés (multi-face)
  prerollEnabled: false,   // opt-in : séquence caméra + micro en arrière-plan
  filmBubbleEnabled: false,// opt-in : bulle « Vous êtes filmé »
  idleEnabled: false,     // opt-in : veille et animation d'accueil (désactivé par défaut — nécessite MediaPipe)
  idleFaceWake: false,    // opt-in : réveil automatique par visage (désactivé par défaut)
  idleWakeHits: 0,         // détections consécutives nécessaires avant réveil (anti-passage furtif)
  lightFrameEnabled: false,// opt-in : analyse basse lumière
  focusing: false,         // focus manuel actif (appui long)
  focusX: 0, focusY: 0,
  focusSupported: false,
  guestToken: "",
  guestHostKey: "",
  guestLiveEnabled: false,
  remoteCamMode: "off",  remoteCamToken: "",  remoteCamHostKey: "",  remoteCamW: 640,  remoteCamH: 480,
  guestLiveTimer: null,
  guestLiveBusy: false,
  performanceMode: "eco",  // eco | balanced | max
  resultItems: [],          // éléments actuellement affichés dans l'aperçu
  resultObjectUrls: [],     // URL blob à révoquer quand on quitte l'aperçu
  resultTimers: [],         // timers du démarrage différé des GIF
  lastGifLocalId: null,
  resultPersistencePromise: null,
  resultGeneration: 0,
  selectedResultKind: null,   // null = proposer photo + GIF au premier partage
  backdropGeneration: 0,

};

/* ---------- Version (anti-cache) ---------- */
const APP_VERSION = "83"; // ⚠️ doit MATCHER data-app-version de index.html + cache du SW

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = { capture: $("screen-capture"), result: $("screen-result"), gallery: $("screen-gallery"), guest: $("screen-guest") };
const camera = $("camera");
const cameraZone = $("camera-zone");
let _detectFaceTimer = null;
let _faceTrackingPromise = null;
let _faceTrackingGeneration = 0;
function pauseLiveProcessing() {
  if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
  stopPreroll();
  releaseFxCards();
  // MediaPipe est la plus grosse empreinte RAM optionnelle : il ne doit pas
  // rester vivant pendant l'aperçu résultat ou la galerie. Le reset invalide
  // aussi toute initialisation asynchrone encore en attente.
  resetFaceTrackingModel();
  hideFilmBubble();
}
function resumeLiveProcessing() {
  if (!screens.capture.classList.contains("active") || document.hidden) return;
  if (state.prerollEnabled && state.stream) startPreroll();
  void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
}
/* Suspend léger (app en arrière-plan) : coupe la détection visage, le monitor
   de lumière et le préfilmage SANS décharger le modèle MediaPipe → réveil
   instantané et surtout zéro CPU/RAM consommés quand l'écran est éteint. */
function suspendLiveWork() {
  if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
  stopLightMonitor();
  stopPreroll();
  stopGuestLivePublisher();
  stopRemotePublishing();
  stopRemotePolling();
}
function resumeLiveWork() {
  if (document.hidden || !screens.capture.classList.contains("active")) return;
  if (state.prerollEnabled && state.stream) startPreroll();
  void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
  startLightMonitor();
  if (state.remoteCamMode === "camera") startRemotePublishing();
  if (state.remoteCamMode === "controller") startRemotePolling();
}
const PREF_KEY = "momentobooth-preferences-v1";
const PERF = {
  eco: { cameraWidth: 1280, cameraHeight: 720, detectMs: 520, overlayMs: 120, gifFps: 5, gifFrames: 10, gifSize: 360, prerollFps: 4, prerollSize: 180 },
  balanced: { cameraWidth: 1920, cameraHeight: 1080, detectMs: 360, overlayMs: 80, gifFps: 6, gifFrames: 12, gifSize: 420, prerollFps: 6, prerollSize: 220 },
  max: { cameraWidth: 2560, cameraHeight: 1440, detectMs: 260, overlayMs: 55, gifFps: 7, gifFrames: 14, gifSize: 480, prerollFps: 8, prerollSize: 240 },
};
function perfConfig() { return PERF[state.performanceMode] || PERF.eco; }
const PREFERENCE_FIELDS = [
  "qualityMax", "trackEnabled", "idleEnabled", "idleFaceWake", "prerollEnabled",
  "filmBubbleEnabled", "lightFrameEnabled", "portraitMode", "burstMode", "timerSeconds", "captureCount", "logoEnabled", "flashMode", "performanceMode", "autoDelay", "remoteCamMode", "remoteCamToken", "remoteCamHostKey",
];
function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    for (const field of PREFERENCE_FIELDS) {
      if (field === "logoEnabled") continue;
      if (Object.prototype.hasOwnProperty.call(saved, field)) state[field] = saved[field];
    }
    // Les anciennes versions activaient le logo par défaut : elles sont
    // explicitement invalidées pour qu'il n'apparaisse plus sans demande.
    state.logoEnabled = saved.logoPreferenceVersion === LOGO_PREF_VERSION && saved.logoEnabled === true;
    // Les préférences venant de localStorage restent bornées aux choix UI.
    state.timerSeconds = [5, 10, 15, 20].includes(Number(state.timerSeconds)) ? Number(state.timerSeconds) : 5;
    state.captureCount = Math.max(1, Math.min(6, Number(state.captureCount) || 1));
    state.autoDelay = [0.5, 1.5, 3].includes(Number(state.autoDelay)) ? Number(state.autoDelay) : 1.5;
  } catch { /* stockage indisponible ou préférence corrompue : defaults sûrs */ }
}
function savePreferences() {
  try {
    const saved = Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, state[field]]));
    saved.logoPreferenceVersion = LOGO_PREF_VERSION;
    localStorage.setItem(PREF_KEY, JSON.stringify(saved));
  } catch { /* mode privé iOS ou quota atteint : l'app continue */ }
}
function syncPreferenceControls() {
  const checks = {
    "set-quality": state.qualityMax,
    "set-track": state.trackEnabled,
    "set-idle": state.idleEnabled,
    "set-idle-face": state.idleFaceWake,
    "set-preroll": state.prerollEnabled,
    "set-film-bubble": state.filmBubbleEnabled,
    "set-light-frame": state.lightFrameEnabled,
    "set-portrait": state.portraitMode,
    "set-burst": state.burstMode,
  };
  for (const [id, checked] of Object.entries(checks)) {
    const control = $(id);
    if (control) control.checked = Boolean(checked);
  }
  const perfControl = $("set-performance");
  if (perfControl) perfControl.value = PERF[state.performanceMode] ? state.performanceMode : "eco";
  document.querySelectorAll("#flash-modes button").forEach((button) => {
    button.classList.toggle("active", button.dataset.flash === state.flashMode);
  });
  document.querySelectorAll("#auto-delay-modes button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.delay) === state.autoDelay);
  });
}

const stickerCanvas = $("sticker-canvas");
const fxPanel = $("fx-panel");
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

/* --- Audio : contexte partagé + sons d'interface forts ---
   iOS Safari exige qu'un AudioContext soit réveillé depuis un geste tactile.
   Le premier toucher joue donc un buffer totalement silencieux (aucune
   permission micro) et les états "suspended"/"interrupted" sont repris. */
let _audioCtx = null;
let _audioUnlocked = false;
function audioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _audioCtx.addEventListener?.("statechange", () => {
        if (_audioCtx?.state === "running") _audioUnlocked = true;
      });
    } catch { return null; }
  }
  if (_audioCtx.state === "suspended" || _audioCtx.state === "interrupted") {
    try { void _audioCtx.resume(); } catch {}
  }
  return _audioCtx;
}

function unlockAudio() {
  const ctx = audioCtx();
  if (!ctx) return;
  // Une fois réellement actif, ne recrée pas de source silencieuse à chaque
  // toucher. Si Safari repasse en interrupted/suspended, on réessaie.
  if (ctx.state === "running") {
    _audioUnlocked = true;
    return;
  }
  try {
    // Déverrouillage iOS : source inaudible de 1 échantillon, sans permission.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    _audioUnlocked = true;
  } catch { /* audio indisponible : l'interface continue sans crash */ }
  try { if (ctx.state !== "running") void ctx.resume(); } catch {}
}

function resumeAudio() {
  try {
    if (_audioCtx && (_audioCtx.state === "suspended" || _audioCtx.state === "interrupted")) {
      void _audioCtx.resume();
    }
  } catch { /* audio bloqué ou contexte fermé */ }
}

// Capture phase + touchstart : fiable sur Safari iOS avant les handlers UI.
["touchstart", "pointerdown", "click"].forEach((eventName) => {
  document.addEventListener(eventName, unlockAudio, { capture: true, passive: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspendLiveWork();
  else { resumeAudio(); resumeLiveWork(); }
});
window.addEventListener("pageshow", resumeAudio);

/* Son simple : oscillo + enveloppe. gain 0..1 (fort par défaut) */
function playBeep(freq = 880, duration = 0.14, gain = 0.5, type = "sine") {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const schedule = () => {
      if (!ctx || ctx.state !== "running") return;
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
    };
    if (ctx.state === "running") schedule();
    else void ctx.resume().then(schedule).catch(() => {});
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

/* ════════════════════════════════════════════════════════════
   CONTOUR LUMINEUX BASSE LUMIÈRE
   Analyse en continu la luminosité RÉELLE de la scène (canvas sur
   la vidéo) et déploie un contour lumineux techno quand il fait sombre :
   anneau néon rotatif + halos pulsants. Bien plus qu'un écran blanc.
   ════════════════════════════════════════════════════════════ */

/* Luminance moyenne de la scène (0 = noir, 255 = très clair) */
function sceneLuminance(force = false) {
  const now = performance.now();
  if (!force && now - _lastLuminanceAt < 1300) return _lastLuminance;
  try {
    if (!camera.videoWidth) return 255;
    if (!_lightCanvas) {
      _lightCanvas = document.createElement("canvas");
      _lightCanvas.width = 64; _lightCanvas.height = 64;
      _lightCtx = _lightCanvas.getContext("2d", { willReadFrequently: true });
    }
    _lightCtx.drawImage(camera, 0, 0, 64, 64);
    const data = _lightCtx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    _lastLuminance = sum / (64 * 64);
    _lastLuminanceAt = now;
    return _lastLuminance;
  } catch { return _lastLuminance; }
}
function shouldUseFlash() {
  if (state.flashMode === "off") return false;
  if (state.flashMode === "on") return true;
  return sceneLuminance(true) < DARK_SCENE_THRESHOLD;
}


/* Moniteur : toutes les ~1,6 s, met à jour le contour lumineux.
   Hystérésis (dark < 58, light > 80) : évite le clignotement à la frontière. */
let _lightMonitorTimer = null;
let _lightFrameOn = false;
let _lightCanvas = null;
let _lightCtx = null;
let _lastLuminance = 255;
let _lastLuminanceAt = 0;
const DARK_SCENE_THRESHOLD = 72;
function setLightFrame(on) {
  const lf = $("light-frame");
  if (!lf) return;
  if (on && !_lightFrameOn) {
    lf.classList.add("active");
    _lightFrameOn = true;
  } else if (!on && _lightFrameOn) {
    lf.classList.remove("active");
    _lightFrameOn = false;
  }
}
function startLightMonitor() {
  if ((!state.lightFrameEnabled && state.flashMode !== "auto") || _lightMonitorTimer) return;
  const tick = () => {    if (!camera.videoWidth || !state.stream) {
      stopLightMonitor();
      return;
    }
    // Uniquement sur l'écran capture (pas de contour sur résultat/galerie)
    if (!screens.capture.classList.contains("active")) { setLightFrame(false); return; }
    const lum = sceneLuminance();
    // Le mode Flash Auto active aussi le contour de prévisualisation :
    // le réglage dédié permet seulement de le forcer hors du mode flash.
    if (!state.lightFrameEnabled && state.flashMode !== "auto") {
      setLightFrame(false);
      return;
    }
    if (_lightFrameOn) {
      if (lum > 80) setLightFrame(false);   // redevenu clair → on retire
    } else if (lum < DARK_SCENE_THRESHOLD) {
      setLightFrame(true);                  // sombre → bord discret uniquement
    }
  };
  tick();
  _lightMonitorTimer = setInterval(tick, 2400);
}
function stopLightMonitor() {
  if (_lightMonitorTimer) { clearInterval(_lightMonitorTimer); _lightMonitorTimer = null; }
  setLightFrame(false);
}

/* Burst : intensifie brièvement le contour (à la capture, comme un flash) */
function lightFrameBurst() {
  // L'éclair de capture est indépendant du contour permanent basse lumière :
  // si le flash est activé (On ou Auto), son anneau blanc doit toujours jaillir.
  const lf = $("light-frame");
  if (!lf) return;
  lf.classList.remove("burst");
  void lf.offsetWidth;
  lf.classList.add("burst");
  setTimeout(() => lf.classList.remove("burst"), 850);
}

/* Flash visuel de bord — la torche n'est utilisée que si la capacité
   `torch` est réellement exposée par le navigateur. Fallback JS léger,
   compatible même avec « Réduire les animations » activé. */
function flash(enabled = shouldUseFlash()) {
  if (!enabled) return;
  const overlay = $("flash-overlay");
  if (!overlay) return;
  // Le centre reste totalement transparent : seul le bord signale l'éclair.
  overlay.classList.remove("go");
  void overlay.offsetWidth;
  overlay.classList.add("go");
  window.setTimeout(() => overlay.classList.remove("go"), 520);
  lightFrameBurst();
}

/* Torche physique : certains navigateurs exposent `torch:true` dans les
   capacités de la piste vidéo. Sur iOS Safari, cette capacité n'est pas
   exposée de façon fiable ; on tente sans erreur et on vérifie le résultat. */
async function tryTorch(enabled = shouldUseFlash()) {
  try {
    const track = state.stream?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.() || {};
    if (!track || capabilities.torch !== true || typeof track.applyConstraints !== "function") return false;
    await track.applyConstraints({ advanced: [{ torch: Boolean(enabled) }] });
    return true;
  } catch { return false; /* capacité torche indisponible ici */ }
}

/* ⚠️ Fill light : selon le navigateur et la caméra, seule la torche exposée
   par les capacités vidéo peut éclairer réellement la scène. Le fallback
   d'écran est volontairement évité pour ne jamais masquer le preview. */
/* Le fill-light écran est volontairement supprimé : il masquait le preview.
   `tryTorch()` utilise uniquement la capacité réelle exposée par la piste ;
   sinon le flash visuel reste limité au bord. */
function fillLightOn(enabled = shouldUseFlash()) { return enabled; }
function fillLightOff() {}

/* =========================================================
   CAMÉRA + OBJECTIF (grand angle)
   ⚠️ Limite pratique : Safari iOS n'expose pas toujours tous les objectifs
   (notamment l'ultra-wide) via getUserMedia. Le sélecteur énumère les
   caméras RÉELLES exposées par le navigateur : si plusieurs objectifs
   apparaissent sur l'appareil, ils peuvent basculer réellement ; sinon
   l'interface reste honnête et conserve l'objectif disponible.
   ========================================================= */
let _lensDevices = [];
let _cameraRequestId = 0;
let _cameraOpening = false;
let _cameraRestartPending = false;

/* Énumère les caméras réelles (peuvent être plusieurs sur Android) */
async function listLenses() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    _lensDevices = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch { _lensDevices = []; }
}

function lensLabel(device) {
  const label = device.label || "";
  if (!label) return "Objectif";
  // Court + lisible : "Camera 0 (back)" → "Arrière"; contient wide/ultra → "Grand angle"
  const l = label.toLowerCase();
  if (l.includes("ultra")) return "Grand angle";
  if (l.includes("wide")) return "Grand angle";
  if (l.includes("front") || l.includes("selfie")) return "Selfie";
  if (l.includes("back") || l.includes("rear")) return "Arrière";
  return label.replace(/[\w\s]*camera[\w\s]*/gi, "Objectif").trim().slice(0, 16) || "Objectif";
}

/* Construit le sélecteur d'objectif dans les paramètres */
function buildLensOptions() {
  const box = $("lens-options");
  if (!box) return;
  box.innerHTML = "";
  const mk = (label, deviceId) => {
    const btn = document.createElement("button");
    btn.className = `lens-chip${state.lensDeviceId === deviceId ? " active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      state.lensDeviceId = deviceId; // null = auto (facingMode)
      buildLensOptions();
      toast(deviceId ? `Objectif : ${label}` : "Objectif auto");
      if (state.stream) {
        try { state.stream.getTracks().forEach((t) => t.stop()); } catch {}
        state.stream = null;
        await startCamera();
      }
    });
    box.appendChild(btn);
  };
  mk("Auto", null);
  let backCount = 0;
  _lensDevices.forEach((d) => {
    // N'affiche que les arrières + l'objectif déjà choisi (le front se gère par flip)
    const isFront = /front|selfie/i.test(d.label || "");
    if (isFront && state.lensDeviceId !== d.deviceId) return;
    if (!isFront) backCount++;
    mk(lensLabel(d), d.deviceId);
  });
  // Hint honnête : un seul objectif arrière est exposé par ce navigateur/appareil.
  if (backCount <= 1) {
    const hint = document.createElement("span");
    hint.className = "lens-hint";
    hint.textContent = "Un seul objectif arrière exposé par ce navigateur/appareil";
    box.appendChild(hint);
  }
}

async function startCamera() {
  if (_cameraOpening) {
    // Une action utilisateur pendant la permission ne doit pas être perdue.
    // Une seule relance suffit : elle prendra les réglages les plus récents.
    _cameraRestartPending = true;
    return;
  }
  _cameraOpening = true;
  const requestId = ++_cameraRequestId;
  console.log("[MomentoBooth] startCamera appelé", requestId);
  const errorEl = $("camera-error");
  const previousStream = state.stream;
  try {
    const facing = state.facing === "user" ? "user" : "environment";
    // Essai progressif : 2560 → 1920 → 1280 → sans contrainte.
    // iPhone 11 (front ≤ ~1920×1080) échoue parfois sur les grosses contraintes.
    // Si un objectif précis est choisi → deviceId exact (Android multi-objectifs).
    const base = state.lensDeviceId
      ? { deviceId: { exact: state.lensDeviceId } }
      : { facingMode: facing };
    // 4K d'abord si qualité max (back camera), puis descente progressive.
    const profile = perfConfig();
    const attempts = state.qualityMax && state.performanceMode === "max"
      ? [
          { ...base, width: { ideal: 3840 }, height: { ideal: 2160 } },
          { ...base, width: { ideal: profile.cameraWidth }, height: { ideal: profile.cameraHeight } },
          base,
        ]
      : [
          { ...base, width: { ideal: profile.cameraWidth }, height: { ideal: profile.cameraHeight } },
          base,
        ];
    let stream = null, lastError = null;
    for (const video of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        break;
      } catch (error) { lastError = error; }
    }
    if (!stream) throw lastError || new Error("getUserMedia failed");
    // Une bascule/relance plus récente a gagné : ne laisse jamais cette
    // permission tardive remplacer le flux courant.
    if (requestId !== _cameraRequestId) {
      try { stream.getTracks().forEach((track) => track.stop()); } catch {}
      return;
    }
    if (state.stream && state.stream !== stream) {
      try { state.stream.getTracks().forEach((track) => track.stop()); } catch {}
    }
    state.stream = stream;
    camera.srcObject = state.stream;
    await camera.play().catch(() => {});
    // On re-synchronise les miniatures avec le vrai flux
    fxCards.forEach((item) => { if (item.video && item.hydrated) { item.video.srcObject = state.stream; } });
    if (fxPanel.classList.contains("open")) buildFxPanel();
    // Caméra OK → masque l'écran d'erreur ou l'état d'attente
    if (errorEl) errorEl.classList.add("hidden");
    clearTimeout(startCamera._waitingTimer);
    console.log("[MomentoBooth] caméra OK", camera.videoWidth, "x", camera.videoHeight);
    // Caméra OK → le splash disparaît en fondu (interface révélée)
    hideSplash();
    // Contour lumineux : analyse la luminosité de la scène en continu
    if (state.lightFrameEnabled || state.flashMode === "auto") startLightMonitor();
    // Préfilmage : ring buffer + déclencheurs (approche / voix proche).
    // Le micro est demandé au PREMIER toucher (pas au chargement) pour éviter
    // un double prompt de permission iOS (caméra + micro) d'un coup.
    if (state.prerollEnabled) {
      startPreroll();
      const askMic = () => { initPrerollAudio(); window.removeEventListener("pointerdown", askMic); };
      window.addEventListener("pointerdown", askMic, { once: true, passive: true });
    }
    // Objectifs : liste les caméras réelles (Android) et met à jour le sélecteur
    listLenses().then(() => { try { buildLensOptions(); } catch {} });
    const videoTrack = state.stream.getVideoTracks?.()[0];
    videoTrack?.addEventListener?.("ended", () => stopLightMonitor(), { once: true });
    // ⚠️ Watchdog : si la vidéo reste NOIRE (aucune dimension après 2,5 s),
    // on ré-attache le flux (bug iOS connu) puis on affiche un diagnostic.
    setTimeout(() => {
      if (requestId !== _cameraRequestId) return;
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
    if (requestId !== _cameraRequestId) return;
    // ⚠️ Affiche un écran clair + bouton réessayer au lieu d'un écran noir.
    // Le splash ne doit jamais rester au-dessus de cet état d'erreur.
    clearTimeout(startCamera._waitingTimer);
    const existingTrack = previousStream?.getVideoTracks?.()[0];
    const existingStreamUsable = state.stream === previousStream && existingTrack && existingTrack.readyState !== "ended";
    if (existingStreamUsable) {
      // Une relance secondaire peut échouer (objectif non exposé, contrainte
      // refusée) alors que l'ancien flux reste parfaitement utilisable.
      // Restaure-le au lieu d'afficher une fausse panne caméra.
      camera.srcObject = state.stream;
      camera.play().catch(() => {});
      if (errorEl) errorEl.classList.add("hidden");
      hideSplash();
      if (state.lightFrameEnabled || state.flashMode === "auto") startLightMonitor();
      toast("Objectif indisponible — caméra conservée");
      return;
    }
    hideSplash();
    stopLightMonitor(); // pas de contour lumineux sur l'écran d'erreur
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
  } finally {
    _cameraOpening = false;
    if (_cameraRestartPending) {
      _cameraRestartPending = false;
      void startCamera();
    }
  }
}

async function showCameraWaiting() {
  const errorEl = $("camera-error");
  if (!errorEl || state.stream) return;
  const title = errorEl.querySelector(".camera-error-title");
  const text = errorEl.querySelector(".camera-error-text");
  const button = $("btn-retry-camera");
  if (title) title.textContent = "Caméra en attente";
  if (text) text.textContent = "La permission caméra tarde à répondre. Autorisez-la dans Safari, puis réessayez si nécessaire.";
  if (button) button.textContent = "🔄 Réessayer";
  errorEl.classList.remove("hidden");
  hideSplash();
}

async function flipCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((t) => t.stop());
  state.facing = state.facing === "user" ? "environment" : "user";
  // ⚠️ Le retournement repasse à l'objectif auto (sinon deviceId exact
  // bloquerait la bascule avant/arrière)
  state.lensDeviceId = null;
  try { buildLensOptions(); } catch {}
  await startCamera();
}

/* =========================================================
   ACCESSOIRES & ANIMATIONS : panneau carrousel de caméras en
   direct. Deux catégories : accessoires visage et animations
   (ballons, confettis…). Le SWIPE global (sur
   la caméra) navigue dans la catégorie active avec le nom qui
   apparaît + un flou de transition (comme une mise au point).
   ========================================================= */
let fxCards = [];          // { card, video, hydrated, id }
let fxObserver = null;
let _fxBlurTimer = null;

/* Séparation stricte des trois familles visuelles.
   Les filtres photo ne doivent jamais entrer dans le panneau Accessoires. */
const PHOTO_FILTERS = FILTERS.filter((item) => item.mask === "none");
const FACE_ACCESSORIES = FILTERS.filter((item) => item.mask !== "none");
function fxList() {
  if (state.fxCat === "animation") return ANIMATIONS;
  // Première carte « Aucun » : permet de retirer l'accessoire en cours.
  return [{ id: "none", name: "Aucun", icon: "✕", mask: "none", color: false }, ...FACE_ACCESSORIES];
}
function photoFilterList() {
  return PHOTO_FILTERS;
}
function fxItemById(id) {
  if (!id || id === "none") return { id: "none", name: state.fxCat === "animation" ? "Aucune animation" : "Aucun accessoire" };
  if (state.fxCat === "animation") return animationById(id);
  return fxList().find((item) => item.id === id) || filterById(id);
}

function activePhotoFilter() { return filterById(state.photoFilterId); }
function activeAccessory() { return state.accessoryId ? filterById(state.accessoryId) : filterById("original"); }
function liveFilterCss() {
  return [activePhotoFilter(), activeAccessory()]
    .map((item) => item.css && item.css !== "none" ? item.css : "")
    .filter(Boolean).join(" ") || "brightness(1)";
}
function refreshLiveFilter() {
  const css = liveFilterCss();
  camera.style.setProperty("--mb-live-filter", css);
  document.body.classList.add("fx-blur");
  clearTimeout(_fxBlurTimer);
  _fxBlurTimer = setTimeout(() => {
    camera.style.filter = css;
    document.body.classList.remove("fx-blur");
  }, 70);
}

/* Applique un élément (accessoire ou animation) sans toucher au filtre photo. */
function applyFx(id, opts = {}) {
  if (!id || id === "none") {
    // Retirer l'effet courant (accessoire ou animation).
    if (state.fxCat === "animation") {
      applyAnimation(null);
    } else {
      state.accessoryId = null;
      refreshLiveFilter();
      drawLiveOverlay();
      void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    }
  } else if (state.fxCat === "animation") {
    applyAnimation(id);
  } else {
    state.accessoryId = id;
    void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    refreshLiveFilter();
  }
  fxCards.forEach((item) => item.card.classList.toggle("active", item.id === id));
  if (opts.showName) showFilterName(fxItemById(id)?.name || "");
}

/* Filtre photo : applique en live sans désactiver l'accessoire visage. */
function applyFilter(id) {
  const filter = filterById(id);
  if (filter.mask !== "none") {
    // Appel legacy sûr : un accessoire reste un accessoire même si le
    // panneau est actuellement positionné sur l'onglet Animations.
    state.accessoryId = id;
    void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    refreshLiveFilter();
    fxCards.forEach((item) => item.card.classList.toggle("active", item.id === id));
    return;
  }
  state.photoFilterId = id;
  refreshLiveFilter();
  document.querySelectorAll("#photo-filter-rail-list [data-filter]").forEach((item) => item.classList.toggle("active", item.dataset.filter === id));
  try { navigator.vibrate?.(8); } catch {}
}

function buildPhotoFilterRail() {
  const rail = $("photo-filter-rail-list");
  if (!rail) return;
  rail.innerHTML = "";
  // Le rail droit est exclusivement le carrousel des filtres photo/image.
  PHOTO_FILTERS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-rail-card${state.photoFilterId === item.id ? " active" : ""}`;
    button.dataset.filter = item.id;
    button.setAttribute("aria-label", `Filtre photo ${item.name}`);
    button.title = item.name;

    const preview = document.createElement("span");
    preview.className = "filter-rail-preview";
    preview.textContent = item.id === "original" ? "◎" : "Aa";
    preview.style.filter = item.css && item.css !== "none" ? item.css : "none";
    button.appendChild(preview);

    const name = document.createElement("span");
    name.className = "filter-rail-name";
    name.textContent = item.name;
    button.appendChild(name);

    button.addEventListener("click", () => {
      // Le rail photo ne change jamais l'onglet du panneau Accessoires/Animations.
      centerRailCard(button, true);
      applyFilter(item.id);
      showFilterName(item.name);
      sfxOpen();
    });
    rail.appendChild(button);
  });
  // Carrousel : au défilement, la pastille la plus proche du centre devient
  // le filtre actif (même comportement que le dial de filtres Snapchat).
  let railScrollTimer = null;
  rail.addEventListener("scroll", () => {
    clearTimeout(railScrollTimer);
    railScrollTimer = setTimeout(applyCenteredFilter, 120);
  }, { passive: true });
  // Marge de centrage : moitié de la hauteur visible (les 1res/dernières
  // pastilles doivent pouvoir atteindre le centre, sinon le snap les bloque).
  const setRailPad = () => {
    rail.style.setProperty("--rail-pad", `${Math.max(0, Math.round(rail.clientHeight / 2 - 23))}px`);
  };
  setRailPad();
  requestAnimationFrame(setRailPad);
  window.addEventListener("resize", setRailPad, { passive: true });
  // Recentre la pastille déjà active (filtre conservé d'une session à l'autre).
  // Double rAF : les dimensions du rail ne sont fiables qu'après le layout.
  const activeCard = rail.querySelector(".filter-rail-card.active");
  if (activeCard) {
    requestAnimationFrame(() => requestAnimationFrame(() => centerRailCard(activeCard)));
  }
}

/* Centre une pastille du rail (scroll déterministe, snap-compatible). */
function centerRailCard(card, smooth = false) {
  const list = $("photo-filter-rail-list");
  if (!list || !card) return;
  const target = card.offsetTop - list.clientHeight / 2 + card.offsetHeight / 2;
  list.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
}

/* Applique le filtre de la pastille la plus proche du centre du rail (snap). */
function applyCenteredFilter() {
  const list = $("photo-filter-rail-list");
  if (!list) return;
  const centerY = list.scrollTop + list.clientHeight / 2;
  let best = null, bestDist = Infinity;
  list.querySelectorAll("[data-filter]").forEach((card) => {
    const dist = Math.abs(card.offsetTop + card.offsetHeight / 2 - centerY);
    if (dist < bestDist) { bestDist = dist; best = card; }
  });
  if (!best || best.dataset.filter === state.photoFilterId) return;
  applyFilter(best.dataset.filter);
  showFilterName(best.querySelector(".filter-rail-name")?.textContent || best.dataset.filter);
  try { navigator.vibrate?.(6); } catch {}
}

/* Animation overlay : ballons, confettis… dessinés sur le canvas */
function applyAnimation(id) {
  state.animationId = id || null;
  if (!state.animationId) {
    stopAnimation();
    state.animationEngine = null;
    drawLiveOverlay(); // nettoie le canvas
  } else {
    state.animationEngine = startAnimation(state.animationId, () => drawLiveOverlay());
  }
  fxCards.forEach((item) => item.card.classList.toggle("active", item.id === id));
  try { navigator.vibrate?.(8); } catch {}
}

/* Nom du filtre : apparaît temporairement au centre (swipe) */
function showFilterName(name) {
  const label = $("filter-label");
  if (!label) return;
  label.textContent = name;
  label.classList.remove("show");
  void label.offsetWidth;
  label.classList.add("show");
  clearTimeout(label._t);
  label._t = setTimeout(() => label.classList.remove("show"), 1300);
}

/* Construit le carrousel du panneau (catégorie active) */
function releaseFxCards() {
  if (fxObserver) fxObserver.disconnect();
  fxCards.forEach((item) => {
    try { if (item.video) item.video.srcObject = null; } catch {}
    if (item.video) { try { item.video.pause(); } catch {} }
    item.hydrated = false;
  });
  fxCards = [];
}

function buildFxPanel() {
  const box = $("fx-carousel");
  if (!box) return;
  releaseFxCards();
  box.innerHTML = "";
  fxCards = fxList().map((item) => {
    const card = document.createElement("div");
    const fxCurrent = state.fxCat === "animation" ? state.animationId : state.accessoryId;
    const fxActive = item.id === "none" ? fxCurrent == null : item.id === fxCurrent;
    card.className = `fx-card${state.fxCat === "animation" ? " fx-animation-card" : state.fxCat === "accessory" ? " fx-accessory-card" : " fx-filter-card"}${item.id === "none" ? " fx-none-card" : ""}${fxActive ? " active" : ""}`;
    card.dataset.fx = item.id;
    card.dataset.category = state.fxCat;
    if (state.fxCat === "animation" || !item.color) {
      // Les accessoires/animations ont une carte dédiée, plus expressive
      // que les filtres couleur : icône SVG ou symbole 3D léger.
      const preview = document.createElement("div");
      preview.className = "fx-preview";
      preview.innerHTML = state.fxCat === "animation"
        ? `<span class="fx-3d-symbol">${item.icon}</span><span class="fx-preview-shine"></span>`
        : (item.icon || MASK_ICONS[item.mask] || "🎭");
      card.appendChild(preview);
    } else {
      // Filtre couleur : caméra EN DIRECT avec le filtre
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.filter = item.css;
      video.setAttribute("aria-hidden", "true");
      card.appendChild(video);
      card._video = video;
    }
    const name = document.createElement("span");
    name.className = "fx-card-name";
    name.textContent = item.name;
    card.appendChild(name);
    card.addEventListener("click", () => {
      applyFx(item.id, { showName: true });
      closeFxPanel();
    });
    box.appendChild(card);
    return { card, id: item.id, video: card._video, hydrated: false };
  });
  updateFxName();

  // Hydratation paresseuse des vidéos (ne charge que les visibles → léger)
  if (fxObserver) fxObserver.disconnect();
  fxObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = fxCards.find((c) => c.card === entry.target);
      if (!item || !item.video) continue;
      if (entry.isIntersecting && !item.hydrated) {
        item.video.srcObject = state.stream;
        item.hydrated = true;
      } else if (!entry.isIntersecting && item.hydrated) {
        item.video.srcObject = null;
        item.hydrated = false;
      }
    }
  }, { root: box, threshold: 0.25 });
  fxCards.forEach((item) => item.video && fxObserver.observe(item.card));
}

/* Nom affiché sous le carrousel (carte la plus centrée) */
function updateFxName() {
  const nameEl = $("fx-name");
  if (!nameEl) return;
  const box = $("fx-carousel");
  if (!box) return;
  const center = box.scrollLeft + box.clientWidth / 2;
  let best = null, bestDist = Infinity;
  for (const item of fxCards) {
    const r = item.card.getBoundingClientRect();
    const c = r.left + r.width / 2 - box.getBoundingClientRect().left + box.scrollLeft;
    const d = Math.abs(c - center);
    if (d < bestDist) { bestDist = d; best = item; }
  }
  if (best) nameEl.textContent = fxItemById(best.id)?.name || "";
}

function openFxPanel() {
  buildFxPanel();
  $("fx-panel").classList.add("open");
  $("fx-panel").setAttribute("aria-hidden", "false");
  const topButton = $("btn-fx-top");
  topButton?.classList.add("active");
  topButton?.setAttribute("aria-expanded", "true");
  sfxOpen();
}
function closeFxPanel() {
  releaseFxCards();
  $("fx-panel").classList.remove("open");
  $("fx-panel").setAttribute("aria-hidden", "true");
  const topButton = $("btn-fx-top");
  topButton?.classList.remove("active");
  topButton?.setAttribute("aria-expanded", "false");
  sfxClose();
}

/* Sélection (ancien nom) : l'écran résultat l'utilise encore */
function selectFilter(id, thumbEl) {
  // Compatibilité avec les anciennes vignettes : une sélection photo ne
  // force pas le panneau à afficher une catégorie inexistante « filter ».
  applyFilter(id);
  showFilterName(filterById(id).name);
  if (thumbEl) thumbEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

/* =========================================================
   GESTES : tap = minuteur · swipe = filtre en direct
   Pointer events au niveau document (fiable iOS)
   ========================================================= */
let swipeStartX = 0, swipeStartY = 0, swipeRefX = 0, isSwiping = false, swipeActive = false;
const SWIPE_STEP = 56;

function gestureTarget(event) {
  // Ignorer les gestes sur la barre, le panneau FX, les sheets et les boutons
  if (event.target.closest(".fx-panel")) return "ui";
  if (event.target.closest(".window-stack")) return "ui";
  if (event.target.closest(".fx-top-btn")) return "ui";
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
    // Hors panneau, le swipe reste dédié aux filtres photo du rail droit.
    // Dans le panneau, il navigue seulement dans Accessoires ou Animations.
    const panelOpen = $("fx-panel").classList.contains("open");
    const list = panelOpen ? fxList() : photoFilterList();
    const currentId = panelOpen && state.fxCat === "animation" ? state.animationId : state.accessoryId;
    const index = list.findIndex((f) => f.id === currentId);
    const next = Math.max(0, Math.min(list.length - 1, (index < 0 ? 0 : index) + steps));
    if (panelOpen) applyFx(list[next].id, { showName: true });
    else {
      // Hors panneau, le swipe parcourt uniquement les filtres photo sans
      // modifier l'onglet mémorisé du panneau Accessoires/Animations.
      applyFilter(list[next].id);
      showFilterName(list[next].name);
    }
    // Le nom + flou apparaissent — le panneau suit aussi
    if ($("fx-panel").classList.contains("open")) {
      fxCards.forEach((item) => item.card.classList.toggle("active", item.id === list[next].id));
      const cardEl = fxCards.find((item) => item.id === list[next].id)?.card;
      if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    swipeRefX += steps * SWIPE_STEP;
  }
}, { passive: true });

document.addEventListener("pointerup", (event) => {
  if (!swipeActive) return;
  swipeActive = false;
  if (state.counting) return;
  if (isSwiping) return; // c'était un swipe
  // Un appui long vient de déclencher le focus manuel → ne pas ouvrir le minuteur
  if (_focusJustUsed) { _focusJustUsed = false; return; }
  if (gestureTarget(event) !== "cam") return;
  openSheet("sheet-timer");
}, { passive: true });

document.addEventListener("pointercancel", () => {
  swipeActive = false;
  _focusJustUsed = false; // ne pas avaler le prochain tap après un geste annulé
});

/* =========================================================
   MINUTEUR
   ========================================================= */
function buildTimerOptions() {
  const box = $("timer-options");
  if (!box) return;
  box.innerHTML = "";
  buildCaptureCountOptions();
  const durations = [
    { s: 5, label: "5", sub: "secondes", big: "5s" },
    { s: 10, label: "10", sub: "secondes", big: "10s" },
    { s: 15, label: "15", sub: "secondes", big: "15s" },
    { s: 20, label: "20", sub: "secondes", big: "20s" },
  ];
  durations.forEach((d) => {
    const chip = document.createElement("button");
    chip.className = `timer-chip big${state.timerSeconds === d.s ? " active" : ""}`;
    chip.innerHTML = `${d.big}<small>${d.sub}</small>`;
    chip.addEventListener("click", () => {
      state.timerSeconds = d.s;
      document.querySelectorAll(".timer-chip").forEach((c) => c.classList.toggle("active", c === chip));
      savePreferences();
      chip.classList.add("active");
      sheetMap["sheet-timer"].classList.remove("open");
      sfxOpen();
      startCountdown();
    });
    box.appendChild(chip);
  });
}

/* Résumé de la série : chaque prise produit le pack lens complet
   (Original + Filtre + Portrait + GIF), sauf rafale (meilleure prise). */
function captureSummaryText(count = state.captureCount) {
  const n = `${count} ${count > 1 ? "prises" : "prise"}`;
  if (state.burstMode) return `${n} · meilleure prise par série`;
  return `${n} · pack lens (Original + Filtre + Portrait + GIF)`;
}

function buildCaptureCountOptions() {
  const box = $("capture-count-options");
  if (!box) return;
  box.innerHTML = "";
  const summary = $("capture-count-summary");
  if (summary) summary.textContent = captureSummaryText();
  [1, 2, 3, 4, 5, 6].forEach((count) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `capture-count-chip${state.captureCount === count ? " active" : ""}`;
    chip.innerHTML = `<strong>${count}</strong><small>${count === 1 ? "photo" : "photos"}</small>`;
    chip.addEventListener("click", () => {
      state.captureCount = count;
      savePreferences();
      document.querySelectorAll(".capture-count-chip").forEach((item) => item.classList.toggle("active", item === chip));
      const summary = $("capture-count-summary");
      if (summary) summary.textContent = captureSummaryText(count);
      sfxOpen();
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
  if (state.landmarker) return state.landmarker;
  if (_faceTrackingPromise) return _faceTrackingPromise;
  const generation = _faceTrackingGeneration;
  const promise = (async () => {
    let created = null;
    try {
      const { FaceLandmarker, FilesetResolver } = await import("./mediapipe/vision_bundle.mjs");
      const fileset = await FilesetResolver.forVisionTasks("./mediapipe/wasm");
      // Le mode multi-visage est opt-in avec la bulle : 3 visages max suffisent
      // pour l'interface, sans imposer ce coût au mode caméra standard.
      const opts = { runningMode: "VIDEO", numFaces: state.filmBubbleEnabled ? 3 : 1, outputFaceSegmentationMasks: Boolean(state.portraitMode || state.backdrop) };
      try {
        // GPU d'abord (rapide), fallback CPU si indisponible.
        created = await FaceLandmarker.createFromOptions(fileset, {
          ...opts,
          baseOptions: { modelAssetPath: "./mediapipe/face_landmarker.task", delegate: "GPU" },
        });
      } catch {
        created = await FaceLandmarker.createFromOptions(fileset, {
          ...opts,
          baseOptions: { modelAssetPath: "./mediapipe/face_landmarker.task", delegate: "CPU" },
        });
      }
      // Une activation/désactivation ou une mise en arrière-plan peut avoir
      // rendu cette initialisation obsolète. Ne rattache jamais son modèle.
      const stale = generation !== _faceTrackingGeneration || document.hidden || !screens.capture.classList.contains("active");
      if (stale) {
        try { created?.close?.(); } catch {}
        return null;
      }
      state.landmarker = created;
      if (state.landmarker) console.log("[MomentoBooth] FaceLandmarker prêt (option activée)");
      return state.landmarker;
    } catch {
      try { created?.close?.(); } catch {}
      return null;
    } finally {
      if (_faceTrackingPromise === promise) _faceTrackingPromise = null;
    }
  })();
  _faceTrackingPromise = promise;
  return promise;
}

function clearFaceMask() {
  // Les MPMask natifs appartiennent au runtime WASM/GPU : si une ancienne
  // version en a laissé un dans l'état, le fermer ici évite une fuite.
  try { state.faceMask?.close?.(); } catch {}
  state.faceMask = null;
  if (state._faceMaskCanvas) {
    try { state._faceMaskCanvas.width = 0; state._faceMaskCanvas.height = 0; } catch {}
    state._faceMaskCanvas = null;
  }
  state._faceMaskImageData = null;
}

/* Convertit immédiatement le MPMask natif en petit canvas alpha réutilisable.
   Un MPMask n'est pas une source Canvas valide pour drawImage(). Il faut aussi
   le fermer après lecture : sinon chaque détection conserve de la mémoire WASM. */
function updateFaceMask(nativeMask) {
  if (!nativeMask) {
    // Perte transitoire de détection : retire l'alpha utilisé par le rendu,
    // mais conserve le canvas et son ImageData pour le prochain tick.
    state.faceMask = null;
    return;
  }
  try {
    const width = Number(nativeMask.width) || 0;
    const height = Number(nativeMask.height) || 0;
    const values = typeof nativeMask.getAsFloat32Array === "function"
      ? nativeMask.getAsFloat32Array()
      : nativeMask.getAsUint8Array?.();
    if (!width || !height || !values || values.length < width * height) {
      state.faceMask = null;
      return;
    }
    let canvas = state._faceMaskCanvas;
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      state._faceMaskCanvas = canvas;
      state._faceMaskImageData = null;
    }
    const ctx = canvas.getContext("2d");
    const image = state._faceMaskImageData && state._faceMaskImageData.width === width && state._faceMaskImageData.height === height
      ? state._faceMaskImageData
      : (state._faceMaskImageData = ctx.createImageData(width, height));
    const isByteMask = values instanceof Uint8Array;
    for (let i = 0; i < width * height; i += 1) {
      const raw = Number(values[i]) || 0;
      const alpha = Math.round(Math.max(0, Math.min(1, isByteMask ? raw / 255 : raw)) * 255);
      const p = i * 4;
      image.data[p] = 255;
      image.data[p + 1] = 255;
      image.data[p + 2] = 255;
      image.data[p + 3] = alpha;
    }
    ctx.putImageData(image, 0, 0);
    state.faceMask = canvas;
  } catch {
    state.faceMask = null;
  } finally {
    // Toujours libérer le wrapper natif, même si le canvas conversion échoue.
    try { nativeMask.close?.(); } catch {}
  }
}

function resetFaceTrackingModel() {
  _faceTrackingGeneration += 1;
  // L'ancienne promesse peut finir plus tard ; son modèle sera fermé par le
  // garde de génération dans initFaceLandmarker().
  _faceTrackingPromise = null;
  if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
  if (state.landmarker?.close) { try { state.landmarker.close(); } catch {} }
  state.landmarker = null;
  state.face = null;
  clearFaceMask();
  state.faces = [];
  state._lastDetectAt = 0;
  state._forceOverlay = true;
}

function detectFace() {
  if (!state.landmarker || !state.stream || !camera.videoWidth || document.hidden || !screens.capture.classList.contains("active")) return;
  const now = performance.now();
  if (now - (state._lastDetectAt || 0) < perfConfig().detectMs) return;
  state._lastDetectAt = now;
  if (!state._forceDetect && !state.trackEnabled && !state.autoMode && !state.idleFaceWake && !state.filmBubbleEnabled && !state.prerollEnabled && !state.backdrop && !state.accessoryId) return;
  try {
    const result = state.landmarker.detectForVideo(camera, performance.now());
    state.face = result.faceLandmarks?.[0] ?? null;
    // Convertit le premier masque puis ferme aussi les éventuels masques
    // supplémentaires : le mode multi-visage peut en retourner plusieurs.
    const masks = result.segmentationMasks ?? [];
    try {
      updateFaceMask(masks[0] ?? null);
    } finally {
      for (const mask of masks.slice(1)) {
        try { mask?.close?.(); } catch {}
      }
    }
    state.faces = result.faceLandmarks ?? [];
    // Réveil par visage STABILISÉ : un simple passage ne réveille plus.
    // Il faut un visage présent, centré et assez grand sur N détections
    // consécutives avant de sortir de la veille.
    if (document.body.classList.contains("idle") && state.idleFaceWake) {
      const wakeFace = state.face && state.face.length >= 30 ? state.face : null;
      let wakeOk = false;
      if (wakeFace) {
        const box = faceBox(wakeFace, stickerCanvas.width, stickerCanvas.height, camera.videoWidth || 1280, camera.videoHeight || 960);
        const centered = box.x + box.w / 2 > stickerCanvas.width * .2 && box.x + box.w / 2 < stickerCanvas.width * .8;
        wakeOk = centered && box.w > stickerCanvas.width * .15 && box.h > stickerCanvas.height * .15;
      }
      if (wakeOk) {
        state.idleWakeHits = (state.idleWakeHits || 0) + 1;
        if (state.idleWakeHits >= 3) {
          state.idleWakeHits = 0;
          exitIdle();
          showFilterName("Bienvenue !");
        }
      } else {
        state.idleWakeHits = 0;
      }
    }
    updateAutoMode();
    updateFilmBubble();
    drawLiveOverlay();
  } catch { state.face = null; clearFaceMask(); state.faces = []; }
}

/* Overlay live : masque + tracker + ANIMATION (ballons…) */
/* Fond en LIVE : si un fond est choisi, on dessine le fond + la personne
   détourée (masque de segmentation) par-dessus la vidéo, en basse résolution
   pour rester léger (le canvas ne fait que la taille de l'écran). */
function drawLiveOverlay() {
  const now = performance.now();
  if (now - (state._lastOverlayAt || 0) < perfConfig().overlayMs && !state._forceOverlay) return;
  state._lastOverlayAt = now;
  state._forceOverlay = false;
  const ctx = stickerCanvas.getContext("2d");
  const W = stickerCanvas.width, H = stickerCanvas.height;
  ctx.clearRect(0, 0, W, H);
  const filter = activeAccessory();

  if (state.backdrop && state.face && state.face.length > 30) {
    // ── Fond en direct : dessine le fond, puis la personne découpée ──
    if (state.backdrop.type === "gradient") {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      const stops = state.backdrop.css.match(/#[0-9a-f]{6}/gi) ?? [];
      stops.forEach((color, idx) => grad.addColorStop(idx / Math.max(1, stops.length - 1), color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else if (state.backdrop.type === "image" && state._backdropImg) {
      ctx.drawImage(state._backdropImg, 0, 0, W, H);
    }
    // Personne détourée via la segmentation (si dispo) sinon la vidéo complète
    if (state.faceMask) {
      try {
        // Canvas de travail réutilisé (pas d'allocation à chaque tick 8 fps)
        if (!state._cutCanvas) state._cutCanvas = document.createElement("canvas");
        state._cutCanvas.width = W; state._cutCanvas.height = H;
        if (!drawSegmented(ctx, state._cutCanvas, camera, W, H)) {
          drawVideoCover(ctx, camera, W, H);
        }
      } catch { drawVideoCover(ctx, camera, W, H); }
    } else {
      // Tant que le masque n'est pas disponible, garder le fond visible au
      // lieu de le recouvrir totalement par la vidéo.
      ctx.save();
      ctx.globalAlpha = .68;
      ctx.drawImage(camera, 0, 0, W, H);
      ctx.restore();
    }
  } else if (state.backdrop && !state.face) {
    // Fond choisi mais visage pas encore détecté → fond seul + vidéo en fondu
    if (state.backdrop.type === "gradient") {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      const stops = state.backdrop.css.match(/#[0-9a-f]{6}/gi) ?? [];
      stops.forEach((color, idx) => grad.addColorStop(idx / Math.max(1, stops.length - 1), color));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else if (state.backdrop.type === "image" && state._backdropImg) {
      ctx.drawImage(state._backdropImg, 0, 0, W, H);
    }
    // Fallback avant le premier masque : le fond reste perceptible et la
    // caméra continue d'être lisible, sans prétendre à un détourage parfait.
    ctx.globalAlpha = .68;
    ctx.drawImage(camera, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (filter.mask !== "none" && state.face && state.face.length > 30) {
    drawMask(ctx, W, H, state.face, filter.mask);
  }

  // Tracker visage : cadre doré sur les visages, disparaît après délai
  if (state.trackEnabled || state.autoMode) {
    drawHeadTracker(ctx);
  }

  // Animation overlay (ballons, confettis…) par-dessus
  if (state.animationEngine) {
    state.animationEngine.draw(ctx, W, H);
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
    state._focusAnim = null;
    return;
  }
  const cw = stickerCanvas.width, ch = stickerCanvas.height;
  const vw = camera.videoWidth || 1280, vh = camera.videoHeight || 960;
  const box = faceBox(state.face, cw, ch, vw, vh);
  const now = performance.now();
  // Le cadre apparaît dès qu'un visage est détecté, disparaît après 2,5 s
  if (!state._trackStart) {
    state._trackStart = now;
    state._focusAnim = now; // anime la « mise au point » au premier lock (comme iPhone)
  }
  if (now - state._trackStart > 2500) {
    state._trackStart = null;
    state._focusAnim = null;
    return;
  }
  ctx.save();
  // Animation de MISE AU POINT auto : le cadre « respire » et se verrouille
  let scaleIn = 1, alpha = 1;
  if (state._focusAnim) {
    const t = Math.min(1, (now - state._focusAnim) / 550);
    scaleIn = 1.12 - 0.12 * t;
    alpha = 1 - t * 0.35;
  }
  ctx.strokeStyle = state.autoMode ? "rgba(240,201,106,.95)" : "rgba(125,211,252,.9)";
  ctx.lineWidth = 3.5;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 18;
  const bx = box.x - 8, by = box.y - 8, bw = box.w + 16, bh = box.h + 16;
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh / 2);
  ctx.scale(scaleIn, scaleIn);
  ctx.translate(-(bx + bw / 2), -(by + bh / 2));
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 22);
  ctx.stroke();
  // Coins accentués façon iPhone (curseur de mise au point)
  const k = 20;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  const X = box.x - 11, Y = box.y - 11, W = box.w + 22, H = box.h + 22;
  ctx.moveTo(X, Y + k); ctx.lineTo(X, Y); ctx.lineTo(X + k, Y);
  ctx.moveTo(X + W - k, Y); ctx.lineTo(X + W, Y); ctx.lineTo(X + W, Y + k);
  ctx.moveTo(X + W, Y + H - k); ctx.lineTo(X + W, Y + H); ctx.lineTo(X + W - k, Y + H);
  ctx.moveTo(X + k, Y + H); ctx.lineTo(X, Y + H); ctx.lineTo(X, Y + H - k);
  ctx.stroke();
  // Réticule doré central (mise au point) au moment du lock
  if (state._focusAnim && now - state._focusAnim < 500) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const pulse = 1 + 0.25 * Math.sin(((now - state._focusAnim) / 500) * Math.PI);
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy); ctx.lineTo(cx - 12, cy);
    ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 12);
    ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 20);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/* Mode AUTO — stabilisation robuste :
   - le nez est lissé (moyenne exponentielle) : un seul échantillon bruité ne
     réinitialise plus le chrono ;
   - il faut plusieurs détections STABLES consécutives ET le délai choisi ;
   - un mouvement bref est toléré (grâce de 2 échantillons) ;
   - le statut affiche le compte à rebours restant avant la prise. */
function updateAutoMode() {
  const statusEl = $("auto-status");
  const statusText = $("auto-status-text");
  if (!state.autoMode || state.counting || state.capturing || !screens.capture.classList.contains("active")) {
    if (statusEl && !statusEl.classList.contains("hidden")) statusEl.classList.add("hidden");
    return;
  }
  statusEl.classList.remove("hidden");
  const face = state.face;
  const now = performance.now();
  if (!face || face.length < 30) {
    state.autoArmed = false;
    state.autoStableSince = 0;
    state.autoStableSamples = 0;
    state.autoSmoothedNose = null;
    state.autoMoveHits = 0;
    statusText.textContent = "Regardez la caméra…";
    statusEl.classList.remove("armed");
    return;
  }
  const nose = face[1];
  const autoDelayMs = (state.autoDelay || 1.5) * 1000;
  if (!state.autoSmoothedNose) {
    state.autoSmoothedNose = { x: nose.x, y: nose.y };
    state.autoStableSince = now;
    state.autoStableSamples = 0;
    state.autoMoveHits = 0;
    statusText.textContent = "Tête détectée — restez immobile…";
    statusEl.classList.remove("armed");
    return;
  }
  // Lissage exponentiel de la position du nez (réduit le bruit MediaPipe).
  const alpha = 0.35;
  const smoothedX = state.autoSmoothedNose.x + (nose.x - state.autoSmoothedNose.x) * alpha;
  const smoothedY = state.autoSmoothedNose.y + (nose.y - state.autoSmoothedNose.y) * alpha;
  const dx = (nose.x - smoothedX) * 1000;
  const dy = (nose.y - smoothedY) * 1000;
  const moved = Math.sqrt(dx * dx + dy * dy);
  state.autoSmoothedNose = { x: smoothedX, y: smoothedY };

  if (moved > 5) {
    // Grâce : un échantillon bruyant isolé ne casse plus la stabilisation.
    state.autoMoveHits = (state.autoMoveHits || 0) + 1;
    if (state.autoMoveHits >= 2) {
      state.autoStableSince = now;
      state.autoStableSamples = 0;
      state.autoArmed = false;
      statusText.textContent = "Restez immobile…";
      statusEl.classList.remove("armed");
    }
    return;
  }
  state.autoMoveHits = 0;

  // Le visage doit être suffisamment présent dans le cadre : évite les
  // déclenchements sur un passage de profil ou un visage minuscule.
  const box = faceBox(face, stickerCanvas.width, stickerCanvas.height, camera.videoWidth || 1280, camera.videoHeight || 960);
  const centered = box.x + box.w / 2 > stickerCanvas.width * .16 && box.x + box.w / 2 < stickerCanvas.width * .84;
  const visibleEnough = box.w > stickerCanvas.width * .12 && box.h > stickerCanvas.height * .12;
  if (!centered || !visibleEnough) {
    state.autoStableSince = now;
    state.autoStableSamples = 0;
    state.autoArmed = false;
    statusText.textContent = "Placez-vous au centre…";
    statusEl.classList.remove("armed");
    return;
  }
  state.autoStableSamples = (state.autoStableSamples || 0) + 1;
  const stableFor = now - state.autoStableSince;
  // Tant que le sujet reste immobile, on re-déclenche après le cooldown :
  // le mode AUTO prend des photos à intervalle régulier pendant la pose.
  if (state.autoStableSamples >= 2 && stableFor >= autoDelayMs && now >= (state.autoCooldownUntil || 0)) {
    state.autoArmed = true;
    statusText.textContent = "Capture !";
    statusEl.classList.add("armed");
    state.autoCooldownUntil = now + 3500;
    // Re-stabilisation après chaque prise : l'intervalle est intentionnel
    // (cooldown + délai de stabilité), pas une rafale mécanique.
    state.autoStableSince = now;
    state.autoStableSamples = 0;
    state.autoSmoothedNose = null;
    void capture().catch(() => {
      state.autoArmed = false;
      state.autoCooldownUntil = 0;
      toast("Capture automatique indisponible");
    });
  } else if (state.autoArmed) {
    // Pendant le cooldown : statut honnête au lieu de « Capture ! » figé.
    statusText.textContent = "✓ Photo — restez en place pour la suivante…";
    statusEl.classList.remove("armed");
  } else if (!state.autoArmed && state.autoStableSamples >= 1 && stableFor > 300) {
    // Compte à rebours visible : l'utilisateur sait quand la prise aura lieu.
    const remain = Math.max(1, Math.ceil((autoDelayMs - stableFor) / 1000));
    statusText.textContent = `Capture dans ${remain} s…`;
    statusEl.classList.remove("armed");
  }
}

function toggleAutoMode() {
  state.autoMode = !state.autoMode;
  if (state.autoMode) void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
  state.autoCooldownUntil = 0;
  const btn = $("btn-auto");
  btn.classList.toggle("active", state.autoMode);
  if (!state.autoMode) {
    state.autoArmed = false;
    state.autoCooldownUntil = 0;
    resetAutoTracking();
    void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    $("auto-status").classList.add("hidden");
    releaseWakeLock();
    toast("Mode manuel");
  } else {
    resetAutoTracking();
    requestWakeLock(); // le mode AUTO attend le visage : écran toujours allumé
    toast("Mode AUTO — placez-vous face caméra");
  }
}

/* Remet à zéro l'état de stabilisation du mode AUTO (réutilisé par l'arrêt). */
function resetAutoTracking() {
  state.autoStableSince = 0;
  state.autoLastNose = null;
  state.autoStableSamples = 0;
  state.autoSmoothedNose = null;
  state.autoMoveHits = 0;
}

/* =========================================================
   CAPTURE : simple ou portrait (double + GIF)
   ========================================================= */
function ratioOf(video) {
  return (video.videoWidth || 1280) / (video.videoHeight || 960);
}

async function captureSingle() {
  if (state.capturing) return;
  // Le pack lens inclut un Portrait : on s'assure que le tracking visage est
  // actif avant la prise. `_forceDetect` lève le gate de detectFace (détection
  // même sans accessoire/fond), l'attente reste bornée et non bloquante.
  await Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
  const hadForceDetect = state._forceDetect;
  state._forceDetect = true;
  try {
    if (state.landmarker && (!state.face || state.face.length < 30)) {
      detectFace();
      const t0 = performance.now();
      while (state.landmarker && (!state.face || state.face.length < 30) && performance.now() - t0 < 450) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  } finally {
    state._forceDetect = hadForceDetect;
  }
  if (state.burstMode) {
    await captureBurst();
    return;
  }
  if (state.portraitMode || state.autoMode) {
    await capturePortrait();
    return;
  }
  state.capturing = true;
  const animationEngine = state.animationEngine;
  const flashEnabled = shouldUseFlash();
  try {
    // Le GIF démarre AVANT la prise : il capture la pose + l'avant/après.
    gifStartPre(animationEngine);
    await tryTorch(flashEnabled);
  if (state.remoteCamMode === "controller") { state._remoteCaptureCanvas = await grabRemoteFrame(); if (!state._remoteCaptureCanvas) { toast("Camera distante indisponible"); state.capturing = false; return; } }
    const items = await capturePack(animationEngine);
    if (!items) { toast("Capture impossible, réessayez"); return; }
    flash(flashEnabled); // bord discret, le preview reste visible
    state.latestPhoto = items.find((item) => !item.gif)?.blob ?? null;
    state.latestGif = items.find((item) => item.gif)?.blob ?? null;
    playBeep(1200, 0.2, 0.3);
    showResult(items);
  } finally {
    await tryTorch(false);
    gifStopPre(true);
    state.capturing = false;
  }
}

/* ════════════════════════════════════════════════════════════
   PACK COMPLET d'une prise (style lens) : UN SEUL frame capturé,
   quatre rendus dérivés pour rester cohérents entre eux :
   1) Original  — photo normale SANS filtre couleur (accessoires gardés)
   2) Filtre    — la même photo avec le filtre couleur choisi (si différent)
   3) Portrait  — flou d'arrière-plan façon iPhone (si visage détecté)
   4) GIF       — animations + accessoires en mouvement
   Chaque variante est encodée puis libérée (pression mémoire iOS).
   ════════════════════════════════════════════════════════════ */
function cloneCanvas(src) {
  const clone = document.createElement("canvas");
  clone.width = src.width; clone.height = src.height;
  clone.getContext("2d").drawImage(src, 0, 0);
  return clone;
}

async function capturePack(animationEngine = state.animationEngine) {
  // 1) Frame brut SANS filtre couleur (masques + fond + accessoires conservés)
  const raw = await grabFrameCanvas(null, { skipFilter: true });
  if (!raw) return null;
  const W = raw.width, H = raw.height;
  const filter = activePhotoFilter();
  const hasFilter = filter && filter.id !== "original" && filter.ops.length;
  const canPortrait = state.face && state.face.length > 30;
  // Segmentation MediaPipe dispo (mode portrait / fond) : le portrait-masque
  // local est bien supérieur à l'ovale serveur → on le garde côté iPhone et on
  // ne délègue le portrait que si seul l'ovale serait produit de toute façon.
  const hasMask = Boolean(state.faceMask);
  const delegatePortrait = canPortrait && !hasMask;
  let items = [];
  try {
    // 2) Délégation serveur : le serveur applique les ops du filtre couleur,
    //    le flou portrait (ovale) et renvoie les JPEG — l'iPhone n'encode
    //    qu'un seul JPEG (l'upload) au lieu de 3 encodages + ops pixels + blur.
    const serverUp = await serverProcessUp().catch(() => false);
    if (serverUp && (hasFilter || delegatePortrait)) {
      items = await serverRenderPack(raw, W, H, animationEngine, hasFilter, delegatePortrait);
      // Portrait segmentation local (qualité iOS) quand le masque est dispo.
      if (canPortrait && hasMask && !items.some((it) => it.label === "Portrait")) {
        const portraitCanvas = cloneCanvas(raw);
        const portrait = await portraitBlur(portraitCanvas, W, H, animationEngine);
        if (portrait?.blob) items.push({ blob: portrait.blob, label: "Portrait" });
      }
    }
    if (!items.length) {
      // 3) Fallback local (serveur KO, ou rien à déléguer) : pipeline d'origine.
      const originalCanvas = cloneCanvas(raw);
      const original = await finalizeCanvas(originalCanvas, W, H, animationEngine);
      if (original) items.push({ blob: original, label: "Original" });
      // Filtre : même frame + les ops du filtre couleur choisi
      if (hasFilter) {
        const fCanvas = cloneCanvas(raw);
        const fctx = fCanvas.getContext("2d", { willReadFrequently: true });
        const imageData = fctx.getImageData(0, 0, W, H);
        applyPixelFilter(imageData, state.photoFilterId);
        fctx.putImageData(imageData, 0, 0);
        const filtered = await finalizeCanvas(fCanvas, W, H, animationEngine);
        if (filtered) items.push({ blob: filtered, label: filter.name });
      }
      // Portrait : flou d'arrière-plan (segmentation ou ovale), si visage
      if (canPortrait) {
        const portraitCanvas = cloneCanvas(raw);
        const portrait = await portraitBlur(portraitCanvas, W, H, animationEngine);
        if (portrait?.blob) items.push({ blob: portrait.blob, label: "Portrait" });
      }
    }
  } finally {
    releaseCanvas(raw);
  }
  // 4) GIF : frames pré (avant la prise) + post (après)
  const gif = await grabGif(6, animationEngine);
  if (gif) items.push({ blob: gif, label: "GIF", gif: true });
  return items.length ? items : null;
}

/* Une série partage un seul écran de résultat : chaque capture reste
   sélectionnable dans la carte d'export, sans ouvrir cinq écrans successifs. */
async function capture() {
  if (state.capturing) return;
  const count = state.autoMode ? 1 : Math.max(1, Math.min(6, Number(state.captureCount) || 1));
  if (count === 1) return captureSingle();
  state.captureBatchActive = true;
  state.captureBatchItems = [];
  try {
    for (let index = 0; index < count; index += 1) {
      await captureSingle();
      if (index < count - 1) await new Promise((resolve) => setTimeout(resolve, 260));
    }
  } finally {
    state.captureBatchActive = false;
    const items = state.captureBatchItems.splice(0);
    if (items.length) showResult(items);
  }
}

/* ════════════════════════════════════════════════════════════
   RAFALE FLASH+ : flash hyper fort (écran blanc + contour
   lumineux techno qui explose) + plusieurs frames capturées
   pendant la lumière → on garde automatiquement la MEILLEURE
   (netteté × bonne exposition × visage présent), puis on livre
   la floutée + le GIF comme d'habitude.
   ════════════════════════════════════════════════════════════ */

/* Score d'une frame : netteté (variance du Laplacien sur gris)
   × exposition (pénalise trop sombre / brûlée) × bonus visage. */
function frameScore(canvas) {
  let small = null;
  try {
    const S = 64;
    small = document.createElement("canvas");
    small.width = S; small.height = S;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(canvas, 0, 0, S, S);
    const d = sctx.getImageData(0, 0, S, S).data;
    // gris
    const g = new Float32Array(S * S);
    let lumSum = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lumSum += g[p];
    }
    const avg = lumSum / (S * S);
    // Laplacien : netteté (contours) — variance élevée = net
    let lapSum = 0, lapCount = 0;
    for (let y = 1; y < S - 1; y++) {
      for (let x = 1; x < S - 1; x++) {
        const p = y * S + x;
        const lap = g[p - 1] + g[p + 1] + g[p - S] + g[p + S] - 4 * g[p];
        lapSum += lap * lap;
        lapCount++;
      }
    }
    const sharpness = lapSum / Math.max(1, lapCount);
    // Exposition : idéal ~120 ; trop sombre (<45) ou brûlé (>215) → pénalité
    let exposure = 1;
    if (avg < 45) exposure = Math.max(0.25, avg / 45);
    else if (avg > 215) exposure = Math.max(0.25, (255 - avg) / 40);
    return sharpness * exposure;
  } catch { return 0; }
  finally { releaseCanvas(small); }
}

async function captureBurst() {
  if (state.capturing) return;
  state.capturing = true;
  sfxShutter();
  const animationEngine = state.animationEngine;
  const shots = [];
  let copy = null;
  try {
    // Torche réelle si disponible ; aucun écran blanc par-dessus le preview.
    const flashEnabled = shouldUseFlash();
    await tryTorch(flashEnabled);
    if (flashEnabled) lightFrameBurst();
    // Le GIF démarre AVANT la rafale (buffer continu → GIF riche)
    gifStartPre(animationEngine);

    // Rafale légère : trois frames suffisent. Le plafond dédié évite
    // d'allouer cinq canvases 4K simultanément sur iPhone.
    const FRAMES = 3;
    const burstCap = state.qualityMax ? 1600 : 960;
    for (let i = 0; i < FRAMES; i++) {
      const canvas = await grabFrameCanvas(burstCap);
      if (canvas) shots.push({ canvas, score: 0, face: !!state.face });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    await tryTorch(false);
    flash(flashEnabled);

    if (!shots.length) {
      state.autoArmed = false;
      toast("Capture impossible");
      return;
    }

    // Sélection de la MEILLEURE frame : netteté × exposition (+ bonus visage).
    // Le calcul lourd est délégué au serveur quand il est joignable ; sinon
    // on garde le scoring local (identique en formules).
    let best = shots[0], bestScore = -1;
    let serverScores = null;
    try { if (await serverProcessUp()) serverScores = await serverScoreFrames(shots.map((s) => s.canvas)); } catch {}
    shots.forEach((shot, index) => {
      const raw = serverScores ? serverScores[index] : frameScore(shot.canvas);
      shot.score = raw * (shot.face ? 1.35 : 1);
      if (shot.score > bestScore) { bestScore = shot.score; best = shot; }
    });
    console.log("[MomentoBooth] rafale scores" + (serverScores ? " (serveur)" : " (local)") + ":", shots.map((s) => Math.round(s.score)), "→ meilleure:", shots.indexOf(best) + 1);
    // Les autres frames ne servent plus : libère-les avant le flou portrait.
    shots.forEach((shot) => { if (shot !== best) releaseCanvas(shot.canvas); });

    const W = best.canvas.width, H = best.canvas.height;
    // ⚠️ La floutée d'abord, sur une COPIE propre de la meilleure frame
    // (avec cadre + logo dessinés, comme le mode portrait classique).
    // On ne touche PAS best.canvas avant finalizeCanvas (mutation partagée).
    copy = document.createElement("canvas");
    copy.width = W; copy.height = H;
    copy.getContext("2d").drawImage(best.canvas, 0, 0);
    const portrait = await portraitBlur(copy, W, H, animationEngine);
    copy = null; // portraitBlur libère le canvas après encodage
    // La meilleure photo livrée (cadre + logo) — depuis best.canvas, non muté
    const normal = await finalizeCanvas(best.canvas, W, H, animationEngine);
    // Le GIF : buffer pré (démarré avant la rafale) + post
    const gif = await grabGif(6, animationEngine);
    if (state.autoMode) state.autoArmed = false;

    state.latestPhoto = normal;
    state.latestGif = gif;
    const items = [
      { blob: normal, label: "Meilleure prise" },
      { blob: portrait ? portrait.blob : normal, label: "Portrait" },
    ];
    if (gif) items.push({ blob: gif, label: "GIF", gif: true });
    playBeep(1200, 0.2, 0.3);
    showResult(items);
  } finally {
    // Même en cas d'exception d'encodage, ne conserve aucun canvas de rafale.
    shots.forEach((shot) => releaseCanvas(shot.canvas));
    releaseCanvas(copy);
    await tryTorch(false);
    gifStopPre(true);
    state.capturing = false;
  }
}

/* Portrait : photo normale + flou + GIF animé (pré + post) */
async function capturePortrait() {
  if (state.capturing) return;
  state.capturing = true;
  sfxShutter();
  const animationEngine = state.animationEngine;
  try {
    // Le GIF démarre AVANT la capture (buffer continu) : il contient ainsi
    // le moment de la pose + un peu d'avant et d'après.
    gifStartPre(animationEngine);
    await Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    // Le pack inclut un Portrait : forcer une détection même sans accessoire.
    const hadForceDetect = state._forceDetect;
    state._forceDetect = true;
    try {
      if (state.landmarker) detectFace();
      const t0 = performance.now();
      while (state.landmarker && (!state.face || state.face.length < 30) && performance.now() - t0 < 450) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      state._forceDetect = hadForceDetect;
    }
    const flashEnabled = shouldUseFlash();
  if (state.remoteCamMode === "controller") { state._remoteCaptureCanvas = await grabRemoteFrame(); if (!state._remoteCaptureCanvas) { toast("Camera distante indisponible"); state.capturing = false; return; } }
    await tryTorch(flashEnabled);
    const items = await capturePack(animationEngine);
    flash(flashEnabled);
    if (!items) { toast("Capture impossible, réessayez"); return; }
    if (state.autoMode) state.autoArmed = false;
    state.latestPhoto = items.find((item) => !item.gif)?.blob ?? null;
    state.latestGif = items.find((item) => item.gif)?.blob ?? null;
    playBeep(1200, 0.2, 0.3);
    showResult(items);
  } finally {
    // Stoppe toujours le buffer GIF et libère ses canvases même si une étape
    // portrait/encodage échoue avant que grabGif() ne puisse les consommer.
    await tryTorch(false);
    gifStopPre(true);
    state.capturing = false;
  }
}

/* =========================================================
   GRAFFRAME : capture haute qualité avec filtre + masque
   ========================================================= */
function drawVideoFrame(ctx, video, W, H, skipFrame = false, animationEngine = state.animationEngine, dynamicAnimation = false, skipFilter = false) {
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

  const photoFilter = activePhotoFilter();
  const accessory = activeAccessory();
  if (!skipFilter && (photoFilter.ops.length || accessory.ops.length)) {
    const imageData = ctx.getImageData(0, 0, W, H);
    if (photoFilter.ops.length) applyPixelFilter(imageData, state.photoFilterId);
    if (accessory.ops.length) applyPixelFilter(imageData, state.accessoryId);
    ctx.putImageData(imageData, 0, 0);
  }

  if (accessory.mask !== "none") {
    ctx.save();
    if (state.facing === "user") {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    drawMask(ctx, W, H, state.face, accessory.mask);
    ctx.restore();
  }

  // Cadre anniversaire (par-dessus tout, pas de miroir)
  if (!skipFrame) drawFrame(ctx, W, H, state.frameId, state.frameText);
  // Logo MomentoBooth rogné (déjà dessiné à plat, pas de miroir)
  if (!skipFrame) drawLogo(ctx, W, H);
  // Les photos fixes reçoivent une pose stable ; les GIF demandent
  // explicitement l'état courant pour que les particules évoluent frame par frame.
  if (!skipFrame && animationEngine) {
    if (dynamicAnimation) animationEngine.draw(ctx, W, H);
    else animationEngine.drawStatic(ctx, W, H);
  }
}

/* Logo MomentoBooth : RETIRÉ des photos à la demande de l'utilisateur.
   La fonction reste appelée par les chemins d'export mais ne dessine plus
   rien : aucune photo (simple, portrait, GIF, carte) ne porte de watermark. */
function drawLogo(_ctx, _W, _H) {
  // Volontairement vide : plus aucun logo sur les photos prises.
}

/* Canvas brut haute qualité : vidéo + filtre + masque + fond (SANS cadre/logo).
   `opts.skipFilter` omet le filtre couleur (pour l'Original du pack lens) tout
   en conservant accessoires, masque et fond. Utilisé par le pack, la RAFALE
   et les captures simples. */
  if (state.remoteCamMode === "controller" && state._remoteCaptureCanvas) { const c = state._remoteCaptureCanvas; state._remoteCaptureCanvas = null; return Promise.resolve(c); }
function grabFrameCanvas(maxDimension = null, opts = {}) {
  const skipFilter = !!opts?.skipFilter;
  return new Promise((resolve) => {
    const video = camera;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    // Le flux peut être 4K, mais les traitements Canvas restent plafonnés.
  // Les photos normales gardent un rendu net ; le mode portrait/segmentation
  // applique son propre plafond plus bas pour éviter la pression mémoire iOS.
  const processingCap = state.portraitMode && !maxDimension
    ? (state.qualityMax ? 1600 : 1080)
    : (maxDimension ?? (state.qualityMax ? 2560 : 1280));
  const cap = processingCap;
    const scale = Math.min(1, cap / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);
    canvas.width = W; canvas.height = H;
    const captureBackdropGeneration = state.backdropGeneration;
    if (state.backdrop) {
      // ── Fond : d'abord le fond, PUIS la personne détourée par-dessus (segmentation) ──
      const drawBackdrop = () => {
        if (state.backdrop.type === "gradient") {
          const grad = ctx.createLinearGradient(0, 0, W, H);
          const stops = state.backdrop.css.match(/#[0-9a-f]{6}/gi) ?? [];
          stops.forEach((color, idx) => grad.addColorStop(idx / Math.max(1, stops.length - 1), color));
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
        } else if (state.backdrop.type === "image" && state._backdropImg) {
          ctx.drawImage(state._backdropImg, 0, 0, W, H);
        } else if (state.backdrop.type === "image" && !state._backdropImg) {
          // Image pas encore chargée → on attend sa chargement puis on retente.
          // En cas d'erreur, terminer la capture avec la caméra plutôt que de
          // rappeler drawBackdrop indéfiniment.
          const requestedBackdropUrl = state.backdrop.url;
          const img = new Image();
          img.onload = () => {
            if (captureBackdropGeneration !== state.backdropGeneration || state.backdrop?.url !== requestedBackdropUrl) {
              drawVideoFrame(ctx, video, W, H, true, undefined, false, skipFilter);
              resolve(canvas);
              return;
            }
            state._backdropImg = img;
            drawBackdrop();
          };
          img.onerror = () => {
            state._backdropImg = null;
            drawVideoFrame(ctx, video, W, H, true, undefined, false, skipFilter);
            resolve(canvas);
          };
          img.src = requestedBackdropUrl;
          return;
        }
        // Personne détourée via le masque de segmentation (sinon vidéo complète)
        if (state.faceMask && state.face && state.face.length > 30) {
          try {
            const cut = document.createElement("canvas");
            cut.width = W; cut.height = H;
            if (!drawSegmented(ctx, cut, video, W, H)) {
              drawVideoCover(ctx, video, W, H);
            }
            releaseCanvas(cut);
            // Le composite fond + personne n'est pas passé par
            // drawVideoFrame : applique ici le filtre pixel et le masque
            // choisi afin que la photo corresponde au preview live.
            const compositeFilter = activePhotoFilter();
            const compositeAccessory = activeAccessory();
            if (!skipFilter && compositeFilter.ops.length) {
              const imageData = ctx.getImageData(0, 0, W, H);
              applyPixelFilter(imageData, state.photoFilterId);
              ctx.putImageData(imageData, 0, 0);
            }
            if (compositeAccessory.mask !== "none" && state.face && state.face.length > 30) {
              ctx.save();
              if (state.facing === "user") { ctx.translate(W, 0); ctx.scale(-1, 1); }
              drawMask(ctx, W, H, state.face, compositeAccessory.mask);
              ctx.restore();
            }
          } catch {
            drawVideoFrame(ctx, video, W, H, true, undefined, false, skipFilter);
          }
    } else {
      // Fallback honnête si la segmentation n'est pas encore disponible :
      // le fond reste visible au lieu d'être entièrement recouvert par la
      // vidéo. Dès que le masque arrive, le détourage précis prend le relais.
      ctx.save();
      ctx.globalAlpha = 0.68;
      drawVideoFrame(ctx, video, W, H, true, undefined, false, skipFilter);
      ctx.restore();
    }
    resolve(canvas);
      };
      drawBackdrop();
      return;
    }
    drawVideoFrame(ctx, video, W, H, true, undefined, false, skipFilter);
    resolve(canvas);
  });
}

/* Finalise un canvas brut : copie brute (ré-export) + cadre + logo → blob JPEG */
function releaseCanvas(canvas) {
  // Aide WebKit à libérer immédiatement les gros buffers après encodage.
  try { if (canvas) { canvas.width = 0; canvas.height = 0; } } catch {}
}

function finalizeCanvas(canvas, W, H, animationEngine = state.animationEngine) {
  return new Promise((resolve) => {
    const ctx = canvas.getContext("2d");
    let rawCanvas = null;
    try {
      rawCanvas = document.createElement("canvas");
      rawCanvas.width = W; rawCanvas.height = H;
      rawCanvas.getContext("2d").drawImage(canvas, 0, 0);
      rawCanvas.toBlob((raw) => {
        state.latestRaw = raw ?? null;
        releaseCanvas(rawCanvas);
      }, "image/jpeg", 0.97);
    } catch {
      state.latestRaw = null;
      releaseCanvas(rawCanvas);
    }
    try {
      drawFrame(ctx, W, H, state.frameId, state.frameText);
      drawLogo(ctx, W, H);
      // L'animation live est figée une seule fois dans la photo exportée.
      if (animationEngine) animationEngine.drawStatic(ctx, W, H);
      canvas.toBlob((blob) => {
        const result = blob ?? null;
        releaseCanvas(canvas);
        resolve(result);
      }, "image/jpeg", 0.97);
    } catch {
      releaseCanvas(canvas);
      resolve(null);
    }
  });
}

/* Vrai flou : downscale progressif puis upscale (lisse, pas de crénelage) */
function makeBlur(src, W, H) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  // 1) Un seul downscale contrôlé : assez doux pour un portrait, sans
  // allouer quatre canvases par capture (cause fréquente des crashs iOS).
  const w = Math.max(48, Math.round(W / 8));
  const h = Math.max(36, Math.round(H / 8));
  const from = document.createElement("canvas");
  from.width = w; from.height = h;
  const sctx = from.getContext("2d");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "medium";
  sctx.drawImage(src, 0, 0, w, h);
  // 2) upscale vers la taille finale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(from, 0, 0, W, H);
  // `from` est un buffer temporaire potentiellement volumineux.
  releaseCanvas(from);
  return canvas;
}

/* Dessine la vidéo découpée par le mask de segmentation dans un canvas de
   travail, en ALIGNANT le miroir : la vidéo est dessinée miroir (caméra
   frontale) et le mask est miroisé en miroir inverse pour rester aligné.
   Retourne le canvas « cut » prêt à être composé sur le fond. */
function drawVideoCover(ctx, video, W, H) {
  if (!video?.videoWidth || !video?.videoHeight || !W || !H) return false;
  const targetRatio = W / H;
  const sourceRatio = video.videoWidth / video.videoHeight;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }
  ctx.save();
  if (state.facing === "user") { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  ctx.restore();
  return true;
}

function drawSegmented(ctx, cut, video, W, H) {
  const mask = state.faceMask;
  if (!mask || !mask.width || !mask.height || !video.videoWidth || !video.videoHeight) return false;
  const cctx = cut.getContext("2d");
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.clearRect(0, 0, W, H);
  const targetRatio = W / H;
  const sourceRatio = video.videoWidth / video.videoHeight;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (sourceRatio > targetRatio) {
    sw = video.videoHeight * targetRatio;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / targetRatio;
    sy = (video.videoHeight - sh) / 2;
  }
  const maskRatio = mask.width / mask.height;
  let msx = 0, msy = 0, msw = mask.width, msh = mask.height;
  if (maskRatio > targetRatio) {
    msw = mask.height * targetRatio;
    msx = (mask.width - msw) / 2;
  } else {
    msh = mask.width / targetRatio;
    msy = (mask.height - msh) / 2;
  }
  // La vidéo et son alpha reçoivent le même recadrage cover. Le miroir est
  // appliqué aux deux sources pour garder le masque aligné en selfie.
  if (state.facing === "user") { cctx.translate(W, 0); cctx.scale(-1, 1); }
  cctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  cctx.globalCompositeOperation = "destination-in";
  cctx.drawImage(mask, msx, msy, msw, msh, 0, 0, W, H);
  cctx.globalCompositeOperation = "source-over";
  ctx.drawImage(cut, 0, 0);
  return true;
}

/* Flou portrait à partir d'un CANVAS (pas de la vidéo live) — réutilisé par
   la RAFALE pour flouter la meilleure frame (au lieu d'une autre capture). */
function portraitBlur(net, W, H, animationEngine = state.animationEngine) {
  return new Promise((resolve) => {
    const nctx = net.getContext("2d", { willReadFrequently: true });
    const blurBase = makeBlur(net, W, H);    const mask = state.faceMask;
    if (mask && mask.width && mask.height) {
      let netMasked = null;
      let out = null;
      try {
        netMasked = document.createElement("canvas");
        netMasked.width = W; netMasked.height = H;
        const mctx = netMasked.getContext("2d");
        mctx.drawImage(net, 0, 0);
        mctx.globalCompositeOperation = "destination-in";
        // `net` est déjà miroir pour la caméra frontale : le masque alpha
        // brut doit recevoir le même miroir au moment du compositing.
        mctx.save();
        if (state.facing === "user") { mctx.translate(W, 0); mctx.scale(-1, 1); }
        mctx.drawImage(mask, 0, 0, W, H);
        mctx.restore();
        mctx.globalCompositeOperation = "source-over";

        out = document.createElement("canvas");
        out.width = W; out.height = H;
        const octx = out.getContext("2d");
        octx.drawImage(blurBase, 0, 0);
        octx.drawImage(netMasked, 0, 0);
        // Compose les éléments UI après le flou : cadre, logo et accessoires restent nets.
        drawFrame(octx, W, H, state.frameId, state.frameText);
        drawLogo(octx, W, H);
        if (animationEngine) animationEngine.drawStatic(octx, W, H);
        out.toBlob((blob) => {
          const result = blob ? { blob, width: W, height: H } : null;
          releaseCanvas(netMasked);
          releaseCanvas(blurBase);
          releaseCanvas(out);
          releaseCanvas(net);
          resolve(result);
        }, "image/jpeg", 0.92);
        return;
      } catch {
        // Si la segmentation échoue après allocation, libère ses buffers avant
        // de passer au fallback ovale. blurBase et net restent nécessaires.
        releaseCanvas(netMasked);
        releaseCanvas(out);
      }
    }

  // Fallback : ovale de visage net sur fond flou.
  // Les landmarks sont normalisés dans le repère de la vidéo ; pour la
  // caméra frontale, la photo a déjà été miroir par drawVideoFrame.
  if (state.face && state.face.length > 30) {
    // Reprend exactement le crop de drawVideoFrame, puis applique le miroir
    // de la caméra frontale : le fallback reste aligné sur le vrai portrait.
    const box = faceBox(
      state.face,
      W,
      H,
      camera.videoWidth || 1280,
      camera.videoHeight || 960,
    );
    const cx = state.facing === "user" ? W - (box.x + box.w / 2) : box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rw = box.w * 1.7, rh = box.h * 1.9;
    const bctx = blurBase.getContext("2d");
    bctx.save();
    bctx.beginPath();
    bctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    bctx.clip();
    bctx.drawImage(net, 0, 0);
    bctx.restore();
  }
    // Même fallback que la segmentation : cadre, logo et animation restent nets.
    const bctxFinal = blurBase.getContext("2d");
    drawFrame(bctxFinal, W, H, state.frameId, state.frameText);
    drawLogo(bctxFinal, W, H);
    if (animationEngine) animationEngine.drawStatic(bctxFinal, W, H);
    blurBase.toBlob((blob) => {
      const result = blob ? { blob, width: W, height: H } : null;
      releaseCanvas(blurBase);
      releaseCanvas(net);
      resolve(result);
    }, "image/jpeg", 0.97);
  });
}

/* GIF animé : pré-enregistrement en continu + post-frames.
   Le GIF démarre UN PEU AVANT la photo (buffer) et se finit
   UN PEU APRÈS (frames supplémentaires) — comme demandé. */
const gifRec = { frames: [], running: false, W: 480, H: 0, timer: null, canvas: null, ctx: null };

function gifStartPre(animationEngine = state.animationEngine) {
  if (gifRec.running) return;
  const video = camera;
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;    const profile = perfConfig();
    gifRec.W = profile.gifSize;
    gifRec.H = Math.max(240, Math.round(profile.gifSize / (vw / vh)));
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
    drawVideoFrame(gifRec.ctx, camera, gifRec.W, gifRec.H, false, animationEngine, true);
    // Clone de la frame (copie pixel par pixel pour que chaque frame reste figée)
    const clone = document.createElement("canvas");
    clone.width = gifRec.W; clone.height = gifRec.H;
    clone.getContext("2d").drawImage(gifRec.canvas, 0, 0);
    gifRec.frames.push(clone);
    if (gifRec.frames.length > perfConfig().gifFrames) {
      // Le buffer est borné : libère aussi la frame évincée sur WebKit.
      releaseCanvas(gifRec.frames.shift());
    }
  };
  tick();    gifRec.timer = setInterval(tick, Math.round(1000 / perfConfig().gifFps));
}

function releaseGifFrames() {
  gifRec.frames.forEach((frame) => releaseCanvas(frame));
  gifRec.frames = [];
}

function gifStopPre(releaseFrames = false) {
  gifRec.running = false;
  if (gifRec.timer) { clearInterval(gifRec.timer); gifRec.timer = null; }
  if (releaseFrames) releaseGifFrames();
}

/* ════════════════════════════════════════════════════════════
   DÉLÉGATION SERVEUR (allège l'iPhone : GIF, ZIP, scoring)
   L'ordi (serveur) fait les traitements lourds ; si le serveur est
   injoignable, on retombe automatiquement sur le traitement local.
   ════════════════════════════════════════════════════════════ */
const _serverPing = { at: 0, up: null };

/* Vrai si le serveur a répondu récemment (cache court).
   ⚠️ Le serveur cloud (Modal) fait un cold start de 2 à 5 s : un timeout trop
   court ou un cache d'échec trop long ferait retomber le téléphone sur les
   traitements locaux (gif.js/jszip) → chauffe et crash iOS. On patiente donc
   un peu plus, et on re-teste vite après un échec. */
async function serverProcessUp() {
  const now = performance.now();
  if (_serverPing.at && now - _serverPing.at < 30000) return _serverPing.up;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("/api/process/ping", { method: "GET", signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    _serverPing.up = res.ok;
  } catch { _serverPing.up = false; }
  _serverPing.at = now;
  return _serverPing.up;
}

function serverProcessMarkDown() { _serverPing.at = performance.now(); _serverPing.up = false; }

/* POST multipart vers /api/process/* : renvoie la réponse ou null (serveur KO). */
async function serverProcessPost(pathname, entries, timeoutMs = 20000) {
  const form = new FormData();
  entries.forEach((entry) => {
    if (Array.isArray(entry)) {
      const [field, value, name] = entry;
      form.append(field, value, name || undefined);
    } else {
      form.append(entry.field || "files", entry.blob, entry.name || undefined);
    }
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(pathname, { method: "POST", body: form, signal: controller.signal, cache: "no-store" });
    // Un HTTP 4xx/5xx (frame corrompue, fichier trop gros…) ne veut PAS dire
    // que le serveur est injoignable : on garde la délégation active et on
    // laisse l'appelant retomber sur le traitement local pour cette fois.
    return res.ok ? res : null;
  } catch {
    // Seule une erreur réseau (abort/TypeError) marque le serveur indisponible.
    serverProcessMarkDown();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Convertit un canvas en JPEG Blob (pour l'upload). */
function canvasToJpegBlob(canvas, quality = 0.72) {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => resolve(b), "image/jpeg", quality); }
    catch { resolve(null); }
  });
}

/* Décode une chaîne base64 en Blob (réponses JPEG du serveur de rendu). */
function b64ToBlob(b64, type = "image/jpeg") {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch { return null; }
}

/* Rendu du pack délégué : le serveur applique les ops du filtre couleur et le
   flou portrait sur le frame envoyé, puis renvoie les JPEG en base64. L'iPhone
   n'encode qu'UN SEUL JPEG (l'upload) au lieu de 3 encodages + ops + blur. */
async function serverRenderPack(raw, W, H, animationEngine, hasFilter, canPortrait) {
  let rawBlob = null;
  try {
    // Photo brute sans cadre pour reframeLatest (même sémantique que finalizeCanvas).
    rawBlob = await canvasToJpegBlob(raw, 0.9);
    state.latestRaw = rawBlob;
    // Base finalisée : cadre + logo + animation figée, puis UN encode pour l'upload.
    const base = cloneCanvas(raw);
    const bctx = base.getContext("2d");
    drawFrame(bctx, W, H, state.frameId, state.frameText);
    drawLogo(bctx, W, H);
    if (animationEngine) animationEngine.drawStatic(bctx, W, H);
    const baseJpeg = await canvasToJpegBlob(base, 0.92);
    releaseCanvas(base);
    if (!baseJpeg) return [];
    const filter = activePhotoFilter();
    const ops = hasFilter && filter ? JSON.stringify(filter.ops) : "[]";
    let faceBox = "";
    if (canPortrait) {
      // Reprend la bbox locale (faceBox) puis applique le miroir caméra frontale :
      // le serveur travaille sur l'image reçue (déjà miroir). Le serveur applique
      // lui-même l'étirement 1.7/1.9 de l'ovale, comme portraitBlur local.
      const box = faceBox(state.face, W, H, camera.videoWidth || 1280, camera.videoHeight || 960);
      let bx = box.x, by = box.y;
      if (state.facing === "user") bx = W - (box.x + box.w);
      bx = Math.max(0, Math.round(bx));
      by = Math.max(0, Math.round(by));
      const bw = Math.max(24, Math.round(Math.min(box.w, W - bx)));
      const bh = Math.max(24, Math.round(Math.min(box.h, H - by)));
      faceBox = JSON.stringify({ x: bx, y: by, w: bw, h: bh });
    }
    const res = await serverProcessPost("/api/process/pack", [
      ["frame", baseJpeg, "frame.jpg"],
      ["filterOps", ops],
      ["faceBox", faceBox],
      ["quality", "94"],
    ], 35000);
    if (!res) return [];
    const j = await res.json().catch(() => null);
    if (!j || !j.original) return [];
    const items = [];
    const origBlob = b64ToBlob(j.original);
    if (origBlob) items.push({ blob: origBlob, label: "Original" });
    if (j.filtered) { const fb = b64ToBlob(j.filtered); if (fb) items.push({ blob: fb, label: filter?.name || "Filtre" }); }
    if (j.portrait) { const pb = b64ToBlob(j.portrait); if (pb) items.push({ blob: pb, label: "Portrait" }); }
    return items;
  } catch {
    // Ne pas effacer un latestRaw déjà valide produit avant l'échec.
    if (!rawBlob) { try { state.latestRaw = null; } catch {} }
    return [];
  }
}

/* Encodage GIF délégué : envoie les frames (canvas) au serveur qui renvoie le GIF. */
async function serverEncodeGif(frames, W, H, delay = 140) {
  try {
    const jpegs = [];
    for (const canvas of frames) {
      const blob = await canvasToJpegBlob(canvas, 0.85);
      if (!blob) return null;
      jpegs.push(["frames", blob]);
    }
    const res = await serverProcessPost("/api/process/gif", [...jpegs, ["width", String(W)], ["height", String(H)], ["delay", String(delay)]], 25000);
    if (!res) return null;
    const gif = await res.blob();
    return gif && gif.size > 0 ? gif : null;
  } catch { return null; }
}

/* ZIP délégué : envoie les blobs, reçoit le ZIP. */
async function serverZipBlobs(files) {
  const entries = files.map((file, index) => ["files", file.blob, file.name || `fichier-${index + 1}.jpg`]);
  const res = await serverProcessPost("/api/process/zip", entries, 40000);
  if (!res) return null;
  const zip = await res.blob();
  return zip && zip.size > 0 ? zip : null;
}

/* Scoring rafale délégué : renvoie un tableau de scores aligné sur l'ordre des frames.
   Les frames sont downscalées en 128 px avant l'envoi : le score se calcule en
   64×64, inutile d'envoyer des JPEG complets sur le réseau. */
async function serverScoreFrames(canvases) {
  try {
    const jpegs = [];
    for (const canvas of canvases) {
      const small = document.createElement("canvas");
      const S = 128;
      small.width = S; small.height = Math.max(1, Math.round((canvas.height / canvas.width) * S));
      small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
      const blob = await canvasToJpegBlob(small, 0.6);
      releaseCanvas(small);
      if (!blob) return null;
      jpegs.push(["frames", blob]);
    }
    const res = await serverProcessPost("/api/process/score", jpegs, 15000);
    if (!res) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.scores) || data.scores.length !== canvases.length) return null;
    return data.scores;
  } catch { return null; }
}

/* Rend le GIF : frames pré (déjà capturées) + N frames post (capturées maintenant) */
function grabGif(postFrames = 6, animationEngine = state.animationEngine) {
  return new Promise((resolve) => {
    let collectedFrames = [];
    try {
      gifStopPre();
      const W = gifRec.W, H = gifRec.H;
      if (!W || !H) { releaseGifFrames(); resolve(null); return; }
      // On collecte toutes les frames (pre + post). L'encodage GIF est
      // exclusivement delegue au serveur Modal (gifenc) — plus de fallback
      // local gif.js qui chauffait l'iPhone et pesait 29 KB.
      const frames = gifRec.frames.slice();
      collectedFrames = frames;
      const preCount = frames.length;
      gifRec.frames = [];
      let settled = false;
      let postTimer = null;
      const finish = (blob) => {
        if (settled) return;
        settled = true;
        if (postTimer) { clearTimeout(postTimer); postTimer = null; }
        frames.forEach((c) => releaseCanvas(c));
        gifStopPre();
        resolve(blob || null);
      };
      const encode = async () => {
        if (settled) return;
        try {
          if (await serverProcessUp()) {
            const gif = await serverEncodeGif(frames, W, H, 140);
            if (gif) { finish(gif); return; }
          }
        } catch { /* serveur indisponible */ }
        // Plus de fallback local gif.js : le serveur Modal est l'encodeur unique.
        // Si le serveur est down, on libere les frames sans GIF (pas de crash).
        toast("GIF indisponible (serveur hors ligne)");
        finish(null);
      };
      const takePost = () => {
        if (settled) return;
        try {
          if (frames.length >= preCount + postFrames || postFrames <= 0) {
            void encode();
            return;
          }
          drawVideoFrame(gifRec.ctx, camera, W, H, false, animationEngine, true);
          const clone = document.createElement("canvas");
          clone.width = W; clone.height = H;
          clone.getContext("2d").drawImage(gifRec.canvas, 0, 0);
          frames.push(clone);
          postTimer = setTimeout(takePost, 140);
        } catch { finish(null); }
      };
      takePost();
    } catch {
      // Chemin d'erreur synchrone : libère aussi les frames déjà collectées
      // (gifRec.frames est déjà vide à ce stade).
      collectedFrames.forEach((c) => releaseCanvas(c));
      releaseGifFrames();
      gifStopPre();
      resolve(null);
    }
  });
}

/* =========================================================
   RÉSULTAT (grille : normal + portrait + gif)
   ========================================================= */
function clearResultResources() {
  state.resultTimers.splice(0).forEach((timer) => clearTimeout(timer));
  state.resultObjectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  clearAutoReturn();
}

function startAutoReturn(secs) {
  clearAutoReturn();
  const btn = $("btn-auto-return");
  const countEl = $("auto-return-count");
  if (!btn || !countEl) return;
  btn.style.display = "flex";
  let remaining = secs;
  countEl.textContent = remaining;
  state._autoReturnTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearAutoReturn();
      if (screens.result.classList.contains("active")) showCapture();
      return;
    }
    countEl.textContent = remaining;
  }, 1000);
}
function clearAutoReturn() {
  if (state._autoReturnTimer) { clearInterval(state._autoReturnTimer); state._autoReturnTimer = null; }
  const btn = $("btn-auto-return");
  if (btn) btn.style.display = "none";
}

function showResult(items) {
  if (!items || !items.length) { toast("Capture impossible"); return; }
  if (state.captureBatchActive) {
    state.captureBatchItems.push(...items.filter((item) => item?.blob));
    return;
  }
  stopAnimation();
  state.animationEngine = null;
  clearResultResources();
  pauseLiveProcessing();
  state.resultGeneration += 1;
  const resultGeneration = state.resultGeneration;
  state.resultItems = items.filter((item) => item?.blob);
  state.selectedResultKind = null;
  state.latestPhoto = state.resultItems.find((item) => !item.gif)?.blob || null;
  state.latestGif = state.resultItems.find((item) => item.gif)?.blob || null;
  const grid = $("result-grid");
  grid.innerHTML = "";
  grid.classList.toggle("multi", state.resultItems.length >= 3);
  const resultCount = $("result-count");
  if (resultCount) resultCount.textContent = `${state.resultItems.length} ${state.resultItems.length > 1 ? "éléments" : "élément"}`;
  const firstPhoto = state.resultItems.find((item) => !item.gif) ?? state.resultItems[0];
  state.resultItems.forEach((item, index) => {
    const wrap = document.createElement("div");
    wrap.className = "result-item";
    wrap.dataset.kind = item.gif ? "gif" : item.label === "Portrait" ? "portrait" : item.label === "Original" ? "original" : "filter";
    const img = document.createElement("img");
    img.className = item.gif ? "result-image gif" : "result-image";
    img.dataset.index = index;
    const setSelected = () => {
      state.selectedResultKind = item.gif ? "gif" : "photo";
      if (item.gif) state.latestGif = item.blob;
      else state.latestPhoto = item.blob;
      grid.querySelectorAll(".result-item").forEach((entry) => entry.classList.remove("selected"));
      wrap.classList.add("selected");
    };
    img.addEventListener("click", setSelected);
    wrap.classList.toggle("selected", item === firstPhoto && state.selectedResultKind === null);
    const url = URL.createObjectURL(item.blob);
    state.resultObjectUrls.push(url);
    if (item.gif) {
      // Aperçu fixe immédiat, puis démarrage animé : l'utilisateur voit
      // toujours le résultat même si le GIF est lourd à décoder sur iPhone.
      const stillUrl = URL.createObjectURL(firstPhoto.blob);
      state.resultObjectUrls.push(stillUrl);
      img.src = stillUrl;
      const timer = setTimeout(() => {
        img.src = url;
        img.classList.add("playing");
      }, 1400);
      state.resultTimers.push(timer);
    } else {
      img.src = url;
    }
    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = item.gif ? "▶ " + item.label : item.label;
    wrap.appendChild(img);
    wrap.appendChild(label);
    grid.appendChild(wrap);
  });
  $("share-status").textContent = state.publicUrl ? "Prêt à partager" : "Photo enregistrée sur cet appareil";
  $("share-qr-box").classList.add("hidden");
  // Le partage et le commentaire font partie de l'aperçu : ils ne doivent
  // jamais être masqués avant l'action explicite de l'utilisateur.
  $("share-box").style.display = "block";
  $("photo-comment").value = "";
  screens.capture.classList.remove("active");
  screens.result.classList.add("active");
  // Le rendu est prioritaire : la persistance démarre après affichage de
  // l'aperçu et ne peut donc plus le faire disparaître. On conserve la
  // promesse pour qu'un commentaire tapé immédiatement soit bien rattaché.
  state.resultPersistencePromise = persistResultItems(state.resultItems, resultGeneration);
  // Auto-retour : après 6 secondes sans interaction, retour à la caméra.
  startAutoReturn(20);
}

function showCapture() {
  // L'animation reprend uniquement si l'utilisateur en choisit une nouvelle.
  clearResultResources();
  screens.result.classList.remove("active");
  screens.gallery.classList.remove("active");
  screens.guest?.classList.remove("active");
  screens.capture.classList.add("active");
  // Après un retour depuis galerie/résultat, attendre le layout final avant
  // de recalibrer le canvas : cela évite un preview plus petit que la zone.
  window.mbScheduleViewportSync?.(true);
  resumeLiveProcessing();
  state.publicUrl = "";
  $("share-qr-box").classList.add("hidden");
  $("share-status").textContent = "";
}

async function shareMethod(method) {
  const status = $("share-status");
  // Le bouton peut être pressé juste après l'affichage : attendre la copie
  // locale/upload éventuel avant de construire un QR ou un lien externe.
  if (state.resultPersistencePromise) await state.resultPersistencePromise.catch(() => {});
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
        const files = [];
        // Le média touché devient prioritaire ; au premier affichage, les
        // deux formats sont proposés ensemble.
        const selectedOnly = state.selectedResultKind === "gif" ? state.latestGif : state.selectedResultKind === "photo" ? state.latestPhoto : null;
        if (selectedOnly) {
          const isGif = selectedOnly.type === "image/gif";
          files.push(new File([selectedOnly], `momentobooth-${Date.now()}.${isGif ? "gif" : "jpg"}`, { type: selectedOnly.type || (isGif ? "image/gif" : "image/jpeg") }));
        } else {
          if (state.latestPhoto) files.push(new File([state.latestPhoto], `momentobooth-${Date.now()}.jpg`, { type: state.latestPhoto.type || "image/jpeg" }));
          if (state.latestGif) files.push(new File([state.latestGif], `momentobooth-${Date.now()}.gif`, { type: state.latestGif.type || "image/gif" }));
        }
        const payload = files.length && navigator.canShare?.({ files })
          ? { title: "MomentoBooth", text, files }
          : { title: "MomentoBooth", text, url: publicUrl };
        await navigator.share(payload);
        status.textContent = "Partagé ✓";
      } else {
        status.textContent = "Partage natif indisponible";
      }
    } else if (method === "qrcode") {
      $("share-qr-box").classList.remove("hidden");
      $("share-qr").src = `/api/qr?url=${encodeURIComponent(publicUrl)}`;
      status.textContent = "QR affiché — scannez pour la photo";
    } else if (method === "download") {
      if (!state.latestPhoto) { status.textContent = "Pas de photo"; return; }
      const url = URL.createObjectURL(state.latestPhoto);
      const a = document.createElement("a");
      a.href = url;
      a.download = `momentobooth-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Téléchargé ✓";
    } else if (method === "download-gif") {
      if (state.latestGif) {
        const url = URL.createObjectURL(state.latestGif);
        const a = document.createElement("a");
        a.href = url;
        a.download = `momentobooth-${Date.now()}.gif`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = "GIF téléchargé ✓";
      } else {
        status.textContent = "Pas de GIF (mode photo simple)";
      }
    } else if (method === "photos") {        await saveToPhotos(state.selectedResultKind === "gif" ? state.latestGif : state.latestPhoto);
    }
  } catch { status.textContent = "Erreur partage"; }
}

/* =========================================================
   GALERIE
   ========================================================= */
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("momentobooth", 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("moments")) d.createObjectStore("moments", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveLocal(blob, metadata = {}) {
  if (!blob) throw new Error("blob manquant");
  const id = metadata.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("photos", "readwrite");
    tx.objectStore("photos").put({
      id,
      blob,
      date: metadata.date || Date.now(),
      mediaType: metadata.mediaType || (blob.type === "image/gif" ? "gif" : "photo"),
      label: metadata.label || "Photo",
      ...(metadata.serverId ? { serverId: metadata.serverId } : {}),
    });
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
async function setLocalServerId(localId, serverId) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      const req = store.get(localId);
      req.onsuccess = () => {
        if (req.result) store.put({ ...req.result, serverId });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* le partage reste possible sans métadonnée locale */ }
}

async function uploadPhoto(blob, localId = state.lastLocalId, mediaType = "photo", generation = state.resultGeneration) {
  if (!blob) return null;
  const id = localId || await saveLocal(blob, { mediaType, label: mediaType === "gif" ? "GIF" : "Photo" });
  if (mediaType !== "gif" && generation === state.resultGeneration) state.lastLocalId = id;
  const extension = mediaType === "gif" || blob.type === "image/gif" ? "gif" : "jpg";
  const form = new FormData();
  form.append("photo", blob, `${id}.${extension}`);
  try {
    const guestHeaders = state.guestToken && state.guestHostKey
      ? { "x-guest-token": state.guestToken, "x-guest-host-key": state.guestHostKey }
      : {};
    const response = await fetch("/api/photos", { method: "POST", headers: guestHeaders, body: form });
    if (response.ok) {
      const data = await response.json();
      // L'enregistrement local doit toujours recevoir son serverId, mais une
      // ancienne capture ne doit pas remplacer le lien de la capture courante.
      await setLocalServerId(id, data.id);
      if (generation === state.resultGeneration) {
        state.publicUrl = data.publicUrl || data.url || "";
      }
    }
  } catch { /* serveur optionnel : la copie locale reste valide */ }
  return id;
}

async function persistResultItems(items, generation = state.resultGeneration) {
  const photoItems = items.filter((item) => item?.blob && !item.gif);
  const gifItems = items.filter((item) => item?.blob && item.gif);
  const primary = photoItems[0];
  if (!primary) return;
  try {
    // Sauvegarde locale immédiate : la capture ne doit jamais disparaître si
    // l'utilisateur quitte l'écran avant d'appuyer sur « Sauvegarder ».
    const photoId = await saveLocal(primary.blob, { mediaType: "photo", label: primary.label });
    // Une capture suivante peut avoir commencé pendant IndexedDB : l'ancien
    // résultat ne doit jamais reprendre le pointeur de commentaire courant.
    if (generation !== state.resultGeneration) return;
    state.lastLocalId = photoId;
    // Les variantes portrait restent consultables dans la bibliothèque.
    for (const item of photoItems.slice(1)) {
      if (item.blob !== primary.blob) await saveLocal(item.blob, { mediaType: "photo", label: item.label });
    }
    // Le GIF est stocké dans le même magasin IndexedDB et apparaît dans la
    // galerie avec son animation native.
    if (gifItems[0]) {
      const gifId = await saveLocal(gifItems[0].blob, { mediaType: "gif", label: gifItems[0].label });
      if (generation !== state.resultGeneration) return;
      state.lastGifLocalId = gifId;
      // Le GIF suit aussi la photo vers la galerie distante lorsqu'un serveur
      // est disponible ; en local il est déjà conservé dans IndexedDB.
      if (generation === state.resultGeneration) await uploadPhoto(gifItems[0].blob, gifId, "gif", generation);
    }
    if (generation !== state.resultGeneration) return;
    $("share-status").textContent = "Photo et GIF enregistrés ✓";
    // Upload serveur en arrière-plan : ne bloque ni l'aperçu ni le commentaire.
    if (generation === state.resultGeneration) await uploadPhoto(primary.blob, photoId, "photo", generation);
  } catch (error) {
    console.warn("[MomentoBooth] sauvegarde locale impossible", error);
    if (generation === state.resultGeneration) $("share-status").textContent = "Aperçu prêt — sauvegarde locale indisponible";
  }
}

function openGuestSharePanel(autoCreate = true) {
  const panel = $("guest-share-panel");
  if (!panel) return;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  $("gallery-title")?.setAttribute("aria-label", "Galerie — partage invités ouvert");
  if (!autoCreate) return;
  // Réutilise une session encore valide : QR + lien affichés immédiatement,
  // sans recréer un lien à chaque ouverture.
  try {
    const saved = JSON.parse(localStorage.getItem("momentobooth-guest-session") || "null");
    if (saved && saved.url && saved.token && Date.now() < (saved.expiresAt || 0)) {
      state.guestToken = saved.token;
      state.guestHostKey = saved.hostKey;
      state.guestLiveEnabled = Boolean($("guest-live-toggle")?.checked);
      $("guest-share-url").value = saved.url;
      $("guest-share-link-row").classList.remove("hidden");
      $("guest-share-qr").src = guestQrUrl(saved.url);
      $("guest-share-qr-box").classList.remove("hidden");
      guestShareStatus(`Lien actif jusqu’au ${new Date(saved.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`);
      return;
    }
  } catch { /* session corrompue → en créer une neuve */ }
  void createGuestLink();
}
function closeGuestSharePanel() {
  const panel = $("guest-share-panel");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}
function guestShareStatus(message) {
  const el = $("guest-share-status");
  if (el) el.textContent = message;
}
function guestQrUrl(url) {
  return `/api/qr?url=${encodeURIComponent(url)}`;
}

async function createGuestLink() {
  const button = $("guest-create-link");
  if (button) button.disabled = true;
  guestShareStatus("Création du lien privé…");
  try {
    const response = await fetch("/api/guest/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!response.ok) throw new Error("session");
    const data = await response.json();
    state.guestToken = data.token;
    state.guestHostKey = data.hostKey;
    state.guestLiveEnabled = Boolean($("guest-live-toggle")?.checked);
    localStorage.setItem("momentobooth-guest-session", JSON.stringify({ token: state.guestToken, hostKey: state.guestHostKey, url: data.url, expiresAt: data.expiresAt }));
    $("guest-share-url").value = data.url;
    $("guest-share-link-row").classList.remove("hidden");
    $("guest-share-qr").src = guestQrUrl(data.url);
    $("guest-share-qr-box").classList.remove("hidden");
    guestShareStatus(`Lien actif jusqu’au ${new Date(data.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`);
    startGuestLivePublisher();
  } catch {
    guestShareStatus("Impossible de créer le lien. Vérifiez la connexion du serveur.");
  } finally {
    if (button) button.disabled = false;
  }
}
async function copyGuestUrl() {
  const input = $("guest-share-url");
  if (!input?.value) return;
  try { await navigator.clipboard.writeText(input.value); }
  catch { input.select(); document.execCommand("copy"); }
  guestShareStatus("URL copiée ✓");
}
async function shareGuestUrl() {
  const url = $("guest-share-url")?.value;
  if (!url) return guestShareStatus("Créez d’abord le lien invité.");
  if (navigator.share) {
    try { await navigator.share({ title: "Galerie MomentoBooth", text: "Accéder à la galerie de l’événement", url }); }
    catch { /* fermeture du panneau natif */ }
  } else copyGuestUrl();
}
function stopGuestLivePublisher() {
  if (state.guestLiveTimer) clearInterval(state.guestLiveTimer);
  state.guestLiveTimer = null;
  state.guestLiveBusy = false;
}
function startGuestLivePublisher() {
  stopGuestLivePublisher();
  if (!state.guestToken || !state.guestHostKey || !state.guestLiveEnabled) return;
  const publish = async () => {
    if (state.guestLiveBusy || !state.stream || document.hidden || !screens.capture.classList.contains("active")) return;
    state.guestLiveBusy = true;
    try {
      const canvas = document.createElement("canvas");
      const ratio = camera.videoWidth / camera.videoHeight || 1.6;
      canvas.width = 480; canvas.height = Math.max(270, Math.round(480 / ratio));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.62));
      if (!blob) return;
      const form = new FormData();
      form.append("frame", blob, "preview.jpg");
      const response = await fetch(`/api/guest/${encodeURIComponent(state.guestToken)}/live`, { method: "POST", headers: { "x-guest-host-key": state.guestHostKey }, body: form });
      if (response.status === 404) {
        stopGuestLivePublisher();
        localStorage.removeItem("momentobooth-guest-session");
        guestShareStatus("Le lien invité a expiré.");
      }
    } catch (error) {
      if (error?.status === 404) stopGuestLivePublisher();
    } finally { state.guestLiveBusy = false; }
  };
  publish();
  state.guestLiveTimer = setInterval(publish, 1200);
}
async function loadGuestGallery(token) {
  const grid = $("guest-gallery-grid");
  if (!grid) return false;
  try {
    const response = await fetch(`/api/guest/${encodeURIComponent(token)}/gallery`, { cache: "no-store" });
    if (response.status === 404) {
      $("guest-gallery-grid").innerHTML = '<p class="guest-gallery-empty">Ce lien invité a expiré.</p>';
      return false;
    }
    if (!response.ok) throw new Error("gallery");
    const data = await response.json();
    const photos = data.photos || [];
    $("guest-gallery-count").textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""}`;
    grid.innerHTML = "";
    if (!photos.length) { grid.innerHTML = '<p class="guest-gallery-empty">Les photos apparaîtront ici dès qu’elles seront enregistrées.</p>'; return true; }
    photos.forEach((photo) => {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = `${photo.url}${photo.url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      img.alt = "Photo de la galerie";
      grid.appendChild(img);
    });
    return true;
  } catch {
    grid.innerHTML = '<p class="guest-gallery-empty">Ce lien invité est expiré ou indisponible.</p>';
    return false;
  }
}
function startGuestLivePolling(token) {
  const image = $("guest-live-image");
  const empty = $("guest-live-empty");
  const status = $("guest-live-state");
  let active = true;
  let timer = null;
  const poll = async () => {
    if (!active || document.hidden) return;
    try {
      const response = await fetch(`/api/guest/${encodeURIComponent(token)}/live?t=${Date.now()}`, { cache: "no-store" });
      if (response.status === 200) {
        const blob = await response.blob();
        const old = image.src;
        image.src = URL.createObjectURL(blob);
        image.classList.remove("hidden"); empty.classList.add("hidden"); status.textContent = "Aperçu";
        if (old.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(old), 1500);
      } else if (response.status === 404) {
        active = false;
        if (timer) clearInterval(timer);
        image.classList.add("hidden"); empty.classList.remove("hidden"); status.textContent = "Lien expiré";
      } else {
        image.classList.add("hidden"); empty.classList.remove("hidden"); status.textContent = "En attente";
      }
    } catch { status.textContent = "Hors connexion"; }
  };
  poll();
  timer = setInterval(poll, 1500);
  window.addEventListener("pagehide", () => { active = false; if (timer) clearInterval(timer); }, { once: true });
}
async function initGuestMode() {
  const token = new URLSearchParams(location.search).get("guest") || location.pathname.match(/^\/guest\/([A-Za-z0-9_-]{32,80})$/)?.[1];
  if (!token || !screens.guest) return false;
  screens.capture.classList.remove("active");
  screens.result.classList.remove("active");
  screens.gallery.classList.remove("active");
  screens.guest.classList.add("active");
  document.body.classList.add("guest-mode");
  await loadGuestGallery(token);
  startGuestLivePolling(token);
  let refresh = null;
  const startRefresh = () => {
    if (refresh || document.hidden) return;
    refresh = setInterval(async () => {
      if (!(await loadGuestGallery(token))) { clearInterval(refresh); refresh = null; }
    }, 5000);
  };
  const stopRefresh = () => { if (refresh) clearInterval(refresh); refresh = null; };
  startRefresh();
  document.addEventListener("visibilitychange", () => document.hidden ? stopRefresh() : startRefresh());
  window.addEventListener("pagehide", stopRefresh, { once: true });
  hideSplash();
  return true;
}

/* =========================================================
   CAMERA DEPORTEE — iPhone = camera, iPad = controle
   ========================================================= */
let _remotePubTimer = null;
let _remotePollTimer = null;
let _remotePreviewCanvas = null;
let _remotePollBlobUrl = null;

async function startRemoteCamera() {
  state.remoteCamMode = 'camera';
  try {
    const res = await fetch("/api/remote-camera/sessions", { method: "POST" });
    if (!res.ok) throw new Error("session");
    const data = await res.json();
    state.remoteCamToken = data.token;
    state.remoteCamHostKey = data.hostKey;
    $("remote-token-display").value = data.url;
    $("remote-token-row").style.display = "flex";
    savePreferences();
    toast("Camera deportee activee - Token copie");
    try { await navigator.clipboard.writeText(data.url); } catch {}
    startRemotePublishing();
  } catch {
    toast("Impossible de creer la session distante");
    stopRemoteCamera();
  }
}

function stopRemoteCamera() {
  stopRemotePublishing();
  state.remoteCamMode = 'off';
  state.remoteCamToken = '';
  state.remoteCamHostKey = '';
  $("remote-token-row").style.display = "none";
  $("remote-qr-row").style.display = "none";
  savePreferences();
}

function startRemotePublishing() {
  stopRemotePublishing();
  if (!state.remoteCamToken || state.remoteCamMode !== 'camera') return;
  const publish = async () => {
    if (!state.stream || !camera.videoWidth || document.hidden) return;
    try {
      const W = Math.min(camera.videoWidth, 1280);
      const H = Math.round(W / (camera.videoWidth / camera.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      canvas.getContext("2d").drawImage(camera, 0, 0, W, H);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
      if (!blob) return;
      const form = new FormData();
      form.append("frame", blob, "preview.jpg");
      await fetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame`, {
        method: "POST",
        headers: { "x-host-key": state.remoteCamHostKey },
        body: form,
      });
    } catch { /* reseau intermittent, continuer */ }
  };
  publish();
  _remotePubTimer = setInterval(publish, 450);
}

function stopRemotePublishing() {
  if (_remotePubTimer) { clearInterval(_remotePubTimer); _remotePubTimer = null; }
}

async function connectRemoteCamera(token) {
  if (!token) return;
  disconnectRemoteCamera();
  state.remoteCamMode = 'controller';
  state.remoteCamToken = token.trim();
  savePreferences();
  $("remote-controller-status").style.display = "flex";
  $("remote-status-text").textContent = "Connecte...";
  // Cree le canvas de preview distant (par-dessus la camera)
  _remotePreviewCanvas = document.createElement("canvas");
  _remotePreviewCanvas.id = "remote-preview";
  _remotePreviewCanvas.style.cssText = "position:absolute;inset:0;z-index:5;width:100%;height:100%;";
  const zone = $("camera-zone");
  if (zone) zone.appendChild(_remotePreviewCanvas);
  startRemotePolling();
  $("remote-status-text").textContent = "Camera distante connectee";
  toast("Camera deportee connectee");
}

function disconnectRemoteCamera() {
  stopRemotePolling();
  state.remoteCamMode = 'off';
  state.remoteCamToken = '';
  if (_remotePreviewCanvas) { _remotePreviewCanvas.remove(); _remotePreviewCanvas = null; }
  $("remote-controller-status").style.display = "none";
  savePreferences();
  toast("Camera deportee deconnectee");
}

function startRemotePolling() {
  stopRemotePolling();
  if (!state.remoteCamToken || state.remoteCamMode !== 'controller') return;
  const poll = async () => {
    if (!state.remoteCamToken || document.hidden) return;
    try {
      const res = await fetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame?t=${Date.now()}`, { cache: "no-store" });
      if (res.status === 204) return;
      if (!res.ok) { disconnectRemoteCamera(); return; }
      const blob = await res.blob();
      if (!blob || !_remotePreviewCanvas) return;
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        if (_remotePollBlobUrl) URL.revokeObjectURL(_remotePollBlobUrl);
        _remotePollBlobUrl = url;
        const cw = _remotePreviewCanvas.parentElement?.clientWidth || 390;
        const ch = _remotePreviewCanvas.parentElement?.clientHeight || 844;
        _remotePreviewCanvas.width = img.naturalWidth;
        _remotePreviewCanvas.height = img.naturalHeight;
        const ctx = _remotePreviewCanvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        state.remoteCamW = img.naturalWidth;
        state.remoteCamH = img.naturalHeight;
      };
      img.src = url;
    } catch { /* continuer */ }
  };
  poll();
  _remotePollTimer = setInterval(poll, 500);
}

function stopRemotePolling() {
  if (_remotePollTimer) { clearInterval(_remotePollTimer); _remotePollTimer = null; }
  if (_remotePollBlobUrl) { URL.revokeObjectURL(_remotePollBlobUrl); _remotePollBlobUrl = null; }
}

/* Telecharge la derniere frame distante et retourne un canvas (pour la capture). */
async function grabRemoteFrame() {
  if (!state.remoteCamToken) return null;
  try {
    const res = await fetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    return canvas;
  } catch { return null; }
}

async function renderGallery() {
  const grid = $("gallery-grid");
  grid.innerHTML = "";
  const photos = await loadLocal();
  let serverPhotos = [];    try {
      const headers = state.guestToken && state.guestHostKey
        ? { "x-guest-token": state.guestToken, "x-guest-host-key": state.guestHostKey }
        : {};
      const response = await fetch("/api/photos", { cache: "no-store", headers });
      if (response.ok) serverPhotos = (await response.json()).photos ?? [];
    } catch { /* serveur optionnel */ }
  const serverById = new Map(serverPhotos.map((p) => [p.id, p]));
  const unique = new Map();
  // L'entrée locale garde le blob immédiatement disponible ; serverId permet
  // de la fusionner avec son équivalent serveur sans créer un doublon.
  photos.forEach((p) => unique.set(p.serverId || p.id, p));
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
    if (photo.blob) {
      const galleryUrl = img.src;
      img.addEventListener("load", () => setTimeout(() => URL.revokeObjectURL(galleryUrl), 1000), { once: true });
    }
    img.className = photo.mediaType === "gif" ? "gallery-gif" : "";
    img.loading = "lazy";
    img.addEventListener("click", async () => {
      let blob = photo.blob;
      if (!blob && serverById.get(photo.id)?.url) {
        try {
          const response = await fetch(serverById.get(photo.id).url, { cache: "no-store" });
          if (!response.ok) throw new Error("photo introuvable");
          blob = await response.blob();
        } catch {
          toast("Photo indisponible");
          return;
        }
      }
      if (!blob) return;
      const isGif = photo.mediaType === "gif" || blob.type === "image/gif";
      if (isGif) {
        state.latestGif = blob;
        state.latestPhoto = null;
        state.selectedResultKind = "gif";
      } else {
        state.latestPhoto = blob;
        state.latestGif = null;
        state.selectedResultKind = "photo";
      }
      state.latestRaw = blob;
      state.lastLocalId = photo.blob ? photo.id : null;
      state.resultPersistencePromise = null;
      clearResultResources();
      pauseLiveProcessing();
      screens.gallery.classList.remove("active");
      screens.result.classList.add("active");
      $("result-grid").innerHTML = "";
      $("result-grid").classList.remove("multi");
        const rwrap = document.createElement("div");
      rwrap.className = "result-item";
      const rimg = document.createElement("img");
      const resultUrl = URL.createObjectURL(blob);
      state.resultObjectUrls.push(resultUrl);
      rimg.src = resultUrl;
      rimg.className = photo.mediaType === "gif" || blob.type === "image/gif" ? "result-image gif playing" : "result-image";
      rwrap.appendChild(rimg);
      $("result-grid").appendChild(rwrap);
      $("share-box").style.display = "block";
      $("share-status").textContent = "Photo de la galerie — prête à partager";
      $("share-qr-box").classList.add("hidden");
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
        await deletePhoto(photo.id, photo.serverId || photo.id, Boolean(photo.serverId || serverById.has(photo.id)));
        renderGallery();
      });
      wrap.appendChild(delBtn);
    }
    grid.appendChild(wrap);
  });
}

async function deletePhoto(localId, serverId = null, isServer = false) {
  // Local : l'ID IndexedDB peut différer de l'ID du fichier serveur.
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(localId);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch { /* pas en local */ }
  // Serveur
  if (isServer) {
    try {
      const headers = state.guestToken && state.guestHostKey
        ? { "x-guest-token": state.guestToken, "x-guest-host-key": state.guestHostKey }
        : {};
      await fetch(`/api/photos/${serverId || localId}`, { method: "DELETE", headers });
    } catch { /* serveur optionnel */ }
  }
  toast("Photo supprimée");
}

/* Export ZIP de toutes les photos (délégué exclusivement au serveur Modal).
   Plus de fallback jszip local — 97 KB économisés sur l'iPhone. */
async function exportZip() {
  const photos = await loadLocal();
  if (!photos.length) { toast("Aucune photo locale"); return; }
  toast("Création du ZIP…");
  const names = new Set();
  const files = photos.map((photo) => {
    const isGif = photo.mediaType === "gif" || photo.blob?.type === "image/gif";
    const extension = isGif ? "gif" : "jpg";
    let name = `photo-${photo.id.split("-").pop() || photo.id}.${extension}`;
    while (names.has(name)) name = `photo-${Math.random().toString(36).slice(2, 6)}.${extension}`;
    names.add(name);
    return { blob: photo.blob, name };
  });
  const download = (blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `momentobooth-${Date.now()}.zip`;
    a.click();
    toast(`ZIP exporté (${photos.length} photos)`);
  };
  try {
    if (await serverProcessUp()) {
      const zipBlob = await serverZipBlobs(files);
      if (zipBlob) { download(zipBlob); return; }
    }
  } catch { /* serveur indisponible */ }
  // Plus de fallback jszip local : le serveur Modal est l'encodeur unique.
  toast("ZIP indisponible (serveur hors ligne)");
}

/* Enregistrer toutes les photos dans la galerie iOS (Web Share API files) */
async function saveAllToPhotos() {
  const photos = await loadLocal();
  if (!photos.length) { toast("Aucune photo locale"); return; }
  const files = photos.map((p) => {
    const isGif = p.mediaType === "gif" || p.blob?.type === "image/gif";
    return new File([p.blob], `momentobooth-${p.id}.${isGif ? "gif" : "jpg"}`, { type: isGif ? "image/gif" : "image/jpeg" });
  });
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: "MomentoBooth" });
      toast("Enregistrées dans Photos ✓");
    } catch { toast("Partage annulé"); }
  } else {
    // Fallback : télécharger une par une
    files.forEach((file, i) => setTimeout(() => {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  if (state.resultPersistencePromise) await state.resultPersistencePromise.catch(() => {});
  if (!value) { toast("Écrivez un commentaire"); return; }
  if (!state.lastLocalId && state.latestPhoto) {
    try {
      state.lastLocalId = await saveLocal(state.latestPhoto, { mediaType: "photo", label: "Photo" });
    } catch { /* message ci-dessous */ }
  }
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
      if (state.backdrop) void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
      document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      document.body.classList.toggle("has-backdrop", Boolean(state.backdrop));
      drawLiveOverlay(); // rendu live immédiat
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
    savePreferences();
    toast(state.portraitMode ? "Mode portrait : photo + flou + GIF" : "Mode portrait off");
  });
  // Rafale Flash+ : flash hyper fort + meilleure prise automatique + flou + GIF
  on("set-burst", "change", (e) => {
    state.burstMode = e.target.checked;
    savePreferences();
    toast(state.burstMode
      ? "Rafale Flash+ : flash fort + meilleure prise parmi 7 photos"
      : "Rafale désactivée");
  });
  // Flash : Auto / On / Off
  document.querySelectorAll("#flash-modes button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.flashMode = btn.dataset.flash;
      savePreferences();
      document.querySelectorAll("#flash-modes button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      toast(btn.dataset.flash === "on" ? "Flash toujours ✓" : btn.dataset.flash === "auto" ? "Flash auto (si sombre)" : "Flash désactivé");
      if (state.flashMode === "auto") startLightMonitor();
      else if (state.flashMode === "off" && !state.lightFrameEnabled) stopLightMonitor();
      // Aucun flash de confirmation : il ne doit jamais masquer le preview.
      if (btn.dataset.flash !== "off") tryTorch(false);
    });
  });
  // Délai AUTO : 0,5 s / 1,5 s / 3 s
  document.querySelectorAll("#auto-delay-modes button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.autoDelay = Number(btn.dataset.delay);
      savePreferences();
      document.querySelectorAll("#auto-delay-modes button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      toast(`Délai AUTO : ${state.autoDelay} s ✓`);
    });
  });
  on("set-quality", "change", (e) => {
    state.qualityMax = e.target.checked;
    savePreferences();
    toast(state.qualityMax ? "Qualité maximale (4K)" : "Qualité standard");
  });
  on("set-performance", "change", async (e) => {
    state.performanceMode = PERF[e.target.value] ? e.target.value : "eco";
    savePreferences();
    // La nouvelle cadence prend effet sans couper la caméra. Une relance
    // est volontairement évitée ici : elle ferait chauffer davantage.
    if (_detectFaceTimer) {
      clearInterval(_detectFaceTimer);
      _detectFaceTimer = setInterval(detectFace, perfConfig().detectMs);
    }
    if (_prerollTimer) {
      stopPreroll();
      if (state.prerollEnabled && state.stream) startPreroll();
    }
    state._forceOverlay = true;
    drawLiveOverlay();
    toast(`Mode thermique : ${state.performanceMode === "eco" ? "éco" : state.performanceMode}`);
  });
  on("set-track", "change", (e) => {
    state.trackEnabled = e.target.checked;
    savePreferences();
    if (state.trackEnabled) void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    else void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    toast(state.trackEnabled ? "Suivi visage activé" : "Suivi visage désactivé");
  });
  on("set-idle", "change", (e) => {
    state.idleEnabled = e.target.checked;
    if (!state.idleEnabled) {
      state.idleFaceWake = false;
      const wake = $("set-idle-face");
      if (wake) wake.checked = false;
      stopIdleMode();
      exitIdle();
      savePreferences();
      void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
      toast("Veille désactivée — caméra seule");
    } else {
      savePreferences();
      initIdleMode();
      _idleTriggeredAt = performance.now();
      void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
      toast("Veille activée — animation d'accueil optionnelle");
    }
  });
  on("set-idle-face", "change", (e) => {
    state.idleFaceWake = e.target.checked;
    savePreferences();
    if (state.idleFaceWake) {
      state.idleEnabled = true;
      $("set-idle") && ($("set-idle").checked = true);
      savePreferences();
      void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    } else {
      void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    }
    toast(state.idleFaceWake ? "Réveil par visage activé" : "Réveil par visage désactivé");
  });
  // Préfilmage : séquence quand quelqu'un approche / voix proche (stockée à part)
  on("set-preroll", "change", (e) => {
    state.prerollEnabled = e.target.checked;
    savePreferences();
    if (state.prerollEnabled) {
      void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
      startPreroll();
      // Déclencheur voix : demande le micro maintenant (le toggle est déjà un geste)
      initPrerollAudio();
      toast("Préfilmage activé — moments drôles capturés à part");
    } else {
      stopPreroll();
      void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
      toast("Préfilmage désactivé");
    }
  });
  // Bulle « Vous êtes filmé »
  on("set-film-bubble", "change", (e) => {
    state.filmBubbleEnabled = e.target.checked;
    savePreferences();
    _bubbleFaceSince = 0;
    _bubbleMissingSince = 0;
    // Le nombre de visages est une option de création MediaPipe. Recréer le
    // modèle ici évite que l'activation après le chargement reste bloquée à 1.
    resetFaceTrackingModel();
    if (state.filmBubbleEnabled) {
      void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
    } else {
      hideFilmBubble();
      void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    }
    toast(state.filmBubbleEnabled ? "Bulle « Vous êtes filmé » activée" : "Bulle désactivée");
  });
  // Logo sur la photo : retiré — plus aucun logo n'est dessiné sur les photos.
  on("set-light-frame", "change", (e) => {
    state.lightFrameEnabled = e.target.checked;
    savePreferences();
    if (state.lightFrameEnabled || state.flashMode === "auto") {
      startLightMonitor();
      toast("Contour basse lumière activé");
    } else {
      stopLightMonitor();
      toast("Contour basse lumière désactivé");
    }
  });
  on("set-delete", "change", (e) => {
    state.deleteEnabled = e.target.checked;
    toast(state.deleteEnabled ? "Suppression des photos activée" : "Suppression désactivée");
  });
  on("btn-clear-backdrop", "click", () => {
    state.backdropGeneration += 1;
    if (state.backdrop?.type === "image" && state.backdrop.url) {
      try { URL.revokeObjectURL(state.backdrop.url); } catch {}
    }
    state._backdropImg = null;
    state.backdrop = null;
    void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
    document.body.classList.remove("has-backdrop");
    drawLiveOverlay();
    toast("Fond désactivé");
  });
  on("set-remote-camera", "change", (e) => {
    if (e.target.checked) startRemoteCamera(); else stopRemoteCamera();
  });
  on("btn-remote-connect", "click", () => connectRemoteCamera($("remote-connect-token")?.value || ""));
  on("btn-remote-disconnect", "click", disconnectRemoteCamera);
  on("btn-remote-qr", "click", () => {
    if (!state.remoteCamToken) return;
    $("remote-qr-img").src = `/api/qr?url=${encodeURIComponent($("remote-token-display")?.value || "")}`;
    $("remote-qr-row").style.display = "flex";
  });
}

/* =========================================================
   EVENTS
   ========================================================= */
on("btn-auto", "click", toggleAutoMode);
on("btn-flip", "click", flipCamera);
on("btn-retry-camera", "click", async () => {
  const errorEl = $("camera-error");
  const title = errorEl?.querySelector(".camera-error-title");
  const text = errorEl?.querySelector(".camera-error-text");
  if (title) title.textContent = "Caméra indisponible";
  if (text) text.textContent = "Autorisez l'accès à la caméra dans Safari : Réglages > Safari > Caméra, puis rechargez.";
  if (errorEl) errorEl.classList.add("hidden");
  // Relance propre : coupe l'ancien flux puis redémarre
  if (state.stream) { try { state.stream.getTracks().forEach((t) => t.stop()); } catch {} }
  state.stream = null;
  await startCamera();
});
on("btn-backdrop", "click", () => openSheet("sheet-backdrop"));
on("btn-fx-top", "click", () => {
  if (fxPanel.classList.contains("open")) closeFxPanel();
  else openFxPanel();
});
on("fx-close", "click", closeFxPanel);
/* Catégories : uniquement Accessoires visage / Animations.
   Les filtres photo sont volontairement absents de ce panneau. */
document.querySelectorAll("#fx-seg button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.fxCat = btn.dataset.cat;
    document.querySelectorAll("#fx-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    // Applique la première de la catégorie (ou garde l'actuelle si elle y est)
    const current = state.fxCat === "animation" ? state.animationId : state.accessoryId;
    const list = fxList();
    if (!list.length) return;
    if (!list.find((i) => i.id === current)) applyFx(list[0].id, { showName: true });
    buildFxPanel();
    sfxOpen();
  });
});
/* Scroll du carrousel → met à jour le nom affiché (débounce léger) */
let _fxScrollT = null;
$("fx-carousel")?.addEventListener("scroll", () => {
  clearTimeout(_fxScrollT);
  _fxScrollT = setTimeout(updateFxName, 90);
}, { passive: true });
on("btn-settings", "click", () => openSheet("sheet-settings"));
on("btn-gallery", "click", async () => {
  pauseLiveProcessing();
  screens.capture.classList.remove("active");
  screens.result.classList.remove("active");
  screens.gallery.classList.add("active");
  await renderGallery();
});
on("guest-share-close", "click", closeGuestSharePanel);
on("guest-create-link", "click", createGuestLink);
on("guest-copy-url", "click", copyGuestUrl);
on("guest-native-share", "click", shareGuestUrl);
on("guest-live-toggle", "change", (event) => {
  state.guestLiveEnabled = event.target.checked;
  if (state.guestLiveEnabled) startGuestLivePublisher();
  else {
    stopGuestLivePublisher();
    if (state.guestToken && state.guestHostKey) {
      fetch(`/api/guest/${encodeURIComponent(state.guestToken)}/live`, { method: "DELETE", headers: { "x-guest-host-key": state.guestHostKey } }).catch(() => {});
    }
  }
  guestShareStatus(state.guestLiveEnabled ? "Aperçu activé — le lien doit déjà être créé." : "Aperçu désactivé.");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopGuestLivePublisher();
  else if (state.guestLiveEnabled) startGuestLivePublisher();
});
window.addEventListener("pagehide", () => stopGuestLivePublisher(), { once: true });
let _galleryTitlePressTimer = null;
$("gallery-title")?.addEventListener("pointerdown", () => {
  clearTimeout(_galleryTitlePressTimer);
  _galleryTitlePressTimer = setTimeout(openGuestSharePanel, 900);
}, { passive: true });
["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => $("gallery-title")?.addEventListener(eventName, () => clearTimeout(_galleryTitlePressTimer), { passive: true }));
on("btn-back-capture", "click", showCapture);
on("btn-back-result", "click", showCapture);
on("btn-retake", "click", showCapture);
on("btn-save", "click", async () => {
  clearAutoReturn(); // l'utilisateur interagit → ne pas le ramener à la caméra
  if (!state.latestPhoto) return;
  if (state.resultPersistencePromise) await state.resultPersistencePromise.catch(() => {});
  else await uploadPhoto(state.latestPhoto);
  toast("Photo sauvegardée ✓");
  const box = $("share-box");
  if (box) box.style.display = "block";
});
// Bouton auto-retour : un tap force le retour immédiat (sinon il décrémente).
on("btn-auto-return", "click", () => { clearAutoReturn(); showCapture(); });
// Interaction avec commentaire / partage → annuler l'auto-retour.
["photo-comment", "share-box"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("focusin", clearAutoReturn, { capture: true });
  if (el) el.addEventListener("click", clearAutoReturn, { capture: true });
});
on("btn-export-zip", "click", exportZip);
on("btn-save-all", "click", saveAllToPhotos);
on("btn-guest-qr", "click", () => openGuestSharePanel(true));
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
  if (file) void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
  if (!file) return;
  // Ne jamais afficher l'ancien fond pendant le chargement du nouveau.
  if (state.backdrop?.type === "image" && state.backdrop.url) {
    try { URL.revokeObjectURL(state.backdrop.url); } catch {}
  }
  state._backdropImg = null;
  const backdropGeneration = ++state.backdropGeneration;
  const url = URL.createObjectURL(file);
  state.backdrop = { type: "image", url };
  document.body.classList.add("has-backdrop");
  // Charge aussi l'image pour le rendu LIVE (personne détourée sur le fond)
  const img = new Image();
  img.onload = () => {
    if (backdropGeneration !== state.backdropGeneration || state.backdrop?.url !== url) return;
    state._backdropImg = img;
    drawLiveOverlay();
  };
  img.onerror = () => {
    if (backdropGeneration === state.backdropGeneration) state._backdropImg = null;
  };
  img.src = url;
  toast("Fond image chargé 🖼️");
});
on("chroma-check", "change", (event) => {
  state.chromaEnabled = event.target.checked;
  toast(state.chromaEnabled ? "Chroma activé" : "Chroma désactivé");
});

function openSheet(id) {
  Object.entries(sheetMap).forEach(([key, el]) => el.classList.toggle("open", key === id));
}

/* Groupes de réglages repliables (pattern Réglages iOS) : les sections
   secondaires restent repliées par défaut pour ne pas noyer le petit écran. */
document.querySelectorAll(".settings-group-title").forEach((btn) => {
  btn.addEventListener("click", () => {
    const group = btn.closest(".settings-group");
    if (!group) return;
    const willCollapse = !group.classList.contains("collapsed");
    group.classList.toggle("collapsed", willCollapse);
    btn.setAttribute("aria-expanded", String(!willCollapse));
  });
});

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
    /* Anti-cache : si version mismatch, on log un warning mais on continue.
       Les reloads automatiques causaient des boucles infinies avec le SW. */
    if (htmlVersion && htmlVersion !== APP_VERSION && forced !== "1") {
      console.warn("[MomentoBooth] Version mismatch: HTML " + htmlVersion + " vs JS " + APP_VERSION + " — clearing SW cache");
      sessionStorage.setItem("mb-force-reload", "1");
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          Promise.all(regs.map(function(r) { return r.unregister(); }));
        });
      }
    }
    sessionStorage.removeItem("mb-force-reload");
  } catch { /* on continue normalement */ }
  // iOS envoie plusieurs resize de visualViewport quand ses barres
  // apparaissent/disparaissent. On accepte les changements réels, mais avec
  // une petite hystérésis pour éviter que la caméra ne saute sur un micro-resize.
  let _viewportSyncTimer = null;
  let _stableAppHeight = 0;
  let _stableAppWidth = 0;
  let _stableOrientation = "";
  let _viewportSyncing = false;
  function syncAppViewport(force = false) {
    // Garde anti-réentrance : iOS peut enchaîner resize → rAF → resize
    // (barres Safari, clavier). Une boucle de re-synchronisation saturerait
    // le thread principal et provoquerait des « problèmes récurrents ».
    if (_viewportSyncing) { scheduleAppViewportSync(force); return; }
    _viewportSyncing = true;
    try {
      syncAppViewportInner(force);
    } finally {
      _viewportSyncing = false;
    }
  }
  function syncAppViewportInner(force = false) {
    const viewport = window.visualViewport;
    const viewportWidth = Math.round(viewport?.width || 0);
    const viewportHeight = Math.round(viewport?.height || 0);
    const rawWidth = Math.round(window.innerWidth || viewportWidth || 1);
    // visualViewport est utile quand Safari agrandit réellement la zone visible.
    // On l'ignore pendant un zoom ou un décalage de viewport (clavier/zoom),
    // car ces valeurs peuvent dépasser la hauteur CSS exploitable par le body.
    const viewportUsable = viewport && (viewport.scale || 1) <= 1.01 && Math.abs(viewport.offsetTop || 0) < 2;
    const layoutHeight = Math.round(window.innerHeight || 1);
    const keyboardReduced = viewportUsable && viewportHeight > 0 && viewportHeight < layoutHeight - 120;
    // En cas de clavier ouvert, la hauteur réduite est volontaire : la barre
    // basse et les champs doivent rester dans la zone visible. Hors clavier,
    // on accepte une expansion du visualViewport pour récupérer le bas perdu.
    const rawHeight = Math.round(viewportUsable && (keyboardReduced && force)
      ? viewportHeight
      : viewportUsable
        ? Math.max(layoutHeight, viewportHeight)
        : layoutHeight);
    const orientation = rawWidth >= rawHeight ? "landscape" : "portrait";
    const orientationChanged = _stableOrientation && orientation !== _stableOrientation;
    const widthChanged = Math.abs(rawWidth - _stableAppWidth) > 80;
    const heightExpanded = rawHeight > _stableAppHeight + 8;
    const heightContracted = rawHeight < _stableAppHeight - 24;
    // Une expansion est appliquée immédiatement pour récupérer le bas perdu.
    // Une réduction significative est appliquée seulement après le debounce
    // existant, ou de force (rotation/clavier), jamais pour quelques pixels.
    if (!_stableAppHeight || orientationChanged || widthChanged || heightExpanded || (force && heightContracted) || (!force && heightContracted && viewportUsable)) {
      _stableAppWidth = rawWidth;
      _stableAppHeight = rawHeight;
      _stableOrientation = orientation;
    }
    document.documentElement.style.setProperty("--app-height", `${_stableAppHeight}px`);
    document.documentElement.style.setProperty("--camera-width", `${_stableAppWidth}px`);
    document.documentElement.style.setProperty("--camera-height", `${_stableAppHeight}px`);
    const rect = cameraZone.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || _stableAppWidth || rawWidth));
    const height = Math.max(1, Math.round(rect.height || _stableAppHeight || rawHeight));
    if (stickerCanvas.width === width && stickerCanvas.height === height) {
      state._forceOverlay = true;
      if (state.stream) requestAnimationFrame(() => drawLiveOverlay());
      return;
    }
    stickerCanvas.width = width;
    stickerCanvas.height = height;
    state._forceOverlay = true;
    if (state.stream) requestAnimationFrame(() => drawLiveOverlay());
  }
  function scheduleAppViewportSync(force = false) {
    clearTimeout(_viewportSyncTimer);
    _viewportSyncTimer = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => syncAppViewport(force)));
    }, force ? 140 : 90);
  }
  function sizeStickerCanvas() { scheduleAppViewportSync(false); }
  window.mbScheduleViewportSync = scheduleAppViewportSync;
  syncAppViewport(true);
  loadPreferences();
  syncPreferenceControls();
  /* Une URL invitée est une vue lecture seule : surtout aucune permission caméra. */
  if (await initGuestMode()) return;
  window.addEventListener("resize", sizeStickerCanvas, { passive: true });
  window.visualViewport?.addEventListener("resize", () => {
    const viewport = window.visualViewport;
    const keyboardLikely = viewport && viewport.height > 0 && viewport.height < (window.innerHeight || viewport.height) - 120;
    scheduleAppViewportSync(Boolean(keyboardLikely));
  }, { passive: true });
  window.addEventListener("orientationchange", () => scheduleAppViewportSync(true), { passive: true });
  // Le clavier iOS réduit le visualViewport : recalcul forcé à son ouverture
  // et à sa fermeture pour ne pas cacher un champ ni laisser un ancien vide.
  window.addEventListener("focusin", () => scheduleAppViewportSync(true), { passive: true });
  window.addEventListener("focusout", () => scheduleAppViewportSync(true), { passive: true });
  ["loadedmetadata", "canplay", "playing"].forEach((eventName) => {
    camera.addEventListener(eventName, () => scheduleAppViewportSync(true), { passive: true });
  });
  // L'écran peut s'éteindre pendant la capture → on relance le Wake Lock
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLightMonitor();
      resetFaceTrackingModel();
      releaseFxCards();
      hideFilmBubble();
      return;
    }
  if (state.counting || state.autoMode) requestWakeLock();
    if (state.stream && screens.capture.classList.contains("active") && (state.lightFrameEnabled || state.flashMode === "auto")) {
      startLightMonitor();
    }
    if (state.stream && screens.capture.classList.contains("active")) {
      void ensureFaceTracking().catch(() => {});
    }
  });
  let _cameraNeedsRestart = false;
  window.addEventListener("pageshow", () => {
    if (!_cameraNeedsRestart || document.hidden || !screens.capture.classList.contains("active")) return;
    _cameraNeedsRestart = false;
    void startCamera();
  });
  window.addEventListener("pagehide", () => {
    _cameraNeedsRestart = true;
    stopLightMonitor();
    stopPreroll();
    releaseFxCards();
    stopAnimation();
    gifStopPre(true);
    releaseWakeLock();
    if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
    if (state.landmarker?.close) { try { state.landmarker.close(); } catch {} }
    state.landmarker = null;
    // Quitter l'application/PWA doit rendre immédiatement la caméra et ses
    // buffers au système, sinon iOS peut conserver la session média en RAM.
    try { state.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    state.stream = null;
    camera.srcObject = null;      });

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
  try { buildFxPanel(); } catch {}
  try { buildPhotoFilterRail(); } catch {}
  try { bindSettings(); } catch {}
  // Logo MomentoBooth : retiré des photos — plus aucun préchargement d'asset inutile.

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

  /* 5) Détection visage : chargée uniquement si une fonction opt-in le demande. */
  // Un accessoire visage (moustache, oreilles…) impose MediaPipe, même sans
  // le cadre de suivi : sans cette condition, aucun masque ne se dessinait.
  const needsFaceTracking = () => state.trackEnabled || state.autoMode || state.portraitMode || (state.idleEnabled && state.idleFaceWake) || state.filmBubbleEnabled || state.prerollEnabled || Boolean(state.accessoryId) || Boolean(state.backdrop);
  const ensureFaceTracking = async () => {
    if (!needsFaceTracking() || !screens.capture.classList.contains("active") || document.hidden) return;
    const generation = _faceTrackingGeneration;
    if (!state.landmarker) await initFaceLandmarker();
    // Le modèle ou l'écran peut avoir été invalidé pendant l'import async.
    // Ne crée jamais un timer orphelin dans ce cas.
    if (generation !== _faceTrackingGeneration || !state.landmarker || document.hidden || !screens.capture.classList.contains("active")) return;
    if (!_detectFaceTimer) _detectFaceTimer = setInterval(detectFace, perfConfig().detectMs);
  };
  const updateFaceTracking = async () => {
    if (needsFaceTracking()) return ensureFaceTracking();
    if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
    if (state.landmarker?.close) { try { state.landmarker.close(); } catch {} }
    resetFaceTrackingModel();
    drawLiveOverlay();
  };
  window.mbEnsureFaceTracking = ensureFaceTracking;
  window.mbUpdateFaceTracking = updateFaceTracking;
  // Les réglages appellent le modèle à la demande; au démarrage éco, rien ne charge.
  if (needsFaceTracking()) ensureFaceTracking().catch(() => {});

  /* 6) Veille + tutoriel (attract mode léger)
     Le tutoriel swipe est déclenché uniquement après le clic de veille,
     jamais automatiquement au démarrage. */
  initIdleMode();

  /* 7) Focus manuel (appui long sur l'écran) */
  initManualFocus();

  /* 8) Sécurité : le splash ne doit jamais devenir un écran blanc bloqué.
     On laisse d'abord la permission iOS se présenter, puis on révèle l'état
     caméra (ou le bouton Réessayer) si le navigateur reste muet. */
  startCamera._waitingTimer = setTimeout(() => {
    if (!state.stream) showCameraWaiting();
  }, 6000);

  /* 9) Reprise silencieuse de la session hôte pour le partage caméra optionnel. */
  try {
    const savedGuest = JSON.parse(localStorage.getItem("momentobooth-guest-session") || "null");
    if (savedGuest?.token && savedGuest?.hostKey && savedGuest.expiresAt > Date.now()) {
      state.guestToken = savedGuest.token;
      state.guestHostKey = savedGuest.hostKey;
    }
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   VEILLE (attract mode) : quand personne pendant 30 s,
   l'écran + la caméra se floutent progressivement, puis une
   carte « Cliquez pour vous prendre en photo » 📷 apparaît,
   avec l'HEURE en grand (mise à jour chaque minute).
   Au clic : petite animation → le tutoriel swipe revient →
   compte à rebours → capture.
   ════════════════════════════════════════════════════════════ */
function updateIdleClock() {
  const el = $("idle-clock");
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.textContent = `${hh}:${mm}`;
}
let _idleClockTimer = null;
let _idleTimer = null;
let _idleTriggeredAt = 0;
let _idlePoke = null;
let _idleOverlayHandler = null;
let _idleTransitionTimer = null;
let _idleSceneTimer = null;
let _idleSceneIndex = 0;
const IDLE_DELAY = 30000; // 30 s sans visage ni interaction (réglable)
const IDLE_SCENE_DELAY = 6500; // chaque écran reste lisible avant le suivant

function stopIdleScenes() {
  if (_idleSceneTimer) { clearInterval(_idleSceneTimer); _idleSceneTimer = null; }
}

function setIdleScene(index) {
  const scenes = document.querySelectorAll("#idle-overlay .idle-scene");
  const dots = document.querySelectorAll("#idle-overlay .idle-scene-dots i");
  if (!scenes.length) return;
  _idleSceneIndex = ((index % scenes.length) + scenes.length) % scenes.length;
  scenes.forEach((scene, i) => {
    const active = i === _idleSceneIndex;
    scene.classList.toggle("active", active);
    scene.setAttribute("aria-hidden", active ? "false" : "true");
  });
  dots.forEach((dot, i) => dot.classList.toggle("active", i === _idleSceneIndex));
}

function startIdleScenes() {
  stopIdleScenes();
  setIdleScene(0);
  _idleSceneTimer = setInterval(() => {
    if (!document.body.classList.contains("idle")) return;
    setIdleScene(_idleSceneIndex + 1);
  }, IDLE_SCENE_DELAY);
}

function stopIdleMode() {
  stopIdleScenes();
  if (_idleTimer) { clearInterval(_idleTimer); _idleTimer = null; }
  if (_idlePoke) {
    ["pointerdown", "pointermove", "touchstart", "keydown"].forEach((ev) => document.removeEventListener(ev, _idlePoke));
    _idlePoke = null;
  }
  const overlay = $("idle-overlay");
  if (overlay && _idleOverlayHandler) overlay.removeEventListener("pointerdown", _idleOverlayHandler);
  _idleOverlayHandler = null;
  clearTimeout(_idleTransitionTimer);
}

function initIdleMode() {
  if (_idleTimer || !state.idleEnabled) return;
  const overlay = $("idle-overlay");
  // Important : le compteur démarre maintenant, jamais à zéro au chargement.
  _idleTriggeredAt = performance.now();
  _idlePoke = () => {
    if (!document.body.classList.contains("idle")) _idleTriggeredAt = performance.now();
  };
  ["pointerdown", "pointermove", "touchstart", "keydown"].forEach((ev) =>
    document.addEventListener(ev, _idlePoke, { passive: true }),
  );
  _idleTimer = setInterval(() => {
    if (!state.idleEnabled || document.body.classList.contains("idle")) return;
    if (state.counting || state.autoMode || document.hidden) return;
    if (screens.capture.classList.contains("active") && performance.now() - _idleTriggeredAt >= IDLE_DELAY) enterIdle();
  }, 2000);
  _idleOverlayHandler = (e) => {
    e.stopPropagation();
    if (!document.body.classList.contains("idle") || _idleTransitionTimer) return;
    const card = overlay?.querySelector(".idle-card");
    if (!card) return;
    const clickFx = overlay.querySelector(".idle-click-animation");
    clickFx?.classList.remove("play");
    void clickFx?.offsetWidth;
    clickFx?.classList.add("play");
    card.style.transition = "transform .18s ease, opacity .18s ease";
    card.style.transform = "scale(.92)";
    sfxOpen();
    // Le clic fourni doit avoir sa phase dédiée avant le swipe.
    _idleTransitionTimer = setTimeout(() => {
      card.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1), opacity .45s ease";
      card.style.transform = "scale(1.06)";
      card.style.opacity = "0";
      exitIdle();
      showSwipeTuto();
      // Le tutoriel dure 3,4 s : aucune capture ne doit le recouvrir.
      _idleTransitionTimer = setTimeout(() => startCountdown(), 3600);
    }, 720);
  };
  overlay?.addEventListener("pointerdown", _idleOverlayHandler);
}


function enterIdle() {
  if (!state.idleEnabled || state.counting || state.autoMode || !screens.capture.classList.contains("active")) return;
  document.body.classList.add("idle");
  const overlay = $("idle-overlay");
  const card = overlay?.querySelector(".idle-card");
  if (card) {
    card.style.transition = "";
    card.style.transform = "";
    card.style.opacity = "";
  }
  if (overlay) {
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }
  state.idleWakeHits = 0;
  startIdleScenes();
  updateIdleClock();
  clearInterval(_idleClockTimer);
  _idleClockTimer = setInterval(updateIdleClock, 60000);
  console.log("[MomentoBooth] veille activée (30 s inactif)");
}

function exitIdle() {
  clearTimeout(_idleTransitionTimer);
  _idleTransitionTimer = null;
  stopIdleScenes();
  document.body.classList.remove("idle");
  const overlay = $("idle-overlay");
  if (overlay) {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }
  clearInterval(_idleClockTimer);
  _idleClockTimer = null;
  _idleTriggeredAt = performance.now();
}

/* ════════════════════════════════════════════════════════════
   TUTORIEL SWIPE : fenêtres multitâche qui reviennent + doigt
   qui glisse de droite à gauche (montre le geste).
   ════════════════════════════════════════════════════════════ */
function showSwipeTuto() {
  const tuto = $("swipe-tuto");
  if (!tuto) return;
  tuto.classList.remove("show");
  void tuto.offsetWidth;
  tuto.classList.add("show");
  tuto.setAttribute("aria-hidden", "false");
  document.body.classList.add("tuto");
  clearTimeout(tuto._t);
  tuto._t = setTimeout(() => {
    tuto.classList.remove("show");
    tuto.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tuto");
  }, 3400);
}

function maybeShowSwipeTuto() {
  // L'animation d'accueil reste opt-in avec la veille pour éviter toute
  // animation et tout travail visuel au démarrage économe.
  if (!state.idleEnabled) return;
  // Une seule fois par session
  if (sessionStorage.getItem("mb-swipe-tuto")) return;
  sessionStorage.setItem("mb-swipe-tuto", "1");
  setTimeout(showSwipeTuto, 2600);
}

/* ════════════════════════════════════════════════════════════
   SPLASH : logo sur fond assorti au logo (bleu dégradé).
   Disparaît en fondu une fois l'interface prête (caméra OK).
   ════════════════════════════════════════════════════════════ */
let _splashDone = false;
function hideSplash() {
  if (_splashDone) return;
  _splashDone = true;
  const splash = $("app-splash");
  if (!splash) return;
  splash.classList.add("done");
  // Securite absolue : force la disparition du splash apres 15s max
  setTimeout(() => { _splashDone = false; hideSplash(); }, 15000);
  splash.setAttribute("aria-hidden", "true");
  // Retire du DOM après le fondu (léger)
  setTimeout(() => splash.remove(), 1100);
}

/* ════════════════════════════════════════════════════════════
   FOCUS MANUEL : appui long sur l'écran → défloutage + curseur
   de mise au point à la position choisie (façon iPhone).
   ════════════════════════════════════════════════════════════ */
let _focusTimer = null;
let _focusJustUsed = false; // appui long → focus manuel (bloque le sheet minuteur)
async function requestCameraFocus() {
  const track = state.stream?.getVideoTracks?.()[0];
  if (!track?.applyConstraints) return false;
  try {
    const capabilities = track.getCapabilities?.() || {};
    const modes = capabilities.focusMode;
    if (!Array.isArray(modes) || !modes.length) {
      state.focusSupported = false;
      return false;
    }
    const preferred = modes.includes("single-shot") ? "single-shot" : modes.includes("continuous") ? "continuous" : modes[0];
    await track.applyConstraints({ advanced: [{ focusMode: preferred }] });
    state.focusSupported = true;
    return true;
  } catch { return false; }
}

function initManualFocus() {
  const zone = $("screen-capture");
  if (!zone) return;
  const cursor = $("focus-cursor");
  const start = (e) => {
    if (state.counting || state.autoMode) return;
    if (gestureTarget(e) !== "cam") return;
    const x = e.clientX, y = e.clientY;
    clearTimeout(_focusTimer);
    _focusTimer = setTimeout(() => {
      _focusJustUsed = true; // le relâchement n'ouvrira pas le minuteur
      state.focusing = true;
      state.focusX = x; state.focusY = y;
      if (cursor) {
        cursor.style.left = x + "px";
        cursor.style.top = y + "px";
        cursor.classList.add("show");
      }
      // Demande la mise au point native quand le navigateur l'expose,
      // avec un micro-feedback visuel bref (jamais un faux focus permanent).
      void requestCameraFocus();
      document.body.classList.add("focusing");
      sfxOpen();
      setTimeout(() => {
        document.body.classList.remove("focusing");
        setTimeout(() => {
          state.focusing = false;
          if (cursor) setTimeout(() => cursor.classList.remove("show"), 1400);
        }, 320);
      }, 520);
    }, 360); // appui long proche du geste iPhone
  };
  const cancel = () => { clearTimeout(_focusTimer); };
  zone.addEventListener("pointerdown", start, { passive: true });
  zone.addEventListener("pointermove", (e) => {
    // Pendant la recherche : le curseur suit si on bouge peu
    if (!state.focusing) return;
    if (cursor && Math.abs(e.clientX - state.focusX) < 160 && Math.abs(e.clientY - state.focusY) < 160) {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    }
  }, { passive: true });
  window.addEventListener("pointerup", cancel, { passive: true });
  window.addEventListener("pointercancel", cancel, { passive: true });
}

/* ════════════════════════════════════════════════════════════
   BULLE « VOUS ÊTES FILMÉ » : quand quelqu'un passe devant
   (visage détecté), une bulle en haut avec mini-visages 😁.
   ════════════════════════════════════════════════════════════ */
let _bubbleHideTimer = null;
let _bubbleFaceSince = 0;
let _bubbleMissingSince = 0;
function hideFilmBubble() {
  const bubble = $("film-bubble");
  if (!bubble) return;
  clearTimeout(_bubbleHideTimer);
  bubble.classList.add("hidden");
  bubble.setAttribute("aria-hidden", "true");
}
function updateFilmBubble() {
  const bubble = $("film-bubble");
  if (!bubble) return;
  if (!state.filmBubbleEnabled || document.hidden || !screens.capture.classList.contains("active")) {
    hideFilmBubble();
    return;
  }
  const n = Array.isArray(state.faces) ? state.faces.length : 0;
  const now = performance.now();
  if (!n) {
    _bubbleFaceSince = 0;
    if (!_bubbleMissingSince) _bubbleMissingSince = now;
    // Une détection éco peut manquer une frame pendant un clignement ou un
    // mouvement. Tolérer cette absence avant de retirer la bulle.
    if (now - _bubbleMissingSince < 1200) return;
    hideFilmBubble();
    return;
  }
  _bubbleMissingSince = 0;
  // Le visage doit rester présent un court instant : cela évite les faux
  // positifs d'une frame et rend la bulle fiable dès qu'une personne arrive.
  if (!_bubbleFaceSince) _bubbleFaceSince = now;
  if (now - _bubbleFaceSince < 900) return;
  const facesBox = bubble.querySelector(".film-bubble-faces");
  if (facesBox && facesBox.childElementCount !== Math.min(3, n)) {
    facesBox.replaceChildren(...Array.from({ length: Math.min(3, n) }, () => {
      const face = document.createElement("div");
      face.className = "film-bubble-face";
      face.textContent = "😄";
      return face;
    }));
  }
  bubble.classList.remove("hidden");
  bubble.setAttribute("aria-hidden", "false");
  clearTimeout(_bubbleHideTimer);
  _bubbleHideTimer = setTimeout(() => hideFilmBubble(), 2200);
}

/* ════════════════════════════════════════════════════════════
   PRÉFILMAGE : ring buffer basse résolution en arrière-plan.
   Quand quelqu'un approche (visage) ou une voix est très proche,
   la séquence préfilmée est stockée À PART (store « moments »).
   Désactivable. Léger : 6 s × ~8 fps en 240 px.
   ════════════════════════════════════════════════════════════ */
const PREROLL_SECONDS = 6;
const PREROLL_FPS = 8;
const PREROLL_SIZE = 240;
let _prerollFrames = [];   // ring buffer [{t, canvas}]
let _prerollTimer = null;
let _prerollRecording = false;
let _prerollTriggeredAt = 0;
let _prerollOverlayCount = 0; // frames accumulées après déclenchement
let _prerollAudioCtx = null;
let _prerollAudioStream = null;
let _prerollAnalyser = null;
let _prerollLastVoice = 0;

/* Boucle d'échantillonnage : capture une petite frame toutes les ~125 ms */
function startPreroll() {
  if (!state.prerollEnabled || _prerollTimer || !state.stream) return;
  const tick = () => {
    if (!state.stream || !camera.videoWidth) return;
    // Léger : pas de capture sur l'écran résultat/galerie (le ring buffer
    // continue seulement quand la caméra live est visible)
    if (!screens.capture.classList.contains("active")) return;
    const canvas = document.createElement("canvas");    const profile = perfConfig();
      canvas.width = profile.prerollSize;
      canvas.height = Math.round(profile.prerollSize / ratioOf(camera));
    const ctx = canvas.getContext("2d");
    // Miroir si caméra frontale (cohérent avec l'aperçu)
    if (state.facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
    _prerollFrames.push({ t: performance.now(), canvas });
    const maxFrames = PREROLL_SECONDS * perfConfig().prerollFps;
    while (_prerollFrames.length > maxFrames) releasePrerollFrames([_prerollFrames.shift()]);

    // Déclencheur 1 : voix très proche (niveau audio élevé)
    if (_prerollAnalyser && performance.now() - _prerollLastVoice > 3500) {
      const buf = new Uint8Array(_prerollAnalyser.fftSize);
      _prerollAnalyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const level = sum / buf.length;
      if (level > 42) { _prerollLastVoice = performance.now(); triggerPreroll("voix proche"); }
    }

    // Déclencheur 2 : quelqu'un approche (visage détecté)
    if (state.faces.length > 0 && !_prerollRecording && performance.now() - _prerollTriggeredAt > 20000) {
      triggerPreroll("quelqu'un approche");
    }

    // Enregistrement en cours : après le déclencheur, on capture 1,5 s de plus
    if (_prerollRecording) {
      _prerollOverlayCount++;
      if (_prerollOverlayCount >= perfConfig().prerollFps * 1.5) {
        _prerollRecording = false;
        savePrerollClip();
      }
    }
  };
  _prerollTimer = setInterval(tick, 1000 / perfConfig().prerollFps);
}
function releasePrerollFrames(frames = _prerollFrames) {
  frames.forEach((frame) => releaseCanvas(frame?.canvas));
  if (frames === _prerollFrames) _prerollFrames = [];
}

function stopPreroll() {
  if (_prerollTimer) { clearInterval(_prerollTimer); _prerollTimer = null; }
  if (_prerollAudioCtx) { try { _prerollAudioCtx.close(); } catch {} _prerollAudioCtx = null; }
  if (_prerollAudioStream) { try { _prerollAudioStream.getTracks().forEach((track) => track.stop()); } catch {} _prerollAudioStream = null; }
  _prerollAnalyser = null;
  releasePrerollFrames();
}

/* Active l'écoute audio (niveau voix). Le stream vidéo est demandé SANS audio
   (pour ne jamais faire échouer la caméra sur iOS) : on tente ici un micro
   SÉPARÉ en arrière-plan. Si refusé/indisponible → déclencheur visage seul. */
async function initPrerollAudio() {
  if (!state.prerollEnabled || _prerollAudioCtx) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) return; // micro refusé → pas de déclencheur voix (silencieux)
    _prerollAudioStream = stream;
    _prerollAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = _prerollAudioCtx.createMediaStreamSource(stream);
    _prerollAnalyser = _prerollAudioCtx.createAnalyser();
    _prerollAnalyser.fftSize = 256;
    src.connect(_prerollAnalyser);
    // ⚠️ iOS : un AudioContext créé hors geste utilisateur reste SUSPENDED
    // (l'analyser renvoie des zéros → déclencheur voix jamais actif).
    // On le réveille au premier toucher.
    const wake = () => {
      if (_prerollAudioCtx && _prerollAudioCtx.state === "suspended") {
        _prerollAudioCtx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", wake);
    };
    window.addEventListener("pointerdown", wake, { once: true, passive: true });
  } catch { _prerollAudioCtx = null; _prerollAnalyser = null; }
}

/* Déclenche le préfilmage : marque l'état + stocke le clip */
function triggerPreroll(reason) {
  if (!state.prerollEnabled || _prerollFrames.length < perfConfig().prerollFps * 2) return;
  _prerollRecording = true;
  _prerollOverlayCount = 0;
  _prerollTriggeredAt = performance.now();
  console.log("[MomentoBooth] préfilmage déclenché :", reason);
  toast(`🎬 Séquence préfilmée (${reason})`);
}

/* Encode le clip (frames → GIF) via le serveur Modal et le stocke à part
   (store « moments »). Plus de gif.js local — trop lourd pour l'iPhone. */
async function savePrerollClip() {
  const frames = _prerollFrames.slice();
  _prerollFrames = [];
  if (frames.length < perfConfig().prerollFps * 2) { releasePrerollFrames(frames); return; }
  try {
    if (!(await serverProcessUp())) { releasePrerollFrames(frames); return; }
    const W = frames[0].canvas.width;
    const H = frames[0].canvas.height;
    const blob = await serverEncodeGif(frames.map((f) => f.canvas), W, H, Math.round(1000 / perfConfig().prerollFps));
    releasePrerollFrames(frames);
    if (!blob) return;
    const id = `moment-${Date.now()}`;
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("moments", "readwrite");
      tx.objectStore("moments").put({ id, blob, date: Date.now(), reason: "approche" });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { releasePrerollFrames(frames); /* silencieux : opt-in */ }
}

/* ════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════ */
init();

// Préchauffe le ping serveur dès l'ouverture (en arrière-plan, non bloquant) :
// au moment de la première capture, on sait déjà si le serveur (local ou Modal)
// est joignable — plus aucune attente de 5 s pendant la photo.
setTimeout(() => { void serverProcessUp().catch(() => {}); }, 1500);
