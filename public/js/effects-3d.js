/* =========================================================
   MomentoBooth — Effets 3D (expérimental)
   Loader three.js paresseux via CDN ESM (unpkg).
   Trois effets câblés :
     - noelcap-3d        : NoelCap.glb (CC0)         → fallback "crown"
     - glasses-3d        : mindar-glasses/scene.gltf → fallback "glasses"
     - glasses-3d-rose   : mindar-glasses-rose.gltf  → fallback "glasses"

   Politique (effects-manifest.json) :
     - neverConvertLooksToGlb : on ne convertit pas les looks photo en 3D
     - requireCanvasFallback  : si three.js indisponible → fallback canvas silencieux
     - requireRealDeviceValidation : pas de promesse de rendu parfait, simple
                                    position statique sur la tête (POC)
   ========================================================= */

const THREE_VERSION = "0.160.0";
const THREE_BASE = `https://unpkg.com/three@${THREE_VERSION}`;
const GLTF_LOADER = `${THREE_BASE}/examples/jsm/loaders/GLTFLoader.js`;

/* Catalogue aligné sur effects-manifest.json. Chaque entrée porte :
   - id            : identifiant utilisé par state.accessoryId
   - label         : libellé UI
   - renderer      : "glb" (fichier binaire unique) | "gltf" (JSON + .bin)
   - url           : URL du modèle (peut être relatif)
   - fallback      : id du masque canvas (existant dans masks.js)
   - anchor        : "head" (front du crâne) | "eyes" (entre les yeux)
   - fit           : ratio du modèle à utiliser pour calculer la taille
                    (largeur estimée du modèle en unités three.js)
*/
const CATALOG = [
  {
    id: "noelcap-3d",
    label: "Casquette NoelCap 3D",
    renderer: "glb",
    url: "assets/third-party-ar/noel-cap/NoelCap.glb",
    fallback: "crown",
    anchor: "head",
    fit: 1.0,
    status: "experimental",
  },
  {
    id: "glasses-3d",
    label: "Lunettes MindAR 3D",
    renderer: "gltf",
    url: "assets/third-party-ar/mindar-glasses/scene.gltf",
    fallback: "glasses",
    anchor: "eyes",
    fit: 0.18,
    status: "experimental",
  },
  {
    id: "glasses-3d-rose",
    label: "Lunettes MindAR 3D rose",
    renderer: "gltf",
    url: "assets/third-party-ar/variants/mindar-glasses-rose.gltf",
    fallback: "glasses",
    anchor: "eyes",
    fit: 0.18,
    status: "experimental",
  },
];

const _byId = new Map(CATALOG.map((entry) => [entry.id, entry]));
const _cache = new Map();        // id → { scene, anchor, fit, fallback }
let _threePromise = null;        // module three.js (résolu une fois)
let _gltfLoaderPromise = null;   // classe GLTFLoader (résolue une fois)
let _loadErrors = new Map();     // id → "unsupported" | "load_failed" | ...

/* ---------- Garde WebGL : la PWA doit TOUJOURS retomber sur canvas ---------- */
export function is3DSupported() {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return false;
    // iOS Safari peut exposer WebGL mais planter sur un draw call un peu lourd.
    // On tolère ≥ 4 cœurs logiques (la cible iPhone 11 en a 6). Sur tablette
    // Android bas de gamme, ce garde évite un crash silencieux.
    const cores = navigator.hardwareConcurrency || 2;
    if (cores < 4) return false;
    return true;
  } catch {
    return false;
  }
}

/* ---------- Manifest exposé pour le picker UI ---------- */
export function get3DCatalog() {
  return CATALOG.map((entry) => ({ ...entry }));
}

export function get3DEffect(id) {
  return _byId.get(id) || null;
}

