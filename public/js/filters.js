/* =========================================================
   MomentoBooth — Moteur de filtres
   - css   : chaîne CSS filter pour l'aperçu temps réel (GPU)
   - ops   : opérations pixel pour la capture (Safari iOS n'a pas ctx.filter)
   Sources : CSSgram (MIT, una) + filtres maison
   ========================================================= */

const CSSGRAM = {
  "1977":      { css: "contrast(1.1) brightness(1.1) saturate(1.3)", ops: [["contrast",1.1],["brightness",1.1],["saturate",1.3]] },
  aden:        { css: "hue-rotate(-20deg) contrast(.9) saturate(.85) brightness(1.2)", ops: [["hueRotate",-20],["contrast",.9],["saturate",.85],["brightness",1.2]] },
  brannan:     { css: "sepia(.5) contrast(1.4)", ops: [["sepia",.5],["contrast",1.4]] },
  brooklyn:    { css: "contrast(.9) brightness(1.1)", ops: [["contrast",.9],["brightness",1.1]] },
  clarendon:   { css: "contrast(1.2) saturate(1.35)", ops: [["contrast",1.2],["saturate",1.35]] },
  earlybird:   { css: "contrast(.9) sepia(.2)", ops: [["contrast",.9],["sepia",.2]] },
  gingham:     { css: "brightness(1.05) hue-rotate(-10deg)", ops: [["brightness",1.05],["hueRotate",-10]] },
  hudson:      { css: "brightness(1.2) contrast(.9) saturate(1.1)", ops: [["brightness",1.2],["contrast",.9],["saturate",1.1]] },
  inkwell:     { css: "sepia(.3) contrast(1.1) brightness(1.1) grayscale(1)", ops: [["sepia",.3],["contrast",1.1],["brightness",1.1],["grayscale"]] },
  lark:        { css: "contrast(.9)", ops: [["contrast",.9]] },
  lofi:        { css: "saturate(1.1) contrast(1.5)", ops: [["saturate",1.1],["contrast",1.5]] },
  maven:       { css: "sepia(.25) brightness(.95) contrast(.95) saturate(1.5)", ops: [["sepia",.25],["brightness",.95],["contrast",.95],["saturate",1.5]] },
  mayfair:     { css: "contrast(1.1) saturate(1.1)", ops: [["contrast",1.1],["saturate",1.1]] },
  moon:        { css: "grayscale(1) contrast(1.1) brightness(1.1)", ops: [["grayscale"],["contrast",1.1],["brightness",1.1]] },
  nashville:   { css: "sepia(.2) contrast(1.2) brightness(1.05) saturate(1.2)", ops: [["sepia",.2],["contrast",1.2],["brightness",1.05],["saturate",1.2]] },
  reyes:       { css: "sepia(.22) brightness(1.1) contrast(.85) saturate(.75)", ops: [["sepia",.22],["brightness",1.1],["contrast",.85],["saturate",.75]] },
  rise:        { css: "brightness(1.05) sepia(.2) contrast(.9) saturate(.9)", ops: [["brightness",1.05],["sepia",.2],["contrast",.9],["saturate",.9]] },
  slumber:     { css: "saturate(.66) brightness(1.05)", ops: [["saturate",.66],["brightness",1.05]] },
  stinson:     { css: "contrast(.75) saturate(.85) brightness(1.15)", ops: [["contrast",.75],["saturate",.85],["brightness",1.15]] },
  toaster:     { css: "contrast(1.5) brightness(.9)", ops: [["contrast",1.5],["brightness",.9]] },
  valencia:    { css: "contrast(1.08) brightness(1.08) sepia(.08)", ops: [["contrast",1.08],["brightness",1.08],["sepia",.08]] },
  walden:      { css: "brightness(1.1) hue-rotate(-10deg) sepia(.3) saturate(1.6)", ops: [["brightness",1.1],["hueRotate",-10],["sepia",.3],["saturate",1.6]] },
  willow:      { css: "grayscale(.5) contrast(.95) brightness(.9)", ops: [["grayscaleHalf"],["contrast",.95],["brightness",.9]] },
  xpro2:       { css: "sepia(.3)", ops: [["sepia",.3]] },
};

