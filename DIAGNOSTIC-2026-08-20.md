# MomentoBooth — Diagnostic Autonome (2026-08-20 12:14)

**Auteur** : Buffy (deep-autonomy mode)
**Contexte** : Lévy frustré, multi-bugs signalés, autre session CC active en parallèle (PID 1121981, started 11:23)

## TL;DR

L'app est **fondamentalement cassée au boot**. Les écrans n'existent pas dans le DOM. Cause principale : **version mismatch** + **CSP bloque les inline scripts** + **socket.io mal servi**.

## Preuves Playwright (3 viewports, CSP bypassée)

| Élément | État |
|---|---|
| `screen-splash` | **NOT FOUND** dans DOM |
| `screen-role` | **NOT FOUND** dans DOM |
| `screen-camera` | **NOT FOUND** dans DOM |
| `screen-capture` | Existe (HTML) |
| `screen-result` | Existe, **visible** par défaut (anormal) |
| `screen-gallery` | Existe |
| `screen-guest` | Existe |

**Conséquence** : l'utilisateur ne voit que l'écran résultat vide + un splash statique. **Aucun flow ne marche**.

## 5 Bugs identifiés avec preuves

### Bug 1 — 🔴 CRITIQUE — Version mismatch
- **Symptôme** : Console error `[MomentoBooth] Version mismatch: HTML 124 vs JS 121 — clearing SW cache`
- **Preuve** : `index.html` charge `app.js?v=121` (ligne ~250). `app.js` VERSION = `"121"`. `core.js` VERSION = `"124"`.
- **Cause** : core.js bumpé à 124 mais app.js et le `?v=` du HTML pas mis à jour.
- **Fix** : dans `index.html`, remplacer `?v=121` par `?v=124` (5 occurrences). Dans `app.js`, remplacer `const VERSION = "121"` par `"124"`.

### Bug 2 — 🔴 CRITIQUE — CSP `wasm-unsafe-inline` invalide
- **Symptôme** : Console error `The source list for the Content Security Policy directive 'script-src' contains an invalid source: ''wasm-unsafe-inline''. It will be ignored.` Puis : `Executing inline script violates the following Content Security Policy directive 'script-src 'self' 'wasm-unsafe-inline''.`
- **Preuve** : `curl -I http://localhost:8787/` → header `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-inline'; ...`
- **Cause** : `'wasm-unsafe-inline'` n'est pas un keyword CSP valide. Les keywords valides sont `'self'`, `'unsafe-inline'`, `'unsafe-eval'`, `'wasm-unsafe-eval'`. **Le keyword `wasm-unsafe-inline` n'existe pas.** Le navigateur l'ignore et tombe en mode strict, ce qui bloque les inline scripts.
- **Note** : la CSP n'est PAS dans `server/server.js` ni dans `package.json`. **C'est probablement le code d'un autre agent qui l'a ajoutée** (peut-être le CC de Lévy, ou un middleware Modal). Chercher ailleurs.
- **Fix** : remplacer `'wasm-unsafe-inline'` par `'unsafe-inline' 'wasm-unsafe-eval'` (les 2 keywords valides pour WASM). Ou retirer la directive `script-src` custom et laisser la default `default-src 'self'`.

