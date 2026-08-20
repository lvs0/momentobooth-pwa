# Spec technique — Filtres 3D type Snapchat Lens pour MomentoBooth

**Auteur** : sub-agent (mission Lévy) · **Date** : 2026-08-20
**Périmètre** : `/home/l-vs/Projets/momentobooth-pwa`
**Cible utilisateur** : Lévy, 14 ans, dev — code prêt à ouvrir demain matin.

> **Toutes les docs lues et référencées dans cette spec :**
> - `docs/ARCHITECTURE-LENS-LEGER.md` ✅
> - `docs/TRIPO-AR.md` ✅
> - `docs/MATRICE-PERSONNALISATION.md` ✅
> - `docs/CATALOGUE-EFFETS.md` ✅
> - `docs/MANUS-HANDOFF.md` ✅
> - `docs/CAHIER-DES-CHARGES-MAITRE.md` ✅
> - `public/assets/third-party-ar/RAPPORT-ESSAIS-3D-MOMENTOBOOTH.md` ✅ (lu pour l'état)
>
> **Toutes référencées inline ci-dessous par leur chemin exact.**

---

## 0. TL;DR (30 secondes)

1. **MediaPipe Face Landmarker est déjà câblé** dans `app.js` (`initFaceLandmarker` ligne 1975) avec 478 landmarks, lissage EMA (`SMOOTH = 0.42`), multi-visage opt-in, et délivre `state.face` aux drawers Canvas.
2. **Trois effets 3D statiques existent** dans `effects-3d.js` (noelcap-3d, glasses-3d, glasses-3d-rose) mais ne sont **pas trackés dynamiquement** : ils sont posés à un ancrage fixe (`face[10]`, `face[1]`, `face[33]`, `face[263]`) sans rotation ni suivi d'inclinaison de tête.
3. **Le dispatcher `masks.js` (ligne 727)** route déjà `maskId` préfixé `"3d:"` vers `effects-3d.js` avec fallback canvas.
4. **Ce qui manque pour passer en mode "Lens"** : (a) lisser la pose du modèle sur la matrice faciale 4×4 MediaPipe au lieu d'ancres 2D, (b) lisser temporellement (EMA) la pose appliquée, (c) ajouter 3-5 nouveaux assets 3D, (d) blinder la perf iPhone 11 / Huawei Tab.
5. **Stack retenue** : **MediaPipe Face Landmarker** (déjà là) + **three.js r160** (déjà chargé en lazy CDN) + **GLTFLoader**. **Pas** de TF.js, **pas** de Jeeliz — on garde la cohérence avec l'existant.
6. **Timeline réaliste** : Quick win 1 weekend · Phase 1 (1 semaine) · Phase 2 (2 semaines) · Phase 3 (1 mois).

---

## 1. État actuel (audit court)

### 1.1 Ce qui marche déjà
- **Pipeline capture + capture auto** : `app.js` lignes 2111-2217. Détection MediaPipe tourne en `runningMode: "VIDEO"` (pas `LIVE_STREAM`, car on capture des frames en pause), `numFaces: 1` par défaut (3 si `filmBubbleEnabled`), GPU puis fallback CPU. Le lissage EMA à 0.42 est déjà appliqué → les landmarks sont stables avant de partir vers les drawers.
- **Trois accessoires 3D chargés en lazy** : `noelcap-3d` (NoelCap.glb, 116 Ko), `glasses-3d` (mindar-glasses, 5 Ko + 28 Ko .bin), `glasses-3d-rose` (variante 5 Ko + 28 Ko). Voir `effects-3d.js` lignes 30-61 (`CATALOG`).
- **Routage 3D transparent** : `masks.js` lignes 727-790 : `maskId` commençant par `"3d:"` est délégué à `effects-3d.js`, avec fallback canvas (`fallbackFor(id)`).
- **Compatibilité bas niveau** : `is3DSupported()` (effects-3d.js:70) bloque WebGL si < 4 cœurs logiques.
- **Manifest versionné** : `public/effects/effects-manifest.json` (version `127-effects-1`) avec `policy.neverConvertLooksToGlb`, `requireCanvasFallback`, `requireRealDeviceValidation`.

### 1.2 Ce qui ne suit pas le visage
`effects-3d.js` lignes 194-249 (`update`) : la pose du modèle est calculée à partir de **2 points 2D** (milieu du front + milieu des yeux ou centre des yeux). Aucune matrice 4×4, aucune rotation de tête, pas de tangage/roulis, pas de mise à l'échelle Z. Le commentaire ligne 134-135 l'admet : *"L'orientation du modèle reste FIXE [...] On conserve juste l'ancrage + l'échelle par visage."* Le rapport d'essais (`RAPPORT-ESSAIS-3D-MOMENTOBOOTH.md`) confirme que c'est un POC.

### 1.3 Ce qui est en place mais sous-exploité
- **`faceMatrix` n'est pas extrait** : `state.landmarker.detectForVideo()` retourne un objet `FaceLandmarkerResult` qui contient `facialTransformationMatrixes[]` (matrice 4×4 par visage) — pas lu dans `app.js`. C'est ce qui manque pour le vrai tracking 3D.
- **`blendshapes` non lus** : le résultat expose aussi `faceBlendshapes[0].categories` (52 coefficients : `mouthSmile`, `eyeBlinkLeft`, `browInnerUp`, etc.). Aucun consommateur dans le code actuel.
- **Landmarks indices spécifiques** : MediaPipe expose en plus des landmarks 2D standards, des points **3D normalisés** (`face[0].z` est déjà exploité) ; on peut extraire tilt/roll/yaw via les yeux + narines.

### 1.4 Inventaire fichiers clés (chemins absolus)
| Fichier | Rôle | Lignes utiles |
|---|---|---|
| `public/js/effects-3d.js` | Loader three.js + rendu GLB/glTF | 303 |
| `public/js/masks.js` | Dispatcher accessoires (Canvas + 3D) | 801, drawer lunettes ligne 94 |
| `public/js/app.js` | initFaceLandmarker + detectFace + drawLiveOverlay | 1975-2217, 270-280 (PERF) |
| `public/effects/effects-manifest.json` | Catalogue effets | 24 lignes |
| `public/mediapipe/face_landmarker.task` | Modèle MediaPipe | 3.6 Mo |
| `public/mediapipe/vision_bundle.mjs` | Bundle WASM | 136 Ko |
| `public/mediapipe/wasm/` | WASM (SIMD + nosimd) | 9.2 Mo |
| `public/assets/third-party-ar/mindar-glasses/` | Asset lunettes | 5 + 28 Ko |
| `public/assets/third-party-ar/noel-cap/NoelCap.glb` | Asset casquette | 116 Ko |
| `public/assets/third-party-ar/variants/` | Variante lunettes rose | 5 + 28 Ko |

**Cache PWA total actuel** : ~13 Mo (mediapipe) + ~0.2 Mo (assets 3D) = **~13.2 Mo en cache navigateur**.

---

## 2. Spec "Lens léger" — architecture concrète

### 2.1 Bibliothèque retenue : **MediaPipe Face Landmarker (déjà en place)**

**Pourquoi pas TensorFlow.js ?**
- @mediapipe/tasks-vision est déjà importé dynamiquement (`app.js:1986`), avec bundles locaux (pas de dépendance réseau) et SIMD WASM.
- TF.js @tensorflow-models/face-landmarks-detection ajoute ~2 Mo de modèles (MobileNetV1 6 Mo ou BlazeFace 400 Ko + mesh 2 Mo) ET nécessite tf-core + tf-backend ~1 Mo. Bénéfice/perf net négatif.
- Jeeliz : abandonné depuis 2022, pas de modèle blendshapes 3D, le repo GitHub l'indique.

**Pourquoi pas le mode `LIVE_STREAM` de MediaPipe ?**
Le doc `ARCHITECTURE-LENS-LEGER.md` ligne 8 le recommande, mais notre cas est un **photobooth** : on capture des images fixes, pas un flux streaming live. Le mode `VIDEO` + un timer de détection périodique (`_detectFaceTimer`) est plus simple et plus stable pour un pipeline qui finit par faire un `drawImage` sur canvas. Le lissage EMA compense.

### 2.2 Architecture cible

```
[Camera VIDEO element]
      │
      │ state.stream (getUserMedia)
      ▼
[detectFace() dans app.js:2111]
   - lit state.landmarker.detectForVideo()
   - extrait faceLandmarks + facialTransformationMatrixes + faceBlendshapes
   - EMA lisse landmarks
   - stocke state.face, state.faceMatrix, state.blendshapes
      │
      ▼
[drawLiveOverlay() dans app.js]
   - appelle drawMask(ctx, W, H, state.face, state.accessoryId, 0)
      │
      ▼
[drawMask() dans masks.js:719]
   - si "3d:xxx" → draw3DSync() ligne 760
   - sinon → DRAWERS[maskId] (Canvas 2D)
      │
      ▼
[draw3DSync() → effect.update() dans effects-3d.js]
   - calcule pose 4×4 depuis faceMatrix + landmarks
   - rend scene three.js sur canvas offscreen
   - ctx.drawImage vers le canvas 2D live
```

### 2.3 Chargement paresseux — pas de crash Safari iOS

**État actuel** : three.js arrive via `import("https://unpkg.com/three@0.160.0/...")` dans `ensureThree()` (effects-3d.js:99). Problèmes :
- CSP de la PWA peut bloquer `unpkg.com` hors-ligne.
- iOS Safari peut échouer l'import dynamique sur première frame.

**Améliorations concrètes** :
1. **Pin three.js en local** (recommandé) : copier `three.module.min.js` (~600 Ko) et `GLTFLoader.js` (~30 Ko) depuis le CDN vers `public/vendor/three/`. Modifier `THREE_BASE` en chemin relatif. **Bénéfice** : pas de dépendance réseau, le SW les cache une fois pour toutes.
2. **Précharger three.js au premier `accessoryId` 3D** : dans `app.js` à la sélection d'un filtre 3D, faire `import("./effects-3d.js")` immédiatement, sans attendre le premier draw.
3. **Feature detection avant tout** : `is3DSupported()` ligne 70 doit aussi vérifier `OffscreenCanvas` (Safari 16.4+ mais iPhone 11 iOS 15-16 peut ne pas l'avoir — on n'utilise pas OffscreenCanvas, mais on garde le check).
4. **Try/catch en cascade** : charger three.js → si échec, retry avec chemin local `vendor/three/...` → si échec, `is3DSupported()=false` → fallback canvas via `fallbackFor(id)`.

### 2.4 Application du masque 3D sur les landmarks — la pièce manquante

**Problème** : `effects-3d.js:194-249` n'utilise que 4 points 2D. La rotation du visage n'est pas propagée au modèle.

**Solution** : combiner **3 sources** :

1. **Matrice faciale MediaPipe** (`facialTransformationMatrixes[i]`) : matrice 4×4 qui mappe un repère canonique (centré sur le visage, X droit, Y bas, Z avant) vers le repère image. C'est ce que Snapchat utilise en interne.

2. **Landmarks 3D** (déjà dispo, `face[j].z`) : affinent tilt/roll en cas de faible confiance de la matrice.

3. **EMA temporel** : lisser la pose appliquée à 0.35 (plus smooth que les landmarks 0.42 car la pose du modèle est plus visible).

**Pseudo-code à coder dans `effects-3d.js` nouvelle méthode `update()`** :

```js
// (a) extraire depuis le result MediaPipe
const m = faceMatrixFromMediaPipe(result); // Float32Array(16), colonne-major
const t = extractTranslation(m);           // {x,y,z} repère image normalisé
const R = extractRotationMatrix(m);        // 3x3, peut être converti en quaternion

// (b) miroir horizontal : la caméra selfie est inversée en X
//      (déjà géré par le repère canonical MediaPipe? NON — vérifier)
const mirrored = mirrorX(R); // selon cameraFacingMode

// (c) angles Euler pour debug
const euler = quaternionToEuler(mirrored); // {yaw, pitch, roll}

// (d) EMA temporel
this._smoothYaw   = (this._smoothYaw ?? euler.yaw)   * 0.65 + euler.yaw   * 0.35;
this._smoothPitch = (this._smoothPitch ?? euler.pitch) * 0.65 + euler.pitch * 0.35;
this._smoothRoll  = (this._smoothRoll ?? euler.roll)  * 0.65 + euler.roll  * 0.35;

// (e) appliquer au scene three.js
scene.rotation.set(this._smoothPitch, this._smoothYaw, this._smoothRoll, 'YXZ');
scene.position.set(
  t.x * canvasW,
  t.y * canvasH,
  0 // Z géré par l'anchor scale
);

// (f) échelle basée sur largeur du visage
const faceW = dist(face[234], face[454]);
scene.scale.setScalar(faceW * entry.fit);
```

**Indices MediaPipe clés à connaître par cœur** (référence partagée avec `masks.js`) :
- `face[1]` : bout du nez
- `face[10]` : haut du front
- `face[33]` : coin externe œil gauche
- `face[263]` : coin externe œil droit
- `face[152]` : menton
- `face[234]`, `face[454]` : tragions (oreilles) — largeur de tête
- `face[127]`, `face[356]` : pupilles estimées (centre iris)
- `face[4]`, `face[6]` : narines — utiles pour tangage (pitch)

### 2.5 Perf : 30 FPS cible, 15 FPS fallback

**Cible iPhone 11 (A13 Bionic, 4 Go RAM, GPU 4 cœurs)** : 30 FPS sur 1 visage, 3D asset ≤ 5 000 triangles, 1 draw call, pas de post-FX.
**Cible Huawei Tab milieu de gamme (Snapdragon 7xx, ~3 Go RAM)** : 15-20 FPS acceptable, asset ≤ 3 000 triangles, fallback canvas 2D si instable.

**Mécanique de dégradation** (à implémenter dans `app.js:detectFace`) :

```js
// Tracker 3D actif seulement si :
//  1. accessId 3D sélectionné
//  2. perfConfig().detectMs OK (eco=620, balanced=430, max=320)
//  3. lastDetectMs < 80ms (sinon chute à 15 FPS)
const now = performance.now();
if (state.accessoryId?.startsWith("3d:")) {
  // 1ère passe : MediaPipe detectForVideo (inchangé)
  // 2e passe : si scene 3D active, re-render à RAF rate (max 30 FPS)
  if (now - state._last3dRenderAt > 33) {  // 30 FPS cap
    state._last3dRenderAt = now;
    render3DLayer(ctx, W, H);
  }
}
```

**Indicateur de chute FPS** : compter les frames > 50 ms sur 30 frames consécutives. Si > 5 frames lentes →降 à `performanceMode = "eco"`.

### 2.6 2-3 effets à prototyper en PREMIER (quick wins)

| # | ID | Asset | Anchor | Justification |
|---|---|---|---|---|
| 1 | `3d:crown-3d` | couronne STL→GLB (générer via Tripo, voir §3) | `head` (front 10) | Le plus simple : pas de rotation à mapper précisément, juste position + tilt. Remplace `drawCrown` (masks.js:40). |
| 2 | `3d:glasses-3d` (déjà là) | `mindar-glasses/scene.gltf` | `eyes` (33+263) | Déjà câblé, il suffit de lui ajouter le tracking rotation. **Quick win #1 — 1-2h**. |
| 3 | `3d:heart-nose` | cœur rouge texturé, ~80 tris, asset simple | `nose` (1) | Petit, fun, position fixe, scale par `face[234]-face[454]`. **Quick win #2 — 2h**. |

**Pourquoi pas faire immédiatement les oreilles de chat, le lapin, etc.** ? Le rapport `RAPPORT-ESSAIS-3D-MOMENTOBOOTH.md` lignes 22-23 le dit : *"la casquette [...] peut servir de prototype d'ancrage tête, mais elle ne doit pas remplacer immédiatement la couronne Canvas"*. On garde les Canvas pour ce qui marche déjà, on ne convertit en 3D que ce qui apporte une vraie valeur visuelle (profondeur, perspective).

**Règle (cohérente avec `MATRICE-PERSONNALISATION.md` ligne 39, colonne "Asset 3D")** : *"Pas dans le renderer actuel — Demande une couche WebGL/glTF séparée."* → on l'ouvre maintenant.

---

## 3. Format des assets 3D

### 3.1 Format conteneur : **GLB (binaire unique)**

**Pourquoi pas glTF + .bin séparé ?**
- glTF + .bin nécessite 2 fetch → 2 latences, 2 entrées de cache. Pas critique mais inutile.
- Le seul asset glTF actuel (`mindar-glasses`) sera converti en GLB pour Phase 1.
- Le manifest `effects-manifest.json` ligne 12 référence déjà `binary` séparé — c'est un héritage, on le supprime progressivement.

**Structure cible** :
```
public/assets/effects-3d/
  glasses-v2.glb              # ~40 Ko (5 + 28 Ko glTF+bin convertis en GLB)
  crown.glb                   # ~30 Ko (à créer)
  heart-nose.glb              # ~15 Ko (à créer)
  bunny-ears.glb              # ~50 Ko
  party-hat.glb               # ~25 Ko
  third-party-ar/             # sources originales CC0/CC-BY, JAMAIS modifiées
    mindar-glasses/scene.gltf
    mindar-glasses/scene.bin
    noel-cap/NoelCap.glb
    variants/mindar-glasses-rose.gltf
```

### 3.2 Compression

**Draco (géométrie)** :
- Outil : `gltf-transform` CLI (Node) ou `gltfpack`.
- Réduction typique : 10-12× (`ARCHITECTURE-LENS-LEGER.md` ligne 22, réf [5]).
- ⚠️ **Safari iOS 15-16** : DracoLoader three.js est ~50 Ko. Tester sur iPhone 11 cible iOS 15.8.3 avant de généraliser. Si Draco bloque le chargement, fallback en GLB non compressé.
- **Recommandation** : ne pas activer Draco pour Phase 1 (assets déjà < 200 Ko). Activer pour Phase 2 si on importe des modèles > 1 Mo.

**KTX2 (textures)** :
- Outil : `toktx`.
- Uniquement utile si textures PBR (metalness, normal maps). Pour Phase 1, tous les assets sont des MeshBasicMaterial couleur unique ou MeshStandardMaterial avec 1 texture. **Pas la peine**.
- À considérer Phase 3 (modèles PBR riches).

### 3.3 Budget par effet (à encoder dans le manifest)

| Métrique | Phase 1 (simple) | Phase 2 (PBR) | Phase 3 (complexe) |
|---|---|---|---|
| Poids GLB | ≤ 100 Ko | ≤ 500 Ko | ≤ 2 Mo |
| Triangles | ≤ 3 000 | ≤ 15 000 | ≤ 50 000 |
| Textures | 0-1 PNG ≤ 256² | 1-3 KTX2 ≤ 1024² | 4+ KTX2 ≤ 2048² |
| Draw calls | 1 | ≤ 5 | ≤ 15 |
| Anchor method | 2D landmarks | 2D + matrix | Matrix + blendshapes |
| Update rate | 30 FPS | 30 FPS | 30-60 FPS |

À intégrer comme champ `"budget": {...}` dans chaque entrée du manifest `effects-manifest.json` (validation au load).

### 3.4 Orientation et axes — convention à fixer une fois

Les assets 3D doivent être orientés **Y-up, Z-avant, X-droite**, modèle centré sur l'origine. La caméra three.js regarde vers `-Z`. MediaPipe renvoie un repère quasi-identique mais **X inversé en mode selfie** (le tracker ne sait pas si l'image est mirrorée). Code de normalisation (à centraliser dans un helper) :

