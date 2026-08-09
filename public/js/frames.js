/* =========================================================
   MomentoBooth — Cadres anniversaire
   « 18 ans Lilou & Kenza » avec plusieurs bordures
   Dessinés par-dessus la photo (canvas)
   ========================================================= */

export const FRAME_TEXTS = {
  default: { line1: "18 ANS", line2: "Lilou & Kenza" },
};

/* Designs de bordure : chaque design a draw(ctx, W, H) */
const DESIGNS = {
  none:      { name: "Aucun", draw: () => {} },

  /* ─── Doré classique : filet + coins + ruban texte ─── */
  gold: {
    name: "Doré",
    draw(ctx, W, H, text) {
      const m = Math.min(W, H) * 0.045;
      const lw = Math.max(6, m * 0.22);
      ctx.save();
      ctx.strokeStyle = "rgba(212,175,55,.95)";
      ctx.lineWidth = lw;
      ctx.shadowColor = "rgba(212,175,55,.6)";
      ctx.shadowBlur = 12;
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
      // filet intérieur fin
      ctx.strokeStyle = "rgba(255,224,130,.5)";
      ctx.lineWidth = Math.max(2, lw * 0.35);
      ctx.shadowBlur = 0;
      ctx.strokeRect(m + lw * 1.6, m + lw * 1.6, W - 2 * (m + lw * 1.6), H - 2 * (m + lw * 1.6));
      drawRibbon(ctx, W, H, text, "#d4af37", "#8a5a00");
      ctx.restore();
    },
  },

  /* ─── Confettis : coins colorés + bande ─── */
  confetti: {
    name: "Confettis",
    draw(ctx, W, H, text) {
      const m = Math.min(W, H) * 0.05;
      ctx.save();
      const colors = ["#ff5252", "#40c4ff", "#ffee58", "#69f0ae", "#e040fb", "#ff9100"];
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 90; i++) {
        const x = rnd() * W, y = rnd() * H;
        if (x < m || x > W - m || y < m || y > H - m) {
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          const s = 6 + rnd() * 12;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rnd() * Math.PI);
          ctx.fillRect(-s / 2, -s / 4, s, s / 2);
          ctx.restore();
        }
      }
      drawRibbon(ctx, W, H, text, "#ff5252", "#b00020");
      ctx.restore();
    },
  },

  /* ─── Ballons : ballons en haut + ruban ─── */
  balloons: {
    name: "Ballons",
    draw(ctx, W, H, text) {
      ctx.save();
      // ballons en haut
      const bcolors = ["#ff5252", "#40c4ff", "#ffee58", "#69f0ae", "#e040fb"];
      const n = 6;
      const bw = W / (n + 1);
      for (let i = 0; i < n; i++) {
        const x = bw * (i + 1) + (i % 2 ? -18 : 14);
        const y = Math.min(W, H) * 0.075 + (i % 2 ? 24 : 0);
        const r = Math.min(W, H) * 0.05;
        ctx.fillStyle = bcolors[i % bcolors.length];
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        // fil
        ctx.strokeStyle = "rgba(255,255,255,.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + r * 1.2);
        ctx.quadraticCurveTo(x + 8, y + r * 2, x + 3, y + r * 2.8);
        ctx.stroke();
        // reflet
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.beginPath();
        ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      drawRibbon(ctx, W, H, text, "#40c4ff", "#01579b");
      ctx.restore();
    },
  },

  /* ─── Cœurs : bordure de cœurs ─── */
  hearts: {
    name: "Cœurs",
    draw(ctx, W, H, text) {
      const m = Math.min(W, H) * 0.05;
      ctx.save();
      const step = Math.min(W, H) * 0.07;
      const drawHeart = (x, y, s) => {
        ctx.fillStyle = "rgba(255,82,130,.85)";
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.4);
        ctx.bezierCurveTo(x - s * 0.6, y - s * 0.1, x - s * 0.35, y - s * 0.55, x, y - s * 0.2);
        ctx.bezierCurveTo(x + s * 0.35, y - s * 0.55, x + s * 0.6, y - s * 0.1, x, y + s * 0.4);
        ctx.fill();
      };
      // haut / bas
      for (let x = m + step / 2; x < W - m; x += step) {
        drawHeart(x, m + 4, step * 0.5);
        drawHeart(x, H - m - 4, step * 0.5);
      }
      // gauche / droite
      for (let y = m + step / 2; y < H - m; y += step) {
        drawHeart(m + 4, y, step * 0.5);
        drawHeart(W - m - 4, y, step * 0.5);
      }
      drawRibbon(ctx, W, H, text, "#ff5274", "#c2185b");
      ctx.restore();
    },
  },

  /* ─── Floral : coins fleurs ─── */
  floral: {
    name: "Floral",
    draw(ctx, W, H, text) {
      const m = Math.min(W, H) * 0.06;
      ctx.save();
      const flower = (x, y, s, color) => {
        ctx.fillStyle = color;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.38, s * 0.24, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff59d";
        ctx.beginPath();
        ctx.arc(x, y, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
      };
      const fcol = ["#ff8a80", "#ff80ab", "#ffd180", "#ffab40"];
      const corners = [[m, m], [W - m, m], [m, H - m], [W - m, H - m]];
      corners.forEach(([x, y], i) => flower(x, y, Math.min(W, H) * 0.05, fcol[i % 4]));
      // filet élégant
      ctx.strokeStyle = "rgba(255,138,128,.6)";
      ctx.lineWidth = Math.max(3, m * 0.12);
      ctx.strokeRect(m * 0.6, m * 0.6, W - m * 1.2, H - m * 1.2);
      drawRibbon(ctx, W, H, text, "#ff80ab", "#c2185b");
      ctx.restore();
    },
  },

  /* ─── Étoiles : scintillement ─── */
  stars: {
    name: "Étoiles",
    draw(ctx, W, H, text) {
      const m = Math.min(W, H) * 0.05;
      ctx.save();
      const star = (x, y, s) => {
        ctx.fillStyle = "rgba(255,215,64,.9)";
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? s : s * 0.45;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      };
      const step = Math.min(W, H) * 0.09;
      for (let x = m + step / 2; x < W - m; x += step) {
        star(x, m + 6, step * 0.3);
        star(x, H - m - 6, step * 0.3);
      }
      for (let y = m + step / 2; y < H - m; y += step) {
        star(m + 6, y, step * 0.3);
        star(W - m - 6, y, step * 0.3);
      }
      drawRibbon(ctx, W, H, text, "#ffd740", "#b26500");
      ctx.restore();
    },
  },

  /* ─── Party : rayures diagonales + ruban ─── */
  party: {
    name: "Fête",
    draw(ctx, W, H, text) {
      ctx.save();
      const colors = ["rgba(255,82,82,.16)", "rgba(64,196,255,.16)", "rgba(255,238,88,.16)", "rgba(105,240,174,.16)"];
      const stripe = Math.min(W, H) * 0.09;
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.save();
        ctx.translate(0, i * stripe);
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(0, 0, W * 1.5, stripe * 0.5);
        ctx.restore();
      }
      drawRibbon(ctx, W, H, text, "#e040fb", "#880e4f");
      ctx.restore();
    },
  },
};

