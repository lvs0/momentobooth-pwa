/* =========================================================
   MomentoBooth — Serveur Node (stockage local + API + partage)
   - Sert la PWA (public/)
   - POST /api/photos      → upload photo, stockage local
   - GET  /api/photos      → liste des photos
   - GET  /api/photos/:id  → image
   - DELETE /api/photos/:id
   - GET  /api/photos/:id/qr → QR code de la photo
   - GET  /api/qr?url=...  → QR générique
   - POST /api/guest/sessions → crée un lien invité temporaire
   - GET  /api/guest/:token/gallery → galerie publique en lecture seule
   - GET  /api/guest/:token/live → dernière image de l'aperçu opt-in
   - POST /api/guest/:token/live → publie une image (clé hôte requise)
   ========================================================= */
import express from "express";
import multer from "multer";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";

/* Traitement délégué par le téléphone (allège le CPU/RAM de l'iPhone) :
   - gifenc   : encodeur GIF pur JS (l'encodage local gif.js coûte cher sur mobile)
   - fflate   : ZIP pur JS (remplace jszip + DEFLATE côté client)
   - jpeg-js  : décodeur JPEG pur JS (pour scoring et frames GIF) */
import gifenc from "gifenc";
import { zipSync, strToU8 } from "fflate";
import jpeg from "jpeg-js";
import * as PImage from "pureimage";
import { PassThrough, Readable } from "node:stream";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PHOTOS_DIR = path.join(__dirname, "..", "photos");
const REMOTE_CAM_DIR = path.join(PHOTOS_DIR, ".remote-camera");
const REMOTE_CONFIG_FILE = path.join(PHOTOS_DIR, ".remote-config.json");
const TRASH_DIR = path.join(PHOTOS_DIR, ".trash");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(REMOTE_CAM_DIR, { recursive: true });
fs.mkdirSync(TRASH_DIR, { recursive: true });

/* Configuration distante Phase 3 : données JSON strictement bornées, sans HTML
   ni script. Le fichier vit sur le volume photos Modal et peut donc évoluer
   sans publier une nouvelle version de la PWA. */
const DEFAULT_REMOTE_CONFIG = {
  version: 1,
  donation: {
    enabled: false,
    url: "https://payrequest.me/lvs0",
    title: "Soutenir By l-vs",
    message: "Si ce projet t’est utile, tu peux soutenir sa création.",
    cta: "Soutenir le projet",
    cooldown: 604800,
    priority: "normal",
    showOnStartup: false,
  },
};
function boundedConfigText(value, fallback, max) {
  const text = String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return text || fallback;
}
function validHttpsConfigUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch { return ""; }
}
function sanitizeRemoteConfig(value) {
  const raw = value && typeof value === "object" ? value : {};
  const donation = raw.donation && typeof raw.donation === "object" ? raw.donation : {};
  const suppliedUrl = donation.url == null ? DEFAULT_REMOTE_CONFIG.donation.url : validHttpsConfigUrl(donation.url);
  const url = suppliedUrl || DEFAULT_REMOTE_CONFIG.donation.url;
  const cooldown = Number(donation.cooldown);
  const priority = ["low", "normal", "high"].includes(donation.priority) ? donation.priority : "normal";
  return {
    version: Number.isFinite(Number(raw.version)) ? Math.max(1, Math.min(99, Number(raw.version))) : 1,
    donation: {
      enabled: donation.enabled === true && Boolean(suppliedUrl),
      url,
      title: boundedConfigText(donation.title, DEFAULT_REMOTE_CONFIG.donation.title, 80),
      message: boundedConfigText(donation.message, DEFAULT_REMOTE_CONFIG.donation.message, 220),
      cta: boundedConfigText(donation.cta, DEFAULT_REMOTE_CONFIG.donation.cta, 48),
      cooldown: Number.isFinite(cooldown) ? Math.max(3600, Math.min(2592000, cooldown)) : DEFAULT_REMOTE_CONFIG.donation.cooldown,
      priority,
      showOnStartup: donation.showOnStartup === true,
    },
  };
}
function readRemoteConfig() {
  try { return sanitizeRemoteConfig(JSON.parse(fs.readFileSync(REMOTE_CONFIG_FILE, "utf8"))); }
  catch { return sanitizeRemoteConfig(DEFAULT_REMOTE_CONFIG); }
}
/* Écriture JSON atomique ET durable : tmp + rename + fsync.
   Le fsync (fichier puis répertoire parent) garantit que les métadonnées
   (sessions, jetons, corbeille, captures, remote-cam) survivent à un crash
   ou power-loss, y compris sur volume réseau Modal. */
function writeJsonAtomic(file, data, opts = {}) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", opts.mode ?? 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, opts.pretty ? 2 : 0));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  // fsync du répertoire parent : rend le rename durable après un crash.
  try {
    const dirFd = fs.openSync(path.dirname(file), "r");
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch { /* certains FS (EIO) ne supportent pas fsync de dossier */ }
}

function writeRemoteConfig(value) {
  writeJsonAtomic(REMOTE_CONFIG_FILE, sanitizeRemoteConfig(value), { pretty: true });
  return readRemoteConfig();
}

/* URL publique de base : env PUBLIC_BASE_URL ou header x-forwarded-* (tunnel/Modal).
   Modal ne transmet pas x-forwarded-proto : on déduit https si le header
   x-forwarded-host / host est un domaine *.modal.run (toujours servi en TLS). */
function publicBase(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:8787";
  const forwarded = String(req.headers["x-forwarded-proto"] || "");
  let proto = forwarded ? forwarded.split(",")[0].trim() : "http";
  if ((!forwarded && /\.modal\.run$/i.test(host)) || proto === "https") proto = "https";
  return `${proto}://${host}`;
}

const app = express();
app.use(express.json({ limit: "64kb" }));

app.get("/api/remote-config", (_req, res) => {
  res.set("Cache-Control", "no-store").json(readRemoteConfig());
});

/* Mise à jour administrateur hors publication PWA. La clé n'est jamais
   renvoyée au frontend ; sans secret configuré, l'écriture reste désactivée. */
app.post("/api/remote-config", rateLimit(12), (req, res) => {
  const expected = String(process.env.MOMENTOBOOTH_CONFIG_ADMIN_KEY || "");
  const provided = String(req.get("x-momento-config-key") || "");
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  const authorized = Boolean(expectedBytes.length && providedBytes.length === expectedBytes.length)
    && crypto.timingSafeEqual(providedBytes, expectedBytes);
  if (!expectedBytes.length) return res.status(503).json({ error: "Configuration distante non administrable" });
  if (!authorized) return res.status(403).json({ error: "Clé administrateur invalide" });
  try {
    return res.json(writeRemoteConfig(req.body));
  } catch (error) {
    console.error("[MomentoBooth] remote-config write", error);
    return res.status(500).json({ error: "Configuration impossible à enregistrer" });
  }
});
app.use((_req, res, next) => {
  // Corrélation de mesure client/serveur : horodatage de réponse sans
  // exposer de secret ni de contenu caméra.
  res.setHeader("x-mb-server-ts", String(Date.now()));
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});

/* ---- Rate limiting mémoire (protège le stockage et les crédits Modal) ----
   Fenêtre glissante par IP (x-forwarded-for en premier, Modal inclus). Les
   limites sont très au-dessus du flux légitime (upload, process, jumelage)
   mais bloquent les boucles accidentelles et les abus d'upload. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map(); // ip → { count, resetAt }
function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "local";
}
function rateLimit(maxPerMinute) {
  const disabled = process.env.NODE_ENV === "test" || process.env.MOMENTOBOOTH_DISABLE_RATELIMIT === "1";
  return (req, res, next) => {
    if (disabled) return next();
    const ip = clientIp(req);
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      rateBuckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maxPerMinute) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Trop de requêtes — patientez une minute" });
    }
    next();
  };
}
// Purge des buckets expirés toutes les 5 min (fuite mémoire évitée).
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(ip);
}, 5 * 60 * 1000).unref?.();

/* ---- Upload photos ---- */
const upload = multer({
  storage: multer.diskStorage({
    destination: PHOTOS_DIR,
    filename: (_req, file, cb) => {
      const extension = file.mimetype === "image/gif" ? "gif" : "jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  // Le serveur ne stocke que les formats qu’il sait servir avec une extension
  // cohérente. SVG et les MIME image arbitraires sont refusés avant écriture.
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|gif)$/i.test(file.mimetype)),
});

const liveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_500_000 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|webp|png)$/.test(file.mimetype)),
});

/* ---- Traitements délégués (allègent l'iPhone : GIF, ZIP, scoring) ---- */
/* Ping rapide : le client teste la disponibilité du serveur avant de lui
   déléguer un traitement (évite d'attendre un timeout réseau long). */
app.get("/api/process/ping", (_req, res) => res.json({ ok: true }));

const jpegFileFilter = (_req, file, cb) => cb(null, /^image\/jpeg$/i.test(file.mimetype));
const archiveFileFilter = (_req, file, cb) => cb(null, /^image\/(jpeg|gif)$/i.test(file.mimetype));

// Limites séparées par usage : les routes de traitement utilisent memoryStorage,
// donc un plafond global trop large (50 Mo × 100 fichiers) pourrait épuiser la
// RAM du conteneur avant que jpeg-js ne puisse rejeter une entrée invalide.
const processBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 16, parts: 24, fields: 8 },
  fileFilter: jpegFileFilter,
});
const processSingleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, parts: 8, fields: 8 },
  fileFilter: jpegFileFilter,
});
const processZipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 16, parts: 24, fields: 8 },
  fileFilter: archiveFileFilter,
});

function processFiles(req) {
  return (req.files || []).filter((f) => f && f.buffer && f.buffer.length).sort((a, b) => (a.fieldname > b.fieldname ? 1 : -1));
}

/* Décodage centralisé : les uploads multipart peuvent être renommés ou
   tronqués. Une image invalide est une erreur client 400, jamais un crash
   serveur 500 ni une boucle de retry côté téléphone. */
function decodeJpeg(buffer, maxMemoryUsageInMB = 512) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    const error = new Error("Image JPEG invalide");
    error.code = "MB_INVALID_IMAGE";
    throw error;
  }
  try {
    const decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB });
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) throw new Error("dimensions invalides");
    return decoded;
  } catch {
    const error = new Error("Image JPEG invalide");
    error.code = "MB_INVALID_IMAGE";
    throw error;
  }
}

