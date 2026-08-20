import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { io as ioc } from "socket.io-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = 18_700 + Math.floor(Math.random() * 800);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;
let testSession;
let remoteSession;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/process/ping`);
      if (response.ok) return;
    } catch {
      // Le serveur peut encore être en cours de démarrage.
    }
    await wait(100);
  }
  throw new Error("Le serveur de test n’a pas démarré");
}

function jpegFixture() {
  const data = new Uint8Array([
    255, 64, 64, 255,
    64, 255, 64, 255,
    64, 64, 255, 255,
    255, 255, 255, 255,
  ]);
  return jpeg.encode({ data, width: 2, height: 2 }, 82).data;
}

function imageForm(field, bytes, type, filename) {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), filename);
  return form;
}

before(async () => {
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), PUBLIC_BASE_URL: baseUrl, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

after(async () => {
  // Même en cas d’échec au milieu du scénario, ne pas laisser une photo ou
  // une session de test dans le volume partagé.
  if (testSession) {
    try {
      await fetch(`${baseUrl}/api/guest/${testSession.token}`, {
        method: "DELETE",
        headers: { "x-guest-host-key": testSession.hostKey },
      });
    } catch {
      // Le processus peut déjà être arrêté après une erreur de démarrage.
    }
  }
  if (remoteSession) {
    try {
      await fetch(`${baseUrl}/api/remote-camera/${remoteSession.token}`, {
        method: "DELETE",
        headers: { "x-host-key": remoteSession.hostKey },
      });
    } catch {
      // Le processus peut déjà être arrêté après une erreur de démarrage.
    }
  }
  await wait(500);
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill("SIGTERM");
  await Promise.race([onceExit(serverProcess), wait(1_000)]);
});

function onceExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

test("supprime les photos liées lors de la suppression explicite d’une session invitée", async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/guest/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  testSession = session;

  const uploadResponse = await fetch(`${baseUrl}/api/photos`, {
    method: "POST",
    headers: {
      "x-guest-token": session.token,
      "x-guest-host-key": session.hostKey,
    },
    body: imageForm("photo", jpegFixture(), "image/jpeg", "fixture.jpg"),
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();

  const beforeDelete = await fetch(`${baseUrl}/api/photos/${uploaded.id}`);
  assert.equal(beforeDelete.status, 200);

  const deleteSessionResponse = await fetch(`${baseUrl}/api/guest/${session.token}`, {
    method: "DELETE",
    headers: { "x-guest-host-key": session.hostKey },
  });
  assert.equal(deleteSessionResponse.status, 200);

  const afterDelete = await fetch(`${baseUrl}/api/photos/${uploaded.id}`);
  assert.equal(afterDelete.status, 404);
});

test("refuse les MIME non image avant traitement mémoire", async () => {
  const form = new FormData();
  form.append("frames", new Blob(["not an image"], { type: "application/octet-stream" }), "payload.bin");
  const response = await fetch(`${baseUrl}/api/process/gif`, { method: "POST", body: form });
  assert.equal(response.status, 400);
});

test("refuse une frame distante dont les marqueurs JPEG sont falsifiés", async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/remote-camera/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  remoteSession = await sessionResponse.json();

  const response = await fetch(`${baseUrl}/api/remote-camera/${remoteSession.token}/frame`, {
    method: "POST",
    headers: { "x-host-key": remoteSession.hostKey },
    body: imageForm("frame", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg", "fake.jpg"),
  });
  assert.equal(response.status, 400);
});

test("retire immédiatement une caméra de la découverte après un pairage par code", async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/remote-camera/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  remoteSession = session;

  const announceResponse = await fetch(`${baseUrl}/api/device-discovery/announce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "camera", name: "Caméra code", token: session.token, hostKey: session.hostKey }),
  });
  assert.equal(announceResponse.status, 200);
  const announcement = await announceResponse.json();
  assert.ok(announcement.id);

  const pairResponse = await fetch(`${baseUrl}/api/remote-camera/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: session.pairCode }),
  });
  assert.equal(pairResponse.status, 200);

  const camerasResponse = await fetch(`${baseUrl}/api/device-discovery/cameras`);
  assert.equal(camerasResponse.status, 200);
  const cameras = await camerasResponse.json();
  assert.equal(cameras.cameras.some((camera) => camera.id === announcement.id), false);

  const deleteResponse = await fetch(`${baseUrl}/api/remote-camera/${session.token}`, {
    method: "DELETE",
    headers: { "x-host-key": session.hostKey },
  });
  assert.equal(deleteResponse.status, 204);
  remoteSession = null;
});

test("effectue un pairage par découverte, refuse les doublons et livre le jeton après acceptation", async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/remote-camera/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  remoteSession = session;

  const announceResponse = await fetch(`${baseUrl}/api/device-discovery/announce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "camera", name: "Caméra découverte", token: session.token, hostKey: session.hostKey }),
  });
  const announcement = await announceResponse.json();
  assert.ok(announcement.id);

  const requestResponse = await fetch(`${baseUrl}/api/device-discovery/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraId: announcement.id, interfaceName: "Interface test" }),
  });
  assert.equal(requestResponse.status, 201);
  const request = await requestResponse.json();
  assert.ok(request.requestId);
  assert.ok(request.pairKey);

  const duplicateResponse = await fetch(`${baseUrl}/api/device-discovery/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraId: announcement.id, interfaceName: "Autre interface" }),
  });
  assert.equal(duplicateResponse.status, 409);

  const unauthorizedStatus = await fetch(`${baseUrl}/api/device-discovery/requests/${request.requestId}`, {
    headers: { "x-pair-key": "bad-key" },
  });
  assert.equal(unauthorizedStatus.status, 403);

  const cancelResponse = await fetch(`${baseUrl}/api/device-discovery/requests/${request.requestId}`, {
    method: "DELETE",
    headers: { "x-pair-key": request.pairKey },
  });
  assert.equal(cancelResponse.status, 204);

  const secondRequestResponse = await fetch(`${baseUrl}/api/device-discovery/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cameraId: announcement.id, interfaceName: "Interface test 2" }),
  });
  assert.equal(secondRequestResponse.status, 201);
  const secondRequest = await secondRequestResponse.json();

  const acceptResponse = await fetch(`${baseUrl}/api/remote-camera/${session.token}/pair-requests/${secondRequest.requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-host-key": session.hostKey },
    body: JSON.stringify({ accept: true }),
  });
  assert.equal(acceptResponse.status, 200);

  const statusResponse = await fetch(`${baseUrl}/api/device-discovery/requests/${secondRequest.requestId}`, {
    headers: { "x-pair-key": secondRequest.pairKey },
  });
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.status, "accepted");
  assert.ok(status.controllerToken);

  const frameResponse = await fetch(`${baseUrl}/api/remote-camera/${status.controllerToken}/frame`);
  assert.equal(frameResponse.status, 204);

  const deleteResponse = await fetch(`${baseUrl}/api/remote-camera/${session.token}`, {
    method: "DELETE",
    headers: { "x-host-key": session.hostKey },
  });
  assert.equal(deleteResponse.status, 204);
  remoteSession = null;
});

