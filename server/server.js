/* =========================================================
   MomentoBooth — Serveur Node (stockage local + API + partage)
   - Sert la PWA (public/)
   - POST /api/photos      → upload photo, stockage local
   - GET  /api/photos      → liste des photos
   - GET  /api/photos/:id  → image
   - DELETE /api/photos/:id → DÉPLACE vers .trash/ (récupérable 30 j)
   - GET  /api/photos/:id/qr → QR code de la photo
   - GET  /api/qr?url=...  → QR générique
   - POST /api/guest/sessions → crée un lien invité temporaire
   - GET  /api/guest/:token/gallery → galerie publique en lecture seule
   - GET  /api/guest/:token/live → dernière image de l'aperçu opt-in
   - POST /api/guest/:token/live → publie une image (clé hôte requise)

   Module organizer (P0 du cahier des charges) :
   - POST /api/organizer/verify       → PIN → token de session (4 h)
   - GET  /api/organizer/status        → état (PIN configuré, mode démo)
   - DELETE /api/organizer/session     → logout
   - GET  /api/photos/trash            → liste corbeille (token requis)
   - POST /api/photos/trash/:id/restore → restaure (token requis)
   - DELETE /api/photos/trash/:id      → purge définitive (token requis)
   - GET  /api/event-gallery            → galerie permanente par eventId
   - POST /api/event-gallery            → enregistre un asset (variant)
   ========================================================= */
import express from "express";
import multer from "multer";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
import {
  setupOrganizer,
  isOrganizerPinConfigured,
  setOrganizerPin,
  createOrganizerSession,
  isOrganizerAuthorized,
  revokeOrganizerSession,
  getOrCreateEventId,
  listEventGallery,
  addToEventGallery,
  removeFromEventGallery,
  moveToTrash,
  listTrash,
  restoreFromTrash,
  purgeFromTrash,
  cleanupExpiredTrash,
} from "./organizer.js";

/* Traitement délégué par le téléphone (allège le CPU/RAM de l'iPhone) :
   - gifenc   : encodeur GIF pur JS (l'encodage local gif.js coûte cher sur mobile)
   - fflate   : ZIP pur JS (remplace jszip + DEFLATE côté client)
   - jpeg-js  : décodeur JPEG pur JS (pour scoring et frames GIF) */
import gifenc from "gifenc";
import { zipSync, strToU8 } from "fflate";
import jpeg from "jpeg-js";
import * as PImage from "pureimage";
import { PassThrough } from "node:stream";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
/* PHOTOS_DIR peut être surchargé par l'env (utile pour les tests ou un
   déploiement qui veut un volume séparé). */
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, "..", "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

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

/* ---- Headers de sécurité ----
   - Content-Security-Policy : strict, compatible MediaPipe WASM (worker blob:, connect-src 'self' pour WASM)
   - X-Content-Type-Options : bloque le MIME sniffing
   - Referrer-Policy : déjà présent (no-referrer)
   - Permissions-Policy : on coupe micro/géoloc, on garde caméra
   - X-Frame-Options : anti-clickjacking pour l'UI admin
*/
const CSP = [
  "default-src 'self'",
  // iOS PWA autorise 'unsafe-inline' pour le style par défaut : on l'autorise aussi pour
  // les <style> inline générés par certains builders, mais on garde 'self' pour les scripts
  // (le seul script externe légitime est /mediapipe/ qui passe par 'self').
  "script-src 'self' 'wasm-unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

/* ---- Rate limiting ----
   Protège /api/photos d'un abus (un seul client qui spamme l'upload,
   ou un script qui sature le disque). 60 uploads / 5 min par IP par défaut.
   Les clients d'un événement (header x-guest-host-key valide) ont une limite
   plus haute : 300 / 5 min, pour qu'un event de 4 h ne soit pas étranglé
   par un hôte qui shoot à pleine vitesse (1 photo / 5s en pic). */
const photoUploadLimiterDefault = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop d'uploads, réessayez dans quelques minutes." },
});
const photoUploadLimiterEvent = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop d'uploads pour cet événement, réessayez dans quelques minutes." },
});

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
  fileFilter: (_req, file, cb) => cb(null, /image\//.test(file.mimetype)),
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

const processUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 100 },
});