const HOME = {
  original: { name: "Original", css: "none", ops: [] },
  mono:     { name: "N&B", css: "grayscale(1) contrast(1.05)", ops: [["grayscale"],["contrast",1.05]] },
  vivid:    { name: "Vif", css: "saturate(1.6) contrast(1.12) brightness(1.02)", ops: [["saturate",1.6],["contrast",1.12],["brightness",1.02]] },
  cool:     { name: "Froid", css: "saturate(1.15) hue-rotate(18deg) brightness(1.04)", ops: [["saturate",1.15],["hueRotate",18],["brightness",1.04]] },
  warm:     { name: "Chaud", css: "sepia(.28) saturate(1.35) hue-rotate(-12deg) brightness(1.05)", ops: [["sepia",.28],["saturate",1.35],["hueRotate",-12],["brightness",1.05]] },
  noir:     { name: "Noir+", css: "brightness(.72) contrast(1.45) saturate(.55)", ops: [["brightness",.72],["contrast",1.45],["saturate",.55]] },
  neon:     { name: "Néon", css: "hue-rotate(85deg) saturate(1.8) contrast(1.05)", ops: [["hueRotate",85],["saturate",1.8],["contrast",1.05]] },
  drama:    { name: "Drame", css: "contrast(1.35) brightness(.95) saturate(1.25)", ops: [["contrast",1.35],["brightness",.95],["saturate",1.25]] },
  soft:     { name: "Douce", css: "brightness(1.08) contrast(.9) saturate(1.05)", ops: [["brightness",1.08],["contrast",.9],["saturate",1.05]] },
  tropique: { name: "Tropique", css: "saturate(1.5) hue-rotate(-18deg) brightness(1.08)", ops: [["saturate",1.5],["hueRotate",-18],["brightness",1.08]] },
  vintage:  { name: "Vintage", css: "sepia(.5) contrast(.92) brightness(1.06) saturate(.85)", ops: [["sepia",.5],["contrast",.92],["brightness",1.06],["saturate",.85]] },
  sepia:    { name: "Sépia", css: "sepia(.75) saturate(1.1)", ops: [["sepia",.75],["saturate",1.1]] },
};

const NAMES = {
  "1977": "1977", aden: "Aden", brannan: "Brannan", brooklyn: "Brooklyn", clarendon: "Clarendon",
  earlybird: "Earlybird", gingham: "Gingham", hudson: "Hudson", inkwell: "Inkwell", lark: "Lark",
  lofi: "Lo-Fi", maven: "Maven", mayfair: "Mayfair", moon: "Moon", nashville: "Nashville",
  reyes: "Reyes", rise: "Rise", slumber: "Slumber", stinson: "Stinson", toaster: "Toaster",
  valencia: "Valencia", walden: "Walden", willow: "Willow", xpro2: "X-Pro II",
};

export const FILTERS = [
  { id: "original", name: "Original", css: "none", ops: [] },
  // Maison (rapides, parfaits pour les miniatures)
  ...Object.entries(HOME).filter(([id]) => id !== "original").map(([id, f]) => ({ id, name: f.name, css: f.css, ops: f.ops })),
  // CSSgram
  ...Object.entries(CSSGRAM).map(([id, f]) => ({ id, name: NAMES[id] ?? id, css: f.css, ops: f.ops })),
];

/* ---------- Opérations pixel ---------- */
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function applyOps(data, ops) {
  for (const [op, amount] of ops) {
    const n = data.length;
    for (let i = 0; i < n; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      switch (op) {
        case "grayscale": {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          r = g = b = v; break;
        }
        case "grayscaleHalf": {
          const v = 0.299 * r + 0.587 * g + 0.114 * b;
          r = r * .5 + v * .5; g = g * .5 + v * .5; b = b * .5 + v * .5; break;
        }
        case "sepia": {
          const nr = 0.393 * r + 0.769 * g + 0.189 * b;
          const ng = 0.349 * r + 0.686 * g + 0.168 * b;
          const nb = 0.272 * r + 0.534 * g + 0.131 * b;
          const a = amount ?? .5;
          r = r + (nr - r) * a; g = g + (ng - g) * a; b = b + (nb - b) * a; break;
        }
        case "contrast": {
          const f = (c) => (c - 128) * (amount ?? 1) + 128;
          r = f(r); g = f(g); b = f(b); break;
        }
        case "brightness": {
          r *= amount ?? 1; g *= amount ?? 1; b *= amount ?? 1; break;
        }
        case "saturate": {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const a = amount ?? 1;
          r = gray + (r - gray) * a; g = gray + (g - gray) * a; b = gray + (b - gray) * a; break;
        }
        case "hueRotate": {
          const deg = ((amount ?? 0) * Math.PI) / 180;
          const cosA = Math.cos(deg), sinA = Math.sin(deg);
          // matrice de rotation de teinte (approximation luminance préservée)
          const lumR = 0.213, lumG = 0.715, lumB = 0.072;
          const nr = (lumR + cosA * (1 - lumR) + sinA * (-lumR)) * r
                  + (lumG + cosA * (-lumG) + sinA * (-lumG)) * g
                  + (lumB + cosA * (-lumB) + sinA * (1 - lumB)) * b;
          const ng = (lumR + cosA * (-lumR) + sinA * (0.143)) * r
                  + (lumG + cosA * (1 - lumG) + sinA * (0.140)) * g
                  + (lumB + cosA * (-lumB) + sinA * (-0.283)) * b;
          const nb = (lumR + cosA * (-lumR) + sinA * (-(1 - lumR))) * r
                  + (lumG + cosA * (-lumG) + sinA * (lumG)) * g
                  + (lumB + cosA * (1 - lumB) + sinA * (lumB)) * b;
          r = nr; g = ng; b = nb; break;
        }
      }
      data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
    }
  }
  return data;
}

export function applyPixelFilter(imageData, filterId) {
  if (!filterId || filterId === "original") return imageData;
  const filter = FILTERS.find((f) => f.id === filterId);
  if (!filter || !filter.ops.length) return imageData;
  applyOps(imageData.data, filter.ops);
  return imageData;
}

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}