```js
// public/js/effects-3d.js
const MIRROR_X = true; // Selfie camera → X inversé
function normalizeMediaPipeMatrix(m) {
  const out = new Float32Array(16);
  // Colonne 0 (X) : inverser pour selfie
  out[0] = -m[0]; out[1] = -m[1]; out[2] = -m[2];
  // Colonne 1 (Y) : inchangée
  out[4] = m[4]; out[5] = m[5]; out[6] = m[6];
  // Colonne 2 (Z) : inverser (MP utilise Z vers l'utilisateur)
  out[8] = -m[8]; out[9] = -m[9]; out[10] = -m[10];
  // Translation
  out[12] = m[12] * (MIRROR_X ? -1 : 1);
  out[13] = m[13];
  out[14] = m[14];
  out[15] = 1;
  return out;
}
```

C'est LE point qui fait la différence entre un filtre "presque" Snapchat et un filtre "qui glisse" sur le visage.

---

## 4. Pipeline de création des assets 3D

### 4.1 Outil principal : **Tripo AI** (déjà documenté dans `TRIPO-AR.md`)

**Pourquoi Tripo plutôt que Blender ?**
- Lévy a 14 ans, Tripo est text-to-3D / image-to-3D → pas de courbe d'apprentissage 3D DCC.
- API V3 asynchrone (`task_id` → poll → `output.model_url`) : `TRIPO-AR.md` ligne 3.
- Paramètres utiles : `face_limit=2000`, `smart_low_poly=true`, `texture=true`, `pbr=false` (Phase 1), `compress=true`.
- ⚠️ **Quota** : 10 générations gratuites/jour. Au-delà : $0.10-0.30 / asset. Lévy doit batcher.
- ⚠️ **Clé API** : `TRIPO-AR.md` ligne 9 l'interdit côté navigateur. On crée un script Node `scripts/tripo-generate.mjs` que Lévy lance depuis son PC, jamais depuis la PWA.