/* ---------- Chargement paresseux de three.js + GLTFLoader ---------- */
async function ensureThree() {
  if (_threePromise) return _threePromise;
  _threePromise = import(/* @vite-ignore */ `${THREE_BASE}/build/three.module.min.js`)
    .then((mod) => mod)
    .catch((err) => {
      // Échec réseau, CSP, hors-ligne : on retombe sur le canvas.
      console.warn("[effects-3d] three.js CDN indisponible", err);
      _threePromise = null;
      throw err;
    });
  return _threePromise;
}

async function ensureGLTFLoader() {
  if (_gltfLoaderPromise) return _gltfLoaderPromise;
  _gltfLoaderPromise = (async () => {
    const THREE = await ensureThree();
    const mod = await import(/* @vite-ignore */ GLTF_LOADER);
    return mod.GLTFLoader;
  })().catch((err) => {
    _gltfLoaderPromise = null;
    throw err;
  });
  return _gltfLoaderPromise;
}

/* ---------- API publique : load3DEffect(id) → Promise<effect> -----------
   Renvoie un objet { id, scene, anchor, fit, fallback, update(ctx, face, W, H) }
   où update(ctx, face, W, H) rend le modèle 3D sur le canvas 2D déjà tracé.

   Stratégie de rendu (POC) :
     1) Calculer l'ancrage (front du crâne ou entre les yeux) à partir des
        landmarks MediaPipe (indices 10/152 pour le crâne, 33/263 pour les yeux).
     2) Centrer une caméra orthographique three.js sur ce point, à l'échelle
        ajustée par la largeur du visage.
     3) Demander un render WebGL offscreen, lire les pixels, les dessiner
        sur le canvas 2D du live overlay via ctx.drawImage.
   L'orientation du modèle reste FIXE (cf. RAPPORT-ESSAIS-3D : tracking rotation
   = v2). On conserve juste l'ancrage + l'échelle par visage. */
