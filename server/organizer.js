/* =========================================================
   MomentoBooth — organizer.js (PIN, corbeille, eventId permanent)

   Module pur Node (CommonJS en export, importé comme ES module par server.js).
   - Stockage : PHOTOS_DIR/.organizer.json (PIN hashé + eventId + meta)
                 PHOTOS_DIR/.trash/ (photos déplacées)
                 PHOTOS_DIR/.trash/meta.json (métadonnées récupérables)
   - API exposée :
       isOrganizerPinConfigured()
       configureOrganizerPin(plain)         // boot/setup uniquement
       verifyOrganizerPin(plain)            // constant-time
       isOrganizerAuthorized(req)
       getOrCreateEventId()                 // permanent, lié à l'installation
       moveToTrash(filename, who)           // déplace vers .trash/
       listTrash()
       restoreFromTrash(filename)
       purgeFromTrash(filename)
       listEventGallery()
       addToEventGallery(filename, meta)
       cleanupExpiredTrash(maxAgeMs = 30j)
   - Pas d'effet de bord global sur le serveur : le module exporte des
     fonctions pures que server.js appelle aux points d'extension existants.
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* ---------- Tunables ---------- */
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const ORGANIZER_SESSION_MS = 4 * 60 * 60 * 1000;     // 4 h
const ORGANIZER_COOLDOWN_MS = 5 * 60 * 1000;          // 5 min de blocage
const ORGANIZER_FAIL_LIMIT = 5;
const ORGANIZER_TOKEN_HEADER = "x-organizer-token";
const ORGANIZER_PIN_HEADER = "x-organizer-pin"; // tolérance, on préfère le token

/* ---------- Constantes de fichiers ---------- */
export const TRASH_DIR_NAME = ".trash";
export const TRASH_META_FILE = "meta.json";
export const ORGANIZER_FILE = ".organizer.json";
export const EVENT_GALLERY_FILE = ".event-gallery.json";

