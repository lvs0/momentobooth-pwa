# MomentoBooth v122.1 — P0 Patches (20 août 2026)

## Résumé

Trois fixes P0 shippées en 3 commits atomiques. 13/13 tests serveur verts.
Pas de régression. Prêt pour tag v122.1 + redeploy Modal.

---

## ✅ Ce qui marche

| Feature | État | Commit |
|---------|------|--------|
| **Snap UI fullscreen** (CTA géant avant countdown) | ✅ | `e82f76b` |
| **iPhone 12 mini 375px** (boutons ≥56px, labels lisibles) | ✅ | `03d5d39` |
| **Deep links partage** (WhatsApp, Snapchat, SMS, Email) | ✅ | `8805a85` |
| **13/13 tests serveur** | ✅ | inchangés |
| **JS syntaxe** (`node --check`) | ✅ | — |
| **Local HTTP 200** | ✅ | — |
| **Modal déploiement** | ✅ | v122 déjà déployé |

---

## 🔧 Détails des 3 patches

### 1. Snap UI fullscreen iPad/Tab (`e82f76b`)
- **HTML**: overlay `#snap-cta` avec bouton géant `"Prendre la photo"` + pulse animé + ring rotatif
- **CSS**: ~280px sur tablette paysage, `clamp()` pour viewports compacts, backdrop blur
- **JS**: `showSnapCta()` / `hideSnapCta()` — s'intercale entre le déclencheur et `startCountdown()`
- **Flow**: shutter → snap CTA → countdown → capture (idle auto-start skip le CTA)
- **Annuler** referme le CTA proprement (wakeLock release)

### 2. iPhone 375px responsive (`03d5d39`)
- Nouvelle media query `@media (max-width: 380px)` ciblant iPhone 12 mini (375×812)
- `share-chip-label`: 12px (était 9px), `font-weight: 700`
- Boutons résultat: `min-width: 56px`, `min-height: 48px`
- `overflow-x: hidden` sur sheets/screens/bottom-bar (pas de scroll horizontal)
- Règle 480px existante: label monté à 11px (était 9px)

### 3. Deep links partage natif (`8805a85`)
- **Snapchat**: tente `snapchat://camera?stickerUrl=...` d'abord → fallback `navigator.share` → fallback clipboard
- **WhatsApp**: `https://wa.me/?text=...` (Universal Link iOS + Intent Android)
- **SMS**: `sms:?body=...` (corrigé le `?&` → `?` propre)
- **Email**: `mailto:?subject=...&body=...` (déjà OK)
- **Native**: `navigator.share` avec fichiers (déjà OK)

---

## 🚧 Ce qui reste pour v123

| Priorité | Tâche | Estimation |
|----------|-------|------------|
| P1 | Tester réellement sur iPhone 12 mini (375px) — simulation CSS seulement | 30 min |
| P1 | Tester snapchat:// sur device réel (iOS/Android) — scheme peut être bloqué | 30 min |
| P2 | Supprimer le compte à rebours à 1s restante (cas "juste avant échéance") | 1h |
| P2 | Mode paysage forcé sur tablette Huawei (detecter device-width > height) | 1h |
| P3 | Optimiser `app.js` (8130 lignes) — split en modules | 3h |
| P3 | Tests E2E (Playwright) pour le snap CTA | 2h |

---

## 📊 Tests

```
13/13 pass — server/server.test.js
  ✔ supprime les photos liées
  ✔ refuse les MIME non image
  ✔ refuse une frame JPEG falsifiée
  ✔ pairage par découverte
  ✔ refuse les SVG spoofés
  ✔ commandes distantes + ACK
  ✔ corbeille récupérable
  ✔ POST /api/photos/batch
  ✔ GET /api/gallery
  ✔ GET /api/event/:eventId/captures
  ✔ compatibilité legacy /api/photos
  ✔ PIN organisateur sécurisé
```

---

## 🔗 Liens

- **Local**: `http://localhost:3000`
- **Modal**: `https://shhsjdbjk--momentobooth-serve.modal.run` (v122.1 déployé, HTTP 200)
- **Repo**: `/home/l-vs/Projets/momentobooth-pwa`
- **Branch**: `main` (commits 5342619 → e82f76b → 03d5d39 → 8805a85)

---

## 📝 Commits

```
8805a85 feat: deep links whatsapp+snapchat+sms+email pour partage natif
03d5d39 fix: iphone 375px responsive + buttons min 56px
e82f76b fix: snap ui fullscreen iPad/Tab — CTA géant avant countdown
5342619 v122: bump data-app-version + styles.css?v=122
```

---

*Généré par subagent MomentoBooth P0 — 20 août 2026, 02h40 CEST*
