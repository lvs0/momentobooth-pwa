/* MomentoBooth Phase 2 — instrumentation locale, sans image ni secret. */
const MAX_EVENTS = 600;
const VERBOSE_KEY = "momentobooth-telemetry-verbose";
const bootStartedAt = Number(window.__mbBootStartedAt);
const startedAt = Number.isFinite(bootStartedAt) ? bootStartedAt : performance.now();
const randomPart = () => Math.random().toString(36).slice(2, 8);
const sessionId = `mb-${Date.now().toString(36)}-${randomPart()}`;
const events = [];
const counters = Object.create(null);
const RESOURCE_COUNTERS = [
  "activeCameraStreams", "activePublishers", "activePollers", "activeCommandPollers",
  "activeDiscoveryPollers", "activePairRequestPollers", "activeAnimationLoops",
  "activeFaceTrackers", "pendingFetches", "objectUrls", "temporaryCanvases",
];
for (const name of RESOURCE_COUNTERS) counters[name] = 0;
let frameSequence = 0;
let cameraObserver = null;
let lastSummaryAt = 0;
let debugSnapshotProvider = null;
const startupMarks = Object.create(null);
const startupDurations = Object.create(null);

function finite(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function safeEndpoint(input) {
  try {
    const url = new URL(String(input), window.location.origin);
    return `${url.pathname.replace(/[A-Za-z0-9_-]{20,}/g, ":token")}${url.search ? "?…" : ""}`;
  } catch {
    return String(input).replace(/[A-Za-z0-9_-]{20,}/g, ":token").split("?")[0];
  }
}

function safeFields(fields = {}) {
  const output = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/token|key|secret|password|authorization/i.test(key)) continue;
    if (typeof value === "number") output[key] = finite(value);
    else if (["string", "boolean"].includes(typeof value) || value === null) output[key] = value;
  }
  return output;
}

function verboseEnabled() {
  try { return localStorage.getItem(VERBOSE_KEY) === "1"; } catch { return false; }
}

