/* =========================================================
   MomentoBooth — Moteur de filtres photobooth v4
   Looks photo légers + masques visage (icônes SVG travaillées)
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
  bunny:    `<svg viewBox="0 0 64 64"><path d="M15 35 Q8 18 13 5 Q16 0 21 7 L28 29" fill="#fff" stroke="#d8b7d0" stroke-width="2"/><path d="M49 35 Q56 18 51 5 Q48 0 43 7 L36 29" fill="#fff" stroke="#d8b7d0" stroke-width="2"/><path d="M17 29 Q13 16 17 9 Q19 7 21 12 L26 29" fill="#ffb6d9"/><path d="M47 29 Q51 16 47 9 Q45 7 43 12 L38 29" fill="#ffb6d9"/><path d="M23 38 Q32 30 41 38 Q42 49 32 54 Q22 49 23 38Z" fill="#fff" stroke="#d8b7d0" stroke-width="2"/><path d="M29 41 Q32 38 35 41 Q32 47 29 41Z" fill="#ff8fbd"/></svg>`,
  starry:    `<svg viewBox="0 0 64 64"><path d="M18 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM46 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff7a6"/><circle cx="18" cy="31" r="4" fill="#8fe8ff" opacity=".8"/><circle cx="46" cy="31" r="4" fill="#d9a7ff" opacity=".8"/></svg>`,
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
  bunny:     { name: "Lapin", icon: MASK_ICONS.bunny },
  starry:    { name: "Yeux étoilés", icon: MASK_ICONS.starry },
};

/* Les anciens profils CSSgram (1977, Aden, Brannan…) et l'ancien set "HOME"
   ont été remplacés par PRO_LOOKS ci-dessous. Leurs identifiants restent
   pris en charge via LEGACY_FILTER_ALIASES (préférences déjà enregistrées
   chez des utilisateurs), mais les anciennes définitions elles-mêmes ne
   sont plus utilisées : elles ont été retirées pour ne pas garder ~2 Ko
   de données mortes à chaque chargement. */

/*
 * Looks Momento — sélection courte et cohérente.
 *
 * Les anciens filtres CSSgram étaient nombreux mais assez interchangeables.
 * Ces looks combinent une base CSS rapide pour la vidéo, les mêmes opérations
 * pour l'export, puis une finition légère (teinte/vignette/grain). Les valeurs
 * restent volontairement modérées : les visages gardent des tons naturels.
 */
const PRO_LOOKS = [
  { id: "original", name: "Original", css: "none", ops: [], overlay: null },
  { id: "studio", name: "Studio", css: "contrast(1.08) saturate(1.08) brightness(1.03)", ops: [["contrast",1.08],["saturate",1.08],["brightness",1.03]], overlay: { vignette: .08 } },
  { id: "clean", name: "Clean", css: "contrast(1.04) saturate(1.06) brightness(1.05)", ops: [["contrast",1.04],["saturate",1.06],["brightness",1.05],["tint",[255,255,255,.025]]], overlay: { tint: "rgba(255,255,255,.025)" } },
  { id: "golden", name: "Golden Hour", css: "brightness(1.06) contrast(1.05) saturate(1.16) sepia(.1)", ops: [["brightness",1.06],["contrast",1.05],["saturate",1.16],["sepia",.1],["tint",[255,166,64,.1]],["vignette",.14]], overlay: { tint: "rgba(255,166,64,.1)", vignette: .14 } },
  { id: "rose", name: "Rose", css: "brightness(1.04) contrast(1.04) saturate(1.12) hue-rotate(-7deg)", ops: [["brightness",1.04],["contrast",1.04],["saturate",1.12],["hueRotate",-7],["tint",[255,66,145,.08]],["vignette",.1]], overlay: { tint: "rgba(255,66,145,.08)", vignette: .1 } },
  { id: "ice", name: "Ice", css: "brightness(1.04) contrast(1.08) saturate(1.08) hue-rotate(8deg)", ops: [["brightness",1.04],["contrast",1.08],["saturate",1.08],["hueRotate",8],["tint",[88,196,255,.08]],["vignette",.12]], overlay: { tint: "rgba(88,196,255,.08)", vignette: .12 } },
  { id: "cinema", name: "Cinéma", css: "brightness(.98) contrast(1.14) saturate(1.06) sepia(.05)", ops: [["brightness",.98],["contrast",1.14],["saturate",1.06],["sepia",.05],["tint",[28,78,92,.08]],["vignette",.24]], overlay: { tint: "rgba(28,78,92,.08)", vignette: .24 } },
  { id: "film", name: "Film", css: "brightness(1.03) contrast(1.08) saturate(.9) sepia(.1)", ops: [["brightness",1.03],["contrast",1.08],["saturate",.9],["sepia",.1],["tint",[214,158,92,.06]],["vignette",.22],["grain",.016]], overlay: { tint: "rgba(214,158,92,.06)", vignette: .22, grain: .08 } },
  { id: "soft", name: "Soft", css: "brightness(1.08) contrast(.93) saturate(1.03)", ops: [["brightness",1.08],["contrast",.93],["saturate",1.03],["tint",[255,190,208,.05]]], overlay: { tint: "rgba(255,190,208,.05)" } },
  { id: "barbie", name: "Barbie", css: "brightness(1.05) contrast(1.07) saturate(1.28) hue-rotate(-8deg)", ops: [["brightness",1.05],["contrast",1.07],["saturate",1.28],["hueRotate",-8],["tint",[255,52,148,.11]],["vignette",.14]], overlay: { tint: "rgba(255,52,148,.11)", vignette: .14 } },
  { id: "party", name: "Party", css: "brightness(1.04) contrast(1.1) saturate(1.3)", ops: [["brightness",1.04],["contrast",1.1],["saturate",1.3],["tint",[255,72,170,.09]],["vignette",.2],["grain",.008]], overlay: { tint: "rgba(255,72,170,.09)", vignette: .2, grain: .045 } },
  { id: "mono", name: "N&B", css: "grayscale(1) contrast(1.12) brightness(1.04)", ops: [["grayscale"],["contrast",1.12],["brightness",1.04],["vignette",.2],["grain",.012]], overlay: { vignette: .2, grain: .06 } },
  { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.3) brightness(.96)", ops: [["grayscale"],["contrast",1.3],["brightness",.96],["vignette",.3],["grain",.01]], overlay: { vignette: .3, grain: .05 } },
];

