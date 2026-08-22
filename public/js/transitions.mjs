/**
 * Phase 6 IMPL-B — Anime.js transitions + 3-2-1 countdown animation
 * Uses global anime (loaded via classic <script> tag).
 * Fallback to CSS if anime is unavailable.
 */

const HAS_ANIME = typeof anime !== 'undefined';

/**
 * Animate screen transition — replace CSS screenChildIn with anime.js stagger
 * @param {HTMLElement} screen - the .screen element being activated
 */
export function animateScreenEnter(screen) {
  if (!screen) return;
  const children = Array.from(screen.children).filter(c => c.nodeType === 1);
  if (!children.length) return;

  if (!HAS_ANIME) {
    // Fallback: use CSS animation (screenChildIn keyframe already in styles.css)
    screen.style.animation = 'none';
    screen.offsetHeight; // reflow
    screen.style.animation = '';
    return;
  }

  // Reset any previous inline styles
  children.forEach(c => {
    c.style.opacity = '';
    c.style.transform = '';
  });

  anime({
    targets: children,
    opacity: [0, 1],
    translateY: [12, 0],
    scale: [0.97, 1],
    delay: anime.stagger(55, { start: 0 }),
    duration: 420,
    easing: 'easeOutCubic',
    complete: () => {
      // Clean up inline styles so CSS takes over
      children.forEach(c => {
        c.style.opacity = '';
        c.style.transform = '';
        c.style.scale = '';
      });
    }
  });
}

/**
 * Animate countdown 3-2-1 with scale bounce + fade using anime.js
 * @param {HTMLElement} numberEl - the .countdown-number element
 * @param {number} from - starting number (e.g. 3)
 */
export function animateCountdownStep(numberEl, from) {
  if (!numberEl) return;
  if (!HAS_ANIME) {
    numberEl.textContent = String(from);
    return;
  }

  numberEl.textContent = String(from);

  anime({
    targets: numberEl,
    scale: [0.3, 1.15, 1],
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 600,
    easing: 'easeOutElastic(1, .5)',
    begin: () => {
      numberEl.textContent = String(from);
    }
  });
}

/**
 * Animate countdown ring pulse
 * @param {HTMLElement} ringEl - the .countdown-ring element
 */
export function animateCountdownPulse(ringEl) {
  if (!ringEl || !HAS_ANIME) return;

  anime({
    targets: ringEl,
    scale: [0.92, 1],
    duration: 500,
    easing: 'easeOutCubic',
    complete: () => {
      ringEl.style.transform = '';
    }
  });
}

/**
 * Animate screen exit (fade out + slight scale down)
 * @param {HTMLElement} screen
 */
export function animateScreenExit(screen) {
  if (!screen || !HAS_ANIME) return;
  const children = Array.from(screen.children).filter(c => c.nodeType === 1);
  if (!children.length) return;

  anime({
    targets: children,
    opacity: [1, 0],
    translateY: [0, -6],
    scale: [1, 0.98],
    delay: anime.stagger(30, { start: 0, from: 'last' }),
    duration: 250,
    easing: 'easeInCubic'
  });
}
