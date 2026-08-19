/* MomentoBooth Phase 3 — UX/PWA progressive enhancement.
   Ce module ne touche ni au transport caméra ni au pairage : il enrichit l'interface
   et reste entièrement tolérant aux navigateurs sans API avancée. */
const PHASE3_VERSION = "117";
const REMOTE_CONFIG_CACHE_KEY = "momentobooth-remote-config-v1";
const DONATION_SHOWN_KEY = "momentobooth-donation-last-shown-v1";

const LOCAL_CONFIG = Object.freeze({
  version: 1,
  donation: Object.freeze({
    enabled: false,
    url: "https://payrequest.me/lvs0",
    title: "Soutenir By l-vs",
    message: "Si ce projet t’est utile, tu peux soutenir sa création.",
    cta: "Soutenir le projet",
    cooldown: 604800,
    priority: "normal",
    showOnStartup: false,
  }),
});

const $ = (id) => document.getElementById(id);
let remoteConfig = LOCAL_CONFIG;
let deferredInstallPrompt = null;
let donationRetryCount = 0;
let debugTimer = null;
const DEBUG_MODE_KEY = "momentobooth-debug-mode-v1";

function safeHttpsUrl(value, fallback = "") {
  try {
    const url = new URL(String(value || fallback));
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function boundedText(value, fallback, max = 160) {
  const text = String(value ?? fallback).trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return text.slice(0, max) || fallback;
}

function sanitizeRemoteConfig(input) {
  const raw = input && typeof input === "object" ? input : {};
  const donation = raw.donation && typeof raw.donation === "object" ? raw.donation : {};
  const suppliedUrl = donation.url == null ? LOCAL_CONFIG.donation.url : safeHttpsUrl(donation.url);
  const url = suppliedUrl || LOCAL_CONFIG.donation.url;
  const cooldown = Number(donation.cooldown);
  const priority = ["low", "normal", "high"].includes(donation.priority) ? donation.priority : "normal";
  return Object.freeze({
    version: Number.isFinite(Number(raw.version)) ? Math.max(1, Math.min(99, Number(raw.version))) : 1,
    donation: Object.freeze({
      enabled: donation.enabled === true && Boolean(suppliedUrl),
      url,
      title: boundedText(donation.title, LOCAL_CONFIG.donation.title, 80),
      message: boundedText(donation.message, LOCAL_CONFIG.donation.message, 220),
      cta: boundedText(donation.cta, LOCAL_CONFIG.donation.cta, 48),
      cooldown: Number.isFinite(cooldown) ? Math.max(3600, Math.min(2592000, cooldown)) : LOCAL_CONFIG.donation.cooldown,
      priority,
      showOnStartup: donation.showOnStartup === true,
    }),
  });
}

function readCachedConfig() {
  try {
    return sanitizeRemoteConfig(JSON.parse(localStorage.getItem(REMOTE_CONFIG_CACHE_KEY) || "null"));
  } catch {
    return LOCAL_CONFIG;
  }
}

async function fetchRemoteConfig() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch("/api/remote-config", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`remote-config-${response.status}`);
    return sanitizeRemoteConfig(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function setRemoteConfig(next) {
  remoteConfig = sanitizeRemoteConfig(next);
  const donationButton = $("btn-open-donation");
  if (donationButton) donationButton.hidden = !remoteConfig.donation.enabled;
  try { localStorage.setItem(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(remoteConfig)); } catch { /* stockage optionnel */ }
  window.dispatchEvent(new CustomEvent("mb-remote-config", { detail: remoteConfig }));
  return remoteConfig;
}

async function loadRemoteConfig() {
  setRemoteConfig(readCachedConfig());
  try { setRemoteConfig(await fetchRemoteConfig()); } catch { /* offline : le fallback local/caché suffit */ }
  return remoteConfig;
}

let donationPreviousFocus = null;
function closeDonation() {
  const popup = $("donation-popup");
  if (!popup) return;
  popup.classList.remove("open");
  popup.setAttribute("aria-hidden", "true");
  donationPreviousFocus?.focus?.();
  donationPreviousFocus = null;
}

function donationWasShownRecently(cooldown) {
  try {
    const last = Number(localStorage.getItem(DONATION_SHOWN_KEY) || 0);
    return last > 0 && Date.now() - last < cooldown * 1000;
  } catch {
    return false;
  }
}

function showDonation(force = false) {
  const donation = remoteConfig.donation;
  const popup = $("donation-popup");
  const gate = $("role-gate");
  if (!popup || !donation.enabled || (!force && !donation.showOnStartup) || (!force && donationWasShownRecently(donation.cooldown))) return false;
  if (gate?.classList.contains("open") && donationRetryCount < 4) {
    donationRetryCount += 1;
    setTimeout(showDonation, 1800);
    return false;
  }
  $("donation-title").textContent = donation.title;
  $("donation-message").textContent = donation.message;
  $("donation-cta").textContent = donation.cta;
  popup.dataset.priority = donation.priority;
  if (popup.classList.contains("open")) return true;
  donationPreviousFocus = document.activeElement;
  popup.classList.add("open");
  popup.setAttribute("aria-hidden", "false");
  $("donation-close")?.focus?.();
  try { localStorage.setItem(DONATION_SHOWN_KEY, String(Date.now())); } catch { /* cooldown optionnel */ }
  return true;
}

function initDonation() {
  $("donation-close")?.addEventListener("click", closeDonation);
  $("btn-open-donation")?.addEventListener("click", () => {
    if (!showDonation(true)) $("diagnostic-status").textContent = "Soutien désactivé par la configuration.";
  });
  $("donation-later")?.addEventListener("click", closeDonation);
  $("donation-popup")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDonation();
  });
  $("donation-cta")?.addEventListener("click", () => {
    const url = safeHttpsUrl(remoteConfig.donation.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    closeDonation();
  });
  window.addEventListener("keydown", (event) => {
    const popup = $("donation-popup");
    if (!popup?.classList.contains("open")) return;
    if (event.key === "Escape") { closeDonation(); return; }
    if (event.key !== "Tab") return;
    const focusables = [$("donation-close"), $("donation-cta"), $("donation-later")].filter((element) => element && !element.disabled);
    if (!focusables.length) return;
    const index = focusables.indexOf(document.activeElement);
    const next = focusables[(index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length];
    event.preventDefault();
    next.focus();
  });
}

function isStandalone() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
}

function updatePwaStatus() {
  const status = $("pwa-mode-status");
  const detail = $("pwa-mode-detail");
  const install = $("btn-install-pwa");
  if (isStandalone()) {
    if (status) status.textContent = "Installée";
    if (detail) detail.textContent = "Mode borne plein écran actif";
    if (install) install.hidden = true;
  } else if (deferredInstallPrompt) {
    if (status) status.textContent = "Prête";
    if (detail) detail.textContent = "Installation disponible sur cet appareil";
    if (install) install.hidden = false;
  } else {
    if (status) status.textContent = "Navigateur";
    if (detail) detail.textContent = "Safari : Partager → Sur l’écran d’accueil";
    if (install) install.hidden = true;
  }
}

async function promptInstall() {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  updatePwaStatus();
  try {
    await promptEvent.prompt();
    await promptEvent.userChoice;
  } catch { /* l'utilisateur peut fermer la fenêtre native */ }
}

function featureState() {
  return {
    version: PHASE3_VERSION,
    standalone: isStandalone(),
    wakeLock: "wakeLock" in navigator,
    webShare: typeof navigator.share === "function",
    fileShare: typeof navigator.canShare === "function",
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    indexedDb: "indexedDB" in window,
    cacheApi: "caches" in window,
    serviceWorker: "serviceWorker" in navigator,
    networkInformation: "connection" in navigator,
    reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  };
}

function diagnosticPayload() {
  let telemetry = null;
  try { telemetry = window.mbTelemetry?.dump?.() || null; } catch { telemetry = null; }
  return {
    app: "MomentoBooth",
    phase: 3,
    generatedAt: new Date().toISOString(),
    location: { protocol: location.protocol, standalone: isStandalone() },
    features: featureState(),
    startup: window.mbTelemetry?.startupSnapshot?.() || null,
    debug: debugSnapshot(),
    telemetry: telemetry ? {
      sessionId: telemetry.sessionId || "",
      eventCount: Array.isArray(telemetry.events) ? telemetry.events.length : 0,
      counters: telemetry.counters || {},
    } : { available: false },
  };
}

function diagnosticText() {
  return JSON.stringify(diagnosticPayload(), null, 2);
}

function readDebugMode() {
  try { return localStorage.getItem(DEBUG_MODE_KEY) === "1"; } catch { return false; }
}

function debugSnapshot() {
  try {
    return window.mbDebugSnapshot?.() || {
      appVersion: PHASE3_VERSION,
      connection: "unavailable",
      resources: window.mbTelemetry?.resourceSnapshot?.() || {},
    };
  } catch (error) {
    return { appVersion: PHASE3_VERSION, error: error?.message || "debug-unavailable" };
  }
}

function renderDebugPanel() {
  const panel = $("debug-panel");
  if (!panel || panel.hidden) return;
  panel.textContent = JSON.stringify(debugSnapshot(), null, 2);
}

function stopDebugTimer() {
  if (debugTimer) { clearInterval(debugTimer); debugTimer = null; }
}
function setDebugMode(enabled, { persist = true } = {}) {
  const active = Boolean(enabled);
  if (persist) {
    try { localStorage.setItem(DEBUG_MODE_KEY, active ? "1" : "0"); } catch {}
  }
  const panel = $("debug-panel");
  if (panel) panel.hidden = !active;
  document.body.classList.toggle("debug-mode", active);
  stopDebugTimer();
  if (active && !document.hidden) {
    renderDebugPanel();
    debugTimer = setInterval(renderDebugPanel, 1000);
  }
  window.dispatchEvent(new CustomEvent("mb-debug-mode", { detail: { enabled: active } }));
}

async function copyDiagnostic() {
  const text = diagnosticText();
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error("clipboard-unavailable");
    $("diagnostic-status").textContent = "Diagnostic copié ✓";
  } catch {
    $("diagnostic-status").textContent = "Copie indisponible — utilisez Exporter.";
  }
}

function downloadDiagnostic() {
  const blob = new Blob([diagnosticText()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `momento-diagnostic-v${PHASE3_VERSION}-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("diagnostic-status").textContent = "Diagnostic exporté ✓";
}

function initPhase3() {
  initDonation();
  $("btn-install-pwa")?.addEventListener("click", promptInstall);
  $("btn-copy-diagnostic")?.addEventListener("click", copyDiagnostic);
  $("btn-download-diagnostic")?.addEventListener("click", downloadDiagnostic);
  const debugToggle = $("set-debug-mode");
  if (debugToggle) {
    debugToggle.checked = readDebugMode();
    debugToggle.addEventListener("change", () => setDebugMode(debugToggle.checked));
  }
  setDebugMode(Boolean(debugToggle?.checked));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDebugTimer();
    else if (debugToggle?.checked) setDebugMode(true, { persist: false });
  });
  window.addEventListener("pagehide", stopDebugTimer);
  window.addEventListener("pageshow", () => {
    if (debugToggle?.checked) setDebugMode(true, { persist: false });
  }, { passive: true });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updatePwaStatus();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updatePwaStatus();
  });
  window.addEventListener("pageshow", updatePwaStatus, { passive: true });
  updatePwaStatus();
  const remoteConfigStartedAt = performance.now();
  void loadRemoteConfig().then(() => {
    window.mbTelemetry?.startupMeasure?.("remoteConfig", performance.now() - remoteConfigStartedAt);
    window.mbTelemetry?.startupMark?.("remoteConfigReady");
    if (remoteConfig.donation.showOnStartup) setTimeout(showDonation, 1100);
  });
  window.mbRemoteConfig = Object.freeze({
    get: () => remoteConfig,
    refresh: loadRemoteConfig,
    features: featureState,
    diagnostic: diagnosticPayload,
  });
  window.dispatchEvent(new CustomEvent("mb-phase3-ready", { detail: { version: PHASE3_VERSION } }));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPhase3, { once: true });
else initPhase3();
