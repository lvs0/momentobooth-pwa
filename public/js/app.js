/* =========================================================
   MomentoBooth PWA — Application principale (v4)
   Tap = minuteur · swipe = filtre en direct · masques visage
   · mode AUTO · portrait (flou) · GIF animé · flash · paramètres
   ========================================================= */
import { FILTERS, filterById, applyPixelFilter, MASK_ICONS } from "./filters.js?v=126";
import { drawMask } from "./masks.js?v=126";
import { FRAMES, drawFrame, framePreview, FRAME_TEXTS } from "./frames.js?v=126";
import { ANIMATIONS, animationById, startAnimation, stopAnimation } from "./animations.js?v=126";
import { telemetry } from "./telemetry.js?v=126";

/* ---------- Sélection multiple de la galerie (organisateur, code vérifié côté serveur) ---------- */
let _gallerySelecting = false;
const _gallerySelection = new Set();

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
  logoEnabled: false,     // désactivé par défaut ; activable dans Paramètres → Photo
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
  cameraFraming: false, // P1.2 — centrer la caméra entre les boutons du bas
  trackEnabled: false,  // MediaPipe et cadres visage désactivés par défaut
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
  faces: [],                // tous les visages détectés (multi-face)
  prerollEnabled: false,    // opt-in : séquence caméra + micro en arrière-plan
  filmBubbleEnabled: false, // opt-in : bulle « Vous êtes filmé »
  emojiFacesEnabled: false, // opt-in : emojis hilarants par visage (serveur, heuristique gratuite)
  idlePhotos: [],              // photos de veille personnalisées (organisateur)
  idlePhotosEnabled: false,    // opt-in : la veille affiche les photos organisateur
  idleEnabled: false,     // opt-in : veille et animation d'accueil (désactivé par défaut — nécessite MediaPipe)
  idleFaceWake: false,    // opt-in : réveil automatique par visage (désactivé par défaut)
  idleWakeHits: 0,         // détections consécutives nécessaires avant réveil (anti-passage furtif)
  idlePromptShown: false,  // idle-click.gif déjà montré pour l'arrivée actuelle
  idleFaceAbsentSince: 0,  // réarme le GIF seulement après une vraie absence
  idlePromptAt: 0,         // garantit que le GIF reste visible avant le réveil
  lightFrameEnabled: false,// opt-in : analyse basse lumière
  glassEnabled: false,     // glassmorphism panels
  countdownFixed: false,   // fixed big countdown
  captureDisabled: false,  // disable shutter
  focusing: false,         // focus manuel actif (appui long)
  focusX: 0, focusY: 0,
  focusSupported: false,
  guestToken: "",
  guestHostKey: "",
  guestLiveEnabled: false,
  remoteCamMode: "off",  remoteCamToken: "",  remoteCamHostKey: "",  remotePairCode: "",  remotePairUrl: "",  remotePairExpiresAt: 0,  remoteCamW: 640,  remoteCamH: 480,
  remoteCommandCursor: 0,
  remoteCommandTimer: null,
  // L'existence d'une session et la santé de la connexion sont volontairement
  // séparées. `connected` n'est autorisé qu'après preuve de vie réelle.
  remoteConnectionState: "disconnected", // disconnected | connecting | connected | degraded | reconnecting | failed
  remoteSessionState: "none", // none | created | paired | expired
  remoteLastFramePublishedAt: 0,
  remoteLastFrameReceivedAt: 0,
  remoteLastControllerSeenAt: 0,
  remoteLastCommandSentAt: 0,
  remoteLastCommandAckAt: 0,
  remotePendingCommands: [],
  remoteFrameAgeMs: null,
  remoteLastFrameId: "",
  remoteApplying: false,
  webrtcActive: false,        // true quand le flux P2P remplace le polling JPEG
  webrtcSocket: null,         // Socket.IO connecté (caméra ou interface)
  webrtcPC: null,             // RTCPeerConnection active
  webrtcPeerLeft: false,      // l'autre pair a quitté → force le fallback polling
  webrtcSignalingFailed: false, // signaling/peer négocié KO → fallback polling
  webrtcRemoteStream: null,  // MediaStream reçu côté interface (pour nettoyage)
  // v124.0.5 — 3D Lens : matrice de transformation faciale MediaPipe (4×4
  // colonne-major) extraite de detectForVideo, lissée par EMA 0.35.
  // Permet aux accessoires 3D (lunettes, casquette) de suivre les rotations
  // de tête (yaw/pitch/roll) au lieu d'être posés sur des ancres 2D fixes.
  faceMatrix: null,          // Float32Array-like[16], lissé
  blendshapes: null,         // Array<{categoryName, score}> x52, non lissé
  _smoothFaceMatrix: null,   // buffer interne pour EMA
  // WebRTC est désactivé par défaut sur Safari iOS : les crashes en boucle
  // (RTCPeerConnection + H264 + simulcast) déclenchent l'écran "Un problème
  // récurrent est survenu" de Safari. Sur Safari, on reste en polling JPEG
  // (toujours fonctionnel). L'utilisateur peut le réactiver via
  // `?force-webrtc=1` dans l'URL après diagnostic. Voir RECETTE-PHYSIQUE.md.
  webrtcDisabled: (function () {
    try {
      const ua = navigator.userAgent || "";
      const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
      // v124 : on élargit à tout Safari (iOS + macOS) — les crashes en boucle
      // touchent aussi Safari desktop, pas seulement iOS. Chrome/Firefox OK.
      const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
      const force = new URLSearchParams(location.search).get("force-webrtc") === "1";
      return isSafari && !force;
    } catch { return false; }
  })(),
  // v124.0.3 — mode "lite" pour Safari iOS : on désactive tout ce qui peut
  // crasher Safari (MediaPipe WASM, three.js, Service Worker) et on garde le
  // strict minimum (caméra + capture + partage + filtres CSS 2D). Le user
  // peut forcer le mode complet avec `?force-full=1` dans l'URL après diag.
  // Sur iPhone la cible finale est Chrome iOS, mais Safari reste un mode de
  // repli. La cible principale = Chrome sur Huawei Tab.
  liteMode: (function () {
    try {
      const ua = navigator.userAgent || "";
      const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
      const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
      const force = new URLSearchParams(location.search).get("force-full") === "1";
      return isIOS && isSafari && !force;
    } catch { return false; }
  })(),
  deviceRole: "mixed",      // camera | interface | mixed — choisi au démarrage
  cameraStopRequested: false,
  roleRemember: true,
  guestLiveTimer: null,
  guestLiveBusy: false,
  performanceMode: "eco",  // eco | balanced | max
  resultItems: [],          // éléments actuellement affichés dans l'aperçu
  resultObjectUrls: [],     // URL blob à révoquer quand on quitte l'aperçu
  resultTimers: [],         // timers du démarrage différé des GIF
  lastGifLocalId: null,
  latestRaw: null,
  resultPersistencePromise: null,
  resultGeneration: 0,
  selectedResultKind: null,   // null = proposer photo + GIF au premier partage
  backdropGeneration: 0,
  uiTheme: "midnight",
  uiTextScale: 100,
  uiButtonScale: 100,
  customFrameSrc: "",
  customBorderSrc: "",
  customFrameImage: null,
  customBorderImage: null,
  uiComponents: {},
  uiAccent: "",       // couleur d'accent personnalisée ("" = thème natif)
  eventHost1: "",     // identité événement : prénom hôte 1 ("" = défaut "Kenza")
  eventHost2: "",     // identité événement : prénom hôte 2 ("" = défaut "Lilou")
  eventWelcome: "",   // identité événement : message d'accueil veille personnalisé

  // v125.0.0 — Galerie grille 4 colonnes par défaut
  galleryMode: "grid", // "carousel" | "grid"
  galleryPage: 0,
  galleryPhotos: [],
  gallerySwipeStartX: 0,
  gallerySwipeStartY: 0,
  galleryLongPressTimer: null,
};

/* ---------- Version (anti-cache) ---------- */
const APP_VERSION = "126"; // Lévy 2026-08-22 — aligné avec core.js pour éviter mb-recover=124 en boucle (app v125 + features TikTok)
telemetry.startupMark("jsReady");
if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => telemetry.startupMark("firstPaint"));
const LOGO_PREF_VERSION = "photo-logo-opt-in-v1"; // le logo reste désactivé tant que l'organisateur ne l'active pas.

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = { capture: $("screen-capture"), result: $("screen-result"), gallery: $("screen-gallery"), guest: $("screen-guest"), discover: $("screen-discover") };
const camera = $("camera");
const cameraZone = $("camera-zone");
/* Le secours inline peut obtenir un flux pendant une ancienne session PWA.
   On le garde en attente jusqu'au choix de rôle : le mode Interface ne doit
   jamais demander ni rattacher une caméra locale. */
const pendingFallbackStream = window.__mbFallbackStream || null;
delete window.__mbFallbackStream;
window.mbDeviceRole = "pending";
function syncCameraPresentation(stream = state.stream) {
  if (!camera) return;
  camera.dataset.facing = state.facing === "user" ? "user" : "environment";
  if (stream && camera.srcObject !== stream) camera.srcObject = stream;
  // P1.1 — object-fit:cover strict, pas d'aspect-ratio forcé sur le parent.
  // Le cover CSS gère le cadrage sans stretching, même sur écrans larges.
  // On laisse le CSS gérer le positionnement : le container fait 100%×100%,
  // la vidéo en cover remplit sans déformation.
  if (camera.parentElement) {
    camera.parentElement.style.aspectRatio = "";
  }
}
window.addEventListener("mb-camera-ready", () => {
  if (!state.stream && camera?.srcObject) state.stream = camera.srcObject;
  syncCameraPresentation(state.stream || camera?.srcObject || null);
  if (state.stream) {
    if (camera.videoWidth > 0) telemetry.startupMark("cameraReady", { width: camera.videoWidth, height: camera.videoHeight, source: "fallback-event" });
    hideSplash();
  }
});
let _detectFaceTimer = null;
let _faceTrackingPromise = null;
let _faceTrackingGeneration = 0;
let _faceTrackingUnavailableUntil = 0;
let _faceTrackingFailureCount = 0;
function pauseLiveProcessing() {
  if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
  if (_railThumbTimer) { clearInterval(_railThumbTimer); _railThumbTimer = null; }
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
  if (!_railThumbTimer) { _railThumbTimer = setInterval(refreshFilterRailThumbnails, 700); refreshFilterRailThumbnails(); }
  void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
}
/* Suspend léger (app en arrière-plan) : coupe la détection visage, le monitor
   de lumière et le préfilmage SANS décharger le modèle MediaPipe → réveil
   instantané et surtout zéro CPU/RAM consommés quand l'écran est éteint. */
function suspendLiveWork() {
  if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
  if (state.remoteConnectionState === "connected") setRemoteConnectionStatus("reconnecting", "Application en pause — vérification au retour…");
  stopLightMonitor();
  stopPreroll();
  stopGuestLivePublisher();
  stopRemotePublishing();
  stopRemotePolling();
  stopRemoteCommandPolling();
  stopDeviceAnnounce();
  stopPairRequestPolling();
}
function resumeLiveWork() {
  if (document.hidden || !screens.capture.classList.contains("active")) return;
  if (state.remoteCamMode !== "off") setRemoteConnectionStatus("connecting", "Vérification de la connexion…");
  // Après bfcache/pagehide iOS, `state.stream` peut encore exister alors que
  // sa piste est ended. La preuve de vie est l'état réel de la piste, pas la
  // référence JavaScript conservée.
  const streamLive = state.stream?.getVideoTracks?.().some((track) => track.readyState === "live");
  if (state.deviceRole !== "interface" && !streamLive) void startCamera();
  if (state.prerollEnabled && state.stream) startPreroll();
  void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
  startLightMonitor();
  // Le réseau distant ne redémarre que pour un rôle compatible et une
  // session explicitement active (les anciennes sessions Mixte sont purgées
  // par setDeviceRole avant d'arriver ici).
  if ((state.deviceRole === "camera" || state.deviceRole === "mixed") && state.remoteCamMode === "camera") {
    startRemotePublishing();
    startRemoteCommandPolling();
    if (state.remoteCamToken && state.remoteCamHostKey) {
      // Ne relance l'annonce que si la session n'est pas déjà jumelée (le
      // serveur signale paired sur le prochain poll de commandes).
      startDeviceAnnounce();
      startPairRequestPolling();
    }
  }
  if ((state.deviceRole === "interface" || state.deviceRole === "mixed") && state.remoteCamMode === "controller") startRemotePolling();
}
const PREF_KEY = "momentobooth-preferences-v1";
const UI_CUSTOM_KEY = "momentobooth-ui-custom-v1";
const PERF = {
  // Profils live : résolution volontairement stable pour éviter que Safari
  // choisisse un flux 4K/60 i/s qui saccade dès qu'un effet est actif.
  eco: { cameraWidth: 960, cameraHeight: 540, detectMs: 620, overlayMs: 140, gifFps: 5, gifFrames: 10, gifSize: 360, prerollFps: 4, prerollSize: 180 },
  balanced: { cameraWidth: 1280, cameraHeight: 720, detectMs: 430, overlayMs: 95, gifFps: 6, gifFrames: 12, gifSize: 420, prerollFps: 6, prerollSize: 220 },
  max: { cameraWidth: 1920, cameraHeight: 1080, detectMs: 320, overlayMs: 70, gifFps: 7, gifFrames: 14, gifSize: 480, prerollFps: 8, prerollSize: 240 },
};
function perfConfig() { return PERF[state.performanceMode] || PERF.eco; }    const PREFERENCE_FIELDS = [
      "qualityMax", "trackEnabled", "idleEnabled", "idleFaceWake", "prerollEnabled",
      "filmBubbleEnabled", "emojiFacesEnabled", "lightFrameEnabled", "portraitMode", "burstMode", "timerSeconds", "captureCount", "logoEnabled", "flashMode", "performanceMode", "autoDelay", "deviceRole", "roleRemember", "deleteEnabled", "cameraFraming",
    ];
function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    for (const field of PREFERENCE_FIELDS) {
      if (field === "logoEnabled") continue;
      if (Object.prototype.hasOwnProperty.call(saved, field)) state[field] = saved[field];
    }
    // Conserve une éventuelle activation explicite d'une ancienne version,
    // mais n'active jamais le logo pour une préférence absente.
    const previousLogoPreference = saved.logoPreferenceVersion === "splash-only-v1";
    state.logoEnabled = (saved.logoPreferenceVersion === LOGO_PREF_VERSION || previousLogoPreference) && saved.logoEnabled === true;
    // Les préférences venant de localStorage restent bornées aux choix UI.
    state.timerSeconds = [5, 10, 15, 20].includes(Number(state.timerSeconds)) ? Number(state.timerSeconds) : 5;
    state.captureCount = Math.max(1, Math.min(6, Number(state.captureCount) || 1));
    state.autoDelay = [0.5, 1.5, 3].includes(Number(state.autoDelay)) ? Number(state.autoDelay) : 1.5;
    state.deviceRole = ["camera", "interface", "mixed"].includes(state.deviceRole) ? state.deviceRole : "mixed";
    state.roleRemember = state.roleRemember !== false;
    // Les secrets de session ne survivent jamais à un rechargement : une
    // session distante expirée ne doit pas bloquer la reconnexion. Le rôle
    // Caméra recréera un pairing propre après l'ouverture du flux.
    state.remoteCamMode = "off";
    state.remoteCamToken = "";
    state.remoteCamHostKey = "";
    state.remotePairCode = "";
    state.remotePairUrl = "";
    state.remoteConnectionState = "disconnected";
    state.remoteSessionState = "none";
    state.remoteLastFramePublishedAt = 0;
    state.remoteLastFrameReceivedAt = 0;
    state.remoteLastControllerSeenAt = 0;
    state.remoteLastCommandSentAt = 0;
    state.remoteLastCommandAckAt = 0;
    state.remotePendingCommands = [];
    state.remoteFrameAgeMs = null;
    state.remoteLastFrameId = "";
    loadUiCustomization();
  } catch { /* stockage indisponible ou préférence corrompue : defaults sûrs */ }
}
/* Grand écran = borne posée sur un support à distance de bras : texte et
   boutons un peu plus grands par défaut pour rester lisibles sans y coller
   les yeux. Uniquement un DÉFAUT initial — l'organisateur garde la main via
   le curseur « Taille du texte / boutons » et tout choix déjà enregistré
   n'est jamais écrasé. */
function defaultUiScaleForViewport() {
  const w = Math.max(window.innerWidth || 0, window.screen?.width || 0);
  if (w >= 1024) return { textScale: 122, buttonScale: 116 };
  if (w >= 768) return { textScale: 114, buttonScale: 110 };
  return { textScale: 100, buttonScale: 100 };
}
function loadUiCustomization() {
  let hasSavedScale = false;
  try {
    const saved = JSON.parse(localStorage.getItem(UI_CUSTOM_KEY) || "{}");
    hasSavedScale = saved.textScale != null || saved.buttonScale != null;
    const tabletDefault = hasSavedScale ? null : defaultUiScaleForViewport();
    state.uiTheme = ["midnight", "studio", "party", "pearl"].includes(saved.theme) ? saved.theme : "midnight";
    state.uiTextScale = Math.max(90, Math.min(145, Number(saved.textScale) || tabletDefault?.textScale || 100));
    state.uiButtonScale = Math.max(90, Math.min(135, Number(saved.buttonScale) || tabletDefault?.buttonScale || 100));
    state.customFrameSrc = typeof saved.frame === "string" ? saved.frame : "";
    state.customBorderSrc = typeof saved.border === "string" ? saved.border : "";
    state.idlePhotos = Array.isArray(saved.idlePhotos) ? saved.idlePhotos.slice(0, 8) : [];
    state.idlePhotosEnabled = saved.idlePhotosEnabled === true;
    state.uiComponents = saved.components && typeof saved.components === "object" && !Array.isArray(saved.components)
      ? saved.components
      : {};
    state.eventHost1 = typeof saved.eventHost1 === "string" ? saved.eventHost1.slice(0, 24) : "";
    state.eventHost2 = typeof saved.eventHost2 === "string" ? saved.eventHost2.slice(0, 24) : "";
    state.eventWelcome = typeof saved.eventWelcome === "string" ? saved.eventWelcome.slice(0, 90) : "";
    state.uiAccent = /^#[0-9a-fA-F]{6}$/.test(saved.accent || "") ? saved.accent : "";
  } catch { /* préférences visuelles corrompues : thème neutre */ }
  applyUiCustomization();
  applyEventIdentity();
  void loadCustomizationImages();
}
function saveUiCustomization() {
  const data = {
    theme: state.uiTheme,
    textScale: state.uiTextScale,
    buttonScale: state.uiButtonScale,
    frame: state.customFrameSrc,
    border: state.customBorderSrc,
    idlePhotos: state.idlePhotos || [],
    idlePhotosEnabled: state.idlePhotosEnabled === true,
    components: state.uiComponents || {},
    accent: state.uiAccent || "",
    eventHost1: state.eventHost1 || "",
    eventHost2: state.eventHost2 || "",
    eventWelcome: state.eventWelcome || "",
  };
  try {
    localStorage.setItem(UI_CUSTOM_KEY, JSON.stringify(data));
  } catch {
    // Quota dépassé : on retire d'abord les images (le thème et les échelles
    // restent sauvés), sinon on signale à l'utilisateur que l'image est trop lourde.
    try {
      const slim = { ...data, frame: "", border: "", idlePhotos: [] };
      localStorage.setItem(UI_CUSTOM_KEY, JSON.stringify(slim));
      state.customFrameSrc = ""; state.customBorderSrc = "";
      state.customFrameImage = null; state.customBorderImage = null;
      state.idlePhotos = [];
      applyUiCustomization();
      toast("Images trop lourdes pour être mémorisées — choisissez des images plus légères");
    } catch { toast("Mémoire locale pleine : images personnalisées non enregistrées"); }
  }
}
/* Éclaircit/fonce une couleur hex de `percent` (positif = plus clair). Sert à
   dériver --accent-2 d'une couleur d'accent personnalisée sans exiger deux
   choix de couleur à l'organisateur. */
function shadeHexColor(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + Math.round(255 * (percent / 100)));
  const g = clamp(((n >> 8) & 255) + Math.round(255 * (percent / 100)));
  const b = clamp((n & 255) + Math.round(255 * (percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
function applyUiCustomization() {
  document.body.dataset.uiTheme = state.uiTheme;
  document.documentElement.style.setProperty("--ui-text-scale", `${state.uiTextScale / 100}`);
  document.documentElement.style.setProperty("--ui-button-scale", `${state.uiButtonScale / 100}`);
  document.documentElement.style.setProperty("--ui-font-size", `${state.uiTextScale / 100}em`);
  document.documentElement.style.setProperty("--ui-control-scale", `${state.uiButtonScale / 100}`);
  // Accent personnalisé : surcharge --accent/--accent-2 sur les 4 thèmes sans
  // dupliquer de règles CSS. "" revient à la teinte native du thème choisi.
  if (state.uiAccent) {
    document.documentElement.style.setProperty("--accent", state.uiAccent);
    document.documentElement.style.setProperty("--accent-2", shadeHexColor(state.uiAccent, -18));
  } else {
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-2");
  }
  const accentInput = $("customizer-accent");
  if (accentInput) accentInput.value = state.uiAccent || "#7dd3fc";
  const accentReset = $("customizer-accent-reset");
  if (accentReset) accentReset.hidden = !state.uiAccent;
  const preview = $("customizer-preview");
  if (preview) {
    preview.dataset.theme = state.uiTheme;
    preview.style.setProperty("--preview-text-scale", `${state.uiTextScale / 100}`);
    preview.style.setProperty("--preview-button-scale", `${state.uiButtonScale / 100}`);
    preview.querySelector(".customizer-preview-frame").style.backgroundImage = state.customFrameSrc ? `url(${state.customFrameSrc})` : "none";
    preview.querySelector(".customizer-preview-border").style.backgroundImage = state.customBorderSrc ? `url(${state.customBorderSrc})` : "none";
  }
  document.querySelectorAll("#customizer-themes button").forEach((button) => button.classList.toggle("active", button.dataset.theme === state.uiTheme));
  const text = $("customizer-text-scale"), button = $("customizer-button-scale");
  if (text) text.value = state.uiTextScale;
  if (button) button.value = state.uiButtonScale;
  if ($("customizer-text-output")) $("customizer-text-output").textContent = `${state.uiTextScale}%`;
  if ($("customizer-button-output")) $("customizer-button-output").textContent = `${state.uiButtonScale}%`;
  // Composants personnalisables : chaque réglage s'applique en direct sur la
  // vraie borne, puis on reflète l'état sur les « ghosts » de l'aperçu.
  for (const key of Object.keys(UI_COMPONENTS)) applyComponentToDom(key);
  applyCustomizerGhostVisuals();
  // Sync settings sheet (theme picker + text/button segmented + accent).
  document.querySelectorAll("#theme-picker .theme-swatch").forEach((b) => {
    const active = b.dataset.themeOption === state.uiTheme;
    b.classList.toggle("active", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  document.querySelectorAll("#ui-text-scale button").forEach((b) => b.classList.toggle("active", Number(b.dataset.scale) === state.uiTextScale));
  document.querySelectorAll("#ui-button-scale button").forEach((b) => b.classList.toggle("active", Number(b.dataset.bscale) === state.uiButtonScale));
  const settingsAccent = $("set-ui-accent");
  if (settingsAccent) settingsAccent.value = state.uiAccent || settingsAccent.value || "#7dd3fc";
}
/* Identité de l'événement (prénoms des hôtes + message d'accueil veille) :
   personnalisable par l'organisateur, avec les valeurs d'origine de cette
   soirée comme défaut si rien n'est renseigné. Ne touche jamais au design,
   seulement au texte. */
function applyEventIdentity() {
  const host1 = state.eventHost1 || "Kenza";
  const host2 = state.eventHost2 || "Lilou";
  const welcome = state.eventWelcome || `${host1} & ${host2} — posez, c'est l'instant souvenir !`;
  const bubble1 = document.querySelector(".bubble-kenza span");
  const bubble2 = document.querySelector(".bubble-lilou span");
  if (bubble1) bubble1.textContent = host1;
  if (bubble2) bubble2.textContent = host2;
  const idleCopy = document.querySelector(".idle-party-copy");
  if (idleCopy) idleCopy.textContent = welcome;
  // Le cadre anniversaire n'est jamais persisté d'une session à l'autre : son
  // texte par défaut doit donc refléter l'identité choisie dès l'ouverture.
  if (!state.frameText || state.frameText.line2 === "Lilou & Kenza" || !state.frameText.line2) {
    state.frameText = { ...state.frameText, line2: `${host2} & ${host1}` };
  }
  const frameInput2 = $("frame-text-2");
  if (frameInput2) {
    frameInput2.placeholder = `Titre ligne 2 (ex. ${host2} & ${host1})`;
    if (!frameInput2.value.trim()) frameInput2.value = state.frameText.line2;
  }
  const host1Input = $("customizer-host1"), host2Input = $("customizer-host2"), welcomeInput = $("customizer-welcome");
  if (host1Input && document.activeElement !== host1Input) host1Input.value = state.eventHost1;
  if (host2Input && document.activeElement !== host2Input) host2Input.value = state.eventHost2;
  if (welcomeInput && document.activeElement !== welcomeInput) welcomeInput.value = state.eventWelcome;
  if (host1Input) host1Input.placeholder = "Kenza";
  if (host2Input) host2Input.placeholder = "Lilou";
  if (welcomeInput) welcomeInput.placeholder = welcome;
}
function bindEventIdentityFields() {
  const host1Input = $("customizer-host1"), host2Input = $("customizer-host2"), welcomeInput = $("customizer-welcome");
  if (!host1Input || !host2Input || !welcomeInput) return;
  const commit = () => {
    state.eventHost1 = host1Input.value.trim().slice(0, 24);
    state.eventHost2 = host2Input.value.trim().slice(0, 24);
    state.eventWelcome = welcomeInput.value.trim().slice(0, 90);
    applyEventIdentity();
    saveUiCustomization();
  };
  [host1Input, host2Input, welcomeInput].forEach((input) => {
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
  });
}
function loadCustomizationImages() {
  const load = (src, key) => new Promise((resolve) => {
    if (!src) { state[key] = null; resolve(); return; }
    const image = new Image();
    image.onload = () => { state[key] = image; resolve(); };
    image.onerror = () => { state[key] = null; resolve(); };
    image.src = src;
  });
  return Promise.all([load(state.customFrameSrc, "customFrameImage"), load(state.customBorderSrc, "customBorderImage")]).then(() => {
    drawLiveOverlay();
  });
}
function readCustomizationAsset(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("asset"));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // Dimension volontairement prudente : un cadre/rebord ne dépasse jamais
      // 1110 px pour rester bien sous le quota localStorage iOS (~4 Mo).
      const max = 1110, scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/webp", .78));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("asset")); };
    image.src = url;
  });
}
function savePreferences() {
  try {
    const saved = Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, state[field]]));
    if (!state.roleRemember) saved.deviceRole = "mixed";
    saved.logoPreferenceVersion = LOGO_PREF_VERSION;
    localStorage.setItem(PREF_KEY, JSON.stringify(saved));
  } catch { /* mode privé iOS ou quota atteint : l'app continue */ }
}
function syncPreferenceControls() {
  const checks = {
    "set-quality": state.qualityMax,
    "set-logo": state.logoEnabled,
    "set-delete": state.deleteEnabled,
    "set-track": state.trackEnabled,
    "set-idle": state.idleEnabled,
    "set-idle-face": state.idleFaceWake,
    "set-preroll": state.prerollEnabled,
    "set-film-bubble": state.filmBubbleEnabled,
    "set-emoji-faces": state.emojiFacesEnabled,
    "set-light-frame": state.lightFrameEnabled,
    "set-portrait": state.portraitMode,
    "set-burst": state.burstMode,
    "set-camera-framing": state.cameraFraming,
  };
  for (const [id, checked] of Object.entries(checks)) {
    const control = $(id);
    if (control) {
      control.checked = Boolean(checked);
      control.setAttribute('data-setting', id);
    }
  }
  // P1.2 — sync body attribute for camera framing
  document.body.setAttribute("data-camera-framing", state.cameraFraming ? "centered" : "fill");
  const perfControl = $("set-performance");
  if (perfControl) perfControl.value = PERF[state.performanceMode] ? state.performanceMode : "eco";
  const roleLabel = { camera: "Caméra", interface: "Interface", mixed: "Mixte" }[state.deviceRole] || "Mixte";
  const roleValue = $("settings-device-role");
  if (roleValue) roleValue.textContent = roleLabel;
  document.querySelectorAll(".settings-row [data-device-role]").forEach((button) => {
    button.classList.toggle("active", button.dataset.deviceRole === state.deviceRole);
  });
  document.querySelectorAll("#flash-modes button").forEach((button) => {
    button.classList.toggle("active", button.dataset.flash === state.flashMode);
  });
  document.querySelectorAll("#auto-delay-modes button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.delay) === state.autoDelay);
  });
}

const stickerCanvas = $("sticker-canvas");
const fxPanel = $("fx-panel");  const countdownEl = $("countdown");
  const countdownNumber = $("countdown-number");
  const countdownCancel = $("countdown-cancel");
const snapCtaEl = $("snap-cta");
  const snapCtaBtn = $("snap-cta-btn");
  const snapCtaCancelBtn = $("snap-cta-cancel-btn");
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
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

/* Nom d'appareil pour la sélection (au lieu du code) : modèle par défaut,
   éditable dans Réglages → Appareils. */
function defaultDeviceName() {
  try {
    const ua = navigator.userAgentData;
    if (ua) {
      const platform = String(ua.platform || "").toLowerCase();
      if (platform.includes("iphone")) return "iPhone";
      if (platform.includes("ipad")) return "iPad";
      if (platform.includes("android")) return "Android";
      if (platform.includes("mac")) return "Mac";
      if (platform.includes("win")) return "PC";
    }
    const legacy = String(navigator.platform || "").toLowerCase();
    if (legacy.includes("iphone")) return "iPhone";
    if (legacy.includes("ipad")) return "iPad";
    if (legacy.includes("android")) return "Android";
    if (legacy.includes("mac")) return "Mac";
  } catch { /* ua indisponible */ }
  return "Appareil";
}
function getDeviceName() {
  try { return localStorage.getItem("momentobooth-device-name") || defaultDeviceName(); } catch { return defaultDeviceName(); }
}
function setDeviceName(name) {
  const clean = String(name || "").replace(/[^\p{L}\p{N} _\-'.]/gu, "").slice(0, 40);
  try {
    if (clean) localStorage.setItem("momentobooth-device-name", clean);
    else localStorage.removeItem("momentobooth-device-name");
  } catch { /* stockage indisponible */ }
  return clean;
}

/* Toast : créé dynamiquement au premier message — AUCUN élément permanent
   dans le HTML (le div vide restait visible en pilule permanente sur l'écran). */
/* ---------- Accès organisateur : le code n'est jamais comparé en local,
   toujours vérifié par le serveur (voir /api/organizer/verify). La session
   obtenue est mise en cache le temps de l'événement pour ne pas redemander
   le code à chaque action. ---------- */
const ORGANIZER_SESSION_KEY = "momentobooth-organizer-session";
function loadOrganizerSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ORGANIZER_SESSION_KEY) || "null");
    if (saved?.token && Number(saved.expiresAt) > Date.now()) return saved;
  } catch { /* session corrompue : redemander le code */ }
  return null;
}
async function requestOrganizerAccess(promptText) {
  if (loadOrganizerSession()) return true;
  const pin = prompt(promptText || "Code organisateur :");
  if (pin === null) return false;
  try {
    const response = await fetch("/api/organizer/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { toast(data.error || "Code incorrect"); return false; }
    sessionStorage.setItem(ORGANIZER_SESSION_KEY, JSON.stringify(data));
    return true;
  } catch {
    toast("Vérification impossible — connexion au serveur requise");
    return false;
  }
}

// QW#2 — toast() accepte un 2e arg: { type: 'success'|'warn'|'error'|'info', duration?: ms }
// Backward compatible: toast("msg") marche toujours comme avant.
function toast(message, opts) {
  const type = (opts && opts.type) || "info";
  const duration = (opts && opts.duration) || 2600;
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  // Variante sémantique
  el.classList.remove("success", "warn", "error", "info");
  el.classList.add(type);
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), duration);
}
// Helpers rapides (QW#2)
toast.success = (m, d) => toast(m, { type: "success", duration: d });
toast.warn    = (m, d) => toast(m, { type: "warn",    duration: d });
toast.error   = (m, d) => toast(m, { type: "error",   duration: d });
toast.info    = (m, d) => toast(m, { type: "info",    duration: d });

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
  telemetry.emit("lifecycle", { event: document.hidden ? "hidden" : "visible" });
  if (document.hidden) suspendLiveWork();
  else { resumeAudio(); resumeLiveWork(); }
});
// pageshow : en plus du son, on relance publishing/polling distants — sur iOS
// un aller-retour en arrière-plan (pagehide) stoppe les timers et la reprise
// ne doit pas laisser la paire Caméra/Interface « connectée » mais muette.
window.addEventListener("pageshow", () => {
  telemetry.emit("lifecycle", { event: "pageshow" });
  resumeAudio();
  resumeLiveWork();
});
window.addEventListener("pagehide", () => {
  telemetry.emit("lifecycle", { event: "pagehide" });
  stopCamera({ lifecycle: true });
});

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