/* Décode un buffer JPEG en RGBA Uint8Array (recalé si besoin). */
function hasImageSignature(filePath, mimeType) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(12);
    const read = fs.readSync(fd, header, 0, header.length, 0);
    if (/^image\/jpeg$/i.test(mimeType)) return read >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (/^image\/gif$/i.test(mimeType)) {
      const magic = header.subarray(0, 6).toString("ascii");
      return magic === "GIF87a" || magic === "GIF89a";
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function decodeRgba(buffer, targetW, targetH) {
  const { width, height, data } = decodeJpeg(buffer, 512);
  if (width === targetW && height === targetH) return data;
  // Rééchantillonnage simple par boîte : suffisant pour des frames de GIF et du scoring.
  const out = new Uint8Array(targetW * targetH * 4);
  const sx = width / targetW;
  const sy = height / targetH;
  for (let y = 0; y < targetH; y++) {
    const sy0 = Math.min(height - 1, Math.floor(y * sy));
    for (let x = 0; x < targetW; x++) {
      const sx0 = Math.min(width - 1, Math.floor(x * sx));
      const si = (sy0 * width + sx0) * 4;
      const di = (y * targetW + x) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

/* Encodage GIF serveur : mêmes dimensions/délais que le client (480px, 140 ms). */
app.post("/api/process/gif", rateLimit(12), processBatchUpload.array("frames", 32), (req, res) => {
  try {
    const files = processFiles(req);
    if (!files.length) return res.status(400).json({ error: "Frames requises" });
    const W = Math.max(16, Math.min(720, Number(req.body.width) || 480));
    const H = Math.max(16, Math.min(1280, Number(req.body.height) || Math.round((W * 4) / 3)));
    const delay = Math.max(10, Math.min(1000, Number(req.body.delay) || 140));
    const gif = GIFEncoder();
    for (const file of files) {
      const rgba = decodeRgba(file.buffer, W, H);
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, W, H, { palette, delay });
    }
    gif.finish();
    res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store" });
    res.send(Buffer.from(gif.bytes()));
  } catch (error) {
    console.error("[MomentoBooth] /api/process/gif", error);
    res.status(error?.code === "MB_INVALID_IMAGE" ? 400 : 500).json({ error: error?.code === "MB_INVALID_IMAGE" ? "Image JPEG invalide" : "Encodage GIF impossible" });
  }
});

/* ZIP délégué : remplace jszip côté client. */
app.post("/api/process/zip", rateLimit(12), processZipUpload.array("files", 24), (req, res) => {
  try {
    const files = processFiles(req);
    if (!files.length) return res.status(400).json({ error: "Fichiers requis" });
    const entries = {};
    files.forEach((file, index) => {
      const name = String(file.originalname || `fichier-${index + 1}`).replace(/[\u0000-\u001f\u007f/\\]/g, "_");
      entries[`momentobooth/${name}`] = new Uint8Array(file.buffer);
    });
    entries["momentobooth/lisez-moi.txt"] = strToU8(
      "Photos exportées depuis MomentoBooth\nURL de la galerie : à coller depuis l'application.\n"
    );
    const zipped = zipSync(entries, { level: 6 });
    res.set({ "Content-Type": "application/zip", "Cache-Control": "no-store" });
    res.send(Buffer.from(zipped));
  } catch (error) {
    console.error("[MomentoBooth] /api/process/zip", error);
    res.status(500).json({ error: "Création ZIP impossible" });
  }
});

/* ════════════════════════════════════════════════════════════════
   RENDU DU PACK LENS (le plus lourd) : le téléphone n'envoie qu'UN SEUL
   JPEG (cadre dessiné côté client) + les ops du filtre + la bbox du visage.
   Le serveur produit les 3 rendus : original (tel quel), filtré (ops pixel)
   et portrait (flou + ovale net) — l'iPhone n'encode plus qu'une fois.
   ════════════════════════════════════════════════════════════════ */
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/* Le navigateur envoie des opérations déclaratives : on n'accepte qu'un
   petit budget connu et des amplitudes raisonnables avant toute boucle pixel. */
const FILTER_OP_LIMIT = 16;
const FILTER_OP_RANGES = {
  grayscale: [0, 0], grayscaleHalf: [0, 0], sepia: [0, 1], contrast: [.5, 1.8],
  brightness: [.65, 1.4], saturate: [0, 1.8], hueRotate: [-180, 180],
  tint: [0, 1], vignette: [0, .8], grain: [0, .04],
};
function sanitizeFilterOps(input) {
  if (!Array.isArray(input) || input.length > FILTER_OP_LIMIT) return [];
  return input.filter((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return false;
    const range = FILTER_OP_RANGES[entry[0]];
    if (!range) return false;
    if (entry[0] === "tint") {
      return Array.isArray(entry[1]) && entry[1].length === 4
        && entry[1].slice(0, 3).every((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 255)
        && Number.isFinite(Number(entry[1][3])) && Number(entry[1][3]) >= 0 && Number(entry[1][3]) <= 1;
    }
    if (range[0] === 0 && range[1] === 0) return entry.length === 1;
    const value = Number(entry[1]);
    return Number.isFinite(value) && value >= range[0] && value <= range[1];
  }).slice(0, FILTER_OP_LIMIT);
}

/* Ops pixel — mêmes formules que public/js/filters.js (applyOps). */
function applyOps(data, ops, width = 0, height = 0) {
  for (const [op, amount] of ops) {
    const n = data.length;
    for (let i = 0; i < n; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      switch (op) {
        case "grayscale": { const v = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = v; break; }
        case "grayscaleHalf": { const v = 0.299 * r + 0.587 * g + 0.114 * b; r = r * .5 + v * .5; g = g * .5 + v * .5; b = b * .5 + v * .5; break; }
        case "sepia": {
          const nr = 0.393 * r + 0.769 * g + 0.189 * b, ng = 0.349 * r + 0.686 * g + 0.168 * b, nb = 0.272 * r + 0.534 * g + 0.131 * b;
          const a = amount ?? .5;
          r = r + (nr - r) * a; g = g + (ng - g) * a; b = b + (nb - b) * a; break;
        }
        case "contrast": { const f = (c) => (c - 128) * (amount ?? 1) + 128; r = f(r); g = f(g); b = f(b); break; }
        case "brightness": { r *= amount ?? 1; g *= amount ?? 1; b *= amount ?? 1; break; }
        case "saturate": {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b, a = amount ?? 1;
          r = gray + (r - gray) * a; g = gray + (g - gray) * a; b = gray + (b - gray) * a; break;
        }
        case "hueRotate": {
          const deg = ((amount ?? 0) * Math.PI) / 180, c = Math.cos(deg), s = Math.sin(deg);
          const lumR = 0.213, lumG = 0.715, lumB = 0.072;
          const nr = (lumR + c * (1 - lumR) + s * (-lumR)) * r + (lumG + c * (-lumG) + s * (-lumG)) * g + (lumB + c * (-lumB) + s * (1 - lumB)) * b;
          const ng = (lumR + c * (-lumR) + s * 0.143) * r + (lumG + c * (1 - lumG) + s * 0.140) * g + (lumB + c * (-lumB) + s * (-0.283)) * b;
          const nb = (lumR + c * (-lumR) + s * (-(1 - lumR))) * r + (lumG + c * (-lumG) + s * lumG) * g + (lumB + c * (1 - lumB) + s * lumB) * b;
          r = nr; g = ng; b = nb; break;
        }
        case "tint": {
          if (Array.isArray(amount)) {
            const tr = Number(amount[0]) || 0, tg = Number(amount[1]) || 0, tb = Number(amount[2]) || 0;
            const alpha = Math.max(0, Math.min(1, Number(amount[3]) || 0));
            r = r * (1 - alpha) + tr * alpha;
            g = g * (1 - alpha) + tg * alpha;
            b = b * (1 - alpha) + tb * alpha;
          }
          break;
        }
        case "vignette": {
          if (width > 0 && height > 0) {
            const pixel = i / 4;
            const x = pixel % width, y = Math.floor(pixel / width);
            const dx = (x - width / 2) / (width / 2), dy = (y - height / 2) / (height / 2);
            const edge = Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) * .72));
            const strength = Math.max(0, Math.min(.8, amount ?? .2));
            const f = 1 - strength * edge * edge;
            r *= f; g *= f; b *= f;
          }
          break;
        }
        case "grain": {
          const noise = (Math.random() - .5) * Math.max(0, Math.min(24, (amount ?? .01) * 255));
          r += noise; g += noise; b += noise;
          break;
        }
      }
      data[i] = clampByte(r); data[i + 1] = clampByte(g); data[i + 2] = clampByte(b);
    }
  }
  return data;
}

/* Flou doux : downscale par moyenne de blocs puis upscale bilinéaire.
   Équivalent de makeBlur() côté client (léger et rapide). */
function makeBlur(data, W, H, factor = 8) {
  const sw = Math.max(8, Math.round(W / factor));
  const sh = Math.max(8, Math.round(H / factor));
  const small = new Float32Array(sw * sh * 3);
  const cnt = new Float32Array(sw * sh);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(sh - 1, Math.floor((y / H) * sh));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / W) * sw));
      const p = (y * W + x) * 4;
      const si = (sy * sw + sx) * 3;
      small[si] += data[p]; small[si + 1] += data[p + 1]; small[si + 2] += data[p + 2];
      cnt[sy * sw + sx]++;
    }
  }
  for (let i = 0; i < sw * sh * 3; i++) small[i] /= Math.max(1, cnt[Math.floor(i / 3)]);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const fy = (y / H) * (sh - 1);
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = (x / W) * (sw - 1);
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const p00 = (y0 * sw + x0) * 3, p10 = (y0 * sw + x1) * 3;
      const p01 = (y1 * sw + x0) * 3, p11 = (y1 * sw + x1) * 3;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = small[p00 + c] * (1 - tx) + small[p10 + c] * tx;
        const bot = small[p01 + c] * (1 - tx) + small[p11 + c] * tx;
        out[o + c] = top * (1 - ty) + bot * ty;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/* Portrait : visage net (ellipse) sur fond flou. box = {x,y,w,h} en pixels
   du canvas final (le client envoie déjà les coordonnées miroir). */
function ovalPortrait(net, W, H, box) {
  const blur = makeBlur(net, W, H);
  // Sans landmark à l'instant de la prise, on garde un sujet central doux
  // plutôt que de renvoyer une simple copie de l'original ou un ovale vide.
  const safe = box && box.w > 24 && box.h > 24
    ? box
    : { x: W * .34, y: H * .18, w: W * .32, h: H * .46 };
  const cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2;
  const rx = (safe.w * 1.85) / 2, ry = (safe.h * 2.05) / 2;
  if (!(rx > 0 && ry > 0)) return blur;
  for (let y = 0; y < H; y++) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      const distance = dx * dx + dy * dy;
      if (distance <= .82) {
        const p = (y * W + x) * 4;
        blur[p] = net[p]; blur[p + 1] = net[p + 1]; blur[p + 2] = net[p + 2];
      } else if (distance < 1.08) {
        const p = (y * W + x) * 4;
        const mix = Math.max(0, Math.min(1, (1.08 - distance) / .26));
        blur[p] = blur[p] * (1 - mix) + net[p] * mix;
        blur[p + 1] = blur[p + 1] * (1 - mix) + net[p + 1] * mix;
        blur[p + 2] = blur[p + 2] * (1 - mix) + net[p + 2] * mix;
      }
    }
  }
  return blur;
}

/* Encode un buffer RGBA en JPEG (base64). Attend réellement la fin du flux
   (un Buffer.concat prématuré produirait un JPEG tronqué) et libère les
   gros buffers dès que possible. */
async function encodeJpegB64(data, W, H, quality = 92) {
  const img = PImage.make(W, H);
  img.data.set(data);
  const pt = new PassThrough();
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    pt.on("data", (c) => chunks.push(c));
    pt.on("end", resolve);
    pt.on("error", reject);
  });
  try {
    await PImage.encodeJPEGToStream(img, pt, quality);
    pt.end();
    await done;
  } finally {
    // Libère les références : le GC peut recycler la RGBA source tout de suite.
    img.data = null;
  }
  return Buffer.concat(chunks).toString("base64");
}

app.post("/api/process/pack", rateLimit(20), processSingleUpload.single("frame"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: "Frame requise" });
    const frame = req.file.buffer;
    const filterOps = (() => {
      try { return sanitizeFilterOps(JSON.parse(String(req.body.filterOps || "[]"))); }
      catch { return []; }
    })();
    const faceBox = (() => { try { return JSON.parse(String(req.body.faceBox || "null")); } catch { return null; } })();
    const quality = Math.max(60, Math.min(97, Number(req.body.quality) || 92));
    // Original = frame reçu tel quel (zéro coût, aucune re-compression)
    const original = frame.toString("base64");
    let filtered = null;
    let portrait = null;
    const { width, height, data } = decodeJpeg(frame, 512);
    if (Array.isArray(filterOps) && filterOps.length) {
      const rgba = new Uint8Array(data);
      applyOps(rgba, filterOps, width, height);
      filtered = await encodeJpegB64(rgba, width, height, quality);
    }
    if (String(req.body.portrait || "") === "1") {
      const rgba = new Uint8Array(data);
      portrait = await encodeJpegB64(ovalPortrait(rgba, width, height, faceBox), width, height, quality);
    }
    res.json({ original, filtered, portrait });
  } catch (error) {
    console.error("[MomentoBooth] /api/process/pack", error);
    res.status(error?.code === "MB_INVALID_IMAGE" ? 400 : 500).json({ error: error?.code === "MB_INVALID_IMAGE" ? "Image JPEG invalide" : "Rendu pack impossible" });
  }
});

/* Scoring délégué : mêmes formules que frameScore() du client (variance du
   Laplacien × exposition), calculées ici pour économiser le CPU du téléphone. */
app.post("/api/process/score", rateLimit(20), processBatchUpload.array("frames", 16), (req, res) => {
  try {
    const files = processFiles(req);
    if (!files.length) return res.status(400).json({ error: "Frames requises" });
    const S = 64;
    const scores = files.map((file) => {
      const { width, height, data } = decodeJpeg(file.buffer, 256);
      // Downscale vers 64×64 (moyenne par blocs) puis mêmes métriques que le client.
      const g = new Float32Array(S * S);
      let lumSum = 0;
      for (let y = 0; y < S; y++) {
        const sy0 = Math.min(height - 1, Math.floor((y * height) / S));
        const sy1 = Math.min(height - 1, Math.floor(((y + 1) * height) / S));
        for (let x = 0; x < S; x++) {
          const sx0 = Math.min(width - 1, Math.floor((x * width) / S));
          const sx1 = Math.min(width - 1, Math.floor(((x + 1) * width) / S));
          let rSum = 0, gSum = 0, bSum = 0, n = 0;
          for (let yy = sy0; yy <= sy1; yy++) {
            for (let xx = sx0; xx <= sx1; xx++) {
              const p = (yy * width + xx) * 4;
              rSum += data[p]; gSum += data[p + 1]; bSum += data[p + 2]; n++;
            }
          }
          const v = (0.299 * rSum + 0.587 * gSum + 0.114 * bSum) / n;
          g[y * S + x] = v;
          lumSum += v;
        }
      }
      const avg = lumSum / (S * S);
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
      let exposure = 1;
      if (avg < 45) exposure = Math.max(0.25, avg / 45);
      else if (avg > 215) exposure = Math.max(0.25, (255 - avg) / 40);
      return sharpness * exposure;
    });
    res.json({ scores });
  } catch (error) {
    console.error("[MomentoBooth] /api/process/score", error);
    res.status(error?.code === "MB_INVALID_IMAGE" ? 400 : 500).json({ error: error?.code === "MB_INVALID_IMAGE" ? "Image JPEG invalide" : "Scoring impossible" });
  }
});

/* Emojis par visage (heuristique gratuite, OPT-IN côté client) : le téléphone
   envoie la photo finale + les boîtes des visages détectés par MediaPipe ; le
   serveur échantillonne la peau de chaque visage (jpeg-js déjà chargé) et
   renvoie un emoji STABLE par personne (même visage ≈ même emoji). Aucun coût
   externe, aucune clé API — uniquement du calcul serveur déjà disponible. */
