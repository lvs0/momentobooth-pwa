/* =========================================================
   MomentoBooth PWA — Application principale
   Caméra · filtres temps réel · minuteur tap · fonds ·
   stickers visage (MediaPipe) · capture · galerie · partage
   ========================================================= */
import { FILTERS, applyPixelFilter } from "./filters.js";

/* ---------- État ---------- */
const state = {
  stream: null,
  facing: "user",
  filterId: "original",
  stickerId: null,       // emoji sticker sélectionné
  backdrop: null,        // { type: 'gradient'|'pattern'|'image', value: ... } ou null
  chromaEnabled: false,
  timerSeconds: 5,
  burst: 1,              // 1, 2 ou 4 photos (collage)
  counting: false,
  autoMode: false,       // capture automatique quand visage stable
  autoStableSince: 0,    // timestamp début stabilité
  autoLastNose: null,    // position nez précédente
  autoArmed: false,      // visage présent et stable
  latestPhoto: null,     // dernier blob capturé
  photos: [],            // [{id, url, thumb, date}]
  landmarker: null,
  face: null,            // derniers landmarks visage
  faceMask: null,        // masque de segmentation MediaPipe
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const camera = $("camera");
const cameraCanvas = $("camera-canvas");
const stickerCanvas = $("sticker-canvas");
const filterTrack = $("filter-strip-track");
const backdropEl = $("backdrop");
const countdownEl = $("countdown");
const countdownNumber = $("countdown-number");
const toastEl = $("toast");
const screens = {
  capture: $("screen-capture"),
  result: $("screen-result"),
  gallery: $("screen-gallery"),
};

const sheetMap = {
  "sheet-backdrop": $("sheet-backdrop"),
  "sheet-stickers": $("sheet-stickers"),
  "sheet-timer": $("sheet-timer"),
};

const STICKERS = ["👑", "🕶️", "👓", "💋", "🐝", "🌈", "❤️", "🎩", "⭐", "🥸"];
const GRADIENTS = [
  { id: "sunset", label: "Coucher", css: "linear-gradient(160deg,#f59e0b,#ef4444 55%,#7c2d92)" },
  { id: "ocean",  label: "Océan",   css: "linear-gradient(160deg,#0ea5e9,#1e40af 60%,#312e81)" },
  { id: "night",  label: "Nuit",    css: "linear-gradient(160deg,#1e293b,#0f172a 50%,#020617)" },
  { id: "forest", label: "Forêt",   css: "linear-gradient(160deg,#22c55e,#166534 55%,#052e16)" },
  { id: "rose",   label: "Rose",    css: "linear-gradient(160deg,#f472b6,#c026d3 55%,#4a044e)" },
  { id: "gold",   label: "Or",      css: "linear-gradient(160deg,#fde047,#f59e0b 55%,#78350f)" },
  { id: "violet", label: "Violet",  css: "linear-gradient(160deg,#a78bfa,#7c3aed 55%,#2e1065)" },
];

/* =========================================================
   CAMÉRA
   ========================================================= */
async function startCamera() {
  try {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    camera.srcObject = state.stream;
    await camera.play().catch(() => {});
    buildFilterStrip();
    showHintOnce();
  } catch (error) {
    toast("Caméra indisponible — vérifiez l'autorisation");
  }
}

async function flipCamera() {
  state.facing = state.facing === "user" ? "environment" : "user";
  await startCamera();
}

/* =========================================================
   FILTRES — bandeau de miniatures live (swipe)
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
    video.classList.add("thumb-video");
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
  camera.style.filter = FILTERS.find((f) => f.id === id).css;
  document.querySelectorAll(".filter-thumb").forEach((t) => t.classList.toggle("active", t.dataset.filter === id));
  thumbEl?.classList.add("active");
}

/* =========================================================
   FONDS
   ========================================================= */
function buildBackdropOptions() {
  const box = $("backdrop-options");
  box.innerHTML = "";

  const none = document.createElement("button");
  none.className = "backdrop-swatch active";
  none.style.background = "rgba(255,255,255,.08)";
  none.title = "Aucun fond";
  none.textContent = "✕";
  none.addEventListener("click", () => setBackdrop(null, none));
  box.appendChild(none);

  GRADIENTS.forEach((g) => {
    const sw = document.createElement("button");
    sw.className = "backdrop-swatch";
    sw.style.background = g.css;
    sw.title = g.label;
    sw.addEventListener("click", () => setBackdrop({ type: "gradient", css: g.css }, sw));
    box.appendChild(sw);
  });

  const pattern = document.createElement("button");
  pattern.className = "backdrop-swatch pattern";
  pattern.title = "Motif";
  pattern.addEventListener("click", () => setBackdrop({ type: "pattern" }, pattern));
  box.appendChild(pattern);
}

function setBackdrop(backdrop, el) {
  state.backdrop = backdrop;
  document.querySelectorAll(".backdrop-swatch").forEach((s) => s.classList.remove("active"));
  el?.classList.add("active");
  if (backdrop?.type === "gradient") backdropEl.style.background = backdrop.css;
  else if (backdrop?.type === "pattern") backdropEl.style.background = "repeating-conic-gradient(#333 0 25%, #111 0 50%)";
  else backdropEl.style.background = "";
  backdropEl.classList.toggle("hidden", !backdrop);
}

$("backdrop-upload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.backdrop = { type: "image", url: reader.result };
    backdropEl.style.background = `url(${reader.result}) center/cover no-repeat`;
    backdropEl.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

$("chroma-enable").addEventListener("change", (event) => {
  state.chromaEnabled = event.target.checked;
  toast(state.chromaEnabled ? "Chroma activé (fond vert retiré)" : "Chroma désactivé");
});

/* =========================================================
   STICKERS (visage — MediaPipe Face Landmarker)
   ========================================================= */
function buildStickerOptions() {
  const box = $("sticker-options");
  box.innerHTML = "";
  STICKERS.forEach((emoji, index) => {
    const chip = document.createElement("button");
    chip.className = "sticker-chip";
    chip.textContent = emoji;
    chip.addEventListener("click", () => {
      const active = state.stickerId === index;
      state.stickerId = active ? null : index;
      document.querySelectorAll(".sticker-chip").forEach((c) => c.classList.remove("active"));
      if (!active) chip.classList.add("active");
      toast(active ? "Sticker retiré" : `Sticker ${emoji} — placez-vous face caméra`);
    });
    box.appendChild(chip);
  });
}

async function initFaceLandmarker() {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("./mediapipe/vision_bundle.mjs");
    const fileset = await FilesetResolver.forVisionTasks("./mediapipe/wasm");
    state.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "./mediapipe/face_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFaceSegmentationMasks: true, // masque visage → blur portrait
    });
  } catch (error) {
    state.landmarker = null;
  }
}