**Workflow concret — Étape 1 : créer l'asset**

```bash
# 1) Installer le CLI Tripo (une fois)
npm install -g tripo-cli

# 2) Configurer la clé
export TRIPO_API_KEY="sk-..."

# 3) Générer un asset depuis une image de référence
tripo image-to-model \
  --image ./references/heart-nose.png \
  --face-limit 2000 \
  --smart-low-poly \
  --texture \
  --pbr=false \
  --compress \
  --output ./raw/heart-nose.glb

# 4) Le script poll automatiquement. Récupère l'URL → télécharge.
```

**Alternative Blender** (si Lévy veut plus de contrôle) :
- Blender 4.x LTS (gratuit) — tutorial YouTube "Blender glasses for AR" (~30 min).
- Plus précis, mais 10× plus long. Réservé aux assets "premium" (couronne de mariage, etc.).

### 4.2 Workflow concret — Étape 2 : optimiser

```bash
# Réduction Draco + KTX2
npx gltf-transform optimize raw/heart-nose.glb public/assets/effects-3d/heart-nose.glb \
  --compress draco \
  --texture-size 256

# Validation (triangle count, draw calls, AABB)
npx gltf-transform inspect public/assets/effects-3d/heart-nose.glb

# Aplatir en GLB unique (pas de textures externes)
npx gltf-transform merge public/assets/effects-3d/heart-nose.glb
```

