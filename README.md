# MomentoBooth PWA — Photobooth mobile

Photobooth PWA optimisée iPhone : filtres temps réel style Snap, minuteur au tap,
fonds personnalisables, stickers visage (MediaPipe), partage QR / WhatsApp / SMS / email.

## Architecture

```
iPhone / clients
      │  (URL permanente)
      ▼
Cloudflare Tunnel (momentobooth.zoe.dev)   ← passerelle permanente
      │
      ▼
Serveur Node local (port 8787)             ← ton PC, stockage local photos/
      ├── public/   → PWA (index.html, css, js, MediaPipe local, icons)
      ├── photos/   → images uploadées (stockage local)
      └── server.js → API + QR + static
```

**Les photos restent sur ton PC** (`~/Projets/momentobooth-pwa/photos/`).
L'URL fixe passe par Cloudflare (domaine zoe.dev) — pas besoin d'héberger sur Render.

## Démarrage

```bash
# Serveur (systemd)
sudo systemctl enable --now momentobooth.service

# Tunnel Cloudflare
sudo systemctl enable --now cloudflared-momentobooth.service

# Test local
curl http://localhost:8787/                 # → 200
curl -X POST http://localhost:8787/api/photos -F "photo=@x.jpg"
```

## Fonctionnalités

- **Caméra** : front/back (flip), plein écran, permission navigator
- **Filtres temps réel** : 12 filtres (N&B, Sépia, Vif, Froid, Chaud, Vintage, Noir+, Néon, Drame, Douce, Tropique) — bandeau de miniatures LIVE en haut (chaque vignette = vidéo avec son filtre), swipe pour changer
- **Minuteur** : tap n'importe où sur l'écran → 3/5/10s → compte à rebours → flash → capture
- **Fonds** : dégradés (8), motif, image uploadée ; option chroma (retire fond vert)
- **Stickers visage** : 10 stickers (👑🕶️👓💋🐝🌈❤️🎩⭐🥸) positionnés sur le visage via MediaPipe Face Landmarker (WASM local, offline)
- **Collage** : 1 / 2 / 4 photos (state.burst)
- **Galerie** : IndexedDB locale + galerie serveur
- **Partage** : WhatsApp / SMS / email / QR code / partage natif iPhone (Web Share)
- **PWA** : manifest + service worker (offline-first), icônes, safe-area iPhone

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/photos` | Upload photo (multipart `photo`), retourne `{id, publicUrl}` |
| GET | `/api/photos` | Liste des photos |
| GET | `/api/photos/:id` | Image |
| DELETE | `/api/photos/:id` | Supprimer |
| GET | `/api/photos/:id/qr` | QR code de la photo |
| GET | `/api/qr?url=...` | QR générique |

## Render (option B)

`render.yaml` inclus si tu préfères tout héberger dans le cloud (⚠️ photos sur Render,
pas sur le PC). Déploiement : push sur GitHub → New Web Service → import → Render
lit `render.yaml`. L'option A (Cloudflare tunnel) garde les photos sur ton PC.

## Hardware conseillé pour un photobooth

- iPhone en kiosk (verrouiller Safari, mode lecture guidée)
- Ou tablette Android/iPad branchée sur un support
- Imprimante photo optionnelle (export depuis la galerie)
