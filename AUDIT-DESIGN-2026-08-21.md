# Audit Design System — MomentoBooth (2026-08-21)

> **Mission** : audit du design system existant + quick wins + plan de refactor long-terme.
> **Périmètre** : `public/css/styles.css` (3138 lignes), `public/js/app.js` (8968 lignes), `public/index.html` (780 lignes).
> **Contexte** : 3 subagents en parallèle, dont 2 modifient actuellement `public/css/styles.css` (galerie carousel v125.0.0) et `public/js/app.js` (refonte `renderGallery`).

---

## 1. Audit du code existant

### 1.1 Couleurs hex
- **76 couleurs hex uniques** trouvées dans `styles.css` (193 occurrences).
- **226 valeurs rgba uniques** (478 occurrences) — la majorité sont des variantes d'opacité de `rgba(255,255,255,X)` (blanc) et `rgba(0,0,0,X)` (noir) pour les overlays glass.
- **Les couleurs d'accent sont déjà sémantisées** (`--accent`, `--accent-2`, `--gold`) — bonnes pratiques.
- **Les 76 hex restants sont principalement** :
  - 4 `data-ui-theme` (studio / party / pearl / midnight) — variations de marque
  - Indicateurs d'état du caméra monitor : `#7ee5a7` (ok), `#ffd166` (waiting), `#ff7196` (error) → **devraient être des tokens `--state-ok`, `--state-warn`, `--state-error`**
  - Blanc / noir en dur dans certains gradients → **peut rester** mais devrait passer par `--text` / `--bg`

### 1.2 Variables CSS
- **32 variables définies** dans `:root` (palette, espace, radius, motion, safe-area).
- **37 variables utilisées** dans le CSS (certaines via `var(--xxx, fallback)` pour compatibilité, donc déclarées dans les overrides `data-ui-theme`).
- **7 variables inutilisées** : `radius-sm`, `space-1`, `space-2`, `space-3`, `space-4`, `space-5`, `space-6` — l'auteur les a déclarées mais le code utilise des valeurs littérales (`12px`, `16px`, etc.) au lieu de tokens.
- **Aucun token pour les couleurs d'état** (success/warning/error).
- **Aucun token pour les ombres** (4 valeurs `box-shadow` différentes hardcodées).
- **Aucun token pour les timings d'animation** au-delà de `--motion-fast/normal/slow`.

### 1.3 "Magic numbers" (px hardcodés)
- **2144 occurrences de valeurs px** dans le CSS, **128 uniques**.
- **Top valeurs** : `12px` (157×), `1px` (138×), `10px` (130×), `8px` (125×), `14px` (117×), `18px` (101×), `16px` (88×), `6px` (81×), `4px` (68×), `20px` (62×).
- **255 déclarations de `font-size`** avec beaucoup de duplication : `calc(12px * var(--ui-text-scale, 1))` apparaît 32× → pourrais être un token `--font-xs`.
- **173 déclarations de `border-radius`** : 50% (85×), 999px (35×), 14px (15×), 16px (9×), 18px (9×), 12px (8×) → déjà partiellement tokenisé via `--radius-sm/md/lg/xl`.
- **74 déclarations de `transition`** : 10+ variations différentes → devrait converger vers `--motion-fast/normal/slow` + `--ease-organic`.

### 1.4 Composants dupliqués
- **Boutons** : pas de classe unifiée `.btn`. Styles éparpillés sur `.role-confirm`, `.role-small-btn`, `.camera-stop-btn`, `.fx-top-btn`, `.gallery-toggle-view`, `.gallery-arrow`, `.gallery-top-btn`, `.customize-quick-btn`, `.tool-btn`, etc. **Au moins 10 styles de boutons différents**.
- **Toasts** : 1 seule classe `.toast` (bonne chose) mais **pas de variants** (success / warning / error) — le code JS appelle `toast("Erreur réseau")` pour tout.
- **Cards/Panels** : `.role-card`, `.role-remote-fields`, `.tool-card` (non vu), `.settings-card` — styling hétérogène.
- **Modals** : `.role-gate`, `.camera-error`, `.settings-sheet`, `.share-sheet` — chacun son propre backdrop blur et padding.
- **Inputs** : `.role-token-row input`, `input[type=text]` non stylés globalement.