function processFiles(req) {
  return (req.files || []).filter((f) => f && f.buffer && f.buffer.length).sort((a, b) => (a.fieldname > b.fieldname ? 1 : -1));
}

/* Décode un buffer JPEG en RGBA Uint8Array (recalé si besoin). */
function decodeRgba(buffer, targetW, targetH) {
  const { width, height, data } = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
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
app.post("/api/process/gif", processUpload.array("frames", 32), (req, res) => {
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
    res.status(500).json({ error: "Encodage GIF impossible" });
  }
});

/* ZIP délégué : remplace jszip côté client. */
app.post("/api/process/zip", processUpload.array("files", 50), (req, res) => {
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

/* Ops pixel — mêmes formules que public/js/filters.js (applyOps). */
function applyOps(data, ops) {
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
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const rx = (box.w * 1.7) / 2, ry = (box.h * 1.9) / 2;
  if (!(rx > 0 && ry > 0)) return blur;
  for (let y = 0; y < H; y++) {
    const dy = (y - cy) / ry;
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) {
        const p = (y * W + x) * 4;
        blur[p] = net[p]; blur[p + 1] = net[p + 1]; blur[p + 2] = net[p + 2];
      }
    }
  }
  return blur;
}

/* Encode un buffer RGBA en JPEG (base64). */
async function encodeJpegB64(data, W, H, quality = 92) {
  const img = PImage.make(W, H);
  img.data.set(data);
  const pt = new PassThrough();
  const chunks = [];
  pt.on("data", (c) => chunks.push(c));
  await PImage.encodeJPEGToStream(img, pt, quality);
  pt.end();
  return Buffer.concat(chunks).toString("base64");
}

app.post("/api/process/pack", processUpload.single("frame"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: "Frame requise" });
    const frame = req.file.buffer;
    const filterOps = (() => { try { return JSON.parse(String(req.body.filterOps || "[]")); } catch { return []; } })();
    const faceBox = (() => { try { return JSON.parse(String(req.body.faceBox || "null")); } catch { return null; } })();
    const quality = Math.max(60, Math.min(97, Number(req.body.quality) || 92));
    // Original = frame reçu tel quel (zéro coût, aucune re-compression)
    const original = frame.toString("base64");
    let filtered = null;
    let portrait = null;
    const { width, height, data } = jpeg.decode(frame, { useTArray: true, maxMemoryUsageInMB: 512 });
    if (Array.isArray(filterOps) && filterOps.length) {
      const rgba = new Uint8Array(data);
      applyOps(rgba, filterOps);
      filtered = await encodeJpegB64(rgba, width, height, quality);
    }
    if (faceBox && faceBox.w > 24 && faceBox.h > 24) {
      const rgba = new Uint8Array(data);
      portrait = await encodeJpegB64(ovalPortrait(rgba, width, height, faceBox), width, height, quality);
    }
    res.json({ original, filtered, portrait });
  } catch (error) {
    console.error("[MomentoBooth] /api/process/pack", error);
    res.status(500).json({ error: "Rendu pack impossible" });
  }
});

/* Scoring délégué : mêmes formules que frameScore() du client (variance du
   Laplacien × exposition), calculées ici pour économiser le CPU du téléphone. */
