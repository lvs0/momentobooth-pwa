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

## Sécurité (post-audit v83+)

Headers HTTP par défaut (toutes les routes) :

- `Content-Security-Policy` : strict, compatible MediaPipe WASM (`worker-src 'self' blob:`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
- `X-Frame-Options: DENY`

Autres protections :

- **Rate limit** `/api/photos` : 60 uploads / 5 min par IP (`express-rate-limit`)
- **Path canonicalisation** sur toutes les routes photos (`safePhotoPath`) — bloque les `..` et les caractères hors whitelist
- **`hostKey` non persisté** : la clé hôte du mode event n'est plus jamais écrite en `localStorage`. Elle reste en RAM ; si l'hôte recharge l'onglet, il doit la re-saisir dans le panneau (la clé lui a été affichée à la création avec un bouton Copier). Vol par XSS ⇒ accès limité à la session de l'onglet courant, l'attaquant doit déjà être dans le même origin
- **Purge défensive** au chargement : tout ancien `localStorage` contenant un `hostKey` est effacé

## Mode event (v84+)

Pour utiliser MomentoBooth à un événement réel (mariage, soirée, team-building) :

1. **Pré-flight** (J-1) : voir [`public/event/runbook.html`](public/event/runbook.html) — checklist matériel + technique
2. **Jour J** : appui long sur « Galerie » → « Accès invités » → « Créer le QR + lien » → copier la clé hôte → partager le QR
3. **Pendant** : les invités scannent, voient la galerie en direct
4. **Après** : « 📦 Exporter l'event » dans le panneau → ZIP avec photos + manifest

Endpoints clés :

- `GET /api/guest/:token/health` : dry-run (TTL, photoCount, server info) — sans clé
- `GET /api/guest/:token/export.zip` : ZIP de l'event (photos + manifest + lisez-moi) — avec `x-guest-host-key`
- Rate limit assoupli à **300 uploads / 5 min** quand un `x-guest-host-key` valide est envoyé

Voir [`SPEC.md`](SPEC.md) pour la spec complète.