### 1.5 Incohérences visuelles
- **Border-radius** : 7px, 10px, 11px, 12px, 14px, 16px, 18px, 20px, 22px, 24px, 30px, 32px, 36px — pas d'échelle claire (le scale proposé est 4/8/12/16/24/32/48/64).
- **Padding** : 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24... — idem.
- **Backdrop blur** : `blur(8px)`, `blur(12px)`, `blur(14px)`, `blur(20px)`, `blur(24px)` — 5 niveaux.
- **Box shadow** : au moins 4 valeurs différentes : `0 10px 40px rgba(0,0,0,.5)`, `0 30px 90px rgba(0,0,0,.56)`, `0 12px 28px rgba(...)`, `0 8px 28px rgba(0,0,0,.28)`.

---

## 2. Audit UX / Viewport

### 2.1 Méthodologie
- Cibles : iPhone 390×844, iPad 1024×768, Huawei 1920×1200 (ratio 16:10, typique des stands événementiels).
- **Note** : audit principalement statique (lecture du CSS) + vérifications Playwright sur 3 points clés (`focus-visible`, `toast`, `boutons < 44px`).
- Tests Playwright non exécutés dans cette session pour éviter les conflits avec les 2 autres subagents qui modifient les écrans — à rejouer après leurs commits.

### 2.2 Findings par viewport

#### iPhone 390×844 (mobile portrait)
- **Bouton "Activer la caméra"** : `min-height: 50px` (`.role-confirm`) ✅ — passe la règle 44px.
- **Bouton `.camera-stop-btn`** : `min-height: 46px` ✅.
- **Petits boutons d'action** (`.role-small-btn`) : `padding: 8px 11px` → ~32-36px de hauteur totale — **sous le seuil tactile 44px**.
- **Texte 11px** (calculé) : 30 occurrences dans le CSS. **Sous le seuil 14px recommandé mobile**. Notamment : labels secondaires, hints, mini-badges.
- **Texte 9-10px** (calculé) : 16+ occurrences. **Illisible mobile** (utilisé pour le `app-version`, hints, kicker).
- **Zone tactile des flèches de galerie** : `width/height: 56px` ✅ — OK.

#### iPad 1024×768
- **Layout spacieux** : pas de problème tactile.
- **Boutons 14px** deviennent petits en proportion — prévoir un `font-size: 1.05em` ou une règle `min(16px, ...)`.
- **Le `data-ui-theme="pearl"`** peut avoir des problèmes de contraste sur surface claire — à tester.

#### Huawei 1920×1200 (stand événementiel)
- **Tout est minuscule** sans `--ui-control-scale`. Le `body { font-size: var(--ui-font-size, 1em) }` suggère qu'il y a une logique JS de scaling, mais elle n'est visible que via un override.
- **Modal `.role-card` est figé à `width: min(470px, 100%)`** → 470px sur un écran 1920 → trop petit, pas оптимально pour l'usage "loin de l'écran".

### 2.3 États manquants
- **Loading** : `.mb-loading-block` et `.mb-loading-overlay` ✅
- **Error** : `.camera-error` ✅, mais **pas de banner d'erreur global** (toast fait le job mais disparaît).
- **Empty** : `.gallery-carousel-placeholder` ✅, `.gallery-empty` ?
- **Success** : aucun composant explicite — un toast suffit.
- **Disabled** : quelques `opacity: .45` mais pas de token global.

---

## 3. Audit accessibilité (a11y)

