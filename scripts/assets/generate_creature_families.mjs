// Generate original low-poly, animated creature GLBs for the families ANCIENTS
// had no model for (ASSET_GAPS P1.3): a winged flier, a bear, and a walking
// treant. These ship into public/assets/creeps/ alongside the vendored Quaternius
// CC0 set and are wired through CREATURE_BY_ID / HERO_COHORTS in engine/assets.ts.
//
// Same hand-rolled glTF writer as generate_holdout_signatures.mjs: every part is a
// box/cylinder/cone, all parented under one animated rig node so the authored-model
// mixer drives idle/run/attack/cast/death. Materials are a neutral 4-role set; the
// runtime recolors each clone to the consuming creep/hero palette, so the colors
// here are only a sensible default. Fully deterministic, no external assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'creeps');

const MATERIALS = ['primary', 'secondary', 'accent', 'dark'];

const CREATURES = {
  // Bird/bat flier for harpies (and a closer read than a grounded raptor).
  flier: { palette: ['#8a93b0', '#3a4258', '#e8e0c4'], style: 'flier' },
  // Bulky bear for ursa / hellbear / owlbears.
  bear: { palette: ['#7c5a3c', '#3a2616', '#d8c0a0'], style: 'bear' },
  // Walking tree for treant-protector.
  treant: { palette: ['#5d7a3c', '#352712', '#9fd05c'], style: 'treant' }
};

function hexToLinearFactor(hex) {
  const h = hex.replace('#', '');
  const to = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [to(parseInt(h.slice(0, 2), 16)), to(parseInt(h.slice(2, 4), 16)), to(parseInt(h.slice(4, 6), 16)), 1];
}

function align4(n) {
  return (n + 3) & ~3;
}

function quatFromEuler(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

function transformPoint(p, opts = {}) {
  const rz = opts.rz ?? 0;
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  const x = p[0] * c - p[1] * s;
  const y = p[0] * s + p[1] * c;
  return [x + (opts.x ?? 0), y + (opts.y ?? 0), p[2] + (opts.z ?? 0)];
}

function transformNormal(n, opts = {}) {
  const rz = opts.rz ?? 0;
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  return [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]];
}

function pushFace(positions, normals, indices, verts, normal) {
  const base = positions.length / 3;
  for (const v of verts) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function box(name, mat, sx, sy, sz, opts = {}) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const faces = [
    [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0]],
    [[-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-1, 0, 0]],
    [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0]],
    [[-x, -y, -z], [-x, -y, z], [x, -y, z], [x, -y, -z], [0, -1, 0]],
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]]
  ];
  const positions = [], normals = [], indices = [];
  for (const face of faces) {
    pushFace(positions, normals, indices, face.slice(0, 4).map((p) => transformPoint(p, opts)), transformNormal(face[4], opts));
  }
  return { name, mat, positions, normals, indices };
}

function cylinder(name, mat, radius, length, axis = 'y', opts = {}, sides = 10) {
  const positions = [], normals = [], indices = [];
  const axisPoint = (t, a, r = radius) => {
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (axis === 'x') return [t * length / 2, c, s];
    if (axis === 'z') return [c, s, t * length / 2];
    return [c, t * length / 2, s];
  };
  const axisNormal = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    if (axis === 'x') return [0, c, s];
    if (axis === 'z') return [c, s, 0];
    return [c, 0, s];
  };
  const capNormal = (t) => axis === 'x' ? [t, 0, 0] : axis === 'z' ? [0, 0, t] : [0, t, 0];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    pushFace(
      positions,
      normals,
      indices,
      [axisPoint(-1, a0), axisPoint(1, a0), axisPoint(1, a1), axisPoint(-1, a1)].map((p) => transformPoint(p, opts)),
      transformNormal(axisNormal((a0 + a1) / 2), opts)
    );
    for (const t of [-1, 1]) {
      const center = axisPoint(t, 0, 0);
      const verts = t > 0 ? [center, axisPoint(t, a0), axisPoint(t, a1)] : [center, axisPoint(t, a1), axisPoint(t, a0)];
      const base = positions.length / 3;
      const n = transformNormal(capNormal(t), opts);
      for (const p of verts.map((v) => transformPoint(v, opts))) {
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      }
      indices.push(base, base + 1, base + 2);
    }
  }
  return { name, mat, positions, normals, indices };
}

