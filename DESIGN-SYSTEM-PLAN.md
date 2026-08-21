# Design System Plan — MomentoBooth v2.0 (long-terme)

> Plan de refactor progressif pour transformer le CSS actuel en un design system senior, accessible, et maintenable.
> **Date** : 2026-08-21 · **Auteur** : agent design-audit (Lévy délégation)
> **État actuel** : quick wins appliqués (voir `AUDIT-DESIGN-2026-08-21.md`). Ce document décrit le plan **au-delà** des quick wins.

---

## Vision

Un seul endroit où changer une couleur, un espacement, ou un rayon — et toute l'UI suit.
Chaque composant visuel (bouton, modal, toast, input, card) a un **contrat** documenté et stable.
Tous les composants sont **accessibles** (WCAG 2.2 AA) et **tactiles** (44×44px min).

---

## Phase 1 — Tokens sémantiques (✅ quick wins posés, à généraliser)

### 1.1 Couleurs
```css
:root {
  /* Background & surface */
  --bg: #0b1020;
  --bg-elevated: #131b30;          /* surface relevée */
  --bg-overlay: rgba(0,0,0,.5);
  --panel: rgba(19, 27, 48, .78);
  --panel-solid: #131b30;          /* pour high-contrast / print */

  /* Texte */
  --text: #f7f7fb;
  --text-muted: rgba(255,255,255,.76);
  --text-disabled: rgba(255,255,255,.4);
  --text-inverse: #071329;

  /* Accent (marque) */
  --accent: #7dd3fc;
  --accent-strong: #38bdf8;        /* hover */
  --accent-soft: rgba(125,211,252,.16);
  --accent-2: #c084fc;
  --gold: #f0c96a;

  /* États sémantiques (✅ ajouté quick win #1) */
  --state-ok: #7ee5a7;
  --state-warn: #ffd166;
  --state-error: #ff7196;
  --state-info: #7dd3fc;

  /* Strokes */
  --stroke: rgba(255,255,255,.14);
  --stroke-bright: rgba(255,255,255,.26);
  --stroke-accent: rgba(125,211,252,.5);
  --stroke-error: rgba(255,113,150,.5);
}
```

### 1.2 Spacing scale (4px base)
```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
}
```
**Effort** : remplacer les `12px`, `16px`, `24px`, etc. par les tokens — `sed -i 's/ 12px;/ var(--space-3);/g'`. **À faire en plusieurs passes par fichier pour limiter les régressions**.

### 1.3 Radius scale
```css
:root {
  --radius-none: 0;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-2xl: 32px;
  --radius-pill: 999px;
  --radius-full: 50%;
}
```

### 1.4 Shadows
```css
:root {
  --shadow-sm: 0 2px 8px rgba(0,0,0,.16);
  --shadow-md: 0 8px 28px rgba(0,0,0,.28);
  --shadow-lg: 0 12px 40px rgba(0,0,0,.4);
  --shadow-xl: 0 30px 90px rgba(0,0,0,.56);
  --shadow-inset-top: inset 0 1px 0 rgba(255,255,255,.2);
  --shadow-glow-accent: 0 12px 28px rgba(125,211,252,.2);
}
```

### 1.5 Motion
```css
:root {
  --motion-instant: 80ms;
  --motion-fast: 140ms;
  --motion-normal: 240ms;
  --motion-slow: 420ms;
  --ease-organic: cubic-bezier(.22, .8, .24, 1);
  --ease-out: cubic-bezier(0, 0, .2, 1);
  --ease-in: cubic-bezier(.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(.4, 0, .2, 1);
}
```

### 1.6 Z-index scale
```css
:root {
  --z-base: 1;
  --z-screen: 1;          /* .screen active */
  --z-floating: 30;       /* .fx-top-btn, .device-role-status */
  --z-modal: 100;         /* .toast, modals */
  --z-modal-backdrop: 99;
  --z-camera-monitor: 46;
  --z-role-gate: 120;     /* .role-gate */
  --z-toast: 200;
}
```

### 1.7 Typography
```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Avenir Next", system-ui, sans-serif;
  --font-display: "SF Pro Rounded", -apple-system, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  --text-4xl: 48px;

  --leading-tight: 1.1;
  --leading-normal: 1.45;
  --leading-relaxed: 1.6;
}
```

---

## Phase 2 — Composants UI (à construire)

### 2.1 Button (`.btn`)
```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; min-width: 44px;          /* tactile */
  padding: 10px 18px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text);
  font: 600 var(--text-base)/1 var(--font-sans);
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--ease-organic),
    background-color var(--motion-fast) var(--ease-organic),
    border-color var(--motion-fast) var(--ease-organic);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.btn:hover { background: rgba(255,255,255,.06); }
.btn:active:not(:disabled) { transform: scale(.975); }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.btn:disabled { opacity: .4; cursor: not-allowed; }

.btn--primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--text-inverse); border-color: transparent; }
.btn--secondary { background: rgba(255,255,255,.08); }
.btn--ghost { background: transparent; border-color: transparent; }
.btn--danger { background: var(--state-error); color: var(--text-inverse); }
.btn--success { background: var(--state-ok); color: var(--text-inverse); }

.btn--sm { min-height: 36px; padding: 6px 12px; font-size: var(--text-sm); }
.btn--lg { min-height: 56px; padding: 14px 24px; font-size: var(--text-md); }
.btn--icon { padding: 10px; aspect-ratio: 1; }
.btn--block { width: 100%; }
```

