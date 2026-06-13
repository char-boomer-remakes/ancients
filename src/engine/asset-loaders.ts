import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Render-side async asset loaders for the CC0 enhancement layer (GRAPHICS_SPEC
 * §13). Everything here is optional and best-effort: every loader resolves to
 * `null` on failure or in a headless/Node context, so the procedural floor in
 * `terrain.ts` / `models.ts` always stands and the build runs with no assets
 * present (§9.5). Vendored GLBs are meshopt-compressed, so the GLTF loader is
 * wired with `MeshoptDecoder`.
 *
 * No asset is `import`ed here; URLs are plain runtime strings under
 * `/assets/...`, which keeps the no-asset-import guard (test 21) green.
 */

const hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';

let gltf: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!gltf) {
    gltf = new GLTFLoader();
    gltf.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltf;
}

export interface ModelAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const modelCache = new Map<string, Promise<ModelAsset | null>>();
const texCache = new Map<string, Promise<THREE.Texture | null>>();
const hdrCache = new Map<string, Promise<THREE.DataTexture | null>>();

/** Load a meshopt-compressed .glb scene + clips once; shared + cloned by callers. Null on failure. */
export function loadModelAsset(url: string): Promise<ModelAsset | null> {
  if (!hasDOM) return Promise.resolve(null);
  let p = modelCache.get(url);
  if (!p) {
    p = gltfLoader()
      .loadAsync(url)
      .then((g) => ({ scene: g.scene, animations: g.animations ?? [] }))
      .catch(() => null);
    modelCache.set(url, p);
  }
  return p;
}

/** Load just the scene for static callers (terrain props/buildings). Null on failure/headless. */
export function loadModel(url: string): Promise<THREE.Group | null> {
  return loadModelAsset(url).then((asset) => asset?.scene ?? null);
}

/**
 * Clone an authored scene safely. SkeletonUtils.clone rebinds skinned meshes to
 * their cloned bones (plain `.clone()` leaves clones bound to the source
 * skeleton and renders them collapsed), and handles static meshes fine too.
 */
export function cloneModel(scene: THREE.Object3D): THREE.Object3D {
  return cloneSkeleton(scene);
}

export interface TexOpts {
  srgb?: boolean;
  repeat?: number;
  anisotropy?: number;
}

/** Load a plain image texture (terrain PBR maps, sprites). Null on failure/headless. */
export function loadTex(url: string, opts: TexOpts = {}): Promise<THREE.Texture | null> {
  if (!hasDOM) return Promise.resolve(null);
  const key = `${url}|${opts.srgb ? 's' : 'l'}|${opts.repeat ?? 0}`;
  let p = texCache.get(key);
  if (!p) {
    p = new THREE.TextureLoader()
      .loadAsync(url)
      .then((tex) => {
        tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (opts.repeat) {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(opts.repeat, opts.repeat);
        }
        tex.anisotropy = opts.anisotropy ?? 4;
        return tex;
      })
      .catch(() => null);
    texCache.set(key, p);
  }
  return p;
}

/** Equirectangular Radiance .hdr for IBL. Null on failure/headless. */
export function loadHdr(url: string): Promise<THREE.DataTexture | null> {
  if (!hasDOM) return Promise.resolve(null);
  let p = hdrCache.get(url);
  if (!p) {
    p = new RGBELoader()
      .loadAsync(url)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        return tex as THREE.DataTexture;
      })
      .catch(() => null);
    hdrCache.set(url, p);
  }
  return p;
}

/**
 * Build instanced meshes from a (possibly multi-mesh) glTF prop so hundreds of
 * trees/rocks stay a handful of draw calls. Returns one `InstancedMesh` per
 * source mesh, each baking the mesh's local transform into every instance.
 */
export function instancedFromModel(scene: THREE.Object3D, transforms: THREE.Matrix4[]): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const local = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const mat = m.material as THREE.Material | THREE.Material[];
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    local.copy(m.matrixWorld); // relative to the (un-positioned) scene root
    for (let i = 0; i < transforms.length; i++) {
      composed.multiplyMatrices(transforms[i], local);
      inst.setMatrixAt(i, composed);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    out.push(inst);
  });
  return out;
}