function emit(type, fields = {}, { log = false } = {}) {
  const event = {
    sessionId,
    type,
    ts: Date.now(),
    elapsedMs: finite(performance.now() - startedAt),
    ...safeFields(fields),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  if (log || verboseEnabled()) {
    console.info("[MomentoBooth telemetry]", JSON.stringify(event));
  }
  return event;
}

function increment(name, amount = 1) {
  counters[name] = (counters[name] || 0) + amount;
  return counters[name];
}

function resourceStart(name, fields = {}) {
  const value = increment(name, 1);
  emit("resource-start", { resource: name, active: value, ...fields });
  return value;
}

function resourceStop(name, fields = {}) {
  counters[name] = Math.max(0, (counters[name] || 0) - 1);
  emit("resource-stop", { resource: name, active: counters[name], ...fields });
  return counters[name];
}

function resourceSnapshot() {
  return Object.fromEntries(RESOURCE_COUNTERS.map((name) => [name, counters[name] || 0]));
}

function setDebugSnapshotProvider(provider) {
  debugSnapshotProvider = typeof provider === "function" ? provider : null;
}

function startupMark(name, fields = {}) {
  const key = String(name || "mark");
  if (Object.prototype.hasOwnProperty.call(startupMarks, key)) return startupMarks[key];
  const elapsedMs = finite(performance.now() - startedAt);
  startupMarks[key] = elapsedMs;
  emit("startup-mark", { mark: key, durationMs: elapsedMs, ...fields });
  return elapsedMs;
}

function startupMeasure(name, durationMs, fields = {}) {
  const key = String(name || "measure");
  if (Object.prototype.hasOwnProperty.call(startupDurations, key)) return startupDurations[key];
  const value = finite(durationMs);
  startupDurations[key] = value;
  emit("startup-duration", { measure: key, durationMs: value, ...fields });
  return value;
}

function startupSnapshot() {
  const paints = typeof performance.getEntriesByType === "function"
    ? performance.getEntriesByType("paint")
    : [];
  const navigation = typeof performance.getEntriesByType === "function"
    ? performance.getEntriesByType("navigation")[0]
    : null;
  const firstPaint = paints.find((entry) => entry.name === "first-paint")?.startTime;
  const firstContentfulPaint = paints.find((entry) => entry.name === "first-contentful-paint")?.startTime;
  return {
    // Navigation Timing starts at 0 relative to navigationStart; retaining it
    // explicitly makes the startup report useful even before the module loads.
    navigationStartMs: 0,
    htmlReadyMs: finite(navigation?.domContentLoadedEventStart ?? startupMarks.htmlReady),
    cssReadyMs: startupMarks.cssReady ?? null,
    bootMs: startupMarks.boot ?? startupMarks.jsReady ?? null,
    firstPaintMs: finite(firstPaint ?? startupMarks.firstPaint),
    firstContentfulPaintMs: finite(firstContentfulPaint),
    firstInteractiveMs: startupMarks.firstInteractive ?? null,
    cameraReadyMs: startupMarks.cameraReady ?? null,
    remoteConfigMs: startupDurations.remoteConfig ?? null,
    mediapipeReadyMs: startupMarks.mediapipeReady ?? null,
    marks: { ...startupMarks },
    durations: { ...startupDurations },
  };
}

function frameId(channel = "frame") {
  frameSequence += 1;
  return `${channel}-${frameSequence}`;
}

function recordFrame(channel, fields = {}) {
  const id = fields.frameId || frameId(channel);
  const count = increment(`${channel}Frames`);
  emit("frame", { channel, frameId: id, frameCount: count, ...fields });
  return id;
}

function startNetwork(endpoint, method = "GET", fields = {}) {
  const started = performance.now();
  const requestId = frameId("request");
  resourceStart("pendingFetches", { requestId, endpoint: safeEndpoint(endpoint), method });
  return { requestId, started, endpoint: safeEndpoint(endpoint), method, ...safeFields(fields), pendingTracked: true };
}

function finishNetwork(operation, fields = {}) {
  if (operation?.pendingTracked) {
    operation.pendingTracked = false;
    resourceStop("pendingFetches", { requestId: operation.requestId, endpoint: operation.endpoint });
  }
  const durationMs = performance.now() - operation.started;
  const event = emit("network", {
    endpoint: operation.endpoint,
    method: operation.method,
    durationMs,
    ...operation,
    ...fields,
  });
  if (fields.error || fields.status >= 500) emit("network-error", event, { log: true });
  return event;
}

function measure(name, started, fields = {}) {
  return emit("measure", { name, durationMs: performance.now() - started, ...fields });
}

function measureBlob(canvas, quality, kind = "jpeg") {
  const started = performance.now();
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        emit("jpeg", {
          kind,
          width: canvas.width,
          height: canvas.height,
          quality,
          sizeBytes: blob?.size || 0,
          durationMs: performance.now() - started,
        });
        resolve(blob);
      }, "image/jpeg", quality);
    } catch (error) {
      emit("jpeg-error", { kind, width: canvas.width, height: canvas.height, error: error?.name || "unknown" }, { log: true });
      resolve(null);
    }
  });
}

function memory(label = "sample") {
  const native = performance.memory;
  return emit("memory", {
    label,
    jsUsedBytes: native?.usedJSHeapSize || null,
    jsTotalBytes: native?.totalJSHeapSize || null,
    jsLimitBytes: native?.jsHeapSizeLimit || null,
  });
}