function cone(name, mat, radius, length, axis = 'y', opts = {}, sides = 10) {
  const positions = [], normals = [], indices = [];
  const point = (t, a, r = radius) => {
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (axis === 'x') return [t * length / 2, c, s];
    if (axis === 'z') return [c, s, t * length / 2];
    return [c, t * length / 2, s];
  };
  const tip = point(1, 0, 0);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const base0 = point(-1, a0);
    const base1 = point(-1, a1);
    const base = positions.length / 3;
    for (const p of [base0, tip, base1].map((v) => transformPoint(v, opts))) positions.push(p[0], p[1], p[2]);
    const n = transformNormal([0, 0.7, 0.7], opts);
    normals.push(...n, ...n, ...n);
    indices.push(base, base + 1, base + 2);
    const cb = positions.length / 3;
    for (const p of [[0, -length / 2, 0], base1, base0].map((v) => transformPoint(v, opts))) positions.push(p[0], p[1], p[2]);
    const cn = transformNormal(axis === 'x' ? [-1, 0, 0] : axis === 'z' ? [0, 0, -1] : [0, -1, 0], opts);
    normals.push(...cn, ...cn, ...cn);
    indices.push(cb, cb + 1, cb + 2);
  }
  return { name, mat, positions, normals, indices };
}

