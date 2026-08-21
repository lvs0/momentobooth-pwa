# AUDIT — v125.0.0 Refonte Galerie Carrousel Photomaton

**Date** : 2026-08-21  
**Branche** : main  
**Commit** : 07d58fb (carousel JS) — précédé par 6d7ec03 (CSS) et 40ac5c5 (HTML)  
**Déployé Modal** : https://shhsjdbjk--momentobooth-serve.modal.run

---

## 1. Avant / Après

### Avant (v124.0.12)
- Grille scrollable `#gallery-grid` 3 colonnes
- Pas de pagination, scroll infini
- Pas de compteur "X / N"
- Pas de navigation clavier/tactile dédiée

### Après (v125.0.0)
- **Mode carrousel par défaut** : une photo à la fois, centrée, max 80vh
- **Header** : compteur "X / N" (ex: "3 / 21") en haut au centre, pill semi-transparent
- **Flèches** gauche/droite (56px mobile, 64px tablette, 80px desktop)
  - Cachées aux extrémités (`hidden` natif)
  - Opacité 0.6 → 1 au hover sur desktop
- **Navigation** :
  - Clavier ←/→ quand `#screen-gallery` est actif
  - Swipe tactile (threshold 50px) sur `.gallery-carousel-stage`
  - Click sur les flèches
- **Toggle vue** : bouton "⊞" dans le header bascule carrousel ⇄ grille
- **Multi-sélection** : appui long 500ms sur photo → mode sélection organisateur
  - Header sélection affiché : "X sélectionnées" + Annuler + Supprimer
- **Responsive** : 3 viewports validés (iPhone 390, iPad 1024, Huawei 1920)

---

## 2. Fichiers modifiés

| Fichier | Lignes +/- | Rôle |
|---------|-----------|------|
| `public/index.html` | +28 / -10 | Ajout `#gallery-carousel`, `#gallery-prev`, `#gallery-next`, `#gallery-counter`, `#gallery-toggle-view`, `#gallery-select-bar`, `#gallery-grid-view` |
| `public/css/styles.css` | +154 | Styles carrousel (`.gallery-carousel`, `.gallery-arrow`, `.gallery-counter`, `.gallery-toggle-view`, `.gallery-grid-view`, `.gallery-select-bar`) |
| `public/js/app.js` | +260 / -33 | Refonte `renderGallery()`, ajout `state.galleryMode/galleryPage/galleryPhotos`, helpers `goToGalleryPage()`, `renderCarouselPage()`, `initGalleryControls()`, swipe, keyboard, long-press |
| `docs/PHOTOMATON-V125-SPEC.md` | enrichi | Spéc détaillée carrousel |

---

## 3. Bugs trouvés en chemin

1. **`#gallery-grid` dupliqué** dans `index.html` (lignes 638 et 665) → corrigé par suppression du doublon et encapsulation dans `#gallery-grid-view`
2. **`gallery-select-bar` manquant dans HTML** alors que référencé par JS → ajouté dans le DOM
3. **Bloc dupliqué dans `renderGallery`** après refactor (serverById/unique/all calculé 2x) → supprimé
4. **`img.alt` vide** (shell JavaScript invalide) → corrigé par template string

---

## 4. Backups

- `/home/l-vs/.backup/momento-v125-gallery.tar.gz` (18 MB, créé avant modification)

---

## 5. Recommandations v125.1

1. **Remote camera v125** : zoom, exposition, flash, focus tap depuis tablette — spec disponible dans `docs/REMOTE-CAMERA-V125.1-SPEC.md` (user-agent a demandé enchaînement)
2. **Détection WebRTC crash Safari** : ajouter fallback automatique polling si `RTCPeerConnection` lève
3. **Tests Playwright automatisés** : CI sur 3 viewports à chaque PR galerie
4. **Accessibilité** : ajouter `aria-live="polite"` sur flèches, labels ARIA sur compteur

---

## 6. Commits

```
40ac5c5 feat(gallery): add carousel UI elements (HTML)
6d7ec03 feat(gallery): add carousel CSS (arrows, counter, toggle, selection bar)
07d58fb feat(gallery): refactor renderGallery for carousel mode (v125.0.0)
```

**Déploiement Modal** : ✅ https://shhsjdbjk--momentobooth-serve.modal.run
