/* =========================================================
   MomentoBooth — Moteur de filtres photobooth v4
   Couleurs CSSgram + masques visage (icônes SVG travaillées)
   ========================================================= */

/* Icônes SVG des masques (data-URI, style travaillé) */
export const MASK_ICONS = {
  crown:    `<svg viewBox="0 0 64 64"><path d="M8 44 L12 20 L24 30 L32 14 L40 30 L52 20 L56 44 Z" fill="url(#g1)" stroke="#8a5a00" stroke-width="2"/><circle cx="32" cy="14" r="5" fill="#ffd700"/><circle cx="18" cy="34" r="3.5" fill="#ff5252"/><circle cx="46" cy="34" r="3.5" fill="#40c4ff"/><rect x="6" y="46" width="52" height="8" rx="3" fill="#d4af37"/><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#d4af37"/></linearGradient></defs></svg>`,
  glasses:  `<svg viewBox="0 0 64 64"><path d="M14 30 Q16 22 28 24" stroke="#222" stroke-width="4" fill="none"/><path d="M50 30 Q48 22 36 24" stroke="#222" stroke-width="4" fill="none"/><rect x="10" y="28" width="20" height="14" rx="6" fill="rgba(30,30,40,.85)" stroke="#111" stroke-width="2.5"/><rect x="34" y="28" width="20" height="14" rx="6" fill="rgba(30,30,40,.85)" stroke="#111" stroke-width="2.5"/><rect x="30" y="33" width="4" height="4" rx="2" fill="#555"/><path d="M32 35 h6 M34 33 v6" stroke="#8a5a00" stroke-width="1.5"/></svg>`,
  poopin:   `<svg viewBox="0 0 64 64"><path d="M34 10 Q40 6 40 12 Q46 8 46 15 Q52 14 50 21 Q56 24 52 30 Q58 34 52 38 Q54 46 46 46 L20 46 Q12 46 13 37 Q8 32 13 28 Q10 21 17 20 Q16 12 24 14 Q26 8 34 10 Z" fill="url(#p1)"/><ellipse cx="26" cy="31" rx="2.6" ry="4.2" fill="#4a2c10"/><ellipse cx="40" cy="31" rx="2.6" ry="4.2" fill="#4a2c10"/><path d="M29 39 Q32 42 36 39" stroke="#4a2c10" stroke-width="2.4" fill="none" stroke-linecap="round"/><defs><radialGradient id="p1"><stop offset="0" stop-color="#8a5a2b"/><stop offset="1" stop-color="#5c3a17"/></radialGradient></defs></svg>`,
  cowboy:   `<svg viewBox="0 0 64 64"><path d="M10 30 Q8 18 20 14 Q32 8 44 14 Q56 18 54 30 L48 28 L42 20 L32 26 L22 20 L16 28 Z" fill="#7a4a21" stroke="#4a2c10" stroke-width="2"/><path d="M8 28 L16 30 L24 26 L32 30 L40 26 L48 30 L56 28 L54 34 L46 32 L32 36 L18 32 L10 34 Z" fill="#9c5f2c"/><path d="M28 8 Q32 2 36 8" stroke="#4a2c10" stroke-width="3" fill="none"/><circle cx="10" cy="28" r="2.4" fill="#c9a227"/><circle cx="54" cy="28" r="2.4" fill="#c9a227"/></svg>`,
  copin:    `<svg viewBox="0 0 64 64"><path d="M12 26 Q32 14 52 26 L50 42 Q32 50 14 42 Z" fill="rgba(20,20,30,.92)" stroke="#111" stroke-width="2.5"/><path d="M8 26 L12 40 Q12 44 18 44 Q20 46 22 44 L30 42 L34 42 L42 44 Q44 46 46 44 Q52 44 52 40 L56 26" stroke="#111" stroke-width="2.5" fill="none"/><ellipse cx="24" cy="32" rx="3" ry="2" fill="#e0e0e0" opacity=".85"/><ellipse cx="40" cy="32" rx="3" ry="2" fill="#e0e0e0" opacity=".85"/><path d="M22 38 Q32 44 42 38" stroke="#7a4a21" stroke-width="2.5" fill="none"/></svg>`,
  copine:   `<svg viewBox="0 0 64 64"><path d="M20 30 Q32 22 44 30 Q52 36 48 44 Q42 54 32 54 Q22 54 16 44 Q12 36 20 30 Z" fill="#ff2d78" stroke="#b00048" stroke-width="2"/><path d="M24 32 Q32 40 40 32" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/><path d="M22 40 Q28 46 34 42 Q38 39 42 42" stroke="#fff" stroke-width="2" fill="none" opacity=".5"/><circle cx="20" cy="26" r="3" fill="#ff7ab8"/></svg>`,
  family:   `<svg viewBox="0 0 64 64"><circle cx="22" cy="26" r="9" fill="#ffd54f" stroke="#8a6d1a" stroke-width="2"/><path d="M10 52 Q10 40 22 40 Q34 40 34 52 Z" fill="#5c8a3a"/><circle cx="42" cy="26" r="7" fill="#a5d6ff" stroke="#1a5c8a" stroke-width="2"/><path d="M34 52 Q34 42 42 42 Q50 42 50 52 Z" fill="#3a7a5c"/><circle cx="32" cy="20" r="5" fill="#ffb74d"/><circle cx="20" cy="22" r="1.6" fill="#333"/><circle cx="24" cy="22" r="1.6" fill="#333"/><path d="M20 27 Q22 29 24 27" stroke="#333" stroke-width="1.4" fill="none"/></svg>`,
  mustache: `<svg viewBox="0 0 64 64"><path d="M12 30 Q22 24 32 32 Q42 24 52 30 Q56 34 52 38 Q44 42 32 36 Q20 42 12 38 Q8 34 12 30 Z" fill="#4a2c10" stroke="#2a1806" stroke-width="2"/><path d="M16 32 Q32 28 48 32" stroke="#5c3a17" stroke-width="2" fill="none"/></svg>`,
  halo:     `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="14" rx="16" ry="5.5" fill="none" stroke="#ffe082" stroke-width="4" opacity=".95"/><circle cx="22" cy="14" r="2" fill="#ffe082"/><circle cx="32" cy="10" r="2" fill="#fff59d"/><circle cx="42" cy="14" r="2" fill="#ffe082"/><path d="M28 14 L32 17 L36 14 L32 11 Z" fill="#fff8e1" opacity=".6"/></svg>`,
  cat:      `<svg viewBox="0 0 64 64"><path d="M10 34 L18 8 L30 30 Z" fill="#3a2b3f" stroke="#20142a" stroke-width="2"/><path d="M14 28 L18 16 L24 26 Z" fill="#f6a5c0"/><path d="M54 34 L46 8 L34 30 Z" fill="#3a2b3f" stroke="#20142a" stroke-width="2"/><path d="M50 28 L46 16 L40 26 Z" fill="#f6a5c0"/><path d="M16 36 L32 44 L48 36 L48 40 L32 52 L16 40 Z" fill="#f6a5c0" opacity=".9"/></svg>`,
  bear:     `<svg viewBox="0 0 64 64"><circle cx="16" cy="14" r="10" fill="#7a5230" stroke="#4a2e14" stroke-width="2"/><circle cx="16" cy="14" r="5" fill="#e8b98a"/><circle cx="48" cy="14" r="10" fill="#7a5230" stroke="#4a2e14" stroke-width="2"/><circle cx="48" cy="14" r="5" fill="#e8b98a"/><path d="M12 34 Q32 46 52 34 Q54 44 50 50 Q40 58 32 58 Q24 58 14 50 Q10 44 12 34 Z" fill="#8a5f35"/><circle cx="24" cy="42" r="2.4" fill="#221100"/><circle cx="40" cy="42" r="2.4" fill="#221100"/><ellipse cx="32" cy="48" rx="5" ry="3.4" fill="#221100"/></svg>`,
  catnose:  `<svg viewBox="0 0 64 64"><path d="M22 30 L32 42 L42 30 Z" fill="#e8799f"/><path d="M18 28 L26 30 M20 34 L30 34" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/><path d="M46 28 L38 30 M44 34 L34 34" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/><circle cx="30" cy="22" r="1.8" fill="#fff"/><circle cx="34" cy="22" r="1.8" fill="#fff"/></svg>`,
  horns:    `<svg viewBox="0 0 64 64"><path d="M14 30 Q4 16 8 4 Q18 8 20 22 Z" fill="#b3242a" stroke="#5a0d12" stroke-width="2"/><path d="M50 30 Q60 16 56 4 Q46 8 44 22 Z" fill="#b3242a" stroke="#5a0d12" stroke-width="2"/></svg>`,
  antennas: `<svg viewBox="0 0 64 64"><path d="M20 34 Q14 20 18 10" stroke="#2b6a4e" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="18" cy="10" r="5" fill="#ffd166" stroke="#b8860b" stroke-width="1.5"/><path d="M44 34 Q50 20 46 10" stroke="#2b6a4e" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="46" cy="10" r="5" fill="#ffd166" stroke="#b8860b" stroke-width="1.5"/></svg>`,
};

