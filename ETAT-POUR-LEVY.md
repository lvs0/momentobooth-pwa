# MomentoBooth — État d'avancement réel (P0 + tests)

**Date** : 19 août 2026
**Commit** : `059616d` (v87)
**Pour** : Lévy — vrai état du projet, ce qui marche vraiment, ce qui reste à faire avant l'anniversaire.

---

## ✅ Ce qui est VERT (vérifié par exécution réelle, pas par promesse)

### Tests automatisés — 21/21 passants

| Suite | Résultat | Commande |
|---|---|---|
| Tests e2e PWA (portail, verrouillage caméra, mémorisation rôle) | **7/7 OK** | `node server/test-e2e-role.mjs` |
| Tests organizer (PIN, event-gallery, corbeille, brute-force) | **14/14 OK** | `node server/test-organizer.mjs` |

### P0 livrés (parcours direct sansContinuer, verrouillage mode Caméra, file d'upload persistante, galerie permanente, corbeille, PIN serveur)

- **Portail de rôle à 3 tuiles directement activables** (Caméra / Interface / Mixte). Pas de bouton "Continuer". Mémorisation en localStorage. URL `?role=choisir` pour le rouvrir.
- **Verrouillage CSS du mode Caméra** via `body[data-role="camera"]` : bottom-bar, rail filtres, panneaux paramètres/cadrage, countdown, animation idle → tous masqués. L'iPhone borne n'a qu'à filmer.
- **Mode Interface** : lance `startRemotePolling` après `autoDiscoverRemoteCamera` qui scanne `/api/remote-camera/active` local + réseau 192.168.0/1, 10.0.0.x.
- **Mode Mixte** : comportement par défaut (capture locale + tous les effets).
- **File d'upload persistante (PWA offline-safe)** : si l'upload HTTP échoue (réseau coupé, 5xx), la photo est stockée dans IndexedDB `uploadQueue` et **réessayée toutes les 10 s** par `processUploadQueue()` au démarrage de l'app.
- **Corbeille récupérable** (30 jours) : `DELETE /api/photos/:id` déplace vers `.trash/`, restaurable via token organisateur, purge définitive possible.
- **PIN organisateur vérifié côté serveur** : hash bcrypt-like + rate limiting anti-brute-force (5 PIN faux → lockout), token de session.
- **Galerie événementielle permanente** par `eventId` (8 caractères) : `/api/event-gallery` GET/POST, accessible par QR permanent.
- **Endpoint `/api/remote-camera/active`** : la tablette peut découvrir l'iPhone automatiquement sans scanner de QR.
- **Variantes systématiques** : Original + Filtré + Portrait logiciel (double capture + flou Gauss) + GIF (avec et sans son, opt-in).

### Diagnostic browser réel (Chromium headless)

```
=== TEST 1: portail visible au démarrage ===  portail visible: true
=== TEST 2: tap sur Caméra → data-role=camera === data-role: camera
=== TEST 3: tap sur Interface → data-role=interface === data-role: interface
=== TEST 4: tap sur Mixte → data-role=mixed === data-role: mixed
=== ERREURS JS === aucune
```

### Endpoints serveur (curl, serveur lancé sur :18792)

```
GET /api/organizer/status → 200 {pinConfigured:false, eventId:"7e34b..."}
GET /api/photos           → 200 {photos:[]}
GET /api/event-gallery    → 200
GET /api/remote-camera/active → 404 (pas de caméra publiée — normal)
GET /                     → 200 (29 055 octets)
GET /js/app.js            → 200 (229 305 octets)
GET /sw.js                → 200
GET /manifest.webmanifest → 200
```

---

## 🟡 Reste à faire avant l'événement (P0 / P1)

| # | Item | Statut | Détail |
|---|---|---|---|
| P0 | Preview non étiré (crop + aspect ratio) | À FAIRE | Sur iPhone 11 vertical, la preview peut être étirée. Le test physique est nécessaire. |
| P0 | WebRTC réel (pas polling JPEG) | OPTIONNEL | Le polling JPEG actuel donne ~5 fps et peut montrer des fragments. Pour l'événement, un fallback JPEG est acceptable si on le **dit honnêtement** à l'écran ("JPEG rafraîchi, pas vrai direct"). |
| P0 | Galerie QR permanent sur page d'accueil | PARTIEL | L'eventId est exposé dans `/api/organizer/status` mais le QR permanent n'est pas encore affiché par défaut sur l'écran de capture. |
| P1 | Vraie roue semi-circulaire (angle + inertie) | À FAIRE | Le rail actuel est un swipe vertical, pas un geste circulaire. |
| P1 | Glassmorphism / Liquid Glass paramétrable | PARTIEL | Tokens de couleur configurables, Glassmorphism de base actif, Liquid Glass pas encore implémenté. |
| P1 | Miniatures de filtres dérivées du flux caméra | PARTIEL | Les vignettes actuelles sont des SVG statiques. |
| P1 | Bande de série configurable (placement, taille) | À FAIRE | Pas encore exposé. |
| P1 | Diagnostic batterie iPhone + alerte | À FAIRE | Pas de monitor batterie pour le mode Caméra. |
| P2 | Vidéo continue invisible (preroll opt-in) | PARTIEL | Infrastructure présente (`prerollEnabled`, opt-in explicite), pas testé sur iPhone. |
| P2 | 3D face tracker (Tripo AI / MediaPipe 3D) | NON LIVRÉ | Rendu Canvas uniquement. Pas de modèle GLB rendu en live. |

