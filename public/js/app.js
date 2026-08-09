/* =========================================================
   MomentoBooth PWA — Application principale (v3 photobooth)
   Tap écran = minuteur (5s/10s) · swipe = filtre en direct ·
   masques visage (MediaPipe) · mode AUTO · capture double
   ========================================================= */
import { FILTERS, filterById, applyPixelFilter } from "./filters.js";
import { drawMask } from "./masks.js";

/* ---------- État ---------- */
const state = {
  stream: null,
  facing: "user",
  filterId: "original",
  backdrop: null,        // { type, css?, url? } ou null
  chromaEnabled: false,
  timerSeconds: 5,
  counting: false,
  autoMode: false,
  autoStableSince: 0,
  autoLastNose: null,
  autoArmed: false,
  latestPhoto: null,
  publicUrl: "",
  landmarker: null,
  face: null,
  faceMask: null,
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const screens = { capture: $("screen-capture"), result: $("screen-result"), gallery: $("screen-gallery") };
const camera = $("camera");
const cameraZone = $("camera-zone");
const stickerCanvas = $("sticker-canvas");
const filterTrack = $("filter-track");
const countdownEl = $("countdown");
const countdownNumber = $("countdown-number");
const toastEl = $("toast");
const sheetMap = { "sheet-timer": $("sheet-timer"), "sheet-backdrop": $("sheet-backdrop") };

/* ---------- Helpers ---------- */
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
}
function playBeep(freq = 880, duration = 0.12, gain = 0.15) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch { /* no audio */ }
}

/* =========================================================
   CAMÉRA
   ========================================================= */
async function startCamera() {
  try {
    const facing = state.facing === "user" ? "user" : "environment";
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    camera.srcObject = state.stream;
    await camera.play().catch(() => {});
    buildFilterStrip();
  } catch (error) {
    toast("Caméra indisponible : autorisez l'accès");
  }
}

async function flipCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((t) => t.stop());
  state.facing = state.facing === "user" ? "environment" : "user";
  await startCamera();
}

/* =========================================================
   FILTRES (miniatures live + masques)
   ========================================================= */
let filterThumbs = [];
function buildFilterStrip() {
  filterTrack.innerHTML = "";
  filterThumbs = FILTERS.map((filter, index) => {
    const thumb = document.createElement("div");
    thumb.className = `filter-thumb${index === 0 ? " active" : ""}`;
    thumb.dataset.filter = filter.id;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.filter = filter.css;
    video.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "filter-name";
    name.textContent = filter.name;

    thumb.appendChild(video);
    thumb.appendChild(name);
    thumb.addEventListener("click", () => selectFilter(filter.id, thumb));
    filterTrack.appendChild(thumb);
    return { thumb, video, hydrated: false };
  });

  // Lazy hydrate : seules les vignettes visibles reçoivent le stream (perf iPhone)
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const index = Array.from(filterTrack.children).indexOf(entry.target);
      const item = filterThumbs[index];
      if (!item) continue;
      if (entry.isIntersecting && !item.hydrated) {
        item.video.srcObject = state.stream;
        item.hydrated = true;
      } else if (!entry.isIntersecting && item.hydrated) {
        item.video.srcObject = null;
        item.hydrated = false;
      }
    }
  }, { root: filterTrack, threshold: 0.15 });
  filterThumbs.forEach((item) => observer.observe(item.thumb));
}

function selectFilter(id, thumbEl) {
  state.filterId = id;
  filterThumbs.forEach((item) => item.thumb.classList.toggle("active", item.thumb === thumbEl));
  if (thumbEl) thumbEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  // Vibreur léger
  try { navigator.vibrate?.(10); } catch {}
}

/* =========================================================
   GESTES : tap = minuteur · swipe = filtre en direct
   ========================================================= */
let swipeRefX = 0, swipeStartX = 0, swipeStartY = 0, isSwiping = false;
const SWIPE_STEP = 72; // px pour changer de filtre (geste continu)

