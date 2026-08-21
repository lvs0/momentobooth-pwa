---
name: photomaton-v125-spec
description: Spéc complète de la photothèque v125 + remote caméra iPhone→tablette pour Lévy. À lire avant de toucher à la galerie, l'aperçu caméra, ou la transmission iPhone→tablette.
---

# Spéc Photobooth Mode Borne — v125

## Vision (Lévy, 2026-08-21)

Déployer MomentoBooth sur une vraie borne physique :
- iPhone 11 fixé → **caméra arrière**, contrôle distant
- Tablette Huawei (ou iPad en repli) fixée → **interface principale** (paysage)
- Le tout dans un photomaton, avec qualité de transmission, zéro surprise

## Problèmes actuels (à résoudre en v125)

### 1. Photothèque/galerie : scroll infini → pagination à flèches
**Avant** : scroll vertical/horizontal d'une grille dense, pas adapté à un écran de borne fixe.
**Après** : carrousel d'images **plein écran**, une photo à la fois, navigation par flèches gauche/droite.

UX précise :
- Page = 1 photo plein écran (centrée, max 80% hauteur, ratio respecté)
- Header : compteur "X / N" (ex: "12 / 28")
- Footer : flèche gauche ‹ (cachée si page 1) + flèche droite › (cachée si dernière page)
- Tap sur la photo = retour à la grille (ou ouvre un détail)
- Swipe gauche/droite sur tactile = change de page
- Touche flèche clavier ←/→ = change de page
- Bouton "Tout sélectionner" + "QR de la sélection" = export batch

### 2. Transmission iPhone → tablette : qualité et stabilité
**Avant** : WebRTC P2P (socket.io) avec frames JPEG fragmentés. iOS limite la taille des messages (~64KB par chunk), ça casse sur les gros flux.

**Stratégies à explorer (par ordre d'effort)** :
1. **Réduire la résolution côté iPhone** : `getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 } })` au lieu de fullHD
2. **Compression hardware** : `track.applyConstraints` ou `OffscreenCanvas` côté iPhone avant envoi
3. **WebCodecs API** (iOS 17+) : encoder en H.264 hardware, envoyer des chunks
4. **WebSocket binaire** au lieu de socket.io string : frames JPEG complets (≤ 200KB) en binaire
5. **Polling HTTP** : iPhone POST `/api/camera/frame` toutes les 100ms avec multipart, tablette GET la dernière. Plus simple, plus stable, latency contrôlée.
6. **Service Worker côté iPhone** : pour garder la caméra active même en background

**Recommandation v125** : approche 5 (polling HTTP) en parallèle du WebRTC. Si WebRTC drop, fallback sur polling. Le polling permet aussi de debug plus facilement.

### 3. Contrôle distant iPhone depuis tablette
Nouvelles actions à supporter :
- **Flip caméra** (avant/arrière) : bouton "🔄" sur la barre d'outils de la tablette
- **Zoom** : slider 1x-5x sur la tablette (`track.applyConstraints({zoom: ...})`)
- **Exposition** : slider -2 à +2 EV
- **Flash** : on/off/auto
- **Résolution** : 720p / 1080p / 4K (limité par iPhone)
- **Focus tap** : clic sur la preview → l'iPhone focus à cet endroit
- **Grid overlay** : règle des tiers sur la preview

Communication :
- Tablette → iPhone : commandes via socket.io `remote-command` channel
- iPhone → tablette : events `command-ack` + frames caméra

### 4. Stabilité et finition
- Tous les flows doivent avoir un état "stable" visible (pas de "chargement infini" sans timeout)
- Tous les boutons doivent être cliquables et testés sur iPhone 11 + iPad + Huawei
- Le serveur ne doit pas exposer de fonctionnalités bridées par Apple/Google
- Pas de "ça marche sur mon device" — tester sur les 3 cibles
- Documentation de chaque mode d'erreur possible (getUserMedia denied, socket disconnect, etc.)

## Architecture cible

```
iPhone (caméra arrière)
  ↓ WebSocket binaire (frames JPEG ≤ 200KB à 10fps)
  OU polling HTTP POST /api/camera/frame (toutes les 100ms)
  ↓
Serveur Node (Express)
  ├─ Stocke la dernière frame en mémoire (cache)
  ├─ Distribue aux tablettes connectées via SSE ou polling GET
  └─ API de contrôle : POST /api/camera/command (flip, zoom, etc.)
  ↓
Tablette (interface)
  ├─ Reçoit les frames via SSE ou polling
  ├─ Affiche preview live
  └─ Envoie commandes via POST /api/camera/command
```

## Priorités v125

1. **P0** : Refondre la galerie en mode pagination à flèches (le user-agent l'a demandé explicitement)
2. **P0** : Ajouter boutons de contrôle distant (flip, zoom, exposition, flash, résolution) sur la barre d'outils tablette
3. **P1** : Implémenter polling HTTP de frames en parallèle du WebRTC (fallback stable)
4. **P1** : Documenter le protocole de contrôle dans PROTOCOL.md
5. **P2** : Tester sur iPhone 11 réel + Huawei Tab + iPad (3 cibles, pas juste émulées)
6. **P2** : Ajouter indicateurs de qualité transmission (latence, fps, bitrate)

## À NE PAS FAIRE

- ❌ Brider l'app à cause des limitations Apple/Google : trouver des alternatives (polling, WebCodecs, etc.)
- ❌ Supprimer des fonctionnalités : l'app doit TOUT faire (capture, filtres 3D, stickers, donation, etc.)
- ❌ Cacher des bugs avec des `try/catch` vides : logger proprement
- ❌ Casser le serveur en prod : tester sur local d'abord, déployer ensuite

## Tests à faire avant chaque release

- [ ] Test capture complète (iPhone sim) → 1 photo, flash, son
- [ ] Test galerie : naviguer 28 photos avec flèches
- [ ] Test filtres : changer 5 filtres, vérifier preview
- [ ] Test paramètres : changer mode don, qualité, etc.
- [ ] Test transmission caméra : envoyer 10 frames, vérifier latence
- [ ] Test contrôle distant : flip, zoom, exposition
- [ ] Test responsive : 3 viewports (390, 1024, 1920) avec Playwright
- [ ] Test network : 3G, 4G, WiFi
- [ ] Test errors : pas de caméra, pas de permission, pas de réseau

## Fichiers à toucher pour v125

- `public/js/app.js` : refonte gallery render (pagination), ajout remote controls
- `public/js/phase3.js` : nouveau module remote-camera-v2 avec polling fallback
- `public/css/styles.css` : styles carrousel photo, remote control panel
- `public/index.html` : nouveaux éléments UI (carrousel, panel remote)
- `server/server.js` : nouvelles routes `/api/camera/frame`, `/api/camera/command`
- `server/camera-store.js` (nouveau) : cache dernière frame + distribution SSE
- `docs/PROTOCOL.md` (nouveau) : spec du protocole de contrôle
- `docs/PHOTOMATON-MODE.md` (nouveau) : guide d'install borne
