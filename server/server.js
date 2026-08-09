/* =========================================================
   MomentoBooth — Serveur Node (stockage local + API + partage)
   - Sert la PWA (public/)
   - POST /api/photos      → upload photo (multipart), stockage local
   - GET  /api/photos      → liste des photos
   - GET  /api/photos/:id  → image
   - DELETE /api/photos/:id
   - GET  /api/photos/:id/qr → QR code (URL publique de la photo)
   - GET  /api/qr?url=...  → QR générique
   ========================================================= */
import express from "express";
import multer from "multer";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PHOTOS_DIR = path.join(__dirname, "..", "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

/* URL publique de base : env PUBLIC_BASE_URL ou header x-forwarded-* (tunnel) */
function publicBase(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:8787";
  return `${proto}://${host}`;
}

const app = express();
app.use(express.json());

/* ---- Upload photos ---- */
const upload = multer({
  storage: multer.diskStorage({
    destination: PHOTOS_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /image\//.test(file.mimetype)),
});

app.post("/api/photos", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier image requis" });
  const id = req.file.filename;
  const publicUrl = `${publicBase(req)}/api/photos/${id}`;
  res.status(201).json({ id, url: publicUrl, publicUrl });
});

app.get("/api/photos", (_req, res) => {
  const files = fs.readdirSync(PHOTOS_DIR).filter((f) => f.endsWith(".jpg")).sort().reverse();
  res.json({ photos: files.map((f) => ({ id: f, url: `/api/photos/${f}` })) });
});

app.get("/api/photos/:id", (req, res) => {
  const file = path.join(PHOTOS_DIR, path.basename(req.params.id));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  res.sendFile(file);
});

app.delete("/api/photos/:id", (req, res) => {
  const file = path.join(PHOTOS_DIR, path.basename(req.params.id));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Photo introuvable" });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

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
app.use(express.static(PUBLIC_DIR, { maxAge: "1h" }));
app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

/* ---- Lancement ---- */
const PORT = process.env.PORT || 8787;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[MomentoBooth] http://0.0.0.0:${PORT} — photos: ${PHOTOS_DIR}`);
});