function detectFace() {
  if (!state.landmarker || !state.stream) return;
  try {
    const result = state.landmarker.detectForVideo(camera, performance.now());
    state.face = result.faceLandmarks?.[0] ?? null;
    state.faceMask = result.segmentationMasks?.[0] ?? null;
    updateAutoMode();
    drawHeadTracker();
  } catch { state.face = null; state.faceMask = null; }
}

/* Mode AUTO : visage présent et stable → tracker 2s → capture double */
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
    // Bouge encore → reset
    state.autoStableSince = now;
    state.autoArmed = false;
    statusText.textContent = "Restez immobile…";
    statusEl.classList.remove("armed");
    return;
  }

  const stableMs = now - state.autoStableSince;
  if (stableMs > 2000 && !state.autoArmed) {
    // Tracker disparaît → capture double (normale + blur portrait)
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

/* Tracker de tête : cadre autour du visage tant qu'il n'est pas armé */
function drawHeadTracker() {
  const ctx = stickerCanvas.getContext("2d");
  ctx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
  if (!state.autoMode || state.autoArmed || !state.face || state.face.length < 30) return;

  const l = state.face;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of l) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Mapping cover (vidéo → écran)
  const cw = stickerCanvas.width, ch = stickerCanvas.height;
  const vw = camera.videoWidth || 1280, vh = camera.videoHeight || 960;
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const x = minX * vw * scale + ox, y = minY * vh * scale + oy;
  const w = (maxX - minX) * vw * scale, h = (maxY - minY) * vh * scale;

  ctx.save();
  ctx.strokeStyle = "rgba(240,201,106,.95)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(240,201,106,.6)";
  ctx.shadowBlur = 14;
  const r = Math.min(w, h) * 0.18;
  roundedRect(ctx, x - 6, y - 6, w + 12, h + 12, r);
  ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* =========================================================
   MINUTEUR + CAPTURE
   ========================================================= */
function buildTimerOptions() {
  const box = $("timer-options");
  box.innerHTML = "";
  const durations = [
    { s: 3, label: "3s", sub: "rapide" },
    { s: 5, label: "5s", sub: "moyen" },
    { s: 10, label: "10s", sub: "posé" },
  ];
  durations.forEach((d, index) => {
    const chip = document.createElement("button");
    chip.className = `timer-chip${index === 1 ? " active" : ""}`;
    chip.innerHTML = `${d.label}<small>${d.sub}</small>`;
    chip.addEventListener("click", () => {
      state.timerSeconds = d.s;
      document.querySelectorAll(".timer-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      // Ferme le sheet et démarre immédiatement (flux rapide)
      sheetMap["sheet-timer"].classList.remove("open");
      startCountdown();
    });
    box.appendChild(chip);
  });
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

/* Capture : dessine la vidéo sur un canvas (avec filtre pixel, fond chroma, stickers). */
async function capture() {
  const shots = [];
  for (let i = 0; i < state.burst; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 350));
    const blob = await grabFrame();
    shots.push(blob);
    playBeep(1200, 0.2, 0.3);
  }
  const finalBlob = state.burst === 1 ? shots[0] : await makeCollage(shots, state.burst);
  state.latestPhoto = finalBlob;
  showResult(finalBlob);
}

/* Mode AUTO : capture double — photo normale + photo avec blur portrait */
async function captureDouble() {
  if (state.counting) return;
  state.counting = true;
  playBeep(1200, 0.25, 0.35);
  const normal = await grabFrame();
  const portrait = await grabFramePortrait();
  state.counting = false;
  state.autoArmed = false; // réarmer pour la personne suivante
  if (!portrait) {
    state.latestPhoto = normal;
    showResult(normal);
    return;
  }
  // Collage 2-up : normale | portrait
  const canvas = document.createElement("canvas");
  canvas.width = 2400; canvas.height = Math.round(2400 * (portrait.height / portrait.width) / 2) * 2;
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

/* Capture avec blur portrait : visage net, arrière-plan flouté */
function grabFramePortrait() {
  return new Promise((resolve) => {
    const video = camera;
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 960;
    const scale = Math.min(1, 2160 / Math.max(vw, vh));
    const W = Math.round(vw * scale), H = Math.round(vh * scale);

    // Canvas net
    const net = document.createElement("canvas");
    net.width = W; net.height = H;
    const nctx = net.getContext("2d", { willReadFrequently: true });
    drawVideoFrame(nctx, video, W, H, ratioOf(video));

    // Canvas flou (downscale + upscale = flou bilinéaire)
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
          const col = state.facing === "user" ? mw - 1 - (i % mw) : (i % mw); // miroir si selfie
          const j = (Math.floor(i / mw) * mw + col) * 4;
          imgData.data[j] = 255;
          imgData.data[j + 1] = 255;
          imgData.data[j + 2] = 255;
          imgData.data[j + 3] = a;
        }
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = mw; maskCanvas.height = mh;
        maskCanvas.getContext("2d").putImageData(imgData, 0, 0);

        // Visage net masqué par le mask
        const netMasked = document.createElement("canvas");
        netMasked.width = W; netMasked.height = H;
        const mctx = netMasked.getContext("2d");
        mctx.drawImage(net, 0, 0);
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(maskCanvas, 0, 0, W, H);
        // Assemble : fond flou + visage net par-dessus
        const out = document.createElement("canvas");
        out.width = W; out.height = H;
        const octx = out.getContext("2d");
        octx.drawImage(blurBase, 0, 0);
        octx.drawImage(netMasked, 0, 0);
        out.toBlob((blob) => resolve(blob ? { blob, width: W, height: H } : null), "image/jpeg", 0.95);
        return;
      } catch { /* fallback ci-dessous */ }
    }

    // Fallback sans mask : ovale de visage net sur fond flou
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

function grabFrame() {
  return new Promise((resolve) => {
    const video = camera;
    const canvas = cameraCanvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // Haute qualité : résolution native de la vidéo, plafonnée à 2160 (4K)
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    const scale = Math.min(1, 2160 / Math.max(vw, vh));
    const W = Math.round(vw * scale);
    const H = Math.round(vh * scale);
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
          drawVideoFrame(ctx, video, W, H, ratioOf(video));
          canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.95);
        };
        img.src = state.backdrop.url;
        return;
      } else if (state.backdrop.type === "pattern") {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, W, H);
      }
    }

    drawVideoFrame(ctx, video, W, H, ratioOf(video));
    canvas.toBlob((blob) => resolve(blob ?? null), "image/jpeg", 0.95);
  });
}