test("refuse les SVG et les contenus spoofés sur l’upload photo public", async () => {
  const svgForm = new FormData();
  svgForm.append("photo", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], { type: "image/svg+xml" }), "payload.svg");
  const svgResponse = await fetch(`${baseUrl}/api/photos`, { method: "POST", body: svgForm });
  assert.equal(svgResponse.status, 400);

  const spoofedForm = new FormData();
  spoofedForm.append("photo", new Blob(["not a jpeg"], { type: "image/jpeg" }), "payload.jpg");
  const spoofedResponse = await fetch(`${baseUrl}/api/photos`, { method: "POST", body: spoofedForm });
  assert.equal(spoofedResponse.status, 400);
});

test("met les commandes distantes en file puis exige un ACK caméra", async () => {
  const sessionResponse = await fetch(`${baseUrl}/api/remote-camera/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  remoteSession = session;

  const pairResponse = await fetch(`${baseUrl}/api/remote-camera/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: session.pairCode }),
  });
  assert.equal(pairResponse.status, 200);
  const pair = await pairResponse.json();
  assert.ok(pair.accessToken);

  const invalidCommand = await fetch(`${baseUrl}/api/remote-camera/${pair.accessToken}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "unknownCommand", value: true }),
  });
  assert.equal(invalidCommand.status, 400);

  const commandResponse = await fetch(`${baseUrl}/api/remote-camera/${pair.accessToken}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "timerSeconds", value: 10 }),
  });
  assert.equal(commandResponse.status, 202);
  const command = await commandResponse.json();
  assert.equal(command.state, "QUEUED");
  assert.ok(command.id);

  const cameraCommands = await fetch(`${baseUrl}/api/remote-camera/${session.token}/commands?after=0`, {
    headers: { "x-host-key": session.hostKey },
  });
  assert.equal(cameraCommands.status, 200);
  const queued = await cameraCommands.json();
  assert.equal(queued.commands.some((entry) => entry.id === command.id && entry.name === "timerSeconds"), true);

  const ackResponse = await fetch(`${baseUrl}/api/remote-camera/${session.token}/commands/${command.id}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-host-key": session.hostKey },
    body: "{}",
  });
  assert.equal(ackResponse.status, 200);
  const ack = await ackResponse.json();
  assert.equal(ack.id, command.id);

  const deleteResponse = await fetch(`${baseUrl}/api/remote-camera/${session.token}`, {
    method: "DELETE",
    headers: { "x-host-key": session.hostKey },
  });
  assert.equal(deleteResponse.status, 204);
  remoteSession = null;
});

test("la corbeille récupérable protège une suppression le temps d'une restauration organisateur", async () => {
  // Upload « organisateur » (sans en-têtes invité) : reçoit un jeton de suppression.
  const uploadResponse = await fetch(`${baseUrl}/api/photos`, {
    method: "POST",
    body: imageForm("photo", jpegFixture(), "image/jpeg", "trash-fixture.jpg"),
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.ok(uploaded.deleteToken);

  assert.equal((await fetch(`${baseUrl}/api/photos/${uploaded.id}`)).status, 200);

  // Session organisateur nécessaire pour tout ce qui touche à la corbeille.
  const verify = await fetch(`${baseUrl}/api/organizer/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1818" }),
  });
  const organizer = await verify.json();

  // La suppression déplace vers la corbeille au lieu d'effacer.
  const deleteResponse = await fetch(`${baseUrl}/api/photos/${uploaded.id}`, {
    method: "DELETE",
    headers: { "x-photo-delete-token": uploaded.deleteToken },
  });
  assert.equal(deleteResponse.status, 200);
  const deleteBody = await deleteResponse.json();
  assert.equal(deleteBody.trashed, true);

  // Disparaît de la galerie normale et du listing public.
  assert.equal((await fetch(`${baseUrl}/api/photos/${uploaded.id}`)).status, 404);
  const listing = await (await fetch(`${baseUrl}/api/photos`)).json();
  assert.ok(!listing.photos.some((p) => p.id === uploaded.id));

  // La corbeille elle-même exige une session organisateur.
  assert.equal((await fetch(`${baseUrl}/api/photos/trash`)).status, 403);
  const trashList = await (await fetch(`${baseUrl}/api/photos/trash`, {
    headers: { "x-organizer-token": organizer.token },
  })).json();
  assert.ok(trashList.photos.some((p) => p.id === uploaded.id));

  assert.equal((await fetch(`${baseUrl}/api/photos/${uploaded.id}/restore`, { method: "POST" })).status, 403);
  const restoreResponse = await fetch(`${baseUrl}/api/photos/${uploaded.id}/restore`, {
    method: "POST", headers: { "x-organizer-token": organizer.token },
  });
  assert.equal(restoreResponse.status, 200);

  // Restaurée : de nouveau accessible normalement, et le jeton d'origine
  // fonctionne encore pour la resupprimer si besoin.
  assert.equal((await fetch(`${baseUrl}/api/photos/${uploaded.id}`)).status, 200);

  // Nouvelle suppression puis purge définitive : cette fois, plus rien.
  await fetch(`${baseUrl}/api/photos/${uploaded.id}`, {
    method: "DELETE", headers: { "x-photo-delete-token": uploaded.deleteToken },
  });
  assert.equal((await fetch(`${baseUrl}/api/photos/${uploaded.id}/purge`, { method: "DELETE" })).status, 403);
  const purgeResponse = await fetch(`${baseUrl}/api/photos/${uploaded.id}/purge`, {
    method: "DELETE", headers: { "x-organizer-token": organizer.token },
  });
  assert.equal(purgeResponse.status, 200);
  const trashAfterPurge = await (await fetch(`${baseUrl}/api/photos/trash`, {
    headers: { "x-organizer-token": organizer.token },
  })).json();
  assert.ok(!trashAfterPurge.photos.some((p) => p.id === uploaded.id));
});