export const MASKS = {
  none:      { name: "Aucun", icon: "" },
  crown:     { name: "La Reine", icon: MASK_ICONS.crown },
  glasses:   { name: "Lunettes", icon: MASK_ICONS.glasses },
  poopin:    { name: "Caca", icon: MASK_ICONS.poopin },
  cowboy:    { name: "Cowboy", icon: MASK_ICONS.cowboy },
  copin:     { name: "Copin", icon: MASK_ICONS.copin },
  copine:    { name: "Copine", icon: MASK_ICONS.copine },
  family:    { name: "Famille Verpoort", icon: MASK_ICONS.family },
  mustache:  { name: "Moustache", icon: MASK_ICONS.mustache },
  halo:      { name: "Ange", icon: MASK_ICONS.halo },
  cat:       { name: "Oreilles de chat", icon: MASK_ICONS.cat },
  bear:      { name: "Oreilles d'ours", icon: MASK_ICONS.bear },
  catnose:   { name: "Museau chat", icon: MASK_ICONS.catnose },
  horns:     { name: "Cornes", icon: MASK_ICONS.horns },
  antennas:  { name: "Antennes", icon: MASK_ICONS.antennas },
};

/* ─── 24 filtres CSSgram (MIT) + 8 maison ─── */
const CSSGRAM = {
  "1977":     { css: "contrast(1.1) brightness(1.1) saturate(1.3)", ops: [["contrast",1.1],["brightness",1.1],["saturate",1.3]] },
  aden:       { css: "hue-rotate(-20deg) contrast(.9) saturate(.85) brightness(1.2)", ops: [["hueRotate",-20],["contrast",.9],["saturate",.85],["brightness",1.2]] },
  brannan:    { css: "sepia(.5) contrast(1.4)", ops: [["sepia",.5],["contrast",1.4]] },
  brooklyn:   { css: "contrast(.9) brightness(1.1)", ops: [["contrast",.9],["brightness",1.1]] },
  clarendon:  { css: "contrast(1.2) saturate(1.35)", ops: [["contrast",1.2],["saturate",1.35]] },
  earlybird:  { css: "contrast(.9) sepia(.2)", ops: [["contrast",.9],["sepia",.2]] },
  gingham:    { css: "brightness(1.05) hue-rotate(-10deg)", ops: [["brightness",1.05],["hueRotate",-10]] },
  hudson:     { css: "brightness(1.2) contrast(.9) saturate(1.1)", ops: [["brightness",1.2],["contrast",.9],["saturate",1.1]] },
  inkwell:    { css: "sepia(.3) contrast(1.1) brightness(1.1) grayscale(1)", ops: [["sepia",.3],["contrast",1.1],["brightness",1.1],["grayscale"]] },
  lark:       { css: "contrast(.9)", ops: [["contrast",.9]] },
  lofi:       { css: "saturate(1.1) contrast(1.5)", ops: [["saturate",1.1],["contrast",1.5]] },
  maven:      { css: "sepia(.25) brightness(.95) contrast(.95) saturate(1.5)", ops: [["sepia",.25],["brightness",.95],["contrast",.95],["saturate",1.5]] },
  mayfair:    { css: "contrast(1.1) saturate(1.1)", ops: [["contrast",1.1],["saturate",1.1]] },
  moon:       { css: "grayscale(1) contrast(1.1) brightness(1.1)", ops: [["grayscale"],["contrast",1.1],["brightness",1.1]] },
  nashville:  { css: "sepia(.2) contrast(1.2) brightness(1.05) saturate(1.2)", ops: [["sepia",.2],["contrast",1.2],["brightness",1.05],["saturate",1.2]] },
  reyes:      { css: "sepia(.22) brightness(1.1) contrast(.85) saturate(.75)", ops: [["sepia",.22],["brightness",1.1],["contrast",.85],["saturate",.75]] },
  rise:       { css: "brightness(1.05) sepia(.2) contrast(.9) saturate(.9)", ops: [["brightness",1.05],["sepia",.2],["contrast",.9],["saturate",.9]] },
  slumber:    { css: "saturate(.66) brightness(1.05)", ops: [["saturate",.66],["brightness",1.05]] },
  stinson:    { css: "contrast(.75) saturate(.85) brightness(1.15)", ops: [["contrast",.75],["saturate",.85],["brightness",1.15]] },
  toaster:    { css: "contrast(1.5) brightness(.9)", ops: [["contrast",1.5],["brightness",.9]] },
  valencia:   { css: "contrast(1.08) brightness(1.08) sepia(.08)", ops: [["contrast",1.08],["brightness",1.08],["sepia",.08]] },
  walden:     { css: "brightness(1.1) hue-rotate(-10deg) sepia(.3) saturate(1.6)", ops: [["brightness",1.1],["hueRotate",-10],["sepia",.3],["saturate",1.6]] },
  willow:     { css: "grayscale(.5) contrast(.95) brightness(.9)", ops: [["grayscaleHalf"],["contrast",.95],["brightness",.9]] },
  xpro2:      { css: "sepia(.3)", ops: [["sepia",.3]] },
};
const CSSGRAM_NAMES = { "1977":"1977", aden:"Aden", brannan:"Brannan", brooklyn:"Brooklyn", clarendon:"Clarendon", earlybird:"Earlybird", gingham:"Gingham", hudson:"Hudson", inkwell:"Inkwell", lark:"Lark", lofi:"Lo-Fi", maven:"Maven", mayfair:"Mayfair", moon:"Moon", nashville:"Nashville", reyes:"Reyes", rise:"Rise", slumber:"Slumber", stinson:"Stinson", toaster:"Toaster", valencia:"Valencia", walden:"Walden", willow:"Willow", xpro2:"X-Pro II" };

