/* =========================================================
   MomentoBooth PWA — Application principale (v4)
   Tap = minuteur · swipe = filtre en direct · masques visage
   · mode AUTO · portrait (flou) · GIF animé · flash · paramètres
   ========================================================= */
import { FILTERS, filterById, applyPixelFilter, MASK_ICONS } from "./filters.js";
import { drawMask } from "./masks.js";
import { FRAMES, drawFrame, framePreview, FRAME_TEXTS } from "./frames.js";

/* ---------- État ---------- */
const state = {
  stream: null,
  facing: "user",
  filterId: "original",
  backdrop: null,
  chromaEnabled: false,
  timerSeconds: 5,
  counting: false,
  autoMode: false,
  autoStableSince: 0,
  autoLastNose: null,
  autoArmed: false,
  portraitMode: false,   // capture double + GIF à chaque prise
  flashEnabled: true,
  qualityMax: true,
  trackEnabled: true,
  latestPhoto: null,
  latestGif: null,
  publicUrl: "",
  lastLocalId: null,     // id IndexedDB de la dernière photo
  frameId: "none",       // cadre anniversaire
  frameText: FRAME_TEXTS.default,
  deleteEnabled: false,  // autoriser la suppression des photos
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
const sheetMap = {
  "sheet-timer": $("sheet-timer"),
  "sheet-backdrop": $("sheet-backdrop"),
  "sheet-settings": $("sheet-settings"),
  "sheet-frames": $("sheet-frames"),
};

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

/* Flash plein écran */
function flash() {
  if (!state.flashEnabled) return;
  const overlay = $("flash-overlay");
  overlay.classList.remove("go");
  void overlay.offsetWidth; // relance l'animation
  overlay.classList.add("go");
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
  filterThumbs.forEach((item) => item.thumb.classList.toggle("active", item.thumb === thumbEl));
  if (thumbEl) thumbEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  try { navigator.vibrate?.(10); } catch {}
}

/* =========================================================
   GESTES : tap = minuteur · swipe = filtre en direct
   ========================================================= */
let swipeRefX = 0, swipeStartX = 0, swipeStartY = 0, isSwiping = false;
const SWIPE_STEP = 64;

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
  if (dy > Math.abs(dx) * 1.4) return;
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

cameraZone.addEventListener("touchend", () => {
  if (isSwiping) return;
  if (state.counting) return;
  openSheet("sheet-timer");
}, { passive: true });

cameraZone.addEventListener("click", () => {
  if (state.counting) return;
  openSheet("sheet-timer");
});

/* =========================================================
   MINUTEUR
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
   DÉTECTION VISAGE + TRACK + MODE AUTO
   ========================================================= */
async function initFaceLandmarker() {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("./mediapipe/vision_bundle.mjs");
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
    toast("Mode manuel");
  } else {
    state.autoStableSince = 0;
    state.autoLastNose = null;
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

/* Portrait : photo normale + flou + GIF animé */
async function capturePortrait() {
  if (state.counting) return;
  state.counting = true;
  playBeep(1200, 0.25, 0.35);
  const normal = await grabFrame();
  const portrait = await grabFramePortrait();
  const gif = await grabGif();
  state.counting = false;
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
}

/* =========================================================
   GRAFFRAME : capture haute qualité avec filtre + masque
   ========================================================= */
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
  drawFrame(ctx, W, H, state.frameId, state.frameText);
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
        out.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.95);
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
    blurBase.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.95);
  });
}

/* GIF animé : 8 frames de la vidéo avec filtre + masque */
function grabGif() {
  return new Promise((resolve) => {
    try {
      const GifWriter = window.GIF;
      if (!GifWriter) return resolve(null);
      const video = camera;
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
      const W = 480, H = Math.round(480 / (vw / vh));
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      const gif = new GifWriter({
        workers: 1,
        quality: 8,
        width: W,
        height: H,
        workerScript: "/js/vendor/gif.worker.js",
      });
      let frame = 0;
      const total = 8;
      const interval = 130;
      const tick = () => {
        if (frame >= total) {
          gif.render();
          gif.on("finished", (blob) => resolve(blob));
          return;
        }
        drawVideoFrame(ctx, video, W, H);
        gif.addFrame(ctx, { copy: true, delay: interval });
        frame += 1;
        setTimeout(tick, interval);
      };
      tick();
    } catch { resolve(null); }
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
    const img = document.createElement(item.gif ? "img" : "img");
    img.src = URL.createObjectURL(item.blob);
    img.className = item.gif ? "result-image gif" : "result-image";
    img.dataset.index = index;
    if (!item.gif) img.addEventListener("click", () => { state.latestPhoto = item.blob; });
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
  const all = [...unique.values()];
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
      if (photo.blob) state.latestPhoto = photo.blob;
      else fetch(serverById.get(photo.id).url).then((r) => r.blob()).then((blob) => { state.latestPhoto = blob; });
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
function buildFrameOptions() {
  const box = $("frame-options");
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
    });
    box.appendChild(chip);
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
      toast(g.id ? `Fond : ${g.name}` : "Fond retiré");
    });
    box.appendChild(swatch);
  });
}

/* =========================================================
   PARAMÈTRES
   ========================================================= */
function bindSettings() {
  $("set-portrait").checked = state.portraitMode;
  $("set-portrait").addEventListener("change", (e) => {
    state.portraitMode = e.target.checked;
    toast(state.portraitMode ? "Mode portrait : photo + flou + GIF" : "Mode portrait off");
  });
  $("set-flash").checked = state.flashEnabled;
  $("set-flash").addEventListener("change", (e) => { state.flashEnabled = e.target.checked; });
  $("set-quality").checked = state.qualityMax;
  $("set-quality").addEventListener("change", (e) => {
    state.qualityMax = e.target.checked;
    toast(state.qualityMax ? "Qualité maximale (4K)" : "Qualité standard");
  });
  $("set-track").checked = state.trackEnabled;
  $("set-track").addEventListener("change", (e) => { state.trackEnabled = e.target.checked; });
  $("set-delete").checked = state.deleteEnabled;
  $("set-delete").addEventListener("change", (e) => {
    state.deleteEnabled = e.target.checked;
    toast(state.deleteEnabled ? "Suppression des photos activée" : "Suppression désactivée");
  });
  $("btn-clear-backdrop").addEventListener("click", () => {
    state.backdrop = null;
    document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
    toast("Fond désactivé");
  });
}

/* =========================================================
   EVENTS
   ========================================================= */
$("btn-auto").addEventListener("click", toggleAutoMode);
$("btn-flip").addEventListener("click", flipCamera);
$("btn-backdrop").addEventListener("click", () => openSheet("sheet-backdrop"));
$("btn-settings").addEventListener("click", () => openSheet("sheet-settings"));
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
$("btn-export-zip").addEventListener("click", exportZip);
$("btn-save-all").addEventListener("click", saveAllToPhotos);
$("btn-save-comment").addEventListener("click", saveComment);
$("photo-comment").addEventListener("keydown", (e) => { if (e.key === "Enter") saveComment(); });
$("btn-frames").addEventListener("click", () => openSheet("sheet-frames"));
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
  buildFrameOptions();
  bindSettings();
  if (navigator.serviceWorker) {
    try { await navigator.serviceWorker.register("/sw.js"); } catch { /* offline ok */ }
  }
  await startCamera();
  await initFaceLandmarker();
  setInterval(detectFace, 120);
}
init();