/* v124.0.11 — Empêche iOS Safari de couper la caméra après un moment
   d'inactivité : on relance le wake lock toutes les 25s tant que l'écran
   de capture est visible, et on "réveille" le flux vidéo en rejouant la
   balise <video>. C'est ce qui fait que la caméra "se coupe" sur iPad
   Safari sans interaction. */
let _cameraKeepAliveTimer = null;
function startCameraKeepAlive() {
  stopCameraKeepAlive();
  if (_cameraKeepAliveTimer) return;
  _cameraKeepAliveTimer = setInterval(async () => {
    try {
      // 1. Wake lock (renouvelle si perdu)
      if (document.visibilityState === "visible" && screens.capture?.classList.contains("active")) {
        try { await requestWakeLock(); } catch {}
        // 2. "Réveille" le flux vidéo en rejouant
        const v = $("camera");
        if (v && v.srcObject && v.paused) {
          try { await v.play(); } catch {}
        }
        // 3. Re-applique les contraintes pour forcer iOS à maintenir le track
        const stream = state.stream;
        if (stream) {
          for (const track of stream.getTracks()) {
            try {
              if (track.kind === "video" && typeof track.applyConstraints === "function") {
                await track.applyConstraints({ frameRate: 30 });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }, 25000);
}
function stopCameraKeepAlive() {
  if (_cameraKeepAliveTimer) {
    clearInterval(_cameraKeepAliveTimer);
    _cameraKeepAliveTimer = null;
  }
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
      // En Interface, l'objectif est choisi sur la Caméra jumelée : la
      // commande part immédiatement et l'aperçu distant se met à jour.
      if (state.remoteCamMode === "controller") {
        remoteSendSetting("lensDeviceId", deviceId);
        return;
      }
      if (state.stream) {
        try { state.stream.getTracks().forEach((t) => t.stop()); } catch {}
        telemetry.cameraStop();
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

async function ensureCameraPlayback(stream = state.stream, retries = 3) {
  if (!camera || !stream || state.deviceRole === "interface") return false;
  const isCurrentLiveStream = () => state.stream === stream
    && state.deviceRole !== "interface"
    && stream.getVideoTracks?.().some((track) => track.readyState === "live");
  if (!isCurrentLiveStream()) return false;
  camera.style.visibility = "visible";
  camera.dataset.facing = state.facing === "user" ? "user" : "environment";
  camera.hidden = false;
  camera.autoplay = true;
  camera.playsInline = true;
  camera.muted = true;
  syncCameraPresentation(stream);
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (!isCurrentLiveStream()) return false;
    try {
      if (camera.readyState < 1) {
        await new Promise((resolve) => {
          camera.addEventListener("loadedmetadata", resolve, { once: true });
          window.setTimeout(resolve, 700);
        });
      }
      if (!isCurrentLiveStream()) return false;
      await camera.play();
      if (isCurrentLiveStream() && (camera.videoWidth > 0 || camera.readyState >= 2)) return true;
    } catch { /* Safari peut retarder canplay après getUserMedia */ }
    await new Promise((resolve) => window.setTimeout(resolve, 120 * (attempt + 1)));
  }
  return false;
}

function stopCamera({ lifecycle = false } = {}) {
  _cameraRequestId += 1;
  _cameraRestartPending = false;
  state.cameraStopRequested = true;
  stopCameraKeepAlive();  // v124.0.11
  stopLightMonitor();
  stopPreroll();
  stopRemotePublishing();
  stopRemoteCommandPolling();
  // pagehide n'est pas toujours précédé d'un visibilitychange sur iOS :
  // couper aussi les annonces et demandes évite de laisser une caméra
  // « disponible » alors que son écran est suspendu.
  if (lifecycle) {
    stopDeviceAnnounce();
    stopPairRequestPolling();
  }
  try { state.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
  telemetry.cameraStop();
  state.stream = null;
  camera.srcObject = null;
  if (lifecycle && state.remoteCamMode === "camera") setRemoteConnectionStatus("reconnecting", "Application en pause — reprise en cours…");
  else if (!lifecycle) setRemoteConnectionStatus("disconnected", "Caméra arrêtée");
}

async function startCamera() {
  // Le rôle Interface est volontairement sans caméra locale : aucune
  // permission ne doit être demandée, même si un ancien bouton de secours
  // ou une reprise de page tente de relancer startCamera().
  if (state.deviceRole === "interface") {
    const errorEl = $("camera-error");
    errorEl?.classList.add("hidden");
    camera.style.visibility = "hidden";
    hideSplash();
    return;
  }
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
    state.cameraStopRequested = false;
    const facing = state.facing === "user" ? "user" : "environment";
    camera.dataset.facing = facing;
    // Essai progressif : 2560 → 1920 → 1280 → sans contrainte.
    // iPhone 11 (front ≤ ~1920×1080) échoue parfois sur les grosses contraintes.
    // Si un objectif précis est choisi → deviceId exact (Android multi-objectifs).
    const base = state.lensDeviceId
      ? { deviceId: { exact: state.lensDeviceId }, frameRate: { ideal: 30, max: 30 } }
      : { facingMode: facing, frameRate: { ideal: 30, max: 30 } };
    // Le preview live reste plafonné à 1080p/30 i/s : demander du 4K ici
    // rendrait le flux saccadé dès qu'un canvas, un filtre ou le réseau est
    // actif. La qualité photo est optimisée séparément lors de la capture.
    const profile = perfConfig();
    const unconstrainedBase = state.lensDeviceId
      ? { deviceId: { exact: state.lensDeviceId } }
      : { facingMode: facing };
    const attempts = [
      { ...base, width: { ideal: profile.cameraWidth }, height: { ideal: profile.cameraHeight } },
      base,
      unconstrainedBase,
    ];
    let stream = null, lastError = null;
    for (const video of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        break;
      } catch (error) { lastError = error; }
    }
    if (!stream) throw lastError || new Error("getUserMedia failed");
    // Une bascule/relance plus récente ou un Arrêter a gagné : ne laisse
    // jamais cette permission tardive recréer un flux après l'arrêt.
    if (requestId !== _cameraRequestId || state.cameraStopRequested) {
      try { stream.getTracks().forEach((track) => track.stop()); } catch {}
      return;
    }
    if (state.stream && state.stream !== stream) {
      try { state.stream.getTracks().forEach((track) => track.stop()); } catch {}
    }
    state.stream = stream;
    startCameraKeepAlive();  // v124.0.11 — heartbeat caméra anti-coupure iOS
    telemetry.cameraStart(camera, state.stream, {
      width: profile.cameraWidth,
      height: profile.cameraHeight,
      frameRate: 30,
    });
    // `init()` peut avoir affiché l'état d'attente pendant que la permission
    // Safari était ouverte. Le flux est maintenant réellement prêt : la vidéo
    // doit explicitement redevenir visible.
    const playbackReady = await ensureCameraPlayback(state.stream, 4);
    if (!playbackReady) {
      const failedStream = state.stream;
      telemetry.cameraStop();
      state.stream = null;
      camera.srcObject = null;
      try { failedStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      throw new Error("Camera playback unavailable");
    }
    // On re-synchronise les miniatures avec le vrai flux
    fxCards.forEach((item) => { if (item.video && item.hydrated) { item.video.srcObject = state.stream; } });
    if (fxPanel.classList.contains("open")) buildFxPanel();
    const wheelVideo = $("filter-wheel-live");
    if (wheelVideo && wheelVideo.srcObject !== state.stream) { wheelVideo.srcObject = state.stream; wheelVideo.play?.().catch(() => {}); }
    // Caméra OK → masque l'écran d'erreur ou l'état d'attente
    if (errorEl) errorEl.classList.add("hidden");
    clearTimeout(startCamera._waitingTimer);
    console.log("[MomentoBooth] caméra OK", camera.videoWidth, "x", camera.videoHeight);
    telemetry.startupMark("cameraReady", { width: camera.videoWidth, height: camera.videoHeight });
    // Caméra OK → le splash disparaît en fondu (interface révélée)
    hideSplash();
    // La demande peut avoir été lancée directement par le bouton de rôle,
    // avant la fin de init(). Reprend/crée ici la session distante pour ne
    // jamais perdre la publication caméra dans cette course iOS.
    if (state.deviceRole === "camera") {
      if (state.remoteCamMode === "camera" && state.remoteCamToken && state.remoteCamHostKey) {
        $("remote-token-row") && ($("remote-token-row").style.display = "flex");
        $("set-remote-camera") && ($("set-remote-camera").checked = true);
        startRemotePublishing();
        startRemoteCommandPolling();
      } else if (state.remoteCamMode === "off") {
        void startRemoteCamera();
      }
    }
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
    videoTrack?.addEventListener?.("ended", () => {
      if (requestId !== _cameraRequestId || state.cameraStopRequested) return;
      stopLightMonitor();
      stopRemotePublishing();
      stopRemoteCommandPolling();
      telemetry.cameraStop();
      state.stream = null;
      camera.srcObject = null;
      hideSplash();
      const textEl = $("camera-error")?.querySelector(".camera-error-text");
      if (textEl) textEl.textContent = "La caméra s'est interrompue. Touchez Réessayer pour la relancer.";
      const errEl = $("camera-error");
      if (errEl) {
        errEl.classList.remove("hidden");
        exitIdle();  // v124.0.12 — ne pas laisser l'idle-overlay bloquer "Réessayer"
      }
      setRemoteConnectionStatus("error", "Caméra interrompue — touchez Réessayer");
    }, { once: true });
    // ⚠️ Watchdog : si la vidéo reste NOIRE (aucune dimension après 2,5 s),
    // on ré-attache le flux (bug iOS connu) puis on affiche un diagnostic.
    setTimeout(() => {
      if (requestId !== _cameraRequestId) return;
      if (camera.videoWidth === 0 && state.stream) {
        const currentStream = state.stream;
        // Safari peut conserver srcObject sans produire de frames. Détache
        // puis réessaie réellement la lecture avant d'annoncer une panne.
        camera.srcObject = null;
        void ensureCameraPlayback(currentStream, 3).then((ready) => {
          if (ready || requestId !== _cameraRequestId || state.stream !== currentStream) return;
          showCamDiag("flux obtenu mais vidéo noire (width=0)");
          stopLightMonitor();
          telemetry.cameraStop();
          state.stream = null;
          try { currentStream.getTracks?.().forEach((track) => track.stop()); } catch {}
          camera.srcObject = null;
          const error = $("camera-error");
          const text = error?.querySelector(".camera-error-text");
          if (text) text.textContent = "La caméra est active mais le flux vidéo ne s'affiche plus. Touchez Réessayer.";
          error?.classList.remove("hidden");
        });
      }
    }, 2500);
  } catch (error) {
    if (requestId !== _cameraRequestId || state.cameraStopRequested) return;
    // ⚠️ Affiche un écran clair + bouton réessayer au lieu d'un écran noir.
    // Le splash ne doit jamais rester au-dessus de cet état d'erreur.
    clearTimeout(startCamera._waitingTimer);
    const existingTrack = previousStream?.getVideoTracks?.()[0];
    const existingStreamUsable = state.stream === previousStream && existingTrack && existingTrack.readyState !== "ended";
    if (existingStreamUsable) {
      // Une relance secondaire peut échouer (objectif non exposé, contrainte
      // refusée) alors que l'ancien flux reste parfaitement utilisable.
      // Restaure-le au lieu d'afficher une fausse panne caméra.
      void ensureCameraPlayback(state.stream, 3);
      if (errorEl) errorEl.classList.add("hidden");
      hideSplash();
      if (state.lightFrameEnabled || state.flashMode === "auto") startLightMonitor();
      toast("Objectif indisponible — caméra conservée");
      return;
    }
    hideSplash();
    stopLightMonitor(); // pas de contour lumineux sur l'écran d'erreur
    if (state.deviceRole === "camera") setRemoteConnectionStatus("error", "Caméra indisponible — autorisez l'accès puis réessayez");
    console.error("[MomentoBooth] getUserMedia échec:", error?.name, error?.message);
    showCamDiag(`erreur ${error?.name || "inconnue"}: ${error?.message || ""}`);
    if (errorEl) {
      errorEl.classList.remove("hidden");
      exitIdle();  // v124.0.12 — ne pas laisser l'idle-overlay bloquer "Réessayer"
    }
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
  if (state.deviceRole === "interface") return;
  const errorEl = $("camera-error");
  if (!errorEl || state.stream) return;
  const title = errorEl.querySelector(".camera-error-title");
  const text = errorEl.querySelector(".camera-error-text");
  const button = $("btn-retry-camera");
  if (title) title.textContent = "Caméra en attente";
  if (text) text.textContent = "La permission caméra tarde à répondre. Autorisez-la dans Safari, puis réessayez si nécessaire.";
  if (button) button.textContent = "🔄 Réessayer";
  errorEl.classList.remove("hidden");
  exitIdle();  // v124.0.12 — empêche l'idle-overlay de bloquer le bouton "Réessayer"
  hideSplash();
}

async function flipCamera() {
  if (state.deviceRole === "interface" || !state.stream) return;
  stopCamera({ lifecycle: true });
  state.cameraStopRequested = false;
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
function updateLensStatus() {
  // L'ancien bandeau « LENS LIVE / Original » surchargeait la caméra et
  // n'apportait aucune action : il a été retiré de l'interface.
}
function liveFilterCss() {
  return [activePhotoFilter(), activeAccessory()]
    .map((item) => item.css && item.css !== "none" ? item.css : "")
    .filter(Boolean).join(" ") || "brightness(1)";
}
function refreshLiveFilter() {
  const css = liveFilterCss();
  updateLensStatus();
  camera.style.setProperty("--mb-live-filter", css);
  // La roue de filtres (élément frère, pas descendant de #camera) doit
  // recevoir la même variable CSS pour que sa vignette vidéo porte le filtre.
  const wheelVideo = $("filter-wheel-live");
  if (wheelVideo) wheelVideo.style.setProperty("--mb-live-filter", css);
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
  updateLensStatus();
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
  syncWheelAngles();
  document.querySelectorAll("#photo-filter-rail-list [data-filter]").forEach((item) => {
    const isActive = item.dataset.filter === id;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  try { navigator.vibrate?.(8); } catch {}
}

/* Resynchronise les angles de la demi-roue quand le filtre actif change en
   dehors de la roue (swipe, sélection legacy, reset après capture). */
function syncWheelAngles() {
  const list = $("photo-filter-rail-list");
  const cards = list ? [...list.querySelectorAll("[data-filter]")] : [];
  const index = Math.max(0, PHOTO_FILTERS.findIndex((item) => item.id === state.photoFilterId));
  cards.forEach((card, i) => card.style.setProperty("--wheel-angle", `${-58 + (i - index) * 14}deg`));
}

function applyWheelSelection(index, announce = true) {
  const safeIndex = Math.max(0, Math.min(PHOTO_FILTERS.length - 1, index));
  const item = PHOTO_FILTERS[safeIndex];
  const list = $("photo-filter-rail-list");
  const cards = [...(list?.querySelectorAll("[data-filter]") || [])];
  // Anneau complet : -90° = position haute, pas -58° (ancienne demi-roue).
  // L'écart dépend du nombre de filtres ; 360°/n couvre tout le cercle, mais
  // 270°/n garde l'arc lisible (la sélection reste vers le haut).
  const n = PHOTO_FILTERS.length;
  const step = n <= 4 ? 70 : n <= 6 ? 55 : n <= 8 ? 42 : 30;
  const baseAngle = -90; // commence en haut du cercle (12h)
  cards.forEach((card, i) => {
    card.classList.toggle("active", i === safeIndex);
    card.setAttribute("aria-selected", i === safeIndex ? "true" : "false");
    card.style.setProperty("--wheel-angle", `${baseAngle + (i - safeIndex) * step}deg`);
  });
  // Sync le label central "Filtre : X"
  const label = $("filter-rail-label");
  if (label) label.textContent = `Filtre : ${item.name}`;
  if (state.photoFilterId !== item.id) applyFilter(item.id);
  if (announce) showFilterName(item.name);
}
/* Vignette live du carrousel : au lieu de rendre 14 flux vidéo simultanés
   (coûteux sur iPhone 11), une SEULE frame basse résolution est capturée
   périodiquement depuis `filter-wheel-live` (déjà connecté au flux caméra)
   puis partagée entre toutes les pastilles — chacune applique son propre
   filtre CSS par-dessus la même image de base. Fréquence volontairement
   basse (≈1,4 im/s) : la miniature n'a besoin d'être qu'à jour, pas fluide. */
let _railThumbTimer = null;
let _railThumbUrl = null;
function refreshFilterRailThumbnails() {
  const rail = $("photo-filter-rail");
  const video = $("filter-wheel-live");
  if (!rail || !video || !video.videoWidth) return;
  if (!screens.capture?.classList.contains("active") || document.body.classList.contains("idle")) return;
  try {
    const size = 84;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2, sy = (video.videoHeight - side) / 2;
    ctx.translate(size, 0); ctx.scale(-1, 1); // miroir selfie, cohérent avec l'aperçu
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    // Encodage asynchrone : le canvas est petit (84×84) et local à cette
    // fonction, inutile de forcer sa libération — le GC s'en charge une fois
    // le callback de toBlob passé.
    canvas.toBlob((blob) => {
      if (!blob) return;
      const nextUrl = URL.createObjectURL(blob);
      if (_railThumbUrl) URL.revokeObjectURL(_railThumbUrl);
      _railThumbUrl = nextUrl;
      rail.querySelectorAll(".filter-rail-thumb").forEach((img) => { img.src = nextUrl; });
    }, "image/jpeg", 0.55);
  } catch { /* vignette optionnelle : la pastille garde son dégradé de secours */ }
}
function buildPhotoFilterRail() {
  const list = $("photo-filter-rail-list");
  if (!list) return;
  list.innerHTML = "";
  let selected = Math.max(0, PHOTO_FILTERS.findIndex((item) => item.id === state.photoFilterId));
  PHOTO_FILTERS.forEach((item, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `filter-rail-card${index === selected ? " active" : ""}`;
    card.dataset.filter = item.id;
    card.title = item.name;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", index === selected ? "true" : "false");
    card.setAttribute("aria-label", `Filtre photo ${item.name}`);
    const preview = document.createElement("span");
    preview.className = "filter-rail-preview";
    const thumb = document.createElement("img");
    thumb.className = "filter-rail-thumb";
    thumb.alt = "";
    thumb.style.filter = item.css && item.css !== "none" ? item.css : "none";
    if (_railThumbUrl) thumb.src = _railThumbUrl;
    preview.appendChild(thumb);
    card.appendChild(preview);
    card.addEventListener("click", () => { selected = index; applyWheelSelection(selected); sfxOpen(); });
    list.appendChild(card);
  });
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Filtres photo");
  // Clavier : ↑/↓ (ou ←/→ selon l'orientation de la roue) déplace ET
  // sélectionne immédiatement, comme le toucher — pas de bouton Appliquer.
  list.tabIndex = 0;
  list.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const dir = (event.key === "ArrowUp" || event.key === "ArrowLeft") ? -1 : 1;
    selected = Math.max(0, Math.min(PHOTO_FILTERS.length - 1, selected + dir));
    applyWheelSelection(selected);
    sfxOpen();
  });
  let startY = 0, lastY = 0, dragging = false;
  list.addEventListener("pointerdown", (event) => { dragging = true; startY = lastY = event.clientY; list.setPointerCapture?.(event.pointerId); event.preventDefault(); });
  list.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (Math.abs(event.clientY - startY) > 18) {
      selected = Math.max(0, Math.min(PHOTO_FILTERS.length - 1, selected + (event.clientY < lastY ? 1 : -1)));
      lastY = event.clientY;
      applyWheelSelection(selected);
    }
    event.preventDefault();
  });
  list.addEventListener("pointerup", () => { dragging = false; });
  list.addEventListener("pointercancel", () => { dragging = false; });
  // P1.3 — rotation molette avec inertie + snap
  let _wheelVelocity = 0, _wheelTimer = null, _wheelTick = null;
  const _wheelStep = () => {
    const abs = Math.abs(_wheelVelocity);
    if (abs < 0.02) { clearInterval(_wheelTick); _wheelTick = null; _wheelVelocity = 0; applyWheelSelection(selected); return; }
    const dir = _wheelVelocity > 0 ? 1 : -1;
    selected = Math.max(0, Math.min(PHOTO_FILTERS.length - 1, selected + dir));
    applyWheelSelection(selected);
    _wheelVelocity *= 0.85;
    if (Math.abs(_wheelVelocity) < 0.02) { clearInterval(_wheelTick); _wheelTick = null; _wheelVelocity = 0; applyWheelSelection(selected); }
  };
  list.addEventListener("wheel", (event) => {
    event.preventDefault();
    _wheelVelocity += event.deltaY * 0.012;
    _wheelVelocity = Math.max(-8, Math.min(8, _wheelVelocity));
    clearTimeout(_wheelTimer);
    clearInterval(_wheelTick);
    _wheelTick = setInterval(_wheelStep, 80);
    _wheelTimer = setTimeout(() => { clearInterval(_wheelTick); _wheelTick = null; _wheelVelocity = 0; applyWheelSelection(selected); }, 600);
  }, { passive: false });
  const wheelVideo = $("filter-wheel-live");
  if (wheelVideo && state.stream) { wheelVideo.srcObject = state.stream; wheelVideo.play?.().catch(() => {}); }
  applyWheelSelection(selected, false);
  clearInterval(_railThumbTimer);
  _railThumbTimer = setInterval(refreshFilterRailThumbnails, 700);
  refreshFilterRailThumbnails();
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
  updateLensStatus();
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
  fxPanelTrap.onOpen();
}
function closeFxPanel() {
  releaseFxCards();
  $("fx-panel").classList.remove("open");
  $("fx-panel").setAttribute("aria-hidden", "true");
  const topButton = $("btn-fx-top");
  topButton?.classList.remove("active");
  topButton?.setAttribute("aria-expanded", "false");
  sfxClose();
  fxPanelTrap.onClose();
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
  // Le rôle Caméra est un moniteur uniquement : aucun tap ne lance le
  // minuteur, n'ouvre une feuille ou ne déclenche une capture locale.
  if (state.deviceRole === "camera") return;
  // Pendant le compte à rebours : un tap = pause / reprise
  if (state.counting) {
    if (event.target.closest("#countdown-cancel")) return;
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
  if (state.deviceRole === "camera") return;
  if (!swipeActive) return;
  swipeActive = false;
  if (state.counting) return;
  if (isSwiping) return; // c'était un swipe
  // Un appui long vient de déclencher le focus manuel → ne pas ouvrir le minuteur
  if (_focusJustUsed) { _focusJustUsed = false; return; }
  if (gestureTarget(event) !== "cam") return;
  // Previously we opened the timer sheet here, now it's bound to the specific button.
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
      remoteSendSetting("timerSeconds", d.s);
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
/* Après une prise, l'aperçu revient toujours à son état neutre.
   Les blobs déjà générés restent inchangés dans l'écran résultat. */
function resetLiveEffectsAfterCapture() {
  state.photoFilterId = "original";
  state.accessoryId = null;
  state.animationId = null;
  stopAnimation();
  state.animationEngine = null;
  refreshLiveFilter();
  drawLiveOverlay();
  document.querySelectorAll("#photo-filter-rail-list [data-filter]").forEach((item) => {
    item.classList.toggle("active", item.dataset.filter === "original");
  });
  fxCards.forEach((item) => item.card.classList.remove("active"));
  void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
}

// v124.0.7 — cache le GIF incitatif sous le shutter après la 1ère capture.
function hideShutterHintGif() {
  const gif = document.getElementById("shutter-hint-gif");
  if (!gif) return;
  gif.classList.add("hidden");
  try { localStorage.setItem("momentobooth-shutter-hint-seen", "1"); } catch {}
}

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
      remoteSendSetting("captureCount", count);
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
function cancelCountdown() {
  if (!state.counting) return;
  state.counting = false;
  state.countingPaused = false;
  state._countdownToken = null;
  state._countdownCancelled = true;
  state._resumeCountdown?.();
  state._resumeCountdown = null;
  countdownEl.classList.add("hidden");
  countdownEl.classList.remove("paused");
  document.body.classList.remove("ui-hidden", "counting-mode");
  releaseWakeLock();
  sfxClose();
  toast("Compte à rebours annulé");
}

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

/* Snap pré-déclenchement v122.1 — CTA géant plein écran.
   Affiche le gros bouton "Prendre la photo" qui masque tout le reste.
   Sur tap du CTA → lance startCountdown() (compte à rebours classique).
   Sur Annuler → referme le CTA, revient à l'état normal. */
function showSnapCta() {
  if (!snapCtaEl || state.counting) return;
  snapCtaEl.classList.remove("hidden");
  document.body.classList.add("ui-hidden");
  requestWakeLock();
  // Pour les tablettes paysage : on centre tout, pas de barre.
}
function hideSnapCta() {
  if (!snapCtaEl) return;
  snapCtaEl.classList.add("hidden");
  document.body.classList.remove("ui-hidden");
  releaseWakeLock();
}
// Bind les événements du snap CTA
if (snapCtaBtn) snapCtaBtn.addEventListener("click", () => {
  hideSnapCta();
  if (!state.counting) startCountdown();
});
if (snapCtaCancelBtn) snapCtaCancelBtn.addEventListener("click", () => {
  hideSnapCta();
});

async function startCountdown() {
  if (state.counting) return;
  state.counting = true;
  state._countdownCancelled = false;
  const countdownToken = {};
  state._countdownToken = countdownToken;
  const countdownIsCurrent = () => state.counting && state._countdownToken === countdownToken && !state._countdownCancelled;
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
    if (!countdownIsCurrent()) return null;
    sfxTick();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!countdownIsCurrent()) return null;
    remaining -= 1;
    if (remaining > 0) {
      countdownNumber.textContent = String(remaining);
      return tick();
    }
    sfxFinal();
    countdownEl.classList.add("hidden");
    // Une annulation juste avant l'échéance ne doit jamais déclencher la photo.
    if (countdownIsCurrent()) await capture();
    return null;
  };
  try {
    await tick();
  } finally {
    // Nettoyage unique pour fin normale, annulation et erreur de capture.
    // Ainsi aucune classe UI, wake lock ou marqueur interne ne fuit d'une prise
    // à la suivante.
    // Un ancien cycle ne doit jamais nettoyer l'interface d'un nouveau cycle.
    if (state._countdownToken !== countdownToken) return;
    countdownEl.classList.add("hidden");
    countdownEl.classList.remove("paused");
    document.body.classList.remove("ui-hidden", "counting-mode");
    releaseWakeLock();
    state.counting = false;
    state.countingPaused = false;
    state._countdownToken = null;
    state._resumeCountdown = null;
    state._countdownCancelled = false;
  }
}

countdownCancel?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  cancelCountdown();
}, { passive: false });
countdownCancel?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
}, { passive: false });

/* =========================================================
   DÉTECTION VISAGE + TRACK + MODE AUTO
   ========================================================= */
async function initFaceLandmarker() {
  if (state.landmarker) return state.landmarker;
  if (_faceTrackingPromise) return _faceTrackingPromise;
  // v124.0.3 — mode lite Safari iOS : MediaPipe WASM est le suspect #1 de
  // crash récurrent. On désactive complètement le face tracking et on
  // retourne null. Les effets qui dépendent du face mesh tombent en fallback
  // canvas (déjà géré par drawMask).
  if (state.liteMode) return null;
  // Un asset MediaPipe absent ou trop lourd ne doit pas provoquer une
  // nouvelle importation à chaque geste : l'app reste utilisable sans tracking
  // et retentera plus tard, de façon bornée.
  if (Date.now() < _faceTrackingUnavailableUntil) return null;
  const generation = _faceTrackingGeneration;
  const promise = (async () => {
    let created = null;
    try {
      const { FaceLandmarker, FilesetResolver } = await import(`../mediapipe/vision_bundle.mjs?v=${APP_VERSION}`);
      const fileset = await FilesetResolver.forVisionTasks("../mediapipe/wasm");
      // Le mode multi-visage est opt-in avec la bulle : 3 visages max suffisent
      // pour l'interface, sans imposer ce coût au mode caméra standard.
      const opts = { runningMode: "VIDEO", numFaces: state.filmBubbleEnabled ? 3 : 1, outputFaceSegmentationMasks: Boolean(state.portraitMode || state.backdrop) };
      try {
        // GPU d'abord (rapide), fallback CPU si indisponible.
        created = await FaceLandmarker.createFromOptions(fileset, {
          ...opts,
          baseOptions: { modelAssetPath: "../mediapipe/face_landmarker.task", delegate: "GPU" },
        });
      } catch {
        created = await FaceLandmarker.createFromOptions(fileset, {
          ...opts,
          baseOptions: { modelAssetPath: "../mediapipe/face_landmarker.task", delegate: "CPU" },
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
      telemetry.startupMark("mediapipeReady");
      telemetry.resourceStart("activeFaceTrackers", { model: "face-landmarker" });
      _faceTrackingFailureCount = 0;
      _faceTrackingUnavailableUntil = 0;
      if (state.landmarker) console.log("[MomentoBooth] FaceLandmarker prêt (option activée)");
      return state.landmarker;
    } catch {
      try { created?.close?.(); } catch {}
      _faceTrackingFailureCount = Math.min(4, _faceTrackingFailureCount + 1);
      _faceTrackingUnavailableUntil = Date.now() + (5000 * _faceTrackingFailureCount);
      console.warn("[MomentoBooth] Tracking visage indisponible, nouvelle tentative différée");
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
  if (state.landmarker) telemetry.resourceStop("activeFaceTrackers", { model: "face-landmarker" });
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
  const detectStarted = performance.now();
  try {
    const result = state.landmarker.detectForVideo(camera, performance.now());
    // ── Lissage EMA des landmarks (masque biométrique stable) ──
    // Réduit fortement le jitter des accessoires sans coût notable (une passe
    // par point). Le lissage est réinitialisé si le nombre de visages change.
    const rawFaces = result.faceLandmarks ?? [];
    telemetry.emit("mediapipe", {
      durationMs: performance.now() - detectStarted,
      faceCount: rawFaces.length,
      frameWidth: camera.videoWidth || null,
      frameHeight: camera.videoHeight || null,
    });
    // Pool réutilisé (pas d'allocation par frame → zéro GC churn sur mobile).
    if (!state._smoothPool) state._smoothPool = [];
    const prevSmooth = state._smoothFaces && state._smoothFaces.length === rawFaces.length ? state._smoothFaces : null;
    const SMOOTH = 0.42; // poids du passé : plus haut = plus stable mais plus lent
    const smoothed = new Array(rawFaces.length);
    for (let i = 0; i < rawFaces.length; i++) {
      const lm = rawFaces[i];
      if (!lm || lm.length < 30) { smoothed[i] = lm; continue; }
      // Réutilise le buffer du slot i (même longueur) sinon en crée un.
      let out = state._smoothPool[i];
      if (!out || out.length !== lm.length) {
        out = new Array(lm.length);
        for (let j = 0; j < lm.length; j++) out[j] = { x: 0, y: 0, z: 0 };
        state._smoothPool[i] = out;
      }
      const pv = prevSmooth && prevSmooth[i] && prevSmooth[i].length === lm.length ? prevSmooth[i] : null;
      for (let j = 0; j < lm.length; j++) {
        const p = lm[j];
        const o = out[j];
        if (pv) { o.x = pv[j].x * SMOOTH + p.x * (1 - SMOOTH); o.y = pv[j].y * SMOOTH + p.y * (1 - SMOOTH); o.z = p.z; }
        else { o.x = p.x; o.y = p.y; o.z = p.z; }
      }
      smoothed[i] = out;
    }
    state.faces = smoothed;
    state._smoothFaces = state.faces.length ? state.faces : null;
    state.face = state.faces[0] ?? null;
    // v124.0.5 — Quick win 3D : on extrait la matrice de transformation faciale
    // MediaPipe (matrice 4×4 par visage, fournie par detectForVideo mais non
    // utilisée jusqu'ici). Cette matrice mappe un repère canonique (centré sur
    // le visage, X droit, Y bas, Z avant) vers le repère image. C'est ce qui
    // permet aux accessoires 3D (lunettes, casquette) de suivre les rotations
    // de tête (yaw/pitch/roll) au lieu d'être posés sur des ancres 2D fixes.
    // On EMA-lisse la pose (0.35) pour éviter le jitter.
    try {
      const matrices = result.facialTransformationMatrixes ?? [];
      const blendshapes = result.faceBlendshapes ?? [];
      const rawMatrix = matrices[0]?.data ? Array.from(matrices[0].data) : null;
      if (rawMatrix && rawMatrix.length === 16) {
        // EMA lissage : 0.35 sur la nouvelle pose, 0.65 sur la précédente
        if (!state._smoothFaceMatrix) {
          state._smoothFaceMatrix = rawMatrix.slice();
        } else {
          for (let k = 0; k < 16; k++) {
            state._smoothFaceMatrix[k] = state._smoothFaceMatrix[k] * 0.65 + rawMatrix[k] * 0.35;
          }
        }
        state.faceMatrix = state._smoothFaceMatrix;
      } else {
        // Pas de matrice (visage perdu ou première frame) : on garde la dernière
        // pour ne pas faire disparaître brutalement l'accessoire.
        // On NE reset pas à null ici — c'est volontaire, le 3D continue avec
        // la dernière pose connue jusqu'à ce qu'une nouvelle soit détectée.
      }
      // Blendshapes (52 catégories : mouthSmile, eyeBlinkLeft, etc.) : stockés
      // tels quels pour usage futur. Pas de lissage temporel pour l'instant.
      if (blendshapes[0]?.categories) {
        state.blendshapes = blendshapes[0].categories;
      }
    } catch (err) {
      // Silent fail : la matrice est un nice-to-have, pas critique.
      // Si elle crash, le reste de l'app continue normalement.
    }
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
    /* Présence globale : le GIF se réarme seulement après une absence réelle,
       y compris quand la borne n'est pas encore en veille. */
    if (state.face && state.face.length >= 30) {
      state.idleFaceAbsentSince = 0;
    } else {
      if (!state.idleFaceAbsentSince) state.idleFaceAbsentSince = performance.now();
      if (performance.now() - state.idleFaceAbsentSince >= 2500) {
        state.idlePromptShown = false;
        state.idlePromptAt = 0;
      }
    }
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
        /*
         * Arrivée d'une personne : idle-click.gif est un signal de présence,
         * pas seulement une animation après un tap. Le verrou empêche le GIF
         * de redémarrer à chaque frame MediaPipe tant que le même visage reste
         * devant la borne.
         */
        if (!state.idlePromptShown) {
          state.idlePromptShown = true;
          state.idlePromptAt = performance.now();
          playIdleClickPrompt();
        }
        state.idleWakeHits = (state.idleWakeHits || 0) + 1;
        /* Trois détections réveillent la borne, mais jamais avant que le GIF
           ait eu le temps de jouer : le signal de présence reste lisible. */
        if (state.idleWakeHits >= 3 && performance.now() - state.idlePromptAt >= 720) {
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
  } catch { state.face = null; clearFaceMask(); state.faces = []; state._smoothFaces = null; }
}

/* Grain live léger : motif réutilisé, sans Math.random() sur chaque frame.
   Le rendu photo complet garde le grain pixel côté capture/serveur ; ici on
   affiche seulement un aperçu discret pour préserver la fluidité mobile. */
let _liveGrainPattern = null;
function drawLiveGrain(ctx, W, H, strength = .05) {
  try {
    if (!_liveGrainPattern) {
      const grain = document.createElement("canvas");
      grain.width = 64; grain.height = 64;
      const gctx = grain.getContext("2d");
      const pixels = gctx.createImageData(64, 64);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = Math.random() > .5 ? 255 : 0;
        pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
      }
      gctx.putImageData(pixels, 0, 0);
      _liveGrainPattern = grain;
    }
    const pattern = ctx.createPattern(_liveGrainPattern, "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(.12, strength));
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } catch { /* overlay décoratif : jamais bloquant */ }
}

/* Overlay live : masque + tracker + ANIMATION (ballons…) */
/* Fond en LIVE : si un fond est choisi, on dessine le fond + la personne
   détourée (masque de segmentation) par-dessus la vidéo, en basse résolution
   pour rester léger (le canvas ne fait que la taille de l'écran). */
/* MediaPipe renvoie des points normalisés dans l'image source. Le preview
   utilise `object-fit: cover`, donc une simple multiplication par W/H fait
   flotter les lenses dès que le ratio vidéo et le ratio écran diffèrent.
   On projette les landmarks dans le même crop que la vidéo avant de dessiner. */
function mapFaceToCover(face, canvasW, canvasH, videoW, videoH, mirrored = false) {
  if (!Array.isArray(face) || !face.length || !videoW || !videoH) return face;
  const sourceRatio = videoW / videoH;
  const targetRatio = canvasW / canvasH;
  let renderW = canvasW, renderH = canvasH, offsetX = 0, offsetY = 0;
  if (sourceRatio > targetRatio) {
    renderW = canvasH * sourceRatio;
    offsetX = (canvasW - renderW) / 2;
  } else {
    renderH = canvasW / sourceRatio;
    offsetY = (canvasH - renderH) / 2;
  }
  return face.map((point) => {
    const projectedX = (point.x * renderW + offsetX) / canvasW;
    return {
      ...point,
      x: mirrored ? 1 - projectedX : projectedX,
      y: (point.y * renderH + offsetY) / canvasH,
    };
  });
}

function drawLiveOverlay() {
  const now = performance.now();
  if (now - (state._lastOverlayAt || 0) < perfConfig().overlayMs && !state._forceOverlay) return;
  state._lastOverlayAt = now;
  state._forceOverlay = false;
  const ctx = stickerCanvas.getContext("2d");
  const W = stickerCanvas.width, H = stickerCanvas.height;
  ctx.clearRect(0, 0, W, H);
  const filter = activeAccessory();
  const photoFilter = activePhotoFilter();
  // Quand le fond remplace le <video>, le filtre CSS du <video> ne s'applique
  // plus. CanvasFilter restaure le même look sur la source composite.
  const sourceFilter = liveFilterCss();
  const canFilterCanvas = typeof ctx.filter === "string";
  // Le fond décoratif reste neutre ; le look est appliqué uniquement à la
  // source caméra/personne, comme dans l'export final.
  if (canFilterCanvas) ctx.filter = "none";

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
    if (canFilterCanvas) ctx.filter = sourceFilter;
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
    if (canFilterCanvas) ctx.filter = "none";
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
    if (canFilterCanvas) ctx.filter = sourceFilter;
    ctx.globalAlpha = .68;
    ctx.drawImage(camera, 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (canFilterCanvas) ctx.filter = "none";
  }

  /* Finition Lens : elle doit passer AVANT les masques, comme dans la capture
     (le filtre couleur traite la photo, puis l'accessoire est posé au-dessus).
     Cela évite les lunettes/moustaches teintées différemment entre le live et
     le JPEG final. */
  if (photoFilter?.overlay) {
    const overlay = photoFilter.overlay;
    if (overlay.tint) {
      ctx.fillStyle = overlay.tint;
      ctx.fillRect(0, 0, W, H);
    }
    if (overlay.vignette) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .18, W / 2, H / 2, Math.max(W, H) * .72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${Math.min(.5, overlay.vignette)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (overlay.grain) drawLiveGrain(ctx, W, H, overlay.grain);
  }

  // Les accessoires restent nets et non recolorés par le filtre de source ;
  // leur géométrie, elle, suit exactement le crop object-fit:cover.
  if (canFilterCanvas) ctx.filter = "none";
  if (filter.mask !== "none") {
    const maskFaces = (state.faces && state.faces.length) ? state.faces : (state.face ? [state.face] : []);
    const videoW = camera.videoWidth || W, videoH = camera.videoHeight || H;
    for (let fi = 0; fi < maskFaces.length; fi++) {
      const f = maskFaces[fi];
      if (f && f.length > 30) {
        const projected = mapFaceToCover(f, W, H, videoW, videoH, state.facing === "user");
        drawMask(ctx, W, H, projected, filter.mask, fi, state.faceMatrix);
      }
    }
  }

  // Tracker visage : cadre doré sur les visages, disparaît après délai
  if (state.trackEnabled || state.autoMode) {
    drawHeadTracker(ctx);
  }

  // Animation overlay (ballons, confettis…) par-dessus
  if (state.animationEngine) {
    state.animationEngine.draw(ctx, W, H);
  }
  // Cadre/rebord organisateur : rendu léger, au-dessus de la caméra et des effets.
  if (canFilterCanvas) ctx.filter = "none";
  if (state.customFrameImage || state.customBorderImage) {
    ctx.save();
    if (state.customFrameImage) ctx.drawImage(state.customFrameImage, 0, 0, W, H);
    if (state.customBorderImage) ctx.drawImage(state.customBorderImage, 0, 0, W, H);
    ctx.restore();
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

/* Retour visuel pendant le traitement d'une capture (dessin canvas, filtre,
   GIF, décor emoji…). Le délai avant apparition évite tout clignotement sur
   les prises quasi instantanées (mode éco, appareil rapide) : seul un
   traitement réellement perceptible affiche le voile + spinner. */
let _captureLoadingTimer = null;
function beginCaptureProcessingFeedback() {
  clearTimeout(_captureLoadingTimer);
  _captureLoadingTimer = setTimeout(() => { $("capture-loading-overlay")?.classList.add("show"); }, 220);
}
function endCaptureProcessingFeedback() {
  clearTimeout(_captureLoadingTimer);
  $("capture-loading-overlay")?.classList.remove("show");
}
async function captureSingle() {
  if (state.capturing) return;
  beginCaptureProcessingFeedback();
  try {
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
  await ensureLogoForCapture();
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
    await showResult(items);
    if (!state.captureBatchActive) resetLiveEffectsAfterCapture();
  } finally {
    await tryTorch(false);
    gifStopPre(true);
    state.capturing = false;
  }
  } finally {
    endCaptureProcessingFeedback();
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
  // En mode Portrait, la variante doit exister même si MediaPipe perd une
  // frame au moment du déclenchement. On utilise alors un fallback centré,
  // plutôt que de supprimer silencieusement le rendu demandé.
  const portraitRequested = Boolean(state.portraitMode || state.autoMode);
  // Segmentation MediaPipe dispo (mode portrait / fond) : le portrait-masque
  // local est supérieur à l'ovale serveur ; le serveur reste le fallback.
  const hasMask = Boolean(state.faceMask);
  const delegatePortrait = portraitRequested && !hasMask;
  let items = [];
  try {
    // 2) Délégation serveur : le serveur applique les ops du filtre couleur,
    //    le flou portrait (ovale) et renvoie les JPEG — l'iPhone n'encode
    //    qu'un seul JPEG (l'upload) au lieu de 3 encodages + ops pixels + blur.
    const serverUp = await serverProcessUp().catch(() => false);
    if (serverUp && (hasFilter || delegatePortrait)) {
      items = await serverRenderPack(raw, W, H, animationEngine, hasFilter, portraitRequested);
      // Le masque MediaPipe est plus précis que l'ovale serveur : il remplace
      // toujours la variante Portrait renvoyée par le serveur.
      if (portraitRequested && hasMask) {
        items = items.filter((it) => it.label !== "Portrait");
        const portraitCanvas = cloneCanvas(raw);
        const portrait = await portraitBlur(portraitCanvas, W, H, animationEngine);
        if (portrait?.blob) items.push({ blob: portrait.blob, label: "Portrait" });
      } else if (portraitRequested && !items.some((it) => it.label === "Portrait")) {
        // Compatibilité avec un serveur ancien ou une réponse partielle :
        // on ne laisse jamais un pack Portrait sans sa variante Portrait.
        const portraitCanvas = cloneCanvas(raw);
        const portrait = await portraitBlur(portraitCanvas, W, H, animationEngine);
        if (portrait?.blob) items.push({ blob: portrait.blob, label: "Portrait" });
      }
    }
    if (!items.length || (portraitRequested && !items.some((it) => it.label === "Portrait"))) {
      // 3) Fallback local (serveur KO, ou rien à déléguer) : pipeline d'origine.
      // Complète uniquement les variantes manquantes : une réponse serveur
      // partielle ne doit jamais dupliquer l'Original ou le Filtre.
      if (!items.some((it) => it.label === "Original")) {
        const originalCanvas = cloneCanvas(raw);
        const original = await finalizeCanvas(originalCanvas, W, H, animationEngine);
        if (original) items.push({ blob: original, label: "Original" });
      }
      // Filtre : même frame + les ops du filtre couleur choisi
      if (hasFilter && !items.some((it) => it.label === filter.name)) {
        const fCanvas = cloneCanvas(raw);
        const fctx = fCanvas.getContext("2d", { willReadFrequently: true });
        const imageData = fctx.getImageData(0, 0, W, H);
        applyPixelFilter(imageData, state.photoFilterId);
        fctx.putImageData(imageData, 0, 0);
        const filtered = await finalizeCanvas(fCanvas, W, H, animationEngine);
        if (filtered) items.push({ blob: filtered, label: filter.name });
      }
      // Portrait : flou d'arrière-plan (segmentation ou fallback centré).
      // Même sans détection au dernier tick, le mode Portrait produit un rendu.
      if (portraitRequested && !items.some((it) => it.label === "Portrait")) {
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
  if (count === 1) {
    const result = await captureSingle();
    // v124.0.7 — cache le GIF incitatif après la 1ère capture (localStorage)
    hideShutterHintGif();
    return result;
  }
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
    if (items.length) {
      await showResult(items);
      resetLiveEffectsAfterCapture();
    }
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
    await showResult(items);
    if (!state.captureBatchActive) resetLiveEffectsAfterCapture();
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
    await showResult(items);
    if (!state.captureBatchActive) resetLiveEffectsAfterCapture();
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
    const maskFaces = (state.faces && state.faces.length) ? state.faces : (state.face ? [state.face] : []);
    const videoW = video.videoWidth || W, videoH = video.videoHeight || H;
    for (let fi = 0; fi < maskFaces.length; fi++) {
      const f = maskFaces[fi];
      if (f && f.length > 30) {
        // Le contexte est déjà miroir pour la caméra frontale : on projette
        // le crop sans miroir, puis scale(-1,1) retourne le lens avec l'image.
        const projected = mapFaceToCover(f, W, H, videoW, videoH, false);
        drawMask(ctx, W, H, projected, accessory.mask, fi, state.faceMatrix);
      }
    }
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
  if (!skipFrame) drawCustomOverlays(ctx, W, H);
}

/* Logo MomentoBooth : optionnel, discret et désactivé par défaut. */
let _logoImagePromise = null;
function loadLogoImage() {
  if (state.logoImage) return Promise.resolve(state.logoImage);
  if (_logoImagePromise) return _logoImagePromise;
  _logoImagePromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { state.logoImage = image; resolve(image); };
    image.onerror = () => { _logoImagePromise = null; resolve(null); };
    image.src = `/icons/logo-trim.png?v=${APP_VERSION}`;
  });
  return _logoImagePromise;
}
function drawLogo(ctx, W, H) {
  if (!state.logoEnabled || !state.logoImage || !W || !H) return;
  const size = Math.max(44, Math.round(Math.min(W, H) * 0.115));
  const margin = Math.max(14, Math.round(size * 0.2));
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(state.logoImage, W - size - margin, H - size - margin, size, size);
  ctx.restore();
}
async function ensureLogoForCapture() {
  if (!state.logoEnabled) return true;
  const image = await loadLogoImage();
  if (image) return true;
  state.logoEnabled = false;
  syncPreferenceControls();
  savePreferences();
  toast("Logo indisponible — vérifiez la connexion");
  return false;
}
function drawCustomOverlays(ctx, W, H) {
  if (!state.customFrameImage && !state.customBorderImage) return;
  ctx.save();
  if (state.customFrameImage) ctx.drawImage(state.customFrameImage, 0, 0, W, H);
  if (state.customBorderImage) ctx.drawImage(state.customBorderImage, 0, 0, W, H);
  ctx.restore();
}

/* Canvas brut haute qualité : vidéo + filtre + masque + fond (SANS cadre/logo).
   `opts.skipFilter` omet le filtre couleur (pour l'Original du pack lens) tout
   en conservant accessoires, masque et fond. Utilisé par le pack, la RAFALE
   et les captures simples. */
function grabFrameCanvas(maxDimension = null, opts = {}) {
  if (state.remoteCamMode === "controller" && state._remoteCaptureCanvas) {
    const c = state._remoteCaptureCanvas;
    state._remoteCaptureCanvas = null;
    return Promise.resolve(c);
  }
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
              const projected = mapFaceToCover(state.face, W, H, video.videoWidth || W, video.videoHeight || H, false);
              drawMask(ctx, W, H, projected, compositeAccessory.mask, 0, state.faceMatrix);
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
      drawCustomOverlays(ctx, W, H);
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

function drawMaskCover(ctx, mask, W, H) {
  const targetRatio = W / H;
  const maskRatio = mask.width / mask.height;
  let sx = 0, sy = 0, sw = mask.width, sh = mask.height;
  if (maskRatio > targetRatio) {
    sw = mask.height * targetRatio;
    sx = (mask.width - sw) / 2;
  } else {
    sh = mask.width / targetRatio;
    sy = (mask.height - sh) / 2;
  }
  ctx.drawImage(mask, sx, sy, sw, sh, 0, 0, W, H);
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
  // La vidéo et son alpha reçoivent le même recadrage cover. Le miroir est
  // appliqué aux deux sources pour garder le masque aligné en selfie.
  if (state.facing === "user") { cctx.translate(W, 0); cctx.scale(-1, 1); }
  cctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  cctx.globalCompositeOperation = "destination-in";
  drawMaskCover(cctx, mask, W, H);
  cctx.globalCompositeOperation = "source-over";
  ctx.drawImage(cut, 0, 0);
  return true;
}

/* Flou portrait à partir d'un CANVAS (pas de la vidéo live) — réutilisé par
   la RAFALE pour flouter la meilleure frame (au lieu d'une autre capture). */
function portraitBlur(net, W, H, animationEngine = state.animationEngine) {
  return new Promise((resolve) => {
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
        // Même recadrage cover que drawVideoFrame/drawSegmented : le masque
        // MediaPipe reste collé au sujet sur les flux 4:3 et 16:9.
        drawMaskCover(mctx, mask, W, H);
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
        drawCustomOverlays(octx, W, H);
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

  // Fallback : sujet net sur fond flou. Si les landmarks manquent, on
  // conserve un portrait distinct grâce à une zone centrale progressive ;
  // la variante n'est donc jamais supprimée silencieusement.
  let cx = W / 2, cy = H * .40, rw = W * .58, rh = H * .72;
  if (state.face && state.face.length > 30) {
    const box = faceBox(state.face, W, H, camera.videoWidth || 1280, camera.videoHeight || 960);
    cx = state.facing === "user" ? W - (box.x + box.w / 2) : box.x + box.w / 2;
    cy = box.y + box.h / 2;
    rw = box.w * 1.85;
    rh = box.h * 2.05;
  }
  const bctx = blurBase.getContext("2d");
  bctx.save();
  bctx.beginPath();
  bctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
  bctx.clip();
  bctx.drawImage(net, 0, 0);
  bctx.restore();
    // Même fallback que la segmentation : cadre, logo et animation restent nets.
    const bctxFinal = blurBase.getContext("2d");
    drawFrame(bctxFinal, W, H, state.frameId, state.frameText);
    drawLogo(bctxFinal, W, H);
    drawCustomOverlays(bctxFinal, W, H);
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
const _serverPing = { at: 0, up: null, probe: null };
let _serverProcessLastFailure = "";
const SERVER_PING_OK_TTL = 30_000;
const SERVER_PING_FAIL_TTL = 2_500;

/* Sonde courte et dédupliquée du serveur de traitement.
   Modal peut démarrer à froid : un échec ne doit jamais geler l'application
   pendant 30 secondes ni supprimer le GIF de la capture suivante. */
async function serverProcessUp() {
  const now = performance.now();
  const ttl = _serverPing.up === true ? SERVER_PING_OK_TTL : SERVER_PING_FAIL_TTL;
  if (_serverPing.at && now - _serverPing.at < ttl) return _serverPing.up === true;
  if (_serverPing.probe) return _serverPing.probe;
  _serverPing.probe = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("/api/process/ping", { method: "GET", signal: controller.signal, cache: "no-store" });
      _serverPing.up = res.ok;
    } catch {
      _serverPing.up = false;
    } finally {
      clearTimeout(timer);
      _serverPing.at = performance.now();
      _serverPing.probe = null;
    }
    return _serverPing.up === true;
  })();
  return _serverPing.probe;
}

function serverProcessMarkDown() {
  _serverPing.at = performance.now();
  _serverPing.up = false;
  // Un échec réseau est réessayable rapidement : ne conserve pas une promesse
  // terminée et ne bloque pas la prochaine capture sur un vieux statut.
  _serverPing.probe = null;
}

/* POST multipart vers /api/process/* : renvoie la réponse ou null (serveur KO). */
async function serverProcessPost(pathname, entries, timeoutMs = 20000) {
  _serverProcessLastFailure = "";
  const operation = telemetry.startNetwork(pathname, "POST");
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
    telemetry.finishNetwork(operation, { status: res.status, serverTs: Number(res.headers.get("x-mb-server-ts")) || null });
    // Un HTTP 4xx/5xx (frame corrompue, fichier trop gros…) ne veut PAS dire
    // que le serveur est injoignable : on garde la délégation active et on
    // laisse l'appelant retomber sur le traitement local pour cette fois.
    if (!res.ok) {
      _serverProcessLastFailure = `http-${res.status}`;
      return null;
    }
    return res;
  } catch (error) {
    // Seule une erreur réseau (abort/TypeError) marque le serveur indisponible.
    telemetry.finishNetwork(operation, { error: error?.name || "network" });
    _serverProcessLastFailure = "network";
    serverProcessMarkDown();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Convertit un canvas en JPEG Blob (pour l'upload). */
function canvasToJpegBlob(canvas, quality = 0.72, kind = "jpeg") {
  return telemetry.measureBlob(canvas, quality, kind);
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
async function serverRenderPack(raw, W, H, animationEngine, hasFilter, portraitRequested) {
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
    drawCustomOverlays(bctx, W, H);
    if (animationEngine) animationEngine.drawStatic(bctx, W, H);
    const baseJpeg = await canvasToJpegBlob(base, 0.92);
    releaseCanvas(base);
    if (!baseJpeg) return [];
    const filter = activePhotoFilter();
    const ops = hasFilter && filter ? JSON.stringify(filter.ops) : "[]";
    let faceBoxPayload = "";
    const canPortrait = Boolean(state.face && state.face.length > 30);
    if (canPortrait) {
      // Reprend la bbox locale puis applique le miroir caméra frontale.
      // Sans bbox, le serveur reçoit portrait=1 et utilise son fallback centré.
      const box = faceBox(state.face, W, H, camera.videoWidth || 1280, camera.videoHeight || 960);
      let bx = box.x, by = box.y;
      if (state.facing === "user") bx = W - (box.x + box.w);
      bx = Math.max(0, Math.round(bx));
      by = Math.max(0, Math.round(by));
      const bw = Math.max(24, Math.round(Math.min(box.w, W - bx)));
      const bh = Math.max(24, Math.round(Math.min(box.h, H - by)));
      faceBoxPayload = JSON.stringify({ x: bx, y: by, w: bw, h: bh });
    }
    const res = await serverProcessPost("/api/process/pack", [
      ["frame", baseJpeg, "frame.jpg"],
      ["filterOps", ops],
      ["faceBox", faceBoxPayload],
      ["portrait", portraitRequested ? "1" : "0"],
      // Qualité JPEG serveur : le numéro de version était codé ici par erreur
      // (résidu des bumps v104→v105→v106) — le serveur clampait silencieusement
      // à 97. On repasse sur une vraie qualité : 92 en standard, 95 en 4K.
      ["quality", state.qualityMax ? "95" : "92"],
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
          // Une première sonde peut tomber pendant le cold start Modal. On
          // laisse une courte fenêtre de reprise avant d'abandonner le GIF.
          let serverReady = await serverProcessUp();
          if (!serverReady) {
            await new Promise((resolve) => setTimeout(resolve, 750));
            // Force une nouvelle requête après le délai : le cache d'échec
            // court ne doit pas transformer ce retry en simple relecture.
            _serverPing.at = 0;
            serverReady = await serverProcessUp();
          }
          if (serverReady) {
            let gif = await serverEncodeGif(frames, W, H, 140);
            // Le serveur peut être monté entre le ping et le POST : retente
            // une seule fois, sans refaire de boucle infinie ni chauffer le
            // téléphone avec un encodeur local.
            if (!gif && _serverProcessLastFailure === "network") {
              await new Promise((resolve) => setTimeout(resolve, 500));
              _serverPing.at = 0;
              if (await serverProcessUp()) gif = await serverEncodeGif(frames, W, H, 140);
            }
            if (gif) { finish(gif); return; }
          }
        } catch { /* serveur indisponible */ }
        // Le GIF reste délégué à Modal : aucun encodeur lourd local ne revient
        // sur l'iPhone. Le message distingue une panne réseau d'un fichier
        // refusé par l'API pour ne plus accuser à tort le serveur.
        toast(_serverProcessLastFailure === "network"
          ? "GIF indisponible : serveur momentanément hors ligne"
          : "GIF indisponible : réessayez la prise");
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

/* Emojis par visage (OPT-IN, désactivé par défaut) : le serveur reçoit la
   photo finale + les boîtes des visages détectés par MediaPipe et renvoie un
   emoji stable par personne. On les dessine en petit à côté de chaque tête,
   sur les variantes photos (jamais sur le GIF). Heuristique gratuite. */
let _emojiDecorationBusy = false;
function blobDimensions(blob) {
  return new Promise((resolve) => {
    try {
      const image = new Image();
      image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(image.src), 4000);
    } catch { resolve(null); }
  });
}
async function decorateItemsWithFaceEmojis(items, W, H) {
  if (!state.emojiFacesEnabled || _emojiDecorationBusy) return items;
  const photoItems = items.filter((it) => !it.gif && it.blob);
  const faces = Array.isArray(state.faces) ? state.faces.filter((f) => f && f.length >= 30) : [];
  if (!photoItems.length || !faces.length) return items;
  try {
    const boxes = faces.map((f) => {
      const b = faceBox(f, W, H, camera.videoWidth || 1280, camera.videoHeight || 960);
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
    });
    if (!(await serverProcessUp())) return items;
    const form = new FormData();
    form.append("frame", photoItems[0].blob, "frame.jpg");
    form.append("faces", JSON.stringify(boxes));
    const res = await fetch("/api/process/emojis", { method: "POST", body: form });
    if (!res.ok) return items;
    const data = await res.json();
    const emojis = (data.faces || []).filter((f) => f && f.emoji);
    if (!emojis.length) return items;
    _emojiDecorationBusy = true;
    const draw = (ctx, f) => {
      const size = Math.max(26, Math.round(f.h * 0.42));
      const x = Math.min(W - size, Math.max(0, f.x + f.w + Math.round(f.w * 0.06)));
      const y = Math.max(0, f.y + Math.round(f.h * 0.1));
      ctx.save();
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 6;
      ctx.fillText(f.emoji, x, y);
      ctx.restore();
    };
    await Promise.all(photoItems.map(async (item) => {
      try {
        const bmp = await createImageBitmap(item.blob);
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bmp, 0, 0, W, H);
        bmp.close?.();
        emojis.forEach((f) => draw(ctx, f));
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        releaseCanvas(canvas);
        if (blob) item.blob = blob;
      } catch { /* garde la photo non décorée */ }
    }));
  } catch { /* serveur indisponible : la capture reste normale */ }
  finally { _emojiDecorationBusy = false; }
  return items;
}

async function showResult(items) {
  if (!items || !items.length) { toast("Capture impossible"); return; }
  if (state.captureBatchActive) {
    state.captureBatchItems.push(...items.filter((item) => item?.blob));
    return;
  }
  // Emojis par visage (OPT-IN) : décoration UNE seule fois, sur l'affichage
  // final (jamais pendant une série), et state.latestPhoto reprend les blobs
  // décorés pour que le partage/téléchargement garde les emojis.
  if (state.emojiFacesEnabled) {
    const probe = items.find((it) => !it.gif && it.blob);
    if (probe) {
      try {
        const dims = await blobDimensions(probe.blob);
        if (dims) items = await decorateItemsWithFaceEmojis(items, dims.w, dims.h);
      } catch { /* décoration optionnelle */ }
    }
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
      // Deep link WhatsApp : ouvre l'app si installée, fallback sur web.
      // wa.me fonctionne sur iOS (Universal Link) et Android (Intent).
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "WhatsApp ouvert ✓";
    } else if (method === "snapchat") {
      // v122.1 : on tente d'abord le scheme snapchat:// (iOS/Android),
      // puis navigator.share (qui liste Snap dans la feuille système),
      // puis clipboard fallback.
      const snapUrl = `snapchat://camera?stickerUrl=${encodeURIComponent(publicUrl)}`;
      let opened = false;
      try {
        // Certains navigateurs bloquent les URL schemes depuis JS ;
        // on tente quand même, le fallback rattrape l'échec.
        const w = window.open(snapUrl, "_blank");
        if (w) opened = true;
      } catch (_) { /* ignoré */ }
      if (opened) {
        status.textContent = "Snapchat ouvert ✓";
      } else if (navigator.share) {
        try {
          await navigator.share({ title: "MomentoBooth", text, url: publicUrl });
          status.textContent = "Snap ouvert ✓";
        } catch (e) { status.textContent = "Partage annulé"; }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
        status.textContent = "Lien copié — collez dans Snap 📋";
      } else {
        status.textContent = "Ouvrez Snap et collez le lien";
      }
    } else if (method === "sms") {
      // SMS deep link : ouvre l'app Messages native.
      // Les paramètres body= et ?body= sont supportés par iOS et Android.
      window.open(`sms:?body=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "SMS ouvert ✓";
    } else if (method === "email") {
      window.open(`mailto:?subject=${encodeURIComponent("Ma photo MomentoBooth")}&body=${encodeURIComponent(text + " " + publicUrl)}`, "_blank");
      status.textContent = "Email ouvert ✓";
    } else if (method === "download") {
      if (!state.latestPhoto) { status.textContent = "Pas de photo"; return; }
      const url = URL.createObjectURL(state.latestPhoto);
      const a = document.createElement("a");
      a.href = url;
      a.download = `momentobooth-${Date.now()}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Téléchargé ✓";
    } else if (method === "qrcode") {
      $("share-qr-box").classList.remove("hidden");
      $("share-qr").src = `/api/qr?url=${encodeURIComponent(publicUrl)}`;
      status.textContent = "QR affiché — scannez pour la photo";
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
      mediaType: metadata.mediaType || (blob.type === "image/gif" ? "gif" : "photo"),       label: metadata.label || "Photo",
       ...(metadata.serverId ? { serverId: metadata.serverId } : {}),
       ...(metadata.deleteToken ? { deleteToken: metadata.deleteToken } : {}),
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
// Expose pour les modules lazy (idle-wall) qui ont besoin de la pool
// photo locale sans dupliquer la logique IndexedDB.
window.mbLoadLocal = loadLocal;
async function setLocalServerId(localId, serverId, deleteToken = "") {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("photos", "readwrite");
      const store = tx.objectStore("photos");
      const req = store.get(localId);
      req.onsuccess = () => {
        if (req.result) {
          const next = { ...req.result, serverId };
          if (deleteToken) next.deleteToken = deleteToken;
          else delete next.deleteToken;
          store.put(next);
        }
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
      await setLocalServerId(id, data.id, data.deleteToken || "");
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
    $("share-status").textContent = gifItems[0] ? "Photo et GIF enregistrés ✓" : "Photo enregistrée ✓";
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
  guestShareTrap.onOpen();
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
      refreshTabletQr();
      guestShareStatus(`Lien actif jusqu’au ${new Date(saved.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`);
      startGuestLivePublisher();
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
  guestShareTrap.onClose();
}
/* ---------- Corbeille : réservée à l'organisateur (code vérifié côté
   serveur), permet de voir/restaurer/purger ce que la galerie a supprimé. ---------- */
async function openTrashPanel() {
  const authorized = await requestOrganizerAccess("Code organisateur pour ouvrir la corbeille :");
  if (!authorized) return;
  const panel = $("trash-panel");
  if (!panel) return;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  trashPanelTrap.onOpen();
  await loadTrashItems();
}
function closeTrashPanel() {
  const panel = $("trash-panel");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  trashPanelTrap.onClose();
}
async function loadTrashItems() {
  const grid = $("trash-grid");
  if (!grid) return;
  grid.innerHTML = '<div class="mb-loading-block"><div class="mb-spinner" role="status" aria-label="Chargement de la corbeille"></div>Chargement…</div>';
  const session = loadOrganizerSession();
  if (!session) { closeTrashPanel(); return; }
  let items = [];
  try {
    const response = await fetch("/api/photos/trash", { headers: { "x-organizer-token": session.token }, cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    items = (await response.json()).photos ?? [];
  } catch {
    grid.innerHTML = '<div class="trash-empty">Corbeille indisponible — vérifiez la connexion au serveur.</div>';
    return;
  }
  if (!items.length) { grid.innerHTML = '<div class="trash-empty">La corbeille est vide.</div>'; return; }
  grid.innerHTML = "";
  for (const item of items) {
    const cell = document.createElement("div");
    cell.className = "trash-item";
    const img = document.createElement("img");
    img.src = item.url;
    img.alt = "";
    img.loading = "lazy";
    const actions = document.createElement("div");
    actions.className = "trash-item-actions";
    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button"; restoreBtn.className = "trash-restore"; restoreBtn.textContent = "Restaurer";
    restoreBtn.addEventListener("click", () => void restoreTrashItem(item.id));
    const purgeBtn = document.createElement("button");
    purgeBtn.type = "button"; purgeBtn.className = "trash-purge"; purgeBtn.textContent = "Effacer";
    purgeBtn.addEventListener("click", () => void purgeTrashItem(item.id));
    actions.append(restoreBtn, purgeBtn);
    cell.append(img, actions);
    grid.appendChild(cell);
  }
}
async function restoreTrashItem(id) {
  const session = loadOrganizerSession();
  if (!session) return;
  try {
    const response = await fetch(`/api/photos/${encodeURIComponent(id)}/restore`, {
      method: "POST", headers: { "x-organizer-token": session.token },
    });
    if (!response.ok) throw new Error();
    toast("Photo restaurée dans la galerie");
    await loadTrashItems();
    if ($("screen-gallery")?.classList.contains("active")) void renderGallery();
  } catch { toast("Restauration impossible"); }
}
async function purgeTrashItem(id) {
  const session = loadOrganizerSession();
  if (!session) return;
  if (!confirm("Effacer définitivement cette photo ? Impossible à annuler.")) return;
  try {
    const response = await fetch(`/api/photos/${encodeURIComponent(id)}/purge`, {
      method: "DELETE", headers: { "x-organizer-token": session.token },
    });
    if (!response.ok) throw new Error();
    toast("Photo effacée définitivement");
    await loadTrashItems();
  } catch { toast("Suppression définitive impossible"); }
}
function guestShareStatus(message) {
  const el = $("guest-share-status");
  if (el) el.textContent = message;
}
function refreshGalleryQR() {
  const img = $("gallery-qr-image");
  const url = `${location.origin}/api/gallery`;
  if (img) img.src = `/api/qr?url=${encodeURIComponent(url)}`;
}
function guestQrUrl(url) {
  return `/api/qr?url=${encodeURIComponent(url)}`;
}
function refreshTabletQr() {
  try {
    const saved = JSON.parse(localStorage.getItem("momentobooth-guest-session") || "null");
    const image = $("tablet-qr-image");
    const ready = Boolean(saved?.url && saved?.token && Date.now() < Number(saved.expiresAt || 0));
    if (image && ready) {
      image.src = guestQrUrl(saved.url);
      document.body.classList.add("guest-qr-ready");
    } else {
      document.body.classList.remove("guest-qr-ready");
    }
  } catch {
    document.body.classList.remove("guest-qr-ready");
  }
}

let _guestLinkBusy = false;
async function createGuestLink() {
  if (_guestLinkBusy) return;
  _guestLinkBusy = true;
  const button = $("guest-create-link");
  const originalLabel = button?.textContent ?? "";
  if (button) { button.disabled = true; button.innerHTML = '<span class="mb-spinner small" role="status" aria-label="Création en cours"></span>'; }
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
    refreshTabletQr();
    document.body.classList.add("guest-qr-ready");
    guestShareStatus(`Lien actif jusqu’au ${new Date(data.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`);
    startGuestLivePublisher();
  } catch {
    guestShareStatus("Impossible de créer le lien. Vérifiez la connexion du serveur.");
  } finally {
    _guestLinkBusy = false;
    if (button) { button.disabled = false; button.textContent = originalLabel || "Créer le QR + lien"; }
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
      const blob = await canvasToJpegBlob(canvas, 0.62, "guest-live");
      if (!blob) return;
      const frameId = telemetry.recordFrame("guest-live", { width: canvas.width, height: canvas.height, sizeBytes: blob.size });
      const form = new FormData();
      form.append("frame", blob, "preview.jpg");
      const response = await remoteFetch(`/api/guest/${encodeURIComponent(state.guestToken)}/live`, {
        method: "POST",
        headers: {
          "x-guest-host-key": state.guestHostKey,
          "x-mb-session-id": telemetry.sessionId,
          "x-mb-frame-id": frameId,
        },
        body: form,
      }, 1500);
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
  // ~3 fps : vrai aperçu continu MJPEG, cadence plafonnée pour préserver
  // la batterie et éviter de chauffer l'iPhone.
  state.guestLiveTimer = setInterval(publish, 360);
}
async function loadGuestGallery(token) {
  const grid = $("guest-gallery-grid");
  if (!grid) return false;
  try {
    const response = await remoteFetch(`/api/guest/${encodeURIComponent(token)}/gallery`, { cache: "no-store" }, 4500);
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
  if (!image || !empty || !status) return;
  let active = true;
  let reconnectTimer = null;
  let firstFrameTimer = null;
  let fallbackTimer = null;
  let fallbackStarted = false;
  let fallbackObjectUrl = "";
  let streamPending = false;
  const streamUrl = `/api/guest/${encodeURIComponent(token)}/live/stream?client=${Date.now()}`;
  const setState = (label, live) => {
    status.textContent = label;
    if (live) { image.classList.remove("hidden"); empty.classList.add("hidden"); }
  };
  const stopFallback = () => {
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
  };
  const stopTimers = (keepFallback = false) => {
    clearTimeout(reconnectTimer);
    clearTimeout(firstFrameTimer);
    if (!keepFallback) stopFallback();
  };
  const startFallback = () => {
    if (fallbackStarted || !active) return;
    fallbackStarted = true;
    let busy = false;
    const poll = async () => {
      if (!active || busy || document.hidden) return;
      busy = true;
      try {
        const response = await remoteFetch(`/api/guest/${encodeURIComponent(token)}/live?t=${Date.now()}`, { cache: "no-store" }, 4500);
        if (response.status === 200) {
          const blob = await response.blob();
          telemetry.emit("frame-receive", {
            channel: "guest-live",
            frameId: response.headers.get("x-mb-frame-id") || null,
            sourceSessionId: response.headers.get("x-mb-source-session-id") || null,
            bytes: blob.size,
          });
          if (!active || document.hidden) return;
          const nextUrl = URL.createObjectURL(blob);
          if (!active || document.hidden) {
            URL.revokeObjectURL(nextUrl);
            return;
          }
          const old = fallbackObjectUrl;
          fallbackObjectUrl = nextUrl;
          image.src = fallbackObjectUrl;
          setState("Aperçu de secours", true);
          if (old) URL.revokeObjectURL(old);
        } else if (response.status === 404) {
          active = false;
          stopFallback();
          setState("Lien expiré", false);
        } else setState("En attente…", false);
      } catch { setState("Hors connexion", false); }
      finally { busy = false; }
    };
    void poll();
    fallbackTimer = setInterval(poll, 1800);
  };
  const connect = () => {
    if (!active || document.hidden) return;
    // Si le fallback est déjà actif, une nouvelle tentative MJPEG ne doit
    // pas le couper : il reste visible pendant toute la reconnexion.
    const preservingFallback = fallbackStarted;
    stopTimers(preservingFallback);
    fallbackStarted = preservingFallback;
    streamPending = true;
    setState("Connexion vidéo…", false);
    let gotFirstFrame = false;
    image.onload = () => {
      // Le même <img> sert au MJPEG et au fallback blob : un blob chargé ne
      // doit jamais être interprété comme la première frame du flux continu.
      if (!streamPending) return;
      streamPending = false;
      gotFirstFrame = true;
      clearTimeout(firstFrameTimer);
      stopFallback();
      fallbackStarted = false;
      if (fallbackObjectUrl) { URL.revokeObjectURL(fallbackObjectUrl); fallbackObjectUrl = ""; }
      setState("En direct", true);
    };
    const fallbackFromStream = () => {
      if (!active) return;
      streamPending = false;
      image.removeAttribute("src");
      clearTimeout(reconnectTimer);
      if (gotFirstFrame) {
        // Une coupure après un flux déjà établi doit reconnecter le vrai
        // MJPEG, pas rester figée sur la dernière image reçue.
        setState("Reconnexion…", false);
        reconnectTimer = setTimeout(connect, 1200);
        return;
      }
      setState("Aperçu de secours…", false);
      startFallback();
      reconnectTimer = setTimeout(connect, 5000);
    };
    image.onerror = () => {
      if (!active) return;
      setState("Reconnexion…", false);
      fallbackFromStream();
    };
    image.src = `${streamUrl}&retry=${Date.now()}`;
    // Si le proxy ou la borne n'envoie aucune première image, ne laisse pas
    // l'invité bloqué indéfiniment sur « Connexion vidéo… ».
    firstFrameTimer = setTimeout(fallbackFromStream, 4500);
  };
  connect();
  const onVisibility = () => {
    if (document.hidden) {
      image.removeAttribute("src");
      if (fallbackObjectUrl) { URL.revokeObjectURL(fallbackObjectUrl); fallbackObjectUrl = ""; }
      stopTimers();
    } else connect();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", connect, { once: false });
  window.addEventListener("pagehide", () => {
    active = false;
    stopTimers();
    document.removeEventListener("visibilitychange", onVisibility);
    streamPending = false;
    image.removeAttribute("src");
    if (fallbackObjectUrl) { URL.revokeObjectURL(fallbackObjectUrl); fallbackObjectUrl = ""; }
  }, { once: true });
}
async function initGuestMode() {
  const token = new URLSearchParams(location.search).get("guest") || location.pathname.match(/^\/guest\/([A-Za-z0-9_-]{32,80})$/)?.[1];
  if (!token || !screens.guest) return false;
  screens.capture.classList.remove("active");
  screens.result.classList.remove("active");
  screens.gallery.classList.remove("active");
  screens.guest.classList.add("active");
  document.body.classList.add("guest-mode");
  telemetry.startupMark("firstInteractive");
  // Le premier affichage reste non bloquant : une galerie lente ne doit pas
  // laisser l'écran invité sous le splash.
  hideSplash();
  void loadGuestGallery(token).catch(() => {});
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
  return true;
}

/* =========================================================
   RÔLE DE L'APPAREIL — choix explicite au démarrage
   ========================================================= */
const DEVICE_ROLES = {
  camera: { label: "Caméra", description: "Cet appareil filme et publie sa vue." },
  interface: { label: "Interface", description: "Cet appareil contrôle une caméra distante." },
  mixed: { label: "Mixte", description: "Caméra locale + connexions distantes disponibles." },
};
let _selectedDeviceRole = "mixed";
let _roleGatePromise = null;

function roleFromUrl() {
  const params = new URLSearchParams(location.search);
  const requested = params.get("role");
  if (["camera", "interface", "mixed"].includes(requested)) return requested;
  // Un lien généré par une caméra contient déjà son token : proposer
  // directement Interface évite une mauvaise demande de permission sur tablette.
  return params.get("remote") ? "interface" : null;
}

function remoteTokenFromUrl() {
  return (new URLSearchParams(location.search).get("remote") || "").trim();
}

function updateRoleGateSelection(role) {
  if (!DEVICE_ROLES[role]) role = "mixed";
  _selectedDeviceRole = role;
  document.querySelectorAll("#role-gate .role-option").forEach((button) => {
    const active = button.dataset.role === role;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const remoteFields = $("role-remote-fields");
  const tokenInput = $("role-remote-token");
  const status = $("role-gate-status");
  const needsToken = role === "interface";
  remoteFields?.classList.toggle("hidden", !needsToken);
  if (tokenInput && !tokenInput.value) tokenInput.value = remoteTokenFromUrl() || (state.remoteCamMode === "controller" ? state.remoteCamToken : "");
  // BUG-1.3 — Auto-presse-papier pour pré-remplir le token caméra.
  if (needsToken && tokenInput && !tokenInput.value) {
    navigator.clipboard?.readText?.().then((text) => {
      if (tokenInput && !tokenInput.value && /^[A-Z0-9]{6,}$/i.test(text)) tokenInput.value = text;
    }).catch(() => {});
    tokenInput.setAttribute("placeholder", "Code caméra ou coller ici");
  }
  if (status) status.textContent = needsToken ? "Touchez une caméra ci-dessous ou entrez le code" : "";
  // Sélection d'appareil : dès que le rôle Interface est actif dans le gate,
  // on découvre les caméras pour un appui direct (le code reste en secours).
  if (needsToken && $("role-gate")?.classList.contains("open")) {
    startCameraDiscovery((cameraId, cameraName) => {
      const finish = _roleGateFinish;
      connectToCamera(cameraId, cameraName, (token) => {
        if (finish) finish("interface", token);
        else connectRemoteCamera(token);
      }, (text) => { const statusEl = $("role-gate-status"); if (statusEl) statusEl.textContent = text; });
    });
  } else {
    stopCameraDiscovery();
  }
}

function showRoleGate() {
  const gate = $("role-gate");
  if (!gate) return;
  // v124.0.10 — assigner _roleGateFinish au boot (sinon click sur
  // Caméra/Mixte appelle un finish=null → TypeError → Safari crash).
  if (!_roleGateFinish) {
    _roleGateFinish = (role, token) => {
      _roleGateFinish = null;
      setDeviceRole(role, token);
      hideRoleGate();
    };
  }
  // v124.0.9 — si l'URL force un rôle (?role=mixed/camera/interface),
  // on l'applique directement sans afficher la modale (évite un crash
  // Safari iOS où le click sur la modale déclenche un recovery).
  const urlRole = new URLSearchParams(location.search).get("role");
  if (urlRole && ["camera", "interface", "mixed"].includes(urlRole)) {
    state.deviceRole = urlRole;
    window.mbDeviceRole = urlRole;
    document.body.dataset.deviceRole = urlRole;
    if (typeof setDeviceRole === "function") setDeviceRole(urlRole);
    if (typeof hideRoleGate === "function") hideRoleGate();
    return;
  }
  gate.classList.add("open");
  gate.setAttribute("aria-hidden", "false");
  telemetry.startupMark("firstInteractive");
  const requested = roleFromUrl() || state.deviceRole || "mixed";
  updateRoleGateSelection(requested);
  $("role-remember") && ($("role-remember").checked = state.roleRemember !== false);
}

function hideRoleGate() {
  const gate = $("role-gate");
  if (!gate) return;
  stopCameraDiscovery();
  _roleGateFinish = null;
  gate.classList.remove("open");
  gate.setAttribute("aria-hidden", "true");
}

function setDeviceRole(role, token = "") {
  state.deviceRole = DEVICE_ROLES[role] ? role : "mixed";
  state.roleRemember = Boolean($("role-remember")?.checked);
  window.mbDeviceRole = state.deviceRole;
  document.body.dataset.deviceRole = state.deviceRole;
  const label = DEVICE_ROLES[state.deviceRole].label;
  const roleValue = $("settings-device-role");
  if (roleValue) roleValue.textContent = label;
  const roleStatus = $("device-role-status");
  if (roleStatus) {
    roleStatus.textContent = "";
    roleStatus.classList.add("hidden");
  }
  // Une caméra/interface précédente ne doit pas laisser un timer ou un
  // canvas fantôme lorsqu'on change de rôle après un rechargement.
  if (state.deviceRole === "interface") {
    const broadcastRow = $("set-remote-camera")?.closest(".settings-row");
    if (broadcastRow) broadcastRow.hidden = true;
    const previousRemoteMode = state.remoteCamMode;
    const previousRemoteToken = previousRemoteMode === "controller" ? state.remoteCamToken : "";
    stopRemotePublishing();
    if (previousRemoteMode === "camera") stopRemoteCamera();
    state.remoteCamMode = "off";
    state.remoteCamHostKey = "";
    camera.style.visibility = "hidden";
      const remoteToken = token.trim() || remoteTokenFromUrl() || previousRemoteToken;
    state.remoteCamToken = remoteToken;
    if (remoteToken) {
      void connectRemoteCamera(remoteToken);
    } else {
      const status = $("device-role-status");
      if (status) status.textContent = "";
    }
  } else {
    const broadcastRow = $("set-remote-camera")?.closest(".settings-row");
    if (broadcastRow) broadcastRow.hidden = false;
    camera.style.visibility = "visible";
    // En Mixte, une ancienne session distante mémorisée ne doit pas repartir
    // seule au démarrage et voler du CPU au preview local. La connexion reste
    // disponible via Réglages, mais devient explicitement opt-in.
    if (state.deviceRole === "mixed") {
      if (state.remoteCamMode === "camera") stopRemoteCamera();
      else if (state.remoteCamMode === "controller") disconnectRemoteCamera();
      state.cameraStopRequested = false;
    }
    // Caméra = publication automatique après l'ouverture locale.
    // Mixte = publication/connexion laissée aux commandes dédiées.
  }
  savePreferences();
}

function waitForDeviceRole() {
  if (_roleGatePromise) return _roleGatePromise;
  _roleGatePromise = new Promise((resolve) => {
    const gate = $("role-gate");
    if (!gate) { setDeviceRole(state.deviceRole || "mixed"); resolve(); return; }
    const finish = (role, token = "") => {
      clearTimeout(stuckTimer);
      _roleGateFinish = null;
      setDeviceRole(role, token);
      hideRoleGate();
      resolve();
      // Appel dans le même chemin d'événement que le bouton : Safari iOS
      // conserve ainsi le geste utilisateur pour getUserMedia().
      if (role !== "interface" && !state.stream) void startCamera();
    };
    _roleGateFinish = finish;
    // Filet de sécurité : si la recherche de caméra ne trouve rien pendant
    // longtemps, on l'affiche clairement plutôt que de choisir un rôle à la
    // place de la personne — un minuteur ne doit jamais masquer un blocage.
    const stuckTimer = setTimeout(() => {
      if ($("role-gate")?.classList.contains("open") && _selectedDeviceRole === "interface" && state.remoteConnectionState !== "connected") {
        const status = $("role-gate-status");
        if (status) status.textContent = "Aucune caméra trouvée pour l'instant. Vérifiez que l'iPhone est allumé et réglé sur Caméra, ou entrez le code affiché dessus.";
      }
    }, 20000);
    showRoleGate();
    // Le module a réellement initialisé le sélecteur : le secours inline ne
    // doit plus ajouter de handlers concurrents après ce point.
    window.__mbAppBooted = true;
    // v124.0.7 — si l'utilisateur a déjà pris une photo (session précédente), cacher le GIF d'emblée.
    try { if (localStorage.getItem("momentobooth-shutter-hint-seen")) hideShutterHintGif(); } catch {}
    window.dispatchEvent(new Event("mb-app-booted"));
    document.querySelectorAll("#role-gate .role-option").forEach((button) => {
      button.addEventListener("click", () => {
        const role = button.dataset.role;
        updateRoleGateSelection(role);
        unlockAudio();
        if (role !== "interface") {
          // Caméra / Mixte : aucun jumelage requis, un seul toucher suffit.
          finish(role, "");
          return;
        }
        // Interface : la recherche démarre immédiatement (déjà lancée par
        // updateRoleGateSelection) et se termine seule dès qu'une caméra est
        // trouvée ou qu'un code valide est saisi — aucune seconde validation.
        // Le minuteur d'alerte (20 s) reste actif pour prévenir si rien n'est
        // trouvé, au lieu de choisir un rôle à la place de la personne.
        const remembered = remoteTokenFromUrl() || (state.remoteCamMode === "controller" ? state.remoteCamToken : "");
        if (remembered) finish("interface", remembered);
      }, { once: false });
    });
    const tryAutoFinishToken = () => {
      const value = ($("role-remote-token")?.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (value.length === 6 && _selectedDeviceRole === "interface") finish("interface", value);
    };
    $("role-remote-token")?.addEventListener("input", () => { updateRoleGateSelection("interface"); tryAutoFinishToken(); });
    $("role-paste-token")?.addEventListener("click", async () => {
      try {
        const value = await navigator.clipboard.readText();
        if (value && $("role-remote-token")) $("role-remote-token").value = value.trim();
        updateRoleGateSelection("interface");
        tryAutoFinishToken();
      } catch { $("role-gate-status").textContent = "Collez le token dans le champ ci-dessus."; }
    });
  });
  return _roleGatePromise;
}

/* =========================================================
   CAMERA DEPORTEE — iPhone = camera, iPad = controle
   ========================================================= */
let _remoteCameraGeneration = 0;
let _remoteConnectGeneration = 0;
let _remotePubTimer = null;
let _remotePubBusy = false;
let _remotePubGeneration = 0;
let _remotePubResourceActive = false;
let _remotePubCanvasResourceActive = false;
let _remotePubCanvas = null;
let _remotePollTimer = null;
let _remotePollBusy = false;
let _remotePollGeneration = 0;
let _remotePollResourceActive = false;
let _remotePreviewCanvas = null;
let _remoteCommandResourceActive = false;
let _deviceAnnounceResourceActive = false;
let _pairRequestResourceActive = false;
let _cameraDiscoveryResourceActive = false;

/* ─── WebRTC peer-to-peer (signalisation via Socket.IO) ───
   Le flux caméra déportée peut passer par deux canaux :
     1. P2P via WebRTC (faible latence, pas de serveur dans la boucle pour les média)
     2. Polling JPEG via HTTP (fallback robuste si WebRTC indisponible / pair KO)
   Les deux pairs se connectent au même serveur Socket.IO qui ne fait que relayer
   les messages SDP/ICE. La caméra est l'offerer, l'interface est l'answerer. */
const WEBRTC_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
let _webrtcInitGeneration = 0; // borne toute tentative obsolète
let _webrtcOfferRetryTimer = null;
let _webrtcOfferRetries = 0;

function buildWebRtcSocket(auth) {
  // `io` est la globale posée par /socket.io/socket.io.js chargé dans index.html.
  // Si la lib n'est pas chargée (ex. PWA installée en mode offline au démarrage),
  // on renvoie null sans crash : le polling JPEG reste actif.
  /* global io */
  if (typeof io !== "function") return null;
  try {
    const socket = io({ auth, transports: ["websocket", "polling"], reconnection: true, timeout: 4000 });
    return socket;
  } catch {
    return null;
  }
}

function closeWebrtcPeer(reason) {
  // Nettoie toute la peer connection + socket sans casser le reste du state.
  // `reason` sert juste de log diagnostic.
  if (_webrtcOfferRetryTimer) { clearTimeout(_webrtcOfferRetryTimer); _webrtcOfferRetryTimer = null; }
  _webrtcOfferRetries = 0;
  try {
    if (state.webrtcPC) {
      try { state.webrtcPC.ontrack = null; state.webrtcPC.oniceconnectionstatechange = null; state.webrtcPC.onicecandidate = null; } catch {}
      try { state.webrtcPC.close(); } catch {}
    }
  } catch {}
  try {
    if (state.webrtcRemoteStream) {
      state.webrtcRemoteStream.getTracks?.().forEach((t) => { try { t.stop(); } catch {} });
    }
  } catch {}
  try { state.webrtcSocket?.disconnect(); } catch {}
  state.webrtcPC = null;
  state.webrtcSocket = null;
  state.webrtcRemoteStream = null;
  state.webrtcActive = false;
  state.webrtcPeerLeft = false;
  state.webrtcSignalingFailed = false;
  if (reason) console.debug("[MomentoBooth][webrtc] peer closed:", reason);
}

async function makeRtcPeerConnection(stream) {
  // Crée une RTCPeerConnection avec ICE servers publics. Si l'API n'est pas
  // dispo (vieux navigateur, contexte non secure), renvoie null — fallback polling.
  if (typeof RTCPeerConnection !== "function") return null;
  try {
    const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
    if (stream) {
      // Côté caméra : on publie la track vidéo locale.
      for (const track of stream.getTracks?.() || []) {
        try { pc.addTrack(track, stream); } catch {}
      }
    }
    return pc;
  } catch {
    return null;
  }
}

async function startRemoteCamera() {
  const generation = ++_remoteCameraGeneration;
  stopRemoteCommandPolling();
  state.remoteCamMode = "camera";
  state.remoteSessionState = "none";
  state.remoteConnectionState = "connecting";
  state.remoteLastFramePublishedAt = 0;
  state.remoteLastControllerSeenAt = 0;
  state.remoteFrameAgeMs = null;
  setRemoteConnectionStatus("connecting", "Connexion en préparation…");
  try {
    const res = await remoteFetch("/api/remote-camera/sessions", { method: "POST" }, 5000);
    if (!res.ok) throw new Error("session");
    const data = await res.json();
    if (generation !== _remoteCameraGeneration || state.remoteCamMode !== "camera") {
      // L’utilisateur a arrêté ou changé de rôle pendant le cold start :
      // ne ressuscite jamais une session distante devenue obsolète.
      void remoteFetch(`/api/remote-camera/${encodeURIComponent(data.token)}`, {
        method: "DELETE",
        headers: { "x-host-key": data.hostKey },
        keepalive: true,
      }, 1800).catch(() => {});
      return;
    }
    state.remoteCamToken = data.token;
    state.remoteCamHostKey = data.hostKey;
    state.remoteSessionState = "created";
    state.remoteCommandCursor = 0;
    showCameraPairing(data);
    $("set-remote-camera") && ($("set-remote-camera").checked = true);
    savePreferences();
    setRemoteConnectionStatus("connecting", "En attente de l'écran Interface");
    toast(`Code caméra : ${state.remotePairCode}`);
    try { await navigator.clipboard.writeText(state.remotePairCode); } catch {}
    startRemotePublishing();
    startRemoteCommandPolling();
    // Sélection d'appareil : la borne se rend visible dans la liste de
    // l'Interface et accepte les demandes de connexion par popup.
    startDeviceAnnounce();
    startPairRequestPolling();
  } catch {
    if (generation !== _remoteCameraGeneration) return;
    state.remoteSessionState = "expired";
    setRemoteConnectionStatus("failed", "Serveur de pairing indisponible");
    toast("Impossible de créer la connexion caméra");
    stopRemoteCamera();
  }
}

function stopRemoteCamera() {
  _remoteCameraGeneration += 1;
  stopRemoteCommandPolling();
  stopRemotePublishing();
  stopDeviceAnnounce();
  stopPairRequestPolling();
  const token = state.remoteCamToken;
  const hostKey = state.remoteCamHostKey;
  if (token && hostKey) {
    // La suppression est best-effort mais bornée : un réseau bloqué ne doit
    // pas conserver une promesse pendante ni immobiliser la sortie de rôle.
    void remoteFetch(`/api/remote-camera/${encodeURIComponent(token)}`, {
      method: "DELETE",
      headers: { "x-host-key": hostKey },
      keepalive: true,
    }, 1800).catch(() => {});
  }
  state.remoteCamMode = "off";
  state.remoteSessionState = "none";
  state.remoteCamToken = "";
  state.remoteCamHostKey = "";
  state.remotePairCode = "";
  state.remotePairUrl = "";
  state.remoteLastFramePublishedAt = 0;
  state.remoteLastControllerSeenAt = 0;
  state.remoteFrameAgeMs = null;
  state.remoteLastFrameId = "";
  state.remotePendingCommands = [];
  setRemoteConnectionStatus("disconnected", "Caméra arrêtée");
  $("camera-pair-code") && ($("camera-pair-code").textContent = "");
  $("set-remote-camera") && ($("set-remote-camera").checked = false);
  $("remote-token-row") && ($("remote-token-row").style.display = "none");
  $("remote-qr-row") && ($("remote-qr-row").style.display = "none");
  savePreferences();
}

async function remoteFetch(input, init = {}, timeoutMs = 1600) {
  const operation = telemetry.startNetwork(input, init.method || "GET");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
    telemetry.finishNetwork(operation, { status: response.status, serverTs: Number(response.headers.get("x-mb-server-ts")) || null });
    return response;
  } catch (error) {
    telemetry.finishNetwork(operation, { error: error?.name || "network" });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function remoteFetchBlob(input, init = {}, timeoutMs = 1600) {
  const operation = telemetry.startNetwork(input, init.method || "GET");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
    const blob = response.ok ? await response.blob() : null;
    telemetry.finishNetwork(operation, {
      status: response.status,
      bytes: blob?.size || 0,
      serverTs: Number(response.headers.get("x-mb-server-ts")) || null,
    });
    const receivedFrameId = response.headers.get("x-mb-frame-id");
    const ackHeader = response.headers.get("x-mb-command-acks");
    if (ackHeader) {
      try {
        const acknowledged = JSON.parse(ackHeader);
        if (Array.isArray(acknowledged) && acknowledged.length) {
          const ackedIds = new Set(acknowledged.map((entry) => Number(entry.id)));
          state.remotePendingCommands = (state.remotePendingCommands || []).filter((entry) => !ackedIds.has(Number(entry.id)));
          state.remoteLastCommandAckAt = Math.max(...acknowledged.map((entry) => Number(entry.ackAt) || 0), state.remoteLastCommandAckAt || 0);
          telemetry.emit("command-ack-status", { count: acknowledged.length, lastAckAt: state.remoteLastCommandAckAt });
        }
      } catch { /* header diagnostic facultatif */ }
    }
    const frameAt = Number(response.headers.get("x-mb-frame-at")) || 0;
    const controllerSeenAt = Number(response.headers.get("x-mb-controller-seen-at")) || 0;
    if (receivedFrameId) {
      telemetry.emit("frame-receive", {
        frameId: receivedFrameId,
        sourceSessionId: response.headers.get("x-mb-source-session-id") || null,
        bytes: blob?.size || 0,
        frameAt,
        controllerSeenAt,
      });
    }
    return { response, blob, frameAt, controllerSeenAt };
  } catch (error) {
    telemetry.finishNetwork(operation, { error: error?.name || "network" });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function setRemoteConnectionStatus(status, text) {
  const legacy = { offline: "disconnected", starting: "connecting", waiting: "connecting", error: "degraded" };
  const next = legacy[status] || status;
  const allowed = ["disconnected", "connecting", "connected", "degraded", "reconnecting", "failed"];
  const normalized = allowed.includes(next) ? next : "degraded";
  const previousStatus = state.remoteConnectionState;
  state.remoteConnectionState = normalized;
  const labels = {
    disconnected: "Déconnecté",
    connecting: "Connexion en préparation…",
    connected: "Connexion opérationnelle",
    degraded: "Connexion dégradée — nouvelle tentative…",
    reconnecting: "Reconnexion…",
    failed: "Connexion impossible",
  };
  const message = text || labels[normalized];
  if ((normalized === "degraded" || normalized === "failed") && previousStatus !== normalized && text) toast(text);
  const monitor = $("camera-monitor-status");
  if (monitor) monitor.textContent = message;
  const badge = $("camera-monitor-badge");
  if (badge) {
    badge.dataset.state = normalized === "connected" ? "connected" : normalized === "disconnected" || normalized === "connecting" ? "waiting" : "error";
    // Le badge est masqué uniquement hors session. Une session en attente ou
    // dégradée reste visible : elle ne doit jamais être confondue avec CONNECTED.
    badge.classList.toggle("hidden", normalized === "disconnected");
  }
  const code = $("camera-pair-code");
  const hint = $("camera-pair-hint");
  const connected = normalized === "connected";
  if (code) code.classList.toggle("hidden", connected);
  if (hint) hint.classList.toggle("hidden", connected);
  const remoteStatus = $("remote-status-text");
  if (remoteStatus) remoteStatus.textContent = normalized === "connected" ? "Connexion opérationnelle" : message;
  const error = $("camera-error");
  if (state.deviceRole === "camera" && (normalized === "failed" || normalized === "degraded") && error && !state.stream) {
    const title = error.querySelector(".camera-error-title");
    const copy = error.querySelector(".camera-error-text");
    if (title) title.textContent = "Caméra indisponible";
    if (copy) copy.textContent = message;
    error.classList.remove("hidden");
  }
  telemetry.emit("connection-state", {
    state: normalized,
    previous: previousStatus,
    sessionState: state.remoteSessionState,
    frameAgeMs: state.remoteFrameAgeMs,
  });
}

window.mbDebugSnapshot = () => ({
  appVersion: APP_VERSION,
  startup: telemetry.startupSnapshot?.() || null,
  role: state.deviceRole,
  session: {
    state: state.remoteSessionState,
    mode: state.remoteCamMode,
    hasToken: Boolean(state.remoteCamToken),
  },
  connection: state.remoteConnectionState,
  lastFrame: {
    publishedAt: state.remoteLastFramePublishedAt || 0,
    receivedAt: state.remoteLastFrameReceivedAt || 0,
    ageMs: state.remoteFrameAgeMs,
    id: state.remoteLastFrameId || "",
  },
  publisher: {
    active: _remotePubResourceActive,
    busy: _remotePubBusy,
    timer: Boolean(_remotePubTimer),
  },
  polling: {
    active: _remotePollResourceActive,
    busy: _remotePollBusy,
    timer: Boolean(_remotePollTimer),
  },
  commands: {
    active: _remoteCommandResourceActive,
    timer: Boolean(state.remoteCommandTimer),
    lastSentAt: state.remoteLastCommandSentAt || 0,
    lastControllerSeenAt: state.remoteLastControllerSeenAt || 0,
    pending: (state.remotePendingCommands || []).map(({ id, name, queuedAt }) => ({ id, name, queuedAt })),
  },
  camera: {
    active: Boolean(state.stream),
    readyState: camera?.readyState ?? null,
    width: camera?.videoWidth || 0,
    height: camera?.videoHeight || 0,
  },
  mediapipe: { active: Boolean(state.landmarker), detecting: Boolean(_detectFaceTimer) },
  resources: telemetry.resourceSnapshot?.() || {},
});
telemetry.setDebugSnapshotProvider?.(() => window.mbDebugSnapshot());

function showCameraPairing(data) {
  state.remotePairCode = String(data.pairCode || "").toUpperCase();
  state.remotePairUrl = String(data.url || "");
  state.remotePairExpiresAt = Number(data.pairExpiresAt) || (Date.now() + 45 * 60 * 1000);
  const code = $("camera-pair-code");
  if (code) code.textContent = state.remotePairCode || "";
  updatePairCountdown();
  const display = $("remote-token-display");
  if (display) display.value = state.remotePairCode;
  const row = $("remote-token-row");
  if (row) row.style.display = "flex";
  const qr = $("remote-qr-img");
  if (qr && state.remotePairUrl) qr.src = `/api/qr?url=${encodeURIComponent(state.remotePairUrl)}`;
}

/* Compte à rebours du code de jumelage sous le code affiché : rassure
   l'organisateur et reste honnête (la fenêtre est glissante côté serveur). */
function updatePairCountdown() {
  const hint = $("camera-pair-hint");
  if (!hint) return;
  const remainMs = Math.max(0, (state.remotePairExpiresAt || 0) - Date.now());
  if (state.remoteConnectionState === "connected" || !state.remotePairCode) {
    hint.textContent = "Sur l'écran Interface : touchez Connexion puis saisissez ce code.";
    return;
  }
  if (remainMs <= 0) {
    hint.textContent = "Code expiré — créez une nouvelle connexion.";
    return;
  }
  const min = Math.ceil(remainMs / 60000);
  hint.textContent = `Sur l'écran Interface : touchez Connexion puis saisissez ce code. Code valable encore ${min} min.`;
}

/* Prank à distance (trolls de fête) : l'Interface peut envoyer à la Caméra un
   bug d'écran factice ou un texte plein écran animé. Tout est visuel, rien de
   destructif, et un toucher fait tout disparaître. */
let _prankEl = null;
let _prankTimer = null;
function showPrank(kind, text = "") {
  if (_prankEl) hidePrank();
  const el = document.createElement("div");
  el.className = "prank-overlay";
  if (kind === "bug") {
    el.classList.add("prank-bug");
    const lines = ["⚠️", "Système corrompu", "Code -#38A", "Redémarrez la borne", "Ne coupez pas l'alimentation"];
    lines.forEach((line) => { const d = document.createElement("div"); d.textContent = line; el.appendChild(d); });
  } else {
    el.classList.add("prank-text");
    const d = document.createElement("div"); d.textContent = text || "SURPRISE ! 🎉"; el.appendChild(d);
  }
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  _prankEl = el;
  clearTimeout(_prankTimer);
  _prankTimer = setTimeout(hidePrank, kind === "bug" ? 5000 : 4000);
}
function hidePrank() {
  clearTimeout(_prankTimer); _prankTimer = null;
  if (_prankEl) { const el = _prankEl; _prankEl = null; el.classList.remove("show"); setTimeout(() => el.remove(), 400); }
}
document.addEventListener("pointerdown", () => { if (_prankEl) hidePrank(); }, { passive: true });

/* Son distant (MyInstants) : joué sur la borne via le canal de commandes.
   L'URL est validée https/http par le serveur ; on n'utilise que le contexte
   audio déjà déverrouillé par un geste pour rester compatible iOS. */
let _prankAudio = null;
function playPrankSound(url) {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    if (_prankAudio) { try { _prankAudio.pause(); } catch {} _prankAudio = null; }
    const audio = new Audio(url);
    // Pas de crossOrigin : en lecture simple <audio>, demander un mode CORS
    // ferait échouer les mp3 MyInstants qui n'envoient pas Access-Control-Allow-Origin.
    _prankAudio = audio;
    audio.volume = 0.9;
    audio.play().catch(() => { /* iOS peut bloquer : silencieux */ });
    toast("Son joué sur la borne 🔊");
  } catch { /* réseau/lecture refusée */ }
}

function applyRemoteSetting(name, value) {
  if (!(name in state) && !["prankBug", "prankText", "prankSound"].includes(name)) return;
  if (name === "remoteCamToken" || name === "remoteCamHostKey") return;
  state.remoteApplying = true;
  try {
  if (name === "prankBug") { if (value) showPrank("bug"); return; }
  if (name === "prankText") { if (value) showPrank("text", String(value)); return; }
  if (name === "prankSound") { if (value) playPrankSound(String(value)); return; }
  if (name === "flipCamera") {
    // L'Interface demande un retournement : exécuté sans attendre, la caméra
    // reste maîtresse de son flux local (délégation au deviceRole caméra).
    if (value && state.deviceRole === "camera" && state.stream) void flipCamera();
    return;
  }
  if (name === "lensDeviceId") {
    // L'Interface choisit l'objectif de la borne : on relance la caméra avec
    // ce deviceId (null = auto/facingMode). Ignoré si la caméra est indisponible.
    state.lensDeviceId = value || null;
    try { buildLensOptions(); } catch {}
    if (state.deviceRole !== "interface" && state.stream) {
      try { state.stream.getTracks().forEach((t) => t.stop()); } catch {}
      telemetry.cameraStop();
      state.stream = null;
      void startCamera().catch(() => {});
    }
    return;
  }
    state[name] = value;
    if (name === "logoEnabled" && value) {
      void loadLogoImage();
    } else if (name === "trackEnabled") {
      if (value) void Promise.resolve(window.mbEnsureFaceTracking?.()).catch(() => {});
      else void Promise.resolve(window.mbUpdateFaceTracking?.()).catch(() => {});
    } else if (name === "idleEnabled") {
      if (value) initIdleMode(); else { stopIdleMode(); exitIdle(); }
    } else if (name === "idleFaceWake" && value) {
      state.idleEnabled = true;
      initIdleMode();
    } else if (name === "performanceMode") {
      state.performanceMode = PERF[value] ? value : "eco";
    }
    syncPreferenceControls();
    savePreferences();
  } finally {
    state.remoteApplying = false;
  }
}

function startRemoteCommandPolling() {
  stopRemoteCommandPolling();
  if (state.deviceRole !== "camera" || state.remoteCamMode !== "camera" || !state.remoteCamToken || !state.remoteCamHostKey) return;
  let failures = 0;
  if (!_remoteCommandResourceActive) {
    telemetry.resourceStart("activeCommandPollers", { role: "camera" });
    _remoteCommandResourceActive = true;
  }
  const poll = async () => {
    if (state.remoteCommandTimer === null || document.hidden) return;
    try {
      const res = await remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/commands?after=${state.remoteCommandCursor}`, { headers: { "x-host-key": state.remoteCamHostKey }, cache: "no-store" }, 2200);
      if (!res.ok) throw new Error("commands");
      const data = await res.json();
      failures = 0;
      state.remoteLastControllerSeenAt = Number(data.controllerLastSeenAt) || 0;
      state.remoteSessionState = data.paired ? "paired" : "created";
      for (const command of data.commands || []) {
        state.remoteCommandCursor = Math.max(state.remoteCommandCursor, Number(command.id) || 0);
        applyRemoteSetting(command.name, command.value);
        void remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/commands/${encodeURIComponent(command.id)}/ack`, {
          method: "POST",
          headers: { "x-host-key": state.remoteCamHostKey },
        }, 1800).then((response) => {
          if (!response.ok) throw new Error(`ack-${response.status}`);
          state.remoteLastCommandAckAt = Date.now();
          telemetry.emit("command-ack", { commandId: Number(command.id) || 0, ackAt: state.remoteLastCommandAckAt });
        }).catch(() => {});
      }
      // Statut honnête : « connecté » uniquement après le vrai jumelage.
      // Avant, on reste en attente et on rafraîchit le compte à rebours du
      // code (fourni par le serveur, fenêtre glissante).
      if (data.paired) {
        // Le serveur peut confirmer le pairage alors que l'Interface est déjà
        // fermée. `paired` est une session, pas une connexion opérationnelle.
        const controllerAlive = state.remoteLastControllerSeenAt > 0
          && Date.now() - state.remoteLastControllerSeenAt <= 6000;
        const publisherAlive = state.remoteLastFramePublishedAt > 0
          && Date.now() - state.remoteLastFramePublishedAt <= 6000
          && Boolean(state.stream);
        stopDeviceAnnounce();
        stopPairRequestPolling();
        if (controllerAlive && publisherAlive) setRemoteConnectionStatus("connected", "Caméra connectée");
        else setRemoteConnectionStatus("degraded", controllerAlive ? "Interface détectée — publication caméra à vérifier" : "Pairage conservé — interface silencieuse");
      } else {
        // Non jumelée, ou session ré-ouverte par le serveur (le contrôleur
        // précédent a disparu : la borne redevient visible dans la liste de
        // l'Interface et ré-accepte les demandes de connexion).
        startDeviceAnnounce();
        startPairRequestPolling();
        state.remotePairExpiresAt = Number(data.pairExpiresAt) || state.remotePairExpiresAt;
        const remainMs = Math.max(0, (state.remotePairExpiresAt || 0) - Date.now());
        if (remainMs <= 0) {
          // Improbable avec la fenêtre glissante, mais on coupe proprement la
          // publication au lieu d'afficher un code mort.
          stopRemotePublishing();
          setRemoteConnectionStatus("error", "Code de jumelage expiré — créez une nouvelle connexion");
          toast("Code expiré — touchez Connexion caméra pour un nouveau code");
          stopRemoteCommandPolling();
          return;
        }
        setRemoteConnectionStatus("waiting", `En attente de l'écran Interface — code valable ${Math.ceil(remainMs / 60000)} min`);
        updatePairCountdown();
      }
    } catch {
      // Une coupure isolée (cold start, réseau) ne doit pas casser le statut :
      // on ne signale l'erreur qu'après plusieurs échecs consécutifs.
      failures += 1;
      if (failures >= 4) setRemoteConnectionStatus("reconnecting", "Connexion à l'interface interrompue — nouvelle tentative…");
    } finally {
      // 400 ms : les réglages de l'Interface arrivent quasi en direct sur la
      // Caméra (objectif, flash, veille…) au lieu de ~1 s de latence perçue.
      if (state.remoteCommandTimer !== null && !document.hidden) state.remoteCommandTimer = setTimeout(poll, 400);
    }
  };
  state.remoteCommandTimer = setTimeout(poll, 250);
}

function stopRemoteCommandPolling() {
  if (state.remoteCommandTimer) clearTimeout(state.remoteCommandTimer);
  state.remoteCommandTimer = null;
  if (_remoteCommandResourceActive) {
    telemetry.resourceStop("activeCommandPollers", { role: "camera" });
    _remoteCommandResourceActive = false;
  }
}

function remoteSendSetting(name, value) {
  if (state.remoteApplying || state.deviceRole !== "interface" || state.remoteCamMode !== "controller" || !state.remoteCamToken) return;
  void remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/command`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, value }),    }, 1800).then((response) => {
      if (!response.ok) throw new Error(`command-${response.status}`);
      state.remoteLastCommandSentAt = Date.now();
      state.remotePendingCommands = [...(state.remotePendingCommands || []).filter((entry) => entry.name !== name), { id: Number(response.headers.get("x-mb-command-id")) || 0, name, queuedAt: state.remoteLastCommandSentAt }].filter((entry) => entry.id > 0).slice(-12);
      telemetry.emit("command-queued", { name, commandId: Number(response.headers.get("x-mb-command-id")) || 0, sentAt: state.remoteLastCommandSentAt });
    }).catch(() => setRemoteConnectionStatus("degraded", "Réglage non envoyé"));
}

async function decodeRemoteFrame(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch { /* Safari iOS ancien : fallback Image ci-dessous */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function startRemotePublishing() {
  stopRemotePublishing();
  if (!state.remoteCamToken || state.remoteCamMode !== "camera" || document.hidden) return;
  const generation = ++_remotePubGeneration;
  if (!_remotePubCanvas) _remotePubCanvas = document.createElement("canvas");
  const canvas = _remotePubCanvas;
  if (!_remotePubResourceActive) {
    telemetry.resourceStart("activePublishers", { role: "camera" });
    _remotePubResourceActive = true;
  }
  if (!_remotePubCanvasResourceActive) {
    telemetry.resourceStart("temporaryCanvases", { kind: "remote-publisher" });
    _remotePubCanvasResourceActive = true;
  }
  // Tente une connexion WebRTC P2P (offerer). Si ça aboutit, le flux passe
  // par la track RTC et on skip le POST JPEG. Sinon (lib absente, pas de pair,
  // signaling KO), on retombe immédiatement sur le polling JPEG.
  void initCameraWebrtc(generation);
  const publish = async () => {
    if (generation !== _remotePubGeneration || _remotePubBusy || !state.stream || !camera.videoWidth || document.hidden) return;
    // WebRTC actif : le flux passe par la track, on skip le POST JPEG mais on
    // garde la boucle vivante pour reprendre le polling si le P2P tombe.
    if (state.webrtcActive) {
      if (generation === _remotePubGeneration && state.remoteCamMode === "camera" && !document.hidden) {
        _remotePubTimer = setTimeout(publish, 1000);
      }
      return;
    }
    _remotePubBusy = true;
    try {
      // Flux distant : 800 px large, qualité 0.78 pour un rendu net.
      // Le canvas garde le ratio d'aspect natif de la caméra.
      const W = Math.min(camera.videoWidth, 800);
      const H = Math.max(1, Math.round(W / (camera.videoWidth / camera.videoHeight)));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      canvas.getContext("2d").drawImage(camera, 0, 0, W, H);
      const blob = await canvasToJpegBlob(canvas, 0.78, "remote-live");
      if (!blob || generation !== _remotePubGeneration) return;
      const frameId = telemetry.recordFrame("remote-live", { width: W, height: H, sizeBytes: blob.size });
      const form = new FormData();
      form.append("frame", blob, "preview.jpg");        const response = await remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame`, {
          method: "POST",
        headers: {
          "x-host-key": state.remoteCamHostKey,
          "x-mb-session-id": telemetry.sessionId,
          "x-mb-frame-id": frameId,
        },
        body: form,        }, 1500);
        if (!response.ok) throw new Error(`publish-${response.status}`);
        state.remoteLastFramePublishedAt = Date.now();
        telemetry.emit("frame-published", { frameId, publishedAt: state.remoteLastFramePublishedAt, bytes: blob.size });
    } catch { /* réseau intermittent : ne jamais bloquer la caméra */ }
    finally {
      if (generation === _remotePubGeneration) _remotePubBusy = false;
      if (generation === _remotePubGeneration && state.remoteCamMode === "camera" && !document.hidden) {
        _remotePubTimer = setTimeout(publish, 550);
      }
    }
  };
  void publish();
}

function stopRemotePublishing() {
  _remotePubGeneration += 1;
  _remotePubBusy = false;
  if (_remotePubTimer) { clearTimeout(_remotePubTimer); clearInterval(_remotePubTimer); _remotePubTimer = null; }
  if (_remotePubResourceActive) {
    telemetry.resourceStop("activePublishers", { role: "camera" });
    _remotePubResourceActive = false;
  }
  if (_remotePubCanvasResourceActive) {
    telemetry.resourceStop("temporaryCanvases", { kind: "remote-publisher" });
    _remotePubCanvasResourceActive = false;
  }
  // Coupe la peer connection caméra (offerer). L'interface gère la sienne.
  closeWebrtcPeer("stopRemotePublishing");
}

/* ─── WebRTC côté caméra (offerer) ───
   - Ouvre le socket Socket.IO avec auth caméra (token session + hostKey)
   - Crée RTCPeerConnection, ajoute la track vidéo de state.stream
   - Crée l'offer, l'envoie via socket.emit("webrtc:offer")
   - Écoute "webrtc:answer" pour setRemoteDescription
   - Échange les ICE candidates via "webrtc:ice"
   - Sur iceConnectionState "connected"/"completed", pose webrtcActive = true
   - Sur "webrtc:peer-left" ou iceConnectionState "failed/disconnected", fallback polling
   - Re-tente l'offer toutes les 3 s (max 4) tant qu'aucune answer n'arrive */
async function initCameraWebrtc(generation) {
  if (generation !== _remotePubGeneration) return;
  if (state.webrtcActive || state.webrtcPC) return;
  // Safari iOS : WebRTC désactivé par défaut pour éviter l'écran "Un
  // problème récurrent est survenu" de Safari. Le polling JPEG continue
  // à fonctionner (1-2 fps, fluide, pas de crash). Réactiver via
  // ?force-webrtc=1 dans l'URL après diagnostic manuel.
  if (state.webrtcDisabled) {
    state.webrtcSignalingFailed = true;
    return;
  }
  // S'assurer qu'on a un flux local à publier (la caméra peut encore démarrer).
  let stream = state.stream;
  if (!stream) {
    // On attend un peu : startRemotePublishing est appelé juste après
    // startRemoteCamera et le getUserMedia peut ne pas être prêt.
    for (let i = 0; i < 8 && generation === _remotePubGeneration; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      stream = state.stream;
      if (stream) break;
    }
  }
  if (generation !== _remotePubGeneration || !stream) return;
  const myGen = ++_webrtcInitGeneration;
  const socket = buildWebRtcSocket({ token: state.remoteCamToken, role: "camera", key: state.remoteCamHostKey });
  if (!socket) { state.webrtcSignalingFailed = true; return; }
  state.webrtcSocket = socket;
  state.webrtcPeerLeft = false;
  state.webrtcSignalingFailed = false;
  socket.on("connect_error", () => { if (myGen === _webrtcInitGeneration) state.webrtcSignalingFailed = true; });
  socket.on("disconnect", () => {
    if (myGen === _webrtcInitGeneration) {
      // Reconnexion automatique : on garde la socket, on coupe juste l'active.
      state.webrtcActive = false;
    }
  });
  socket.on("webrtc:answer", async (answer) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    try { await state.webrtcPC.setRemoteDescription(new RTCSessionDescription(answer)); }
    catch (err) { console.warn("[MomentoBooth][webrtc] setRemoteDescription(answer) KO:", err?.message || err); state.webrtcSignalingFailed = true; }
  });
  socket.on("webrtc:ice", async (candidate) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    try { if (candidate) await state.webrtcPC.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch { /* ICE race fréquent au démarrage */ }
  });
  socket.on("webrtc:peer-left", () => {
    if (myGen !== _webrtcInitGeneration) return;
    state.webrtcPeerLeft = true;
    state.webrtcActive = false;
    // L'interface est repartie : on relance une offer dès qu'elle revient.
  });
  socket.connect();

  const pc = await makeRtcPeerConnection(stream);
  if (myGen !== _webrtcInitGeneration || !pc) { state.webrtcSignalingFailed = true; return; }
  state.webrtcPC = pc;

  pc.oniceconnectionstatechange = () => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    const s = state.webrtcPC.iceConnectionState;
    if (s === "connected" || s === "completed") {
      state.webrtcActive = true;
      state.webrtcSignalingFailed = false;
      telemetry.emit("webrtc-connected", { role: "camera" });
    } else if (s === "failed" || s === "disconnected" || s === "closed") {
      state.webrtcActive = false;
      if (s === "failed") state.webrtcSignalingFailed = true;
    }
  };
  pc.onicecandidate = (event) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcSocket) return;
    state.webrtcSocket.emit("webrtc:ice", event.candidate || null);
  };
  // Si la track locale s'arrête (ex. caméra coupée), on coupe le peer.
  pc.onconnectionstatechange = () => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    if (state.webrtcPC.connectionState === "failed") {
      state.webrtcActive = false;
      state.webrtcSignalingFailed = true;
    }
  };

  // Envoie l'offer, et re-tente jusqu'à recevoir une answer ou épuiser les essais.
  const sendOffer = async () => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC || !state.webrtcSocket || state.webrtcActive) return;
    try {
      const offer = await state.webrtcPC.createOffer({ offerToReceiveVideo: false });
      await state.webrtcPC.setLocalDescription(offer);
      state.webrtcSocket.emit("webrtc:offer", offer);
      _webrtcOfferRetries += 1;
      if (_webrtcOfferRetries < 4 && !state.webrtcActive && myGen === _webrtcInitGeneration) {
        _webrtcOfferRetryTimer = setTimeout(sendOffer, 3000);
      }
    } catch (err) {
      state.webrtcSignalingFailed = true;
      console.warn("[MomentoBooth][webrtc] createOffer KO:", err?.message || err);
    }
  };
  // Petit délai pour laisser la socket se connecter + l'interface rejoindre la room.
  setTimeout(sendOffer, 800);
}

async function connectRemoteCamera(token) {
  const pairCode = String(token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (pairCode.length < 6) { toast("Entrez le code caméra à 6 caractères"); return; }
  const generation = ++_remoteConnectGeneration;
  // Toute tentative précédente devient obsolète avant son premier await.
  disconnectRemoteCamera({ silent: true, keepConnectGeneration: true });
  state.remoteCamMode = "controller";
  state.remoteSessionState = "none";
  state.remoteConnectionState = "connecting";
  state.remoteLastFramePublishedAt = 0;
  state.remoteLastFrameReceivedAt = 0;
  state.remoteFrameAgeMs = null;
  savePreferences();
  $("remote-controller-status").style.display = "flex";
  setRemoteConnectionStatus("waiting", "");
  if (pairCode.length === 6) {
    // Code court classique : échange de jumelage robuste (timeout long pour le
    // cold start + nouvelle tentative automatique, message selon la cause).
    let pairing = null, lastError = "pair";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const pairResponse = await remoteFetch("/api/remote-camera/pair", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: pairCode }),
        }, 15000);
        if (pairResponse.status === 429) { lastError = "rate"; break; }
        if (!pairResponse.ok) { lastError = pairResponse.status === 404 ? "expired" : "pair"; break; }
        pairing = await pairResponse.json();
        if (generation !== _remoteConnectGeneration) return;
        if (pairing?.accessToken) break;
        lastError = "pair";
      } catch {
        lastError = "timeout";
        if (attempt === 1) setRemoteConnectionStatus("waiting", "Serveur lent — nouvelle tentative…");
      }
    }
    if (generation !== _remoteConnectGeneration) return;
    if (!pairing?.accessToken) {
      state.remoteCamMode = "off";
      state.remoteSessionState = "expired";
      state.remoteConnectionState = "failed";
      state.remoteCamToken = "";
      const messages = {
        expired: ["Code expiré ou caméra indisponible", "Code caméra invalide ou expiré — vérifiez le code affiché sur la borne"],
        rate: ["Trop de tentatives", "Trop de tentatives — patientez une minute puis réessayez"],
        timeout: ["Serveur injoignable", "Connexion au serveur impossible — vérifiez le réseau puis réessayez"],
        pair: ["Jumelage refusé", "Jumelage refusé par le serveur — réessayez"],
      }[lastError] || ["Jumelage refusé", "Jumelage refusé — réessayez"];
      setRemoteConnectionStatus("failed", messages[0]);
      toast(messages[1]);
      return;
    }
      state.remoteCamToken = String(pairing.accessToken);
    state.remoteSessionState = "paired";
  } else {
    // Jeton de contrôle déjà échangé (sélection d'appareil) : connexion directe.
    state.remoteCamToken = String(token || "");
    state.remoteSessionState = "paired";
  }
  if (generation !== _remoteConnectGeneration) return;
  // Crée le canvas de preview distant (par-dessus la caméra locale, opaque
  // pour ne JAMAIS laisser transparaître la caméra de l'Interface).
  _remotePreviewCanvas = document.createElement("canvas");
  _remotePreviewCanvas.id = "remote-preview";
  _remotePreviewCanvas.style.cssText = "position:absolute;inset:0;z-index:6;width:100%;height:100%;background:#000;";
  const zone = $("camera-zone");
  if (zone) zone.appendChild(_remotePreviewCanvas);
  // En mode Interface connectée à une Caméra distante, on n'utilise QUE le
  // flux distant : la caméra locale de l'Interface doit rester invisible.
  camera.style.visibility = "hidden";
  camera.hidden = true;
  startRemotePolling();
  setRemoteConnectionStatus("connecting", "Jumelage accepté — vérification du flux…");
  // Synchronisation initiale : l'iPhone applique immédiatement l'état de
  // l'Interface, sans attendre qu'un réglage soit modifié à la main.
  [
    ["portraitMode", state.portraitMode], ["burstMode", state.burstMode], ["qualityMax", state.qualityMax],
    ["performanceMode", state.performanceMode], ["trackEnabled", state.trackEnabled], ["idleEnabled", state.idleEnabled],
    ["idleFaceWake", state.idleFaceWake], ["prerollEnabled", state.prerollEnabled], ["filmBubbleEnabled", state.filmBubbleEnabled],
    ["lightFrameEnabled", state.lightFrameEnabled], ["logoEnabled", state.logoEnabled], ["flashMode", state.flashMode], ["autoDelay", state.autoDelay],
    ["timerSeconds", state.timerSeconds], ["captureCount", state.captureCount], ["lensDeviceId", state.lensDeviceId],
  ].forEach(([name, value]) => remoteSendSetting(name, value));
  // Connexion réussie : aucun texte permanent, l'aperçu suffit.
}

function disconnectRemoteCamera(options = {}) {
  if (!options.keepConnectGeneration) _remoteConnectGeneration += 1;
  stopRemotePolling();
  state.remoteCamMode = "off";
  state.remoteSessionState = "none";
  state.remoteCamToken = "";
  state.remoteConnectionState = "disconnected";
  state.remoteLastFrameReceivedAt = 0;
  state.remoteFrameAgeMs = null;
  state.remoteLastFrameId = "";
  state.remotePendingCommands = [];
  if (_remotePreviewCanvas) { _remotePreviewCanvas.remove(); _remotePreviewCanvas = null; }
  $("remote-controller-status").style.display = "none";
  // Restaure la caméra locale pour les rôles qui l'utilisent (Caméra/Mixte) ;
  // en Interface elle reste masquée par le CSS dédié (data-device-role).
  if (state.deviceRole !== "interface") {
    camera.style.visibility = "";
    camera.hidden = false;
  }
  savePreferences();
  if (!options.silent) toast("Déconnecté");
}

/* ════════════════════════════════════════════════════════════
   SÉLECTION D'APPAREIL (au lieu du code)
   Caméra = s'annonce périodiquement + reçoit les demandes de
   connexion dans une popup (Accepter / Refuser).
   Interface = liste les caméras actives, touche l'une d'elles et
   attend l'acceptation pour recevoir le jeton de contrôle.
   ════════════════════════════════════════════════════════════ */
let _deviceAnnounceTimer = null;
function startDeviceAnnounce() {
  stopDeviceAnnounce();
  if (state.deviceRole !== "camera" || state.remoteCamMode !== "camera" || !state.remoteCamToken || !state.remoteCamHostKey) return;
  if (!_deviceAnnounceResourceActive) {
    telemetry.resourceStart("activeDiscoveryPollers", { role: "camera", kind: "announce" });
    _deviceAnnounceResourceActive = true;
  }
  const announce = async () => {
    if (state.deviceRole !== "camera" || !state.remoteCamToken || !state.remoteCamHostKey || document.hidden) return;
    try {
      await remoteFetch("/api/device-discovery/announce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "camera", name: getDeviceName(), token: state.remoteCamToken, hostKey: state.remoteCamHostKey }),
      }, 1500);
    } catch { /* réseau : la prochaine annonce réessaie */ }
  };
  void announce();
  _deviceAnnounceTimer = setInterval(announce, 6000);
}
function stopDeviceAnnounce() {
  if (_deviceAnnounceTimer) { clearInterval(_deviceAnnounceTimer); _deviceAnnounceTimer = null; }
  if (_deviceAnnounceResourceActive) {
    telemetry.resourceStop("activeDiscoveryPollers", { role: "camera", kind: "announce" });
    _deviceAnnounceResourceActive = false;
  }
}

/* ─── Côté caméra : popup d'acceptation des demandes reçues ─── */
let _pairRequestTimer = null;
let _pairRequestShown = new Set();
let _pairRequestEl = null;
let _pairRequestPreviousFocus = null;
function startPairRequestPolling() {
  stopPairRequestPolling();
  if (state.deviceRole !== "camera" || state.remoteCamMode !== "camera" || !state.remoteCamToken || !state.remoteCamHostKey) return;
  if (!_pairRequestResourceActive) {
    telemetry.resourceStart("activePairRequestPollers", { role: "camera" });
    _pairRequestResourceActive = true;
  }
  const poll = async () => {
    if (!state.remoteCamToken || document.hidden) return;
    try {
      const res = await remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/pair-requests`, { headers: { "x-host-key": state.remoteCamHostKey }, cache: "no-store" }, 2200);
      if (!res.ok) return;
      const data = await res.json();
      for (const request of data.requests || []) {
        if (_pairRequestEl) break;
        if (_pairRequestShown.has(request.requestId)) continue;
        _pairRequestShown.add(request.requestId);
        showPairRequestPopup(request);
        break;
      }
    } catch { /* réseau intermittent */ }
  };
  _pairRequestTimer = setInterval(poll, 2500);
  void poll();
}
function stopPairRequestPolling() {
  if (_pairRequestTimer) { clearInterval(_pairRequestTimer); _pairRequestTimer = null; }
  _pairRequestShown.clear();
  hidePairRequestPopup();
  if (_pairRequestResourceActive) {
    telemetry.resourceStop("activePairRequestPollers", { role: "camera" });
    _pairRequestResourceActive = false;
  }
}
function showPairRequestPopup(request) {
  if (_pairRequestEl) return;
  const el = document.createElement("div");
  el.className = "pair-request-popup";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Demande de connexion");
  el.innerHTML = `<div class="pair-request-card">
    <div class="pair-request-icon">📱</div>
    <div class="pair-request-title">Connexion demandée</div>
    <div class="pair-request-name">${escapeHtml(request.interfaceName || "Interface")}</div>
    <div class="pair-request-text">veut piloter cette caméra. Accepter ?</div>
    <div class="pair-request-actions"><button type="button" class="mini-btn" data-pr="refuse">Refuser</button><button type="button" class="mini-btn primary" data-pr="accept">Accepter</button></div>
  </div>`;
  _pairRequestPreviousFocus = document.activeElement;
  document.body.appendChild(el);
  _pairRequestEl = el;
  const respond = async (accept) => {
    let response = null;
    try {
      response = await remoteFetch(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/pair-requests/${encodeURIComponent(request.requestId)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-host-key": state.remoteCamHostKey },
        body: JSON.stringify({ accept }),
      }, 2500);
    } catch { /* la demande expire d'elle-même côté serveur */ }
    hidePairRequestPopup();
    if (!response?.ok) _pairRequestShown.delete(request.requestId);
    if (accept && response?.ok) {
      // Une demande acceptée ne doit plus être reproposée par le poller caméra.
      stopPairRequestPolling();
      // Accepté signifie SESSION_PAIRED, pas encore connexion saine : la
      // preuve arrive ensuite par lastControllerSeenAt + frame publiée.
      state.remoteSessionState = "paired";
      setRemoteConnectionStatus("connecting", "Pairage accepté — vérification de l'Interface…");
      toast("Pairage accepté — vérification en cours");
      sfxFinal();
    } else if (accept) {
      setRemoteConnectionStatus("degraded", "Acceptation non confirmée — nouvelle tentative…");
    } else {
      toast("Demande refusée");
    }
  };
  let responding = false;
  const actionButtons = [...el.querySelectorAll("[data-pr]")];
  const respondOnce = async (accept) => {
    if (responding) return;
    responding = true;
    actionButtons.forEach((button) => { button.disabled = true; });
    await respond(accept);
  };
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void respondOnce(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = actionButtons.filter((button) => !button.disabled);
    if (!focusables.length) return;
    const index = focusables.indexOf(document.activeElement);
    const next = focusables[(index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length];
    event.preventDefault();
    next.focus();
  });
  const acceptButton = el.querySelector('[data-pr="accept"]');
  acceptButton?.focus();
  el.querySelector('[data-pr="accept"]')?.addEventListener("click", () => { void respondOnce(true); });
  el.querySelector('[data-pr="refuse"]')?.addEventListener("click", () => { void respondOnce(false); });
  // BUG-1.4 — Auto-dismiss après 30s pour éviter le loop de popup.
  // La popup ne réapparaît pas car _pairRequestShown garde l'ID.
  _pairRequestAutoDismissTimer = setTimeout(() => {
    if (_pairRequestEl === el) { void respondOnce(false); }
  }, 30000);
}
let _pairRequestAutoDismissTimer = null;
function hidePairRequestPopup() {
  if (_pairRequestAutoDismissTimer) { clearTimeout(_pairRequestAutoDismissTimer); _pairRequestAutoDismissTimer = null; }
  if (_pairRequestEl) { _pairRequestEl.remove(); _pairRequestEl = null; }
  const previous = _pairRequestPreviousFocus;
  _pairRequestPreviousFocus = null;
  if (previous && document.contains(previous)) previous.focus();
}

/* Ré-ouvre le role-gate en mode Interface pour re-sélectionner la caméra
   après une coupure (contrôleur révoqué par le dé-jumelage automatique).
   La caméra étant redevenue visible dans la liste, un seul appui suffit. */
function reopenDeviceSelection() {
  const gate = $("role-gate");
  if (!gate || gate.classList.contains("open") || state.deviceRole !== "interface") return;
  _roleGateFinish = (role, token) => {
    _roleGateFinish = null;
    if (token) void connectRemoteCamera(token);
    hideRoleGate();
  };
  showRoleGate();
  const status = $("role-gate-status");
  if (status) status.textContent = "La connexion a été interrompue — touchez la caméra pour vous reconnecter";
}

/* ─── Côté Interface : liste des caméras + demande de connexion ─── */
let _cameraListTimer = null;
let _cameraDiscoveryGeneration = 0;
let _pairRequestPollTimer = null;
let _pairAttemptGeneration = 0;
let _currentPairRequestId = null;
let _currentPairRequestKey = "";
let _currentPairRequestName = "";
let _roleGateFinish = null; // callback du role-gate : résout une fois connecté

function startCameraDiscovery(onCameraTap) {
  stopCameraDiscovery();
  const generation = ++_cameraDiscoveryGeneration;
  if (!_cameraDiscoveryResourceActive) {
    telemetry.resourceStart("activeDiscoveryPollers", { role: "interface", kind: "camera-list" });
    _cameraDiscoveryResourceActive = true;
  }
  void refreshCameraList(onCameraTap, generation);
  _cameraListTimer = setInterval(() => { void refreshCameraList(onCameraTap, generation); }, 3000);
}
function stopCameraDiscovery() {
  _cameraDiscoveryGeneration += 1;
  _pairAttemptGeneration += 1;
  const abandonedRequestId = _currentPairRequestId;
  const abandonedPairKey = _currentPairRequestKey;
  if (abandonedRequestId && abandonedPairKey) {
    void remoteFetch(`/api/device-discovery/requests/${encodeURIComponent(abandonedRequestId)}`, {
      method: "DELETE",
      headers: { "x-pair-key": abandonedPairKey },
      keepalive: true,
    }, 1500).catch(() => {});
  }
  if (_cameraListTimer) { clearInterval(_cameraListTimer); _cameraListTimer = null; }
  if (_pairRequestPollTimer) { clearInterval(_pairRequestPollTimer); _pairRequestPollTimer = null; }
  _currentPairRequestId = null;
  _currentPairRequestKey = "";
  _currentPairRequestName = "";
  if (_cameraDiscoveryResourceActive) {
    telemetry.resourceStop("activeDiscoveryPollers", { role: "interface", kind: "camera-list" });
    _cameraDiscoveryResourceActive = false;
  }
}
async function refreshCameraList(onCameraTap, generation = _cameraDiscoveryGeneration) {
  try {
    const res = await remoteFetch("/api/device-discovery/cameras", { cache: "no-store" }, 2200);
    if (generation !== _cameraDiscoveryGeneration) return;
    if (!res.ok) return;
    const data = await res.json();
    if (generation !== _cameraDiscoveryGeneration) return;
    const cameras = data.cameras || [];
    const gateOpen = $("role-gate")?.classList.contains("open");
    const boxes = [$("role-camera-list"), $("settings-camera-list")].filter(Boolean);
    for (const box of boxes) {
      // La liste du role-gate est contextuelle ; celle des réglages doit rester
      // synchronisée même lorsque sa feuille est momentanément fermée.
      if (box.id === "role-camera-list" && !gateOpen) continue;
      if (!cameras.length) {
        box.innerHTML = '<div class="cam-empty">Aucune caméra détectée — lancez le mode Caméra sur l\u2019iPhone</div>';
        continue;
      }
      box.innerHTML = cameras.map((cam) => `<button type="button" class="cam-item" data-cam="${escapeHtml(cam.id)}" data-name="${escapeHtml(cam.name)}">📷 <span class="cam-name">${escapeHtml(cam.name)}</span><span class="cam-connect">Connecter</span></button>`).join("");
      box.querySelectorAll(".cam-item").forEach((btn) => btn.addEventListener("click", () => {
        _currentPairRequestName = btn.dataset.name;
        markCamPending(btn);
        onCameraTap(btn.dataset.cam, btn.dataset.name, box);
      }));
      // Ré-applique l'état « en attente » après le rebuild (par nom).
      if (_currentPairRequestName) {
        const pending = [...box.querySelectorAll(".cam-item")].find((b) => b.dataset.name === _currentPairRequestName);
        if (pending) markCamPending(pending);
      }
    }
  } catch { /* réseau : prochain rafraîchissement */ }
}
function markCamPending(btn) {
  btn.classList.add("cam-pending");
  const label = btn.querySelector(".cam-connect");
  if (label) label.textContent = "En attente…";
}
function connectToCamera(cameraId, cameraName, onConnected, setStatus) {
  if (_currentPairRequestId) { setStatus?.("Une demande est déjà en cours"); return; }
  const attempt = ++_pairAttemptGeneration;
  const clearAttempt = () => {
    if (attempt !== _pairAttemptGeneration) return;
    _currentPairRequestId = null;
    _currentPairRequestKey = "";
    _currentPairRequestName = "";
  };
  _currentPairRequestName = cameraName;
  setStatus?.(`Demande envoyée à ${cameraName} — en attente d'acceptation…`);
  void (async () => {
    try {
      const res = await remoteFetch("/api/device-discovery/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameraId, interfaceName: getDeviceName() }),
      }, 3500);
      const body = await res.json().catch(() => ({}));
      if (attempt !== _pairAttemptGeneration) return;
      if (res.status === 409) {
        // Le serveur ne remet pas la clé privée d’une demande créée ailleurs.
        // Ne laisse pas cet identifiant bloquer les tentatives suivantes.
        clearAttempt();
        setStatus?.(body.error || "Une demande est déjà en cours");
        // Une demande créée par une autre page/interface ne peut pas être
        // interrogée sans sa clé privée : on évite de sonder à l'aveugle.
        return;
      }
      if (!res.ok) { clearAttempt(); setStatus?.("Caméra hors ligne — réessayez"); return; }
      _currentPairRequestId = body.requestId;
      _currentPairRequestKey = String(body.pairKey || "");
      if (!_currentPairRequestId || !_currentPairRequestKey) { clearAttempt(); setStatus?.("Réponse serveur invalide"); return; }
      pollPairRequest(onConnected, setStatus, attempt);
    } catch {
      clearAttempt();
      if (attempt === _pairAttemptGeneration) setStatus?.("Serveur injoignable — vérifiez le réseau");
    }
  })();
}
function pollPairRequest(onConnected, setStatus, attempt = _pairAttemptGeneration) {
  if (_pairRequestPollTimer) clearInterval(_pairRequestPollTimer);
  const tick = async () => {
    if (attempt !== _pairAttemptGeneration || !_currentPairRequestId) return;
    try {
      const res = await remoteFetch(`/api/device-discovery/requests/${encodeURIComponent(_currentPairRequestId)}`, {
        headers: _currentPairRequestKey ? { "x-pair-key": _currentPairRequestKey } : {},
        cache: "no-store",
      }, 2200);
      if (res.status === 404) { tick404(); return; }
      if (res.status === 403) {
        if (_pairRequestPollTimer) { clearInterval(_pairRequestPollTimer); _pairRequestPollTimer = null; }
        if (attempt !== _pairAttemptGeneration) return;
        _currentPairRequestId = null;
        _currentPairRequestKey = "";
        _currentPairRequestName = "";
        setStatus?.("Demande de pairage invalide — recommencez");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "accepted" && data.controllerToken) {
        if (_pairRequestPollTimer) { clearInterval(_pairRequestPollTimer); _pairRequestPollTimer = null; }
        if (attempt !== _pairAttemptGeneration) return;
        _currentPairRequestId = null;
        _currentPairRequestKey = "";
        _currentPairRequestName = "";
        setStatus?.("Connecté ✓");
        void Promise.resolve(onConnected(data.controllerToken)).catch(() => {});
      } else if (data.status === "refused" || data.status === "expired") {
        if (_pairRequestPollTimer) { clearInterval(_pairRequestPollTimer); _pairRequestPollTimer = null; }
        if (attempt !== _pairAttemptGeneration) return;
        _currentPairRequestId = null;
        _currentPairRequestKey = "";
        _currentPairRequestName = "";
        setStatus?.(data.status === "refused" ? "Demande refusée par la caméra" : "Demande expirée — réessayez");
      }
    } catch { /* re-poll */ }
  };
  const tick404 = () => {
    if (attempt !== _pairAttemptGeneration) return;
    // Demande purgée côté serveur (refus/expiré déjà consommés) : on arrête.
    if (_pairRequestPollTimer) { clearInterval(_pairRequestPollTimer); _pairRequestPollTimer = null; }
    _currentPairRequestId = null;
    _currentPairRequestKey = "";
    _currentPairRequestName = "";
    setStatus?.("Demande introuvable — réessayez");
  };
  void tick();
  _pairRequestPollTimer = setInterval(tick, 2000);
}

function startRemotePolling() {
  stopRemotePolling();
  if (!state.remoteCamToken || state.remoteCamMode !== "controller" || document.hidden) return;
  const generation = ++_remotePollGeneration;
  let consecutiveFailures = 0;
  if (!_remotePollResourceActive) {
    telemetry.resourceStart("activePollers", { role: "interface" });
    _remotePollResourceActive = true;
  }
  // Tente une connexion WebRTC P2P (answerer). Si la caméra envoie une offer,
  // on répond et on branche le flux entrant sur l'aperçu. Sinon (pas de pair,
  // signaling KO), on retombe sur le polling JPEG.
  void initInterfaceWebrtc(generation);
  const poll = async () => {
    if (generation !== _remotePollGeneration || _remotePollBusy || !state.remoteCamToken || document.hidden) return;
    // WebRTC actif : le flux passe par la track, on skip le GET JPEG mais on
    // garde la boucle vivante pour reprendre le polling si le P2P tombe.
    if (state.webrtcActive) {
      if (generation === _remotePollGeneration && state.remoteCamMode === "controller" && !document.hidden) {
        _remotePollTimer = setTimeout(poll, 1000);
      }
      return;
    }
    _remotePollBusy = true;
    try {
      const result = await remoteFetchBlob(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame?t=${Date.now()}`, { cache: "no-store" }, 1500);
      const res = result.response;
      if (res.status === 204) {
        consecutiveFailures = 0;
        state.remoteLastFramePublishedAt = result.frameAt || state.remoteLastFramePublishedAt || 0;
        state.remoteFrameAgeMs = state.remoteLastFramePublishedAt ? Date.now() - state.remoteLastFramePublishedAt : null;
        if (state.remoteFrameAgeMs > 4500) {
          setRemoteConnectionStatus("degraded", "Caméra jumelée mais aucune frame récente");
        } else if (state.remoteConnectionState !== "connected") {
          setRemoteConnectionStatus("connecting", "En attente de la première frame caméra…");
        }
        return;
      }
      if (!res.ok) {
      if (res.status === 404) {
        consecutiveFailures = 0;
        // Le contrôleur a été révoqué (dé-jumelage auto côté serveur après
        // perte du contrôleur, ou session purgée). On nettoie puis on rouvre
        // la sélection d'appareil : la caméra est redevenue visible.
        const wasConnected = state.remoteConnectionState === "connected";
        disconnectRemoteCamera({ silent: true });
        if (state.deviceRole === "interface") {
          setRemoteConnectionStatus("waiting", wasConnected ? "Interface déconnectée — re-sélectionnez la caméra" : "Session caméra expirée — re-sélectionnez la caméra");
          reopenDeviceSelection();
        } else {
          setRemoteConnectionStatus("error", "Session caméra expirée — reconnectez la caméra");
        }
        return;
      }
        consecutiveFailures = Math.min(6, consecutiveFailures + 1);
        setRemoteConnectionStatus("reconnecting", "Réseau interrompu — nouvelle tentative…");
        return;
      }
      consecutiveFailures = 0;
      const blob = result.blob;
      state.remoteLastFramePublishedAt = result.frameAt || Date.now();
      state.remoteLastFrameReceivedAt = Date.now();
      state.remoteLastFrameId = result.response.headers.get("x-mb-frame-id") || state.remoteLastFrameId;
      state.remoteFrameAgeMs = result.frameAt ? Math.max(0, Date.now() - result.frameAt) : 0;
      if (!blob || !blob.size || !_remotePreviewCanvas || generation !== _remotePollGeneration) return;
      const frame = await decodeRemoteFrame(blob);
      if (!_remotePreviewCanvas || generation !== _remotePollGeneration) { frame.close(); return; }
      // Ne redimensionne le backing store que si la taille de la frame change.
      // Le redimensionner à chaque image provoquait des allocations GPU répétées.
      if (_remotePreviewCanvas.width !== frame.width || _remotePreviewCanvas.height !== frame.height) {
        _remotePreviewCanvas.width = frame.width;
        _remotePreviewCanvas.height = frame.height;
      }
      // Calque l'image en object-fit:cover pour éviter l'étirement.
      // Le canvas backing store reste à la taille native de la frame,
      // le CSS width/height=100% étire → on contre avec le crop.
      const canvasEl = _remotePreviewCanvas;
      const cw = canvasEl.offsetWidth, ch = canvasEl.offsetHeight;
      if (cw && ch && (frame.width !== cw || frame.height !== ch)) {
        const frameRatio = frame.width / frame.height;
        const canvasRatio = cw / ch;
        let sx = 0, sy = 0, sw = frame.width, sh = frame.height;
        if (frameRatio > canvasRatio) {
          sw = frame.height * canvasRatio;
          sx = (frame.width - sw) / 2;
        } else {
          sh = frame.width / canvasRatio;
          sy = (frame.height - sh) / 2;
        }
        try {
          const ctx = canvasEl.getContext("2d");
          ctx.drawImage(frame.source, sx, sy, sw, sh, 0, 0, cw, ch);
        } finally {
          frame.close();
        }
      } else {
        try {
          const ctx = canvasEl.getContext("2d");
          ctx.drawImage(frame.source, 0, 0);
        } finally {
          frame.close();
        }
      }
      feedCustomizerRemotePreview();
      state.remoteCamW = _remotePreviewCanvas.width;
      state.remoteCamH = _remotePreviewCanvas.height;
      setRemoteConnectionStatus("connected", "Flux caméra reçu");
    } catch {
      consecutiveFailures = Math.min(6, consecutiveFailures + 1);
      setRemoteConnectionStatus("reconnecting", "Réseau interrompu — nouvelle tentative…");
    }
    finally {
      if (generation === _remotePollGeneration) _remotePollBusy = false;
      if (generation === _remotePollGeneration && state.remoteCamMode === "controller" && !document.hidden) {
        // Cadence rapide quand tout va bien (le flux paraît live), backoff
        // léger en cas de panne pour ne ni saturer Modal ni vider la batterie.
        const delay = consecutiveFailures ? Math.min(2500, 500 * (2 ** Math.min(2, consecutiveFailures - 1))) : 330;
        _remotePollTimer = setTimeout(poll, delay);
      }
    }
  };
  void poll();
}

function stopRemotePolling() {
  _remotePollGeneration += 1;
  _remotePollBusy = false;
  if (_remotePollTimer) { clearTimeout(_remotePollTimer); clearInterval(_remotePollTimer); _remotePollTimer = null; }
  if (_remotePollResourceActive) {
    telemetry.resourceStop("activePollers", { role: "interface" });
    _remotePollResourceActive = false;
  }
  // Coupe la peer connection interface (answerer). La caméra gère la sienne.
  closeWebrtcPeer("stopRemotePolling");
}

/* ─── WebRTC côté interface (answerer) ───
   - Ouvre le socket Socket.IO avec auth interface (controllerToken comme key)
   - Crée RTCPeerConnection (pas de track locale : on ne fait que recevoir)
   - Écoute "webrtc:offer" → setRemoteDescription + createAnswer + emit answer
   - Échange les ICE candidates via "webrtc:ice"
   - Sur pc.ontrack, branche le stream entrant sur _remotePreviewCanvas
   - Sur iceConnectionState "connected"/"completed", pose webrtcActive = true
   - Sur "webrtc:peer-left" ou iceConnectionState "failed/disconnected", fallback polling */
async function initInterfaceWebrtc(generation) {
  if (generation !== _remotePollGeneration) return;
  if (state.webrtcActive || state.webrtcPC) return;
  const myGen = ++_webrtcInitGeneration;
  // Côté interface, state.remoteCamToken EST le controllerToken (délivré au pair).
  const socket = buildWebRtcSocket({ token: state.remoteCamToken, role: "interface", key: state.remoteCamToken });
  if (!socket) { state.webrtcSignalingFailed = true; return; }
  state.webrtcSocket = socket;
  state.webrtcPeerLeft = false;
  state.webrtcSignalingFailed = false;
  socket.on("connect_error", () => { if (myGen === _webrtcInitGeneration) state.webrtcSignalingFailed = true; });
  socket.on("disconnect", () => {
    if (myGen === _webrtcInitGeneration) state.webrtcActive = false;
  });
  socket.on("webrtc:offer", async (offer) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    try {
      await state.webrtcPC.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await state.webrtcPC.createAnswer();
      await state.webrtcPC.setLocalDescription(answer);
      state.webrtcSocket.emit("webrtc:answer", answer);
    } catch (err) {
      console.warn("[MomentoBooth][webrtc] answer KO:", err?.message || err);
      state.webrtcSignalingFailed = true;
    }
  });
  socket.on("webrtc:ice", async (candidate) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    try { if (candidate) await state.webrtcPC.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch { /* ICE race */ }
  });
  socket.on("webrtc:peer-left", () => {
    if (myGen !== _webrtcInitGeneration) return;
    state.webrtcPeerLeft = true;
    state.webrtcActive = false;
  });
  socket.connect();

  const pc = await makeRtcPeerConnection(null);
  if (myGen !== _webrtcInitGeneration || !pc) { state.webrtcSignalingFailed = true; return; }
  state.webrtcPC = pc;

  pc.ontrack = (event) => {
    if (myGen !== _webrtcInitGeneration) return;
    const stream = event.streams?.[0];
    if (!stream) return;
    state.webrtcRemoteStream = stream;
    // Branche le flux P2P sur le canvas d'aperçu via un <video> éphémère.
    // On réutilise _remotePreviewCanvas (déjà créé par connectRemoteCamera).
    if (!_remotePreviewCanvas) {
      _remotePreviewCanvas = document.createElement("canvas");
      _remotePreviewCanvas.id = "remote-preview";
      _remotePreviewCanvas.style.cssText = "position:absolute;inset:0;z-index:6;width:100%;height:100%;background:#000;";
      const zone = $("camera-zone");
      if (zone) zone.appendChild(_remotePreviewCanvas);
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);
    video.play().catch(() => {});
    const drawFrame = () => {
      if (myGen !== _webrtcInitGeneration || !state.webrtcActive) { video.remove(); return; }
      if (video.videoWidth && _remotePreviewCanvas) {
        if (_remotePreviewCanvas.width !== video.videoWidth) _remotePreviewCanvas.width = video.videoWidth;
        if (_remotePreviewCanvas.height !== video.videoHeight) _remotePreviewCanvas.height = video.videoHeight;
        _remotePreviewCanvas.getContext("2d").drawImage(video, 0, 0);
        state.remoteCamW = _remotePreviewCanvas.width;
        state.remoteCamH = _remotePreviewCanvas.height;
        state.remoteLastFrameReceivedAt = Date.now();
        feedCustomizerRemotePreview();
      }
      requestAnimationFrame(drawFrame);
    };
    requestAnimationFrame(drawFrame);
  };
  pc.oniceconnectionstatechange = () => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    const s = state.webrtcPC.iceConnectionState;
    if (s === "connected" || s === "completed") {
      state.webrtcActive = true;
      state.webrtcSignalingFailed = false;
      setRemoteConnectionStatus("connected", "Flux caméra (WebRTC P2P)");
      telemetry.emit("webrtc-connected", { role: "interface" });
    } else if (s === "failed" || s === "disconnected" || s === "closed") {
      state.webrtcActive = false;
      if (s === "failed") state.webrtcSignalingFailed = true;
    }
  };
  pc.onicecandidate = (event) => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcSocket) return;
    state.webrtcSocket.emit("webrtc:ice", event.candidate || null);
  };
  pc.onconnectionstatechange = () => {
    if (myGen !== _webrtcInitGeneration || !state.webrtcPC) return;
    if (state.webrtcPC.connectionState === "failed") {
      state.webrtcActive = false;
      state.webrtcSignalingFailed = true;
    }
  };
  // Si aucune offer n'arrive dans les ~8 s, on marque signaling failed → le
  // polling JPEG prend le relais. On ne coupe pas la socket (reconnexion auto).
  setTimeout(() => {
    if (myGen !== _webrtcInitGeneration) return;
    if (!state.webrtcActive && !state.webrtcSignalingFailed) {
      // Laisse encore une chance : la caméra peut avoir un cold start long.
      // On ne marque failed que si vraiment aucune offer n'a été vue.
      if (!state.webrtcPC?.remoteDescription) {
        // Pas fatal : le polling reste actif. On garde la socket ouverte.
      }
    }
  }, 8000);
}

/* Telecharge la derniere frame distante et retourne un canvas (pour la capture). */
async function grabRemoteFrame() {
  if (!state.remoteCamToken) return null;
  try {
    const result = await remoteFetchBlob(`/api/remote-camera/${encodeURIComponent(state.remoteCamToken)}/frame?t=${Date.now()}`, { cache: "no-store" }, 1500);
    const res = result.response;
    if (!res.ok || !result.blob) return null;
    const frame = await decodeRemoteFrame(result.blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.getContext("2d").drawImage(frame.source, 0, 0);
      return canvas;
    } finally {
      frame.close();
    }
  } catch { return null; }
}

async function renderGallery() {
  const carouselView = $("gallery-carousel-view");
  const gridView = $("gallery-grid-view");
  const grid = $("gallery-grid");

  if (state.galleryMode === "carousel" && carouselView) {
    carouselView.innerHTML = '<div class="mb-loading-block"><div class="mb-spinner large" role="status" aria-label="Chargement de la galerie"></div>Chargement…</div>';
  } else if (grid) {
    grid.innerHTML = '<div class="mb-loading-block"><div class="mb-spinner large" role="status" aria-label="Chargement de la galerie"></div>Chargement…</div>';
  }

  const photos = await loadLocal();
  let serverPhotos = [];
  try {
    const headers = state.guestToken && state.guestHostKey
      ? { "x-guest-token": state.guestToken, "x-guest-host-key": state.guestHostKey }
      : {};
    const response = await fetch("/api/photos", { cache: "no-store", headers });
    if (response.ok) serverPhotos = (await response.json()).photos ?? [];
  } catch { /* serveur optionnel */ }

  const serverById = new Map(serverPhotos.map((p) => [p.id, p]));
  const unique = new Map();
  photos.forEach((p) => unique.set(p.serverId || p.id, p));
  serverPhotos.forEach((p) => { if (!unique.has(p.id)) unique.set(p.id, p); });
  const all = [...unique.values()].sort((a, b) => (b.date ?? b.createdAt ?? 0) - (a.date ?? a.createdAt ?? 0));
  $("gallery-count").textContent = `${all.length} photo${all.length > 1 ? "s" : ""}`;

  // Mode sélection multiple : on purge les entrées qui n'existent plus.
  if (_gallerySelection.size) {
    const alive = new Set(all.map((p) => p.serverId || p.id));
    for (const entry of [..._gallerySelection]) if (!alive.has(entry.key)) _gallerySelection.delete(entry);
  }
  updateGallerySelectionBar();

  if (!all.length) {
    const emptyMsg = '<div class="gallery-carousel-placeholder">Aucune photo — touchez l\u2019écran pour commencer !</div>';
    if (state.galleryMode === "carousel" && carouselView) {
      carouselView.innerHTML = emptyMsg;
    } else if (grid) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:60px 20px;font-size:18px;font-weight:700">Aucune photo — touchez l\u2019écran pour commencer !</p>';
    }
    $("gallery-counter").textContent = "0 / 0";
    $("gallery-prev").hidden = true;
    $("gallery-next").hidden = true;
    return;
  }

  state.galleryPhotos = all;
  if (state.galleryMode === "carousel") {
    state.galleryPage = Math.min(state.galleryPage, all.length - 1);
    if (state.galleryPage < 0) state.galleryPage = 0;
  }
  if (!all.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:60px 20px;font-size:18px;font-weight:700">Aucune photo — touchez l\u2019écran pour commencer !</p>';
    return;
  }
  // --- Helpers carrousel ---
  function buildPhotoCard(photo, index) {
    const selectKey = photo.serverId || photo.id;
    const selectEntry = { key: selectKey, localId: photo.id, serverId: photo.serverId || null, deleteToken: photo.deleteToken || "", isServer: Boolean(photo.serverId || serverById.has(photo.id)) };
    const canDeleteServer = Boolean((state.guestToken && state.guestHostKey) || photo.deleteToken);
    const isSelected = () => [..._gallerySelection].some((entry) => entry.key === selectKey);

    const wrap = document.createElement("div");
    wrap.className = "gallery-carousel-slide";
    wrap.dataset.index = String(index);

    const img = document.createElement("img");
    img.src = photo.blob ? URL.createObjectURL(photo.blob) : (serverById.get(photo.id)?.url ?? "");
    if (photo.blob) {
      const galleryUrl = img.src;
      img.addEventListener("load", () => setTimeout(() => URL.revokeObjectURL(galleryUrl), 1000), { once: true });
    }
    img.className = photo.mediaType === "gif" ? "gallery-gif" : "";
    img.alt = photo.comment ? `Photo ${index + 1}: ${photo.comment}` : `Photo ${index + 1}`;
    img.draggable = false;

    // Click : ouvrir le détail de cette photo
    img.addEventListener("click", async () => {
      if (state.galleryMode === "grid") return; // la grille a son propre handler
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

    // Appui long → mode sélection multiple
    let longTimer = null;
    const onPointerDown = (e) => {
      if (state.galleryMode === "grid") return;
      longTimer = setTimeout(() => {
        longTimer = null;
        beginGallerySelectDelete();
        // Coche cette photo directement
        const existing = [..._gallerySelection].find((entry) => entry.key === selectKey);
        if (existing) _gallerySelection.delete(existing);
        else _gallerySelection.add(selectEntry);
        updateGallerySelectionBar();
        renderCarouselPage();
      }, 500);
    };
    const onPointerUp = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };
    const onPointerLeave = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };
    const onPointerCancel = () => { if (longTimer) { clearTimeout(longTimer); longTimer = null; } };
    img.addEventListener("pointerdown", onPointerDown);
    img.addEventListener("pointerup", onPointerUp);
    img.addEventListener("pointerleave", onPointerLeave);
    img.addEventListener("pointercancel", onPointerCancel);
    img.addEventListener("contextmenu", (e) => e.preventDefault());

    wrap.appendChild(img);

    // Badges
    const ts = photo.date ?? photo.createdAt ?? null;
    if (ts) {
      const timeBadge = document.createElement("span");
      timeBadge.className = "gallery-time";
      timeBadge.textContent = new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      wrap.appendChild(timeBadge);
    }
    if (photo.comment) {
      const badge = document.createElement("span");
      badge.className = "gallery-comment";
      badge.textContent = "💬";
      badge.title = photo.comment;
      wrap.appendChild(badge);
    }
    if (state.deleteEnabled && !_gallerySelecting && (!selectEntry.isServer || canDeleteServer)) {
      const delBtn = document.createElement("button");
      delBtn.className = "gallery-delete";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Supprimer cette photo ?")) return;
        await deletePhoto(photo.id, photo.serverId || photo.id, Boolean(photo.serverId || serverById.has(photo.id)), photo.deleteToken || "");
        renderGallery();
      });
      wrap.appendChild(delBtn);
    }
    if (_gallerySelecting) {
      wrap.classList.toggle("selected", isSelected());
      const check = document.createElement("span");
      check.className = "gallery-select-check";
      check.textContent = isSelected() ? "✓" : "";
      wrap.appendChild(check);
    }
    return wrap;
  }

  function renderGalleryPills() {
    const container = $("gallery-pills");
    if (!container || !all.length) { if (container) container.innerHTML = ""; return; }
    const maxPills = 40;
    const step = all.length > maxPills ? Math.ceil(all.length / maxPills) : 1;
    let html = "";
    for (let i = 0; i < all.length; i += step) {
      const active = i === state.galleryPage;
      html += `<button type="button" class="gallery-pill${active ? " active" : ""}" data-gallery-index="${i}" aria-label="Photo ${i + 1}" aria-current="${active ? "true" : "false"}">${i + 1}</button>`;
    }
    container.innerHTML = html;
    container.querySelectorAll(".gallery-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.galleryIndex);
        if (!isNaN(i)) goToGalleryPageIndex(i);
      });
    });
  }

  function renderCarouselPage() {
    if (!carouselView) return;
    const idx = state.galleryPage;
    const photo = all[idx];
    if (!photo) return;
    state.galleryPage = idx;
    $("gallery-counter").textContent = `${idx + 1} / ${all.length}`;
    $("gallery-prev").hidden = idx <= 0;
    $("gallery-next").hidden = idx >= all.length - 1;
    carouselView.innerHTML = "";
    const slide = buildPhotoCard(photo, idx);
    carouselView.appendChild(slide);
    renderGalleryPills();
  }

  function goToGalleryPage(delta) {
    const idx = Math.max(0, Math.min(all.length - 1, state.galleryPage + delta));
    state.galleryPage = idx;
    renderCarouselPage();
  }

  function goToGalleryPageIndex(i) {
    state.galleryPage = Math.max(0, Math.min(all.length - 1, i));
    renderCarouselPage();
  }

  if (state.galleryMode === "carousel") {
    renderCarouselPage();
  } else {
    grid.innerHTML = "";
    all.forEach((photo, i) => {
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
      img.alt = `Photo ${i + 1}`;
      const selectKey = photo.serverId || photo.id;
      const selectEntry = { key: selectKey, localId: photo.id, serverId: photo.serverId || null, deleteToken: photo.deleteToken || "", isServer: Boolean(photo.serverId || serverById.has(photo.id)) };
      const canDeleteServer = Boolean((state.guestToken && state.guestHostKey) || photo.deleteToken);
      const isSelected = () => [..._gallerySelection].some((entry) => entry.key === selectKey);
      img.addEventListener("click", async () => {
        if (_gallerySelecting) {
          if (selectEntry.isServer && !canDeleteServer) { toast("Jeton de suppression indisponible pour cette ancienne photo"); return; }
          const existing = [..._gallerySelection].find((entry) => entry.key === selectKey);
          if (existing) _gallerySelection.delete(existing);
          else _gallerySelection.add(selectEntry);
          wrap.classList.toggle("selected", isSelected());
          updateGallerySelectionBar();
          return;
        }
        let blob = photo.blob;
        let url = img.src || "";
        if (!blob && !url) {
          try {
            const response = await fetch(serverById.get(photo.id)?.url, { cache: "no-store" });
            if (!response.ok) throw new Error("photo introuvable");
            blob = await response.blob();
            url = URL.createObjectURL(blob);
          } catch { toast("Photo indisponible"); return; }
        } else if (blob && !url) {
          url = URL.createObjectURL(blob);
        }
        if (!url) return;
        const lb = $("gallery-lightbox");
        const lbImg = $("lightbox-img");
        if (lb && lbImg) {
          _lightboxUrl = url;
          lbImg.src = url;
          lb.setAttribute("aria-hidden", "false");
          return;
        }
        _lightboxUrl = url;
        const isGif = photo.mediaType === "gif" || blob.type === "image/gif";
        if (isGif) { state.latestGif = blob; state.latestPhoto = null; state.selectedResultKind = "gif"; }
        else { state.latestPhoto = blob; state.latestGif = null; state.selectedResultKind = "photo"; }
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
      const ts = photo.date ?? photo.createdAt ?? null;
      if (ts) {
        const timeBadge = document.createElement("span");
        timeBadge.className = "gallery-time";
        timeBadge.textContent = new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        wrap.appendChild(timeBadge);
      }
      if (photo.comment) {
        const badge = document.createElement("span");
        badge.className = "gallery-comment";
        badge.textContent = "💬";
        badge.title = photo.comment;
        wrap.appendChild(badge);
      }
      if (state.deleteEnabled && !_gallerySelecting && (!selectEntry.isServer || canDeleteServer)) {
        const delBtn = document.createElement("button");
        delBtn.className = "gallery-delete";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", async (event) => {
          event.stopPropagation();
          if (!confirm("Supprimer cette photo ?")) return;
          await deletePhoto(photo.id, photo.serverId || photo.id, Boolean(photo.serverId || serverById.has(photo.id)), photo.deleteToken || "");
          renderGallery();
        });
        wrap.appendChild(delBtn);
      }
      if (_gallerySelecting) {
        wrap.classList.toggle("selected", isSelected());
        const check = document.createElement("span");
        check.className = "gallery-select-check";
        check.textContent = isSelected() ? "✓" : "";
        wrap.appendChild(check);
      }
      grid.appendChild(wrap);
    });
  }
}

async function deletePhoto(localId, serverId = null, isServer = false, deleteToken = "") {
  // Le serveur est supprimé en premier : une erreur de clé, de réseau ou de
  // permission ne doit pas faire disparaître la seule copie locale.
  if (isServer) {
    try {
      const organizerSession = loadOrganizerSession();
      const headers = state.guestToken && state.guestHostKey
        ? { "x-guest-token": state.guestToken, "x-guest-host-key": state.guestHostKey }
        : {
            ...(deleteToken ? { "x-photo-delete-token": deleteToken } : {}),
            ...(organizerSession ? { "x-organizer-token": organizerSession.token } : {}),
          };
      const response = await fetch(`/api/photos/${serverId || localId}`, { method: "DELETE", headers });
      if (!response.ok && response.status !== 404) {
        toast(response.status === 403 ? "Suppression serveur non autorisée" : "Suppression serveur impossible");
        return;
      }
    } catch {
      toast("Serveur indisponible — photo conservée");
      return;
    }
  }
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
  toast("Photo supprimée");
}

/* ---------- Suppression multiple (organisateur, code vérifié côté serveur) ---------- */
function updateGallerySelectionBar() {
  const bar = $("gallery-select-bar");
  const count = $("gallery-select-count");
  if (bar) bar.hidden = !_gallerySelecting;
  if (count) count.textContent = `${_gallerySelection.size} sélectionnée${_gallerySelection.size > 1 ? "s" : ""}`;
}
function cancelGallerySelectDelete() {
  _gallerySelecting = false;
  _gallerySelection.clear();
  updateGallerySelectionBar();
  renderGallery();
}
async function confirmGalleryDelete() {
  if (!_gallerySelection.size) { toast("Aucune photo sélectionnée"); return; }
  const authorized = await requestOrganizerAccess("Code organisateur pour confirmer la suppression :");
  if (!authorized) return;
  const total = _gallerySelection.size;
  let done = 0;
  // Chaque entrée stocke { key, localId, serverId, isServer } pour supprimer
  // aussi bien la copie locale (id auto-incrément IndexedDB) que le fichier serveur.
  for (const entry of [..._gallerySelection]) {     await deletePhoto(entry.localId, entry.serverId || entry.key, entry.isServer, entry.deleteToken || "");
    done++;
    const count = $("gallery-select-count");
    if (count) count.textContent = `${done}/${total}…`;
  }
  _gallerySelecting = false;
  _gallerySelection.clear();
  updateGallerySelectionBar();
  renderGallery();
  toast(`${total} photo${total > 1 ? "s" : ""} supprimée${total > 1 ? "s" : ""}`);
}
function beginGallerySelectDelete() {
  _gallerySelecting = true;
  _gallerySelection.clear();
  updateGallerySelectionBar();
  renderGallery();
  toast("Touchez les photos à supprimer, puis validez");
}
/* Export ZIP : le serveur effectue le traitement lourd ; aucun fallback JSzip local.
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
    const line2 = input2.value.trim() || `${state.eventHost2 || "Lilou"} & ${state.eventHost1 || "Kenza"}`;
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
    const ctx = canvas.getContext("2d");     ctx.drawImage(img, 0, 0);
     drawFrame(ctx, W, H, state.frameId, state.frameText);
     drawLogo(ctx, W, H);
     drawCustomOverlays(ctx, W, H);
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
  /* En Interface, les réglages pilotent uniquement la Caméra jumelée.
     Le serveur filtre la liste des propriétés acceptées ; aucun secret n'est
     envoyé dans cette file de commandes. */
  const remoteControls = {
    "set-portrait": "portraitMode",
    "set-burst": "burstMode",
    "set-quality": "qualityMax",
    "set-performance": "performanceMode",
    "set-track": "trackEnabled",
    "set-idle": "idleEnabled",
    "set-idle-face": "idleFaceWake",
    "set-preroll": "prerollEnabled",
    "set-film-bubble": "filmBubbleEnabled",
    "set-emoji-faces": "emojiFacesEnabled",
    "set-light-frame": "lightFrameEnabled",
    "set-logo": "logoEnabled",
  };
  Object.entries(remoteControls).forEach(([id, name]) => on(id, "change", (event) => remoteSendSetting(name, event.target.type === "checkbox" ? event.target.checked : event.target.value)));
  document.querySelectorAll("#flash-modes button").forEach((button) => button.addEventListener("click", () => remoteSendSetting("flashMode", button.dataset.flash)));
  document.querySelectorAll("#auto-delay-modes button").forEach((button) => button.addEventListener("click", () => remoteSendSetting("autoDelay", Number(button.dataset.delay))));

  // Picker de thème : 4 vignettes cliquables (Midnight / Studio / Party / Pearl).
  // L'UI est rendue par index.html, le state est géré par applyUiCustomization().
  document.querySelectorAll("#theme-picker .theme-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.themeOption;
      if (!["midnight", "studio", "party", "pearl"].includes(next)) return;
      state.uiTheme = next;
      applyUiCustomization();
      saveUiCustomization();
      // Sync visuelle (état actif).
      document.querySelectorAll("#theme-picker .theme-swatch").forEach((b) => {
        const active = b.dataset.themeOption === state.uiTheme;
        b.classList.toggle("active", active);
        b.setAttribute("aria-checked", active ? "true" : "false");
      });
      toast(`Thème : ${state.uiTheme}`);
    });
  });

  // Picker d'accent custom : color input.
  const accentInput = $("set-ui-accent");
  if (accentInput) {
    accentInput.addEventListener("input", () => {
      state.uiAccent = /^#[0-9a-fA-F]{6}$/.test(accentInput.value) ? accentInput.value : "";
      applyUiCustomization();
      saveUiCustomization();
    });
  }

  // Segmented : taille du texte (90/100/115/130/145 %).
  document.querySelectorAll("#ui-text-scale button").forEach((button) => {
    button.addEventListener("click", () => {
      const v = Number(button.dataset.scale);
      if (!Number.isFinite(v)) return;
      state.uiTextScale = v;
      applyUiCustomization();
      saveUiCustomization();
      document.querySelectorAll("#ui-text-scale button").forEach((b) => b.classList.toggle("active", Number(b.dataset.scale) === v));
      toast(`Texte : ${v}%`);
    });
  });

  // Segmented : taille des boutons (90/100/115/135 %).
  document.querySelectorAll("#ui-button-scale button").forEach((button) => {
    button.addEventListener("click", () => {
      const v = Number(button.dataset.bscale);
      if (!Number.isFinite(v)) return;
      state.uiButtonScale = v;
      applyUiCustomization();
      saveUiCustomization();
      document.querySelectorAll("#ui-button-scale button").forEach((b) => b.classList.toggle("active", Number(b.dataset.bscale) === v));
      toast(`Boutons : ${v}%`);
    });
  });

  // Nom d'appareil (sélection d'appareil / découverte).
  const deviceNameInput = $("device-name-input");
  if (deviceNameInput) {
    deviceNameInput.value = getDeviceName();
    deviceNameInput.addEventListener("change", () => {
      const name = setDeviceName(deviceNameInput.value);
      deviceNameInput.value = name;
      toast(name ? `Nom : ${name}` : "Nom par défaut restauré");
    });
  }
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
  on("set-logo", "change", (e) => {
    state.logoEnabled = e.target.checked;
    if (state.logoEnabled) void ensureLogoForCapture();
    savePreferences();
    toast(state.logoEnabled ? "Logo ajouté aux photos" : "Logo retiré des photos");
  });
  // Rôle de l'appareil : changement possible à tout moment (corrige un rôle
  // « Interface » mémorisé qui cachait la caméra locale sans aucun moyen de
  // la retrouver depuis l'interface).
  document.querySelectorAll(".settings-row [data-device-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.deviceRole;
      if (role === state.deviceRole) return;
      setDeviceRole(role);
      savePreferences();
      syncPreferenceControls();
      toast(`Rôle : ${DEVICE_ROLES[role]?.label || role}`);
      if (role === "interface") {
        try { state.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
        telemetry.cameraStop();
        state.stream = null;
        camera.style.visibility = "hidden";
      } else if (!state.stream) {
        camera.style.visibility = "visible";
        startCamera().catch(() => {});
      }
    });
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
  on("set-camera-framing", "change", (e) => {
    state.cameraFraming = e.target.checked;
    document.body.setAttribute("data-camera-framing", state.cameraFraming ? "centered" : "fill");
    savePreferences();
    toast(state.cameraFraming ? "Caméra centrée entre les boutons" : "Caméra plein écran");
  });
  function broadcastSettings(changedId) {
    try {
      const payload = {};
      document.querySelectorAll('#sheet-settings [data-setting]').forEach((el) => {
        const key = el.getAttribute('data-setting');
        if (!key) return;
        if (el.type === 'checkbox') payload[key] = el.checked;
        else if (el.tagName === 'SELECT') payload[key] = el.value;
        else payload[key] = el.value;
      });
      if (changedId) payload.changed = changedId;
      localStorage.setItem('momentobooth-last-settings-broadcast', JSON.stringify({ ts: Date.now(), payload }));
    } catch { /* storage blocked */ }
  }

  on("set-glass", "change", (e) => {
    state.glassEnabled = e.target.checked;
    savePreferences();
    broadcastSettings('set-glass');
  });
  on("set-countdown-fixed", "change", (e) => {
    state.countdownFixed = e.target.checked;
    savePreferences();
    broadcastSettings('set-countdown-fixed');
  });
  on("set-capture-disabled", "change", (e) => {
    state.captureDisabled = e.target.checked;
    savePreferences();
    broadcastSettings('set-capture-disabled');
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
  on("set-emoji-faces", "change", (e) => {
    state.emojiFacesEnabled = e.target.checked;
    savePreferences();
    toast(state.emojiFacesEnabled ? "Emojis par visage activés 😜" : "Emojis par visage désactivés");
  });
  on("btn-prank-bug", "click", () => remoteSendSetting("prankBug", true));
  on("btn-prank-text", "click", () => {
    const text = $("prank-text-input")?.value.trim() || "SURPRISE ! 🎉";
    remoteSendSetting("prankText", text.slice(0, 80));
    toast("Texte envoyé à la caméra");
  });
  on("prank-text-input", "keydown", (event) => { if (event.key === "Enter") $("btn-prank-text")?.click(); });
  on("btn-prank-sound", "click", async () => {
    const url = ($("prank-sound-url")?.value || "").trim();
    if (!url) { toast("Collez d'abord une URL .mp3 de MyInstants"); return; }
    try { new URL(url); } catch { toast("URL invalide"); return; }
    remoteSendSetting("prankSound", url.slice(0, 300));
    toast("Son envoyé à la caméra");
  });
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
  // Le logo est géré par le réglage `set-logo` dans le groupe Photo.
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
    savePreferences();
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
  on("btn-camera-stop", "click", () => {
    if (state.deviceRole !== "camera") return;
    state.cameraStopRequested = true;
    _cameraRequestId += 1;
    _cameraRestartPending = false;
    stopRemoteCamera();
    stopLightMonitor();
    try { state.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    telemetry.cameraStop();
  state.stream = null;
    camera.srcObject = null;
    setRemoteConnectionStatus("offline", "Caméra arrêtée");
    const button = $("btn-camera-stop");
    if (button) { button.textContent = "Caméra arrêtée"; button.disabled = true; }
    toast("Caméra arrêtée");
  });
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
on("btn-flip", "click", () => {
  // En Interface (contrôleur distant), le flip est envoyé à la Caméra ;
  // sinon c'est la caméra locale qui se retourne directement.
  if (state.remoteCamMode === "controller") {
    remoteSendSetting("flipCamera", true);
    toast("Retournement envoyé à la caméra");
  } else {
    flipCamera();
  }
});
on("btn-retry-camera", "click", async () => {
  const errorEl = $("camera-error");
  const title = errorEl?.querySelector(".camera-error-title");
  const text = errorEl?.querySelector(".camera-error-text");
  if (title) title.textContent = "Caméra indisponible";
  if (text) text.textContent = "Autorisez l'accès à la caméra dans Safari : Réglages > Safari > Caméra, puis rechargez.";
  if (errorEl) errorEl.classList.add("hidden");
  // Relance idempotente : libère réellement l'ancien flux puis redémarre.
  stopCamera({ lifecycle: true });
  state.cameraStopRequested = false;
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
}, { passive: true });	on("btn-settings", "click", () => openSheet("sheet-settings"));
	/* Un seul chemin d'ouverture de la galerie : le bouton du haut et celui de
	   la barre du bas pointent ici (plus de doublon de comportement). */
	function openGallery() {
	  pauseLiveProcessing();
	  screens.capture.classList.remove("active");
	  screens.result.classList.remove("active");
	  screens.gallery.classList.add("active");
	  // v124.0.7 — QR code géant de la galerie publique
	  const galleryUrl = `${location.origin}/api/gallery`;
	  const qrImg = document.getElementById("gallery-qr-image");
	  if (qrImg) qrImg.src = `/api/qr?url=${encodeURIComponent(galleryUrl)}`;
	  void renderGallery();
	}
/* ---------- FEAT-A: Écran de découverte cards swipeable ---------- */
function openDiscover() {
  pauseLiveProcessing();
  screens.capture.classList.remove("active");
  screens.result.classList.remove("active");
  screens.gallery.classList.remove("active");
  screens.discover.classList.add("active");
  // Reset scroll position
  const cardsEl = $("discover-cards");
  if (cardsEl) cardsEl.scrollTop = 0;
  updateDiscoverDots();
}
function closeDiscover() {
  screens.discover.classList.remove("active");
  screens.capture.classList.add("active");
  resumeLiveProcessing();
}
function updateDiscoverDots() {
  const cardsEl = $("discover-cards");
  const dots = document.querySelectorAll("#discover-dots .dot");
  if (!cardsEl || !dots.length) return;
  const idx = Math.round(cardsEl.scrollTop / cardsEl.clientHeight);
  dots.forEach((d, i) => d.classList.toggle("active", i === idx));
}
// Scroll event for dots
{
  const cardsEl = $("discover-cards");
  if (cardsEl) {
    cardsEl.addEventListener("scroll", updateDiscoverDots, { passive: true });
  }
}
// "Voir en action" buttons
document.querySelectorAll(".discover-card-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const card = e.target.closest(".discover-card");
    if (!card) return;
    const action = card.dataset.action;
    closeDiscover();
    switch (action) {
      case "gallery": openGallery(); break;
      case "countdown": state.countdownEnabled = true; void takePhoto(); break;
      case "filters": $("photo-filter-rail")?.classList.add("open"); break;
      case "pairing": $("btn-camera-mode")?.click(); break;
      case "customizer": openCustomizer(); break;
    }
  });
});
// Back button
on("btn-discover-back", "click", closeDiscover);
// Header button
on("btn-discover-top", "click", openDiscover);

on("guest-share-close", "click", closeGuestSharePanel);
on("btn-trash-access", "click", openTrashPanel);
on("trash-close", "click", closeTrashPanel);
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

// ==== Nouveaux boutons de la barre du bas ====
// v124.0.7 — le bouton blanc lance directement le countdown (plus de CTA intermédiaire).
// Le CTA géant reste disponible mais n'est plus le seul chemin pour shooter.
on("btn-shutter", "click", () => {
  if (state.counting) return;
  startCountdown();
});
on("btn-timer-trigger", "click", () => {
  openSheet("sheet-timer");
});
// v124.0.7 — "tap to shoot" : un tap n'importe où dans la zone caméra déclenche la photo.
// Ne pas tirer si le tap est sur un bouton, un sheet ouvert, ou en idle.
if (cameraZone) {
  cameraZone.addEventListener("pointerdown", (event) => {
    if (state.counting) return;
    if (document.body.classList.contains("idle")) return;
    if (!screens.capture?.classList.contains("active")) return;
    // Ignorer les taps sur les éléments interactifs (boutons, filtres, sheets)
    const target = event.target;
    if (target.closest("button, a, input, select, textarea, [role='button'], [role='dialog'], .sheet, .filter-rail-card, .bottom-bar, .tool-btn, .shutter-btn")) return;
    startCountdown();
  }, { passive: true });
}

document.querySelectorAll(".sheet-close").forEach((btn) => {
  btn.addEventListener("click", () => closeSheet(btn.closest(".sheet")));
});
document.querySelectorAll(".share-chip:not(.no-method)").forEach((btn) => {
  btn.addEventListener("click", () => shareMethod(btn.dataset.method));
});
/* P1.6 — drawer export: trigger + items */
const drawerTrigger = $("btn-share-drawer");
const drawer = $("share-drawer");
const drawerClose = $("btn-share-drawer-close");
if (drawerTrigger && drawer) {
  drawerTrigger.addEventListener("click", () => {
    const open = drawer.classList.toggle("open");
    drawer.setAttribute("aria-hidden", String(!open));
    drawerTrigger.setAttribute("aria-expanded", String(open));
  });
}
if (drawerClose && drawer) {
  drawerClose.addEventListener("click", () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    if (drawerTrigger) drawerTrigger.setAttribute("aria-expanded", "false");
  });
}
document.querySelectorAll(".share-drawer-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const method = btn.dataset.method;
    if (method) void shareMethod(method);
    if (drawer) { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); if (drawerTrigger) drawerTrigger.setAttribute("aria-expanded", "false"); }
  });
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

const SHEET_TRIGGERS = {
  "sheet-timer": "btn-timer-trigger",
  "sheet-backdrop": "btn-backdrop",
  "sheet-settings": "btn-settings",
  "sheet-frames": ["btn-frames", "btn-reframe"],
};
let _sheetReturnFocus = null;
const SHEET_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

function sheetFocusables(sheet) {
  return [...(sheet?.querySelectorAll(SHEET_FOCUSABLE_SELECTOR) || [])]
    .filter((element) => element.getClientRects().length > 0);
}

function closeSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  if (sheet.id === "sheet-settings") stopCameraDiscovery();
  for (const triggerId of [].concat(SHEET_TRIGGERS[sheet.id] || [])) $(triggerId)?.setAttribute("aria-expanded", "false");
  if (_sheetReturnFocus && document.contains(_sheetReturnFocus)) _sheetReturnFocus.focus();
  _sheetReturnFocus = null;
}
document.addEventListener("keydown", (event) => {
  const open = Object.values(sheetMap).find((sheet) => sheet?.classList.contains("open"));
  if (!open) return;
  // Une feuille peut rester ouverte sous un dialogue secondaire (customizer,
  // effets, partage invités, demande de pairage). Le dialogue au-dessus
  // possède alors la priorité clavier et gère son propre retour de focus.
  if (document.querySelector(".pair-request-popup, #customizer.open, .donation-popup.open, #fx-panel.open, #guest-share-panel.open")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet(open);
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = sheetFocusables(open);
  if (!focusables.length) return;
  const current = document.activeElement;
  const index = focusables.indexOf(current);
  const nextIndex = event.shiftKey
    ? (index <= 0 ? focusables.length - 1 : index - 1)
    : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
  if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusables.length - 1)) {
    event.preventDefault();
    focusables[nextIndex].focus();
  }
});

// v125.0.0 — Navigation carrousel galerie : clavier et tactile
document.addEventListener("keydown", (event) => {
  const gallery = screens.gallery;
  if (!gallery?.classList.contains("active")) return;
  if (state.galleryMode !== "carousel") return;
  if (event.key === "ArrowLeft") { event.preventDefault(); goToGalleryPage(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); goToGalleryPage(1); }
});

function initGalleryCarouselTouch() {
  const stage = document.querySelector(".gallery-carousel-stage");
  if (!stage) return;
  stage.addEventListener("touchstart", (e) => {
    if (state.galleryMode !== "carousel") return;
    if (e.touches.length === 1) {
      state.gallerySwipeStartX = e.touches[0].clientX;
      state.gallerySwipeStartY = e.touches[0].clientY;
    }
  }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (state.galleryMode !== "carousel") return;
    const dx = (e.changedTouches[0]?.clientX || 0) - state.gallerySwipeStartX;
    const dy = (e.changedTouches[0]?.clientY || 0) - state.gallerySwipeStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      goToGalleryPage(dx < 0 ? 1 : -1);
    }
  });
}

function initGalleryControls() {
  on("gallery-prev", "click", () => goToGalleryPage(-1));
  on("gallery-next", "click", () => goToGalleryPage(1));
  on("gallery-toggle-view", "click", () => {
    state.galleryMode = state.galleryMode === "carousel" ? "grid" : "carousel";
    const carouselView = $("gallery-carousel");
    const gridView = $("gallery-grid-view");
    if (carouselView) carouselView.hidden = state.galleryMode !== "carousel";
    if (gridView) gridView.hidden = state.galleryMode !== "grid";
    const toggle = $("gallery-toggle-view");
    if (toggle) toggle.textContent = state.galleryMode === "carousel" ? "⊞" : "⇆";
    if (state.galleryMode === "carousel") state.galleryPage = 0;
    renderGallery();
  });
  initGalleryCarouselTouch();

  /* Lightbox pour clic photo en mode grille */
  let _lightboxUrl = null;
  const lightbox = $("gallery-lightbox");
  const lightboxImg = $("lightbox-img");
  if (lightbox && lightboxImg) {
    on("lightbox-close", "click", () => {
      if (_lightboxUrl) { URL.revokeObjectURL(_lightboxUrl); _lightboxUrl = null; }
      lightboxImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      lightbox.setAttribute("aria-hidden", "true");
    });
    on("lightbox-download", "click", async () => {
      const src = lightboxImg.src;
      if (!src || src.includes("data:image/gif")) return;
      try {
        const r = await fetch(src);
        const blob = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `momentobooth-${Date.now()}.jpg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("Téléchargée ✓");
      } catch { toast("Téléchargement impossible"); }
    });
    on("lightbox-share", "click", async () => {
      const src = lightboxImg.src;
      if (!src || src.includes("data:image/gif")) return;
      try {
        const r = await fetch(src);
        const blob = await r.blob();
        const text = "Ma photo MomentoBooth";
        if (navigator.canShare && navigator.canShare({ files: [new File([blob], "photo.jpg", { type: blob.type })] })) {
          const file = new File([blob], "photo.jpg", { type: blob.type });
          await navigator.share({ title: "MomentoBooth", text, files: [file] });
        } else if (navigator.share) {
          await navigator.share({ title: "MomentoBooth", text });
        } else {
          await navigator.clipboard.writeText(text);
          toast("Lien copié ✓");
        }
      } catch { /* canceled */ }
    });
    on("lightbox-save", "click", async () => {
      const src = lightboxImg.src;
      if (!src || src.includes("data:image/gif")) return;
      try {
        const r = await fetch(src);
        const blob = await r.blob();
        await saveToPhotos(blob);
      } catch { toast("Sauvegarde impossible"); }
    });
  }
}

function openSheet(id) {
  const target = sheetMap[id];
  if (!target) return;
  _sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  Object.entries(sheetMap).forEach(([key, el]) => {
    const active = key === id;
    el.classList.toggle("open", active);
    el.setAttribute("aria-hidden", String(!active));
    for (const triggerId of [].concat(SHEET_TRIGGERS[key] || [])) $(triggerId)?.setAttribute("aria-expanded", String(active));
  });
  // Donner immédiatement un point d'entrée clavier au panneau, sans
  // attendre une transition CSS qui pourrait être désactivée.
  requestAnimationFrame(() => {
    if (target.classList.contains("open")) sheetFocusables(target)[0]?.focus();
  });
  // Liste des caméras dans Réglages → Appareils : découverte active pendant
  // l'ouverture de la feuille (jamais en concurrence avec le role-gate).
  if (id === "sheet-settings") {
    startCameraDiscovery((cameraId, cameraName) => {
      connectToCamera(cameraId, cameraName, (token) => {
        connectRemoteCamera(token);
      }, (text) => {
        const statusEl = $("remote-status-text");
        if (statusEl) statusEl.textContent = text;
        toast(text);
      });
    });
  } else if (!$("role-gate")?.classList.contains("open")) {
    stopCameraDiscovery();
  }
}
/* Piège de focus + Échap génériques pour les panneaux plein écran hors du
   système `.sheet` (effets, mode organisateur, partage invités) : même
   comportement clavier/accessibilité que les sheets (Tab cyclique, Échap
   pour fermer, retour de focus au déclencheur). */
function bindDialogFocusTrap(panelId, onEscape) {
  let returnFocus = null;
  document.addEventListener("keydown", (event) => {
    const el = $(panelId);
    if (!el || !el.classList.contains("open")) return;
    if (event.key === "Escape") { event.preventDefault(); onEscape(); return; }
    if (event.key !== "Tab") return;
    const focusables = sheetFocusables(el);
    if (!focusables.length) return;
    const index = focusables.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (index <= 0 ? focusables.length - 1 : index - 1)
      : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
    if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusables.length - 1)) {
      event.preventDefault();
      focusables[nextIndex].focus();
    }
  });
  return {
    onOpen() {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requestAnimationFrame(() => {
        const el = $(panelId);
        if (el?.classList.contains("open")) sheetFocusables(el)[0]?.focus();
      });
    },
    onClose() {
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
      returnFocus = null;
    },
  };
}
const fxPanelTrap = bindDialogFocusTrap("fx-panel", closeFxPanel);
const customizerTrap = bindDialogFocusTrap("customizer", discardCustomizer);
const guestShareTrap = bindDialogFocusTrap("guest-share-panel", closeGuestSharePanel);
const trashPanelTrap = bindDialogFocusTrap("trash-panel", closeTrashPanel);
/* Aperçu LIVE de l'éditeur : en Interface (pas de caméra locale), on branche le
   canvas distant dès qu'une frame arrive. `captureStream` est testé au vol ; si
   indisponible, le poster est rafraîchi une fois par seconde au lieu d'être figé. */
/* ════════════════════════════════════════════════════════════
   PERSONNALISATION PAR COMPOSANT (customizer « double »)
   Registre des éléments de l'écran capture personnalisables :
   position (ancre + décalage), taille, opacité, couleur d'accent,
   visibilité, ordre dans la barre. Chaque réglage s'applique EN
   DIRECT sur la vraie borne et sur l'aperçu (ghosts cliquables).
   ════════════════════════════════════════════════════════════ */
const UI_COMPONENTS = {
  bottomBar: { label: "Barre d'outils", icon: "🛠️", selector: ".bottom-bar", positionable: true, anchor: "bc", native: true },
  auto:      { label: "Auto", icon: "⭕", selector: "#btn-auto", orderable: true },
  backdrop:  { label: "Fond", icon: "🖼️", selector: "#btn-backdrop", orderable: true },
  flip:      { label: "Retourner", icon: "🔄", selector: "#btn-flip", orderable: true },
  settings:  { label: "Réglages", icon: "⚙️", selector: "#btn-settings", orderable: true },
  gallery:   { label: "Galerie", icon: "🖼️", selector: "#btn-gallery-top", positionable: true, anchor: "tr" },
  fx:        { label: "Effets", icon: "✨", selector: "#btn-fx-top", positionable: true, anchor: "tc" },
  customizeQuick: { label: "Perso rapide", icon: "🎨", selector: "#btn-customize-quick", positionable: true, anchor: "tr", offsetX: -112, managed: true },
  rail:      { label: "Filtres couleurs", icon: "🌈", selector: "#photo-filter-rail", positionable: true, anchor: "mr", native: true },
  countdown: { label: "Compte à rebours", icon: "⏱️", selector: "#countdown", sizeable: true },
  qr:        { label: "QR galerie", icon: "🔳", selector: "#tablet-qr-access", positionable: true, anchor: "tl", managed: true },
};
const UI_COMPONENT_DEFAULTS = { hidden: false, opacity: 100, size: 100, color: "", anchor: "mc", offsetX: 0, offsetY: 0, order: 1, _moved: false };
const UI_COMPONENT_COLORS = ["", "#FFD166", "#7EE5A7", "#FF7196", "#8B9CFF", "#FFFFFF"];
const UI_ANCHOR_MAP = { tl: [0, 0], tc: [.5, 0], tr: [1, 0], ml: [0, .5], mc: [.5, .5], mr: [1, .5], bl: [0, 1], bc: [.5, 1], br: [1, 1] };

let _selectedComponent = null;
function componentState(key) {
  const meta = UI_COMPONENTS[key] || {};
  if (!state.uiComponents[key] || typeof state.uiComponents[key] !== "object") {
    state.uiComponents[key] = { ...UI_COMPONENT_DEFAULTS, anchor: meta.anchor || "mc", offsetX: meta.offsetX || 0, order: 1 };
  }
  const cfg = state.uiComponents[key];
  // Bornage des valeurs (anciennes ou corrompues).
  cfg.opacity = Math.max(20, Math.min(100, Number(cfg.opacity) || 100));
  cfg.size = Math.max(55, Math.min(165, Number(cfg.size) || 100));
  cfg.offsetX = Math.max(-120, Math.min(120, Number(cfg.offsetX) || 0));
  cfg.offsetY = Math.max(-120, Math.min(120, Number(cfg.offsetY) || 0));
  cfg.order = Math.max(1, Math.min(4, Number(cfg.order) || 1));
  cfg.hidden = cfg.hidden === true;
  cfg._moved = cfg._moved === true;
  cfg.color = typeof cfg.color === "string" ? cfg.color : "";
  if (!UI_ANCHOR_MAP[cfg.anchor]) cfg.anchor = meta.anchor || "mc";
  return cfg;
}

/* Positionne un élément flottant : ancre (9 points) + décalage en px.
   Les rangées haute/basse respectent les encoches de sécurité iOS, et la
   barre d'outils garde sa largeur et son espacement natifs par défaut. */
function placeComponent(key, el, cfg) {
  const [ax, ay] = UI_ANCHOR_MAP[cfg.anchor] || [.5, .5];
  const x = Number(cfg.offsetX) || 0;
  const y = Number(cfg.offsetY) || 0;
  el.style.right = "auto";
  el.style.bottom = "auto";
  let top, left;
  if (ay === 1) top = `calc(100% - var(--safe-bottom) - 10px + ${y}px)`;
  else if (ay === 0) top = `calc(var(--safe-top) + 14px + ${y}px)`;
  else top = `calc(${ay * 100}% + ${y}px)`;
  if (ax === 1) left = `calc(100% - 14px + ${x}px)`;
  else if (ax === 0) left = `calc(14px + ${x}px)`;
  else left = `calc(${ax * 100}% + ${x}px)`;
  el.style.top = top;
  el.style.left = left;
  el.style.transform = `translate(-${ax * 100}%, -${ay * 100}%)`;
  if (key === "bottomBar") el.style.width = "min(92%, 430px)";
}

/* Applique le réglage d'un composant sur le VRAI élément de l'interface. */
function applyComponentToDom(key) {
  const meta = UI_COMPONENTS[key];
  if (!meta) return;
  const el = document.querySelector(meta.selector);
  if (!el) return;
  const cfg = componentState(key);
  // Opacité / taille : inline uniquement quand l'utilisateur les a modifiées,
  // pour ne jamais écraser les états CSS de l'app (veille, animations…).
  if (cfg.opacity >= 100) el.style.opacity = "";
  else el.style.opacity = String(cfg.opacity / 100);
  if (cfg.size >= 100) el.style.scale = "";
  else el.style.scale = String(cfg.size / 100);
  // Position : les composants « natifs » (barre d'outils, demi-roue du rail)
  // ne bougent que si l'utilisateur les a explicitement déplacés. Sinon on
  // nettoie toute position inline résiduelle pour revenir au style natif.
  if (meta.positionable && (!meta.native || cfg._moved)) placeComponent(key, el, cfg);
  else if (meta.positionable) {
    el.style.left = ""; el.style.top = ""; el.style.right = ""; el.style.bottom = ""; el.style.transform = ""; el.style.width = "";
  }
  // Visibilité : « Masquer » force toujours display:none. En revanche on ne
  // ré-affiche pas les composants dont l'app gère elle-même la visibilité
  // (QR tablette, bouton perso rapide) pour ne pas contredire sa logique.
  if (cfg.hidden) el.style.display = "none";
  else if (!meta.managed) el.style.display = "";
  if (meta.orderable) el.style.order = String(cfg.order || 1);
  if (cfg.color) { el.style.color = cfg.color; el.style.borderColor = cfg.color; }
  else { el.style.color = ""; el.style.borderColor = ""; }
}

/* Ghosts de l'aperçu : réplique cliquable de l'interface sur la vidéo. */
function buildCustomizerGhosts() {
  const box = $("customizer-ghosts");
  if (!box) return;
  box.innerHTML = "";
  const mkGhost = (key, cls) => {
    const meta = UI_COMPONENTS[key];
    const ghost = document.createElement("button");
    ghost.type = "button";
    ghost.className = `cmp-ghost ${cls || ""}`;
    ghost.dataset.cmp = key;
    ghost.setAttribute("aria-label", `Personnaliser ${meta.label}`);
    const label = document.createElement("span");
    label.className = "cmp-ghost-label";
    label.textContent = `${meta.icon} ${meta.label}`;
    ghost.appendChild(label);
    ghost.addEventListener("click", (event) => { event.stopPropagation(); selectComponent(key); });
    return ghost;
  };
  // Réplique de la barre d'outils (conteneur + 4 boutons, ordre réel).
  const barGhost = mkGhost("bottomBar", "cmp-ghost-bar");
  const orderKeys = ["auto", "backdrop", "flip", "settings"]
    .slice()
    .sort((a, b) => (componentState(a).order || 1) - (componentState(b).order || 1));
  orderKeys.forEach((key) => {
    const chip = mkGhost(key, "cmp-ghost-tool");
    chip.textContent = UI_COMPONENTS[key].icon;
    barGhost.appendChild(chip);
  });
  box.appendChild(barGhost);
  // Éléments flottants positionnés par ancre.
  Object.keys(UI_COMPONENTS).forEach((key) => {
    const meta = UI_COMPONENTS[key];
    if (key === "bottomBar" || !meta.positionable) return;
    const ghost = mkGhost(key, "cmp-ghost-float");
    ghost.textContent = meta.icon;
    box.appendChild(ghost);
  });
  // Compte à rebours (non déplaçable, ghost fixé en haut au centre).
  const cd = mkGhost("countdown", "cmp-ghost-countdown");
  cd.textContent = UI_COMPONENTS.countdown.icon;
  box.appendChild(cd);
  applyCustomizerGhostVisuals();
}

/* Reflète l'état (position, taille, opacité, visibilité) sur les ghosts,
   sans reconstruire le DOM → les réglages restent fluides pendant le drag. */
function applyCustomizerGhostVisuals() {
  const box = $("customizer-ghosts");
  if (!box) return;
  box.querySelectorAll(".cmp-ghost").forEach((ghost) => {
    const key = ghost.dataset.cmp;
    const meta = UI_COMPONENTS[key];
    const cfg = componentState(key);
    ghost.style.opacity = String(Math.max(0.3, cfg.opacity / 100));
    ghost.style.scale = String(cfg.size / 100);
    ghost.classList.toggle("ghost-hidden", cfg.hidden);
    if (meta.positionable && key !== "bottomBar") placeComponent(key, ghost, cfg);
    if (cfg.color) { ghost.style.color = cfg.color; ghost.style.borderColor = cfg.color; }
    else { ghost.style.color = ""; ghost.style.borderColor = ""; }
  });
  const bar = box.querySelector('[data-cmp="bottomBar"]');
  if (bar) {
    const barCfg = componentState("bottomBar");
    placeComponent("bottomBar", bar, barCfg);
    bar.style.opacity = String(Math.max(0.3, barCfg.opacity / 100));
    bar.style.scale = String(barCfg.size / 100);
    bar.classList.toggle("ghost-hidden", barCfg.hidden);
    // Tri des boutons selon leur ordre personnalisé.
    const chips = [...bar.querySelectorAll(".cmp-ghost-tool")]
      .sort((a, b) => (componentState(a.dataset.cmp).order || 1) - (componentState(b.dataset.cmp).order || 1));
    chips.forEach((chip) => bar.appendChild(chip));
  }
  refreshComponentSelection();
}

function buildComponentChips() {
  const box = $("customizer-component-chips");
  if (!box) return;
  box.innerHTML = "";
  Object.keys(UI_COMPONENTS).forEach((key) => {
    const meta = UI_COMPONENTS[key];
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cmp-chip";
    chip.dataset.cmp = key;
    chip.setAttribute("role", "tab");
    chip.innerHTML = `${meta.icon} ${meta.label}`;
    chip.addEventListener("click", () => selectComponent(key));
    box.appendChild(chip);
  });
}

function refreshComponentSelection() {
  document.querySelectorAll(".cmp-ghost").forEach((g) => g.classList.toggle("selected", g.dataset.cmp === _selectedComponent));
  document.querySelectorAll(".cmp-chip").forEach((c) => c.classList.toggle("active", c.dataset.cmp === _selectedComponent));
}

function selectComponent(key) {
  _selectedComponent = key;
  refreshComponentSelection();
  buildPropsPanel(key);
}

function buildPropsPanel(key) {
  const box = $("customizer-props");
  if (!box) return;
  const meta = UI_COMPONENTS[key];
  const cfg = componentState(key);
  const parts = [];
  parts.push(`<div class="prop-head"><b>${meta.icon} ${meta.label}</b><button type="button" class="mini-btn" id="prop-reset">Réinitialiser</button></div>`);
  if (meta.positionable) {
    parts.push(`<div class="prop-group"><div class="prop-label">Position</div><div class="prop-grid">${Object.keys(UI_ANCHOR_MAP).map((a) => `<button type="button" class="prop-dot${cfg.anchor === a ? " active" : ""}" data-anchor="${a}" aria-label="Position ${a}"></button>`).join("")}</div></div>`);
    parts.push(`<div class="prop-row"><label>Horizontal</label><input type="range" min="-120" max="121" step="2" value="${cfg.offsetX}" data-prop="offsetX"><output>${cfg.offsetX}px</output></div>`);
    parts.push(`<div class="prop-row"><label>Vertical</label><input type="range" min="-120" max="121" step="2" value="${cfg.offsetY}" data-prop="offsetY"><output>${cfg.offsetY}px</output></div>`);
  }
  if (meta.orderable) {
    parts.push(`<div class="prop-row"><label>Place dans la barre</label><div class="prop-order">${[1, 2, 3, 4].map((n) => `<button type="button" class="prop-dot${(cfg.order || 1) === n ? " active" : ""}" data-order="${n}">${n}</button>`).join("")}</div></div>`);
  }
  parts.push(`<div class="prop-row"><label>Taille</label><input type="range" min="55" max="165" step="5" value="${cfg.size}" data-prop="size"><output>${cfg.size}%</output></div>`);
  parts.push(`<div class="prop-row"><label>Opacité</label><input type="range" min="20" max="100" step="5" value="${cfg.opacity}" data-prop="opacity"><output>${cfg.opacity}%</output></div>`);
  parts.push(`<div class="prop-row"><label>Couleur</label><div class="prop-swatches">${UI_COMPONENT_COLORS.map((c) => `<button type="button" class="prop-swatch${cfg.color === c ? " active" : ""}" data-color="${c}" style="${c ? `background:${c}` : "background:linear-gradient(135deg,#6a6f84,#23293c); border-style:dashed"}" aria-label="${c || "Couleur native"}"></button>`).join("")}</div></div>`);
  parts.push(`<div class="prop-row"><label class="customizer-toggle"><input type="checkbox" data-prop="hidden" ${cfg.hidden ? "checked" : ""}><span>Masquer ce composant</span></label></div>`);
  box.innerHTML = parts.join("");
  // Liaisons : clics (position, ordre, couleur, reset) → mise à jour + refresh.
  box.querySelectorAll(".prop-dot[data-anchor]").forEach((button) => button.addEventListener("click", () => updateComponent(key, { anchor: button.dataset.anchor })));
  box.querySelectorAll("[data-order]").forEach((button) => button.addEventListener("click", () => updateComponent(key, { order: Number(button.dataset.order) })));
  box.querySelectorAll(".prop-swatch").forEach((swatch) => swatch.addEventListener("click", () => updateComponent(key, { color: swatch.dataset.color })));
  const reset = $("prop-reset");
  if (reset) reset.addEventListener("click", () => resetComponent(key));
  // Sliders : mise à jour EN DIRECT sans reconstruire le panneau (focus gardé).
  box.querySelectorAll("input[data-prop]").forEach((input) => {
    const prop = input.dataset.prop;
    const out = input.nextElementSibling;
    input.addEventListener("input", () => {
      const value = prop === "hidden" ? input.checked : Number(input.value);
      if (out && out.tagName === "OUTPUT") out.textContent = prop === "hidden" ? "" : `${value}${prop === "size" || prop === "opacity" ? "%" : "px"}`;
      componentState(key)[prop] = value;
      applyUiCustomization();
    });
  });
}

function updateComponent(key, patch) {
  const cfg = componentState(key);
  Object.assign(cfg, patch);
  // Un déplacement explicite « déverrouille » les composants natifs (rail).
  if ("anchor" in patch || "offsetX" in patch || "offsetY" in patch) cfg._moved = true;
  applyUiCustomization();
  selectComponent(key);
}

function resetComponent(key) {
  const meta = UI_COMPONENTS[key];
  state.uiComponents[key] = { ...UI_COMPONENT_DEFAULTS, anchor: meta.anchor || "mc", offsetX: meta.offsetX || 0, order: 1 };
  applyUiCustomization();
  selectComponent(key);
  sfxClose();
}

function snapshotUiComponents() {
  state._uiComponentsSnapshot = JSON.stringify(state.uiComponents || {});
}
function restoreUiComponents() {
  try { state.uiComponents = JSON.parse(state._uiComponentsSnapshot || "{}"); } catch { state.uiComponents = {}; }
  state.uiComponents = state.uiComponents && typeof state.uiComponents === "object" ? state.uiComponents : {};
  applyUiCustomization();
}

let _customizerRemoteStream = null;
function feedCustomizerRemotePreview() {
  const panel = $("customizer");
  const live = $("customizer-live-video");
  if (!panel?.classList.contains("open") || !live || !_remotePreviewCanvas) return;
  if (live.srcObject) return; // déjà branché (flux local ou stream distant)
  if (!_customizerRemoteStream && typeof _remotePreviewCanvas.captureStream === "function") {
    try {
      _customizerRemoteStream = _remotePreviewCanvas.captureStream(8);
      live.srcObject = _customizerRemoteStream;
      live.play?.().catch(() => {});
      return;
    } catch { /* captureStream indisponible : repli poster */ }
  }
  const now = Date.now();
  if (!feedCustomizerRemotePreview._last || now - feedCustomizerRemotePreview._last > 1000) {
    feedCustomizerRemotePreview._last = now;
    live.poster = _remotePreviewCanvas.toDataURL("image/jpeg", .6);
  }
}
function openCustomizer() {
  const panel = $("customizer");
  if (!panel) return;
  // Instantané : la croix ✕ ferme SANS enregistrer (modifications annulées).
  snapshotUiComponents();
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  applyUiCustomization();
  buildComponentChips();
  buildCustomizerGhosts();
  selectComponent("bottomBar");
  const live = $("customizer-live-video");
  if (live && state.stream && !live.srcObject) { live.srcObject = state.stream; live.play?.().catch(() => {}); }
  feedCustomizerRemotePreview();
  const preview = $("customizer-preview");
  if (preview) preview.style.filter = liveFilterCss();
  customizerTrap.onOpen();
}
function discardCustomizer() {
  restoreUiComponents();
  closeCustomizer();
  toast("Modifications annulées");
}
function closeCustomizer() {
  const panel = $("customizer");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  const live = $("customizer-live-video");
  if (live) live.srcObject = null;
  if (_customizerRemoteStream) {
    try { _customizerRemoteStream.getTracks().forEach((track) => track.stop()); } catch {}
    _customizerRemoteStream = null;
  }
  customizerTrap.onClose();
}
function bindCustomizer() {
  on("customizer-close", "click", discardCustomizer);
  // btn-customize-access est bindé tôt (avant le role-gate) pour être actif
  // dès l'écran de choix du rôle ; on ne le rebinde pas ici pour éviter un
  // double déclenchement d'openCustomizer().
  on("btn-customize-quick", "click", openCustomizer);
  on("customizer-unlock", "click", async () => {
    const code = $("customizer-code")?.value.trim();
    const status = $("customizer-code-status");
    if (status) status.textContent = "Vérification…";
    try {
      const response = await fetch("/api/organizer/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (status) status.textContent = data.error || "Code incorrect"; return; }
      sessionStorage.setItem(ORGANIZER_SESSION_KEY, JSON.stringify(data));
    } catch { if (status) status.textContent = "Vérification impossible — connexion au serveur requise"; return; }
    $("customizer-lock")?.classList.add("hidden");
    $("customizer-editor")?.classList.remove("hidden");
    if (status) status.textContent = "";
    openCustomizer();
  });
  on("customizer-code", "keydown", (event) => { if (event.key === "Enter") $("customizer-unlock")?.click(); });
  document.querySelectorAll("#customizer-themes button").forEach((button) => button.addEventListener("click", () => {
    state.uiTheme = button.dataset.theme || "midnight";
    applyUiCustomization();
  }));
  on("customizer-text-scale", "input", (event) => { state.uiTextScale = Number(event.target.value) || 100; applyUiCustomization(); });
  on("customizer-button-scale", "input", (event) => { state.uiButtonScale = Number(event.target.value) || 100; applyUiCustomization(); });
  on("customizer-accent", "input", (event) => { state.uiAccent = /^#[0-9a-fA-F]{6}$/.test(event.target.value) ? event.target.value : ""; applyUiCustomization(); });
  on("customizer-accent-reset", "click", () => { state.uiAccent = ""; applyUiCustomization(); });
  bindEventIdentityFields();
  const asset = (id, key, srcKey) => on(id, "change", async (event) => {
    try { state[srcKey] = await readCustomizationAsset(event.target.files?.[0]); state[key] = state[srcKey]; applyUiCustomization(); } catch { toast("Image impossible à charger"); }
  });
  asset("custom-frame-file", "customFrameSrc", "customFrameSrc");
  asset("custom-border-file", "customBorderSrc", "customBorderSrc");
  on("customizer-reset", "click", () => {
    state.uiTheme = "midnight"; state.uiTextScale = 100; state.uiButtonScale = 100;
    state.customFrameSrc = ""; state.customBorderSrc = "";
    state.customFrameImage = null; state.customBorderImage = null;
    state.idlePhotos = []; state.idlePhotosEnabled = false;
    $("custom-idle-photos-toggle").checked = false;
    state.uiAccent = ""; state.eventHost1 = ""; state.eventHost2 = ""; state.eventWelcome = "";
    // Réinitialise aussi la personnalisation par composant.
    state.uiComponents = {};
    saveUiCustomization();
    applyUiCustomization();
    applyEventIdentity();
    buildComponentChips();
    buildCustomizerGhosts();
    selectComponent("bottomBar");
    toast("Interface réinitialisée");
  });
  // Photos de veille : multi-upload compressé, max 8, puis save.
  on("custom-idle-photos-file", "change", async (event) => {
    try {
      const files = [...(event.target.files || [])].slice(0, 8);
      if (!files.length) return;
      const loaded = [];
      for (const file of files) {
        try { loaded.push(await readCustomizationAsset(file)); } catch {}
      }
      if (!loaded.length) { toast("Aucune image valide"); return; }
      state.idlePhotos = [...(state.idlePhotos || []), ...loaded].slice(-8);
      state.idlePhotosEnabled = true;
      if ($("custom-idle-photos-toggle")) $("custom-idle-photos-toggle").checked = true;
      saveUiCustomization();
      applyUiCustomization();
      toast(`${loaded.length} photo${loaded.length > 1 ? "s" : ""} ajoutée${loaded.length > 1 ? "s" : ""} à la veille`);
    } catch { toast("Impossible de charger les photos"); }
  });
  on("custom-idle-photos-toggle", "change", (event) => { state.idlePhotosEnabled = event.target.checked; saveUiCustomization(); });
  on("customizer-save", "click", async () => { saveUiCustomization(); await loadCustomizationImages(); toast("Interface enregistrée ✓"); closeCustomizer(); });
  $("customizer")?.addEventListener("click", (event) => { if (event.target.id === "customizer") closeCustomizer(); });
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
  });  });

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
    /* Nettoyage de secours : si une ancienne version de l'app.js est servie
       malgré le HTML v85, désenregistre tout contrôleur avant la suite. */
    if (navigator.serviceWorker?.controller && htmlVersion === APP_VERSION && location.search.includes("mb-recover=" + APP_VERSION)) {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
      if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
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
    camera.addEventListener(eventName, () => {
      scheduleAppViewportSync(true);
      if (state.stream && camera.videoWidth > 0) telemetry.startupMark("cameraReady", { width: camera.videoWidth, height: camera.videoHeight, source: eventName });
    }, { passive: true });
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
    stopRemotePublishing();
    stopLightMonitor();
    stopPreroll();
    releaseFxCards();
    stopAnimation();
    gifStopPre(true);
    releaseWakeLock();
    if (_detectFaceTimer) { clearInterval(_detectFaceTimer); _detectFaceTimer = null; }
    if (state.landmarker?.close) { try { state.landmarker.close(); } catch {} }
    if (state.landmarker) telemetry.resourceStop("activeFaceTrackers", { model: "face-landmarker" });
    state.landmarker = null;
    // Quitter l'application/PWA doit rendre immédiatement la caméra et ses
    // buffers au système, sinon iOS peut conserver la session média en RAM.
    try { state.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    telemetry.cameraStop();
    state.stream = null;
    camera.srcObject = null;      });

  /* ⚠️ 1) RÔLE D'ABORD — aucune permission caméra avant ce choix.
     Le clic sur Caméra/Mixte devient le geste utilisateur Safari/iOS qui
     autorise ensuite getUserMedia ; Interface contourne totalement la caméra. */
  // Le bouton « Personnaliser l'interface » du role-gate doit être actif dès
  // l'ouverture du gate, pas seulement après la validation du rôle : tout le
  // panneau (thème, curseurs, code organisateur, identité événement...) est
  // donc câblé ici, tôt. Rien dans bindCustomizer() ne dépend du rôle choisi.
  try {
    $("btn-customize-access")?.addEventListener("click", openCustomizer);
    bindCustomizer();
  } catch { /* customizer indisponible : la borne démarre quand même */ }
  await waitForDeviceRole();
  if (pendingFallbackStream && state.deviceRole !== "interface") {
    state.stream = pendingFallbackStream;
    await ensureCameraPlayback(state.stream, 4);
    if (camera.videoWidth > 0) telemetry.startupMark("cameraReady", { width: camera.videoWidth, height: camera.videoHeight, source: "fallback" });
  } else if (pendingFallbackStream && state.deviceRole === "interface") {
    try { pendingFallbackStream.getTracks?.().forEach((track) => track.stop()); } catch {}
    camera.srcObject = null;
    telemetry.cameraStop();
    state.stream = null;
  }
  /* Si un flux de secours a déjà obtenu la permission, ne la redemande pas. */
  if (state.stream && state.deviceRole !== "interface") {
    camera.style.visibility = "visible";
    camera.hidden = false;
    camera.autoplay = true;
    camera.playsInline = true;
    camera.muted = true;
    void ensureCameraPlayback(state.stream, 3);
    hideSplash();
  } else if (state.deviceRole !== "interface") {
    // `startCamera()` peut déjà être en train d'attendre la permission. Ne
    // masque jamais le preview dans cette course : startCamera() le rendra
    // visible dès que loadedmetadata arrive.
    camera.style.visibility = "visible";
    camera.hidden = false;
    hideSplash();
  } else {
    camera.style.visibility = "hidden";
    hideSplash();
  }

  /* 2) UI — protégée individuellement, ne bloque jamais */
  try { buildBackdropOptions(); } catch {}
  try { buildTimerOptions(); } catch {}
  try { buildFrameOptions(); } catch {}
  try { bindFrameTextEdit(); } catch {}
  try { buildFxPanel(); } catch {}
  try { buildPhotoFilterRail(); } catch {}
  try { bindSettings(); } catch {}
  // bindCustomizer() est désormais appelée tôt, avant waitForDeviceRole() —
  // voir plus haut. Pas de second appel ici (double liaison = double appel
  // serveur au déverrouillage, double toast à l'enregistrement, etc.).
  // Le QR tablette réutilise le lien invité, et crée silencieusement un lien
  // au premier lancement : le bouton reste utile sans étape cachée.
  refreshTabletQr();
  if (window.matchMedia?.("(min-width: 768px)").matches) {
    try {
      const savedGuest = JSON.parse(localStorage.getItem("momentobooth-guest-session") || "null");
      if (!savedGuest?.url || Date.now() >= (savedGuest.expiresAt || 0)) void createGuestLink();
    } catch { void createGuestLink(); }
  }
  on("tablet-qr-open", "click", openGallery);
  on("btn-gallery-top", "click", openGallery);
  on("btn-gallery-select-delete", "click", beginGallerySelectDelete);
  on("gallery-select-cancel", "click", cancelGallerySelectDelete);
  on("gallery-select-confirm", "click", confirmGalleryDelete);
  // Le rôle Caméra publie automatiquement une session distante seulement
  // après le montage des contrôles (le token/QR peut alors être affiché).
  if (state.deviceRole === "camera" && state.stream) {
    if (state.remoteCamMode === "camera" && state.remoteCamToken && state.remoteCamHostKey) {
      showCameraPairing({ pairCode: state.remotePairCode, url: `${location.origin}/?remote=${encodeURIComponent(state.remotePairCode || state.remoteCamToken)}` });
      $("set-remote-camera") && ($("set-remote-camera").checked = true);
      startRemotePublishing();
      startRemoteCommandPolling();
    } else if (state.remoteCamMode === "off") {
      void startRemoteCamera();
    }
  }
  // Précharge uniquement si l'option a été activée sur cette borne ; le logo
  // reste absent des exports par défaut.
  if (state.logoEnabled) void loadLogoImage();

  /* 3) Service worker volontairement non réinstallé.
     Modal est la cible réseau principale ; un ancien SW iOS a déjà bloqué toute
     l'interface en servant un mélange de fichiers. Le script de récupération
     dans index.html purge les anciens contrôleurs/caches, puis l'app reste
     réseau-first et ne recrée pas ce point de panne. */
  console.info("[MomentoBooth] Service Worker désactivé pour la stabilité Modal");

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
let _idlePhotosTimer = null;
let _idleTimer = null;
let _idleTriggeredAt = 0;
let _idlePoke = null;
let _idleOverlayHandler = null;
let _idleTransitionTimer = null;
let _idleSceneTimer = null;
let _idleSceneIndex = 0;
const IDLE_DELAY = 30000; // 30 s sans visage ni interaction (réglable)
const IDLE_SCENE_DELAY = 6500; // chaque écran reste lisible avant le suivant
const IDLE_PHOTOS_DELAY = 6500; // même cadence pour les photos personnalisées

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

function playIdleClickPrompt() {
  const overlay = $("idle-overlay");
  const clickFx = overlay?.querySelector(".idle-click-animation");
  if (!clickFx) return;
  /* Le GIF appartient visuellement à la scène 0 : si le carrousel a avancé,
     on y revient avant de le jouer pour ne jamais déclencher une animation
     cachée derrière une autre scène. */
  setIdleScene(0);
  clickFx.classList.remove("play");
  void clickFx.offsetWidth;
  clickFx.classList.add("play");
  showFilterName("Bonjour !");
  window.setTimeout(() => clickFx.classList.remove("play"), 900);
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
    e.preventDefault();
    e.stopPropagation();
    if (!document.body.classList.contains("idle")) return;
    // BUG-2.1/2.2 — Un seul tap : cache la veille, PAS de countdown/ swipe.
    // L'utilisateur a juste tapé pour enlever la veille. Le countdown se
    // déclenche uniquement via le bouton shutter.
    exitIdle();
    clearTimeout(_idleTransitionTimer);
    _idleTransitionTimer = null;
  };
  overlay?.addEventListener("pointerdown", _idleOverlayHandler);
}


/* Scène de veille « Mur des photos » : déplacée dans
   public/js/modules/idle-wall.js (v122) — import dynamique uniquement
   à la première entrée en veille. Voir enterIdle() plus bas. */
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
  state.idleFaceAbsentSince = 0;
  startIdleScenes();
  updateIdleClock();
  clearInterval(_idleClockTimer);
  _idleClockTimer = setInterval(updateIdleClock, 60000);
  // Veille personnalisée (organisateur) : les photos uploadées remplacent les
  // scènes par défaut et tournent en fondu. Désactivée si aucune photo.
  const photos = (state.idlePhotosEnabled && Array.isArray(state.idlePhotos) && state.idlePhotos.length) ? state.idlePhotos : [];
  document.body.classList.toggle("idle-photos", photos.length > 0);
  const stage = $("idle-photos-stage");
  if (stage) {
    stage.innerHTML = "";
    photos.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      if (i === 0) img.classList.add("active");
      stage.appendChild(img);
    });
  }
  // Scène Mur des photos : import dynamique — le module ne se charge
  // qu'au premier passage en veille. Économise ~70 lignes de parse au
  // démarrage (significatif sur tablette Huawei / iPhone).
  if (!window.__mbIdleWallReady) {
    window.__mbIdleWallReady = true;
    import(`./modules/idle-wall.js?v=${window.APP_VERSION || 122}`)
      .then((mod) => mod.populateIdleWallScene())
      .catch(() => {});
  } else if (typeof window.mbPopulateIdleWall === "function") {
    window.mbPopulateIdleWall();
  }
  clearInterval(_idlePhotosTimer);
  if (photos.length > 1) {
    let index = 0;
    _idlePhotosTimer = setInterval(() => {
      const imgs = stage?.querySelectorAll("img");
      if (!imgs?.length) return;
      imgs[index].classList.remove("active");
      index = (index + 1) % imgs.length;
      imgs[index].classList.add("active");
    }, IDLE_PHOTOS_DELAY);
  }
  console.log("[MomentoBooth] veille activée (30 s inactif)");
}

function exitIdle() {
  clearInterval(_idlePhotosTimer); _idlePhotosTimer = null;
  document.body.classList.remove("idle-photos");
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

/* ════════════════════════════════════════════════════════════
   SPLASH : logo sur fond assorti au logo (bleu dégradé).
   Disparaît en fondu une fois l'interface prête (caméra OK).
   ════════════════════════════════════════════════════════════ */
let _splashDone = false;
function hideSplash() {
  if (_splashDone) return;
  _splashDone = true;
  telemetry.startupMark("uiReady");
  const splash = $("app-splash");
  if (!splash) return;
  const elapsed = performance.now() - (window.__mbBootStartedAt || performance.now());
  const minSplashMs = 850;
  const remaining = Math.max(0, minSplashMs - elapsed);
  setTimeout(() => {
    splash.classList.add("done");
    splash.setAttribute("aria-hidden", "true");
    setTimeout(() => splash.remove(), 600);
  }, remaining);
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
// FPS et taille réels pilotés par perfConfig() (profil éco/équilibré/max) : voir startPreroll().
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
// Le module doit toujours révéler une erreur exploitable au lieu de laisser
// l'interface figée si une régression future survient avant/pendant init().
void init().catch((error) => {
  console.error("[MomentoBooth] démarrage impossible:", error);
  try {
    hideSplash();
    showCamDiag(`démarrage impossible: ${error?.message || "erreur inconnue"}`);
    const cameraError = $("camera-error");
    cameraError?.classList.remove("hidden");
    exitIdle();  // v124.0.12 — empêche l'idle-overlay de bloquer le bouton
    const text = cameraError?.querySelector(".camera-error-text");
    if (text) text.textContent = "MomentoBooth n'a pas pu démarrer complètement. Rechargez la page puis réessayez.";
  } catch { /* même le diagnostic doit rester sans danger */ }
});

// Préchauffe le ping serveur dès l'ouverture (en arrière-plan, non bloquant) :
// au moment de la première capture, on sait déjà si le serveur (local ou Modal)
// est joignable — plus aucune attente de 5 s pendant la photo.

// ── Phase 6 IMPL-B : Anime.js transitions ──
// Monkey-patch screen switching + countdown with anime.js when available.
// Loaded as a classic <script> before core.js; window.anime is global.
(function hookAnimeTransitions() {
  const HAS_ANIME = typeof anime !== 'undefined';

  if (!HAS_ANIME) return; // no-op, CSS fallback stays

  // Wait for app.js to define showResult / showCapture / showGuest / startCountdown
  const install = () => {
    if (typeof showResult !== 'function') return setTimeout(install, 100);

    const _showResult = showResult;
    const _showCapture = showCapture;
    const _startCountdown = startCountdown;

    // ── Animate screen transitions ──
    const animScreenEnter = (screen) => {
      if (!screen) return;
      const children = Array.from(screen.children).filter(c => c.nodeType === 1);
      if (!children.length) return;
      children.forEach(c => { c.style.opacity = '0'; c.style.transform = 'translateY(12px) scale(0.97)'; });
      anime({ targets: children, opacity: [0, 1], translateY: [12, 0], scale: [0.97, 1],
        delay: anime.stagger(55, { start: 0 }), duration: 420, easing: 'easeOutCubic',
        complete: () => children.forEach(c => { c.style.opacity = ''; c.style.transform = ''; }) });
    };

    showResult = function() {
      _showResult.apply(this, arguments);
      animScreenEnter(screens.result);
    };
    showCapture = function() {
      _showCapture.apply(this, arguments);
      animScreenEnter(screens.capture);
    };
    // Also hook guest screen
    if (typeof initGuestMode === 'function') {
      const _initGuestMode = initGuestMode;
      initGuestMode = async function() {
        const result = await _initGuestMode.apply(this, arguments);
        if (result && screens.guest) animScreenEnter(screens.guest);
        return result;
      };
    }

    // ── Animate countdown 3-2-1 ──
    startCountdown = async function() {
      if (state.counting) return;
      state.counting = true;
      state._countdownCancelled = false;
      const countdownToken = {};
      state._countdownToken = countdownToken;
      const countdownIsCurrent = () => state.counting && state._countdownToken === countdownToken && !state._countdownCancelled;
      state.countingPaused = false;
      const pauseBadge = $("countdown-pause");
      if (pauseBadge) pauseBadge.classList.add("hidden");
      countdownEl.classList.remove("paused");
      document.body.classList.add("ui-hidden");
      document.body.classList.add("counting-mode");
      requestWakeLock();
      countdownEl.classList.remove("hidden");
      let remaining = state.timerSeconds;
      countdownNumber.textContent = String(remaining);

      // Initial ring pulse
      const ringEl = countdownEl.querySelector('.countdown-ring');
      if (ringEl) {
        anime({ targets: ringEl, scale: [0.85, 1], duration: 500, easing: 'easeOutCubic',
          complete: () => { ringEl.style.transform = ''; } });
      }

      // Animate the first number
      anime({ targets: countdownNumber, scale: [0.3, 1.15, 1], opacity: [0, 1], translateY: [20, 0],
        duration: 600, easing: 'easeOutElastic(1, .5)' });

      const tick = async () => {
        if (state.countingPaused) {
          await new Promise((resolve) => { state._resumeCountdown = resolve; });
        }
        if (!countdownIsCurrent()) return null;
        sfxTick();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!countdownIsCurrent()) return null;
        remaining -= 1;
        if (remaining > 0) {
          countdownNumber.textContent = String(remaining);
          // Bounce each countdown step
          anime({ targets: countdownNumber, scale: [0.4, 1.2, 1], opacity: [0, 1], translateY: [16, 0],
            duration: 550, easing: 'easeOutElastic(1, .45)' });
          // Ring pulse
          if (ringEl) {
            anime({ targets: ringEl, scale: [0.9, 1], duration: 400, easing: 'easeOutCubic',
              complete: () => { ringEl.style.transform = ''; } });
          }
          return tick();
        }
        sfxFinal();
        countdownEl.classList.add("hidden");
        if (countdownIsCurrent()) await capture();
        return null;
      };
      try {
        await tick();
      } finally {
        if (state._countdownToken !== countdownToken) return;
        countdownEl.classList.add("hidden");
        countdownEl.classList.remove("paused");
        document.body.classList.remove("ui-hidden", "counting-mode");
        releaseWakeLock();
        state.counting = false;
        state.countingPaused = false;
        state._countdownToken = null;
        state._resumeCountdown = null;
        state._countdownCancelled = false;
      }
    };

    console.log('[MomentoBooth] Anime.js transitions + countdown installed ✓');
  };
  install();
})();
setTimeout(() => { void serverProcessUp().catch(() => {}); }, 1500);