const HOME = {
  original: { name: "Original", css: "none", ops: [] },
  mono:     { name: "N&B", css: "grayscale(1) contrast(1.05)", ops: [["grayscale"],["contrast",1.05]] },
  vivid:    { name: "Vif", css: "saturate(1.6) contrast(1.12) brightness(1.02)", ops: [["saturate",1.6],["contrast",1.12],["brightness",1.02]] },
  warm:     { name: "Chaud", css: "sepia(.28) saturate(1.35) hue-rotate(-12deg) brightness(1.05)", ops: [["sepia",.28],["saturate",1.35],["hueRotate",-12],["brightness",1.05]] },
  vintage:  { name: "Vintage", css: "sepia(.5) contrast(.92) brightness(1.06) saturate(.85)", ops: [["sepia",.5],["contrast",.92],["brightness",1.06],["saturate",.85]] },
  noir:     { name: "Noir+", css: "brightness(.72) contrast(1.45) saturate(.55)", ops: [["brightness",.72],["contrast",1.45],["saturate",.55]] },
  neon:     { name: "Néon", css: "hue-rotate(85deg) saturate(1.8) contrast(1.05)", ops: [["hueRotate",85],["saturate",1.8],["contrast",1.05]] },
  soft:     { name: "Douce", css: "brightness(1.08) contrast(.9) saturate(1.05)", ops: [["brightness",1.08],["contrast",.9],["saturate",1.05]] },
  glow:     { name: "Glow", css: "brightness(1.15) contrast(1.08) saturate(1.2)", ops: [["brightness",1.15],["contrast",1.08],["saturate",1.2]] },
  dream:    { name: "Dream", css: "brightness(1.25) contrast(.85) saturate(.9) blur(0.5px)", ops: [["brightness",1.25],["contrast",.85],["saturate",.9]] },
  cinema:   { name: "Cinema", css: "contrast(1.3) saturate(1.4) brightness(.95)", ops: [["contrast",1.3],["saturate",1.4],["brightness",.95]] },
  polaroid: { name: "Polaroid", css: "sepia(.35) contrast(1.12) brightness(1.08) saturate(.9)", ops: [["sepia",.35],["contrast",1.12],["brightness",1.08],["saturate",.9]] },
  sun:      { name: "Soleil", css: "brightness(1.2) saturate(1.5) hue-rotate(15deg)", ops: [["brightness",1.2],["saturate",1.5],["hueRotate",15]] },
  dusk:     { name: "Crépuscule", css: "brightness(.85) contrast(1.15) sepia(.15) saturate(1.3)", ops: [["brightness",.85],["contrast",1.15],["sepia",.15],["saturate",1.3]] },
};

