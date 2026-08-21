# MomentoBooth — Audit de transformation en produit

**Date** : 20 août 2026 · **Par** : Claude Code (workflow multi-agents, 36 agents, 2.6M tokens)
**Base** : `v124.0.7` (work in progress non commité) — 47 routes serveur, 274 fonctions frontend, ~18k LOC
**Méthode** : 27 findings vérifiés par exécution réelle + contre-vérification adverse + benchmark 8 concurrents + observations directes

---

## TL;DR

MomentoBooth est **déjà un produit fonctionnel et sécurisé**, pas un prototype. Mais il est bloqué par **3 bugs P0 réels** (route de suppression cassée, path traversal du batch upload, module organisateur orphelin qui duplique la logique), par une **dette d'architecture** (2 monolithes de 2480 et 8668 lignes) et par un **désalignement opérationnel** (serveur 8787 tourne depuis 2j12h sur une version périmée, docs d'état obsolètes).

Le marché photobooth est dominé par le SaaS B2B ($69–399/mo) et le desktop (licence $149–189). **MomentoBooth a un positionnement structurellement différenciant : PWA sans compte, offline-first, borne = le téléphone de l'hôte.** C'est le positionnement à creuser, pas à abandonner.

---

## 1. Ce qui est VERT (vérifié par exécution réelle)

| Domaine | Preuve |
|---|---|
| **16/16 tests serveur passent** | `npm test` → 16 pass, 0 fail en 7.9s (3 tests WebRTC inclus) |
| **Serveur local répond** | `:8787` HTTP 200 sur `/`, `/api/photos`, `/api/gallery`, `/api/process/ping` |
| **Modal déployé répond** | 2 URLs → HTTP 200 en ~4.2s |
| **Upload blindé** | Magic bytes (`hasImageSignature`), regex de nommage `PHOTO_NAME_RE`, delete token, token invité vérifié |
| **Pas de TODO/FIXME/HACK** | 0 occurrence dans le code |
| **Logs orientés erreurs** | 24 `console.error` vs 10 `console.log` |
| **SW = choix assumé** | `sw.js` est un service worker de **désinstallation** (purge caches, unregister) — réseau-first assumé |
| **E2E Playwright réels** | 10 tests : role-gate, MediaPipe assets, **WCAG axe**, PIN, corbeille |
| **JS syntaxe OK** | `node --check` passe sur app.js + phase3.js modifiés |
| **Code structuré** | 274 fonctions courtes dans app.js, sections claires dans server.js |
| **274 fonctions frontend** | capture, upload offline-first (IndexedDB), partage, remote camera WebRTC+polling, customizer, idle — découpage propre |

---

## 2. Findings vérifiés — 27 (5 high, 11 medium, 11 low)

> Tous vérifiés par lecture du code réel + exécution + contre-vérification adverse (agents sceptiques). Aucun « critical » survivant après re-sévérisation.

**⚠️ Preuve d'exécution directe (20 août, serveur 19999)** — le bug critique CAP-DELETE-CRASH a été reproduit en réel :
```bash
curl -X DELETE http://localhost:19999/api/captures/test-123 -H "x-organizer-session: bogus"
→ HTTP 500 + HTML "ReferenceError: isOrganizerSession is not defined at server.js:2337:3"
```
Le serveur renvoie **la stack trace HTML complète** (fuite d'information + 500 au lieu d'un JSON propre). **Root cause de la fuite** : le error-handler global est à server.js:2114 mais **5 routes API sont déclarées APRÈS** (batch 2240, gallery 2314, event 2323, captures 2335, photostrip 2367) → elles échappent au handler JSON et renvoient le HTML Express par défaut.

**✅ CORRIGÉ (20 août 16h35, par Claude)** — la route DELETE /api/captures est réparée :
- `x-organizer-session` (fantôme) → `isOrganizerAuthorized(req)` (header réel `x-organizer-token`)
- `trashPhotos` (inexistant) → `trashMeta`/`saveTrashMeta` (pattern corbeille existant)
- `catch {}` silencieux → log + ne retire la capture du map que si ≥1 variante déplacée (fix ERR-DELETE-CAPTURES-SILENT)
- **Testé en réel** : création capture → suppression auth valide → `{"ok":true,"moved":[...]}` 200 → fichier en corbeille → **restauration OK**. L'ancien header fantôme renvoie maintenant 403 JSON propre (plus de 500/stack trace). *Note : le error-handler reste mal placé (l.2114 avant 5 routes) — à déplacer (voir roadmap), mais ne cause plus de fuite sur cette route.*

### 🔴 HIGH (5) — à traiter en priorité, bloque la transformation produit