const EMOJI_POOLS = {
  light: ["😀", "😁", "🤗", "😎", "🥳", "😇", "🤠", "😜"],
  medium: ["😊", "😄", "🤩", "😏", "😉", "😎", "🤪", "😋"],
  dark: ["😆", "😂", "😍", "😅", "🤣", "🥰", "😝", "🫶"],
};
function stableEmojiHash(x, y, w) {
  return ((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663) ^ (Math.round(w) * 83492791)) >>> 0;
}
app.post("/api/process/emojis", rateLimit(20), processSingleUpload.single("frame"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image requise" });
    let faces = [];
    try { faces = JSON.parse(String(req.body.faces || "[]")); } catch {}
    if (!Array.isArray(faces)) faces = [];
    const { width, height, data } = decodeJpeg(req.file.buffer, 256);
    const results = faces
      .filter((f) => f && Number.isFinite(f.x) && Number.isFinite(f.y) && f.w > 10 && f.h > 10)
      .map((f) => {
        let x = Math.max(0, Math.round(f.x));
        let y = Math.max(0, Math.round(f.y));
        let w = Math.max(1, Math.round(f.w));
        let h = Math.max(1, Math.round(f.h));
        w = Math.max(1, Math.min(w, width - x));
        h = Math.max(1, Math.min(h, height - y));
        if (w < 4 || h < 4) return null;
        // Échantillonne la zone des joues (bas du visage, milieu horizontal).
        const sx = x + Math.round(w * 0.3), sy = y + Math.round(h * 0.42);
        const sw = Math.max(2, Math.round(w * 0.4)), sh = Math.max(2, Math.round(h * 0.3));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = sy; yy < Math.min(height, sy + sh); yy += 2) {
          for (let xx = sx; xx < Math.min(width, sx + sw); xx += 2) {
            const i = (yy * width + xx) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
        }
        if (!n) return null;
        r /= n; g /= n; b /= n;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const skin = lum > 165 ? "light" : lum > 95 ? "medium" : "dark";
        const pool = EMOJI_POOLS[skin] || EMOJI_POOLS.medium;
        const emoji = pool[stableEmojiHash(x, y, w) % pool.length];
        return { x, y, w, h, emoji, skin };
      })
      .filter(Boolean);
    res.json({ faces: results, width, height });
  } catch (error) {
    console.error("[MomentoBooth] /api/process/emojis", error);
    res.status(error?.code === "MB_INVALID_IMAGE" ? 400 : 500).json({ error: error?.code === "MB_INVALID_IMAGE" ? "Image JPEG invalide" : "Analyse impossible" });
  }
});

app.post("/api/photos", rateLimit(40), upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier image requis" });
  // Le MIME multipart est contrôlé mais reste déclaratif : vérifier aussi la
  // signature binaire avant de conserver et de servir le fichier public.
  if (!hasImageSignature(req.file.path, req.file.mimetype)) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: "Contenu image invalide" });
  }
  const id = req.file.filename;
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  const hasGuestHeaders = Boolean(token || hostKey);
  const session = token && hostKey && getGuestSession(token);
  if (hasGuestHeaders && (!session || session.hostKey !== hostKey)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "Session invitée invalide" });
  }
  let deleteToken = "";
  if (session) {
    session.photoIds.add(id);
    saveGuestSessions();
  } else {
    deleteToken = randomToken(24);
    photoDeleteTokens.set(id, deleteToken);
    savePhotoDeleteTokens();
  }
  const publicUrl = `${publicBase(req)}/api/photos/${id}`;
  res.status(201).json({ id, url: publicUrl, publicUrl, ...(deleteToken ? { deleteToken } : {}) });
});

/* Galerie propriétaire historique : les invités passent par /api/guest/:token/gallery. */
app.get("/api/photos", rateLimit(120), (_req, res) => {
  const files = fs.readdirSync(PHOTOS_DIR).filter((f) => /\.(jpg|gif)$/i.test(f)).sort().reverse();
  res.set("Cache-Control", "no-store").json({
    photos: files.map((f) => {
      // v124.0.11 — Le nom de fichier est <timestamp_ms>-<hex>.<ext>, on peut extraire
      // la date de prise de vue sans toucher au FS (perf). Le timestamp est en ms
      // depuis epoch. On renvoie aussi la taille du fichier.
      const m = f.match(/^(\d{10,15})-([0-9a-f]{8})(?:--([a-z_]+))?\.(jpg|gif)$/i);
      const ts = m ? parseInt(m[1], 10) : null;
      let size = 0;
      try { size = fs.statSync(path.join(PHOTOS_DIR, f)).size; } catch {}
      return {
        id: f,
        url: `/api/photos/${f}`,
        createdAt: ts ? new Date(ts).toISOString() : null,
        timestamp: ts,
        size,
        kind: m && m[3] === "original" ? "original" : (/\.gif$/i.test(f) ? "gif" : "filter"),
      };
    })
  });
});

/* Les fichiers stockés suivent toujours le schéma `<timestamp>-<hex>.<ext>`.
   On refuse tout autre nom (traversée de répertoire impossible grâce à
   basename, mais surtout : jamais de lecture de .sessions.json ou d'autres
   fichiers internes via cette route publique). */
const PHOTO_NAME_RE = /^\d{10,15}-[0-9a-f]{8}(--[a-z_]+)?\.(jpg|gif)$/i;
const PHOTO_DELETE_TOKENS_FILE = path.join(PHOTOS_DIR, ".photo-delete-tokens.json");
const photoDeleteTokens = new Map();
function loadPhotoDeleteTokens() {
  try {
    if (!fs.existsSync(PHOTO_DELETE_TOKENS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(PHOTO_DELETE_TOKENS_FILE, "utf8"));
    let changed = false;
    for (const [id, token] of Object.entries(data)) {
      if (PHOTO_NAME_RE.test(id) && fs.existsSync(path.join(PHOTOS_DIR, id)) && typeof token === "string" && token.length >= 32) {
        photoDeleteTokens.set(id, token);
      } else {
        changed = true;
      }
    }
    if (changed) savePhotoDeleteTokens();
  } catch (error) {
    console.error("[MomentoBooth] chargement des jetons photo :", error);
  }
}
function savePhotoDeleteTokens() {
  try {
    writeJsonAtomic(PHOTO_DELETE_TOKENS_FILE, Object.fromEntries(photoDeleteTokens));
  } catch (error) {
    console.error("[MomentoBooth] sauvegarde des jetons photo :", error);
  }
}
function tokenMatches(provided, expected) {
  const providedBytes = Buffer.from(String(provided || ""));
  const expectedBytes = Buffer.from(String(expected || ""));
  return Boolean(expectedBytes.length && providedBytes.length === expectedBytes.length)
    && crypto.timingSafeEqual(providedBytes, expectedBytes);
}

/* ---- Corbeille récupérable ----
   Une suppression (invité ou organisateur) déplace le fichier vers
   PHOTOS_DIR/.trash au lieu de l'effacer : rien n'est perdu par erreur
   pendant la soirée. Seul l'organisateur authentifié peut lister, restaurer
   ou purger définitivement. Purge automatique après TRASH_RETENTION_MS pour
   ne pas accumuler indéfiniment sur le volume Modal. */
const TRASH_META_FILE = path.join(PHOTOS_DIR, ".trash-meta.json");
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const trashMeta = new Map(); // id -> { deletedAt }
function loadTrashMeta() {
  try {
    if (!fs.existsSync(TRASH_META_FILE)) return;
    const data = JSON.parse(fs.readFileSync(TRASH_META_FILE, "utf8"));
    for (const [id, meta] of Object.entries(data)) {
      if (PHOTO_NAME_RE.test(id) && fs.existsSync(path.join(TRASH_DIR, id)) && Number.isFinite(meta?.deletedAt)) {
        trashMeta.set(id, { deletedAt: meta.deletedAt });
      }
    }
  } catch (error) {
    console.error("[MomentoBooth] chargement de la corbeille :", error);
  }
}
function saveTrashMeta() {
  try {
    writeJsonAtomic(TRASH_META_FILE, Object.fromEntries(trashMeta));
  } catch (error) {
    console.error("[MomentoBooth] sauvegarde de la corbeille :", error);
  }
}
function purgeExpiredTrash() {
  const now = Date.now();
  for (const [id, meta] of trashMeta) {
    if (now - meta.deletedAt > TRASH_RETENTION_MS) {
      try { fs.unlinkSync(path.join(TRASH_DIR, id)); } catch {}
      trashMeta.delete(id);
      photoDeleteTokens.delete(id);
    }
  }
  saveTrashMeta();
  savePhotoDeleteTokens();
}
setInterval(purgeExpiredTrash, 6 * 60 * 60 * 1000).unref?.(); // vérif toutes les 6h

/* ---- PIN organisateur : vérifié ici, jamais comparé dans le bundle client ----
   MOMENTOBOOTH_ORGANIZER_PIN doit être défini avant l'événement (Modal
   secret ou variable d'environnement). "1818" reste un repli uniquement
   pour le développement local — un avertissement est loggé si utilisé. */
const organizerSessions = new Map(); // token -> expiresAt
const organizerAttempts = new Map(); // ip -> { fails, lockedUntil }
const ORGANIZER_SESSION_MS = 4 * 60 * 60 * 1000; // 4h : la durée d'une soirée
const ORGANIZER_LOCKOUT_MS = 5 * 60 * 1000;
let _warnedDefaultPin = false;
function organizerPinExpected() {
  const configured = String(process.env.MOMENTOBOOTH_ORGANIZER_PIN || "");
  if (configured) return configured;
  if (!_warnedDefaultPin) {
    _warnedDefaultPin = true;
    console.warn("[MomentoBooth] MOMENTOBOOTH_ORGANIZER_PIN non défini — code de repli \"1818\" utilisé (à changer avant l'événement).");
  }
  return "1818";
}
// Utilisée par la corbeille (lister, restaurer, purger) et le déverrouillage
// organisateur côté client — jamais par une route accessible aux invités.
function isOrganizerAuthorized(req) {
  const token = String(req.get("x-organizer-token") || "");
  if (!token) return false;
  const expiresAt = organizerSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) { organizerSessions.delete(token); return false; }
  return true;
}
// Le rate-limit générique protège ici contre le flood réseau brut ; la vraie
// défense anti-brute-force du PIN est le verrou dédié ci-dessous (5 échecs =
// 5 min de blocage). Un plafond générique élevé évite qu'une soirée entière
// d'usages légitimes (plusieurs déverrouillages, plusieurs suppressions)
// finisse par se heurter au même compteur partagé que le reste de l'API.
app.post("/api/organizer/verify", rateLimit(200), (req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const attempt = organizerAttempts.get(ip);
  if (attempt?.lockedUntil > now) {
    res.setHeader("Retry-After", String(Math.ceil((attempt.lockedUntil - now) / 1000)));
    return res.status(429).json({ error: "Trop d'essais — patientez avant de réessayer" });
  }
  const provided = String(req.body?.pin || "");
  if (!tokenMatches(provided, organizerPinExpected())) {
    const fails = (attempt?.fails || 0) + 1;
    organizerAttempts.set(ip, fails >= 5 ? { fails: 0, lockedUntil: now + ORGANIZER_LOCKOUT_MS } : { fails, lockedUntil: 0 });
    return res.status(403).json({ error: "Code incorrect" });
  }
  organizerAttempts.delete(ip);
  const token = randomToken(24);
  const expiresAt = now + ORGANIZER_SESSION_MS;
  organizerSessions.set(token, expiresAt);
  res.json({ token, expiresAt });
});
// Purge des sessions/tentatives organisateur expirées (même logique que les buckets de débit).
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of organizerSessions) if (expiresAt < now) organizerSessions.delete(token);
  for (const [ip, attempt] of organizerAttempts) if (!attempt.lockedUntil && attempt.fails === 0) organizerAttempts.delete(ip);
}, 5 * 60 * 1000).unref?.();

loadPhotoDeleteTokens();
loadTrashMeta();
/* ---- Corbeille : lecture, restauration, purge — organisateur uniquement ----
   IMPORTANT : ces deux routes GET doivent rester définies AVANT
   `GET /api/photos/:id` ci-dessous — sinon Express matche "trash" comme un
   :id de photo (404 immédiat) et ces routes ne sont jamais atteintes. */
app.get("/api/photos/trash", rateLimit(60), (req, res) => {
  if (!isOrganizerAuthorized(req)) return res.status(403).json({ error: "Session organisateur requise" });
  loadTrashMeta();
  const items = [...trashMeta.entries()]
    .sort((a, b) => b[1].deletedAt - a[1].deletedAt)
    .map(([id, meta]) => ({ id, deletedAt: meta.deletedAt, url: `/api/photos/trash/${id}/file` }));
  res.set("Cache-Control", "no-store").json({ photos: items });
});
app.get("/api/photos/trash/:id/file", rateLimit(300), (req, res) => {
  if (!isOrganizerAuthorized(req)) return res.status(403).json({ error: "Session organisateur requise" });
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id) || !trashMeta.has(id)) return res.status(404).json({ error: "Photo introuvable" });
  const file = path.join(TRASH_DIR, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});
app.get("/api/photos/:id", rateLimit(1500), (req, res) => {
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id)) return res.status(404).json({ error: "Photo introuvable" });
  const file = path.join(PHOTOS_DIR, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});