export const FILTERS = [
  ...Object.entries(HOME).map(([id, f]) => ({ id, name: f.name, css: f.css, ops: f.ops, mask: "none", color: true })),
  ...Object.entries(CSSGRAM).map(([id, f]) => ({ id, name: CSSGRAM_NAMES[id], css: f.css, ops: f.ops, mask: "none", color: true })),
  // Masques photobooth (icônes travaillées, pas de filtre couleur)
  { id: "crown",     name: "La Reine",         css: "saturate(1.15) brightness(1.05)", ops: [["saturate",1.15],["brightness",1.05]], mask: "crown",     color: false, icon: MASK_ICONS.crown },
  { id: "glasses",   name: "Lunettes",         css: "none", ops: [], mask: "glasses",   color: false, icon: MASK_ICONS.glasses },
  { id: "poopin",    name: "Tête de caca",     css: "saturate(.8) brightness(1.02)", ops: [["saturate",.8],["brightness",1.02]], mask: "poopin",    color: false, icon: MASK_ICONS.poopin },
  { id: "cowboy",    name: "Cowboy",           css: "sepia(.15) contrast(1.05)", ops: [["sepia",.15],["contrast",1.05]], mask: "cowboy",    color: false, icon: MASK_ICONS.cowboy },
  { id: "copin",     name: "Copin",            css: "saturate(1.3) contrast(1.08)", ops: [["saturate",1.3],["contrast",1.08]], mask: "copin",     color: false, icon: MASK_ICONS.copin },
  { id: "copine",    name: "Copine",           css: "sepia(.1) saturate(1.25) brightness(1.05)", ops: [["sepia",.1],["saturate",1.25],["brightness",1.05]], mask: "copine",    color: false, icon: MASK_ICONS.copine },
  { id: "family",    name: "Famille Verpoort", css: "saturate(1.15) brightness(1.03)", ops: [["saturate",1.15],["brightness",1.03]], mask: "family",    color: false, icon: MASK_ICONS.family },
  { id: "mustache",  name: "Moustache",        css: "sepia(.12)", ops: [["sepia",.12]], mask: "mustache",  color: false, icon: MASK_ICONS.mustache },
  { id: "halo",      name: "Ange",             css: "brightness(1.1) saturate(1.1)", ops: [["brightness",1.1],["saturate",1.1]], mask: "halo",      color: false, icon: MASK_ICONS.halo },
  { id: "cat",       name: "Oreilles de chat", css: "saturate(1.15)", ops: [["saturate",1.15]], mask: "cat",       color: false, icon: MASK_ICONS.cat },
  { id: "bear",      name: "Oreilles d'ours",  css: "saturate(1.1)", ops: [["saturate",1.1]], mask: "bear",      color: false, icon: MASK_ICONS.bear },
  { id: "catnose",   name: "Museau chat",      css: "saturate(1.2) brightness(1.03)", ops: [["saturate",1.2],["brightness",1.03]], mask: "catnose",   color: false, icon: MASK_ICONS.catnose },
  { id: "horns",     name: "Cornes",           css: "contrast(1.05)", ops: [["contrast",1.05]], mask: "horns",     color: false, icon: MASK_ICONS.horns },
  { id: "antennas",  name: "Antennes",         css: "saturate(1.1)", ops: [["saturate",1.1]], mask: "antennas",  color: false, icon: MASK_ICONS.antennas },
];

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