app.post("/api/process/score", processUpload.array("frames", 16), (req, res) => {
  try {
    const files = processFiles(req);
    if (!files.length) return res.status(400).json({ error: "Frames requises" });
    const S = 64;
    const scores = files.map((file) => {
      const { width, height, data } = jpeg.decode(file.buffer, { useTArray: true, maxMemoryUsageInMB: 256 });
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
    res.status(500).json({ error: "Scoring impossible" });
  }
});

app.post("/api/photos", (req, res, next) => {
  // Si le client envoie un hostKey event valide, on lui applique la limite
  // assouplie. Sinon, limite par défaut. La validation du hostKey est faite
  // plus bas dans la chaîne (on ne fait que choisir le limiter ici).
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  const session = token ? guestSessions.get(token) : null;
  const limiter = session && session.hostKey === hostKey ? photoUploadLimiterEvent : photoUploadLimiterDefault;
  limiter(req, res, next);
}, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier image requis" });
  const id = req.file.filename;
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  const hasGuestHeaders = Boolean(token || hostKey);
  const session = token && hostKey && getGuestSession(token);
  if (hasGuestHeaders && (!session || session.hostKey !== hostKey)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "Session invitée invalide" });
  }
  if (session) { session.photoIds.add(id); saveGuestSessions(); }
  const publicUrl = `${publicBase(req)}/api/photos/${id}`;
  res.status(201).json({ id, url: publicUrl, publicUrl });
});

/* Galerie propriétaire historique : les invités passent par /api/guest/:token/gallery. */
/* Helper : résout un id photo en chemin canonique sous PHOTOS_DIR.
   Defense-in-depth : même si `path.basename` neutralise les `..`, on
   vérifie que le chemin résolu reste bien dans PHOTOS_DIR (mitige les
   findings Semgrep `express-res-sendfile`). */
function safePhotoPath(id) {
  const safe = path.basename(String(id || ""));
  if (!safe || !/^[\w.\-]+$/.test(safe)) return null;
  const resolved = path.resolve(PHOTOS_DIR, safe);
  if (!resolved.startsWith(PHOTOS_DIR + path.sep) && resolved !== PHOTOS_DIR) return null;
  return resolved;
}

app.get("/api/photos", (_req, res) => {
  const files = fs.readdirSync(PHOTOS_DIR).filter((f) => /\.(jpg|gif)$/i.test(f)).sort().reverse();
  res.set("Cache-Control", "no-store").json({ photos: files.map((f) => ({ id: f, url: `/api/photos/${f}` })) });
});

/* IMPORTANT : les routes spécifiques /api/photos/trash* doivent être déclarées
   AVANT /api/photos/:id, sinon Express route "trash" comme un :id. */
app.get("/api/photos/trash", (req, res) => {
  if (!isOrganizerAuthorized({ photosDir: PHOTOS_DIR }, req)) return res.status(401).json({ error: "PIN organisateur requis" });
  const items = listTrash({ photosDir: PHOTOS_DIR }).map((item) => {
    const file = path.join(PHOTOS_DIR, ".trash", item.id);
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    return { ...item, size, exists: fs.existsSync(file) };
  });
  res.json({ items });
});

app.post("/api/photos/trash/:id/restore", (req, res) => {
  if (!isOrganizerAuthorized({ photosDir: PHOTOS_DIR }, req)) return res.status(401).json({ error: "PIN organisateur requis" });
  const r = restoreFromTrash({ photosDir: PHOTOS_DIR }, req.params.id);
  if (!r.ok) {
    const code = r.reason === "missing" ? 404 : r.reason === "collision" ? 409 : 500;
    return res.status(code).json({ error: "Restauration impossible", detail: r.reason });
  }
  res.json({ ok: true, id: r.id });
});

app.delete("/api/photos/trash/:id", (req, res) => {
  if (!isOrganizerAuthorized({ photosDir: PHOTOS_DIR }, req)) return res.status(401).json({ error: "PIN organisateur requis" });
  purgeFromTrash({ photosDir: PHOTOS_DIR }, req.params.id);
  res.json({ ok: true });
});

app.get("/api/photos/:id", (req, res) => {
  const file = safePhotoPath(req.params.id);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});

/* URL image scellée au QR : l'invité ne peut demander qu'une photo de sa session. */
app.get("/api/guest/:token/photos/:id", (req, res) => {
  const session = getGuestSession(req.params.token);
  const file = safePhotoPath(req.params.id);
  if (!session || !file || !session.photoIds.has(path.basename(file))) return res.status(404).json({ error: "Photo introuvable" });
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});