// Each creature faces +x. Built around feet at y≈0; the runtime fits height + seats
// feet, so proportions (not absolute size) are what read.
function partsFor(style) {
  const p = [];
  const add = (...parts) => p.push(...parts);
  switch (style) {
    case 'flier': {
      // Upright bird/bat: compact body, hooked beak, broad swept wings, fan tail.
      add(cylinder('leg-l', 'dark', 0.05, 0.42, 'y', { x: 0.04, y: 0.42, z: 0.16 }, 8));
      add(cylinder('leg-r', 'dark', 0.05, 0.42, 'y', { x: 0.04, y: 0.42, z: -0.16 }, 8));
      add(box('foot-l', 'accent', 0.22, 0.06, 0.16, { x: 0.12, y: 0.2, z: 0.16 }));
      add(box('foot-r', 'accent', 0.22, 0.06, 0.16, { x: 0.12, y: 0.2, z: -0.16 }));
      add(box('body', 'primary', 0.46, 0.62, 0.46, { y: 1.0, rz: 0.12 }));
      add(box('chest', 'secondary', 0.34, 0.34, 0.4, { x: 0.16, y: 1.18, rz: 0.2 }));
      add(box('head', 'primary', 0.32, 0.3, 0.3, { x: 0.22, y: 1.46 }));
      add(cone('beak', 'accent', 0.09, 0.3, 'x', { x: 0.46, y: 1.42 }, 8));
      add(box('eye-l', 'accent', 0.06, 0.08, 0.06, { x: 0.36, y: 1.52, z: 0.1 }));
      add(box('eye-r', 'accent', 0.06, 0.08, 0.06, { x: 0.36, y: 1.52, z: -0.1 }));
      // Big swept wings (the family's whole point — reads airborne, not raptor).
      add(box('wing-l', 'secondary', 0.1, 1.15, 0.5, { x: -0.18, y: 1.18, z: 0.5, rz: 0.42 }));
      add(box('wing-r', 'secondary', 0.1, 1.15, 0.5, { x: -0.18, y: 1.18, z: -0.5, rz: 0.42 }));
      add(box('wingtip-l', 'accent', 0.06, 0.5, 0.32, { x: -0.42, y: 1.74, z: 0.72, rz: 0.5 }));
      add(box('wingtip-r', 'accent', 0.06, 0.5, 0.32, { x: -0.42, y: 1.74, z: -0.72, rz: 0.5 }));
      for (let i = 0; i < 3; i++) add(cone(`tail-${i}`, 'secondary', 0.08, 0.5, 'x', { x: -0.42, y: 0.92 + i * 0.02, z: (i - 1) * 0.16, rz: 3.0 }, 6));
      break;
    }
    case 'bear': {
      // Hulking upright bear: thick legs, barrel torso, slab shoulders, blunt snout.
      add(cylinder('leg-l', 'primary', 0.17, 0.78, 'y', { x: 0.0, y: 0.4, z: 0.24 }, 10));
      add(cylinder('leg-r', 'primary', 0.17, 0.78, 'y', { x: 0.0, y: 0.4, z: -0.24 }, 10));
      add(box('foot-l', 'dark', 0.36, 0.12, 0.26, { x: 0.1, y: 0.06, z: 0.24 }));
      add(box('foot-r', 'dark', 0.36, 0.12, 0.26, { x: 0.1, y: 0.06, z: -0.24 }));
      add(box('hips', 'primary', 0.6, 0.46, 0.7, { y: 0.92 }));
      add(box('torso', 'primary', 0.7, 0.78, 0.78, { y: 1.36, rz: -0.06 }));
      add(box('belly', 'secondary', 0.5, 0.5, 0.6, { x: 0.16, y: 1.18 }));
      add(box('shoulders', 'primary', 0.62, 0.4, 1.06, { y: 1.74 }));
      add(cylinder('arm-l', 'primary', 0.14, 0.82, 'y', { x: 0.04, y: 1.36, z: 0.56, rz: 0.12 }, 10));
      add(cylinder('arm-r', 'primary', 0.14, 0.82, 'y', { x: 0.04, y: 1.36, z: -0.56, rz: 0.12 }, 10));
      add(box('paw-l', 'dark', 0.26, 0.18, 0.22, { x: 0.12, y: 0.98, z: 0.58 }));
      add(box('paw-r', 'dark', 0.26, 0.18, 0.22, { x: 0.12, y: 0.98, z: -0.58 }));
      for (const z of [0.5, 0.62]) add(cone('claw', 'accent', 0.05, 0.18, 'x', { x: 0.3, y: 0.94, z }, 6));
      for (const z of [-0.5, -0.62]) add(cone('claw', 'accent', 0.05, 0.18, 'x', { x: 0.3, y: 0.94, z }, 6));
      add(box('head', 'primary', 0.46, 0.44, 0.46, { x: 0.12, y: 2.04 }));
      add(box('snout', 'secondary', 0.3, 0.24, 0.26, { x: 0.34, y: 1.98 }));
      add(box('nose', 'dark', 0.1, 0.1, 0.12, { x: 0.5, y: 2.0 }));
      add(cone('ear-l', 'primary', 0.11, 0.18, 'y', { x: 0.02, y: 2.3, z: 0.18 }, 8));
      add(cone('ear-r', 'primary', 0.11, 0.18, 'y', { x: 0.02, y: 2.3, z: -0.18 }, 8));
      add(box('eye-l', 'accent', 0.06, 0.07, 0.06, { x: 0.32, y: 2.12, z: 0.13 }));
      add(box('eye-r', 'accent', 0.06, 0.07, 0.06, { x: 0.32, y: 2.12, z: -0.13 }));
      break;
    }
    case 'treant': {
      // Walking tree: braced root legs, gnarled trunk, branch arms, leafy canopy.
      add(cylinder('root-l', 'secondary', 0.14, 0.66, 'y', { x: 0.02, y: 0.32, z: 0.26, rz: 0.18 }, 8));
      add(cylinder('root-r', 'secondary', 0.14, 0.66, 'y', { x: 0.02, y: 0.32, z: -0.26, rz: 0.18 }, 8));
      add(cylinder('root-back', 'secondary', 0.12, 0.5, 'y', { x: -0.22, y: 0.26, rz: -0.3 }, 8));
      add(box('root-foot-l', 'dark', 0.4, 0.12, 0.28, { x: 0.12, y: 0.06, z: 0.26 }));
      add(box('root-foot-r', 'dark', 0.4, 0.12, 0.28, { x: 0.12, y: 0.06, z: -0.26 }));
      add(cylinder('trunk', 'primary', 0.32, 1.3, 'y', { y: 1.1 }, 12));
      add(cylinder('trunk-upper', 'primary', 0.26, 0.7, 'y', { y: 1.92, rz: 0.06 }, 12));
      add(box('bark-ridge', 'secondary', 0.12, 1.1, 0.18, { x: 0.28, y: 1.1 }));
      // Carved face in the trunk.
      add(box('brow', 'secondary', 0.12, 0.1, 0.5, { x: 0.3, y: 1.7 }));
      add(box('eye-l', 'accent', 0.08, 0.12, 0.1, { x: 0.32, y: 1.58, z: 0.14 }));
      add(box('eye-r', 'accent', 0.08, 0.12, 0.1, { x: 0.32, y: 1.58, z: -0.14 }));
      add(box('maw', 'dark', 0.1, 0.16, 0.28, { x: 0.3, y: 1.34 }));
      // Branch arms.
      add(cylinder('arm-l', 'primary', 0.11, 0.95, 'y', { x: 0.0, y: 1.5, z: 0.42, rz: 0.7 }, 8));
      add(cylinder('arm-r', 'primary', 0.11, 0.95, 'y', { x: 0.0, y: 1.5, z: -0.42, rz: 0.7 }, 8));
      for (const z of [0.78, 0.62]) add(cylinder('twig-l', 'secondary', 0.04, 0.34, 'y', { x: 0.0, y: 1.96, z, rz: 1.0 }, 6));
      for (const z of [-0.78, -0.62]) add(cylinder('twig-r', 'secondary', 0.04, 0.34, 'y', { x: 0.0, y: 1.96, z, rz: 1.0 }, 6));
      // Leafy canopy.
      add(cone('canopy-top', 'accent', 0.52, 0.7, 'y', { y: 2.5 }, 12));
      add(box('canopy-l', 'accent', 0.5, 0.42, 0.5, { x: -0.04, y: 2.34, z: 0.34 }));
      add(box('canopy-r', 'accent', 0.5, 0.42, 0.5, { x: -0.04, y: 2.34, z: -0.34 }));
      add(box('canopy-f', 'accent', 0.42, 0.4, 0.46, { x: 0.28, y: 2.3 }));
      break;
    }
  }
  return p;
}