/* URL image scellée au QR : l'invité ne peut demander qu'une photo de sa session. */
app.get("/api/guest/:token/photos/:id", (req, res) => {
  const session = getGuestSession(req.params.token);
  const id = path.basename(req.params.id);
  if (!session || !session.photoIds.has(id)) return res.status(404).json({ error: "Photo introuvable" });
  const file = path.join(PHOTOS_DIR, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});

app.delete("/api/photos/:id", rateLimit(300), (req, res) => {
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  const hasGuestHeaders = Boolean(token || hostKey);
  const session = token && hostKey && getGuestSession(token);
  if (hasGuestHeaders && (!session || session.hostKey !== hostKey)) return res.status(403).json({ error: "Session invitée invalide" });
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id)) return res.status(404).json({ error: "Photo introuvable" });
  const file = path.join(PHOTOS_DIR, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  // Une photo publiée dans une session invitée exige la clé hôte de cette
  // session. Une photo propriétaire exige son jeton privé : l'ID public seul
  // ne suffit jamais à supprimer un fichier du volume.
  const publishedIn = findPublishedGuestSession(id);
  if (publishedIn) {
    if (!session || session.token !== publishedIn.token || session.hostKey !== publishedIn.hostKey) {
      return res.status(403).json({ error: "Clé hôte requise pour cette photo" });
    }
  } else {
    const providedDeleteToken = String(req.get("x-photo-delete-token") || "");
    if (session || !tokenMatches(providedDeleteToken, photoDeleteTokens.get(id))) {
      return res.status(403).json({ error: "Jeton de suppression requis" });
    }
  }
  fs.renameSync(file, path.join(TRASH_DIR, id));
  trashMeta.set(id, { deletedAt: Date.now() });
  saveTrashMeta();
  // Le jeton de suppression est conservé : une restauration redonne aux
  // mêmes appareils (organisateur) la capacité de resupprimer la photo,
  // sans jamais avoir à en régénérer un.
  if (publishedIn) {
    const owner = session?.token === publishedIn.token ? session : guestSessions.get(publishedIn.token);
    owner?.photoIds.delete(id);
    saveGuestSessions();
  }
  res.json({ ok: true, trashed: true });
});


app.post("/api/photos/:id/restore", rateLimit(60), (req, res) => {
  if (!isOrganizerAuthorized(req)) return res.status(403).json({ error: "Session organisateur requise" });
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id) || !trashMeta.has(id)) return res.status(404).json({ error: "Photo introuvable dans la corbeille" });
  const trashedFile = path.join(TRASH_DIR, id);
  if (!fs.existsSync(trashedFile)) { trashMeta.delete(id); saveTrashMeta(); return res.status(404).json({ error: "Photo introuvable dans la corbeille" }); }
  fs.renameSync(trashedFile, path.join(PHOTOS_DIR, id));
  trashMeta.delete(id);
  saveTrashMeta();
  res.json({ ok: true, restored: true });
});
app.delete("/api/photos/:id/purge", rateLimit(60), (req, res) => {
  if (!isOrganizerAuthorized(req)) return res.status(403).json({ error: "Session organisateur requise" });
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id) || !trashMeta.has(id)) return res.status(404).json({ error: "Photo introuvable dans la corbeille" });
  try { fs.unlinkSync(path.join(TRASH_DIR, id)); } catch {}
  trashMeta.delete(id);
  photoDeleteTokens.delete(id);
  saveTrashMeta();
  savePhotoDeleteTokens();
  res.json({ ok: true, purged: true });
});

/* ---- Sessions invitées privées, temporaires et sans authentification de compte ----
   ⚠️ Sur un hébergement serverless (Modal), le conteneur peut scale-to-zero :
   les sessions invitées sont persistées dans PHOTOS_DIR (volume persistant) pour
   que les liens QR restent valides après un redémarrage à froid. */
const guestSessions = new Map();
const GUEST_TTL_MS = 8 * 60 * 60 * 1000;
const GUEST_MAX_FRAME_AGE_MS = 2_000;
const GUEST_LIVE_STREAM_STALE_MS = 6_000;
const GUEST_LIVE_STREAM_BOUNDARY = "momento-booth-frame";
const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
const SESSIONS_FILE = path.join(PHOTOS_DIR, ".sessions.json");
let _sessionsSaveTimer = null;

function saveGuestSessions() {
  if (_sessionsSaveTimer) clearTimeout(_sessionsSaveTimer);
  _sessionsSaveTimer = setTimeout(() => {
    _sessionsSaveTimer = null;
    try {
      const data = {};
      for (const [token, session] of guestSessions) {
        data[token] = {
          hostKey: session.hostKey,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          photoIds: [...session.photoIds],
        };
      }
      // Écriture atomique + fsync : un arrêt du processus ne tronque pas le
      // fichier persistant (toutes les galeries invitées restent lisibles).
      writeJsonAtomic(SESSIONS_FILE, data);
    } catch (error) {
      console.error("[MomentoBooth] sauvegarde des sessions :", error);
    }
  }, 400);
}

function guestSessionFromRaw(token, raw, now = Date.now()) {
  if (!GUEST_TOKEN_RE.test(token) || !raw || !Number.isFinite(Number(raw.expiresAt)) || Number(raw.expiresAt) <= now) return null;
  const photoIds = Array.isArray(raw.photoIds)
    ? raw.photoIds.filter((id) => PHOTO_NAME_RE.test(String(id)) && fs.existsSync(path.join(PHOTOS_DIR, id)))
    : [];
  return {
    token,
    hostKey: String(raw.hostKey || ""),
    createdAt: Number(raw.createdAt) || now,
    expiresAt: Number(raw.expiresAt),
    photoIds: new Set(photoIds),
    live: null,
    liveClients: new Set(),
    lastFrameAt: 0,
  };
}

function loadGuestSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const now = Date.now();
    const retained = {};
    const expiredPhotoIds = new Set();
    let changed = false;
    for (const [token, raw] of Object.entries(data)) {
      const session = guestSessionFromRaw(token, raw, now);
      if (session) {
        guestSessions.set(token, session);
        retained[token] = {
          hostKey: session.hostKey,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          photoIds: [...session.photoIds],
        };
      } else if (Number(raw?.expiresAt) <= now) {
        changed = true;
        if (Array.isArray(raw?.photoIds)) {
          raw.photoIds.filter((id) => PHOTO_NAME_RE.test(String(id))).forEach((id) => expiredPhotoIds.add(id));
        }
      } else {
        // Les entrées invalides ne doivent pas être réinjectées dans la Map ni
        // conservées indéfiniment dans le fichier persistant.
        changed = true;
      }
    }
    if (changed) {
      const activePhotoIds = new Set(Object.values(retained).flatMap((entry) => entry.photoIds));
      for (const id of expiredPhotoIds) {
        if (!activePhotoIds.has(id)) {
          try { fs.rmSync(path.join(PHOTOS_DIR, id), { force: true }); } catch {}
        }
      }
      writeJsonAtomic(SESSIONS_FILE, retained);
    }
  } catch (error) {
    console.error("[MomentoBooth] chargement des sessions :", error);
  }
}
loadGuestSessions();

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function hydrateGuestSession(token) {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const session = guestSessionFromRaw(token, data?.[token]);
    if (session) guestSessions.set(token, session);
    return session;
  } catch (error) {
    console.error("[MomentoBooth] hydratation session invitée :", error);
    return null;
  }
}
function persistedGuestPhotoReferenced(id, exceptToken = "") {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const now = Date.now();
    return Object.entries(data).some(([token, raw]) => token !== exceptToken
      && Number(raw?.expiresAt) > now
      && Array.isArray(raw?.photoIds)
      && raw.photoIds.includes(id));
  } catch {
    // En cas de fichier illisible, on conserve le fichier plutôt que de risquer
    // de supprimer une photo encore référencée par une autre session.
    return true;
  }
}
function findPublishedGuestSession(id) {
  const local = [...guestSessions.values()].find((candidate) => candidate.photoIds.has(id));
  if (local) return local;
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    for (const [token, raw] of Object.entries(data)) {
      const session = guestSessionFromRaw(token, raw);
      if (session?.photoIds.has(id)) return session;
    }
  } catch {}
  return null;
}
function deleteGuestSessionPhotos(token, session) {
  guestSessions.delete(token);
  for (const id of session?.photoIds || []) {
    const referencedLocally = [...guestSessions.values()].some((other) => other.photoIds.has(id));
    if (!referencedLocally && !persistedGuestPhotoReferenced(id, token)) {
      try { fs.rmSync(path.join(PHOTOS_DIR, id), { force: true }); } catch {}
    }
  }
}
function getGuestSession(token) {
  if (!GUEST_TOKEN_RE.test(token)) return null;
  let session = guestSessions.get(token) || hydrateGuestSession(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      session.liveClients?.forEach((client) => client.close());
      session.liveClients?.clear?.();
      session.live = null;
      deleteGuestSessionPhotos(token, session);
      saveGuestSessions();
    }
    return null;
  }
  return session;
}
function requireGuestHost(req, res) {
  const session = getGuestSession(req.params.token);
  if (!session) {
    res.status(404).json({ error: "Lien invité expiré ou introuvable" });
    return null;
  }
  const provided = String(req.get("x-guest-host-key") || "");
  if (!provided || provided !== session.hostKey) {
    res.status(403).json({ error: "Clé hôte invalide" });
    return null;
  }
  return session;
}

app.post("/api/guest/sessions", rateLimit(20), (req, res) => {
  const token = randomToken(24);
  const hostKey = randomToken(32);
  const session = {
    token,
    hostKey,
    createdAt: Date.now(),
    expiresAt: Date.now() + GUEST_TTL_MS,
    /* Démarre vide : seules les photos uploadées avec cette clé hôte sont partagées.
       Cela empêche un client de rattacher l’identifiant d’un autre événement. */
    photoIds: new Set(),
    live: null,
    liveClients: new Set(),
    lastFrameAt: 0,
  };
  guestSessions.set(token, session);
  saveGuestSessions();
  res.status(201).json({
    token,
    hostKey,
    expiresAt: session.expiresAt,
    url: `${publicBase(req)}/guest/${token}`,
  });
});

app.get("/api/guest/:token/gallery", (req, res) => {
  const session = getGuestSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Lien invité expiré ou introuvable" });
  const files = [...session.photoIds].filter((id) => fs.existsSync(path.join(PHOTOS_DIR, id))).sort().reverse();
  res.set("Cache-Control", "no-store").json({
    photos: files.map((id) => ({ id, url: `/api/guest/${encodeURIComponent(session.token)}/photos/${encodeURIComponent(id)}` })),
  });
});

app.get("/api/guest/:token/live", (req, res) => {
  const session = getGuestSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Lien invité expiré ou introuvable" });
  if (!session.live || Date.now() - session.lastFrameAt > GUEST_MAX_FRAME_AGE_MS) {
    return res.status(204).end();
  }
  res.set({
    "Cache-Control": "no-store",
    "Content-Type": session.live.type,
    ...(session.live.frameId ? { "x-mb-frame-id": session.live.frameId } : {}),
    ...(session.live.sessionId ? { "x-mb-source-session-id": session.live.sessionId } : {}),
  });
  res.send(session.live.buffer);
});

/* Flux continu invité : MJPEG multipart. (sans rate-limit : connexion longue)
   L'invité ne demande toujours aucune permission caméra : son <img> garde une
   connexion HTTP ouverte et reçoit chaque nouvelle frame dès sa publication. */
app.get("/api/guest/:token/live/stream", (req, res) => {
  const session = getGuestSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Lien invité expiré ou introuvable" });
  if (!session.liveClients) session.liveClients = new Set();
  const boundary = GUEST_LIVE_STREAM_BOUNDARY;
  let closed = false;
  let writing = false;
  let pendingFrame = null;
  const flushFrame = () => {
    if (closed || writing || !pendingFrame?.buffer?.length) return;
    const frame = pendingFrame;
    pendingFrame = null;
    if (closed || !frame?.buffer?.length) return;
    try {
      // Une seule écriture rend chaque partie atomique et permet de détecter
      // immédiatement un invité trop lent. On le retire plutôt que d'empiler
      // des JPEG en mémoire dans le conteneur Modal.
      const correlation = `${frame.frameId ? `X-MB-Frame-ID: ${frame.frameId}\r\n` : ""}${frame.sessionId ? `X-MB-Source-Session-ID: ${frame.sessionId}\r\n` : ""}`;
      const header = Buffer.from(`--${boundary}\r\nContent-Type: ${frame.type || "image/jpeg"}\r\nContent-Length: ${frame.buffer.length}\r\nCache-Control: no-store\r\n${correlation}\r\n`);
      const payload = Buffer.concat([header, frame.buffer, Buffer.from("\r\n")]);
      writing = true;
      const accepted = res.write(payload);
      if (accepted) {
        writing = false;
        if (pendingFrame) setImmediate(flushFrame);
      } else {
        // Coalesce les frames pendant le backpressure au lieu de les empiler.
        res.once("drain", () => {
          writing = false;
          flushFrame();
        });
      }
    } catch { close(); }
  };
  const writeFrame = (frame) => {
    if (closed || !frame?.buffer?.length) return;
    pendingFrame = frame;
    flushFrame();
  };
  let staleTimer = null;
  const client = { writeFrame, close: () => close() };
  const close = () => {
    if (closed) return;
    closed = true;
    if (staleTimer) clearInterval(staleTimer);
    staleTimer = null;
    session.liveClients.delete(client);
    try { res.end(); } catch {}
  };
  res.status(200).set({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  session.liveClients.add(client);
  if (session.live && Date.now() - session.lastFrameAt <= GUEST_MAX_FRAME_AGE_MS) writeFrame(session.live);
  // Une borne arrêtée ne doit pas laisser une galerie afficher une dernière
  // image indéfiniment : fermer le flux force le client à se reconnecter ou
  // à passer au fallback JPEG.
  staleTimer = setInterval(() => {
    if (closed) return;
    if (!session.live || Date.now() - session.lastFrameAt > GUEST_LIVE_STREAM_STALE_MS) close();
  }, 1_500);
  req.on("close", close);
  res.on("close", close);
  res.on("error", close);
});

app.post("/api/guest/:token/live", rateLimit(240), liveUpload.single("frame"), (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  if (!req.file) return res.status(400).json({ error: "Image de prévisualisation requise" });
  const now = Date.now();
  // Jusqu'à ~3 images/s : le flux MJPEG reste fluide sans transformer la
  // borne en encodeur vidéo lourd. Les anciens clients plus lents restent OK.
  if (now - session.lastFrameAt < 280) return res.status(429).json({ error: "Cadence trop élevée" });
  const frameId = String(req.headers["x-mb-frame-id"] || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 96);
  const sessionId = String(req.headers["x-mb-session-id"] || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 128);
  session.live = { buffer: req.file.buffer, type: req.file.mimetype, frameId, sessionId };
  session.lastFrameAt = now;
  // Diffuse la frame à tous les invités connectés au flux MJPEG.
  session.liveClients?.forEach((client) => client.writeFrame(session.live));
  res.status(204).end();
});

app.delete("/api/guest/:token/live", (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  session.live = null;
  session.lastFrameAt = 0;
  session.liveClients?.forEach((client) => client.close());
  res.status(204).end();
});

app.delete("/api/guest/:token", (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  session.liveClients?.forEach((client) => client.close());
  session.liveClients?.clear?.();
  session.live = null;
  // La suppression volontaire suit le même chemin que l’expiration : les
  // photos de cette session sont retirées si aucune session active ne les
  // référence encore.
  deleteGuestSessionPhotos(req.params.token, session);
  saveGuestSessions();
  res.json({ ok: true });
});

/* Nettoyage des liens et images de live en mémoire. */
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of guestSessions) {
    if (session.expiresAt <= now) {
      session.liveClients?.forEach((client) => client.close());
      deleteGuestSessionPhotos(token, session);
      changed = true;
    } else if (session.live && now - session.lastFrameAt > GUEST_MAX_FRAME_AGE_MS) {
      session.live = null;
    }
  }
  if (changed) saveGuestSessions();
}, 15 * 60 * 1000).unref?.();

