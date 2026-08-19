# MomentoBooth — État d'avancement réel (P0 + P1)

**Date** : 19 août 2026
**Dernier commit** : `9b65dd3` (Mur des photos + fallback serveur)
**Base** : v121 (zip source Lévy) — propre, au-dessus de v86
**Pour** : Lévy — vrai état du projet, ce qui marche vraiment, ce qui reste à faire.

---

## ✅ Ce qui est VERT (vérifié par exécution réelle, pas par promesse)

### Tests automatisés — 13/13 passants

| Suite | Résultat | Commande |
|---|---|---|
| Tests serveur (v121 originaux + 4 nouveaux) | **13/13 OK** | `cd server && npm test` |

### P0 livrés

- **eventId stable + galerie événementielle permanente** : `POST /api/photos/batch` accepte un `eventId` (ex. `levy-26ans`) et un `captureId` (groupe de variantes). `GET /api/gallery` retourne toutes les captures anti-chronologique **sans token invité** — accessible par QR permanent. `GET /api/event/:eventId/captures` filtre par événement. Indépendant des sessions invités temporaires (8h). *(commit e5be03e)*
- **4 variantes serveur** : `POST /api/photos/batch` accepte jusqu'à 5 fichiers simultanés : `original`, `filtered`, `portrait`, `gif_silent`, `gif_sound_vid` (MP4/WebM pour le son, GIF ne supportant pas l'audio). Toutes liées par le même `captureId`. *(commit e5be03e)*
- **Preview non étiré** : aspect-ratio adaptatif sur le conteneur `#camera` — le flux caméra iPhone (9:16 portrait) ne se croppe plus sur un écran paysage. `syncCameraPresentation()` fixe l'aspect-ratio du parent depuis `videoWidth/videoHeight` via `loadedmetadata`. `.customizer-preview video` passe de `object-fit: cover` à `contain`. *(commit c922c9b)*
- **Mur des photos en écran de veille** : scène idle 5 (`populateIdleWallScene`) — le mur existait déjà dans v121 mais ne chargeait que depuis IndexedDB locale. Ajout d'un fallback `/api/gallery` quand < 3 photos locales → le mur se peuple avec les vraies photos de l'événement même sur un appareil invité qui n'a jamais capturé. *(commit 9b65dd3)*

### P0 déjà présents dans v121 (non touchés, vérifiés)

- **Corbeille récupérable** (30 jours) : `DELETE /api/photos/:id` → `.trash/`, restaurable via token organisateur, purge définitive possible.
- **PIN organisateur vérifié côté serveur** : hash + rate limiting anti-brute-force (5 PIN faux → lockout), token de session.
- **Remote camera** : sessions, pair, frame (JPEG polling), command, ack.
- **Device discovery** : `/api/device-discovery/cameras` + announce + pair.
- **Guest sessions** : `/api/guest/:token/live/stream` (8h), galerie invité par token.
- **Pack Lens** : `POST /api/process/pack` fait Original + Filtré + Portrait en une seule upload.
- **QR code** : `GET /api/photos/:id/qr`.

---

## ❌ Ce qui manque encore (P0 restant)

### WebRTC — flux direct au lieu de JPEG fragmenté

**Le mode Interface (caméra distante) utilise toujours du polling JPEG** : l'iPhone capture des frames → POST sur `/api/remote-camera/:token/frame` → la tablette GET ce JPEG et le décode dans un canvas.

C'est le "faux JPEG fragmenté" que Lévy a dénoncé. La vraie solution c'est **WebRTC** (signaling + STUN + peer connection + ICE candidates). C'est un **gros** chantier — pas un patch d'un soir. À planifier séparément.

**Workaround actuel** : le polling JPEG marche, il est juste moins fluide (1-2 fps) et plus gourmand en bande passante qu'un vrai flux WebRTC.

---

## 📊 Métriques

| Fichier | Lignes | Rôle |
|---|---|---|
| `server/server.js` | 2421 | API Express (50+ routes) |
| `server/server.test.js` | 500 | 13 tests |
| `public/js/app.js` | 8134 | PWA frontend (capture, filtres, idle, remote) |
| `public/css/styles.css` | 2359 | Styles |
| `public/index.html` | 671 | DOM |

**Total** : ~14 085 lignes.

---

## 🔧 Infrastructure

- **Service systemd** : `momentobooth.service` (port 8787)
- **Démarrage** : `cd ~/Projets/momentobooth-pwa/server && PORT=8788 node server.js`
- **Tests** : `cd server && npm test` (13/13 en 7s)
- **Photos** : `~/Projets/momentobooth-pwa/photos/` + `.trash/` + `captures.json`

---

## 📋 Checklist pré-événement (si tu veux faire une dernière passe)

1. **Déployer sur la borne** : `git pull` + `systemctl --user restart momentobooth.service`
2. **Tester le QR galerie** : ouvrir `/api/gallery` dans le browser → les photos de test apparaissent
3. **Tester le batch** : `curl -X POST /api/photos/batch -F original=@photo.jpg -F eventId=levy-26ans`
4. **Tester le mur** : laisser la borne idle 30s → le mur doit se peupler depuis `/api/gallery`
5. **Activer `idleEnabled`** dans les settings (off par défaut — nécessite MediaPipe pour le réveil par visage, mais le mur marche sans)

---

## 🎯 Prochaines étapes (post-événement)

- **WebRTC** pour remplacer le polling JPEG (P0 pour la fluidité du mode Interface)
- **GIF sonore** : le serveur accepte `gif_sound_vid` (MP4/WebM) mais le frontend ne l'enregistre pas encore (MediaRecorder nécessaire)
- **Mur des photos plein écran** : actuellement limité à 5 vignettes en grille — pourrait devenir un carousel plein écran avec Ken Burns
- **Upload automatique des variantes** : le frontend capture encore en `POST /api/photos` (single), pas en `POST /api/photos/batch` — il faut câbler le batch côté app.js