/* Ruban central avec le texte anniversaire */
function drawRibbon(ctx, W, H, text, color, dark) {
  const t = text || FRAME_TEXTS.default;
  const bandW = Math.min(W * 0.72, 1200);
  const bandH = Math.min(H * 0.11, 150);
  const x = W / 2 - bandW / 2;
  const y = H * 0.84 - bandH / 2;
  ctx.save();
  // ruban
  const grad = ctx.createLinearGradient(x, 0, x + bandW, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, bandW, bandH, bandH / 2);
  ctx.fill();
  // liseré
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  // texte
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 6;
  const fontSize = Math.max(22, bandH * 0.34);
  ctx.font = `900 ${fontSize}px -apple-system, "SF Pro Display", sans-serif`;
  ctx.fillText(t.line1.toUpperCase(), W / 2, y + bandH * 0.42);
  ctx.font = `800 ${fontSize * 0.82}px -apple-system, "SF Pro Display", sans-serif`;
  ctx.fillText(t.line2.toUpperCase(), W / 2, y + bandH * 0.82);
  ctx.restore();
}

export const FRAMES = Object.entries(DESIGNS).map(([id, d]) => ({ id, name: d.name, draw: d.draw }));

export function drawFrame(ctx, W, H, frameId, text) {
  if (!frameId || frameId === "none") return;
  const frame = FRAMES.find((f) => f.id === frameId);
  if (!frame) return;
  ctx.save();
  try { frame.draw(ctx, W, H, text); } catch { /* cadre sauté */ }
  ctx.restore();
}

/* Aperçu SVG des designs pour le panneau (data-URI) */
export function framePreview(id, w = 120, h = 160) {
  const names = {
    none: "Aucun", gold: "Doré", confetti: "Confettis", balloons: "Ballons",
    hearts: "Cœurs", floral: "Floral", stars: "Étoiles", party: "Fête",
  };
  const colors = {
    none: "#333", gold: "#d4af37", confetti: "#ff5252", balloons: "#40c4ff",
    hearts: "#ff5274", floral: "#ff80ab", stars: "#ffd740", party: "#e040fb",
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">
    <rect width="120" height="160" fill="#1a1a2e"/>
    <rect x="${id === "none" ? 2 : 8}" y="${id === "none" ? 2 : 8}" width="${id === "none" ? 116 : 104}" height="${id === "none" ? 156 : 144}" rx="8" fill="#0a0a14" stroke="${colors[id] || "#fff"}" stroke-width="${id === "none" ? 1 : 3}"/>
    <rect x="30" y="118" width="60" height="22" rx="11" fill="${colors[id] || "#fff"}"/>
    <text x="60" y="133" font-size="9" font-weight="bold" fill="#fff" text-anchor="middle" font-family="sans-serif">18 ANS</text>
    <text x="60" y="74" font-size="12" fill="${colors[id] || "#aaa"}" text-anchor="middle" font-family="sans-serif">${names[id]}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