/* =========================================================
   CAMÉRA DÉPORTÉE — un iPhone sert de caméra, une tablette
   d'interface de contrôle (vrai photomaton).
   ========================================================= */
const REMOTE_CAM_TTL_MS = 24 * 60 * 60 * 1000;
const REMOTE_CAM_MAX_FRAME_AGE_MS = 12_000;
/* Fenêtre de jumelage large ET glissante : la borne caméra qui reste ouverte
   en attente prolonge elle-même la validité du code à chaque poll. Le code ne
   peut donc plus expirer « avant la liaison » pendant que la caméra attend. */
const REMOTE_CAM_PAIR_TTL_MS = 45 * 60 * 1000;
/* Dé-jumelage automatique : un contrôleur silencieux depuis plus longtemps que
   cette durée rend la session à nouveau « en attente ». La caméra réapparaît
   alors dans la liste de l'Interface et un nouveau pairage est possible, sans
   relancer le mode Caméra. Réglable via env pour les tests. */
const REMOTE_CAM_CONTROLLER_GRACE_MS = Number(process.env.MB_CONTROLLER_GRACE_MS) || 45_000;
const REMOTE_CAM_PAIR_CODE_LENGTH = 6;
const REMOTE_CAM_COMMAND_LIMIT = 24;
const REMOTE_CAM_COMMANDS = new Set([
  "portraitMode", "burstMode", "qualityMax", "performanceMode", "trackEnabled",
  "idleEnabled", "idleFaceWake", "prerollEnabled", "filmBubbleEnabled",
  "lightFrameEnabled", "logoEnabled", "flashMode", "autoDelay", "timerSeconds", "captureCount",
  "prankBug", "prankText", "prankSound", "flipCamera", "lensDeviceId",
]);
const remoteCamSessions = new Map();
const remotePairAttempts = new Map();
const remoteControllerHeartbeatPersistAt = new Map();

function randomPairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: REMOTE_CAM_PAIR_CODE_LENGTH }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  } while ([...remoteCamSessions.values()].some((session) => session.pairCode === code));
  return code;
}