function ratioOf(video) {
  return (video.videoWidth || 1280) / (video.videoHeight || 960);
}

function drawVideoFrame(ctx, video, W, H, ratio) {
  const sourceRatio = video.videoWidth / video.videoHeight;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  const targetRatio = W / H;
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

  // Filtre pixel
  if (state.filterId !== "original") {
    const imageData = ctx.getImageData(0, 0, W, H);
    applyPixelFilter(imageData, state.filterId);
    ctx.putImageData(imageData, 0, 0);
  }

  // Sticker visage
  drawStickers(ctx, W, H);
}

function drawStickers(ctx, W, H) {
  const index = state.stickerId;
  if (index === null || index === undefined) return;
  const emoji = STICKERS[index];
  const face = state.face;
  const size = Math.min(W, H) * 0.28;

  if (face && face.length > 30) {
    const l = face; // 478 points
    const nose = l[1], leftEye = l[33], rightEye = l[263], chin = l[152], forehead = l[10];
    const cx = (leftEye.x + rightEye.x) / 2;
    const cy = (leftEye.y + rightEye.y) / 2;
    const faceW = Math.abs(leftEye.x - rightEye.x);
    const px = (v) => v * W;
    const py = (v) => v * H;

    if (emoji === "👑" || emoji === "🎩") {
      const topY = py(Math.min(forehead.y, nose.y)) - size * 0.85;
      const x = px(cx) - size / 2;
      ctx.font = `${size}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, px(cx), topY + size / 2);
      return;
    }
    if (emoji === "🕶️" || emoji === "👓") {
      ctx.font = `${size * 0.9}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, px(cx), py(cy) - size * 0.05);
      return;
    }
    if (emoji === "💋") {
      ctx.font = `${size * 0.7}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, px(cx), py(chin.y) - size * 0.25);
      return;
    }
    // Par défaut : suit le visage
    ctx.font = `${size * 0.8}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, px(cx), py(nose.y));
    void faceW;
  } else {
    ctx.font = `${size}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, W / 2, H * 0.35);
  }
}

/* Collage 2x2 */
function makeCollage(blobs, count) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1440;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, 1080, 1440);
    const positions = count === 2
      ? [[0, 0, 1080, 720], [0, 720, 1080, 720]]
      : [[0, 0, 540, 720], [540, 0, 540, 720], [0, 720, 540, 720], [540, 720, 540, 720]];
    let loaded = 0;
    blobs.forEach((blob, idx) => {
      const img = new Image();
      img.onload = () => {
        const [x, y, w, h] = positions[idx];
        ctx.drawImage(img, x, y, w, h);
        loaded += 1;
        if (loaded === blobs.length) resolve(canvas.toBlob("image/jpeg", 0.9));
      };
      img.src = URL.createObjectURL(blob);
    });
  });
}

/* =========================================================
   RÉSULTAT + PARTAGE
   ========================================================= */
function showResult(blob) {
  const url = URL.createObjectURL(blob);
  $("result-image").src = url;
  state.latestPhoto = blob;
  screens.capture.classList.remove("active");
  screens.result.classList.add("active");
  $("share-box").classList.add("hidden");
  $("share-status").textContent = "";
  uploadPhoto(blob);
}

$("btn-retake").addEventListener("click", () => {
  screens.result.classList.remove("active");
  screens.capture.classList.add("active");
  startCamera();
});

$("btn-save").addEventListener("click", () => {
  if (!state.latestPhoto) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(state.latestPhoto);
  link.download = `momentobooth-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast("Photo sauvegardée");
});