cameraZone.addEventListener("touchstart", (event) => {
  swipeStartX = event.touches[0].clientX;
  swipeStartY = event.touches[0].clientY;
  swipeRefX = swipeStartX;
  isSwiping = false;
}, { passive: true });

cameraZone.addEventListener("touchmove", (event) => {
  if (state.counting) return;
  const dx = event.touches[0].clientX - swipeRefX;
  const dy = Math.abs(event.touches[0].clientY - swipeStartY);
  if (Math.abs(dx) < SWIPE_STEP) return;
  if (dy > Math.abs(dx) * 1.4) return; // geste vertical → pas un swipe
  isSwiping = true;
  const steps = Math.round(dx / SWIPE_STEP);
  if (steps !== 0) {
    const index = FILTERS.findIndex((f) => f.id === state.filterId);
    const next = Math.max(0, Math.min(FILTERS.length - 1, index + steps));
    const thumb = document.querySelector(`.filter-thumb[data-filter="${FILTERS[next].id}"]`);
    selectFilter(FILTERS[next].id, thumb);
    swipeRefX += steps * SWIPE_STEP; // continue le geste pour enchaîner
  }
}, { passive: true });

cameraZone.addEventListener("touchend", () => {
  if (isSwiping) return;
  if (state.counting) return;
  openSheet("sheet-timer");
}, { passive: true });

// Fallback souris (desktop)
cameraZone.addEventListener("click", () => {
  if (state.counting) return;
  openSheet("sheet-timer");
});

/* =========================================================
   MINUTEUR : 5s / 10s (grands boutons)
   ========================================================= */
function buildTimerOptions() {
  const box = $("timer-options");
  box.innerHTML = "";
  const durations = [
    { s: 5, label: "5", sub: "secondes", big: "5s" },
    { s: 10, label: "10", sub: "secondes", big: "10s" },
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
      startCountdown();
    });
    box.appendChild(chip);
  });
}

async function startCountdown() {
  if (state.counting) return;
  state.counting = true;
  countdownEl.classList.remove("hidden");
  let remaining = state.timerSeconds;
  countdownNumber.textContent = String(remaining);

  const tick = async () => {
    playBeep(880, 0.1, 0.2);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    remaining -= 1;
    if (remaining > 0) {
      countdownNumber.textContent = String(remaining);
      return tick();
    }
    countdownEl.classList.add("hidden");
    await capture();
    state.counting = false;
    return null;
  };
  await tick();
}

/* =========================================================
   DÉTECTION VISAGE + MASQUES + MODE AUTO
   ========================================================= */
async function initFaceLandmarker() {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("./mediapipe/vision_bundle.mjs");
    const fileset = await FilesetResolver.forVisionTasks("./mediapipe/wasm");
    state.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "./mediapipe/face_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
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

/* Overlay live : masque + tracker sur stickerCanvas */
function drawLiveOverlay() {
  const ctx = stickerCanvas.getContext("2d");
  ctx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
  const filter = filterById(state.filterId);

  // Masque photobooth en live
  if (filter.mask !== "none" && state.face && state.face.length > 30) {
    drawMask(ctx, stickerCanvas.width, stickerCanvas.height, state.face, filter.mask);
  }

  // Tracker AUTO (cadre doré)
  if (state.autoMode && !state.autoArmed && state.face && state.face.length > 30) {
    const l = state.face;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of l) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    const cw = stickerCanvas.width, ch = stickerCanvas.height;
    const vw = camera.videoWidth || 1280, vh = camera.videoHeight || 960;
    const scale = Math.max(cw / vw, ch / vh);
    const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
    const x = minX * vw * scale + ox, y = minY * vh * scale + oy;
    const w = (maxX - minX) * vw * scale, h = (maxY - minY) * vh * scale;
    ctx.save();
    ctx.strokeStyle = "rgba(240,201,106,.95)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(240,201,106,.6)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 20);
    ctx.stroke();
    ctx.restore();
  }
}

/* Mode AUTO : visage stable 2s → capture double */
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
    void captureDouble();
  }
}