test("POST /api/photos/batch enregistre plusieurs variantes liées par captureId", async () => {
  await wait(1500); // laisse le rate-limit (40/min) souffler entre les tests burst
  // JPEG avec vraie signature (jpeg-fixture cataloguée + gif minimal)
  const form = new FormData();
  form.append("captureId", "1700000000000-abcd1234");
  form.append("eventId", "levy-26ans");
  form.append("messageInvite", "Joyeux anniv Lévy 🎉");
  form.append("original", new Blob([jpegFixture()], { type: "image/jpeg" }), "o.jpg");
  form.append("filtered", new Blob([jpegFixture()], { type: "image/jpeg" }), "f.jpg");
  const gif89a = Buffer.from("GIF89a", "ascii");
  form.append("gif_silent", new Blob([gif89a], { type: "image/gif" }), "g.gif");

  const res = await fetch(`${baseUrl}/api/photos/batch`, { method: "POST", body: form });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.captureId, "1700000000000-abcd1234");
  assert.equal(body.eventId, "levy-26ans");
  assert.ok(body.variants.original);
  assert.ok(body.variants.filtered);
  assert.ok(body.variants.gif_silent);
  assert.ok(!body.variants.gif_sound_vid);
  assert.ok(!body.variants.portrait);
});

test("GET /api/gallery liste les captures sans token invité, ordre anti-chronologique", async () => {
  await wait(1500);
  const form = new FormData();
  form.append("original", new Blob([jpegFixture()], { type: "image/jpeg" }), "gallery-probe.jpg");
  const up = await fetch(`${baseUrl}/api/photos/batch`, { method: "POST", body: form });
  assert.equal(up.status, 201);
  const created = await up.json();

  const res = await fetch(`${baseUrl}/api/gallery`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.captures));
  assert.ok(body.captures.length >= 1);
  assert.ok(body.captures.some((c) => c.captureId === created.captureId));
  assert.ok(body.captures[0].createdAt >= body.captures[body.captures.length - 1].createdAt);
});