$("btn-share").addEventListener("click", () => {
  $("share-box").classList.toggle("hidden");
});

document.querySelectorAll(".share-chip").forEach((chip) => {
  chip.addEventListener("click", () => sharePhoto(chip.dataset.share));
});

async function sharePhoto(method) {
  if (!state.latestPhoto) return;
  const status = $("share-status");
  try {
    if (method === "native" && navigator.share) {
      const file = new File([state.latestPhoto], `momentobooth-${Date.now()}.jpg`, { type: "image/jpeg" });
      await navigator.share({ title: "MomentoBooth", text: "Une photo du photobooth 📸", files: [file] });
      return;
    }
    const publicUrl = state.publicUrl || window.location.href;
    if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent("Regarde ma photo 📸 " + publicUrl)}`, "_blank");
    } else if (method === "sms") {
      window.open(`sms:?body=${encodeURIComponent("Regarde ma photo 📸 " + publicUrl)}`);
    } else if (method === "email") {
      window.open(`mailto:?subject=${encodeURIComponent("MomentoBooth — votre photo")}&body=${encodeURIComponent("Votre photo du photobooth : " + publicUrl)}`);
    } else if (method === "qrcode") {
      const qrBox = $("share-qr-box");
      qrBox.classList.remove("hidden");
      const qrImg = $("share-qr");
      const target = state.publicUrl || window.location.href;
      qrImg.src = `/api/qr?url=${encodeURIComponent(target)}`;
      status.textContent = "QR code — scannez pour voir la photo";
      toast("QR affiché");
    }
  } catch (error) {
    status.textContent = "Partage indisponible";
  }
}

/* =========================================================
   GALERIE (locale IndexedDB + serveur)
   ========================================================= */
const DB_NAME = "momentobooth", STORE = "photos";
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocal(blob) {
  const db = await openDB();
  const id = `photo-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, blob, date: new Date().toISOString() });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  return id;
}