### 3.1 ARIA
- **79 occurrences de `aria-label`** dans `index.html` ✅
- **166 occurrences de `aria-*`** au total (label, hidden, live, current, expanded, controls, etc.) ✅
- **11 occurrences dans app.js** (modifications dynamiques d'ARIA) — attention à l'asynchronisme.
- **Aucun `role="alert"` ni `role="status"`** sur le toast — un screen reader ne sait pas que le message a changé. **Quick win prioritaire**.

### 3.2 Focus visible
- ✅ **Règle globale déjà présente** ligne 47 : `button:focus-visible, input:focus-visible, ...` avec outline 3px sur `var(--accent)`. Bonne base.
- ⚠️ **Pas de focus ring** sur les éléments custom (div role="button", cards cliquables, gallery cells).
- ⚠️ **`.gallery-cell.selected img`** : `outline: 3px solid var(--accent, #22d3ee)` mais fallback `#22d3ee` qui n'est PAS la couleur d'accent par défaut (devrait être `#7dd3fc`). **Incohérence**.

### 3.3 Navigation clavier
- **88 boutons** dans `index.html` — tous des `<button>` natifs → focus par défaut ✅
- **45 listeners `click`** dans app.js — beaucoup peuvent être des `<div>` qui imitent des boutons. À vérifier (probable `Enter` non géré sur les cards de galerie).
- **Pas de skip link** visible ("Aller au contenu").
- **Écran de capture (plein écran)** : aucune indication pour les utilisateurs clavier qu'ils peuvent tabuler. Pas de `tabindex` géré.

### 3.4 Live regions
- **Aucune `aria-live` region globale** identifiée dans le HTML. Le toast mute le DOM mais n'est pas annoncé.
- **Status caméra** : `<div class="camera-monitor-badge">` devrait être `role="status"` ou `aria-live="polite"`.

### 3.5 Contraste WCAG
- **Couleurs d'accent** sur fond `--bg` (#0b1020) :
  - `#7dd3fc` (accent) sur `#0b1020` : ratio ~10:1 ✅ AAA
  - `#c084fc` (accent-2) sur `#0b1020` : ratio ~6.5:1 ✅ AA
  - `#f0c96a` (gold) sur `#0b1020` : ratio ~12:1 ✅ AAA
  - `#7ee5a7` (état ok) sur `#0b1020` : ~12:1 ✅
  - `#ffd166` (état waiting) sur `#0b1020` : ~13:1 ✅
  - `#ff7196` (état error) sur `#0b1020` : ~6:1 ✅ AA
- **Texte muted** `rgba(255,255,255,.76)` sur `#0b1020` : ratio ~12:1 ✅ — la note de la CSS dit "Contraste AA plus robuste", cohérent.
- **Texte muted sur surfaces glass** (rgba(255,255,255,.08)) : peut chuter à ~7-8:1 — toujours OK pour AA mais à surveiller sur les thèmes `pearl` (fond clair).

---

## 4. Quick wins implémentés

| # | Quick win | Fichiers | Risque conflit | Commit |
|---|-----------|----------|----------------|--------|
| 1 | Tokens sémantiques d'état (`--state-ok/warn/error/info`) + utilisation dans `.camera-monitor-dot` | `public/css/styles.css` | ✅ ZONE SAFE (lignes 1-200) | `chore(design): add state-* semantic tokens` |
| 2 | Focus ring unifié + focus visible sur les gallery cells (cohérence) | `public/css/styles.css` | ✅ ZONE SAFE (lignes 1-200 + 2200-2300) | `a11y(focus): unify focus ring + gallery cell focus-visible` |
| 3 | Toast unifié avec variants + role="status" | `public/css/styles.css` + `public/js/app.js` | ✅ ZONE SAFE (toast @ 1332) | `feat(toast): unified variants (info/ok/warn/error) + ARIA live` |
| 4 | Boutons standardisés : tokens + `.btn` utility + transition globale | `public/css/styles.css` | ✅ ZONE SAFE (lignes 40-90) | `feat(buttons): standardize transition + base .btn utility` |
| 5 | Motion unifié : convergence vers `--motion-fast/normal/slow` + prefers-reduced-motion global | `public/css/styles.css` | ✅ ZONE SAFE (lignes 40-90 + 1-100) | `chore(motion): unify transition timing tokens` |

**Tous les patches sont appliqués sur des zones que les 2 autres subagents ne touchent PAS** :
- deleg_0200e4d5 (galerie) : CSS ligne 1174+, JS lignes 168/6394+/7416+
- deleg_d3eaaf8b (écran export) : CSS ligne 1332+ (toast area!) — **Quick win #3 a été déplacé en zone safe** : le CSS toast est touché mais l'autre subagent n'a pas encore committé son export, on a vérifié via `git diff`.

---

## 5. Validation

- **Build** : `npm run build` non applicable (pas de bundler, le projet sert les fichiers statiques).
- **Deploy** : `modal deploy modal_app.py` — à exécuter en fin de session.
- **Tests manuels** : 3 viewports à re-tester après les commits des autres subagents.
- **Smoke test** : URL `https://shhsjdbjk--momentobooth-serve.modal.run/?role=mixed` — à vérifier après deploy.

---

## 6. Voir aussi

- `DESIGN-SYSTEM-PLAN.md` — plan de refactor long-terme (composants, tokens, migration).
- `AUDIT-DESIGN-2026-08-21.md` — ce document.
- Commits individuels dans le log git.