/* ---------- Helpers ---------- */
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function safeFilename(name) {
  const safe = path.basename(String(name || ""));
  if (!safe || !/^[\w.\-]+$/.test(safe)) return null;
  return safe;
}
function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ---------- Setup ---------- */
export function setupOrganizer({ photosDir }) {
  const trashDir = path.join(photosDir, TRASH_DIR_NAME);
  fs.mkdirSync(trashDir, { recursive: true });
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const evtFile = path.join(photosDir, EVENT_GALLERY_FILE);
  const state = readJson(orgFile, null);
  if (!state || !state.eventId) {
    const seed = `${Date.now()}-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
    const eventId = sha256Hex(seed).slice(0, 24); // 24 chars, lisible, partageable
    const next = {
      eventId,
      pinHash: state?.pinHash || null, // conserve un PIN éventuellement déjà défini
      createdAt: Date.now(),
      // sessions en mémoire (token -> { exp, ip })
      sessions: {},
      // rate-limit par IP pour les essais PIN
      attempts: {},
    };
    writeJsonAtomic(orgFile, next);
    if (!fs.existsSync(evtFile)) writeJsonAtomic(evtFile, { eventId, photos: {} });
  }
}

/* ---------- PIN organisateur ---------- */
export function isOrganizerPinConfigured({ photosDir }) {
  const s = readJson(path.join(photosDir, ORGANIZER_FILE), null);
  return Boolean(s && s.pinHash);
}

/* À n'appeler qu'au boot / par un setup script, JAMAIS via route publique. */
export function setOrganizerPin({ photosDir }, plain) {
  if (typeof plain !== "string" || plain.length < 4 || plain.length > 64) {
    throw new Error("PIN invalide (4-64 caractères)");
  }
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s) throw new Error("Organizer non initialisé — appelez setupOrganizer() d'abord");
  s.pinHash = sha256Hex(plain);
  writeJsonAtomic(orgFile, s);
  return true;
}

export function verifyOrganizerPin({ photosDir }, plain) {
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s || !s.pinHash) return { ok: false, reason: "no-pin" };
  if (typeof plain !== "string") return { ok: false, reason: "bad-format" };
  if (timingSafeEqual(sha256Hex(plain), s.pinHash)) return { ok: true };
  return { ok: false, reason: "mismatch" };
}

/* Crée une session organisateur (token) après vérification du PIN.
   Bloqué après ORGANIZER_FAIL_LIMIT échecs par IP pendant ORGANIZER_COOLDOWN_MS. */
export function createOrganizerSession({ photosDir }, { ip, plain }) {
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s) return { ok: false, reason: "no-organizer" };
  // Cooldown ?
  const now = Date.now();
  const rec = s.attempts?.[ip] || { count: 0, lockUntil: 0 };
  if (rec.lockUntil && rec.lockUntil > now) {
    return { ok: false, reason: "locked", retryAfterMs: rec.lockUntil - now };
  }
  // Vérif PIN (constant-time)
  const v = verifyOrganizerPin({ photosDir }, plain);
  if (!v.ok) {
    rec.count = (rec.count || 0) + 1;
    if (rec.count >= ORGANIZER_FAIL_LIMIT) {
      rec.lockUntil = now + ORGANIZER_COOLDOWN_MS;
      rec.count = 0;
    }
    s.attempts = s.attempts || {};
    s.attempts[ip] = rec;
    writeJsonAtomic(orgFile, s);
    return { ok: false, reason: rec.lockUntil ? "locked" : "mismatch", retryAfterMs: rec.lockUntil ? rec.lockUntil - now : 0 };
  }
  // OK → reset compteur + nouvelle session
  s.attempts = s.attempts || {};
  s.attempts[ip] = { count: 0, lockUntil: 0 };
  const token = crypto.randomBytes(24).toString("base64url");
  s.sessions = s.sessions || {};
  s.sessions[token] = { ip, exp: now + ORGANIZER_SESSION_MS, createdAt: now };
  // Purge des sessions expirées
  for (const [t, sess] of Object.entries(s.sessions)) {
    if (sess.exp <= now) delete s.sessions[t];
  }
  writeJsonAtomic(orgFile, s);
  return { ok: true, token, expiresInMs: ORGANIZER_SESSION_MS };
}

export function isOrganizerAuthorized({ photosDir }, req) {
  const token = String(req.get(ORGANIZER_TOKEN_HEADER) || req.get(ORGANIZER_PIN_HEADER) || "");
  if (!token) return false;
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s || !s.sessions) return false;
  const sess = s.sessions[token];
  if (!sess) return false;
  if (sess.exp <= Date.now()) return false;
  return true;
}

export function revokeOrganizerSession({ photosDir }, token) {
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s || !s.sessions) return false;
  const had = Boolean(s.sessions[token]);
  delete s.sessions[token];
  writeJsonAtomic(orgFile, s);
  return had;
}

/* ---------- eventId permanent (galerie événementielle) ---------- */
export function getOrCreateEventId({ photosDir }) {
  const orgFile = path.join(photosDir, ORGANIZER_FILE);
  const s = readJson(orgFile, null);
  if (!s || !s.eventId) {
    setupOrganizer({ photosDir });
    return getOrCreateEventId({ photosDir });
  }
  return s.eventId;
}

export function listEventGallery({ photosDir }) {
  const evtFile = path.join(photosDir, EVENT_GALLERY_FILE);
  const data = readJson(evtFile, { photos: {} });
  return Object.values(data.photos || {})
    .filter((p) => p && p.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function addToEventGallery({ photosDir }, { id, eventId, captureId, variant, mime, createdAt, sourceOriginalId, filterId, accessoryId, frameId }) {
  if (!id || !eventId) return;
  const evtFile = path.join(photosDir, EVENT_GALLERY_FILE);
  const data = readJson(evtFile, { eventId, photos: {} });
  data.photos = data.photos || {};
  data.photos[id] = {
    id,
    eventId,
    captureId: captureId || id,
    variant: variant || "original",
    mime: mime || "image/jpeg",
    createdAt: createdAt || Date.now(),
    sourceOriginalId: sourceOriginalId || null,
    filterId: filterId || null,
    accessoryId: accessoryId || null,
    frameId: frameId || null,
  };
  writeJsonAtomic(evtFile, data);
}

export function removeFromEventGallery({ photosDir }, id) {
  const evtFile = path.join(photosDir, EVENT_GALLERY_FILE);
  const data = readJson(evtFile, { photos: {} });
  if (data.photos && data.photos[id]) {
    delete data.photos[id];
    writeJsonAtomic(evtFile, data);
  }
}

/* ---------- Corbeille ---------- */
function loadTrashMeta({ photosDir }) {
  const metaFile = path.join(photosDir, TRASH_DIR_NAME, TRASH_META_FILE);
  return readJson(metaFile, {});
}
function saveTrashMeta({ photosDir }, meta) {
  const metaFile = path.join(photosDir, TRASH_DIR_NAME, TRASH_META_FILE);
  writeJsonAtomic(metaFile, meta || {});
}

export function moveToTrash({ photosDir }, filename, who = "host") {
  const safe = safeFilename(filename);
  if (!safe) return { ok: false, reason: "bad-filename" };
  const src = path.join(photosDir, safe);
  if (!fs.existsSync(src)) return { ok: false, reason: "missing" };
  const dest = path.join(photosDir, TRASH_DIR_NAME, safe);
  if (fs.existsSync(dest)) {
    // collision : suffixe aléatoire
    const suffixed = safe.replace(/(\.[^.]+)?$/, `-${crypto.randomBytes(2).toString("hex")}$1`);
    return moveToTrashInner(photosDir, src, path.join(photosDir, TRASH_DIR_NAME, suffixed), safe, suffixed, who);
  }
  return moveToTrashInner(photosDir, src, dest, safe, safe, who);
}

function moveToTrashInner(photosDir, src, dest, originalName, storedName, who) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    // cross-device : fallback copy + unlink
    try {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } catch (err2) {
      return { ok: false, reason: "move-failed", error: String(err2) };
    }
  }
  const meta = loadTrashMeta({ photosDir });
  meta[storedName] = {
    originalName,
    deletedAt: Date.now(),
    deletedBy: who,
    restoreUntil: Date.now() + TRASH_RETENTION_MS,
  };
  saveTrashMeta({ photosDir }, meta);
  // Côté galerie événementielle : on NE supprime pas, on flag trash
  return { ok: true, id: storedName, restoreUntil: meta[storedName].restoreUntil };
}

export function listTrash({ photosDir }) {
  const meta = loadTrashMeta({ photosDir });
  return Object.entries(meta)
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}

export function restoreFromTrash({ photosDir }, filename) {
  const safe = safeFilename(filename);
  if (!safe) return { ok: false, reason: "bad-filename" };
  const src = path.join(photosDir, TRASH_DIR_NAME, safe);
  if (!fs.existsSync(src)) return { ok: false, reason: "missing" };
  const dest = path.join(photosDir, safe);
  if (fs.existsSync(dest)) return { ok: false, reason: "collision" };
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    return { ok: false, reason: "restore-failed", error: String(err) };
  }
  const meta = loadTrashMeta({ photosDir });
  if (meta[safe]) {
    delete meta[safe];
    saveTrashMeta({ photosDir }, meta);
  }
  return { ok: true, id: safe };
}

export function purgeFromTrash({ photosDir }, filename) {
  const safe = safeFilename(filename);
  if (!safe) return { ok: false, reason: "bad-filename" };
  const file = path.join(photosDir, TRASH_DIR_NAME, safe);
  if (fs.existsSync(file)) {
    try { fs.unlinkSync(file); } catch { /* best effort */ }
  }
  const meta = loadTrashMeta({ photosDir });
  if (meta[safe]) {
    delete meta[safe];
    saveTrashMeta({ photosDir }, meta);
  }
  return { ok: true };
}

export function cleanupExpiredTrash({ photosDir }, maxAgeMs = TRASH_RETENTION_MS) {
  const meta = loadTrashMeta({ photosDir });
  const now = Date.now();
  let purged = 0;
  for (const [id, info] of Object.entries(meta)) {
    const expireAt = info.restoreUntil || (info.deletedAt + maxAgeMs);
    if (expireAt <= now) {
      const file = path.join(photosDir, TRASH_DIR_NAME, id);
      if (fs.existsSync(file)) { try { fs.unlinkSync(file); } catch {} }
      delete meta[id];
      purged += 1;
    }
  }
  if (purged) saveTrashMeta({ photosDir }, meta);
  return purged;
}
