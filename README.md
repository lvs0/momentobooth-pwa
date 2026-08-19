# MomentoBooth PWA — Photobooth mobile

Photobooth PWA optimisée iPhone : filtres temps réel style Snap, minuteur au tap,
fonds personnalisables, stickers visage (MediaPipe), partage QR / WhatsApp / SMS / email.

## Architecture — Modal uniquement

```
iPhone / tablette / invités
          │
          ▼
https://use97651--momentobooth-serve.modal.run
          │
          ▼
Serveur Node dans Modal
          ├── public/   → PWA, CSS, JS, MediaPipe, icônes
          ├── /app/photos → volume Modal persistant
          └── server.js  → API, QR, partage, GIF, ZIP, galerie
```

**L'application publique et les photos sont hébergées sur Modal.**
Le volume persistant `momentobooth-photos` conserve les photos et les sessions invitées
lorsque le conteneur s'arrête ou redémarre. Le serveur local et le tunnel Cloudflare MomentoBooth sont volontairement arrêtés et
 désactivés. Ils ne sont pas nécessaires au fonctionnement public.

## Déploiement et vérification

```bash
# Depuis ce dossier
modal deploy modal_app.py

# URL publique permanente de l'application
curl https://use97651--momentobooth-serve.modal.run/
```

Le déploiement est décrit dans `modal_app.py`. Il construit l'image Node, copie `public/`
et `server/`, monte le volume Modal puis expose le serveur sur HTTPS.

### Configuration distante Phase 3

La PWA lit `GET /api/remote-config`. La configuration est stockée dans
`photos/.remote-config.json` sur le volume Modal, avec un soutien désactivé par défaut.
Pour la modifier sans republier la PWA, configure `MOMENTOBOOTH_CONFIG_ADMIN_KEY` puis
utilise `POST /api/remote-config` avec le header `x-momento-config-key`. Les champs et
URLs HTTPS sont strictement validés par le serveur.

Pour un usage normal, ouvre uniquement :

```text
https://use97651--momentobooth-serve.modal.run
```

## Fonctionnalités

- **Caméra** : front/back (flip), plein écran, permission navigator
- **Looks photo** : 13 looks actuels (Original, Studio, Clean, Golden Hour, Rose, Ice, Cinéma, Film, Soft, Barbie, Party, N&B, Noir) — bandeau de sélection live et swipe pour changer
- **Minuteur** : tap n'importe où sur l'écran → 5/10/15/20 s → compte à rebours → flash → capture
- **Fonds** : dégradés (8), motif, image uploadée ; option chroma (retire fond vert)
- **Accessoires visage** : 16 accessoires + retrait (couronne, lunettes, cowboy, moustache, oreilles, cornes, lapin, etc.) positionnés via MediaPipe Face Landmarker (WASM local, offline)
- **Série photo** : 1 à 6 prises configurables ; le mode Rafale Flash+ sélectionne automatiquement la meilleure prise
- **Galerie** : IndexedDB locale + galerie serveur
- **Partage** : WhatsApp / SMS / email / QR code / partage natif iPhone (Web Share)
- **PWA** : manifest + service worker de purge des anciennes installations (réseau direct), icônes, safe-area iPhone

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/photos` | Upload photo (multipart `photo`), retourne `{id, publicUrl}` |
| GET | `/api/photos` | Liste des photos |
| GET | `/api/photos/:id` | Image |
| DELETE | `/api/photos/:id` | Supprimer |
| GET | `/api/photos/:id/qr` | QR code de la photo |
| GET | `/api/qr?url=...` | QR générique |

## Déploiement

Modal est l'unique cible de production actuellement utilisée. Le volume persistant
est configuré dans `modal_app.py` ; aucune exposition Cloudflare ou serveur local
n'est requise.

## Hardware conseillé pour un photobooth

- iPhone en kiosk (verrouiller Safari, mode lecture guidée)
- Ou tablette Android/iPad branchée sur un support
- Imprimante photo optionnelle (export depuis la galerie)
