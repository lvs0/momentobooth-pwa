# PHASE1-FIXES-2026-08-21.md

**MomentoBooth Phase 1 — 6 fixes visuels P0**
Date : 2026-08-21
Base : v125.0.0 (commit 312fb04)
Déploiement : https://shhsjdbjk--momentobooth-serve.modal.run

---

## Résumé

6 commits séquentiels, 1 par fix. Aucune régression. Boot v125.0.0 préservé.

## Fixes

### P1.1 — Fix stretch caméra (object-fit:cover strict + getUserMedia HD)
- **Fichiers** : `public/js/app.js`, `public/css/styles.css`
- **Commit** : `1450c39`
- **Action** : Suppression de l'aspect-ratio dynamique sur le conteneur caméra (qui causait un stretching sur écrans larges). `object-fit: cover !important` strict sur `#camera`. `aspect-ratio: auto !important` sur `.camera-zone`.
- **getUserMedia** : déjà configuré en HD via `PERF` profiles (eco: 960×540, balanced: 1280×720, max: 1920×1080).
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

### P1.2 — Caméra centrée entre boutons (toggle setting `cameraFraming`)
- **Fichiers** : `public/js/app.js`, `public/index.html`, `public/css/styles.css`
- **Commit** : `202d51e`
- **Action** : Ajout du toggle `cameraFraming` dans Settings > Apparence. Quand activé, `body[data-camera-framing="centered"]` ajoute `inset: 0 0 104px 0; border-radius: 18px; margin: 8px;` sur `.camera-zone`. La caméra est centrée avec des coins arrondis, sans overlap du bottom-bar.
- **Persistance** : champ `cameraFraming` ajouté à `PREFERENCE_FIELDS`, `syncPreferenceControls()`, `loadPreferences()`.
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

### P1.3 — Filter-rail rewrite (rotation + inertie + snap)
- **Fichiers** : `public/js/app.js`
- **Commit** : `e4803a3`
- **Action** : Ajout d'un handler `wheel` sur `#photo-filter-rail-list` avec inertie basée sur la vitesse. Facteur d'amortissement 0.85 par tick (80ms), cap de vitesse ±8, timeout de 600ms. Snap automatique au filtre le plus proche quand l'inertie s'arrête.
- **Compatible** avec le drag tactile existant (pointerdown/pointermove/pointerup).
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

### P1.4 — Photothèque responsive (QR bottom sheet sur mobile)
- **Fichiers** : `public/css/styles.css`
- **Commit** : `01d5bc7`
- **Action** : Media query `@media (max-width: 767px)` transforme `.gallery-qr-hero` en fixed bottom sheet (positionné en bas de l'écran avec backdrop blur). Sur tablette `≥ 768px`, le QR reste en sticky sidebar (comportement existant). Padding-bottom ajouté à `.gallery-grid` pour éviter l'overlap.
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

### P1.5 — Gallery pagination pills (où je suis)
- **Fichiers** : `public/js/app.js`, `public/index.html`, `public/css/styles.css`
- **Commit** : `442e52e`
- **Action** : Ajout de `#gallery-pills` sous le carrousel. `renderGalleryPills()` génère des pills numérotées (1, 2, 3...) avec état actif mis en évidence. Max 40 pills avec step calculation pour les grandes galeries. Clic sur une pill = jump direct. Le carrousel v125.0.0 existant n'est pas modifié.
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

### P1.6 — Export redesign (1 menu drawer au lieu de grille)
- **Fichiers** : `public/js/app.js`, `public/index.html`, `public/css/styles.css`
- **Commit** : `4014ce1`
- **Action** : Remplacement de la grille d'icônes `share-chip` par un seul bouton "Partager & sauvegarder" qui ouvre un drawer bottom sheet. Le drawer contient 6 options : WhatsApp, Snapchat, SMS, Email, Plus (native), QR, Télécharger. Grid 3 colonnes sur mobile, 6 sur tablette. La grille legacy est masquée via CSS `:has()`.
- **Tests** : iPad 1024×768 ✅ | iPhone 390×844 ✅

---

## Tests

| Viewport | P1.1 | P1.2 | P1.3 | P1.4 | P1.5 | P1.6 |
|----------|------|------|------|------|------|------|
| 1024×768 (iPad) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 390×844 (iPhone) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Boot v125.0.0 préservé** : `data-app-version="125"` ✅
**Écran blanc** : aucun ✅
**Parse error** : aucun (`node --check` avant chaque commit) ✅

## Deploiement

- **Local** : http://localhost:8787 ✅
- **Modal live** : https://shhsjdbjk--momentobooth-serve.modal.run ✅
- **Backup** : `~/.backup/momento-2026-08-21-phase1.tar.gz` (18.4 MB)

## Commits

```
4014ce1 P1.6: export redesign — 1 drawer button replaces icon grid
442e52e P1.5: gallery pagination pills — 'où je suis' in carousel
01d5bc7 P1.4: phototheque responsive — QR bottom sheet on mobile
e4803a3 P1.3: filter-rail wheel rotation + inertia + snap
202d51e P1.2: camera centered between buttons — toggle 'cameraFraming' setting
1450c39 P1.1: fix camera stretch — object-fit:cover strict + no forced aspect-ratio
```

## Fichiers modifiés

- `public/js/app.js` (P1.1, P1.2, P1.3, P1.5, P1.6)
- `public/css/styles.css` (P1.1, P1.2, P1.4, P1.5, P1.6)
- `public/index.html` (P1.2, P1.5, P1.6)

## Screenshots

- `screenshots/before/p1-before-ipad.png`
- `screenshots/before/p1-before-iphone.png`
- `screenshots/after/p1.1-after-ipad.png`
- `screenshots/after/p1.1-after-iphone.png`
- `screenshots/after/p1.2-after-ipad.png`
- `screenshots/after/p1.2-after-iphone.png`
- `screenshots/final/final-ipad.png`
- `screenshots/final/final-iphone.png`
- `screenshots/live/live-ipad.png`
- `screenshots/live/live-iphone.png`
