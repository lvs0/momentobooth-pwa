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

/* Rectangle arrondi compatible iOS 15 (roundRect n'existe qu'à partir d'iOS 16) */
function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* ─── Couronne « La Reine » : or travaillé, gemmes, reflets, tracking rotation ─── */
function drawCrown(ctx, face, W, H) {
  const nose = face[1], forehead = face[10], leftEar = face[234], rightEar = face[454];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  const headW = Math.abs(px(leftEar.x, W) - px(rightEar.x, W));
  const s = Math.max(72, headW * 0.62);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * 0.36);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 14;
  // Bandeau doré
  const band = ctx.createLinearGradient(0, -s * 0.06, 0, s * 0.16);
  band.addColorStop(0, "#ffe9a3"); band.addColorStop(.45, "#ffd24a"); band.addColorStop(1, "#c8941e");
  rr(ctx, -s * 0.5, -s * 0.06, s, s * 0.22, s * 0.05);
  ctx.fillStyle = band; ctx.fill();
  ctx.strokeStyle = "rgba(122,84,8,.75)"; ctx.lineWidth = Math.max(1.5, s * 0.018);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Pointes de la couronne
  const gold = ctx.createLinearGradient(0, -s * 0.62, 0, s * 0.04);
  gold.addColorStop(0, "#fff6c9"); gold.addColorStop(.5, "#ffd94d"); gold.addColorStop(1, "#d4a017");
  const tips = [
    [-0.5, 0.28], [-0.25, 0.34], [0, 0.4], [0.25, 0.34], [0.5, 0.28],
  ];
  tips.forEach(([tx, ty], index) => {
    ctx.beginPath();
    ctx.moveTo(tx * s - s * 0.13, ty * s);
    ctx.lineTo(tx * s + s * 0.13, ty * s);
    ctx.lineTo(tx * s, ty * s - s * 0.5);
    ctx.closePath();
    ctx.fillStyle = gold; ctx.fill();
    ctx.strokeStyle = "rgba(150,105,10,.7)"; ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.stroke();
    // Boule d'or au sommet de chaque pointe
    ctx.beginPath();
    ctx.arc(tx * s, ty * s - s * 0.5, Math.max(1.8, s * 0.028), 0, Math.PI * 2);
    ctx.fillStyle = index % 2 ? "#ff8fab" : "#8ecbff";
    ctx.fill();
  });
  // Gemme centrale
  ctx.beginPath();
  ctx.ellipse(0, s * 0.03, s * 0.09, s * 0.06, 0, 0, Math.PI * 2);
  const gem = ctx.createLinearGradient(0, -s * 0.03, 0, s * 0.1);
  gem.addColorStop(0, "#ff5d8f"); gem.addColorStop(1, "#a80f4e");
  ctx.fillStyle = gem; ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.03, -s * 0.015, s * 0.024, s * 0.014, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ─── Lunettes « Ray-Ban » : verres dégradés + reflets, tracking rotation ─── */
