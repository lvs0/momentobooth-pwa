/* =========================================================
   MomentoBooth — Animations overlay (catégorie « Animations »)
   Particules canvas 2D LÉGÈRES : ~24-40 particules max,
   un seul rAF partagé, zéro layout (que du canvas).
   ========================================================= */

export const ANIMATIONS = [
  { id: "balloons", name: "Ballons",  icon: "🎈" },
  { id: "confetti", name: "Confettis", icon: "🎉" },
  { id: "hearts",   name: "Cœurs",     icon: "❤️" },
  { id: "stars",    name: "Étoiles",   icon: "✨" },
  { id: "petals",   name: "Pétales",   icon: "🌸" },
  { id: "bubbles",  name: "Bulles",    icon: "🫧" },
];

export function animationById(id) {
  return ANIMATIONS.find((a) => a.id === id) ?? null;
}

/* ─── Moteur de particules ───
   Chaque animation = générateur de particules (émoticônes) qui montent
   doucement avec un léger balancement. Coût : ~30 particules, rAF unique. */
const CONFIG = {
  balloons: { count: 26, emoji: "🎈", vy: -0.35, sway: 0.9, size: 0.10, alpha: 0.95 },
  confetti: { count: 34, emoji: "🎉", vy: -0.30, sway: 1.2, size: 0.07, alpha: 0.9 },
  hearts:   { count: 22, emoji: "❤️", vy: -0.40, sway: 0.7, size: 0.06, alpha: 0.95 },
  stars:    { count: 26, emoji: "✨", vy: -0.25, sway: 1.0, size: 0.06, alpha: 0.95 },
  petals:   { count: 24, emoji: "🌸", vy: -0.28, sway: 1.4, size: 0.07, alpha: 0.9 },
  bubbles:  { count: 20, emoji: "🫧", vy: -0.45, sway: 0.5, size: 0.08, alpha: 0.85 },
};

export class AnimationEngine {
  constructor(id, W, H) {
    this.id = id;
    this.particles = [];
    this.W = W;
    this.H = H;
    this.last = performance.now();
    this.seed();
  }
  seed() {
    const cfg = CONFIG[this.id];
    if (!cfg) return;
    this.particles = [];
    for (let i = 0; i < cfg.count; i++) {
      this.particles.push({
        x: Math.random() * this.W,
        y: Math.random() * this.H,
        s: cfg.size * (0.7 + Math.random() * 0.7),
        ph: Math.random() * Math.PI * 2,
        sp: 0.5 + Math.random() * 1.2,
        a: cfg.alpha * (0.7 + Math.random() * 0.3),
      });
    }
    this.cfg = cfg;
  }
  /* Une étape : avance les particules (montée + balancement) */
  step() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.cfg) return;
    const { vy, sway } = this.cfg;
    for (const p of this.particles) {
      p.y += vy * dt * 60;
      p.x += Math.sin((p.ph += dt * sway)) * 0.6;
      if (p.y < -40) { // respawn en bas
        p.y = this.H + 40;
        p.x = Math.random() * this.W;
      }
      if (p.x < -40) p.x = this.W + 40;
      if (p.x > this.W + 40) p.x = -40;
    }
  }
  /* Dessine toutes les particules (émoticônes) sur le canvas */
  draw(ctx, W, H) {
    if (!this.cfg) return;
    const emoji = this.cfg.emoji;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.particles) {
      const size = Math.max(18, Math.min(W, H) * p.s);
      ctx.globalAlpha = p.a;
      ctx.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(emoji, p.x, p.y);
    }
    ctx.restore();
  }
  /* Frame figée déterministe pour la PHOTO capturée (même rendu, pas de rand) */
  drawStatic(ctx, W, H) {
    if (!this.cfg) return;
    const emoji = this.cfg.emoji;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < this.cfg.count; i++) {
      const t = (i * 0.618) % 1; // distribution pseudo-aléatoire stable
      const x = ((i * 137.5) % 100) / 100 * W;
      const y = ((i * 61.8) % 100) / 100 * H;
      const s = Math.max(16, Math.min(W, H) * this.cfg.size * (0.7 + t));
      ctx.globalAlpha = this.cfg.alpha * (0.75 + t * 0.25);
      ctx.font = `${Math.round(s)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(emoji, x, y);
    }
    ctx.restore();
  }
}

/* rAF partagé global : un seul loop pour toutes les animations actives */
let _engine = null;
let _rafId = null;
let _drawHook = null;

function loop() {
  _rafId = requestAnimationFrame(loop);
  if (!_engine) return;
  _engine.step();
  if (_drawHook) _drawHook(_engine);
}

export function startAnimation(id, drawHook) {
  stopAnimation();
  const cfg = CONFIG[id];
  if (!cfg) return null;
  _engine = new AnimationEngine(id, window.innerWidth, window.innerHeight);
  _drawHook = drawHook || null;
  if (_rafId == null) _rafId = requestAnimationFrame(loop);
  return _engine;
}

export function stopAnimation() {
  _engine = null;
  _drawHook = null;
  if (_rafId != null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
}

export function isAnimationRunning() { return !!_engine; }