function toggleAutoMode() {
  state.autoMode = !state.autoMode;
  const btn = $("btn-auto");
  btn.classList.toggle("active", state.autoMode);
  if (!state.autoMode) {
    state.autoArmed = false;
    $("auto-status").classList.add("hidden");
    toast("Mode manuel");
  } else {
    state.autoStableSince = 0;
    state.autoLastNose = null;
    toast("Mode AUTO — placez-vous face caméra");
  }
}

/* =========================================================
   CAPTURE
   ========================================================= */
function ratioOf(video) {
  return (video.videoWidth || 1280) / (video.videoHeight || 960);
}

async function capture() {
  const blob = await grabFrame();
  state.latestPhoto = blob;
  playBeep(1200, 0.2, 0.3);
  showResult(blob);
}

async function captureDouble() {
  if (state.counting) return;
  state.counting = true;
  playBeep(1200, 0.25, 0.35);
  const normal = await grabFrame();
  const portrait = await grabFramePortrait();
  state.counting = false;
  state.autoArmed = false;
  if (!portrait) {
    state.latestPhoto = normal;
    showResult(normal);
    return;
  }
  // Collage 2-up : normale | blur portrait
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = Math.round(2400 * (portrait.height / portrait.width) / 2) * 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const halfW = canvas.width / 2;
  const drawScaled = (blob, x) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const w = halfW, h = w / ratio;
      ctx.drawImage(img, x, (canvas.height - h) / 2, w, h);
      resolve();
    };
    img.src = URL.createObjectURL(blob);
  });
  await drawScaled(normal, 0);
  await drawScaled(portrait, halfW);
  canvas.toBlob((blob) => {
    if (!blob) { state.latestPhoto = normal; showResult(normal); return; }
    state.latestPhoto = blob;
    showResult(blob);
  }, "image/jpeg", 0.95);
}

function drawVideoFrame(ctx, video, W, H) {
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

  // Filtre couleur pixel
  const filter = filterById(state.filterId);
  if (filter.ops.length) {
    const imageData = ctx.getImageData(0, 0, W, H);
    applyPixelFilter(imageData, state.filterId);
    ctx.putImageData(imageData, 0, 0);
  }

  // Masque photobooth (sur le visage)
  if (filter.mask !== "none") {
    ctx.save();
    if (state.facing === "user") {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    drawMask(ctx, W, H, state.face, filter.mask);
    ctx.restore();
  }
}

function grabFrame() {
  return new Promise((resolve) => {
    const video = camera;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    const scale = Math.min(1, 2160 / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);
    canvas.width = W; canvas.height = H;

    // Fond décoratif
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
          drawVideoFrame(ctx, video, W, H);
          canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.95);
        };
        img.src = state.backdrop.url;
        return;
      }
    }

    drawVideoFrame(ctx, video, W, H);
    canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.95);
  });
}

/* Capture blur portrait (masque segmentation) */
function grabFramePortrait() {
  return new Promise((resolve) => {
    const video = camera;
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
    const scale = Math.min(1, 2160 / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);

    const net = document.createElement("canvas");
    net.width = W; net.height = H;
    const nctx = net.getContext("2d", { willReadFrequently: true });
    drawVideoFrame(nctx, video, W, H);

    const blurBase = document.createElement("canvas");
    blurBase.width = W; blurBase.height = H;
    const bctx = blurBase.getContext("2d");
    const small = document.createElement("canvas");
    small.width = Math.max(64, W >> 5); small.height = Math.max(48, H >> 5);
    const sctx = small.getContext("2d");
    if (state.facing === "user") {
      sctx.translate(small.width, 0); sctx.scale(-1, 1);
    }
    sctx.drawImage(video, 0, 0, small.width, small.height);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.drawImage(small, 0, 0, W, H);

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
        out.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.95);
        return;
      } catch { /* fallback */ }
    }

    if (state.face && state.face.length > 30) {
      const l = state.face;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of l) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      const cx = (minX + maxX) / 2 * W, cy = (minY + maxY) / 2 * H;
      const rw = (maxX - minX) * W * 1.6, rh = (maxY - minY) * H * 1.8;
      const bctx3 = blurBase.getContext("2d");
      bctx3.save();
      bctx3.beginPath();
      bctx3.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      bctx3.clip();
      bctx3.drawImage(net, 0, 0);
      bctx3.restore();
    }
    blurBase.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.95);
  });
}