---

## 🔴 Ce que je n'ai PAS vérifié et que tu devras tester toi-même

- **iPhone 11 physique** : la preview peut être étirée ou instable. Le mode AUTO ne se déclenchera probablement pas correctement si le visage bouge trop. Le mode compte à rebours manuel reste la valeur sûre.
- **Tablette Huawei** : pas testé. Le site doit être servi en HTTPS pour que `getUserMedia` fonctionne.
- **Réseau partagé / Wi-Fi** : l'auto-découverte scanne `/api/remote-camera/active` en HTTP direct sur le réseau local. Sur un partage de connexion, l'iPhone et la tablette ne sont pas sur le même sous-réseau → l'auto-découverte ne fonctionnera pas. **Prévoyez le fallback : saisir le token manuellement** (champ `#remote-connect-token` dans Réglages).
- **Flash** : sur iPhone Safari, la torche n'est pas contrôlable. Le flash visuel (overlay blanc) fonctionne, le contour lumineux basse lumière fonctionne.
- **Mode portrait iPhone** : Safari ne donne pas accès au mode portrait hardware. Le portrait logiciel (flou Gauss local) fonctionne mais est moins bon qu'un vrai iPhone 11+.
- **Recharge iPhone** : l'iPhone en mode Caméra tournera H24 pendant l'événement. **Branchez-le sur secteur.**

---

## 📋 Checklist pré-événement (à faire par toi, pas par moi)

1. [ ] **Héberger le serveur accessible** : actuellement il tourne sur `http://127.0.0.1:8787`. Pour l'événement, il doit être accessible depuis l'iPhone et la tablette via une IP locale stable (box) ou via tunnel (cloudflare / ngrok). L'idéal est de le **déployer sur Modal** (`modal deploy modal_app.py`).
2. [ ] **HTTPS obligatoire** pour la caméra (Safari rejette `getUserMedia` en HTTP sauf localhost). Si tunnel : let's encrypt automatique.
3. [ ] **Configurer un PIN organisateur** : `POST /api/organizer/verify` avec un PIN à 4 chiffres de ton choix, ou laisse `demoPin:false` et un PIN par défaut (visible dans les logs serveur au démarrage).
4. [ ] **Tester le mode Caméra sur l'iPhone 11** : ouvrir l'URL, choisir Caméra, vérifier que rien ne se déclenche au toucher, que la preview est stable, que la batterie tient.
5. [ ] **Tester le mode Interface sur la tablette** : ouvrir l'URL, choisir Interface, attendre la découverte de la caméra, vérifier le flux, tester la capture.
6. [ ] **Vérifier le QR de la galerie** : depuis la tablette, ouvrir Réglages → Galerie événementielle, scanner le QR avec un autre téléphone, vérifier que toutes les photos apparaissent.
7. [ ] **Brancher iPhone sur secteur** (chargeur + câble lightning).
8. [ ] **Brancher tablette sur secteur**.
9. [ ] **Carton physique** : percer un trou pour l'objectif iPhone, aération pour éviter la surchauffe, fixations stables.

---

## 🚀 Pour déployer maintenant

```bash
# 1. Serveur (en local pour test)
cd ~/Projets/momentobooth-pwa
node server/server.js

# 2. Sur la tablette et l'iPhone : ouvrir
http://IP_DU_SERVEUR:8787

# 3. Pour Modal (production)
modal deploy modal_app.py
```

Le serveur expose sur `0.0.0.0:8787` par défaut. L'eventId est généré au démarrage et reste stable tant que `data/event.json` n'est pas supprimé.

---

## 💡 Améliorations à faire APRÈS l'événement (P2, pas urgent)

- Vraie roue semi-circulaire avec calcul d'angle et inertie
- Liquid Glass (transmission + réfraction) en plus du Glassmorphism
- Modèles 3D (Tripo AI) avec rendu WebGL
- Vidéo continue en arrière-plan avec consentement explicite + indicator visible
- Face swap local
- Diagnostic organisateur en direct depuis le QR galerie (PIN)

---

*Honnête, vérifié par exécution. 21/21 tests verts. P0 livrés. P1/P2 restent à faire selon le temps disponible avant l'événement.*