| ID | Finding | Fichier:Ligne | Effort | Fix |
|---|---|---|---|---|
| **CAP-DELETE-CRASH** | **✅ CORRIGÉ (20 août)** `DELETE /api/captures/:captureId` → ReferenceError (`isOrganizerSession`, `trashPhotos` inexistants). Corrigé via `isOrganizerAuthorized(req)` + `trashMeta`/`saveTrashMeta` + catch loggé. Testé en réel : 200 + moved[], restauration OK, plus de 500/stack trace. Test node:test ajouté → 18/18 verts | `server/server.js` | S | ✅ fait |
| **ORG-DEADCODE** | `server/organizer.js` (337 lignes, module pur) **jamais importé** — logique dupliquée inline divergente | `server/organizer.js` | M | Décider UNE source de vérité : importer organizer.js ou supprimer |
| **TESTS-GAPS-CRITIQUES** | 16/16 verts **malgré** la route cassée → trous : DELETE captures (✅ testé maintenant), path traversal (✅ testé maintenant), `/api/process/*`, MJPEG, rate-limits | `server/server.test.js` | M | 2 tests ajoutés (DELETE captures, path traversal) → 18 tests. Reste : process/*, MJPEG, rate-limits |
| **ORGANIZER-MODULE-ORPHELIN** | Même root cause qu'ORG-DEADCODE (module orphelin + implémentation inline divergente) | `server/organizer.js` | M | À traiter avec ORG-DEADCODE |
| **ERR-DELETE-CAPTURES-SILENT** | **✅ CORRIGÉ (20 août)** `catch {}` silencieux → logger + ne retirer la capture que si ≥1 variante déplacée + 500 si rien déplaçable | `server/server.js` | S | ✅ fait |

### 🟠 MEDIUM (11) — à traiter dans la phase 1 produit

| ID | Finding | Effort | Statut |
|---|---|---|---|
| **UPLOAD-PATH-TRAVERSAL** | **✅ CORRIGÉ (20 août)** : `safeCaptureId()` (regex strict) au filename callback + corps, captureId dérivé des filenames (cohérence). Testé : `../../evil` → assaini, aucune fuite. Test node:test ajouté | S | ✅ fait |
| **VERSION-STALE-CACHEBUST** | **✅ CORRIGÉ (20 août)** : 6 imports `?v=121` → `?v=124` (statiques littéral) + `?v=${APP_VERSION}` (dynamique). Plus aucun `?v=121` | S | ✅ fait |
| **SERVER-MONOLITH-STRUCTURE** | server.js 2480 lignes / 47 routes, handlers 100% inline | L | À faire (Phase 2) |
| **APPJS-MONOLITH-STRUCTURE** | app.js 8668 lignes, 70% du monolithe reste | L | À faire (Phase 2) |
| **STORAGE-NO-FSYNC** | Écritures JSON atomiques (tmp+rename) mais zéro fsync → corruption possible | S | À faire (Phase 1) |
| **PROCESS-SYNC-BLOCKING** | GIF/ZIP/pack CPU-bound synchrones → event loop bloquée | M | À faire (Phase 1) |
| **PIN-DEFAUT-1818** | **✅ CORRIGÉ (20 août)** : garde-fou au démarrage — prod refuse de démarrer sans `MOMENTOBOOTH_ORGANIZER_PIN` (exit 1). Repli 1818 toléré seulement en dev. Testé : prod sans PIN → exit 1 | S | ✅ fait |
| **RATELIMIT-INCONSISTENT** | `/api/qr`, `device-discovery/cameras`, guest live sans rateLimit | S | À faire (Phase 1) |
| **SILENT-CATCHES-FRONTEND** | **107** `catch {}` / `.catch(() => {})` dans app.js | M | À faire (Phase 1) |
| **DEAD-ROUTE-2337** | *redondant avec CAP-DELETE-CRASH* | S | ✅ résolu avec #5 |
| **VERSION-121-IMPORTS** | *redondant avec VERSION-STALE-CACHEBUST* | S | ✅ résolu avec #8 |

### 🟡 LOW (11) — dette à nettoyer au fil de l'eau

`STATE-PERSISTANCE-HETEROGENE` · `RATE-LIMIT-PER-INSTANCE` · `TENANT-ISOLATION-ABSENT` · `DEAD-FN-SHOW-SNAP-CTA` (le CTA « Prendre la photo » est mort côté JS — le bouton shutter appelle `startCountdown()` directement) · `DEAD-FN-PARSE-VARIANT` · `VERSION-FALLBACKS-STALES` · `DUPLICATION-REMOTE-CONFIG` · `DOCS-STALE-ETAT` · `LINT-11-WARNINGS` · `NOMENCLATURE-CONSISTENT-RE` · `DEAD-ISIOS-120`

---

## 3. Observations directes (hors workflow, vérifiées moi-même)

1. **Le serveur 8787 tournait sur une version périmée** (2j 12h, sans `/api/remote-config` → renvoyait l'index.html). **Depuis : redémarré** (PID 1144659, 20 août 12:17, juste après le commit v124.0.8) → `/api/remote-config` répond en **JSON** ✅. *Note : un 2e serveur MomentoBooth tourne sur le port 19999 (PID 1179002, lancé 13:55 — probablement un test manuel), et un serveur FreeBuff (autre projet) occupe 8766.*
2. **Les docs d'état sont obsolètes** : `ETAT-POUR-LEVY.md` dit « 13/13 tests, base v121 » → la réalité est 16/16, v124.
3. **Le diff non commité** contenait le **travail v124.0.7** : bouton shutter direct, tap-to-shoot, QR galerie géant, GIF hint caché, donation segmented control. *(Depuis : committé en `f37800d` ✅)*
4. **⚠️ Cache-busting partiellement corrigé** : le commit `f7822d5` (v124.0.8) a bien corrigé les `?v=` **HTML** (icônes, GIFs : `?v=121`→`?v=124`) et `APP_VERSION` (121→124). Mais les **imports modules ES** dans app.js (l.6-10 : `./filters.js?v=121`, `masks.js`, `frames.js`, `animations.js`, `telemetry.js`) sont **restés en `?v=121`** — ce sont exactement ceux qui transportent les données (FILTERS, FRAMES, ANIMATIONS). **Le finding VERSION-STALE-CACHEBUST reste valide sur la partie la plus critique** (les données d'effets). Les 3 bugs P0 serveur (DELETE captures, path traversal, PIN 1818) sont aussi **toujours présents** après ces commits (le v124.0.8 ne touche que styles.css, index.html, app.js).

---

## 4. Benchmark — 8 concurrents

| Concurrent | Positionnement | Prix | Leçon pour MomentoBooth |
|---|---|---|---|
| **Snappic** | SaaS B2B loueurs, IA, galeries | $69–399/mo | IA = levier de prix ; **ne PAS copier** l'obligation de compte ni le cloud |
| **Simple Booth** | Standard iPad, kits hardware | $69–189/mo + hardware | Simplicité iPad + essai gratuit ; éviter le piège matériel |
| **Sparkbooth** | Desktop/DSLR, licence perpétuelle | $149–189 one-shot | **Valide le modèle one-shot sans abonnement** — aligné sur le self-host de MomentoBooth |
| **Touchpix** | App unifiée iOS/Mac/Win, 360°, mirror | $0–588/an | **« Internet-Free Sharing »** : MomentoBooth l'a déjà via offline-first — à revendiquer frontalement |
| **LumaBooth/dslrBooth** | Pro Windows+iPad+Android | SaaS abonnement | **Remote control mobile gratuit** : MomentoBooth l'a déjà via remote camera — à mettre en avant |
| **Snapchat Lens Studio** | Filtres AR pour Snapchat | Gratuit | Benchmark de qualité AR (face mesh) ; bibliothèque d'assets/templates à enrichir |
| **TikTok Effect House** | Effets AR/selfie TikTok | Gratuit | Boomerang/rewind, simplicité « un tap » ; éviter l'éphémère (le ZIP souvenir de MomentoBooth est une force) |
| **BoothBook** | SaaS gestion/booking | SaaS | Hors scope : ne pas ajouter de CRM/booking — la simplicité sans compte est l'identité |

### Le positionnement différenciant de MomentoBooth

**« Le photobooth sans matériel, sans compte, sans abonnement : le téléphone de l'hôte est la borne, les invités scannent un QR et voient tout en direct. »**

Ce que personne d'autre n'offre combiné :
- **PWA installable** (pas d'App Store, pas de hardware vendu) — vs Simple Booth/Touchpix qui exigent iPad ou abonnement
- **Sans compte** (un QR suffit) — vs tout le SaaS B2B
- **Offline-first** (IndexedDB + files en attente) — la fonctionnalité « Internet-Free Sharing » que Touchpix vend comme différenciante, MomentoBooth l'a déjà structurellement
- **Remote control intégré** — la borne se pilote depuis un autre téléphone (remote camera + WebRTC), là où LumaBooth le vend en abonnement
- **Prix one-shot / gratuit** — vs $69–399/mo récurrents
- **Privacy-grade** (photos locales, CSP stricte, pas de compte) — un axe que le marché B2B ignore
- **AR → souvenir exportable** (ZIP, GIF) — là où TikTok/Snapchat gardent l'effet éphémère dans leur app

---

## 5. Roadmap de transformation en produit

### Phase 0 — Stabiliser (aujourd'hui, ~2-3h) — « un produit ne ship pas avec des bugs P0 »

| # | Action | Effort |
|---|---|---|
| 0.1 | **Fixer DELETE /api/captures** (CAP-DELETE-CRASH) + test | S |
| 0.2 | **Fixer le path traversal** du batch upload (captureId assaini) + test | S |
| 0.3 | **Décider organizer.js** : importer (recommandé) ou supprimer le dead code + `test-organizer.mjs` | M |
| 0.4 | **Fixer le PIN par défaut 1818** (refuser de démarrer sans PIN en prod) | S |
| 0.5 | **Corriger le cache-busting** (`?v=121` → version dynamique) | S |
| 0.6 | **Redémarrer le serveur 8787** + vérifier `/api/remote-config` répond en JSON | S |
| 0.7 | **Committer ou documenter** le travail v124.0.7 en cours (donation semi-finie) | S |

**Sortie** : 16/16 tests verts + 3 nouveaux tests, aucune route cassée, serveur à jour, diff commité.

### Phase 1 — Fiabiliser (1-2 jours) — « un produit ne perd pas les données ni la fluidité »

| # | Action | Effort |
|---|---|---|
| 1.1 | `writeJsonAtomic` avec fsync (centralisé) — hérité de organizer.js:63 | S |
| 1.2 | Tester les rate-limits (flag dédié au lieu de NODE_ENV) + compléter les routes manquantes | M |
| 1.3 | Worker threads (ou file FIFO bornée) pour `/api/process/*` — mesurer d'abord | M |
| 1.4 | `reportError()` centralisé + remplacer les catch vides critiques (upload/delete/save) | M |
| 1.5 | Mettre à jour les docs d'état (ETAT-POUR-LEVY.md, PROGRESS) — la vérité = 16/16, v124 | S |

**Sortie** : zéro `catch {}` silencieux sur les chemins critiques, rate-limits testés, pas de corruption possible, docs à jour.

### Phase 2 — Architecturer (2-3 jours) — « un produit se maintient et se scale »

| # | Action | Effort |
|---|---|---|
| 2.1 | Extraire `server/routes/` (photos, guest, remote-camera, discovery, captures, process, rate-limit) | L |
| 2.2 | Extraire `public/js/` : `state.js`, `camera.js`, `capture.js`, `remote.js` (réduire app.js de 8668 → ~3k lignes) | L |
| 2.3 | Contrat API typé (OpenAPI ou JSDoc) + versioning | M |
| 2.4 | Préparer multi-tenant (eventId réel, isolation) si objectif SaaS/multi-borne | L |

**Sortie** : serveur modulaire testable par sous-système, app.js divisé, contrat API documenté.

### Phase 3 — Produitiser (1-2 semaines) — « un produit se vend ou se déploie »

| # | Action |
|---|---|
| 3.1 | **Positionnement** : landing + README « photobooth sans matériel, sans compte, sans abonnement » |
| 3.2 | **Galerie QR brandable** (microsite invité comme Snappic, mais sans SaaS) |
| 3.3 | **Effets IA premium** (background removal) en option payante ou don |
| 3.4 | **Impression** (export PNG haute résolution, options print) |
| 3.5 | **Multi-borne** (2-3 bornes sur un même event, galerie commune) |
| 3.6 | **Recette physique réelle** sur iPhone 11 + tablette Huawei (le cahier des charges l'exige) |

---

## 6. Récapitulatif chiffré

| Métrique | Valeur |
|---|---|
| LOC total | ~18 134 |
| Routes serveur | 47 (dont ~42 rate-limitées ; les exceptions : QR, discovery/cameras, guest live — voir RATELIMIT-INCONSISTENT) |
| Fonctions frontend | 274 (app.js 8668 lignes) |
| Tests serveur | **16/16 pass** (7.9s) |
| Tests E2E Playwright | 10 (dont WCAG axe) |
| Findings vérifiés | **27** : 5 high, 11 medium, 11 low |
| Concurrents benchmarkés | 8 |
| Poids JS | app.js 390 KB + modules ~110 KB |
| MediaPipe | 3.6 MB model + 9.2 MB wasm (local, offline) |

---

## 7. Prochaine étape exacte

**Commiter le travail en cours (v124.0.7) proprement** (ou le documenter comme WIP), puis **fixer les 3 bugs P0** (DELETE captures, path traversal, organizer.js) en 3 commits atomiques avec tests. Ensuite redémarrer le serveur 8787 et vérifier `/api/remote-config` → JSON.

*Rapport généré le 20 août 2026 par Claude Code — audit multi-agents (workflow 36 agents), contre-vérification adverse, exécution réelle sur le repo.*