app.delete("/api/photos/:id", (req, res) => {
  // Suppression = DÉPLACEMENT VERS LA CORBEILLE (récupérable 30 j).
  // Si un organizer-token est fourni, on flag deletedBy='organizer'.
  // Sinon on flag deletedBy='self' (auto-suppression, ex: bouton ✕ sur vignette).
  const token = String(req.get("x-guest-token") || "");
  const hostKey = String(req.get("x-guest-host-key") || "");
  const hasGuestHeaders = Boolean(token || hostKey);
  const session = token && hostKey && getGuestSession(token);
  if (hasGuestHeaders && (!session || session.hostKey !== hostKey)) return res.status(403).json({ error: "Session invitée invalide" });
  const file = safePhotoPath(req.params.id);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  const who = isOrganizerAuthorized({ photosDir: PHOTOS_DIR }, req) ? "organizer" : "self";
  const r = moveToTrash({ photosDir: PHOTOS_DIR }, path.basename(file), who);
  if (!r.ok) return res.status(500).json({ error: "Suppression impossible", detail: r.reason });
  if (session) session.photoIds.delete(path.basename(file));
  saveGuestSessions();
  res.json({ ok: true, trashed: true, id: r.id, restoreUntil: r.restoreUntil });
});

/* (les routes corbeille sont déclarées plus haut, AVANT /api/photos/:id,
   pour éviter qu'Express ne route "trash" comme un :id. Voir bloc lignes 478.) */

/* ---- Organizer (PIN) ---- */
app.get("/api/organizer/status", (_req, res) => {
  const pinConfigured = isOrganizerPinConfigured({ photosDir: PHOTOS_DIR });
  const eventId = getOrCreateEventId({ photosDir: PHOTOS_DIR });
  res.json({ pinConfigured, eventId, demoPin: process.env.MOMENTOBOOTH_ORGANIZER_PIN_DEMO === "1" });
});

const organizerVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop d'essais, réessayez dans une minute." },
});
app.post("/api/organizer/verify", organizerVerifyLimiter, (req, res) => {
  const pin = String(req.body?.pin || "");
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const r = createOrganizerSession({ photosDir: PHOTOS_DIR }, { ip, plain: pin });
  if (!r.ok) {
    if (r.reason === "locked") {
      res.setHeader("Retry-After", String(Math.ceil(r.retryAfterMs / 1000)));
      return res.status(429).json({ error: "Trop d'essais, réessayez plus tard.", retryAfterMs: r.retryAfterMs });
    }
    if (r.reason === "no-pin") return res.status(503).json({ error: "PIN organisateur non configuré" });
    return res.status(401).json({ error: "PIN incorrect" });
  }
  res.json({ ok: true, token: r.token, expiresInMs: r.expiresInMs });
});

app.delete("/api/organizer/session", (req, res) => {
  const token = String(req.get("x-organizer-token") || "");
  if (token) revokeOrganizerSession({ photosDir: PHOTOS_DIR }, token);
  res.json({ ok: true });
});

/* ---- Galerie événementielle permanente (par eventId) ---- */
app.get("/api/event-gallery", (_req, res) => {
  const eventId = getOrCreateEventId({ photosDir: PHOTOS_DIR });
  const photos = listEventGallery({ photosDir: PHOTOS_DIR });
  res.json({ eventId, count: photos.length, photos });
});

app.post("/api/event-gallery", express.json({ limit: "32kb" }), (req, res) => {
  // Enregistre un asset déjà présent sur le disque. Le client doit d'abord
  // faire un POST /api/photos (multipart) pour pousser le binaire, puis POST
  // /api/event-gallery pour l'indexer avec ses métadonnées.
  const eventId = getOrCreateEventId({ photosDir: PHOTOS_DIR });
  const { id, captureId, variant, mime, sourceOriginalId, filterId, accessoryId, frameId, createdAt } = req.body || {};
  if (!id || !/^[\w.\-]+$/.test(String(id))) return res.status(400).json({ error: "id invalide" });
  const file = safePhotoPath(id);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  addToEventGallery({ photosDir: PHOTOS_DIR }, {
    id: path.basename(file), eventId, captureId, variant, mime,
    sourceOriginalId, filterId, accessoryId, frameId, createdAt,
  });
  res.status(201).json({ ok: true, eventId, id: path.basename(file) });
});