**Critères de validation** (à automatiser dans un script `scripts/validate-glb.mjs`) :
- Triangles ≤ budget
- 1 seul fichier (GLB, pas glTF+bin+texture séparés)
- Origine centrée (BBox center = {0,0,0} ± 0.01)
- Y-up (vérifier via matrix de la première mesh)
- 1 draw call (1 seul mesh ou meshes fusionnés)
- Poids ≤ budget (100 Ko Phase 1)

### 4.3 Workflow concret — Étape 3 : intégrer au manifest

**Avant** (ligne 13 de `effects-manifest.json`) :
```json
{"id":"glasses-3d-rose","label":"Lunettes 3D rose/cyan","kind":"accessory","renderer":"gltf","asset":"assets/third-party-ar/variants/mindar-glasses-rose.gltf","binary":"assets/third-party-ar/variants/scene.bin","fallback":"glasses","status":"experimental"}
```

**Après** :
```json
{
  "id":"3d:glasses-3d",
  "label":"Lunettes 3D",
  "kind":"accessory",
  "renderer":"glb",
  "asset":"assets/effects-3d/glasses-v2.glb",
  "anchor":"eyes",
  "tracking": "matrix+landmarks",
  "fallback":"glasses",
  "budget":{
    "weight_kb": 40,
    "triangles": 1200,
    "fps_target": 30
  },
  "status":"stable",
  "license":"CC-BY-4.0",
  "credit":"MindAR (hiukim/mindar-js)"
}
```