function cameraStart(video, stream, requested = {}) {
  cameraStop();
  resourceStart("activeCameraStreams", { track: "video" });
  const track = stream?.getVideoTracks?.()[0];
  const settings = track?.getSettings?.() || {};
  const requestedFps = requested.frameRate || 30;
  const observer = {
    started: performance.now(),
    frames: 0,
    lastFrameTs: 0,
    lastReported: 0,
    rafId: null,
    timer: null,
    video,
    settings,
    requestedFps,
  };
  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - observer.lastReported < 5000) return;
    const elapsed = Math.max(1, now - observer.started);
    emit("camera-sample", {
      requestedFps,
      observedFps: observer.frames * 1000 / elapsed,
      frameCount: observer.frames,
      width: video?.videoWidth || settings.width || null,
      height: video?.videoHeight || settings.height || null,
      trackWidth: settings.width || null,
      trackHeight: settings.height || null,
      trackFps: settings.frameRate || null,
      intervalMs: observer.lastFrameTs ? now - observer.lastFrameTs : null,
    }, { log: force });
    observer.lastReported = now;
  };
  const onFrame = (now) => {
    observer.frames += 1;
    observer.lastFrameTs = now;
    if (video?.requestVideoFrameCallback && cameraObserver === observer) {
      observer.rafId = video.requestVideoFrameCallback(onFrame);
    }
    report(false);
  };
  if (video?.requestVideoFrameCallback) observer.rafId = video.requestVideoFrameCallback(onFrame);
  else {
    let lastCurrentTime = -1;
    observer.timer = setInterval(() => {
      if (video?.currentTime !== lastCurrentTime) {
        lastCurrentTime = video.currentTime;
        observer.frames += 1;
        observer.lastFrameTs = performance.now();
      }
      report(false);
    }, 250);
  }
  cameraObserver = observer;
  emit("camera-start", {
    requestedWidth: requested.width || null,
    requestedHeight: requested.height || null,
    requestedFps,
    width: settings.width || null,
    height: settings.height || null,
    trackFps: settings.frameRate || null,
    facingMode: settings.facingMode || null,
    deviceIdPresent: Boolean(settings.deviceId),
  }, { log: true });
}

function cameraStop() {
  if (!cameraObserver) return;
  const observer = cameraObserver;
  cameraObserver = null;
  resourceStop("activeCameraStreams", { track: "video" });
  if (observer.rafId != null && observer.video?.cancelVideoFrameCallback) {
    try { observer.video.cancelVideoFrameCallback(observer.rafId); } catch {}
  }
  if (observer.timer) clearInterval(observer.timer);
  const elapsed = performance.now() - observer.started;
  emit("camera-stop", {
    frameCount: observer.frames,
    observedFps: observer.frames * 1000 / Math.max(1, elapsed),
    durationMs: elapsed,
  }, { log: true });
}

function summary(label = "periodic") {
  const now = performance.now();
  if (now - lastSummaryAt < 5000 && label === "periodic") return;
  lastSummaryAt = now;
  const event = emit("summary", { label, counters: JSON.stringify(counters) }, { log: true });
  memory(label);
  return event;
}

function dump() {
  let debug = null;
  try { debug = debugSnapshotProvider?.() || null; } catch (error) { debug = { error: error?.message || "snapshot-failed" }; }
  return {
    sessionId,
    startedAt: new Date(Date.now() - (performance.now() - startedAt)).toISOString(),
    counters: { ...counters },
    resources: resourceSnapshot(),
    debug,
    events: events.slice(),
  };
}

function download() {
  const blob = new Blob([JSON.stringify(dump(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `momento-telemetry-${sessionId}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const api = {
  sessionId,
  emit,
  increment,
  resourceStart,
  resourceStop,
  resourceSnapshot,
  setDebugSnapshotProvider,
  startupMark,
  startupMeasure,
  startupSnapshot,
  frameId,
  recordFrame,
  startNetwork,
  finishNetwork,
  measure,
  measureBlob,
  memory,
  cameraStart,
  cameraStop,
  summary,
  dump,
  download,
};

window.mbTelemetry = api;

/* Readiness marks stay lightweight and use browser lifecycle signals rather
   than delaying the first render. CSS may already be loaded when this module
   executes (scripts are at the end of index.html), so check both paths. */
function markDocumentReadiness() {
  const markHtml = () => startupMark("htmlReady");
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", markHtml, { once: true });
  else markHtml();

  const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')];
  const markCss = () => startupMark("cssReady");
  const pending = stylesheets.filter((link) => !link.sheet);
  if (!pending.length) queueMicrotask(markCss);
  else {
    let remaining = pending.length;
    const done = () => { remaining -= 1; if (remaining <= 0) markCss(); };
    pending.forEach((link) => link.addEventListener("load", done, { once: true }));
    window.setTimeout(markCss, 3000);
  }
}
markDocumentReadiness();
startupMark("boot");
emit("session-start", { userAgent: navigator.userAgent.slice(0, 120), visibility: document.visibilityState }, { log: true });
setInterval(() => summary(), 10000);
export { api as telemetry };