export const FILTERS = [
  ...PRO_LOOKS.map((f) => ({ ...f, mask: "none", color: true })),
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
  { id: "bunny",      name: "Lapin",            css: "brightness(1.04) saturate(1.12)", ops: [["brightness",1.04],["saturate",1.12]], mask: "bunny",      color: false, icon: MASK_ICONS.bunny },
  { id: "starry",     name: "Yeux étoilés",     css: "brightness(1.03) saturate(1.16)", ops: [["brightness",1.03],["saturate",1.16]], mask: "starry",     color: false, icon: MASK_ICONS.starry },
  // Effets 3D (expérimental — policy: requireCanvasFallback, requireRealDeviceValidation).
  // Le mask préfixé "3d:" est intercepté par masks.js (drawMask) et draw3DEffect dans effects-3d.js.
  // Si three.js / WebGL indisponible, fallback silencieux sur le canvas du mask.
  { id: "noelcap-3d",      name: "Casquette NoelCap 3D ★",      css: "none", ops: [], mask: "3d:noelcap-3d",      color: false, icon: MASK_ICONS.crown,     experimental: true, fallback: "crown" },
  { id: "glasses-3d",      name: "Lunettes MindAR 3D ★",        css: "none", ops: [], mask: "3d:glasses-3d",      color: false, icon: MASK_ICONS.glasses,    experimental: true, fallback: "glasses" },
  { id: "glasses-3d-rose", name: "Lunettes MindAR 3D rose/cyan ★", css: "none", ops: [], mask: "3d:glasses-3d-rose", color: false, icon: MASK_ICONS.glasses,    experimental: true, fallback: "glasses" },
];

/* Compatibilité : les anciennes préférences restent valides, mais pointent
   vers un look Momento actuel au lieu de disparaître silencieusement. */
const LEGACY_FILTER_ALIASES = {
  "1977": "party", aden: "soft", brannan: "film", brooklyn: "clean", clarendon: "studio",
  earlybird: "film", gingham: "soft", hudson: "ice", inkwell: "mono", lark: "clean",
  lofi: "cinema", maven: "rose", mayfair: "studio", moon: "mono", nashville: "golden",
  reyes: "soft", rise: "golden", slumber: "soft", stinson: "soft", toaster: "cinema",
  valencia: "golden", walden: "golden", willow: "mono", xpro2: "cinema",
  vivid: "studio", warm: "golden", vintage: "film", neon: "party", glow: "clean",
  dream: "soft", polaroid: "film", sun: "golden", dusk: "cinema", "noir+": "noir",
};

export function filterById(id) {
  const resolved = LEGACY_FILTER_ALIASES[id] || id;
  return FILTERS.find((f) => f.id === resolved) ?? FILTERS[0];
}

/* ---------- Opérations pixel (capture) ---------- */
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function applyOps(data, ops, width = 0, height = 0) {
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
        case "tint": {
          if (Array.isArray(amount)) {
            const tr = Number(amount[0]) || 0, tg = Number(amount[1]) || 0, tb = Number(amount[2]) || 0;
            const alpha = Math.max(0, Math.min(1, Number(amount[3]) || 0));
            r = r * (1 - alpha) + tr * alpha;
            g = g * (1 - alpha) + tg * alpha;
            b = b * (1 - alpha) + tb * alpha;
          }
          break;
        }
        case "vignette": {
          if (width > 0 && height > 0) {
            const x = (i / 4) % width, y = Math.floor((i / 4) / width);
            const dx = (x - width / 2) / (width / 2), dy = (y - height / 2) / (height / 2);
            const edge = Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) * .72));
            const strength = Math.max(0, Math.min(.8, amount ?? .2));
            const factor = 1 - strength * edge * edge;
            r *= factor; g *= factor; b *= factor;
          }
          break;
        }
        case "grain": {
          const amountByte = Math.max(0, Math.min(24, (amount ?? .01) * 255));
          const noise = (Math.random() - .5) * amountByte;
          r += noise; g += noise; b += noise;
          break;
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
  applyOps(imageData.data, filter.ops, imageData.width, imageData.height);
  return imageData;
}