function drawGlasses(ctx, face, W, H) {
  const leftEye = face[33], rightEye = face[263];
  const cx = px((leftEye.x + rightEye.x) / 2, W);
  const cy = py((leftEye.y + rightEye.y) / 2, H);
  const eyeDist = Math.abs(px(leftEye.x, W) - px(rightEye.x, W));
  const s = Math.max(52, eyeDist * 0.82);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, cy + s * 0.04);
  ctx.rotate((angle * Math.PI) / 180);
  // Branches
  ctx.strokeStyle = "#14161f";
  ctx.lineWidth = Math.max(2.4, s * 0.045);
  ctx.lineCap = "round";
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(dir * s * 0.78, -s * 0.02);
    ctx.lineTo(dir * s * 1.24, -s * 0.14);
    ctx.stroke();
  });
  // Pont
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.12);
  ctx.quadraticCurveTo(0, -s * 0.24, s * 0.28, -s * 0.12);
  ctx.strokeStyle = "#14161f";
  ctx.lineWidth = Math.max(1.8, s * 0.03);
  ctx.stroke();
  // Verres dégradés + reflet
  const lensGrad = ctx.createLinearGradient(0, -s * 0.34, 0, s * 0.34);
  lensGrad.addColorStop(0, "rgba(16,20,34,.95)"); lensGrad.addColorStop(.5, "rgba(34,44,74,.92)"); lensGrad.addColorStop(1, "rgba(8,10,18,.97)");
  const lensW = s * 0.46, lensH = s * 0.34;
  [-1, 1].forEach((dir) => {
    const lx = dir * s * 0.52;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 8;
    rr(ctx, lx - lensW / 2, -lensH / 2, lensW, lensH, lensH * 0.34);
    ctx.fillStyle = lensGrad; ctx.fill();
    ctx.strokeStyle = "#0c0e16"; ctx.lineWidth = Math.max(1.6, s * 0.028);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Reflet diagonal
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(lx - lensW * 0.5, -lensH * 0.1);
    ctx.lineTo(lx + lensW * 0.55, -lensH * 0.62);
    ctx.lineTo(lx + lensW * 0.85, -lensH * 0.42);
    ctx.lineTo(lx - lensW * 0.2, lensH * 0.1);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fill();
    ctx.restore();
    // Petite étincelle
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath();
    ctx.arc(lx - lensW * 0.16, -lensH * 0.12, Math.max(1, s * 0.018), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

/* ─── Caca « swirly » : trois bosses, yeux ronds, blush, tracking rotation ─── */
function drawPoop(ctx, face, W, H) {
  const nose = face[1], forehead = face[10];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  const headW = Math.abs(px(face[234].x, W) - px(face[454].x, W));
  const s = Math.max(54, headW * 0.42);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * 0.8);
  ctx.rotate((angle * Math.PI) / 180);
  const brown = ctx.createLinearGradient(0, -s, 0, s * 0.9);
  brown.addColorStop(0, "#8a5a2b"); brown.addColorStop(.55, "#6b3f1b"); brown.addColorStop(1, "#4a2a10");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 10;
  ctx.beginPath();
  // Trois bosses du haut
  ctx.moveTo(-s * 0.52, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.6, -s * 0.55, -s * 0.2, -s * 0.52);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.95, 0, -s * 0.85);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.95, s * 0.2, -s * 0.52);
  ctx.quadraticCurveTo(s * 0.6, -s * 0.55, s * 0.52, s * 0.1);
  // Corps qui descend en pointe
  ctx.quadraticCurveTo(s * 0.62, s * 0.4, s * 0.42, s * 0.72);
  ctx.quadraticCurveTo(s * 0.2, s * 1.02, 0, s * 0.85);
  ctx.quadraticCurveTo(-s * 0.2, s * 1.02, -s * 0.42, s * 0.72);
  ctx.quadraticCurveTo(-s * 0.62, s * 0.4, -s * 0.52, s * 0.1);
  ctx.closePath();
  ctx.fillStyle = brown; ctx.fill();
  ctx.strokeStyle = "rgba(40,22,8,.6)"; ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.stroke();
  ctx.restore();
  // Yeux
  ctx.fillStyle = "#2a1a08";
  [[-0.16, -0.12], [0.16, -0.12]].forEach(([ex, ey]) => {
    ctx.beginPath();
    ctx.ellipse(ex * s, ey * s, s * 0.085, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ex * s - s * 0.03, ey * s - s * 0.04, s * 0.028, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1a08";
  });
  // Sourire
  ctx.strokeStyle = "#2a1a08";
  ctx.lineWidth = Math.max(1.6, s * 0.03);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, s * 0.22, s * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // Joues
  ctx.fillStyle = "rgba(255,120,120,.28)";
  [[-0.34, 0.16], [0.34, 0.16]].forEach(([ex, ey]) => {
    ctx.beginPath();
    ctx.arc(ex * s, ey * s, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/* ─── Chapeau cowboy : feutre texturé, bandeau, étoile, tracking rotation ─── */
function drawCowboy(ctx, face, W, H) {
  const nose = face[1], forehead = face[10];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  const headW = Math.abs(px(face[234].x, W) - px(face[454].x, W));
  const s = Math.max(66, headW * 0.5);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * 0.5);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 12;
  // Bords relevés
  const brim = ctx.createLinearGradient(0, 0, 0, s * 0.3);
  brim.addColorStop(0, "#a4682c"); brim.addColorStop(.5, "#8a4f1e"); brim.addColorStop(1, "#5c3414");
  ctx.beginPath();
  ctx.ellipse(0, s * 0.24, s * 0.92, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = brim; ctx.fill();
  ctx.strokeStyle = "rgba(50,28,8,.7)"; ctx.lineWidth = Math.max(1.5, s * 0.02);
  ctx.stroke();
  // Calotte
  const dome = ctx.createLinearGradient(0, -s * 0.52, 0, s * 0.2);
  dome.addColorStop(0, "#c07c38"); dome.addColorStop(1, "#7a4a1e");
  ctx.beginPath();
  ctx.moveTo(-s * 0.44, s * 0.16);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.5, 0, -s * 0.54);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.5, s * 0.44, s * 0.16);
  ctx.closePath();
  ctx.fillStyle = dome; ctx.fill();
  ctx.strokeStyle = "rgba(50,28,8,.7)"; ctx.lineWidth = Math.max(1.5, s * 0.02);
  ctx.stroke();
  // Bandeau
  ctx.beginPath();
  ctx.moveTo(-s * 0.44, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.24, -s * 0.44, s * 0.3);
  ctx.quadraticCurveTo(0, s * 0.42, s * 0.44, s * 0.3);
  ctx.quadraticCurveTo(s * 0.5, s * 0.24, s * 0.44, s * 0.1);
  ctx.closePath();
  ctx.fillStyle = "#2c1808";
  ctx.fill();
  // Étoile dorée du bandeau
  ctx.save();
  ctx.translate(0, s * 0.22);
  ctx.fillStyle = "#ffd166";
  const starR = s * 0.09;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? starR : starR * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const ex = Math.cos(a) * rad, ey = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ─── Copin cool : lunettes de soleil à verres miroir + sourire, tracking ─── */
function drawCopin(ctx, face, W, H) {
  const leftEye = face[33], rightEye = face[263];
  const cx = px((leftEye.x + rightEye.x) / 2, W);
  const cy = py((leftEye.y + rightEye.y) / 2, H);
  const eyeDist = Math.abs(px(leftEye.x, W) - px(rightEye.x, W));
  const s = Math.max(56, eyeDist * 0.9);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, cy + s * 0.05);
  ctx.rotate((angle * Math.PI) / 180);
  // Verres miroir (dégradé chaud)
  const mirror = ctx.createLinearGradient(0, -s * 0.36, 0, s * 0.36);
  mirror.addColorStop(0, "#ffb45c"); mirror.addColorStop(.45, "#c2452e"); mirror.addColorStop(1, "#5c1230");
  const lensW = s * 0.5, lensH = s * 0.3;
  [-1, 1].forEach((dir) => {
    const lx = dir * s * 0.55;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 8;
    rr(ctx, lx - lensW / 2, -lensH / 2, lensW, lensH, lensH * 0.3);
    ctx.fillStyle = mirror; ctx.fill();
    ctx.strokeStyle = "#160d0a"; ctx.lineWidth = Math.max(1.6, s * 0.028);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Reflet miroir
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(lx - lensW * 0.55, -lensH * 0.05);
    ctx.lineTo(lx + lensW * 0.6, -lensH * 0.6);
    ctx.lineTo(lx + lensW * 0.95, -lensH * 0.35);
    ctx.lineTo(lx - lensW * 0.2, lensH * 0.2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fill();
    ctx.restore();
    ctx.restore();
  });
  // Pont
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.1);
  ctx.quadraticCurveTo(0, -s * 0.24, s * 0.3, -s * 0.1);
  ctx.strokeStyle = "#160d0a";
  ctx.lineWidth = Math.max(1.8, s * 0.03);
  ctx.stroke();
  // Sourire en coin
  const nose = face[1];
  const nx = px(nose.x, W) - cx, ny = py(nose.y, H) - cy;
  ctx.strokeStyle = "rgba(20,20,28,.85)";
  ctx.lineWidth = Math.max(2, s * 0.04);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(nx - s * 0.28, ny + s * 0.16);
  ctx.quadraticCurveTo(nx, ny + s * 0.42, nx + s * 0.3, ny + s * 0.14);
  ctx.stroke();
  ctx.restore();
}

/* ─── Baiser copine : lèvres glossy (dégradé, séparation, reflet), tracking ─── */
function drawCopine(ctx, face, W, H) {
  const chin = face[152], nose = face[1];
  const cx = px((chin.x + nose.x) / 2, W);
  const cy = py((chin.y + nose.y) / 2, H);
  const faceH = Math.abs(py(face[10].y, H) - py(chin.y, H));
  const s = Math.max(34, faceH * 0.2);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 10;
  // Lèvres (arc de Cupidon + lèvre inférieure)
  const lip = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.55);
  lip.addColorStop(0, "#ff5d8f"); lip.addColorStop(.5, "#e81f62"); lip.addColorStop(1, "#9c0f43");
  ctx.beginPath();
  // Contour supérieur gauche
  ctx.moveTo(-s * 0.62, -s * 0.05);
  ctx.quadraticCurveTo(-s * 0.4, -s * 0.52, 0, -s * 0.3);
  // Contour supérieur droit
  ctx.quadraticCurveTo(s * 0.4, -s * 0.52, s * 0.62, -s * 0.05);
  // Lèvre inférieure
  ctx.quadraticCurveTo(s * 0.55, s * 0.5, 0, s * 0.5);
  ctx.quadraticCurveTo(-s * 0.55, s * 0.5, -s * 0.62, -s * 0.05);
  ctx.closePath();
  ctx.fillStyle = lip; ctx.fill();
  ctx.strokeStyle = "rgba(120,10,52,.7)"; ctx.lineWidth = Math.max(1.4, s * 0.03);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Séparation des lèvres
  ctx.strokeStyle = "rgba(120,10,52,.55)";
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.05);
  ctx.quadraticCurveTo(0, s * 0.1, s * 0.5, -s * 0.05);
  ctx.stroke();
  // Reflet glossy
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, -s * 0.2, s * 0.14, s * 0.06, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ─── Masque : Famille Verpoort (cœurs + couronne + texte) ─── */
function drawFamily(ctx, face, W, H, faceIndex) {
  const nose = face[1], forehead = face[10], chin = face[152];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  // Couronne famille
  drawEmoji(ctx, "👑", cx, topY - 50, 90);
  // Deux cœurs sur les joues
  const leftCheek = face[50], rightCheek = face[280];
  drawEmoji(ctx, "❤️", px(leftCheek.x, W), py(leftCheek.y, H) - 40, 44);
  drawEmoji(ctx, "💙", px(rightCheek.x, W), py(rightCheek.y, H) - 40, 44);
  // Bandeau texte : une seule fois (pas dupliqué quand plusieurs visages)
  if (!faceIndex) {
    ctx.save();
    ctx.font = `bold ${Math.max(22, H * 0.032)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(240,201,106,.95)";
    ctx.shadowColor = "rgba(0,0,0,.7)";
    ctx.shadowBlur = 8;
    ctx.fillText("FAMILLE VERPOORT", px(0.5, W), py(0.96, H));
    ctx.restore();
  }
  void chin;
}

/* ─── Masque : moustache (vectorielle, deux virgules sous le nez) ─── */
function drawMustache(ctx, face, W, H) {
  const nose = face[1];
  const cx = px(nose.x, W);
  const cy = py(nose.y, H) + Math.max(3, H * 0.008);
  const faceW = Math.abs(px(face[234].x, W) - px(face[454].x, W));
  const s = Math.max(34, faceW * 0.3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 8;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.02);
    ctx.quadraticCurveTo(dir * s * 0.3, s * 0.34, dir * s * 0.74, s * 0.18);
    ctx.quadraticCurveTo(dir * s * 1.04, s * 0.02, dir * s * 0.8, -s * 0.24);
    ctx.quadraticCurveTo(dir * s * 0.5, -s * 0.08, dir * s * 0.38, s * 0.02);
    ctx.quadraticCurveTo(dir * s * 0.2, -s * 0.14, 0, -s * 0.02);
    ctx.closePath();
    ctx.fillStyle = "#3a2410";
    ctx.fill();
  });
  ctx.shadowBlur = 0;
  // Reflet léger : donne du volume sans alourdir le rendu.
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s * 0.06);
  ctx.quadraticCurveTo(-s * 0.3, s * 0.22, 0, s * 0.04);
  ctx.stroke();
  ctx.restore();
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

/* ─── Lapin : oreilles souples, intérieur rose et nez positionné sur le nez réel ─── */
function drawBunny(ctx, face, W, H) {
  const nose = face[1], forehead = face[10], leftEar = face[234], rightEar = face[454];
  const cx = px((nose.x + forehead.x) / 2, W);
  const topY = py(Math.min(forehead.y, nose.y), H);
  const headW = Math.abs(px(leftEar.x, W) - px(rightEar.x, W));
  const s = Math.max(76, headW * .72);
  const angle = headAngle(face);
  ctx.save();
  ctx.translate(cx, topY - s * .2);
  ctx.rotate((angle * Math.PI) / 180);
  const ear = ctx.createLinearGradient(0, -s * 1.35, 0, 0);
  ear.addColorStop(0, "#fff"); ear.addColorStop(1, "#e9d7ed");
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(dir * s * .12, -s * .06);
    ctx.bezierCurveTo(dir * s * .3, -s * .45, dir * s * .48, -s * 1.2, dir * s * .3, -s * 1.38);
    ctx.bezierCurveTo(dir * s * .08, -s * 1.52, dir * s * .02, -s * .48, dir * s * .12, -s * .06);
    ctx.fillStyle = ear; ctx.fill();
    ctx.strokeStyle = "rgba(182,143,184,.8)"; ctx.lineWidth = Math.max(1.5, s * .018); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dir * s * .17, -s * .18);
    ctx.bezierCurveTo(dir * s * .28, -s * .54, dir * s * .37, -s * 1.02, dir * s * .3, -s * 1.2);
    ctx.bezierCurveTo(dir * s * .2, -s * 1.05, dir * s * .13, -s * .56, dir * s * .17, -s * .18);
    ctx.fillStyle = "rgba(255,157,201,.72)"; ctx.fill();
  });
  const nx = px(nose.x, W) - cx, ny = py(nose.y, H) - (topY - s * .2);
  ctx.fillStyle = "#ff8fbd";
  ctx.beginPath(); ctx.ellipse(nx, ny, s * .075, s * .055, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(133,53,91,.65)"; ctx.lineWidth = Math.max(1, s * .014);
  ctx.beginPath(); ctx.moveTo(nx, ny + s * .04); ctx.quadraticCurveTo(nx - s * .08, ny + s * .12, nx - s * .16, ny + s * .08); ctx.moveTo(nx, ny + s * .04); ctx.quadraticCurveTo(nx + s * .08, ny + s * .12, nx + s * .16, ny + s * .08); ctx.stroke();
  ctx.fillStyle = "rgba(255,113,164,.24)";
  [-1, 1].forEach((dir) => { ctx.beginPath(); ctx.ellipse(nx + dir * s * .3, ny + s * .1, s * .12, s * .065, 0, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

/* ─── Yeux étoilés : étoiles centrées sur les coins internes, avec halo doux ─── */
function drawStarry(ctx, face, W, H) {
  // Les iris 468/473 donnent le centre réel de chaque œil ; les coins
  // externes restent un fallback pour les modèles/landmarks plus anciens.
  const left = face[468] || midpoint(face[33], face[133]);
  const right = face[473] || midpoint(face[263], face[362]);
  const eyeDist = Math.abs(px(face[33].x, W) - px(face[263].x, W));
  const size = Math.max(16, eyeDist * .26);
  const angle = headAngle(face);
  const drawStar = (point, dir) => {
    const x = px(point.x, W), y = py(point.y, H);
    ctx.save(); ctx.translate(x, y); ctx.rotate((angle * Math.PI) / 180);
    ctx.shadowColor = dir < 0 ? "rgba(125,231,255,.9)" : "rgba(221,163,255,.9)"; ctx.shadowBlur = size * .8;
    ctx.fillStyle = dir < 0 ? "#a9f3ff" : "#f1c5ff";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? size * .28 : size; const a = i * Math.PI / 4 - Math.PI / 2; const sx = Math.cos(a) * r, sy = Math.sin(a) * r; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-size * .18, -size * .18, size * .16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  drawStar(left, -1); drawStar(right, 1);
}

function midpoint(a, b) {
  if (!a || !b) return a || b || { x: .5, y: .5, z: 0 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
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
  bunny: drawBunny,
  starry: drawStarry,
};

export function drawMask(ctx, W, H, face, maskId, faceIndex = 0, faceMatrix = null) {
  if (!maskId || maskId === "none" || !face || face.length < 30) return;
  // Routage des effets 3D expérimentaux (noelcap-3d, glasses-3d, glasses-3d-rose).
  // Si three.js / WebGL indisponible → fallback canvas silencieux.
  // Note : on importe effects-3d.js en synchrone ici (le module est léger
  // ~11KB). three.js lui-même reste lazy dans load3DEffect via dynamic
  // import du CDN — donc pas de coût 600KB pour les utilisateurs qui
  // n'utilisent jamais les effets 3D.
  if (maskId.startsWith("3d:")) {
    const id = maskId.slice(3);
    draw3DSync(ctx, W, H, face, id, faceIndex, faceMatrix);
    return;
  }
  const drawer = DRAWERS[maskId];
  if (!drawer) return;
  ctx.save();
  try { drawer(ctx, face, W, H, faceIndex); } catch { /* masque sauté */ }
  ctx.restore();
}

/* Routage 3D synchrone. Import dynamique de effects-3d.js mis en cache
   au top-level : le module lui-même est léger (~11KB), mais three.js
   (≈600KB) reste lazy dans load3DEffect via dynamic import du CDN ESM.
   Donc pas de coût 600KB pour les utilisateurs qui n'utilisent jamais
   les effets 3D. Le module est chargé en parallèle de masks.js. Si
   WebGL/three indisponible → fallback canvas immédiat (silencieux). */
let _fx3d = null;
let _fx3dLoadTried = false;
let _fx3dLoading = null;
function ensureFx3D() {
  if (_fx3dLoadTried) return _fx3d;
  if (_fx3dLoading) return _fx3d;
  _fx3dLoading = import("./effects-3d.js?v=3d-1")
    .then((m) => { _fx3d = m; _fx3dLoadTried = true; return m; })
    .catch(() => { _fx3d = null; _fx3dLoadTried = true; return null; })
    .finally(() => { _fx3dLoading = null; });
  return null;
}
// Démarre le chargement dès que masks.js est évalué.
// v124.0.3 — mode lite Safari iOS : on ne lance pas le dynamic import
// effects-3d.js au boot (suspect crash Safari). Le 3D sera tenté seulement
// si l'user clique explicitement sur un effet "3d:*".
const _isLiteMode = (function () {
  try {
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    const force = new URLSearchParams(location.search).get("force-full") === "1";
    return isIOS && isSafari && !force;
  } catch { return false; }
})();
if (!_isLiteMode) ensureFx3D();

function draw3DSync(ctx, W, H, face, id, faceIndex, faceMatrix = null) {
  // Si le module n'est pas encore prêt, on relance le déclenchement.
  // v124.0.7 — même en mode lite, forcer le chargement quand l'utilisateur
  // clique sur un effet 3D (le mode lite empêche seulement le preload au boot).
  if (!_fx3dLoadTried) ensureFx3D();
  const mod = _fx3d;
  if (!mod || !mod.is3DSupported || !mod.is3DSupported()) {
    drawMask(ctx, W, H, face, fallbackFor(id), faceIndex, faceMatrix);
    return;
  }
  // Tente de récupérer un effet déjà chargé (cache) ; sinon fallback
  // cette frame. La frame suivante déclenchera load3DEffect.
  const cached = mod.get3DEffect ? mod.get3DEffect(id) : null;
  if (!cached) {
    // Lance le chargement pour les frames suivantes, fallback cette frame.
    if (mod.load3DEffect) mod.load3DEffect(id).catch(() => {});
    drawMask(ctx, W, H, face, fallbackFor(id), faceIndex, faceMatrix);
    return;
  }
  // Rendu immédiat.
  try {
    if (typeof mod.render3DEffectToCanvas === "function") {
      const out = mod.render3DEffectToCanvas(cached, face, W, H, faceIndex, faceMatrix);
      if (out && out.canvas) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(out.canvas, 0, 0, W, H);
        ctx.restore();
        return;
      }
    }
  } catch { /* render failed → fallback */ }
  drawMask(ctx, W, H, face, fallbackFor(id), faceIndex);
}

function fallbackFor(id3d) {
  // Le fallback est résolu via l'entrée FILTERS (champ fallback) mais
  // ici on hardcode pour éviter une dépendance circulaire masks↔filters.
  if (id3d === "noelcap-3d") return "crown";
  if (id3d === "glasses-3d" || id3d === "glasses-3d-rose") return "glasses";
  return "none";
}

export { faceBox };
