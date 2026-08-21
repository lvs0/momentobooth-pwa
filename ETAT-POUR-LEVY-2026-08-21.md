# État pour Lévy — 2026-08-21 12:30 CEST

## Ce qui a été fait pendant ton absence

### v124.0.12 — 5 bugs fixés (commits en main)
1. `08a8f30` : `.idle-tap { pointer-events: none }` — fix le bug "écran cassé" sur iPhone
2. `1871b73` : `exitIdle()` à chaque affichage camera-error
3. `3a0c8e9` : `.idle-overlay:not(.show) * { pointer-events: none }` (filet de sécurité)
4. `b994b21` : cacher `organizer-link` sur mobile (chevauchait Galerie)
5. `0244da4` : corriger guillemets échappés dans `donation-setting-row` HTML

### Spécs écrites (2 docs)
- `docs/PHOTOMATON-V125-SPEC.md` (6.3 KB) : vision long-terme
- `docs/REMOTE-CAMERA-V125.1-SPEC.md` (4.2 KB) : commandes caméra distantes

### Subagent en cours
- `deleg_0200e4d5` (Claude Code autonome) : refonte galerie en mode carrousel
- 9 étapes planifiées, 4 complétées (specs lues, HTML modifié, CSS ajouté)
- ETA : 10-15 minutes pour finir

## Ce qui reste à faire (v125.0.0+)

### v125.0.0 — Galerie carrousel (en cours via subagent)
- Header avec compteur "X / N"
- Flèches gauche/droite (cachées aux extrémités)
- Navigation clavier + swipe
- Toggle vue grille/carrousel
- Mode multi-sélection préservé

### v125.1 — Remote caméra depuis tablette (à faire après)
- Bouton "🎛️ Réglages" dans bottom bar tablette
- Drawer avec : flip, zoom, exposition, flash, résolution, grid overlay
- iPhone confirme chaque commande via `command-ack`
- Spéc déjà écrite dans `docs/REMOTE-CAMERA-V125.1-SPEC.md`

### v125.2 — Transmission iPhone→tablette fiable (à faire)
- Polling HTTP en fallback WebRTC (iOS limite les messages à ~64KB)
- WebCodecs API pour compression hardware
- SSE pour distribution multi-tablettes
- Latency monitoring

## Bugs identifiés par audit Playwright

| Sévérité | Bug | État |
|---|---|---|
| 🔴 P0 | idle-overlay bloquait click "Activer caméra" | ✅ FIXÉ v124.0.12 |
| 🔴 P0 | role-gate crash Safari (`finish is not a function`) | ✅ FIXÉ v124.0.10 |
| 🔴 P0 | version mismatch (HTML v121, JS v124) | ✅ FIXÉ v124.0.8 |
| 🟡 P1 | HTML donation-setting-row guillemets échappés | ✅ FIXÉ v124.0.12 |
| 🟡 P1 | link-organizer chevauche Galerie sur iPhone | ✅ FIXÉ v124.0.12 |
| 🟡 P1 | Galerie QR prend tout l'espace (pas de scroll) | ✅ FIXÉ v124.0.11 |
| 🟡 P1 | Caméra coupée par iOS en idle | ✅ FIXÉ v124.0.11 (heartbeat 25s) |
| 🟡 P1 | Result-grid limité à 448px sur tablette | ⚠️ PARTIEL (commit mais vérif KO) |
| 🟡 P1 | Liens don trouvés dans localStorage | ✅ UI complète existe |
| 🟡 P1 | Photos sans heure affichée | ✅ FIXÉ v124.0.11 (API renvoie createdAt) |
| 🟢 P2 | Galerie en grille au lieu de carrousel | 🔄 En cours (subagent) |
| 🟢 P2 | Pas de contrôle zoom/expo/flash distant | ⏳ v125.1 |

## Outils validés

- **Playwright headless** : DÉBUGAGE VISUEL excellent (user-agent spoof, bypass CSP, getBoundingClientRect)
- **patch tool** : edits fichiers propres
- **delegate_task + passarelle** : pour les gros chantiers
- **steer** : rediriger un subagent en cours

## Limites connues

- iOS Safari : pas de `pointsOfInterest` (focus tap)
- iOS Safari : messages WebSocket limités à ~64KB
- iOS Safari : `getUserMedia` permission perdue à chaque navigation
- Huawei Chrome : tout marche

## À faire quand tu reviens

1. **Vérifier le live Modal** : https://shhsjdbjk--momentobooth-serve.modal.run/?role=mixed
2. **Tester la galerie carrousel** quand le subagent aura fini (commit + redeploy)
3. **Si OK** : passer à v125.1 (remote caméra)
4. **Si KO** : screenshot + message d'erreur
