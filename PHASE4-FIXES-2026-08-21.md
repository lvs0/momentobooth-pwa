# PHASE 4 FIXES — 2026-08-21

## Phase 4 : Polish UI P0 — 7 fixes après audit vision IA

**Date** : 21 août 2026
**Branche** : `fix/levy-2026-08-21-p0` (HEAD : `c0f8419`)
**Contexte** : Audit visuel IA (iPad mode caméra) a identifié 10 défauts UI. 7 priorités P0 traitées.

---

## Audit Summary

| Fix | Titre | Statut | Commit |
|-----|-------|--------|--------|
| P0-A | Toolbar droite (shutter + icônes) alignement + safe-area | ✅ | `b97a123` |
| P0-B | Zone centrale vide (placeholder caméra) | ✅ | `0dbc627` |
| P0-C | Tooltip "Filtre" superposé à l'anneau | ✅ | `c8ac0ce` |
| P0-D | Anneau coupé sur bord gauche | ✅ | `c8ac0ce` |
| P0-E | Bouton "Galerie invités" texte 2 lignes | ✅ | `d1a1054` |
| P0-F | Lettres orphelines "M" et "h" | ✅ | `4d301e1` |
| P0-G | Carré blanc placeholder (asset manquant) | ✅ | `77517d5` |

> **Note** : P0-C et P0-D ont été combinés en un seul commit (`c8ac0ce`) car le déplacement du `.filter-rail-meta` hors de `#photo-filter-rail` dans le HTML est intrinsèquement lié au positionnement de l'anneau. Une séparation aurait créé un état intermédiaire cassé.

---

## Fix Details

### P0-A — Toolbar droite (shutter + icônes) alignement + safe-area

**Fichiers** : `public/index.html`, `public/css/styles.css`

**Modifications** :
- `.bottom-bar` : `position: absolute; right: env(safe-area-inset-right, 0px); top: 50%; transform: translateY(-50%) translateZ(0)` — aligné à droite avec safe-area
- `.shutter-btn` : normalisé à 80×80px, `transform: scale(1.4) translateZ(0)` — ratio 1.4× (pas 2×)
- `.shutter-hint-gif` : `display: none !important` → `display: none` (suppression de `!important` non nécessaire)
- `.bottom-bar .icon-btn` : toutes les icônes à 56×56px
- `backdrop-filter: blur(14px)` + `background: rgba(10, 18, 38, 0.7)` pour effet glass
- `padding-right: env(safe-area-inset-right, 0px); padding-bottom: env(safe-area-inset-bottom, 0px)`
- Recherche d'icône "main"/"cursor" parasite — non trouvée, aucune suppression nécessaire

**Vérification** (1024×768 + 390×844) :
- Bottom-bar visible ✅, right=14px ✅, backdrop blur ✅
- Shutter-hint-gif display: none ✅
- Toolbar sur le côté droit ✅, shutter dans la toolbar ✅

### P0-B — Zone centrale vide (placeholder caméra)

**Fichiers** : `public/index.html`, `public/css/styles.css`, `public/js/app.js`

**Modifications** :
- `.camera-error` (déjà présent dans le HTML, mais pas stylé correctement) :
  - `position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center`
  - `background: rgba(0, 0, 0, 0.4)` — overlay sombre
  - `backdrop-filter: blur(8px)` — effet flou verre
  - `z-index: 20` — au-dessus du flux
- Le placeholder disparaît dès que le stream de caméra arrive (logique existante dans app.js préservée)

**Vérification** (1024×768 + 390×844) :
- `.camera-error` visible ✅, backdrop blur(8px) ✅, bg rgba(0,0,0,0.4) ✅

### P0-C — Tooltip "Filtre" superposé à l'anneau

**Fichiers** : `public/index.html`, `public/css/styles.css`

**Modifications** :
- **HTML** : `.filter-rail-meta` déplacé hors de `#photo-filter-rail` pour devenir un frère direct (sibling). Cela contourne le fait que `#photo-filter-rail` avait `transform: matrix(...)` créant un containing block pour `position: fixed`.
- **CSS** :
  - `.filter-rail-meta` (sélecteur généralisé depuis `#photo-filter-rail .filter-rail-meta`) : `position: fixed; right: 24px; top: 50%; transform: translateY(-50%)`
  - `max-width: 220px; background: rgba(0, 0, 0, 0.7); padding: 12px 16px; border-radius: 12px`
  - Media query mobile `@media (max-width: 500px)` : `left: calc(296px + 12px); max-width: 70px` — pousse le meta à droite de l'anneau pour éviter le chevauchement

**Vérification** (1024×768) :
- position: fixed ✅, right: 24px ✅, overlapRing: false ✅, overflowRight: false ✅

**Vérification** (390×844) :
- position: fixed ✅, right: 12px ✅, overlapRing: false ✅, overflowRight: false ✅

**Root cause** : `#photo-filter-rail` possédait `transform: matrix(1, 0, 0, 1, 0, -112)` qui transformait l'élément en containing block, rendant `position: fixed` relatif au rail au lieu du viewport.