/* ---------- Opérations pixel (capture) ---------- */
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function applyOps(data, ops) {
  for (const [op, amount] of ops) {
    const n = data.length;
    for (let i = 0; i < n; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      switch (op) {
        case "grayscale": { const v = 0.299*r + 0.587*g + 0.114*b; r = g = b = v; break; }
        case "grayscaleHalf": { const v = 0.299*r + 0.587*g + 0.114*b; r = r*.5+v*.5; g = g*.5+v*.5; b = b*.5+v*.5; break; }
        case "sepia": {
          const nr = 0.393*r + 0.769*g + 0.189*b, ng = 0.349*r + 0.686*g + 0.168*b, nb = 0.272*r + 0.534*g + 0.131*b;
          const a = amount ?? .5;
          r = r + (nr - r)*a; g = g + (ng - g)*a; b = b + (nb - b)*a; break;
        }
        case "contrast": { const f = (c) => (c - 128) * (amount ?? 1) + 128; r = f(r); g = f(g); b = f(b); break; }
        case "brightness": { r *= amount ?? 1; g *= amount ?? 1; b *= amount ?? 1; break; }
        case "saturate": {
          const gray = 0.299*r + 0.587*g + 0.114*b, a = amount ?? 1;
          r = gray + (r - gray)*a; g = gray + (g - gray)*a; b = gray + (b - gray)*a; break;
        }
        case "hueRotate": {
          const deg = ((amount ?? 0) * Math.PI) / 180, c = Math.cos(deg), s = Math.sin(deg);
          const lumR = 0.213, lumG = 0.715, lumB = 0.072;
          const nr = (lumR + c*(1-lumR) + s*(-lumR))*r + (lumG + c*(-lumG) + s*(-lumG))*g + (lumB + c*(-lumB) + s*(1-lumB))*b;
          const ng = (lumR + c*(-lumR) + s*0.143)*r + (lumG + c*(1-lumG) + s*0.140)*g + (lumB + c*(-lumB) + s*(-0.283))*b;
          const nb = (lumR + c*(-lumR) + s*(-(1-lumR)))*r + (lumG + c*(-lumG) + s*lumG)*g + (lumB + c*(1-lumB) + s*lumB)*b;
          r = nr; g = ng; b = nb; break;
        }
      }
      data[i] = clamp(r); data[i+1] = clamp(g); data[i+2] = clamp(b);
    }
  }
  return data;
}

export function applyPixelFilter(imageData, filterId) {
  if (!filterId || filterId === "original") return imageData;
  const filter = filterById(filterId);
  if (!filter.ops.length) return imageData;
  applyOps(imageData.data, filter.ops);
  return imageData;
}
