# FIX-RESULT-LAYOUT-2026-08-21.md

## Résumé
Fix du layout de l'écran "votre export" (#result-grid) sur tablettes iPad (1024×768) et Huawei (1920×1200).

## Bug
- **iPad 1024×768** : `#result-grid` faisait **358px** au lieu de **~597px** (58% de 1024)
- **Huawei 1920×1200** : `#result-grid` faisait **672px** au lieu de **~1100px**
- Cause : conflit de spécificité CSS entre deux media queries

## Cause racine
Deux blocs media query s'appliquent simultanément à ≥1024px en paysage :

| Bloc | Sélecteur | Spécificité | Règles |
|------|-----------|-------------|--------|
| `@media (min-width:768px) landscape` | `#screen-result .result-grid` | 2 IDs + 1 class | `display:flex; max-width:60%; flex:1 1 60%` |
| `@media (min-width:1024px) landscape` | `#result-grid` | 1 ID | `display:grid; max-width:none` |

Le bloc 768px a une spécificité **supérieure** (2 IDs + class vs 1 ID), donc ses règles gagnent même à 1024px+.

De plus, une règle non conditionnelle `.result-grid { max-width: 600px }` (ligne 2411) ajoutait un plafond supplémentaire.

## Fix appliqué
Fichier : `public/css/styles.css`

1. **Bloc 1024px** (ligne ~2907) : remplacé `#result-grid` par `#screen-result .result-grid, #result-grid` pour matcher la spécificité du bloc 768px. Ajouté `flex: none` pour annuler `flex: 1 1 60%`.

2. **Bloc 600px+** (ligne ~2411) : scopé `.result-grid { max-width: 600px }` dans `@media not all and (min-width: 1024px)` pour ne pas affecter les tablettes paysage.

## Vérification Playwright

| Viewport | Avant | Après | Attendu | Status |
|----------|-------|-------|---------|--------|
| iPad 1024×768 | 358px (flex, max-width:60%) | **597px** (grid, max-width:none) | ~597px | ✅ |
| Huawei 1920×1200 | 672px | **1120px** (grid, max-width:none) | ~1100px | ✅ |
| iPhone 390×844 | 390px | **390px** (100%) | 100% | ✅ |

## Commit
```
630ad73 fix: result-grid layout on tablets (iPad 1024x768, Huawei 1920x1200)
```

## Déploiement
Modal redeployé → https://shhsjdbjk--momentobooth-serve.modal.run