function bounds(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], values[i + k]);
      max[k] = Math.max(max[k], values[i + k]);
    }
  }
  return { min, max };
}

function addAccessor(json, chunks, array, type, target, minMax) {
  const raw = Buffer.from(array.buffer);
  const offset = chunks.reduce((sum, b) => sum + b.length, 0);
  chunks.push(Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length)]));
  const view = json.bufferViews.length;
  const bufferView = { buffer: 0, byteOffset: offset, byteLength: raw.length };
  if (target) bufferView.target = target;
  json.bufferViews.push(bufferView);
  const accessor = json.accessors.length;
  json.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: array.length / (type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : 1),
    type,
    ...(minMax ?? {})
  });
  return accessor;
}

function addAnimationClip(json, chunks, rigNode, name, frames) {
  const times = new Float32Array(frames.map((f) => f.t));
  const timeAccessor = addAccessor(json, chunks, times, 'SCALAR', undefined, {
    min: [frames[0].t],
    max: [frames[frames.length - 1].t]
  });
  const samplers = [];
  const channels = [];
  const addChannel = (pathName, values, type) => {
    const out = new Float32Array(values.flat());
    const output = addAccessor(json, chunks, out, type);
    const sampler = samplers.length;
    samplers.push({ input: timeAccessor, output, interpolation: 'LINEAR' });
    channels.push({ sampler, target: { node: rigNode, path: pathName } });
  };
  addChannel('translation', frames.map((f) => f.translation ?? [0, 0, 0]), 'VEC3');
  addChannel('rotation', frames.map((f) => f.rotation ?? quatFromEuler()), 'VEC4');
  if (frames.some((f) => f.scale)) addChannel('scale', frames.map((f) => f.scale ?? [1, 1, 1]), 'VEC3');
  json.animations.push({ name, samplers, channels });
}