Le préfixe `"3d:"` devient la convention unique (cohérent avec `masks.js:727`). On retire le champ `binary`.

### 4.4 Workflow concret — Étape 4 : tester sur l'app

1. Lancer `python3 -m http.server 8000` à la racine `public/`.
2. Ouvrir `http://localhost:8000/?dev=1` (le query param active les logs dev).
3. Sélectionner l'accessoire 3D dans la roue.
4. Vérifier : (a) le modèle apparaît, (b) il suit la tête en rotation, (c) il suit le pitch, (d) le FPS reste ≥ 25 (compteur dans la console via `telemetry.emit`).
5. Tester sur iPhone 11 réel via `ngrok http 8000` ou Cloudflare Tunnel.
6. Si stable, screenshot dans `public/assets/effects-3d/previews/heart-nose-on-face.png` pour la doc.

**Critères de validation "prêt"** (cohérent avec `ARCHITECTURE-LENS-LEGER.md` ligne 37 : *"Un filtre n'est déclaré prêt qu'après mesure sur l'iPhone 11 et la tablette cible."*) :
- Test sur iPhone 11 Safari iOS 15+ ET tablette Huawei Android Chrome : 30s sans chute > 25 FPS.
- Test multi-visage (1 + 3 visages si `filmBubbleEnabled`) : pas de plantage.
- Test en rotation ±30° yaw, ±20° pitch : modèle reste attaché.