### P0-D — Anneau coupé sur bord gauche

**Fichiers** : `public/css/styles.css`

**Modifications** :
- Base `#photo-filter-rail` : `left: -100px` → `left: 16px` (anneau entièrement visible)
- 3 media query overrides ajustés à `left: 16px`

**Vérification** (1024×768) :
- left: 16 ✅, visibleLeft: true ✅

**Vérification** (390×844) :
- left: 16 ✅, visibleLeft: true ✅

### P0-E — Bouton "Galerie invités" texte 2 lignes

**Fichiers** : `public/css/styles.css`, `public/index.html`

**Modifications** :
- `.tablet-qr-access button` (base) : `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- Media query mobile : `grid-template-columns: 44px minmax(0px, 110px)` (élargi de 96px à 110px)
- Option conservée plutôt que réduire le texte (préférence d'accessibilité)

**Vérification** (1024×768) :
- grid-template-columns: "56px 92px" ✅ (desktop intact)

**Vérification** (390×844) :
- grid-template-columns: "44px minmax(0px, 110px)" ✅

### P0-F — Lettres orphelines "M" et "h"

**Fichiers** : `public/css/styles.css`

**Investigation** : Les lettres "M" et "h" orphelines près du bouton "Effets" étaient causées par `white-space: normal` (par défaut) sur `.brand-lockup strong` et `.brand-lockup small`. Le texte "MomentoBooth" pouvait s'insérer dans un conteneur trop étroit et se fragmenter, laissant des lettres seules.

**Fix** :
- `.brand-lockup strong` : `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- `.brand-lockup small` : `white-space: nowrap`

**Vérification** (1024×768 + 390×844) :
- white-space: nowrap ✅ (les deux résolutions)

### P0-G — Carré blanc placeholder (asset manquant)

**Fichiers** : `public/css/styles.css`, `public/index.html`

**Modifications** :
- `.tablet-qr-access img` (base) : `background: #fff` → `background: rgba(255, 255, 255, 0.08)` (grisâtre subtil au lieu de blanc cassant)
- `.tablet-qr-access img` (mobile) : ajout de `background: rgba(255, 255, 255, 0.08)`
- `<img id="tablet-qr-image">` : ajout de `onerror="this.style.visibility='hidden';"` pour masquer l'image lorsque le chargement échoue
- Ajout de `loading="lazy"` pour le différé

**Vérification** (1024×768 + 390×844) :
- onerror handler présent ✅
- background: rgba(255, 255, 255, 0.08) ✅

---

## Tests Playwright (before/after)

| Fix | Résolution | Élément clé | Before | After |
|-----|-----------|-------------|--------|-------|
| P0-A | 1024×768 | bottom-bar right | — | 14px ✅ |
| P0-A | 390×844 | bottom-bar right | — | 14px ✅ |
| P0-B | 1024×768 | camera-error backdrop | — | blur(8px) ✅ |
| P0-B | 390×844 | camera-error bg | — | rgba(0,0,0,0.4) ✅ |
| P0-C | 1024×768 | meta overlapRing | true | false ✅ |
| P0-C | 390×844 | meta overflowRight | true | false ✅ |
| P0-D | 1024×768 | ring left | -100px | 16px ✅ |
| P0-D | 390×844 | ring visibleLeft | false | true ✅ |
| P0-E | 1024×768 | button nowrap | — | nowrap ✅ |
| P0-E | 390×844 | grid cols | 96px | 110px ✅ |
| P0-F | 1024×768 | strong whiteSpace | normal | nowrap ✅ |
| P0-F | 390×844 | strong whiteSpace | normal | nowrap ✅ |
| P0-G | 1024×768 | img onerror | absent | présent ✅ |
| P0-G | 390×844 | img bg | #fff | rgba(255,255,255,0.08) ✅ |

---

## Déploiement Modal

Déploiement final effectué via `modal deploy modal_app.py` :
- **URL** : https://shhsjdbjk--momentobooth-serve.modal.run
- **App** : `momentobooth` (Modal App ID : `shhsjdbjk`)
- **Conteneur** : Node.js 20 sur Debian Slim, port 8787
- **Photos volume** : `momentobooth-photos` (volume partagé)
- **Statut** : ✅ Déployé avec succès

---

## Processus

1. **Backup** : tag `phase4-backup-1787332085` créé avant modifications
2. **Vérification CC** : `ps aux | grep claude` — aucune autre instance Claude Code en cours
3. **7 fixes** : 6 commits (P0-C/P0-D combinés = 1 commit)
4. **node --check** : `public/js/app.js` validé avant chaque commit ✅
5. **Playwright** : tests before/after à 1024×768 et 390×844 pour chaque fix
6. **Screenshots** : `screenshots/levy-2026-08-21/{before,after}/{p0-a,p0-b,p0-cd,p0-e,p0-f,p0-g}/`
7. **Modal deploy** : ✅
8. **Documentation** : ce fichier + `PHASE4-FIXES-2026-08-21.json`