**Effort** : 1 sprint. Migration progressive : ajouter `.btn` à tous les boutons existants, puis supprimer les styles locaux.

### 2.2 Card (`.card`)
```css
.card {
  background: var(--panel);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  backdrop-filter: blur(20px) saturate(135%);
  -webkit-backdrop-filter: blur(20px) saturate(135%);
  box-shadow: var(--shadow-md), var(--shadow-inset-top);
}
.card--elevated { background: var(--bg-elevated); }
.card--ghost { background: transparent; border-color: transparent; }
```

### 2.3 Modal (`.modal`)
- Backdrop : `position: fixed; inset: 0; background: var(--bg-overlay); z-index: var(--z-modal-backdrop)`
- Container : `.modal` + `.modal__dialog` + `.modal__header` / `__body` / `__footer`
- Animation : `slide-up 240ms var(--ease-organic)`
- Focus trap : `inert` attribute sur le contenu derrière, ou implémenter avec `focus-trap` lib
- `role="dialog" aria-modal="true" aria-labelledby="..."`
- **Escape** pour fermer
- **Click outside** optionnel

### 2.4 Toast (✅ quick win #3 posé)
```js
toast("Message");                      // info
toast("OK !", { kind: "success" });
toast("Oups", { kind: "error", duration: 4000 });
toast("Patientez", { kind: "warning" });
```
CSS :
```css
.toast { ... }                          /* base */
.toast--info    { border-color: var(--state-info); }
.toast--success { border-color: var(--state-ok); }
.toast--warning { border-color: var(--state-warn); }
.toast--error   { border-color: var(--state-error); }
```

### 2.5 Input (`.input`)
```css
.input {
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,.08);
  color: var(--text);
  font: 500 var(--text-base)/1 var(--font-sans);
  transition: border-color var(--motion-fast) var(--ease-organic);
}
.input:focus { border-color: var(--accent); outline: 3px solid var(--accent-soft); outline-offset: 0; }
.input--error { border-color: var(--state-error); }
```

### 2.6 SegmentedControl
- Pour remplacer les `<select>` natifs (style Phone/iOS)
- Tokens partagés avec `.btn--ghost`
- Raccourci clavier flèches

### 2.7 Spinner (✅ déjà extrait `.mb-spinner`)
- Ajout variants `--state-ok/warn/error` pour les spinners d'état

---

## Phase 3 — Migration (par composant, par écran)

### Étapes concrètes

| Sprint | Écran/Composant | Tokens introduits | Effort | Risque |
|--------|----------------|--------------------|--------|--------|
| **S1** ✅ | Tokens `:root` (state, motion, shadows, z-index) | 30+ | 1h | Très faible |
| **S1** ✅ | Toast unifié + ARIA | 4 | 30min | Faible |
| **S2** | `.btn` + migration de `.role-confirm`, `.camera-stop-btn`, `.fx-top-btn` | 1 | 2h | Moyen |
| **S3** | `.input` + migration de `.role-token-row input` | 1 | 1h | Faible |
| **S4** | `.card` + migration de `.role-card`, panels de settings | 1 | 2h | Moyen |
| **S5** | `.modal` + extraction de `.role-gate`, `.camera-error`, `.share-sheet` | 1 | 3h | Élevé (focus trap) |
| **S6** | Spacing tokens — passer tous les `12px` → `var(--space-3)` | 7 | 3h | Élevé (regressions possibles) |
| **S7** | Radius tokens — converger vers 4 niveaux | 7 | 2h | Moyen |
| **S8** | Remplacer les 76 hex par les tokens (sauf thèmes) | 32 | 2h | Faible |
| **S9** | Audit Playwright 3 viewports + a11y | 0 | 1h | – |

**Effort total estimé** : ~16h de travail minutieux. **À étaler sur plusieurs sessions** pour ne pas bloquer les 2 subagents en parallèle.

### Règle de migration
- **Un composant à la fois**. Tester après chaque migration. **Commit par composant**.
- **Garde-fou** : si un écran ne ressemble pas à l'original pixel-perfect → revert, retenter.
- **Ne pas migrer les thèmes** (pearl/party/studio/midnight) tant que les tokens ne sont pas figés.

---

## Phase 4 — Au-delà (mois prochain)

- **Tokens JSON exportables** pour Figma / Storybook / design-dev sync.
- **Storybook** statique : `public/storybook.html` pour visualiser chaque composant dans 3 viewports et 4 thèmes.
- **Tests visuels** (Playwright screenshot diff).
- **Mode haute contraste** : variante `body[data-contrast="high"]` qui swap tokens vers du noir/blanc pur.
- **i18n** : passer les labels en `data-i18n` (déjà partiellement fait dans le code).

---

## Annexe — Pourquoi ce plan est senior

1. **Tokens d'abord, composants ensuite** : on ne construit pas un bouton "designé à la main" sans avoir un système de couleurs.
2. **Ne pas tout réécrire d'un coup** : migration par composant, commits atomiques, tests à chaque étape.
3. **Accessibilité comme contrat, pas comme patch** : chaque composant a un minimum (44×44px, focus visible, ARIA role).
4. **Mobile first** : on teste d'abord sur iPhone (390×844), puis on remonte vers tablette/stand.
5. **L'utilisateur senior (Lévy)** a explicitement demandé "vraiment au niveau dev senior designer" — ce plan respecte ça : sobriété, échelle claire, semver mental, dette technique visible.