async function loadLocal() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.date.localeCompare(a.date)));
    request.onerror = () => reject(request.error);
  });
}

async function deleteLocal(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

$("btn-gallery").addEventListener("click", async () => {
  screens.capture.classList.remove("active");
  screens.gallery.classList.add("active");
  await renderGallery();
});

$("btn-back").addEventListener("click", () => {
  screens.gallery.classList.remove("active");
  screens.capture.classList.add("active");
});

async function renderGallery() {
  const grid = $("gallery-grid");
  grid.innerHTML = "";
  const photos = await loadLocal();
  // Fusionne avec les photos du serveur (stockage local PC)
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
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 0">Aucune photo pour l\'instant — capturez votre premier moment !</p>';
    return;
  }
  all.forEach((photo) => {
    const img = document.createElement("img");
    img.src = photo.blob ? URL.createObjectURL(photo.blob) : (serverById.get(photo.id)?.url ?? "");
    img.loading = "lazy";
    img.addEventListener("click", () => {
      if (photo.blob) {
        state.latestPhoto = photo.blob;
      } else {
        // Photo serveur : télécharge puis affiche
        fetch(serverById.get(photo.id).url).then((r) => r.blob()).then((blob) => { state.latestPhoto = blob; });
      }
      screens.gallery.classList.remove("active");
      screens.result.classList.add("active");
      $("result-image").src = img.src;
    });
    grid.appendChild(img);
  });
}

/* =========================================================
   UPLOAD SERVEUR (stockage local + URL publique)
   ========================================================= */
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

/* =========================================================
   TOAST + HELPERS
   ========================================================= */
let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

let hintShown = false;
function showHintOnce() {
  if (hintShown) return;
  hintShown = true;
  const hint = $("tap-hint");
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 4200);
}

/* =========================================================
   GESTES : tap sur la zone = minuteur
   ========================================================= */
$("camera-zone").addEventListener("click", (event) => {
  if (event.target.closest(".bottom-bar") || event.target.closest(".filter-strip")) return;
  if (state.counting) return;
  openSheet("sheet-timer");
});

$("btn-shutter").addEventListener("click", () => {
  if (state.counting) return;
  startCountdown();
});

$("btn-auto").addEventListener("click", toggleAutoMode);

function openSheet(id) {
  Object.entries(sheetMap).forEach(([key, el]) => el.classList.toggle("open", key === id));
}
document.querySelectorAll(".sheet-close").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".sheet").classList.remove("open"));
});

/* =========================================================
   SWIPE / PINCH : filtres via gestes
   ========================================================= */
let touchStartX = 0;
camera.parentElement.addEventListener("touchstart", (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
camera.parentElement.addEventListener("touchend", (event) => {
  if (state.counting) return;
  const delta = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) < 60) return;
  const index = FILTERS.findIndex((f) => f.id === state.filterId);
  const next = delta < 0 ? Math.min(FILTERS.length - 1, index + 1) : Math.max(0, index - 1);
  const thumb = document.querySelector(`.filter-thumb[data-filter="${FILTERS[next].id}"]`);
  selectFilter(FILTERS[next].id, thumb);
  thumb?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}, { passive: true });

/* =========================================================
   INIT
   ========================================================= */
async function init() {
  // Taille du canvas stickers = écran (pour le tracker)
  function sizeStickerCanvas() {
    stickerCanvas.width = window.innerWidth;
    stickerCanvas.height = window.innerHeight;
  }
  sizeStickerCanvas();
  window.addEventListener("resize", sizeStickerCanvas);

  buildBackdropOptions();
  buildStickerOptions();
  buildTimerOptions();
  if (navigator.serviceWorker) {
    try { await navigator.serviceWorker.register("/sw.js"); } catch { /* offline ok */ }
  }
  await startCamera();
  await initFaceLandmarker();
  setInterval(detectFace, 120);
}
init();
