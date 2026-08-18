# MomentoBooth — SPEC

> Photobooth PWA + serveur Node pour événements (mariage, soirée, team-building).
> Une borne (iPhone) capture, les invités voient la galerie en direct sur leur téléphone.

---

## Vision

Donner à n'importe qui (même non-tech) le moyen de tenir un photobooth clé en main à un événement réel, sans compte, sans cloud tiers, sans Wifi, avec un minimum d'emmerdes. Le téléphone de l'hôte = la borne. Les invités scannent un QR et voient tout en direct. À la fin, un ZIP.

## Phases

| Phase | Statut | Contenu |
|---|---|---|
| Capture + filtres + partage photo | ✅ livré | Caméra MediaPipe, 9 filtres, GIF, export PNG/JPG/GIF, PWA installable |
| Galerie hôte | ✅ livré | Liste, suppression, export ZIP global, enregistrer toutes |
| **Mode event** | ✅ livré | Session privée 8h, QR public, galerie invités en lecture seule, aperçu caméra opt-in |
| **Sécurité privacy-grade** | ✅ livré (C) | CSP stricte, rate limit, hostKey en RAM, path canonicalisation, headers complets |
| **Event clés en main** | ✅ livré (A) | Dry-run, export ZIP event, runbook imprimable, rate limit assoupli event |

## Mode event — spec détaillée

### Endpoints

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/guest/sessions` | — | Crée une session (token 32+ chars, hostKey 32 chars, TTL 8h) |
| `GET` | `/api/guest/:token/gallery` | — | Liste des photos uploadées avec cette session |
| `GET` | `/api/guest/:token/photos/:id` | — | Sert la photo (read-only) |
| `GET` | `/api/guest/:token/health` | — | Dry-run : TTL restant, photoCount, server info, liveActive |
| `GET` | `/api/guest/:token/live` | — | Dernière frame JPEG (204 si pas de frame < 8s) |
| `POST` | `/api/guest/:token/live` | `x-guest-host-key` | Publie une frame JPEG (champ `frame`, cadence min 900ms) |
| `DELETE` | `/api/guest/:token/live` | `x-guest-host-key` | Supprime la frame live |
| `GET` | `/api/guest/:token/export.zip` | `x-guest-host-key` | ZIP : photos + manifest + lisez-moi |
| `DELETE` | `/api/guest/:token` | `x-guest-host-key` | Supprime la session + ses photos |

### Authentification

- **Aucun compte.** Un secret unique par event : la `hostKey` (32 chars, générée à la création).
- La `hostKey` n'est **jamais** persistée côté client (`sessionStorage` uniquement, jamais `localStorage`).
- L'invité a besoin du `token` (dans le QR) pour la galerie publique.
- L'hôte a besoin de `token` + `hostKey` pour publier/supprimer/exporter.

### Rate limits (par IP)

| Profil | Limite | Fenêtre |
|---|---|---|
| Client par défaut (`/api/photos`) | 60 uploads | 5 min |
| Client event (avec `x-guest-host-key` valide) | 300 uploads | 5 min |
| Live frame (`/api/guest/:token/live`) | 1 frame | 900 ms |

### Sécurité

- **CSP** stricte, compatible MediaPipe WASM
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self)`, `X-Frame-Options: DENY`
- **Path canonicalisation** sur toutes les routes photos
- **hostKey** jamais persistée (effacement défensif au chargement de l'app)
- Sessions persistées dans `photos/.sessions.json` (survit à un restart, pas à un scale-to-zero serverless)

### Limites connues

- **8h TTL** par event (à recréer au-delà)
- **300 photos / 5 min** par IP en event (au-delà : 429)
- **Pas de vidéo** : photos + JPEG périodique (1×/s) si activé
- **Pas de comptes** : la clé hôte est le seul secret. Si l'hôte la perd, il perd le contrôle de l'event (mais les invités gardent l'accès en lecture)

### Runbook opérationnel

→ [`public/event/runbook.html`](public/event/runbook.html) (imprimable, autonome)

Phases :
1. **Pré-flight (J-1 à J-3)** : checklist matériel + technique (curl, IP publique, tunnel Cloudflare)
2. **Jour J** : installation borne, créer event, copier clé hôte, test minute zéro
3. **Pendant** : mode normal, gestion coupure réseau, suppression photo
4. **Après (J+1)** : export ZIP, purge manuelle
5. **Dépannage** : 6 cas fréquents (event expiré, galerie pas à jour, rate limit, systemd, caméra iOS, hostKey perdue)
6. **Limites** : rappelées

## Stack technique

| Couche | Tech |
|---|---|
| Frontend | PWA vanilla JS + modules ES, service worker offline-first |
| Caméra / filtres | MediaPipe Face Landmarker (WASM) + canvas |
| Encodage | `gifenc` (GIF pur JS), `fflate` (ZIP pur JS), `jpeg-js` (decode), `pureimage` (compose) |
| Backend | Node 20+, Express, Multer, `express-rate-limit` |
| Stockage | Disque local (`photos/*.jpg`), volume persistant pour Modal |
| Déploiement | `systemd momentobooth.service` (port 8787), tunnel Cloudflare pour accès externe |

## Hors scope (volontairement)

- Authentification utilisateur (overkill pour un photobooth d'event)
- Vidéo WebRTC (CPU/RAM iPhone, compat Safari)
- Stockage cloud (un événement = local + export ZIP à la fin)
- Multi-tenant (1 service = 1 instance = 1 site ; pour un SaaS il faudrait une refonte)
- Synchronisation entre plusieurs bornes (overkill pour un seul event à la fois)