---

## 5. Roadmap d'implémentation

### 5.1 Quick wins (1-2 jours)

| # | Tâche | Effort | Livrable |
|---|---|---|---|
| QW1 | Ajouter extraction `faceMatrix` + `blendshapes` dans `app.js:detectFace` | 2h | `state.faceMatrix`, `state.blendshapes` disponibles |
| QW2 | Créer `effects-3d.js#applyMatrixToScene(scene, matrix)` | 2h | API pose-tracking unique |
| QW3 | Pinner three.js + GLTFLoader en local sous `public/vendor/three/` | 1h | Plus de CDN unpkg |
| QW4 | Convertir `mindar-glasses/scene.gltf+.bin` en `glasses-v2.glb` unique | 30 min | Fichier -10 Ko |
| QW5 | Brancher QW2 sur `glasses-3d` existant | 2h | Lunettes qui suivent vraiment la tête |
| QW6 | Générer `heart-nose.glb` via Tripo + intégrer | 2h | Quick win visuel fun |

**Total Quick wins** : ~10h, 1 week-end.

### 5.2 Phase 1 — "Lens basiques" (1 semaine, 5 effets)

**Critère de sortie** : 5 effets 3D trackés en rotation+pitch, perf stable sur iPhone 11, tous avec fallback Canvas.

| ID | Asset | Anchor | Tracking | Justification |
|---|---|---|---|---|
| `3d:glasses-3d` (QW5) | lunettes v2 | `eyes` (33+263) | matrix | Déjà en place |
| `3d:crown-3d` | couronne dorée générée Tripo | `head` (10) | matrix | Tilt seul, pas pitch nécessaire |
| `3d:heart-nose` (QW6) | cœur | `nose` (1) | landmarks 2D | Position fixe, fun |
| `3d:bunny-ears` | oreilles lapin | `head` (10) | matrix | Star de l'anniversaire enfant |
| `3d:party-hat` | chapeau pointu | `head` (10) | matrix | Sobre, classique |

**Tâches techniques transverses** :
- Implémenter le détecteur de chute FPS (sliding window 30 frames).
- Ajouter le champ `budget` au manifest + validation runtime.
- Mettre à jour `MATRICE-PERSONNALISATION.md` colonne "Asset 3D" : passer de "Pas dans le renderer actuel" à "OK via `3d:` prefix".
- Tests : ajouter un test Playwright sur `/test-device-harness.html` qui simule un face tracking avec mock landmarks.

### 5.3 Phase 2 — "Beauty + distortion" (2 semaines)

| ID | Type | Déclencheur | Notes |
|---|---|---|---|
| `3d:eye-shadow` | texture overlay | `state.blendshapes.eyeBlinkLeft > 0.4` | Paupières qui se ferment |
| `3d:lipstick` | texture overlay | `state.blendshapes.mouthSmile > 0.5` | Lèvres colorées |
| `3d:big-eyes` | shader distorsion | always-on, basé sur `face[33]-face[263]` | Kawaii, à doser |
| `3d:smile-sparkles` | particules | `state.blendshapes.mouthSmile` threshold | Magie au sourire |
| `face-retouch` | shader flou sélectif | `state.faceMask` (déjà câblé app.js:2046) | Lissage de peau |
| `eye-color` | shader pupille | always-on, basé sur `face[468-477]` (iris landmarks) | Lentilles de couleur |