test("GET /api/event/:eventId/captures filtre correctement par eventId", async () => {
  await wait(1500);
  const baseJpeg = jpegFixture();
  const formA = new FormData();
  formA.append("eventId", "probe-event-A");
  formA.append("original", new Blob([baseJpeg], { type: "image/jpeg" }), "a.jpg");
  await fetch(`${baseUrl}/api/photos/batch`, { method: "POST", body: formA });

  const formB = new FormData();
  formB.append("eventId", "probe-event-B");
  formB.append("original", new Blob([baseJpeg], { type: "image/jpeg" }), "b.jpg");
  await fetch(`${baseUrl}/api/photos/batch`, { method: "POST", body: formB });

  const resA = await fetch(`${baseUrl}/api/event/probe-event-A/captures`);
  assert.equal(resA.status, 200);
  const bodyA = await resA.json();
  assert.equal(bodyA.eventId, "probe-event-A");
  assert.ok(bodyA.captures.every((c) => c.eventId === "probe-event-A"));
});

test("les anciennes routes /api/photos restent compatibles (legacy)", async () => {
  const res = await fetch(`${baseUrl}/api/photos`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body && Array.isArray(body.photos));
});

test("le PIN organisateur n'est jamais accepté en clair et se verrouille après plusieurs échecs", async () => {
  // Mauvais code : refusé, aucun jeton délivré.
  const wrong = await fetch(`${baseUrl}/api/organizer/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "0000" }),
  });
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).token, undefined);

  // Bon code (repli de développement "1818" — aucun MOMENTOBOOTH_ORGANIZER_PIN
  // n'est fourni à ce processus de test) : un jeton de session est délivré.
  const right = await fetch(`${baseUrl}/api/organizer/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1818" }),
  });
  assert.equal(right.status, 200);
  const session = await right.json();
  assert.ok(session.token && session.token.length >= 20);
  assert.ok(session.expiresAt > Date.now());

  // Après plusieurs échecs, le verrouillage doit bloquer même le bon code.
  for (let i = 0; i < 5; i += 1) {
    await fetch(`${baseUrl}/api/organizer/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "erreur" }),
    });
  }
  const lockedOut = await fetch(`${baseUrl}/api/organizer/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1818" }),
  });
  assert.equal(lockedOut.status, 429);
});

