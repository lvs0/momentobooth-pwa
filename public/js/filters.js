/* =========================================================
   MomentoBooth — Moteur de filtres photobooth
   Chaque filtre = couleur (css/ops) + masque optionnel (mask)
   Masques : dessinés sur le visage via MediaPipe landmarks
   ========================================================= */

export const MASKS = {
  none:      { name: "Aucun", emoji: "" },
  crown:     { name: "La Reine", emoji: "👑" },
  glasses:   { name: "Lunettes", emoji: "🕶️" },
  poopin:    { name: "Caca", emoji: "💩" },
  cowboy:    { name: "Cowboy", emoji: "🤠" },
  copin:     { name: "Copin", emoji: "😎" },
  copine:    { name: "Copine", emoji: "💋" },
  family:    { name: "Famille Verpoort", emoji: "👨‍👩‍👧‍👦" },
  mustache:  { name: "Moustache", emoji: "👨‍🦰" },
  halo:      { name: "Ange", emoji: "😇" },
};

export const FILTERS = [
  { id: "original",  name: "Original",  css: "none", ops: [], mask: "none" },
  { id: "mono",      name: "N&B",       css: "grayscale(1) contrast(1.05)", ops: [["grayscale"],["contrast",1.05]], mask: "none" },
  { id: "vivid",     name: "Vif",       css: "saturate(1.6) contrast(1.12)", ops: [["saturate",1.6],["contrast",1.12]], mask: "none" },
  { id: "warm",      name: "Chaud",     css: "sepia(.28) saturate(1.35) hue-rotate(-12deg) brightness(1.05)", ops: [["sepia",.28],["saturate",1.35],["hueRotate",-12],["brightness",1.05]], mask: "none" },
  { id: "vintage",   name: "Vintage",   css: "sepia(.5) contrast(.92) brightness(1.06) saturate(.85)", ops: [["sepia",.5],["contrast",.92],["brightness",1.06],["saturate",.85]], mask: "none" },
  { id: "noir",      name: "Noir+",     css: "brightness(.72) contrast(1.45) saturate(.55)", ops: [["brightness",.72],["contrast",1.45],["saturate",.55]], mask: "none" },
  { id: "neon",      name: "Néon",      css: "hue-rotate(85deg) saturate(1.8) contrast(1.05)", ops: [["hueRotate",85],["saturate",1.8],["contrast",1.05]], mask: "none" },
  { id: "soft",      name: "Douce",     css: "brightness(1.08) contrast(.9) saturate(1.05)", ops: [["brightness",1.08],["contrast",.9],["saturate",1.05]], mask: "none" },

  // ─── Masques photobooth (filtre couleur + masque visage) ───
  { id: "crown",     name: "La Reine",          css: "saturate(1.2) brightness(1.05)", ops: [["saturate",1.2],["brightness",1.05]], mask: "crown" },
  { id: "glasses",   name: "Lunettes",          css: "none", ops: [], mask: "glasses" },
  { id: "poopin",    name: "Tête de caca",      css: "saturate(.8) brightness(1.02)", ops: [["saturate",.8],["brightness",1.02]], mask: "poopin" },
  { id: "cowboy",    name: "Cowboy",            css: "sepia(.15) contrast(1.05)", ops: [["sepia",.15],["contrast",1.05]], mask: "cowboy" },
  { id: "copin",     name: "Copin",             css: "saturate(1.3) contrast(1.08)", ops: [["saturate",1.3],["contrast",1.08]], mask: "copin" },
  { id: "copine",    name: "Copine",            css: "sepia(.1) saturate(1.25) brightness(1.05)", ops: [["sepia",.1],["saturate",1.25],["brightness",1.05]], mask: "copine" },
  { id: "family",    name: "Famille Verpoort",  css: "saturate(1.15) brightness(1.03)", ops: [["saturate",1.15],["brightness",1.03]], mask: "family" },
  { id: "mustache",  name: "Moustache",         css: "sepia(.12)", ops: [["sepia",.12]], mask: "mustache" },
  { id: "halo",      name: "Ange",              css: "brightness(1.1) saturate(1.1)", ops: [["brightness",1.1],["saturate",1.1]], mask: "halo" },
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