**Tâche technique clé** : pipeline shader post-FX. Three.js `EffectComposer` est ~80 Ko. À bundler.

### 5.4 Phase 3 — "AR avancé" (1 mois)

| ID | Type | Notes |
|---|---|---|
| `3d:face-paint` | texture PBR sur mesh 478 sommets | Tatouage/peinture, suit la déformation du visage |
| `3d:full-mask` | mesh facial complet | Filtre "masque" total — besoin de morph targets MediaPipe |
| `3d:pet-head` | mascotte 3D | Tête d'animal complète remplace le visage (type Snapchat dog filter) |
| `3d:background-3d` | scène d'environnement | Plage, espace, etc. via profondeur (depth map MediaPipe) |
| `3d:multi-face` | 3 visages en même temps | `numFaces: 3` déjà opt-in dans `initFaceLandmarker` (ligne 1990) |

**Tâches techniques** :
- Activer `outputFaceTransformationMatrixes: true` dans `initFaceLandmarker` (ligne 1990) — c'est déjà la valeur par défaut.
- Activer `outputFaceBlendshapes: true`.
- Tester WebGPU (Chrome Android 121+) en alternative à WebGL — gain x2-3 sur certains devices.
- Préparer un système de preview 3D : outil Node qui prend un GLB + une pose et rend un PNG portrait, pour générer la galerie de previews sans avoir à tester sur device.

---

## 6. Risques et limites

### 6.1 Perf iPhone 11 (A13, 4 Go RAM, cible anniversaire)
- **Cible** : 30 FPS @ 1280×720.
- **Budget** : `detectForVideo` (MediaPipe) ~25-40 ms + render three.js 1 mesh 3K tris ~5-10 ms + composition canvas 2D ~5 ms = **40-55 ms/frame = 18-25 FPS**.
- **Mitigation** : `performanceMode = "eco"` forcé quand un effet 3D est sélectionné, soit `detectMs = 620` (1.6 FPS de détection) + render three.js à 30 FPS sur la dernière pose. Le décalage est invisible pour un filtre.
- **Test obligatoire** avant de marquer "stable" : ouvrir DevTools Safari iOS → onglet Timings → profile 30s avec filtre 3D actif.

### 6.2 Perf Huawei Tab milieu de gamme
- Cible réaliste : **15-20 FPS**, pas 30.
- Si `navigator.hardwareConcurrency < 6` (souvent le cas sur Tab milieu de gamme) : `is3DSupported()` retourne `false` → fallback canvas obligatoire.
- Les Snap docs (`ARCHITECTURE-LENS-LEGER.md` réf [3]) confirment : 15 FPS est le minimum acceptable.

### 6.3 Safari iOS vs Chrome Android — différences WebGL
| Aspect | Safari iOS | Chrome Android |
|---|---|---|
| WebGL2 | iOS 15+ ✅ | Tous ✅ |
| OffscreenCanvas | iOS 16.4+ | ✅ |
| WEBGL_compressed_texture_etc2 | iOS partiel | ✅ |
| KTX2 transcoding | Lent (~100 ms) | Rapide (~10 ms) |
| DracoLoader three.js | ✅ depuis iOS 15 | ✅ |
| `preserveDrawingBuffer` | Quirks (need re-render chaque frame) | Standard |

**Conclusion** : KTX2 = non pour Phase 1 (trop lent iOS). Draco = OK mais à tester. Pas de WebGPU Phase 1 (iOS ne supporte pas, Android Chrome 121+ mais pas universel).

### 6.4 Taille bundles — cache PWA
**Estimation finale Phase 1** :
- MediaPipe (déjà là) : 13 Mo
- three.js local : +600 Ko
- GLTFLoader local : +30 Ko
- 5 assets GLB (≤ 100 Ko chacun) : +500 Ko
- **Total cache** : **~14.2 Mo**

**Note** : la PWA actuelle (`sw.js` à la racine de `public/`) cache déjà les assets. Vérifier qu'il y a une stratégie "stale-while-revalidate" pour `vendor/three/`.

### 6.5 Risques métier
- **Tripo quota** : 10 générations gratuites/jour. Lévy doit batcher ses prompts. Sinon 30 assets = $9-30.
- **Licences** : les lunettes MindAR sont **CC-BY 4.0** (`CATALOGUE-EFFETS.md` ligne 117) → attribution obligatoire dans `THIRD-PARTY-NOTICES.md`. NoelCap est **CC0** → pas d'attribution mais on la conserve par respect.
- **Compatibilité anniversaire** : `CAHIER-DES-CHARGES-MAITRE.md` ligne 82 liste 24 tests à passer. Les 3 effets 3D actuels ne sont PAS dans cette liste. Les ajouter en tests Phase 1.
- **Pas de crash Safari** : tout le code 3D est dans un `try/catch` qui fallback canvas (`masks.js:789`). Garder ce pattern.

