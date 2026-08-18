/* Test smoke P0 : corbeille + PIN organisateur + eventId permanent.
   Lance en subprocess pour ne pas polluer la session du dev. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";

const TMP_PHOTOS = fs.mkdtempSync(path.join(os.tmpdir(), "mbtest-"));
const PORT = 18790;
process.env.PORT = String(PORT);
process.env.MOMENTOBOOTH_ORGANIZER_PIN = "4242";

const child = spawn("node", ["server/server.js"], {
  cwd: "/home/l-vs/Projets/momentobooth-pwa",
  env: { ...process.env, PHOTOS_DIR: TMP_PHOTOS },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (b) => process.stdout.write(`[srv] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[srv-err] ${b}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let data = null;
    if (body && Buffer.isBuffer(body)) data = body;
    else if (typeof body === "string") data = Buffer.from(body);
    const r = http.request({ host: "127.0.0.1", port: PORT, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString("utf8") });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function multipart(filename, jpegBytes) {
  const boundary = "----mb" + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="photo"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, jpegBytes, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

const tinyJpeg = Buffer.from(
  // JPEG 1x1 blanc (98 octets, hardcodé pour éviter la dépendance)
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB" +
  "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEB" +
  "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIA" +
  "AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAA" +
  "AAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z",
  "base64"
);

const tests = [];
function t(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAIL: " + (msg || "?")); }

t("GET /api/organizer/status renvoie eventId + pinConfigured", async () => {
  const r = await req("GET", "/api/organizer/status");
  assert(r.status === 200, "status 200 attendu, vu " + r.status);
  const j = JSON.parse(r.text);
  assert(j.pinConfigured === true, "pinConfigured doit être true");
  assert(typeof j.eventId === "string" && j.eventId.length === 24, "eventId 24 chars");
});

t("POST /api/organizer/verify mauvais PIN → 401", async () => {
  const r = await req("POST", "/api/organizer/verify", JSON.stringify({ pin: "9999" }), { "content-type": "application/json" });
  assert(r.status === 401, "status 401 attendu, vu " + r.status);
});

t("POST /api/organizer/verify bon PIN → token", async () => {
  const r = await req("POST", "/api/organizer/verify", JSON.stringify({ pin: "4242" }), { "content-type": "application/json" });
  assert(r.status === 200, "status 200 attendu, vu " + r.status + " body=" + r.text);
  const j = JSON.parse(r.text);
  assert(typeof j.token === "string" && j.token.length > 16, "token présent");
  globalThis.organizerToken = j.token;
});

t("POST /api/photos upload", async () => {
  const m = multipart("test-original.jpg", tinyJpeg);
  const r = await req("POST", "/api/photos", m.body, { "content-type": m.contentType });
  assert(r.status === 201, "status 201 attendu, vu " + r.status + " body=" + r.text);
  const j = JSON.parse(r.text);
  assert(/^[\w.\-]+\.jpg$/.test(j.id), "id .jpg : " + j.id);
  globalThis.uploadedId = j.id;
});

t("POST /api/event-gallery enregistre la photo", async () => {
  const r = await req("POST", "/api/event-gallery", JSON.stringify({
    id: globalThis.uploadedId,
    captureId: "cap-001",
    variant: "original",
    mime: "image/jpeg",
  }), { "content-type": "application/json" });
  assert(r.status === 201, "status 201, vu " + r.status + " body=" + r.text);
});

t("GET /api/event-gallery retourne la photo", async () => {
  const r = await req("GET", "/api/event-gallery");
  assert(r.status === 200, "status 200");
  const j = JSON.parse(r.text);
  assert(j.count >= 1, "count >= 1, vu " + j.count);
  assert(j.photos.some((p) => p.id === globalThis.uploadedId), "notre photo présente");
});

t("DELETE /api/photos/:id → corbeille (sans organizer)", async () => {
  const r = await req("DELETE", "/api/photos/" + globalThis.uploadedId);
  assert(r.status === 200, "status 200, vu " + r.status);
  const j = JSON.parse(r.text);
  assert(j.trashed === true, "trashed=true");
  assert(typeof j.restoreUntil === "number", "restoreUntil présent");
});

t("GET /api/photos/trash SANS token → 401", async () => {
  const r = await req("GET", "/api/photos/trash");
  assert(r.status === 401, "status 401, vu " + r.status);
});

t("GET /api/photos/trash AVEC token → notre photo", async () => {
  const r = await req("GET", "/api/photos/trash", null, { "x-organizer-token": globalThis.organizerToken });
  assert(r.status === 200, "status 200, vu " + r.status);
  const j = JSON.parse(r.text);
  assert(j.items.length >= 1, "items >= 1, vu " + j.items.length);
  const our = j.items.find((it) => it.originalName === globalThis.uploadedId);
  assert(our, "notre photo dans la corbeille");
  globalThis.trashId = our.id;
  assert(our.deletedBy === "self", "deletedBy=self quand pas d'auth organizer");
});

t("POST /api/photos/trash/:id/restore → ok", async () => {
  const r = await req("POST", "/api/photos/trash/" + globalThis.trashId + "/restore", null, { "x-organizer-token": globalThis.organizerToken });
  assert(r.status === 200, "status 200, vu " + r.status);
});

t("DELETE /api/photos/:id → corbeille (AVEC organizer) deletedBy=organizer", async () => {
  const r = await req("DELETE", "/api/photos/" + globalThis.uploadedId, null, { "x-organizer-token": globalThis.organizerToken });
  assert(r.status === 200, "status 200, vu " + r.status);
});

t("GET /api/photos/trash → deletedBy=organizer", async () => {
  const r = await req("GET", "/api/photos/trash", null, { "x-organizer-token": globalThis.organizerToken });
  const j = JSON.parse(r.text);
  const our = j.items.find((it) => it.originalName === globalThis.uploadedId);
  assert(our && our.deletedBy === "organizer", "deletedBy=organizer");
});

t("DELETE /api/photos/trash/:id → purge définitive", async () => {
  const r = await req("DELETE", "/api/photos/trash/" + globalThis.trashId, null, { "x-organizer-token": globalThis.organizerToken });
  assert(r.status === 200, "status 200");
  // Vérifier que la corbeille est maintenant vide pour cet id
  const r2 = await req("GET", "/api/photos/trash", null, { "x-organizer-token": globalThis.organizerToken });
  const j2 = JSON.parse(r2.text);
  assert(!j2.items.some((it) => it.id === globalThis.trashId), "trashId absent après purge");
});

t("Brute-force protection : 5 mauvais PIN → lockout", async () => {
  for (let i = 0; i < 5; i++) {
    await req("POST", "/api/organizer/verify", JSON.stringify({ pin: "wrong" }), { "content-type": "application/json" });
  }
  const r = await req("POST", "/api/organizer/verify", JSON.stringify({ pin: "4242" }), { "content-type": "application/json" });
  assert(r.status === 429, "lockout attendu, vu " + r.status);
});

(async () => {
  // attendre que le serveur écoute
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    await wait(200);
    try {
      const r = await req("GET", "/api/organizer/status");
      ready = r.status === 200;
    } catch {}
  }
  if (!ready) {
    console.error("SERVEUR NON PRÊT");
    child.kill();
    process.exit(1);
  }
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      fail += 1;
      console.log(`  ✗ ${name} — ${e.message}`);
    }
  }
  console.log(`\n=== ${pass}/${tests.length} OK, ${fail} FAIL ===`);
  child.kill();
  // Cleanup tmp dir
  try { fs.rmSync(TMP_PHOTOS, { recursive: true, force: true }); } catch {}
  process.exit(fail > 0 ? 1 : 0);
})();