app.delete("/api/event-gallery/:id", (req, res) => {
  // Dé-tracker d'un fichier de la galerie événementielle (sans toucher au fichier lui-même)
  const safe = path.basename(String(req.params.id || ""));
  if (!safe || !/^[\w.\-]+$/.test(safe)) return res.status(400).json({ error: "id invalide" });
  removeFromEventGallery({ photosDir: PHOTOS_DIR }, safe);
  res.json({ ok: true });
});

/* ---- Sessions invitées privées, temporaires et sans authentification de compte ----
   ⚠️ Sur un hébergement serverless (Modal), le conteneur peut scale-to-zero :
   les sessions invitées sont persistées dans PHOTOS_DIR (volume persistant) pour
   que les liens QR restent valides après un redémarrage à froid. */
const guestSessions = new Map();
const GUEST_TTL_MS = 8 * 60 * 60 * 1000;
const GUEST_MAX_FRAME_AGE_MS = 8_000;
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
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data));
    } catch (error) {
      console.error("[MomentoBooth] sauvegarde des sessions :", error);
    }
  }, 400);
}

function loadGuestSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    const now = Date.now();
    for (const [token, raw] of Object.entries(data)) {
      if (!raw || raw.expiresAt <= now) continue;
      guestSessions.set(token, {
        token,
        hostKey: String(raw.hostKey || ""),
        createdAt: raw.createdAt || now,
        expiresAt: raw.expiresAt,
        photoIds: new Set(Array.isArray(raw.photoIds) ? raw.photoIds.filter((id) => fs.existsSync(path.join(PHOTOS_DIR, id))) : []),
        live: null,
        lastFrameAt: 0,
      });
    }
  } catch (error) {
    console.error("[MomentoBooth] chargement des sessions :", error);
  }
}
loadGuestSessions();

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function getGuestSession(token) {
  if (!GUEST_TOKEN_RE.test(token)) return null;
  const session = guestSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    guestSessions.delete(token);
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

app.post("/api/guest/sessions", (req, res) => {
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
  res.set({ "Cache-Control": "no-store", "Content-Type": session.live.type });
  res.send(session.live.buffer);
});

app.post("/api/guest/:token/live", liveUpload.single("frame"), (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  if (!req.file) return res.status(400).json({ error: "Image de prévisualisation requise" });
  const now = Date.now();
  if (now - session.lastFrameAt < 900) return res.status(429).json({ error: "Cadence trop élevée" });
  session.live = { buffer: req.file.buffer, type: req.file.mimetype };
  session.lastFrameAt = now;
  res.status(204).end();
});

app.delete("/api/guest/:token/live", (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  session.live = null;
  session.lastFrameAt = 0;
  res.status(204).end();
});

/* ---- Export ZIP d'un événement (protégé par hostKey) ----
   Toutes les photos ajoutées à l'événement (upload avec x-guest-host-key) +
   un manifest JSON (token, hostKey hash, dates, nb de photos) + un lisez-moi. */
app.get("/api/guest/:token/export.zip", (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  const entries = {};
  const files = [...session.photoIds].filter((id) => fs.existsSync(path.join(PHOTOS_DIR, id))).sort();
  for (const id of files) {
    try {
      entries[`photos/${id}`] = fs.readFileSync(path.join(PHOTOS_DIR, id));
    } catch (error) {
      console.error("[MomentoBooth] export zip, lecture photo", id, error);
    }
  }
  const hostKeyHash = crypto.createHash("sha256").update(session.hostKey).digest("hex");
  const manifest = {
    event: "MomentoBooth",
    token: session.token,
    hostKeySha256: hostKeyHash,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    photoCount: files.length,
    exportedAt: new Date().toISOString(),
  };
  entries["momentobooth/manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  entries["momentobooth/lisez-moi.txt"] = strToU8(
    `Photos de l'événement MomentoBooth\n` +
      `Créé le : ${new Date(session.createdAt).toLocaleString("fr-FR")}\n` +
      `Expiré le : ${new Date(session.expiresAt).toLocaleString("fr-FR")}\n` +
      `Photos : ${files.length}\n` +
      `\nVoir manifest.json pour les métadonnées (empreinte de la clé hôte, dates).\n`
  );
  try {
    const zipped = zipSync(entries, { level: 6 });
    const filename = `momentobooth-event-${session.token.slice(0, 8)}-${new Date(session.createdAt).toISOString().slice(0, 10)}.zip`;
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    res.send(Buffer.from(zipped));
  } catch (error) {
    console.error("[MomentoBooth] /api/guest/:token/export.zip", error);
    res.status(500).json({ error: "Création ZIP impossible" });
  }
});

/* ---- Dry-run : teste qu'un event est joignable, qu'il y a de la place, et que le serveur répond.
   Utilisable SANS hostKey (par l'hôte pour un pré-flight depuis son téléphone,
   avant l'événement). Renvoie l'état + les capacités + le TTL. */
app.get("/api/guest/:token/health", (req, res) => {
  const session = getGuestSession(req.params.token);
  if (!session) return res.status(404).json({ ok: false, error: "Lien invité expiré ou introuvable" });
  const remaining = Math.max(0, session.expiresAt - Date.now());
  const photoCount = [...session.photoIds].filter((id) => fs.existsSync(path.join(PHOTOS_DIR, id))).length;
  res.json({
    ok: true,
    token: session.token,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    remainingMs: remaining,
    remainingHuman: humanDuration(remaining),
    photoCount,
    liveActive: Boolean(session.live && Date.now() - session.lastFrameAt <= GUEST_MAX_FRAME_AGE_MS),
    server: { uptimeSec: Math.round(process.uptime()), nodeVersion: process.version },
  });
});
function humanDuration(ms) {
  if (ms <= 0) return "expiré";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${Math.floor(ms / 1000)} s`;
}

app.delete("/api/guest/:token", (req, res) => {
  const session = requireGuestHost(req, res);
  if (!session) return;
  guestSessions.delete(req.params.token);
  saveGuestSessions();
  res.json({ ok: true });
});

/* Nettoyage des liens et images de live en mémoire. */
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of guestSessions) {
    if (session.expiresAt <= now) { guestSessions.delete(token); changed = true; }
    else if (session.live && now - session.lastFrameAt > GUEST_MAX_FRAME_AGE_MS) session.live = null;
  }
  if (changed) saveGuestSessions();
}, 15 * 60 * 1000).unref();

/* =========================================================
   CAMÉRA DÉPORTÉE — un iPhone sert de caméra, une tablette
   d'interface de contrôle (vrai photomaton).
   ========================================================= */
const REMOTE_CAM_TTL_MS = 24 * 60 * 60 * 1000;
const REMOTE_CAM_MAX_FRAME_AGE_MS = 12_000;
const remoteCamSessions = new Map();

function getRemoteCamSession(token) {
  const s = remoteCamSessions.get(token);
  if (!s || Date.now() > s.expiresAt) { remoteCamSessions.delete(token); return null; }
  return s;
}

/* POST /api/remote-camera/sessions — crée un lien caméra déportée */
app.post("/api/remote-camera/sessions", (req, res) => {
  const token = randomToken(24);
  const hostKey = randomToken(32);
  remoteCamSessions.set(token, {
    token,
    hostKey,
    createdAt: Date.now(),
    expiresAt: Date.now() + REMOTE_CAM_TTL_MS,
    frame: null,
    lastFrameAt: 0,
  });
  res.status(201).json({
    token,
    hostKey,
    expiresAt: Date.now() + REMOTE_CAM_TTL_MS,
    url: `${publicBase(req)}/?remote=${encodeURIComponent(token)}`,
  });
});

/* POST /api/remote-camera/:token/frame — l'iPhone envoie une frame (JPEG) */
const remoteFrameUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8_000_000 } });
app.post("/api/remote-camera/:token/frame", remoteFrameUpload.single("frame"), (req, res) => {
  const session = remoteCamSessions.get(req.params.token);
  if (!session || Date.now() > session.expiresAt) return res.status(404).json({ error: "Session introuvable" });
  const hostKey = String(req.headers["x-host-key"] || "");
  if (hostKey !== session.hostKey) return res.status(403).json({ error: "Clé hôte invalide" });
  if (!req.file) return res.status(400).json({ error: "Frame JPEG requise" });
  session.frame = { buffer: req.file.buffer, type: req.file.mimetype };
  session.lastFrameAt = Date.now();
  res.status(204).end();
});

/* GET /api/remote-camera/:token/frame — la tablette récupère la dernière frame */
app.get("/api/remote-camera/:token/frame", (req, res) => {
  const session = getRemoteCamSession(req.params.token);
  if (!session) return res.status(404).json({ error: "Session introuvable" });
  if (!session.frame || Date.now() - session.lastFrameAt > REMOTE_CAM_MAX_FRAME_AGE_MS) {
    return res.status(204).end();
  }
  res.set({ "Cache-Control": "no-store", "Content-Type": session.frame.type });
  res.send(session.frame.buffer);
});

/* GET /api/remote-camera/active — retourne la session caméra active la plus récente
   (utilisé par l'auto-découverte du mode Interface pour trouver l'iPhone sur le réseau) */
app.get("/api/remote-camera/active", (req, res) => {
  let best = null;
  for (const [token, session] of remoteCamSessions) {
    if (session.expiresAt <= Date.now()) continue;
    if (!best || session.createdAt > best.createdAt) best = { token, createdAt: session.createdAt, lastFrameAt: session.lastFrameAt };
  }
  if (!best) return res.status(404).json({ error: "Aucune caméra active" });
  res.json({ token: best.token, createdAt: best.createdAt, lastFrameAt: best.lastFrameAt });
});

/* Nettoyage des sessions caméra déportée expirées */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of remoteCamSessions) {
    if (session.expiresAt <= now) remoteCamSessions.delete(token);
    else if (session.frame && now - session.lastFrameAt > REMOTE_CAM_MAX_FRAME_AGE_MS) session.frame = null;
  }
}, 10 * 60 * 1000).unref?.();

/* ---- QR codes ---- */
app.get("/api/photos/:id/qr", async (req, res) => {
  const base = publicBase(req);
  const url = `${base}/api/photos/${req.params.id}`;
  const qr = await QRCode.toBuffer(url, { width: 600, margin: 2, color: { dark: "#0a0a14", light: "#ffffff" } });
  res.type("png").send(qr);
});

app.get("/api/qr", async (req, res) => {
  const url = req.query.url || `${publicBase(req)}/`;
  const qr = await QRCode.toBuffer(String(url), { width: 600, margin: 2 });
  res.type("png").send(qr);
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
app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

/* ---- Lancement ---- */
const PORT = process.env.PORT || 8787;

/* Bootstrap organizer : initialise la corbeille, l'eventId permanent et
   configure un PIN par défaut en mode démo si demandé. Idempotent. */
setupOrganizer({ photosDir: PHOTOS_DIR });
if (process.env.MOMENTOBOOTH_ORGANIZER_PIN && !isOrganizerPinConfigured({ photosDir: PHOTOS_DIR })) {
  setOrganizerPin({ photosDir: PHOTOS_DIR }, process.env.MOMENTOBOOTH_ORGANIZER_PIN);
  console.log("[MomentoBooth] PIN organisateur initialisé depuis l'env");
}
const initialPurged = cleanupExpiredTrash({ photosDir: PHOTOS_DIR });
if (initialPurged) console.log(`[MomentoBooth] corbeille nettoyée : ${initialPurged} élément(s) expiré(s)`);
setInterval(() => {
  const n = cleanupExpiredTrash({ photosDir: PHOTOS_DIR });
  if (n) console.log(`[MomentoBooth] corbeille nettoyée : ${n} élément(s) expiré(s)`);
}, 6 * 60 * 60 * 1000).unref?.();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[MomentoBooth] http://0.0.0.0:${PORT} — photos: ${PHOTOS_DIR}`);
  console.log(`[MomentoBooth] eventId: ${getOrCreateEventId({ photosDir: PHOTOS_DIR })}`);
});