### 6.6 Limites honnêtes (rappel du `ARCHITECTURE-LENS-LEGER.md` ligne 44)
> *"Un filtre de photomaton peut reproduire les mêmes principes techniques qu'un Lens moderne, mais il ne peut pas être déclaré « exactement Snapchat » sans le moteur, les données et les outils propriétaires."*

On vise **équivalent fonctionnel sur 5-10 effets**, pas "le clone de Snapchat". Le rendu sera moins riche (pas de subsurface scattering, pas de soft shadow realtime, pas de eye refraction réaliste), mais cohérent et stable.

---

## 7. Plan d'action immédiat pour demain matin

**Checklist pour Lévy (dans l'ordre) :**

- [ ] **1. Backup** : `cp -r momentobooth-pwa momentobooth-pwa.bak-2026-08-20`
- [ ] **2. Pinner three.js** :
  ```bash
  mkdir -p public/vendor/three
  curl -o public/vendor/three/three.module.min.js https://unpkg.com/three@0.160.0/build/three.module.min.js
  curl -o public/vendor/three/GLTFLoader.js https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js
  # Modifier effects-3d.js:17 THREE_BASE = "/vendor/three"
  ```
- [ ] **3. Extraire `faceMatrix` dans app.js** : ajouter dans `detectFace()` après `result.faceLandmarks` (ligne 2123) :
  ```js
  state.faceMatrix = result.facialTransformationMatrixes?.[0]?.data ?? null;
  state.blendshapes = result.faceBlendshapes?.[0]?.categories ?? null;
  ```
  Et dans `initFaceLandmarker()` ligne 1990 : ajouter `outputFaceBlendshapes: true`.
- [ ] **4. Refactor `effects-3d.js:update`** : remplacer le calcul 2D par `applyMatrixToScene(scene, state.faceMatrix, face, W, H)`. Tester sur `glasses-3d` existant.
- [ ] **5. Générer `heart-nose.glb`** : utiliser Tripo avec un prompt simple "small red heart, low poly, single mesh, centered" → optimiser via gltf-transform → ajouter au manifest.
- [ ] **6. Tester sur device réel** : iPhone 11 + Huawei Tab. Mesurer FPS console (`telemetry.emit`).
- [ ] **7. Si stable** : passer `status` de `experimental` à `stable` dans le manifest, mettre à jour `CATALOGUE-EFFETS.md` et `MATRICE-PERSONNALISATION.md`.

**Si une étape bloque** : rollback vers `momentobooth-pwa.bak-2026-08-20`, investiguer, recommencer.

---

## 8. Annexes

### 8.1 Référence rapide indices landmarks MediaPipe (478 points)
```
 1  : bout du nez
 4  : narine gauche
 6  : narine droite
 10 : front (haut)
 33 : coin externe œil gauche
 127: pupille gauche (approx)
 152: menton
 168: milieu joue gauche
 234: tragion gauche (oreille)
 263: coin externe œil droit
 356: pupille droite (approx)
 454: tragion droit (oreille)
 468-477: iris landmarks (eye refinement)
```

### 8.2 Champs ajoutés au manifest (Phase 1)
```jsonc
{
  "id": "3d:xxx",              // préfixe obligatoire
  "label": "Nom affiché",
  "kind": "accessory",
  "renderer": "glb",            // toujours glb Phase 1+
  "asset": "assets/effects-3d/xxx.glb",  // chemin relatif à public/
  "anchor": "head" | "eyes" | "nose",     // hint pour la pose initiale
  "tracking": "matrix+landmarks" | "landmarks" | "static",
  "fallback": "canvas-drawer-id",  // ID dans masks.js#DRAWERS
  "budget": {
    "weight_kb": 100,
    "triangles": 3000,
    "fps_target": 30
  },
  "license": "CC0" | "CC-BY-4.0",
  "credit": "Source si applicable",
  "status": "experimental" | "stable" | "deprecated"
}
```

### 8.3 Schéma de validation runtime (à ajouter dans `effects-3d.js#load3DEffect`)
```js
// Après gltf = await loader.loadAsync(...)
const stats = computeSceneStats(scene); // { triangles, meshes, textures }
const budget = entry.budget || {};
if (stats.triangles > (budget.triangles || 5000)) {
  console.warn(`[effects-3d] ${id} dépasse le budget triangles: ${stats.triangles} > ${budget.triangles}`);
  // Ne pas throw — on log et on continue, c'est un POC.
}
```

---

**FIN de la spec.** Tout est implémentable en commençant par les 7 étapes de la section 7. Le `code-review` est encouragé avant chaque merge sur `main`. La règle d'or reste celle du `CAHIER-DES-CHARGES-MAITRE.md` ligne 86 : *"Ne jamais déclarer une fonction terminée parce que son bouton existe : elle est terminée uniquement si son action, son état de chargement, son erreur et son retour sont fonctionnels."*