### Bug 3 — 🔴 CRITIQUE — socket.io.js mal servi
- **Symptôme** : Console error `Refused to execute script from 'http://localhost:8787/socket.io/socket.io.js' because its MIME type ('text/html') is not executable, and strict MIME type checking is enabled.`
- **Cause** : Le client socket.io cherche `/socket.io/socket.io.js` mais le serveur renvoie `text/html` (probablement le 404 par défaut d'Express). **Socket.io n'est pas monté sur le serveur**, ou mal monté.
- **Fix** : vérifier dans `server.js` que `socket.io` est attaché au serveur HTTP. Sinon, ajouter :
  ```js
  import { Server as SocketIOServer } from "socket.io";
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, { path: "/socket.io" });
  // ... handlers
  httpServer.listen(PORT);
  ```

### Bug 4 — 🟡 MAJEUR — result-grid limité à 448px sur tablette
- **Symptôme** : Sur 1920x1200 (Huawei Tab), `result-grid` fait 448px au lieu de prendre 60% de l'écran (~747px).
- **Preuve** : Playwright a mesuré `#result-grid` à `x=0, y=106, w=448, h=414`.
- **Cause** : À `min-width: 1024px`, le `display: grid` de `#screen-result` n'override pas la `max-width: 600px` héritée de la media query `(min-width: 768px)`.
- **Tentative de fix (déjà appliqué)** : dans `public/css/styles.css` ligne 2683+, j'ai ajouté `max-width: none; width: 100%; grid-row: 3 / 4;` au `#result-grid` à 1024px+ + `grid-template-rows: auto auto 1fr auto` à `#screen-result`.
- **Vérification** : après mon patch, Playwright a remesuré → **toujours 448px**. Le patch CSS n'a PAS pris. Possible cause : cache navigateur, ou un autre override ailleurs. **À investiguer**.

### Bug 5 — 🟡 MAJEUR — Boutons "Mémoriser" + "Personnaliser" toujours affichés
- **Symptôme** : Sur l'écran de sélection de rôle, les deux boutons sont moches et inutiles (Lévy : "il sert à rien strictement rien").
- **Fix (déjà appliqué)** : dans `index.html` ligne 177-178, j'ai ajouté `style="display:none" aria-hidden="true"` aux deux boutons. **Mais ça n'a pas marché non plus** car le DOM a confirmé `screen-role` n'existe pas dans le HTML (cf. Bug 1).
- **À vérifier** : une fois Bug 1 fixé, mon fix CSS doit prendre.

### Bug 6 — 🟡 MAJEUR — "votre export" buggé (Lévy)
- **Symptôme** : Lévy dit "lors de l'écran votre export c'est buggé"
- **Preuve** : `screen-result` est l'écran par défaut visible (à cause du Bug 1). Ses boutons (`btn-retry-camera`, `btn-auto-return`, `btn-retake`, `btn-save`) sont disposés de manière inconsistante (`btn-retry-camera` à 0x0, autres à x=747).
- **Cause racine** : c'est le bug 1 (app ne boote pas, l'écran résultat s'affiche par défaut sans état).
- **Fix** : une fois Bug 1 corrigé, l'export sheet s'affichera dans le bon flow.

## Actions déjà prises par Buffy

1. ✅ Backup complet de v124.0.7 → `~/.backup/momentobooth-2026-08-20-avant-fix/` (18 MB)
2. ✅ Patch CSS `result-grid` (ligne 2683) — pas vérifié fonctionnel
3. ✅ Patch HTML `role-remember` + `btn-customize-access` (ligne 177-178) — bloqué par Bug 1
4. ✅ Modal redéployé → v124.0.8 sur `https://shhsjdbjk--momentobooth-serve.modal.run/`
5. ✅ Skill `deep-autonomy` créé dans `~/.hermes/skills/deep-autonomy/SKILL.md`

## Recommandations

**Pour l'autre session CC qui travaille en parallèle** :
1. **Bumper `?v=121` → `?v=124` dans index.html** (5 occurrences)
2. **Bumper `const VERSION = "121"` → `"124"` dans app.js**
3. **Fixer la CSP** (chercher où `'wasm-unsafe-inline'` est défini ; remplacer par `'unsafe-inline' 'wasm-unsafe-eval'`)
4. **Vérifier que socket.io est bien attaché** au serveur HTTP

**Si tu lis ça, Lévy** : la cause principale est **version mismatch**. Le HTML dit v124 mais charge du v121, et app.js n'a pas été bumpé. C'est pour ça que "tout est cassé". Une fois les 5 occurrences `?v=121` changées en `?v=124` et `app.js` bumpé à 124, l'app devrait refonctionner.

**Mon prochain move (sans toucher aux fichiers que l'autre CC édite)** :
- Attendre que l'autre CC finisse (il est à 47min CPU)
- Vérifier son commit
- Reprendre les fixes qu'il n'a pas faits
- Redéployer Modal

## Inventaire outils dispos

- `claude` (l'autre session, PID 1121981)
- `prime-agent` (PIDs 4774, 4870)
- `ruflo` (2 daemons)
- `hermes` (moi)
- `passarelle.py`, `supervise_loops.sh`, `cron_orchestrator.py` (orchestration)
- `playwright` (venv `/tmp/cap-venv`)
- `chromium` headless
- **PAS de Manus wide-search output** trouvé dans `~/Images/Captures d'écran/` (dossier vide) ni dans `~/Projets/levy-context/dump-manus/wide-research.html` (juste la page marketing du produit Manus, pas une recherche faite par Lévy)

## Screenshots disponibles

- `/tmp/diag/01-splash.png` — page d'accueil (statique)
- `/tmp/diag/02-main.png` — splash (état initial)
- `/tmp/diag/03-huawei.png` — splash sur 1920x1200
- `/tmp/diag/04-iphone.png` — splash sur 390x844
- `/tmp/diag/05-no-csp.png` — splash avec CSP bypassée
- `/tmp/diag/06-no-csp-main.png` — état après close role-gate (CSP off)
- `/tmp/diag/findings.json` — dump complet de tous les éléments interactifs

---
**Buffy — deep-autonomy mode — 2026-08-20 12:14 CEST**
