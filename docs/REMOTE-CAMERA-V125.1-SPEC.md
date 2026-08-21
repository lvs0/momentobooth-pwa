# Spec Remote Camera Control v125.1

## Contexte

L'user-agent déploie MomentoBooth sur une vraie borne physique. Il veut pouvoir **contrôler l'iPhone (caméra) depuis la tablette** :
- Choisir caméra avant/arrière
- Zoom numérique/optique
- Exposition
- Flash
- Résolution
- Focus tap

## État actuel (v124.0.12)

Le code de remote caméra existe partiellement :
- 115 occurrences de `remoteCam` (pairage, commandes, events)
- `flipCamera` (5 occurrences) : front/back
- `track.applyConstraints` (5 occurrences) : déjà utilisé pour frameRate
- 0 occurrence de `setZoom`, `setExposure`

Le serveur a déjà :
- `/api/remote-camera/sessions` (POST) : créer session
- `/api/remote-camera/pair` (POST) : pairer iPhone + tablette
- `/api/remote-camera/:token/frame` (POST/GET) : transmettre frames
- `/api/remote-camera/:token/command` (POST) : envoyer commandes
- `/api/remote-camera/:token/commands` (GET) : polling

## Commandes à supporter (v125.1)

| Commande | Effet sur iPhone | API |
|---|---|---|
| `flip` | Passer caméra avant ↔ arrière | `getUserMedia({video: {facingMode}})` |
| `zoom` | Zoom 1x à 5x | `track.applyConstraints({advanced: [{zoom: value}]})` |
| `exposure` | -2 à +2 EV | `track.applyConstraints({advanced: [{exposureCompensation: value}]})` |
| `flash` | on/off/auto | `track.applyConstraints({advanced: [{torch: value}]})` |
| `resolution` | 720p/1080p/4K | `getUserMedia({video: {width, height}})` avec nouveau stream |
| `focus` | Focus à un point (x, y normalisés 0-1) | `track.applyConstraints({advanced: [{pointsOfInterest: [{x, y}]}]})` |

## UI Tablette : nouveau panneau "Réglages caméra"

À ajouter dans l'écran de capture (bottom bar), un bouton "🎛️" qui ouvre un drawer avec :

- **Caméra** : [Avant] [Arrière] (segmented control)
- **Zoom** : slider 1x → 5x avec valeur affichée
- **Exposition** : slider -2 → +2 EV
- **Flash** : [Off] [Auto] [On]
- **Résolution** : [720p] [1080p] [4K] (selon support iPhone)
- **Grid overlay** : toggle (règle des tiers sur preview)

L'iPhone confirme chaque commande (`command-ack` event) avec :
- Le résultat (success/error)
- Les nouvelles capabilities (zoom max, exposition range, etc.)
- La latence de la commande

## API getUserMedia : limites iOS

| Feature | iOS Safari | iPad Safari | Chrome Android (Huawei) |
|---|---|---|---|
| `facingMode: {exact: "environment"}` | ✅ iOS 14+ | ✅ | ✅ |
| `zoom` (1-5x) | ✅ iOS 15+ | ✅ | ✅ |
| `exposureCompensation` | ⚠️ Safari 16+ | ⚠️ | ✅ |
| `torch` (flash) | ✅ iOS 14+ | ✅ | ✅ |
| `width/height` (resolution) | ✅ | ✅ | ✅ |
| `pointsOfInterest` (focus) | ❌ Safari | ❌ | ✅ |

**Note importante** : Safari ne supporte PAS `pointsOfInterest`. Pour le focus, fallback sur :
- `track.applyConstraints({advanced: [{focusMode: 'continuous'}]})` (auto-focus)
- Pas de tap-to-focus, mais auto-focus suffit pour un photobooth (la personne est statique)

## Limites WebRTC sur iOS

D'après mes connaissances 2026 :
- iOS Safari limite les messages WebSocket à **~64KB par chunk** (c'est pour ça que les frames JPEG fragmentés ne marchent pas bien)
- `getUserMedia` demande la permission à chaque navigation (pas de persistance)
- **Background** : iOS coupe getUserMedia après 30s d'inactivité (déjà fixé avec startCameraKeepAlive)
- **`facingMode: {exact}`** : ne marche pas, utiliser `{ideal}`

## Plan d'implémentation v125.1

1. **Ajouter les commandes** dans le handler remoteCommand de l'iPhone
2. **Implémenter `applyAdvancedConstraints`** qui essaie les contraintes et fallback si non supporté
3. **UI tablette** : nouveau drawer "Réglages caméra"
4. **Capabilities detection** : au boot, l'iPhone envoie la liste des features supportées
5. **Tests** : sur iPhone sim, vérifier chaque commande (mock si pas de caméra)

## Hors scope (v125.2+)

- Polling HTTP en fallback WebRTC
- WebCodecs API pour compression hardware
- SSE pour distribution multi-tablettes
- Latence monitoring

## Notes

- Ne **pas** brider l'app si une feature n'est pas supportée : fallback gracieux
- Logger chaque commande + résultat pour debug
- Afficher un warning si l'iPhone a des capabilities réduites (ex: "Zoom non supporté sur cet iPhone")
