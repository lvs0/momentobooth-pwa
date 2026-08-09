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

/* ─── Orientation de la tête (angle entre les yeux) pour faire pivoter
       les oreilles / accessoires avec le visage ─── */
function headAngle(face) {
  const l = face[33], r = face[263]; // coins externes des yeux
  return Math.atan2(py(r.y - l.y, 1) * 100, px(r.x - l.x, 1) * 100) * 180 / Math.PI;
}

/* ─── Oreilles de chat (SVG dessiné, tracking rotation) ─── */
function drawCatEars(ctx, face, W, H) {
  const forehead = face[10];
  const leftEar = face[234], rightEar = face[454];
  const cx = px((forehead.x + face[1].x) / 2, W);
  const topY = py(Math.min(forehead.y, face[1].y), H);
  const earW = Math.max(70, Math.abs(px(leftEar.x, W) - px(rightEar.x, W)) * 0.34);
  const earH = earW * 1.55;
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - earH * 0.42);
  ctx.rotate((angle * Math.PI) / 180);
  // Oreille gauche
  ctx.beginPath();
  ctx.moveTo(-earW * 1.35, -earH * 0.18);
  ctx.lineTo(-earW * 0.55, -earH);
  ctx.lineTo(-earW * 0.05, -earH * 0.1);
  ctx.closePath();
  ctx.fillStyle = "#3a2b3f";
  ctx.strokeStyle = "rgba(20,12,24,.55)";
  ctx.lineWidth = Math.max(2, earW * 0.045);
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 14;
  ctx.fill(); ctx.stroke();
  // Intérieur oreille gauche (rose)
  ctx.beginPath();
  ctx.moveTo(-earW * 1.14, -earH * 0.28);
  ctx.lineTo(-earW * 0.68, -earH * 0.78);
  ctx.lineTo(-earW * 0.32, -earH * 0.2);
  ctx.closePath();
  ctx.fillStyle = "#f6a5c0";
  ctx.shadowBlur = 0;
  ctx.fill();
  // Oreille droite
  ctx.beginPath();
  ctx.moveTo(earW * 1.35, -earH * 0.18);
  ctx.lineTo(earW * 0.55, -earH);
  ctx.lineTo(earW * 0.05, -earH * 0.1);
  ctx.closePath();
  ctx.fillStyle = "#3a2b3f";
  ctx.shadowBlur = 14;
  ctx.fill(); ctx.stroke();
  // Intérieur oreille droite (rose)
  ctx.beginPath();
  ctx.moveTo(earW * 1.14, -earH * 0.28);
  ctx.lineTo(earW * 0.68, -earH * 0.78);
  ctx.lineTo(earW * 0.32, -earH * 0.2);
  ctx.closePath();
  ctx.fillStyle = "#f6a5c0";
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.restore();
}

/* ─── Oreilles d'ours (rondes, tracking rotation) ─── */
function drawBearEars(ctx, face, W, H) {
  const forehead = face[10];
  const leftEar = face[234], rightEar = face[454];
  const cx = px((forehead.x + face[1].x) / 2, W);
  const topY = py(Math.min(forehead.y, face[1].y), H);
  const earR = Math.max(38, Math.abs(px(leftEar.x, W) - px(rightEar.x, W)) * 0.17);
  const spread = earR * 1.55;
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - earR * 0.55);
  ctx.rotate((angle * Math.PI) / 180);
  [-1, 1].forEach((s) => {
    const ex = s * spread, ey = -earR * 0.15;
    ctx.beginPath();
    ctx.arc(ex, ey, earR, 0, Math.PI * 2);
    ctx.fillStyle = "#7a5230";
    ctx.strokeStyle = "rgba(40,24,10,.5)";
    ctx.lineWidth = Math.max(2, earR * 0.07);
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 12;
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, earR * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#e8b98a";
    ctx.shadowBlur = 0;
    ctx.fill();
  });
  ctx.restore();
}

/* ─── Museau de chat (triangle rose + moustaches, sous le nez) ─── */
function drawCatNose(ctx, face, W, H) {
  const nose = face[1];
  const cx = px(nose.x, W), cy = py(nose.y, H);
  const faceW = Math.abs(px(face[234].x, W) - px(face[454].x, W));
  const s = Math.max(26, faceW * 0.12);
  ctx.save();
  // Museau rose (deux lobes)
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.9, cy - s * 0.2);
  ctx.lineTo(cx - s * 0.45, cy + s * 0.4);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = "#e8799f";
  ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 6;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.9, cy - s * 0.2);
  ctx.lineTo(cx + s * 0.45, cy + s * 0.4);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Moustaches
  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  [[-1, -0.1], [-1, 0.25]].forEach(([d, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy + dy * s);
    ctx.lineTo(cx - s * 1.9, cy + (dy + 0.12) * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.55, cy + dy * s);
    ctx.lineTo(cx + s * 1.9, cy + (dy + 0.12) * s);
    ctx.stroke();
  });
  ctx.restore();
}

/* ─── Cornes de démon (rouges, incurvées, tracking) ─── */
function drawHorns(ctx, face, W, H) {
  const forehead = face[10];
  const leftEar = face[234], rightEar = face[454];
  const cx = px((forehead.x + face[1].x) / 2, W);
  const topY = py(Math.min(forehead.y, face[1].y), H);
  const s = Math.max(40, Math.abs(px(leftEar.x, W) - px(rightEar.x, W)) * 0.2);
  const spread = s * 1.3;
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * 0.35);
  ctx.rotate((angle * Math.PI) / 180);
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(side * spread - s * 0.35, 0);
    ctx.quadraticCurveTo(side * spread * 1.35, -s * 0.7, side * spread * 1.15, -s * 1.5);
    ctx.quadraticCurveTo(side * spread, -s * 1.05, side * spread * 0.72, -s * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#b3242a";
    ctx.strokeStyle = "rgba(60,8,12,.55)";
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 10;
    ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

/* ─── Antennes d'abeille / alien ─── */
function drawAntennas(ctx, face, W, H) {
  const forehead = face[10];
  const leftEar = face[234], rightEar = face[454];
  const cx = px((forehead.x + face[1].x) / 2, W);
  const topY = py(Math.min(forehead.y, face[1].y), H);
  const s = Math.max(26, Math.abs(px(leftEar.x, W) - px(rightEar.x, W)) * 0.12);
  const spread = s * 1.1;
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * 0.3);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.strokeStyle = "#2b6a4e";
  ctx.lineWidth = Math.max(3, s * 0.14);
  ctx.lineCap = "round";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(side * spread * 0.4, 0);
    ctx.quadraticCurveTo(side * spread * 0.9, -s * 0.9, side * spread, -s * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(side * spread, -s * 1.35, s * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd166";
    ctx.shadowColor = "rgba(255,209,102,.8)"; ctx.shadowBlur = 8;
    ctx.fill();
  });
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
  cat: drawCatEars,
  bear: drawBearEars,
  catnose: drawCatNose,
  horns: drawHorns,
  antennas: drawAntennas,
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
