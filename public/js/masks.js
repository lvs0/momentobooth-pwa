/* =========================================================
   MomentoBooth — Dessin des masques photobooth sur le visage
   Positionnement via landmarks MediaPipe (478 points)
   ========================================================= */

function faceBox(face) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of face) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function px(v, W) { return v * W; }
function py(v, H) { return v * H; }

function drawEmoji(ctx, emoji, x, y, size) {
  ctx.save();
  ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y);
  ctx.restore();
}

/* ─── Masque : couronne (La Reine) ─── */
function drawCrown(ctx, face, W, H) {
  const nose = face[1], forehead = face[10], leftEar = face[234], rightEar = face[454];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  const headW = Math.abs(px(leftEar.x, W) - px(rightEar.x, W));
  const size = Math.max(60, headW * 0.9);
  drawEmoji(ctx, "👑", cx, topY - size * 0.55, size);
}

/* ─── Masque : lunettes ─── */
function drawGlasses(ctx, face, W, H) {
  const leftEye = face[33], rightEye = face[263];
  const cx = px((leftEye.x + rightEye.x) / 2, W);
  const cy = py((leftEye.y + rightEye.y) / 2, H);
  const eyeDist = Math.abs(px(leftEye.x, W) - px(rightEye.x, W));
  const size = Math.max(50, eyeDist * 1.5);
  drawEmoji(ctx, "🕶️", cx, cy + size * 0.05, size);
}

/* ─── Masque : caca (sur la tête) ─── */
function drawPoop(ctx, face, W, H) {
  const nose = face[1], forehead = face[10];
  const cx = px((nose.x + forehead.x) / 2, W) + 30;
  const topY = py(Math.min(forehead.y, nose.y), H);
  drawEmoji(ctx, "💩", cx, topY - 70, 120);
}

/* ─── Masque : chapeau cowboy ─── */
function drawCowboy(ctx, face, W, H) {
  const nose = face[1], forehead = face[10];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  drawEmoji(ctx, "🤠", cx, topY - 60, 130);
}

/* ─── Masque : copin (cool) ─── */
function drawCopin(ctx, face, W, H) {
  const leftEye = face[33], rightEye = face[263];
  const cx = px((leftEye.x + rightEye.x) / 2, W);
  const cy = py((leftEye.y + rightEye.y) / 2, H);
  const eyeDist = Math.abs(px(leftEye.x, W) - px(rightEye.x, W));
  const size = Math.max(52, eyeDist * 1.6);
  drawEmoji(ctx, "😎", cx, cy + size * 0.05, size);
}

/* ─── Masque : copine (baiser) ─── */
function drawCopine(ctx, face, W, H) {
  const chin = face[152], nose = face[1];
  const cx = px((chin.x + nose.x) / 2, W);
  const cy = py((chin.y + nose.y) / 2, H);
  const faceH = Math.abs(py(face[10].y, H) - py(chin.y, H));
  const size = Math.max(44, faceH * 0.28);
  drawEmoji(ctx, "💋", cx + size * 0.55, cy - size * 0.6, size * 1.1);
}

/* ─── Masque : Famille Verpoort (cœurs + couronne + texte) ─── */
function drawFamily(ctx, face, W, H) {
  const nose = face[1], forehead = face[10], chin = face[152];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  // Couronne famille
  drawEmoji(ctx, "👑", cx, topY - 50, 90);
  // Deux cœurs sur les joues
  const leftCheek = face[50], rightCheek = face[280];
  drawEmoji(ctx, "❤️", px(leftCheek.x, W), py(leftCheek.y, H) - 40, 44);
  drawEmoji(ctx, "💙", px(rightCheek.x, W), py(rightCheek.y, H) - 40, 44);
  // Bandeau texte
  ctx.save();
  ctx.font = `bold ${Math.max(22, H * 0.032)}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(240,201,106,.95)";
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 8;
  ctx.fillText("FAMILLE VERPOORT", px(0.5, W), py(0.96, H));
  ctx.restore();
  void chin;
}

/* ─── Masque : moustache ─── */
function drawMustache(ctx, face, W, H) {
  const nose = face[1];
  const cx = px(nose.x, W);
  const cy = py(nose.y, H);
  const faceW = Math.abs(px(face[234].x, W) - px(face[454].x, W));
  const size = Math.max(40, faceW * 0.35);
  drawEmoji(ctx, "🧔", cx, cy + size * 0.2, size);
}

/* ─── Masque : ange (halo) ─── */
function drawHalo(ctx, face, W, H) {
  const nose = face[1], forehead = face[10];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  ctx.save();
  ctx.strokeStyle = "rgba(255,230,150,.95)";
  ctx.lineWidth = Math.max(8, H * 0.012);
  ctx.shadowColor = "rgba(255,230,150,.8)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(cx, topY - 60, 64, 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const DRAWERS = {
  crown: drawCrown,
  glasses: drawGlasses,
  poopin: drawPoop,
  cowboy: drawCowboy,
  copin: drawCopin,
  copine: drawCopine,
  family: drawFamily,
  mustache: drawMustache,
  halo: drawHalo,
};

export function drawMask(ctx, W, H, face, maskId) {
  if (!maskId || maskId === "none" || !face || face.length < 30) return;
  const drawer = DRAWERS[maskId];
  if (!drawer) return;
  ctx.save();
  try { drawer(ctx, face, W, H); } catch { /* masque sauté */ }
  ctx.restore();
}

export { faceBox };