/* =========================================================
   RÉSULTAT + PARTAGE
   ========================================================= */
function showResult(blob) {
  if (!blob) { toast("Capture impossible"); return; }
  state.latestPhoto = blob;
  $("result-image").src = URL.createObjectURL(blob);
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

function shareMethod(method) {
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
      const qrBox = $("share-qr-box");
      qrBox.classList.remove("hidden");
      $("share-qr").src = `/api/qr?url=${encodeURIComponent(publicUrl)}`;
      status.textContent = "QR affiché — scannez pour la photo";
    } else if (method === "download") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(state.latestPhoto);
      a.download = `momentobooth-${Date.now()}.jpg`;
      a.click();
      status.textContent = "Téléchargé ✓";
    }
  } catch { status.textContent = "Erreur partage"; }
}

/* =========================================================
   GALERIE (locale IndexedDB + serveur)
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
  const all = [...unique.values()];
  $("gallery-count").textContent = `${all.length} photo${all.length > 1 ? "s" : ""}`;
  if (!all.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:60px 20px;font-size:18px">Aucune photo — touchez l\'écran pour commencer !</p>';
    return;
  }
  all.forEach((photo) => {
    const img = document.createElement("img");
    img.src = photo.blob ? URL.createObjectURL(photo.blob) : (serverById.get(photo.id)?.url ?? "");
    img.loading = "lazy";
    img.addEventListener("click", () => {
      if (photo.blob) state.latestPhoto = photo.blob;
      else fetch(serverById.get(photo.id).url).then((r) => r.blob()).then((blob) => { state.latestPhoto = blob; });
      screens.gallery.classList.remove("active");
      screens.result.classList.add("active");
      $("result-image").src = img.src;
    });
    grid.appendChild(img);
  });
}

/* =========================================================
   FONDS
   ========================================================= */
function buildBackdropOptions() {
  const box = $("backdrop-options");
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
      toast(`Fond : ${g.name}`);
    });
    box.appendChild(swatch);
  });
}

/* =========================================================
   EVENTS
   ========================================================= */
$("btn-auto").addEventListener("click", toggleAutoMode);
$("btn-flip").addEventListener("click", flipCamera);
$("btn-backdrop").addEventListener("click", () => openSheet("sheet-backdrop"));
$("btn-gallery").addEventListener("click", async () => {
  screens.capture.classList.remove("active");
  screens.gallery.classList.add("active");
  await renderGallery();
});
$("btn-back-capture").addEventListener("click", showCapture);
$("btn-retake").addEventListener("click", showCapture);
$("btn-save").addEventListener("click", async () => {
  if (!state.latestPhoto) return;
  await uploadPhoto(state.latestPhoto);
  toast("Photo sauvegardée ✓");
  $("share-box").style.display = "block";
});
$("timer-close").addEventListener("click", () => sheetMap["sheet-timer"].classList.remove("open"));
document.querySelectorAll(".sheet-close").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".sheet")?.classList.remove("open"));
});
document.querySelectorAll(".share-chip").forEach((btn) => {
  btn.addEventListener("click", () => shareMethod(btn.dataset.method));
});
$("backdrop-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  state.backdrop = { type: "image", url };
  toast("Fond image chargé 🖼️");
});
$("chroma-check").addEventListener("change", (event) => {
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
  function sizeStickerCanvas() {
    stickerCanvas.width = window.innerWidth;
    stickerCanvas.height = window.innerHeight;
  }
  sizeStickerCanvas();
  window.addEventListener("resize", sizeStickerCanvas);

  buildBackdropOptions();
  buildTimerOptions();
  if (navigator.serviceWorker) {
    try { await navigator.serviceWorker.register("/sw.js"); } catch { /* offline ok */ }
  }
  await startCamera();
  await initFaceLandmarker();
  setInterval(detectFace, 120);
}
init();