/* ════════════════════════════════════════════════════════════
   Tests WebRTC — signalisation Socket.IO pour la caméra déportée
   ════════════════════════════════════════════════════════════ */
function socketConnect(auth, timeoutMs = 3000) {
  return ioc(baseUrl, { auth, transports: ["websocket"], timeout: timeoutMs, reconnection: false, forceNew: true });
}

function socketConnected(socket, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("connect_error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function socketDisconnected(socket, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket disconnect timeout")), timeoutMs);
    socket.once("disconnect", () => { clearTimeout(timer); resolve(); });
  });
}

async function createRemoteSessionForWebrtc() {
  const sessionResponse = await fetch(`${baseUrl}/api/remote-camera/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  // Jumelage pour que la session soit active et que controllerToken soit délivré.
  const pairResponse = await fetch(`${baseUrl}/api/remote-camera/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: session.pairCode }),
  });
  assert.equal(pairResponse.status, 200);
  const pair = await pairResponse.json();
  return { token: session.token, hostKey: session.hostKey, controllerToken: pair.accessToken };
}

test("Socket.IO accepte une connexion caméra avec token + hostKey valides", async () => {
  const session = await createRemoteSessionForWebrtc();
  remoteSession = { token: session.token, hostKey: session.hostKey };
  const socket = socketConnect({ token: session.token, role: "camera", key: session.hostKey });
  try {
    await socketConnected(socket);
    assert.equal(socket.connected, true);
  } finally {
    socket.disconnect();
  }
  await fetch(`${baseUrl}/api/remote-camera/${session.token}`, {
    method: "DELETE", headers: { "x-host-key": session.hostKey },
  });
  remoteSession = null;
});

test("Socket.IO déconnecte immédiatement une connexion sans token", async () => {
  const socket = socketConnect({ role: "camera", key: "anything" });
  try {
    // Doit se déconnecter (ou refuser la connexion) rapidement : pas de connect.
    // Le middleware serveur refuse avec next(err) → le client reçoit un
    // connect_error (rejet de socketConnected) ou, si la connexion s'établit
    // quand même, une déconnexion immédiate.
    await assert.rejects(socketConnected(socket, 2500), /timeout|connect_error|disconnect|auth|session|key|invalid/i);
    assert.equal(socket.connected, false);
  } finally {
    socket.disconnect();
  }
});

test("Socket.IO relaye le signaling WebRTC entre caméra et interface", async () => {
  const session = await createRemoteSessionForWebrtc();
  remoteSession = { token: session.token, hostKey: session.hostKey };
  const camSocket = socketConnect({ token: session.token, role: "camera", key: session.hostKey });
  const ifaceSocket = socketConnect({ token: session.controllerToken, role: "interface", key: session.controllerToken });
  try {
    await socketConnected(camSocket);
    await socketConnected(ifaceSocket);
    // Laisse un instant pour que les deux pairs rejoignent la room cam:<token>.
    await wait(150);
    // La caméra envoie une offer factice ; l'interface doit la recevoir.
    const offer = { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n" };
    const received = new Promise((resolve) => { ifaceSocket.once("webrtc:offer", resolve); });
    camSocket.emit("webrtc:offer", offer);
    const got = await received;
    assert.deepEqual(got, offer);
    // Vérifie aussi le relay inverse : l'interface renvoie une answer.
    const answer = { type: "answer", sdp: "v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\ns=-\r\n" };
    const gotAnswer = new Promise((resolve) => { camSocket.once("webrtc:answer", resolve); });
    ifaceSocket.emit("webrtc:answer", answer);
    assert.deepEqual(await gotAnswer, answer);
  } finally {
    camSocket.disconnect();
    ifaceSocket.disconnect();
  }
  await fetch(`${baseUrl}/api/remote-camera/${session.token}`, {
    method: "DELETE", headers: { "x-host-key": session.hostKey },
  });
  remoteSession = null;
});