function remoteMetaPath(token) { return path.join(REMOTE_CAM_DIR, `${token}.json`); }
function remoteFramePath(token) { return path.join(REMOTE_CAM_DIR, `${token}.jpg`); }
function discoveryMetaPath(id) { return path.join(REMOTE_CAM_DIR, `discovery-${id}.json`); }
function pairRequestMetaPath(id) { return path.join(REMOTE_CAM_DIR, `pair-request-${id}.json`); }
function writeRemoteJson(file, value) {
  writeJsonAtomic(file, value);
}
function writeRemoteFrame(file, buffer) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
}
function persistDiscoveryEntry(entry) {
  if (!entry?.id) return;
  writeRemoteJson(discoveryMetaPath(entry.id), {
    id: entry.id, kind: entry.kind, name: entry.name, cameraToken: entry.cameraToken,
    hostKey: entry.hostKey, lastSeenAt: entry.lastSeenAt,
  });
}
function hydrateDiscoveryEntry(id) {
  const key = String(id || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!key) return null;
  try {
    const file = discoveryMetaPath(key);
    if (!fs.existsSync(file)) return null;
    const entry = JSON.parse(fs.readFileSync(file, "utf8"));
    if (entry.id !== key || !entry.cameraToken) return null;
    deviceDiscovery.set(key, entry);
    return entry;
  } catch { return null; }
}
function removeDiscoveryEntry(id) {
  if (!id) return;
  deviceDiscovery.delete(id);
  try { fs.rmSync(discoveryMetaPath(id), { force: true }); } catch {}
}
function persistPairRequest(request) {
  if (!request?.requestId) return;
  writeRemoteJson(pairRequestMetaPath(request.requestId), request);
}
function hydratePairRequest(id) {
  const key = String(id || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!key) return null;
  try {
    const file = pairRequestMetaPath(key);
    if (!fs.existsSync(file)) return null;
    const request = JSON.parse(fs.readFileSync(file, "utf8"));
    if (request.requestId !== key) return null;
    pairRequests.set(key, request);
    return request;
  } catch { return null; }
}
function removePairRequest(id) {
  if (!id) return;
  pairRequests.delete(id);
  try { fs.rmSync(pairRequestMetaPath(id), { force: true }); } catch {}
}
function loadPersistedDiscovery() {
  try {
    const files = new Set();
    for (const entry of fs.readdirSync(REMOTE_CAM_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith("discovery-") && entry.name.endsWith(".json")) {
        const id = entry.name.slice(10, -5);
        files.add(id);
        hydrateDiscoveryEntry(id);
      }
    }
    for (const id of [...deviceDiscovery.keys()]) if (!files.has(id)) deviceDiscovery.delete(id);
  } catch {}
}
function loadPersistedPairRequests() {
  try {
    const files = new Set();
    for (const entry of fs.readdirSync(REMOTE_CAM_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith("pair-request-") && entry.name.endsWith(".json")) {
        const id = entry.name.slice(13, -5);
        files.add(id);
        hydratePairRequest(id);
      }
    }
    for (const id of [...pairRequests.keys()]) if (!files.has(id)) pairRequests.delete(id);
  } catch {}
}
function persistRemoteCamSession(session) {
  const safe = {
    token: session.token, pairCode: session.pairCode, hostKey: session.hostKey,
    controllerToken: session.controllerToken, createdAt: session.createdAt,
    expiresAt: session.expiresAt, pairExpiresAt: session.pairExpiresAt || 0,
    pairedAt: session.pairedAt || 0, lastControllerAt: session.lastControllerAt || 0,
    discoveryId: session.discoveryId || "",
    lastCommandAckAt: session.lastCommandAckAt || 0,
    lastFrameAt: session.lastFrameAt || 0,
    lastFrameId: session.lastFrameId || "",
    lastFrameSessionId: session.lastFrameSessionId || "",
    lastCommandId: session.lastCommandId || 0, commands: session.commands || [],
  };
  const tmp = `${remoteMetaPath(session.token)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(safe));
  fs.renameSync(tmp, remoteMetaPath(session.token));
}
function hydrateRemoteCamSession(identifier) {
  const key = String(identifier || "").trim();
  if (!key) return null;
  const files = fs.readdirSync(REMOTE_CAM_DIR, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  for (const entry of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(REMOTE_CAM_DIR, entry.name), "utf8"));
      const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (data.token !== key && data.controllerToken !== key && data.pairCode !== normalized) continue;
      const session = {
        ...data,
        frame: fs.existsSync(remoteFramePath(data.token)) ? { path: remoteFramePath(data.token), type: "image/jpeg" } : null,
        lastFrameId: String(data.lastFrameId || ""),
        lastFrameSessionId: String(data.lastFrameSessionId || ""),
      };
      remoteCamSessions.set(session.token, session);
      return session;
    } catch { /* métadonnée partiellement écrite : ignorer cette entrée */ }
  }
  return null;
}
function getRemoteCamSession(identifier) {
  const key = String(identifier || "").trim();
  let s = remoteCamSessions.get(key);
  if (!s && key) {
    const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, "");
    s = [...remoteCamSessions.values()].find((session) => session.pairCode === normalized || session.controllerToken === key);
  }
  if (!s) s = hydrateRemoteCamSession(key);
  // Plusieurs conteneurs Modal peuvent servir la même session. Recharge la
  // métadonnée persistée à chaque requête pour ne jamais conserver un timestamp
  // ou une file de commandes obsolète en mémoire locale.
  if (s && fs.existsSync(remoteMetaPath(s.token))) {
    try {
      const latest = JSON.parse(fs.readFileSync(remoteMetaPath(s.token), "utf8"));
      s = {
        ...s, ...latest,
        frame: fs.existsSync(remoteFramePath(s.token)) ? { path: remoteFramePath(s.token), type: "image/jpeg" } : null,
      };
      remoteCamSessions.set(s.token, s);
    } catch { /* une écriture atomique incomplète sera relue à la prochaine requête */ }
  }
  if (!s || Date.now() > s.expiresAt) {
    if (s) {
      remoteCamSessions.delete(s.token);
      try { fs.rmSync(remoteMetaPath(s.token), { force: true }); fs.rmSync(remoteFramePath(s.token), { force: true }); } catch {}
    }
    return null;
  }
  return s;
}
function getRemoteControllerSession(identifier) {
  const session = getRemoteCamSession(identifier);
  return session && session.controllerToken === String(identifier || "").trim() ? session : null;
}

/* Dé-jumelage automatique : si la session est jumelée mais que le contrôleur
   n'a envoyé aucun frame ni commande depuis plus de GRACE_MS (ex. la tablette
   s'est déconnectée, a été éteinte ou a perdu le réseau), on la remet en
   « en attente » : l'ancien contrôleur est révoqué (nouveau secret), la fenêtre
   de jumelage se rouvre et la caméra redevient visible dans la liste. Sans
   cela, la moindre coupure rendait la reconnexion impossible jusqu'au
   redémarrage du mode Caméra. */
function reopenStalePairing(session, now = Date.now()) {
  if (!session || !session.pairedAt) return false;
  if (now - (session.lastControllerAt || 0) <= REMOTE_CAM_CONTROLLER_GRACE_MS) return false;
  session.pairedAt = 0;
  session.pairExpiresAt = now + REMOTE_CAM_PAIR_TTL_MS;
  session.controllerToken = randomToken(24); // révoque l'ancien contrôleur
  session.lastControllerAt = 0;
  // Ne jamais laisser un aperçu de l'ancienne paire être servi au prochain
  // contrôleur pendant la fenêtre de reconnexion.
  session.frame = null;
  session.lastFrameAt = 0;
  session.lastFrameId = "";
  session.lastFrameSessionId = "";
  try { fs.rmSync(remoteFramePath(session.token), { force: true }); } catch {}
  const oldId = session.discoveryId;
  session.discoveryId = "";
  if (oldId) removeDiscoveryEntry(oldId);
  // Une demande d’un ancien contrôleur ne doit ni bloquer la reconnexion ni
  // pouvoir remplacer le prochain contrôleur accepté.
  loadPersistedPairRequests();
  for (const request of pairRequests.values()) {
    if (request.cameraToken === session.token && request.status === "pending") {
      request.status = "expired";
      persistPairRequest(request);
    }
  }
  session.commands = [];
  session.lastCommandId = 0;
  persistRemoteCamSession(session);
  return true;
}

function remoteCommandValueIsValid(name, value) {
  if (!REMOTE_CAM_COMMANDS.has(name)) return false;
  if (name === "performanceMode") return ["eco", "balanced", "max"].includes(value);
  if (name === "flashMode") return ["on", "auto", "off"].includes(value);
  if (name === "autoDelay") return [0.5, 1.5, 3].includes(Number(value));
  if (name === "timerSeconds") return [5, 10, 15, 20].includes(Number(value));
  if (name === "captureCount") return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 6;
  if (name === "prankBug") return typeof value === "boolean";
  if (name === "prankText") return typeof value === "string" && value.length <= 80;
  if (name === "prankSound") return typeof value === "string" && value.length <= 300 && /^https?:\/\//.test(value);
  if (name === "flipCamera") return typeof value === "boolean";
  if (name === "lensDeviceId") return value === null || (typeof value === "string" && value.length <= 128);
  return typeof value === "boolean";
}

/* POST /api/remote-camera/sessions — crée un lien caméra déportée */
app.post("/api/remote-camera/sessions", rateLimit(20), (req, res) => {
  const token = randomToken(24); // secret interne : jamais affiché à l'utilisateur
  const hostKey = randomToken(32); // secret caméra : jamais envoyé à l'interface
  const controllerToken = randomToken(24); // délivré uniquement après échange du code
  const pairCode = randomPairCode(); // code court destiné à l'écran de contrôle
  remoteCamSessions.set(token, {
    token,
    pairCode,
    hostKey,
    controllerToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + REMOTE_CAM_TTL_MS,
    pairExpiresAt: Date.now() + REMOTE_CAM_PAIR_TTL_MS,
    frame: null,
    lastFrameAt: 0,
    lastControllerAt: 0,
    commands: [],
    lastCommandId: 0,
  });
  persistRemoteCamSession(remoteCamSessions.get(token));
  res.status(201).json({
    token,
    hostKey,
    pairCode,
    expiresAt: Date.now() + REMOTE_CAM_TTL_MS,
    pairExpiresAt: remoteCamSessions.get(token).pairExpiresAt,
    pairTtlMs: REMOTE_CAM_PAIR_TTL_MS,
    url: `${publicBase(req)}/?remote=${encodeURIComponent(pairCode)}`,
  });
});

/* Échange ponctuel : le code court n'est jamais accepté comme bearer token
   pour les frames/commandes. L'Interface reçoit un secret de contrôle dédié. */
app.post("/api/remote-camera/pair", rateLimit(20), (req, res) => {
  const code = String(req.body?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const now = Date.now();
  const attempt = remotePairAttempts.get(code) || { count: 0, resetAt: now + 60_000 };
  if (attempt.resetAt <= now) { attempt.count = 0; attempt.resetAt = now + 60_000; }
  attempt.count += 1;
  remotePairAttempts.set(code, attempt);
  if (attempt.count > 12) return res.status(429).json({ error: "Trop de tentatives, patientez une minute" });
  const session = getRemoteCamSession(code);
  if (!session) return res.status(404).json({ error: "Code de jumelage expiré ou inconnu" });
  // Un ancien contrôleur disparu ne doit pas bloquer un nouveau jumelage :
  // la session se ré-ouvre et le code redevient valable.
  reopenStalePairing(session, now);
  if (now > Number(session.pairExpiresAt || 0)) return res.status(404).json({ error: "Code de jumelage expiré ou inconnu" });
  if (session.pairedAt) return res.status(409).json({ error: "Caméra déjà connectée à un autre écran" });
  // Jumelage consommé : la fenêtre glissante s'arrête et la session devient
  // durable tant que les deux appareils restent actifs (rolling 24 h à chaque
  // poll de la caméra et à chaque échange de frames). Toute demande de
  // découverte concurrente est rendue caduque.
  loadPersistedPairRequests();
  for (const request of pairRequests.values()) {
    if (request.cameraToken === session.token && request.status === "pending") {
      request.status = "expired";
      persistPairRequest(request);
    }
  }
  session.commands = [];
  session.lastCommandId = 0;
  session.pairedAt = Date.now();
  session.pairExpiresAt = 0;
  session.expiresAt = session.pairedAt + REMOTE_CAM_TTL_MS;
  // Le pairage par code et la découverte partagent la même session :
  // une caméra déjà prise ne doit pas rester visible quelques secondes dans
  // la liste et provoquer une fausse seconde demande de connexion.
  if (session.discoveryId) {
    removeDiscoveryEntry(session.discoveryId);
    session.discoveryId = "";
  }
  persistRemoteCamSession(session);
  res.json({ accessToken: session.controllerToken, pairCode: session.pairCode, expiresAt: session.expiresAt });
});

/* ═══════════════════════════════════════════════════════════
   DÉCOUVERTE D'APPAREILS — sélection au lieu du code.
   Les caméras en mode « Caméra » s'annoncent périodiquement ; l'écran
   Interface affiche la liste des caméras actives et envoie une demande de
   connexion. La caméra accepte (ou refuse) via une popup. Le jeton de
   contrôle n'est délivré à l'Interface qu'après acceptation.
   ═══════════════════════════════════════════════════════════ */
const DEVICE_DISCOVERY_TTL_MS = 25_000;
const DEVICE_DISCOVERY_SWEEP_MS = 8_000;
const PAIR_REQUEST_TTL_MS = 90_000;
const deviceDiscovery = new Map();   // cache local + volume partagé
const pairRequests = new Map();      // cache local + volume partagé
loadPersistedDiscovery();
loadPersistedPairRequests();

function expirePendingPairRequests(cameraToken, exceptRequestId = "") {
  loadPersistedPairRequests();
  for (const request of pairRequests.values()) {
    if (request.requestId !== exceptRequestId && request.cameraToken === cameraToken && request.status === "pending") {
      request.status = "expired";
      persistPairRequest(request);
    }
  }
}

function sweepDiscovery() {
  loadPersistedDiscovery();
  loadPersistedPairRequests();
  const now = Date.now();
  for (const [id, entry] of deviceDiscovery) {
    if (now - entry.lastSeenAt > DEVICE_DISCOVERY_TTL_MS) removeDiscoveryEntry(id);
  }
  // Pending → expire après le délai ; les demandes traitées (refusées,
  // acceptées et déjà consommées) sont purgées après 60 s de grâce pour
  // laisser le temps à l'Interface de lire le statut final.
  for (const [rid, request] of pairRequests) {
    if (request.status === "pending") {
      if (now - request.createdAt > PAIR_REQUEST_TTL_MS) {
        request.status = "expired";
        persistPairRequest(request);
      }
    } else if (now - request.createdAt > 60_000) {
      removePairRequest(rid);
    }
  }
}
setInterval(sweepDiscovery, DEVICE_DISCOVERY_SWEEP_MS);

/* Balayage de dé-jumelage : les sessions jumelées dont le contrôleur est
   silencieux depuis plus de GRACE_MS se ré-ouvrent toutes seules. La caméra
   réapparaît ainsi dans la liste même si l'Interface n'a jamais redemandé de
   connexion (ex. tablette éteinte puis rallumée). */
setInterval(() => {
  const now = Date.now();
  for (const session of remoteCamSessions.values()) {
    if (session.pairedAt && now - (session.lastControllerAt || 0) > REMOTE_CAM_CONTROLLER_GRACE_MS) {
      reopenStalePairing(session, now);
    }
  }
}, DEVICE_DISCOVERY_SWEEP_MS);

/* La caméra s'annonce (avec son secret hôte, obligatoire) pour devenir
   visible dans la liste de l'Interface. */
app.post("/api/device-discovery/announce", (req, res) => {
  const name = String(req.body?.name || "").replace(/[^\p{L}\p{N} _\-'.]/gu, "").slice(0, 40) || "Appareil";
  const token = String(req.body?.token || "");
  const hostKey = String(req.body?.hostKey || "");
  const session = token && hostKey && getRemoteCamSession(token);
  if (!session || session.hostKey !== hostKey) return res.status(403).json({ error: "Session invalide" });
  // Si l'ancien contrôleur a disparu (silence > GRACE), la session se ré-ouvre
  // et la caméra redevient visible dans la liste de l'Interface.
  reopenStalePairing(session);
  // Une caméra déjà jumelée (contrôleur actif) n'a plus besoin d'apparaître.
  if (session.pairedAt) return res.json({ id: session.discoveryId || "" });
  let id = session.discoveryId;
  let entry = id ? (deviceDiscovery.get(id) || hydrateDiscoveryEntry(id)) : null;
  if (!entry) {
    id = randomToken(12);
    session.discoveryId = id;
    entry = { id, kind: "camera", name, cameraToken: session.token, hostKey, lastSeenAt: Date.now() };
  } else {
    entry.name = name;
    entry.hostKey = hostKey;
    entry.lastSeenAt = Date.now();
  }
  deviceDiscovery.set(id, entry);
  persistDiscoveryEntry(entry);
  persistRemoteCamSession(session);
  res.json({ id });
});

/* Liste des caméras actuellement en ligne (annonce récente uniquement). */
app.get("/api/device-discovery/cameras", (req, res) => {
  sweepDiscovery();
  const now = Date.now();
  loadPersistedDiscovery();
  const cameras = [...deviceDiscovery.values()]
    .filter((entry) => entry.kind === "camera" && now - entry.lastSeenAt <= DEVICE_DISCOVERY_TTL_MS)
    .map((entry) => ({ id: entry.id, name: entry.name, lastSeenAt: entry.lastSeenAt }));
  res.json({ cameras });
});

/* L'Interface demande la connexion à une caméra détectée. */
app.post("/api/device-discovery/pair", rateLimit(30), (req, res) => {
  const cameraId = String(req.body?.cameraId || "");
  const interfaceName = String(req.body?.interfaceName || "").replace(/[^\p{L}\p{N} _\-'.]/gu, "").slice(0, 40) || "Interface";
  // Les deux caches peuvent avoir été réhydratés à des moments différents
  // après un redémarrage/une écriture sur le volume. Rejouer le sweep avant
  // toute décision évite de pairer un appareil périmé ou de créer un doublon.
  sweepDiscovery();
  loadPersistedPairRequests();
  const entry = deviceDiscovery.get(cameraId) || hydrateDiscoveryEntry(cameraId);
  const now = Date.now();
  if (!entry || entry.kind !== "camera" || !Number.isFinite(Number(entry.lastSeenAt)) || now - Number(entry.lastSeenAt) > DEVICE_DISCOVERY_TTL_MS) {
    if (entry?.id) removeDiscoveryEntry(entry.id);
    return res.status(404).json({ error: "Caméra hors ligne" });
  }
  const session = getRemoteCamSession(entry.cameraToken);
  if (!session) return res.status(404).json({ error: "Caméra hors ligne" });
  // Un contrôleur fantôme ne doit pas verrouiller la caméra : la session se
  // ré-ouvre si l'ancien contrôleur est silencieux, puis on rejoint le flux.
  reopenStalePairing(session);
  if (session.pairedAt) return res.status(409).json({ error: "Caméra déjà jumelée" });
  const existing = [...pairRequests.values()].find((r) => r.cameraToken === session.token && r.status === "pending");
  if (existing) return res.status(409).json({ error: "Demande déjà en attente", requestId: existing.requestId });
  const requestId = randomToken(16);
  const request = {
    requestId,
    // Cette clé courte durée reste uniquement dans la page Interface qui a
    // créé la demande. Elle empêche un tiers connaissant requestId de lire le
    // controllerToken après acceptation.
    pairKey: randomToken(24),
    cameraToken: session.token,
    cameraName: entry.name,
    interfaceName,
    controllerToken: randomToken(24),
    status: "pending",
    createdAt: Date.now(),
  };
  pairRequests.set(requestId, request);
  persistPairRequest(request);
  res.status(201).json({ requestId, pairKey: request.pairKey });
});

/* L'Interface interroge l'état de sa demande ; le jeton de contrôle n'est
   renvoyé qu'une fois la demande acceptée par la caméra. */
app.get("/api/device-discovery/requests/:requestId", (req, res) => {
  const requestId = String(req.params.requestId || "");
  const request = hydratePairRequest(requestId) || pairRequests.get(requestId);
  if (!request) return res.status(404).json({ error: "Demande introuvable" });
  const providedPairKey = String(req.headers["x-pair-key"] || "");
  const expectedPairKey = String(request.pairKey || "");
  const providedBytes = Buffer.from(providedPairKey);
  const expectedBytes = Buffer.from(expectedPairKey);
  const authorized = Boolean(expectedBytes.length && providedBytes.length === expectedBytes.length)
    && crypto.timingSafeEqual(providedBytes, expectedBytes);
  if (!authorized) return res.status(403).json({ error: "Clé de demande invalide" });
  res.json({
    status: request.status,
    controllerToken: request.status === "accepted" ? request.controllerToken : undefined,
    cameraName: request.cameraName,
    expiresAt: request.createdAt + PAIR_REQUEST_TTL_MS,
  });
});

/* L'Interface peut annuler sa propre demande lorsqu'elle ferme le sélecteur
   ou change d'appareil. La clé privée de la demande est obligatoire. */
app.delete("/api/device-discovery/requests/:requestId", rateLimit(60), (req, res) => {
  const requestId = String(req.params.requestId || "");
  const request = hydratePairRequest(requestId) || pairRequests.get(requestId);
  if (!request) return res.status(404).json({ error: "Demande introuvable" });
  const providedPairKey = String(req.headers["x-pair-key"] || "");
  const expectedPairKey = String(request.pairKey || "");
  const providedBytes = Buffer.from(providedPairKey);
  const expectedBytes = Buffer.from(expectedPairKey);
  const authorized = Boolean(expectedBytes.length && providedBytes.length === expectedBytes.length)
    && crypto.timingSafeEqual(providedBytes, expectedBytes);
  if (!authorized) return res.status(403).json({ error: "Clé de demande invalide" });
  if (request.status === "pending") {
    request.status = "cancelled";
    persistPairRequest(request);
  }
  res.status(204).end();
});

/* La caméra récupère les demandes de connexion en attente. */
app.get("/api/remote-camera/:token/pair-requests", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  const now = Date.now();
  loadPersistedPairRequests();
  const requests = [...pairRequests.values()]
    .filter((r) => r.cameraToken === session.token && r.status === "pending" && now - r.createdAt <= PAIR_REQUEST_TTL_MS)
    .map((r) => ({ requestId: r.requestId, interfaceName: r.interfaceName, createdAt: r.createdAt }));
  res.json({ requests });
});

/* La caméra accepte ou refuse la demande. En cas d'acceptation, la session
   devient jumelée : mêmes effets que le code (pairedAt, fenêtre terminée). */
app.post("/api/remote-camera/:token/pair-requests/:requestId", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  const requestId = String(req.params.requestId || "");
  const request = hydratePairRequest(requestId) || pairRequests.get(requestId);
  if (!request || request.cameraToken !== session.token) return res.status(404).json({ error: "Demande introuvable" });
  if (request.status !== "pending") return res.status(409).json({ error: "Demande déjà traitée" });
  if (req.body?.accept === true) {
    // Le jeton de contrôle de la DEMANDE devient celui de la SESSION : c'est
    // lui que l'Interface utilisera pour lire les frames et envoyer des
    // commandes (getRemoteControllerSession compare session.controllerToken).
    expirePendingPairRequests(session.token, request.requestId);
    session.commands = [];
    session.lastCommandId = 0;
    session.controllerToken = request.controllerToken;
    session.pairedAt = Date.now();
    session.pairExpiresAt = 0;
    session.expiresAt = Date.now() + REMOTE_CAM_TTL_MS;
    // Retire immédiatement la caméra de la liste de découverte.
    if (session.discoveryId) removeDiscoveryEntry(session.discoveryId);
    session.discoveryId = "";
    persistRemoteCamSession(session);
    request.status = "accepted";
  } else {
    request.status = "refused";
  }
  persistPairRequest(request);
  res.json({ status: request.status });
});

/* DELETE /api/remote-camera/:token — révoque une session caméra hôte */
app.delete("/api/remote-camera/:token", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  remoteCamSessions.delete(session.token);
  remoteControllerHeartbeatPersistAt.delete(session.token);
  if (session.discoveryId) removeDiscoveryEntry(session.discoveryId);
  loadPersistedPairRequests();
  for (const request of pairRequests.values()) {
    if (request.cameraToken === session.token) removePairRequest(request.requestId);
  }
  try { fs.rmSync(remoteMetaPath(session.token), { force: true }); fs.rmSync(remoteFramePath(session.token), { force: true }); } catch {}
  res.status(204).end();
});

/* POST /api/remote-camera/:token/frame — l'iPhone envoie une frame (JPEG) */
// Le client publie un aperçu JPEG 640 px : 1,5 Mo est largement suffisant
// et empêche une session distante de réserver plusieurs Mo de RAM inutilement.
function looksLikeJpeg(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4
    && buffer[0] === 0xff && buffer[1] === 0xd8
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}
const remoteFrameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_500_000 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/jpeg$/i.test(file.mimetype)),
});
app.post("/api/remote-camera/:token/frame", rateLimit(240), remoteFrameUpload.single("frame"), (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  if (!req.file || !looksLikeJpeg(req.file.buffer)) return res.status(400).json({ error: "Frame JPEG invalide" });
  // Les marqueurs SOI/EOI seuls peuvent être usurpés : décoder avant de
  // persister évite de distribuer une frame que le navigateur ne saura pas lire.
  try { decodeJpeg(req.file.buffer, 128); }
  catch { return res.status(400).json({ error: "Frame JPEG invalide" }); }
  // Le dernier JPEG est écrit atomiquement sur le volume partagé : Modal peut
  // ainsi servir la frame depuis un autre conteneur sans conserver plusieurs
  // copies lourdes en RAM. Le fichier est remplacé à chaque frame et purgé par
  // le sweep de session/âge.
  const frameId = String(req.headers["x-mb-frame-id"] || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 96);
  const frameSessionId = String(req.headers["x-mb-session-id"] || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 128);
  writeRemoteFrame(remoteFramePath(session.token), req.file.buffer);
  session.frame = { path: remoteFramePath(session.token), type: "image/jpeg" };
  session.lastFrameId = frameId;
  session.lastFrameSessionId = frameSessionId;
  session.lastFrameAt = Date.now();
  // Activité réelle des deux appareils → session vivante (rolling).
  session.expiresAt = Date.now() + REMOTE_CAM_TTL_MS;
  if (!session.pairedAt) session.pairExpiresAt = Date.now() + REMOTE_CAM_PAIR_TTL_MS;
  persistRemoteCamSession(session);
  res.status(204).end();
});

/* GET /api/remote-camera/:token/frame — la tablette récupère la dernière frame */
app.get("/api/remote-camera/:token/frame", (req, res) => {
  const session = getRemoteControllerSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const controllerNow = Date.now();
  session.expiresAt = controllerNow + REMOTE_CAM_TTL_MS; // contrôleur actif → session vivante
  session.lastControllerAt = controllerNow; // contrôleur présent → pas de dé-jumelage
  const heartbeatPersistedAt = remoteControllerHeartbeatPersistAt.get(session.token) || 0;
  if (controllerNow - heartbeatPersistedAt >= 1000) {
    remoteControllerHeartbeatPersistAt.set(session.token, controllerNow);
    persistRemoteCamSession(session);
  }
  if (!session.frame || controllerNow - session.lastFrameAt > REMOTE_CAM_MAX_FRAME_AGE_MS) {
    // Libère immédiatement le dernier aperçu périmé au lieu d'attendre le
    // nettoyage global des sessions.
    if (session.frame && Date.now() - session.lastFrameAt > REMOTE_CAM_MAX_FRAME_AGE_MS) session.frame = null;
    res.set({
      "Cache-Control": "no-store",
      "x-mb-frame-at": String(session.lastFrameAt || 0),
      "x-mb-controller-seen-at": String(session.lastControllerAt || 0),
      "x-mb-command-acks": JSON.stringify((session.commands || []).filter((command) => command.ackAt).map(({ id, ackAt }) => ({ id, ackAt })).slice(-24)),
    });
    return res.status(204).end();
  }
  res.set({
    "Cache-Control": "no-store",
    "Content-Type": session.frame.type || "image/jpeg",
    "x-mb-frame-at": String(session.lastFrameAt || 0),
    "x-mb-controller-seen-at": String(session.lastControllerAt || 0),
    "x-mb-command-acks": JSON.stringify((session.commands || []).filter((command) => command.ackAt).map(({ id, ackAt }) => ({ id, ackAt })).slice(-24)),
    ...(session.lastFrameId ? { "x-mb-frame-id": session.lastFrameId } : {}),
    ...(session.lastFrameSessionId ? { "x-mb-source-session-id": session.lastFrameSessionId } : {}),
  });
  if (session.frame.buffer) return res.send(session.frame.buffer);
  // Compatibilité avec une ancienne session ayant encore une frame sur disque.
  if (session.frame.path && fs.existsSync(session.frame.path)) return res.sendFile(session.frame.path);
  return res.status(204).end();
});

/* L'interface envoie uniquement des réglages autorisés ; le code court suffit
   pour jumeler les appareils, tandis que la clé hôte reste côté caméra. */
app.post("/api/remote-camera/:token/command", rateLimit(120), (req, res) => {
  const session = getRemoteControllerSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const name = String(req.body?.name || "");
  const value = req.body?.value;
  if (!remoteCommandValueIsValid(name, value)) return res.status(400).json({ error: "Commande refusée" });
  const command = { id: ++session.lastCommandId, name, value, createdAt: Date.now(), ackAt: 0 };
  session.lastControllerAt = Date.now(); // contrôleur actif → pas de dé-jumelage
  session.commands.push(command);
  if (session.commands.length > REMOTE_CAM_COMMAND_LIMIT) session.commands.splice(0, session.commands.length - REMOTE_CAM_COMMAND_LIMIT);
  persistRemoteCamSession(session);
  res.set("x-mb-command-id", String(command.id)).status(202).json({ ok: true, id: command.id, state: "QUEUED" });
});

/* La caméra consomme sa file de réglages avec sa clé hôte. */
app.get("/api/remote-camera/:token/commands", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  const after = Math.max(0, Number(req.query.after) || 0);
  const now = Date.now();
  // Fenêtre glissante : tant que la borne attend un jumelage, chaque poll
  // prolonge la validité du code affiché. La liaison ne peut plus expirer
  // pendant que la caméra est ouverte.
  if (!session.pairedAt) session.pairExpiresAt = now + REMOTE_CAM_PAIR_TTL_MS;
  session.expiresAt = now + REMOTE_CAM_TTL_MS;
  res.json({
    commands: session.commands.filter((command) => command.id > after).slice(-REMOTE_CAM_COMMAND_LIMIT),
    latest: session.lastCommandId,
    paired: Boolean(session.pairedAt),
    controllerLastSeenAt: session.lastControllerAt || 0,
    lastFrameAt: session.lastFrameAt || 0,
    pairExpiresAt: session.pairedAt ? 0 : session.pairExpiresAt,
  });
});

/* ACK explicite : la Caméra confirme qu'elle a effectivement reçu/appliqué
   la commande. L'Interface ne doit jamais confondre POST 202 (mise en file)
   avec une commande terminée. */
app.post("/api/remote-camera/:token/commands/:id/ack", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  const id = Number(req.params.id);
  const command = session.commands.find((entry) => entry.id === id);
  if (!command) return res.status(404).json({ error: "Commande introuvable" });
  command.ackAt = Date.now();
  session.lastCommandAckAt = command.ackAt;
  session.expiresAt = command.ackAt + REMOTE_CAM_TTL_MS;
  persistRemoteCamSession(session);
  res.json({ ok: true, id, ackAt: command.ackAt });
});

/* Nettoyage des sessions caméra déportée expirées + purge des tentatives de
   jumelage (Map qui ne doit jamais grossir sans fin). */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of remoteCamSessions) {
    if (session.expiresAt <= now) {
      remoteCamSessions.delete(token);
      try { fs.rmSync(remoteMetaPath(token), { force: true }); fs.rmSync(remoteFramePath(token), { force: true }); } catch {}
    } else if (session.frame && now - session.lastFrameAt > REMOTE_CAM_MAX_FRAME_AGE_MS) {
      session.frame = null;
      try { fs.rmSync(remoteFramePath(token), { force: true }); } catch {}
      persistRemoteCamSession(session);
    } else if (session.commands.length > REMOTE_CAM_COMMAND_LIMIT) {
      session.commands.splice(0, session.commands.length - REMOTE_CAM_COMMAND_LIMIT);
      persistRemoteCamSession(session);
    }
  }
  for (const [code, attempt] of remotePairAttempts) {
    if (attempt.resetAt <= now) remotePairAttempts.delete(code);
  }
  // Nettoyage des fichiers de métadonnées orphelins (sessions supprimées en
  // mémoire pendant un redémarrage à froid, frames périmées sur disque).
  try {
    for (const entry of fs.readdirSync(REMOTE_CAM_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const token = entry.name.slice(0, -5);
      if (remoteCamSessions.has(token)) continue;
      let expired = true;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REMOTE_CAM_DIR, entry.name), "utf8"));
        expired = !data || (data.expiresAt || 0) <= now;
      } catch { /* métadonnée illisible : supprimable */ }
      if (expired) {
        try { fs.rmSync(path.join(REMOTE_CAM_DIR, entry.name), { force: true }); } catch {}
        try { fs.rmSync(remoteFramePath(token), { force: true }); } catch {}
      }
    }
  } catch { /* dossier temporairement inaccessible : ignorer */ }
}, 10 * 60 * 1000).unref?.();

/* ---- QR codes ---- */
/* Génère un QR de façon robuste : URL validée (schéma + longueur raisonnable)
   et erreur contrôlée au lieu d'un 500 opaque. */
async function sendQr(res, url, options = {}) {
  try {
    const qr = await QRCode.toBuffer(url, { width: 600, margin: 2, ...options });
    res.set("Cache-Control", "public, max-age=3600").type("png").send(qr);
  } catch {
    res.status(400).json({ error: "QR impossible à générer" });
  }
}
function safeQrUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length > 2048) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
}

app.get("/api/photos/:id/qr", async (req, res) => {
  const id = path.basename(String(req.params.id || ""));
  if (!PHOTO_NAME_RE.test(id)) return res.status(404).json({ error: "Photo introuvable" });
  const base = publicBase(req);
  return sendQr(res, `${base}/api/photos/${id}`, { color: { dark: "#0a0a14", light: "#ffffff" } });
});

app.get("/api/qr", (req, res) => {
  const url = safeQrUrl(req.query.url) || `${publicBase(req)}/`;
  return sendQr(res, url);
});

/* Erreurs d'upload API : une frame trop grosse est une erreur client,
   pas une panne serveur. Évite un 500 trompeur côté Interface distante. */
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: status === 413 ? "Aperçu trop volumineux" : "Upload invalide" });
  }
  if (req.path.startsWith("/api/")) {
    console.error("[MomentoBooth] erreur API", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
  return next(error);
});

/* =========================================================
   Extension P0 Lévy — Galerie événementielle permanente + multi-variantes
   - POST /api/photos/batch : upload 1-5 variantes liées par captureId
   - GET  /api/gallery      : galerie permanente sans token invité
   - GET  /api/event/:eventId/captures : par événement nommé
   - DELETE /api/captures/:captureId   : supprime capture (corbeille)
   - POST /api/process/photostrip      : photo + portrait vertical 3-N photos
   ========================================================= */

/* ---------- Stockage métadonnées captures ---------- */
const CAPTURES_FILE = path.join(PHOTOS_DIR, ".captures.json");
const captures = new Map(); // captureId → { id, eventId, createdAt, variants: {original, filtered, portrait, gif_silent, gif_sound_vid}, ownerGuestToken }

function loadCaptures() {
  try {
    if (!fs.existsSync(CAPTURES_FILE)) return;
    const data = JSON.parse(fs.readFileSync(CAPTURES_FILE, "utf8"));
    for (const [cid, meta] of Object.entries(data)) {
      if (typeof cid === "string" && meta && typeof meta === "object") {
        captures.set(cid, {
          id: cid,
          eventId: String(meta.eventId || "default"),
          createdAt: Number(meta.createdAt) || Date.now(),
          variants: {
            original: meta.variants?.original || null,
            filtered: meta.variants?.filtered || null,
            portrait: meta.variants?.portrait || null,
            gif_silent: meta.variants?.gif_silent || null,
            gif_sound_vid: meta.variants?.gif_sound_vid || null,
          },
          ownerGuestToken: typeof meta.ownerGuestToken === "string" ? meta.ownerGuestToken : "",
        });
      }
    }
  } catch (error) {
    console.error("[MomentoBooth] captures load", error);
  }
}
function saveCaptures() {
  try {
    const temp = `${CAPTURES_FILE}.${process.pid}.tmp`;
    const obj = {};
    for (const [cid, meta] of captures) obj[cid] = meta;
    fs.writeFileSync(temp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    fs.renameSync(temp, CAPTURES_FILE);
  } catch (error) {
    console.error("[MomentoBooth] captures save", error);
  }
}
loadCaptures();

/* Nommage des variantes : `captureId--kind.ext`. */
function generateVariantFilename(captureId, kind, ext) {
  return `${captureId}--${kind}.${ext}`;
}
/* Un captureId ne peut contenir que des chiffres + tiret + hex : le filename
   multer est résolu via path.join(destination, filename), donc un `../` dans
   le captureId écrirait le fichier HORS de PHOTOS_DIR (CWE-22 write). */
function safeCaptureId(raw) {
  const s = String(raw || "");
  return /^\d{10,15}-[0-9a-f]{8}$/i.test(s)
    ? s
    : `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}