function addCreatureAnimations(json, chunks, rigNode) {
  addAnimationClip(json, chunks, rigNode, 'idle', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.03) },
    { t: 0.9, translation: [0, 0.05, 0], rotation: quatFromEuler(0, 0, 0.03) },
    { t: 1.8, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.03) }
  ]);
  addAnimationClip(json, chunks, rigNode, 'run', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.1) },
    { t: 0.2, translation: [0.05, 0.12, 0], rotation: quatFromEuler(0, 0, 0.1) },
    { t: 0.4, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.1) }
  ]);
  addAnimationClip(json, chunks, rigNode, 'attack', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.14, translation: [0.2, 0.03, 0], rotation: quatFromEuler(0, 0, -0.3), scale: [1.1, 0.94, 1.1] },
    { t: 0.36, translation: [-0.04, 0, 0], rotation: quatFromEuler(0, 0, 0.1), scale: [1, 1, 1] }
  ]);
  addAnimationClip(json, chunks, rigNode, 'cast', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.35, translation: [0, 0.18, 0], rotation: quatFromEuler(0, 0.2, 0), scale: [1.1, 1.1, 1.1] },
    { t: 0.7, translation: [0, 0.04, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] }
  ]);
  addAnimationClip(json, chunks, rigNode, 'death', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.5, translation: [-0.1, -0.2, 0], rotation: quatFromEuler(0, 0, 0.6), scale: [0.9, 0.6, 0.9] },
    { t: 1, translation: [-0.12, -0.4, 0], rotation: quatFromEuler(0, 0, 1.2), scale: [0.7, 0.3, 0.7] }
  ]);
}

function writeGlb(file, id, palette, parts) {
  const json = {
    asset: { version: '2.0', generator: 'ancients generate_creature_families.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: MATERIALS.map((role) => {
      const color = role === 'primary' ? palette[0] : role === 'secondary' ? palette[1] : role === 'accent' ? palette[2] : '#101018';
      return {
        name: role,
        pbrMetallicRoughness: {
          baseColorFactor: hexToLinearFactor(color),
          metallicFactor: role === 'secondary' ? 0.2 : 0.04,
          roughnessFactor: role === 'accent' ? 0.5 : 0.85
        },
        emissiveFactor: role === 'accent' ? hexToLinearFactor(color).slice(0, 3).map((v) => v * 0.15) : [0, 0, 0]
      };
    }),
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
    animations: []
  };
  const chunks = [];
  const pushTyped = (array, target) => {
    const raw = Buffer.from(array.buffer);
    const offset = chunks.reduce((sum, b) => sum + b.length, 0);
    chunks.push(Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length)]));
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length, target });
    return view;
  };
  const rigNode = json.nodes.length;
  json.nodes.push({ name: `${id}-rig`, children: [] });
  json.scenes[0].nodes.push(rigNode);
  for (const part of parts) {
    const pos = new Float32Array(part.positions);
    const nor = new Float32Array(part.normals);
    const idx = new Uint16Array(part.indices);
    const posView = pushTyped(pos, 34962);
    const norView = pushTyped(nor, 34962);
    const idxView = pushTyped(idx, 34963);
    const posAccessor = json.accessors.length;
    json.accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', ...bounds(part.positions) });
    const norAccessor = json.accessors.length;
    json.accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const idxAccessor = json.accessors.length;
    json.accessors.push({ bufferView: idxView, componentType: 5123, count: idx.length, type: 'SCALAR' });
    const mesh = json.meshes.length;
    json.meshes.push({
      name: `${id}-${part.name}`,
      primitives: [{ attributes: { POSITION: posAccessor, NORMAL: norAccessor }, indices: idxAccessor, material: MATERIALS.indexOf(part.mat), mode: 4 }]
    });
    const node = json.nodes.length;
    json.nodes.push({ name: `${id}-${part.name}`, mesh });
    json.nodes[rigNode].children.push(node);
  }
  addCreatureAnimations(json, chunks, rigNode);
  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonPadded.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;
  jsonPadded.copy(out, o); o += jsonPadded.length;
  out.writeUInt32LE(binPadded.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  binPadded.copy(out, o);
  fs.writeFileSync(file, out);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const [id, def] of Object.entries(CREATURES)) {
    writeGlb(path.join(OUT_DIR, `${id}.glb`), id, def.palette, partsFor(def.style));
    count++;
  }
  console.log(`generated ${count} creature-family GLBs in ${path.relative(ROOT, OUT_DIR)}`);
}

main();