export async function load3DEffect(id) {
  const entry = _byId.get(id);
  if (!entry) throw new Error(`Effet 3D inconnu : ${id}`);

  if (_cache.has(id)) return _cache.get(id);
  if (_loadErrors.has(id)) throw new Error(_loadErrors.get(id));

  if (!is3DSupported()) {
    _loadErrors.set(id, "unsupported");
    throw new Error("WebGL indisponible sur cet appareil");
  }

  try {
    const THREE = await ensureThree();
    const GLTFLoader = await ensureGLTFLoader();
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(entry.url);
    const scene = gltf.scene || gltf.scenes?.[0];
    if (!scene) throw new Error("Le modèle 3D ne contient aucune scène");

    // Centre + échelle le modèle une fois pour toutes : on évite de refaire
    // ce calcul à chaque frame. La bbox est calculée sur l'état initial.
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center); // ancre le modèle sur son propre centre
    // Petit offset Y négatif pour les chapeaux (sinon ils flottent au-dessus).
    if (entry.anchor === "head") {
      scene.position.y += size.y * 0.25;
    } else {
      scene.position.y -= size.y * 0.15;
    }

    // Caméra orthographique à l'échelle du visage. On dimensionne le frustum
    // sur la largeur de la face détectée (donc scale auto par visage).
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0, 1.2);
    camera.lookAt(0, 0, 0);

    // Renderer offscreen, transparent, sans antialiasing profond (perf iPhone).
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const effect = {
      id,
      anchor: entry.anchor,
      fallback: entry.fallback,
      fit: entry.fit,
      scene,
      camera,
      renderer,
      _offscreen: null,
      _ctx: null,
      update(targetCtx, face, canvasW, canvasH) {
        if (!face || face.length < 30) return;
        // 1) Ancrage : centre du crâne (noelcap) ou entre les yeux (lunettes).
        const forehead = face[10];
        const nose = face[1];
        const leftEye = face[33];
        const rightEye = face[263];
        const anchorX = (forehead.x + nose.x) / 2;
        const anchorY = (forehead.y + nose.y) / 2;
        const eyeDist = Math.abs((leftEye.x - rightEye.x));
        // Largeur de la face (oreille à oreille) en coordonnées normalisées.
        const faceW = Math.abs((face[234].x - face[454].x)) || eyeDist * 2.4;

        // 2) Cible (zone canvas où coller le rendu 3D).
        const cx = entry.anchor === "eyes"
          ? ((leftEye.x + rightEye.x) / 2) * canvasW
          : anchorX * canvasW;
        const cy = entry.anchor === "eyes"
          ? ((leftEye.y + rightEye.y) / 2) * canvasH
          : (anchorY * canvasH) - (faceW * canvasH) * 0.22;
        const targetW = Math.max(48, faceW * canvasW * (entry.anchor === "eyes" ? 1.1 : 1.4));
        const targetH = Math.max(48, targetW * (targetW / Math.max(targetW, eyeDist * canvasW * 1.6)));

        // 3) Rendu WebGL offscreen.
        if (!this._offscreen) {
          this._offscreen = document.createElement("canvas");
          this._ctx = this._offscreen.getContext("2d");
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(2, Math.round(targetW * dpr));
        const h = Math.max(2, Math.round(targetH * dpr));
        if (this._offscreen.width !== w || this._offscreen.height !== h) {
          this._offscreen.width = w;
          this._offscreen.height = h;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        // Distance caméra : on ajuste pour que le modèle tienne dans le frustum.
        const fitWorld = Math.max(size.x, size.y, size.z) || 1;
        const fovRad = (camera.fov * Math.PI) / 180;
        const distance = (fitWorld / 2) / Math.tan(fovRad / 2);
        camera.position.set(0, 0, distance * 1.05);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);

        // 4) Composition sur le canvas 2D live.
        this._ctx.clearRect(0, 0, w, h);
        this._ctx.drawImage(renderer.domElement, 0, 0, w, h);
        const dx = cx - w / (2 * dpr);
        const dy = cy - h / (2 * dpr);
        targetCtx.save();
        targetCtx.imageSmoothingEnabled = true;
        targetCtx.imageSmoothingQuality = "high";
        targetCtx.drawImage(this._offscreen, dx, dy, w / dpr, h / dpr);
        targetCtx.restore();
      },
      dispose() {
        try { renderer.dispose(); } catch { /* WebGL déjà perdu */ }
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
            else obj.material.dispose?.();
          }
        });
      },
    };

    _cache.set(id, effect);
    return effect;
  } catch (err) {
    _loadErrors.set(id, err?.message || "load_failed");
    throw err;
  }
}

/* Reset complet (utile quand on change d'appareil ou qu'on quitte la borne). */
export function clear3DCache() {
  for (const effect of _cache.values()) {
    try { effect.dispose?.(); } catch { /* noop */ }
  }
  _cache.clear();
  _loadErrors.clear();
}

/* Wrapper synchrone pour masks.js : applique l'effet déjà chargé sur le
   canvas 2D passé en paramètre. Le `effect` vient de `load3DEffect(id)`.
   On retourne `{ canvas }` (le canvas du ctx) pour que l'appelant puisse
   composer ensuite. Si l'effet n'a pas de méthode `update`, on retourne
   `null` pour signaler l'échec → fallback canvas côté masks.js. */
export function render3DEffectToCanvas(effect, face, W, H, faceIndex = 0) {
  if (!effect || typeof effect.update !== "function") return null;
  if (!face || face.length < 30) return null;
  // Le contexte cible est créé en interne par masks.js si on veut isoler ;
  // ici on accepte que l'appelant fournisse un ctx, ou on en crée un
  // canvas offscreen. Pour rester simple et compatible, on crée un
  // canvas 2D offscreen, on y dessine, et on retourne son canvas.
  const off = document.createElement("canvas");
  off.width = Math.max(2, Math.round(W));
  off.height = Math.max(2, Math.round(H));
  const offCtx = off.getContext("2d");
  if (!offCtx) return null;
  try {
    effect.update(offCtx, face, W, H);
  } catch {
    return null;
  }
  return { canvas: off };
}
