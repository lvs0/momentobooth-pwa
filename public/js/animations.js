/* =========================================================
   MomentoBooth — Animations vectorielles légères
   Pas d'emoji géants : formes canvas nettes, palettes cohérentes,
   un seul rAF partagé et arrêt complet quand l'animation est retirée.
   ========================================================= */

export const ANIMATIONS = [
  { id: "none", name: "Aucune", icon: "✕" },
  { id: "balloons", name: "Ballons", icon: "🎈" },
  { id: "confetti", name: "Confettis", icon: "🎉" },
  { id: "hearts", name: "Cœurs", icon: "❤️" },
  { id: "stars", name: "Étoiles", icon: "✨" },
  { id: "petals", name: "Pétales", icon: "🌸" },
  { id: "bubbles", name: "Bulles", icon: "🫧" },
  { id: "sparkles", name: "Magie", icon: "🪄" },
  { id: "snow", name: "Neige", icon: "❄️" },
];

export function animationById(id) {
  return ANIMATIONS.find((a) => a.id === id) ?? null;
}

const CONFIG = {
  balloons: { count: 12, kind: "balloon", vy: -0.18, sway: 0.7, size: 0.07, palette: ["#ff668c", "#65c9ff", "#ffd166", "#b58cff"] },
  confetti: { count: 28, kind: "confetti", vy: 0.34, sway: 1.1, size: 0.032, palette: ["#ff668c", "#ffd166", "#65c9ff", "#7ee2a8"] },
  hearts: { count: 12, kind: "heart", vy: -0.22, sway: 0.65, size: 0.065, palette: ["#ff5f86", "#ff9eb5", "#f7c5ff"] },
  stars: { count: 18, kind: "star", vy: -0.16, sway: 0.8, size: 0.045, palette: ["#fff0a8", "#9fe7ff", "#d4b5ff"] },
  petals: { count: 16, kind: "petal", vy: 0.18, sway: 1.3, size: 0.045, palette: ["#ff9fc4", "#ffc8df", "#d7a7ff"] },
  bubbles: { count: 12, kind: "bubble", vy: -0.28, sway: 0.45, size: 0.05, palette: ["#a9e9ff", "#d2c1ff", "#ffffff"] },
  sparkles: { count: 20, kind: "spark", vy: -0.14, sway: 0.4, size: 0.028, palette: ["#fff7ae", "#bde9ff", "#e4c9ff", "#aef7d4"] },
  snow: { count: 26, kind: "snow", vy: 0.12, sway: 0.55, size: 0.02, palette: ["#ffffff", "#e8f4ff", "#d4e8ff"] },
};

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}
function drawHeart(ctx, x, y, s, color) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .35);
  ctx.bezierCurveTo(x - s * 1.05, y - s * .25, x - s * .72, y - s * 1.05, x, y - s * .42);
  ctx.bezierCurveTo(x + s * .72, y - s * 1.05, x + s * 1.05, y - s * .25, x, y + s * .35);
  ctx.fillStyle = color; ctx.fill();
}
function drawStar(ctx, x, y, s, color) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? s * .42 : s;
    points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  polygon(ctx, points); ctx.fillStyle = color; ctx.fill();
}
function drawParticle(ctx, p, cfg, W, H) {
  const s = Math.max(10, Math.min(W, H) * p.s);
  const color = cfg.palette[p.colorIndex % cfg.palette.length];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = p.alpha;
  // Dégradé + highlight : donne du volume sans image lourde ni WebGL.
  const volume = ctx.createRadialGradient(-s * .22, -s * .28, s * .05, 0, 0, s * 1.1);
  volume.addColorStop(0, "rgba(255,255,255,.72)");
  volume.addColorStop(.18, color);
  volume.addColorStop(1, "rgba(0,0,0,.28)");
  if (cfg.kind === "balloon") {
    ctx.fillStyle = volume; ctx.beginPath(); ctx.ellipse(0, 0, s * .58, s * .78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = Math.max(1, s * .07); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, s * .75); ctx.quadraticCurveTo(s * .2, s * 1.2, 0, s * 1.65); ctx.stroke();
  } else if (cfg.kind === "confetti") {
    ctx.fillStyle = volume; ctx.fillRect(-s * .34, -s * .12, s * .68, s * .24);
    ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = Math.max(1, s * .05); ctx.strokeRect(-s * .34, -s * .12, s * .68, s * .24);
  } else if (cfg.kind === "heart") { ctx.fillStyle = volume; drawHeart(ctx, 0, 0, s, volume); }
  else if (cfg.kind === "star") {
    // Scintillement doux : l'alpha varie avec la phase de chaque étoile.
    ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.phase * 1.8));
    ctx.fillStyle = volume; drawStar(ctx, 0, 0, s, volume);
  }
  else if (cfg.kind === "petal") { ctx.fillStyle = volume; ctx.beginPath(); ctx.ellipse(0, 0, s * .42, s, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (cfg.kind === "bubble") { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, s * .09); ctx.beginPath(); ctx.arc(0, 0, s * .65, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(-s * .2, -s * .2, s * .12, 0, Math.PI * 2); ctx.fill(); }
  else if (cfg.kind === "spark") {
    // Poussière magique : étoile 4 branches qui pulse en montant.
    const tw = .55 + .45 * Math.sin(p.phase * 2.4);
    ctx.globalAlpha = p.alpha * tw;
    ctx.fillStyle = color;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const r = i % 2 ? s * .18 : s;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    polygon(ctx, pts); ctx.fill();
  }
  else if (cfg.kind === "snow") {
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.beginPath(); ctx.arc(0, 0, s * .5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath(); ctx.arc(-s * .16, -s * .16, s * .16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export class AnimationEngine {
  constructor(id, W, H) {
    this.id = id; this.W = W; this.H = H; this.last = performance.now(); this.cfg = CONFIG[id]; this.particles = [];
    this.seed();
  }
  seed() {
    if (!this.cfg) return;
    this.particles = Array.from({ length: this.cfg.count }, (_, i) => ({
      x: Math.random() * this.W, y: Math.random() * this.H,
      s: this.cfg.size * (.72 + Math.random() * .56),
      phase: Math.random() * Math.PI * 2, speed: .5 + Math.random() * 1.1,
      rotation: Math.random() * Math.PI, rotationSpeed: (Math.random() - .5) * 1.2,
      alpha: .5 + Math.random() * .38, colorIndex: i,
    }));
  }
  step() {
    const now = performance.now();
    const dt = Math.min(.04, (now - this.last) / 1000); this.last = now;
    if (!this.cfg) return;
    for (const p of this.particles) {
      p.phase += dt * this.cfg.sway * p.speed;
      p.y += this.cfg.vy * dt * 60;
      p.x += Math.sin(p.phase) * dt * 22;
      p.rotation += p.rotationSpeed * dt;
      if (p.y < -80) { p.y = this.H + 50; p.x = Math.random() * this.W; }
      if (p.y > this.H + 80) { p.y = -50; p.x = Math.random() * this.W; }
    }
  }
  draw(ctx, W, H) {
    if (!this.cfg) return;
    for (const p of this.particles) drawParticle(ctx, p, this.cfg, W, H);
  }
  drawStatic(ctx, W, H) {
    if (!this.cfg) return;
    const old = this.particles;
    this.particles = Array.from({ length: this.cfg.count }, (_, i) => ({
      x: ((i * 137.5) % 100) / 100 * W, y: ((i * 61.8) % 100) / 100 * H,
      s: this.cfg.size * (.75 + (i % 5) * .08), phase: i, speed: 1,
      rotation: (i % 7) * .4, rotationSpeed: 0, alpha: .7, colorIndex: i,
    }));
    for (const p of this.particles) drawParticle(ctx, p, this.cfg, W, H);
    this.particles = old;
  }
}

let _engine = null;
let _rafId = null;
let _drawHook = null;
let _lastLoopAt = 0;
// Les effets décoratifs ne doivent jamais suivre 60/120 Hz : 15 fps suffit
// pour un rendu fluide sur une borne et évite de chauffer l'iPhone.
const ANIMATION_INTERVAL_MS = 66;
function loop(now = performance.now()) {
  _rafId = requestAnimationFrame(loop);
  if (!_engine || !_drawHook || now - _lastLoopAt < ANIMATION_INTERVAL_MS) return;
  _lastLoopAt = now;
  _engine.step();
  _drawHook(_engine);
}
export function startAnimation(id, drawHook) {
  stopAnimation();
  if (!CONFIG[id]) return null;
  _engine = new AnimationEngine(id, window.innerWidth, window.innerHeight);
  _drawHook = drawHook || null;
  _lastLoopAt = 0;
  _rafId = requestAnimationFrame(loop);
  return _engine;
}
export function stopAnimation() {
  _engine = null; _drawHook = null;
  _lastLoopAt = 0;
  if (_rafId != null) cancelAnimationFrame(_rafId);
  _rafId = null;
}
export function isAnimationRunning() { return Boolean(_engine); }