const CAPTURE_NAME_RE = /^(\\d{10,15}-[0-9a-f]{8})--([a-z_]+)\\.(jpg|gif|mp4|webm|m4a)$/i;
function parseVariantFromName(name) {
  const match = String(name).match(CAPTURE_NAME_RE);
  if (!match) return null;
  return { captureId: match[1], variant: match[2], ext: match[3].toLowerCase() };
}

/* ---------- Multer batch : Original+Filtré+Portrait+GIF-silencieux+Vidéo-son ---------- */
const batchUpload = multer({
  storage: multer.diskStorage({
    destination: PHOTOS_DIR,
    filename: (req, file, cb) => {
      const kind = String(file.fieldname || "photo").toLowerCase();
      // Assainissement strict : un captureId hostile (`../`) ne doit JAMAIS
      // atteindre le filename multer (voir safeCaptureId).
      const captureId = safeCaptureId(req.body.captureId);
      let ext = "jpg";
      if (/^image\/gif$/i.test(file.mimetype)) ext = "gif";
      else if (/^video\/(mp4|webm)$/i.test(file.mimetype)) ext = file.mimetype.endsWith("webm") ? "webm" : "mp4";
      else if (/^audio\/(mp4|m4a)$/i.test(file.mimetype)) ext = "m4a";
      cb(null, generateVariantFilename(captureId, kind, ext));
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024, files: 5, fields: 16 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|gif|webp)$/i.test(file.mimetype) ||
               /^video\/(mp4|webm)$/i.test(file.mimetype) ||
               /^audio\/(mp4|m4a)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

/* Vérifie la signature binaire d'un fichier stocké (anti-spoof), incluant vidéo. */
function hasMediaSignature(filePath, mimeType) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, header.length, 0);
    if (/^image\/jpeg$/i.test(mimeType)) return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (/^image\/gif$/i.test(mimeType)) {
      const magic = header.subarray(0, 6).toString("ascii");
      return magic === "GIF87a" || magic === "GIF89a";
    }
    if (/^video\/mp4$/i.test(mimeType)) {
      return header.subarray(4, 8).toString("ascii") === "ftyp";
    }
    if (/^video\/webm$/i.test(mimeType)) {
      return header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    }
    if (/^audio\/(mp4|m4a)$/i.test(mimeType)) {
      return header.subarray(4, 8).toString("ascii") === "ftyp";
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch {}
  }
}

app.post("/api/photos/batch", rateLimit(20), batchUpload.fields([
  { name: "original", maxCount: 1 },
  { name: "filtered", maxCount: 1 },
  { name: "portrait", maxCount: 1 },
  { name: "gif_silent", maxCount: 1 },
  { name: "gif_sound_vid", maxCount: 1 },
]), (req, res) => {
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  if (token || hostKey) {
    const session = token && hostKey && getGuestSession(token);
    if (!session || session.hostKey !== hostKey) {
      for (const file of Object.values(req.files || {}).flat()) {
        try { fs.unlinkSync(file.path); } catch {}
      }
      return res.status(403).json({ error: "Session invitée invalide" });
    }
  }
  const eventId = String(req.body.eventId || "default").slice(0, 64);
  const messageInvite = String(req.body.messageInvite || "").slice(0, 200);
  const variants = {};
  for (const kind of ["original", "filtered", "portrait", "gif_silent", "gif_sound_vid"]) {
    const file = req.files?.[kind]?.[0];
    if (!file) continue;
    if (!hasMediaSignature(file.path, file.mimetype)) {
      try { fs.unlinkSync(file.path); } catch {}
      continue;
    }
    variants[kind] = file.filename;
  }
  if (!Object.keys(variants).length) return res.status(400).json({ error: "Aucune variante valide" });
  // Le captureId de référence est celui des FILENAMES réellement écrits par
  // multer (préfixe avant `--`) : il a été assaini par safeCaptureId dans le
  // filename callback. Si le corps a régénéré une autre valeur (timestamp
  // différent), on aligne sur les fichiers pour que la réponse soit cohérente.
  const firstFilename = Object.values(variants).find(Boolean);
  const firstMatch = firstFilename ? String(firstFilename).match(/^([0-9]{10,15}-[0-9a-f]{8})--/) : null;
  const captureId = firstMatch ? firstMatch[1] : safeCaptureId(req.body.captureId);
  const record = {
    id: captureId,
    eventId,
    createdAt: Date.now(),
    messageInvite,
    variants: {
      original: variants.original || null,
      filtered: variants.filtered || null,
      portrait: variants.portrait || null,
      gif_silent: variants.gif_silent || null,
      gif_sound_vid: variants.gif_sound_vid || null,
    },
    ownerGuestToken: token || "",
  };
  captures.set(captureId, record);
  saveCaptures();
  const base = publicBase(req);
  const response = {
    captureId,
    eventId,
    variants: Object.fromEntries(
      Object.entries(record.variants).filter(([, v]) => v).map(([k, v]) => [k, `${base}/api/photos/${v}`])
    ),
  };
  res.status(201).json(response);
});

/* ---------- Galerie événementielle permanente (P0) ---------- */
function captureToPublic(capture) {
  const variantUrls = {};
  for (const [kind, filename] of Object.entries(capture.variants)) {
    if (filename) variantUrls[kind] = `/api/photos/${filename}`;
  }
  return {
    captureId: capture.id,
    eventId: capture.eventId,
    createdAt: capture.createdAt,
    messageInvite: capture.messageInvite || "",
    variants: variantUrls,
  };
}

app.get("/api/gallery", rateLimit(120), (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const eventCaptures = [...captures.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(captureToPublic);
  res.set("Cache-Control", "no-store").json({ captures: eventCaptures });
});

app.get("/api/event/:eventId/captures", rateLimit(120), (req, res) => {
  const eventId = String(req.params.eventId || "default");
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const eventCaptures = [...captures.values()]
    .filter((c) => c.eventId === eventId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(captureToPublic);
  res.set("Cache-Control", "no-store").json({ eventId, captures: eventCaptures });
});

/* Suppression complète d'une capture (corbeille). Organisateur requis. */
app.delete("/api/captures/:captureId", rateLimit(30), (req, res) => {
  // Auth organisateur : le header standard est x-organizer-token (vérifié
  // par isOrganizerAuthorized), PAS x-organizer-session qui n'existe pas.
  if (!isOrganizerAuthorized(req)) {
    return res.status(403).json({ error: "Accès organisateur requis" });
  }
  const captureId = String(req.params.captureId);
  const capture = captures.get(captureId);
  if (!capture) return res.status(404).json({ error: "Capture inconnue" });
  const moved = [];
  const failed = [];
  for (const [kind, filename] of Object.entries(capture.variants)) {
    if (!filename) continue;
    const photoPath = path.join(PHOTOS_DIR, filename);
    if (!fs.existsSync(photoPath)) { failed.push(filename); continue; }
    const trashPath = path.join(TRASH_DIR, filename);
    try {
      fs.renameSync(photoPath, trashPath);
      trashMeta.set(filename, { deletedAt: Date.now(), deletedBy: "organizer", variant: kind });
      moved.push(filename);
    } catch (err) {
      console.error(`[MomentoBooth] échec déplacement corbeille ${filename} :`, err?.message || err);
      failed.push(filename);
    }
  }
  // Si AUCUNE variante n'a été déplacée, on ne retire pas la capture de la
  // galerie : les fichiers restent référencés et visibles.
  if (moved.length === 0) {
    return res.status(500).json({ error: "Aucune variante déplaçable", captureId });
  }
  captures.delete(captureId);
  saveCaptures();
  saveTrashMeta();
  res.json({ ok: true, captureId, moved, ...(failed.length ? { failed } : {}) });
});

/* ---------- PhotoStrip verticale (3-6 photos, style photomaton) ---------- */
app.post("/api/process/photostrip", rateLimit(20), processZipUpload.array("photos", 6), async (req, res) => {
  try {
    const files = processFiles(req).slice(0, 6);
    if (files.length < 2) return res.status(400).json({ error: "Au moins 2 photos requises" });
    const thumbW = 480;
    const margin = 16;
    const photos = [];
    let totalH = margin;
    for (const file of files) {
      const stream = Readable.from(file.buffer);
      const img = await PImage.decodeJPEGFromStream(stream);
      const aspect = img.width / img.height;
      const w = thumbW;
      const h = Math.round(w / aspect);
      photos.push({ img, w, h });
      totalH += h + margin;
    }
    const stripW = thumbW + margin * 2;
    const canvas = await PImage.make(stripW, totalH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, stripW, totalH);
    ctx.strokeStyle = "#c9a961";
    ctx.lineWidth = 2;
    let y = margin;
    for (const photo of photos) {
      ctx.drawImage(photo.img, 0, 0, photo.img.width, photo.img.height, margin, y, photo.w, photo.h);
      ctx.strokeRect(margin - 2, y - 2, photo.w + 4, photo.h + 4);
      y += photo.h + margin;
    }
    res.set("Content-Type", "image/jpeg");
    res.send(Buffer.from(canvas.toBuffer()));
  } catch (error) {
    console.error("[MomentoBooth] /api/process/photostrip", error);
    res.status(500).json({ error: "PhotoStrip impossible" });
  }
});

/* ---- Frontend PWA ---- */
app.use(express.static(PUBLIC_DIR, {
  maxAge: "1h",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith("manifest.webmanifest") || filePath.endsWith("/sw.js")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));
// Une route /api/ inconnue doit répondre en JSON 404, jamais avec le HTML de
// l'app (évite les faux positifs côté client et les confusions de cache).
app.use("/api", (_req, res) => res.status(404).json({ error: "Route API inconnue" }));
app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

/* ---- Lancement ---- */
const PORT = process.env.PORT || 8787;
// Garde-fou sécurité : en production (env ni "development" ni "test"),
// refuser de démarrer SANS MOMENTOBOOTH_ORGANIZER_PIN configuré. Le repli
// "1818" n'est toléré qu'en dev local, jamais en prod/Modal.
const _isProd = !["development", "test"].includes(process.env.NODE_ENV || "");
if (_isProd && !process.env.MOMENTOBOOTH_ORGANIZER_PIN) {
  console.error("[MomentoBooth] REFUS DE DÉMARRER : MOMENTOBOOTH_ORGANIZER_PIN n'est pas défini (mode production).");
  console.error("[MomentoBooth] Définissez la variable d'environnement MOMENTOBOOTH_ORGANIZER_PIN avant de lancer le serveur.");
  process.exit(1);
}
const httpServer = http.createServer(app);

/* ---- Socket.IO : signalisation WebRTC pour la caméra déportée ---- */
/* Le serveur ne fait que relayer les messages SDP/ICE entre les deux pairs
   (caméra + interface). Aucune média ne transite par ici : c'est du pur P2P.
   Authentification par session distante existante (token + clé de rôle).
   Vérifie la session à chaque connexion et ne relaye que vers le pair dans
   la même room `cam:<sessionToken>`. */
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  // Authentification déjà validée par le middleware io.use() ci-dessous.
  // On peut lire l'auth et rejoindre la room.
  const { token, role } = socket.handshake.auth || {};
  const session = getRemoteCamSession(token);
  // Le middleware a déjà validé la session, mais on reste défensif.
  if (!session) { socket.disconnect(true); return; }
  socket.data = { token, role, sessionToken: session.token };
  socket.join(`cam:${session.token}`);

  // Relai de signalisation : chaque message d'un pair est diffusé à l'autre.
  const relay = (event) => (payload) => {
    socket.to(`cam:${session.token}`).emit(event, payload);
  };
  socket.on("webrtc:offer", relay("webrtc:offer"));
  socket.on("webrtc:answer", relay("webrtc:answer"));
  socket.on("webrtc:ice", relay("webrtc:ice"));
  socket.on("disconnect", () => {
    // Préviens l'autre pair qu'on est parti — lui laisse nettoyer sa peer
    // connection et retomber sur le polling JPEG si nécessaire.
    socket.to(`cam:${session.token}`).emit("webrtc:peer-left", { role });
  });
});

// Middleware d'authentification : tourne AVANT l'événement "connection". Une
// auth invalide est refusée ici (next(err)) → le client reçoit un connect_error
// plutôt qu'une connexion éphémère suivie d'une déconnexion (plus propre pour
// la sémantique de fallback WebRTC côté client).
io.use((socket, next) => {
  const { token, role, key } = socket.handshake.auth || {};
  if (!token || !role || !["camera", "interface"].includes(role)) {
    next(new Error("auth-incomplete"));
    return;
  }
  const session = getRemoteCamSession(token);
  if (!session) {
    next(new Error("session-unknown"));
    return;
  }
  const expectedKey = role === "camera" ? session.hostKey : session.controllerToken;
  if (key !== expectedKey) {
    next(new Error("key-invalid"));
    return;
  }
  next();
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[MomentoBooth] http://0.0.0.0:${PORT} — photos: ${PHOTOS_DIR}`);
});
