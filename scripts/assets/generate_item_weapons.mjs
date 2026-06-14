// Generate original low-poly signature held-weapon GLBs for a handful of marquee
// artifacts (ASSET_GAPS P3). These ship into public/assets/weapons/items/ and are
// wired through ITEM_WEAPON_GLB in engine/assets.ts; at runtime they override the
// hero's default hand weapon when the artifact is equipped. Items keep their
// procedural `appearance.weapon` as the guaranteed fallback when assets are absent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'weapons', 'items');

const MATERIALS = ['primary', 'secondary', 'accent', 'dark'];

// Marquee artifacts → palette [primary, secondary, accent]. `accent` is emissive.
const ITEMS = {
  daedalus: { palette: ['#d23b32', '#c8ccd6', '#ff6a4a'], style: 'crit-greatsword' },
  radiance: { palette: ['#ffd94a', '#fff4c2', '#fff2a0'], style: 'sun-blade' },
  battlefury: { palette: ['#9aa4b2', '#c8cdd8', '#7ad98a'], style: 'great-cleaver' },
  'divine-rapier': { palette: ['#ffe27d', '#fff6d0', '#ffcf4a'], style: 'divine-rapier' }
};

function hexToLinearFactor(hex) {
  const h = hex.replace('#', '');
  const to = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [to(parseInt(h.slice(0, 2), 16)), to(parseInt(h.slice(2, 4), 16)), to(parseInt(h.slice(4, 6), 16)), 1];
}

function pushFace(positions, normals, indices, verts, normal) {
  const base = positions.length / 3;
  for (const v of verts) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
    const normal = transformNormal(face[4], opts);
    pushFace(positions, normals, indices, face.slice(0, 4).map((p) => transformPoint(p, opts)), normal);
  }
  return { name, mat, positions, normals, indices };
}

function cylinder(name, mat, radius, length, axis = 'y', opts = {}, sides = 8) {
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

function cone(name, mat, radius, length, axis = 'x', opts = {}, sides = 8) {
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
    const n = transformNormal([0.7, Math.cos((a0 + a1) / 2) * 0.7, Math.sin((a0 + a1) / 2) * 0.7], opts);
    normals.push(...n, ...n, ...n);
    indices.push(base, base + 1, base + 2);
    const cb = positions.length / 3;
    for (const p of [[-length / 2, 0, 0], base1, base0].map((v) => transformPoint(v, opts))) positions.push(p[0], p[1], p[2]);
    const cn = transformNormal(axis === 'x' ? [-1, 0, 0] : axis === 'y' ? [0, -1, 0] : [0, 0, -1], opts);
    normals.push(...cn, ...cn, ...cn);
    indices.push(cb, cb + 1, cb + 2);
  }
  return { name, mat, positions, normals, indices };
}

function partsFor(style) {
  const p = [];
  const add = (...parts) => p.push(...parts);
  switch (style) {
    case 'crit-greatsword':
      // Daedalus: brutal broad greatsword with a crimson crystal edge.
      add(box('grip', 'dark', 0.22, 0.11, 0.1, { x: -0.05 }));
      add(box('pommel', 'secondary', 0.1, 0.16, 0.14, { x: -0.18 }));
      add(box('guard', 'accent', 0.07, 0.46, 0.13, { x: 0.12 }));
      add(box('blade', 'secondary', 1.18, 0.3, 0.06, { x: 0.78 }));
      add(box('crystal-edge', 'primary', 1.0, 0.1, 0.075, { x: 0.74, y: 0.13 }));
      add(cone('tip', 'primary', 0.12, 0.32, 'x', { x: 1.5 }));
      break;
    case 'sun-blade':
      // Radiance: a glowing curved sun-blade with a radiant disc at the hilt.
      add(box('grip', 'dark', 0.2, 0.1, 0.09, { x: -0.04 }));
      add(cylinder('sun-disc', 'accent', 0.2, 0.05, 'z', { x: 0.1 }, 16));
      add(box('blade', 'accent', 0.92, 0.16, 0.05, { x: 0.62, rz: 0.12 }));
      add(box('blade-2', 'primary', 0.86, 0.06, 0.06, { x: 0.6, y: 0.09, rz: 0.12 }));
      add(cone('tip', 'accent', 0.07, 0.26, 'x', { x: 1.16, y: 0.13, rz: 0.12 }));
      break;
    case 'great-cleaver':
      // Battle Fury: massive cleaver-axe with a green energy edge.
      add(cylinder('haft', 'secondary', 0.045, 1.05, 'y', { y: 0.1 }));
      add(box('grip-wrap', 'dark', 0.1, 0.5, 0.1, { y: 0.2 }));
      add(box('cleaver', 'secondary', 0.62, 0.62, 0.07, { x: 0.22, y: -0.5 }));
      add(box('energy-edge', 'accent', 0.66, 0.1, 0.085, { x: 0.5, y: -0.5 }));
      add(box('back-spike', 'secondary', 0.28, 0.16, 0.06, { x: -0.18, y: -0.5 }));
      break;
    case 'divine-rapier':
      // Divine Rapier: a long, fine, golden glowing blade with an ornate guard.
      add(box('grip', 'dark', 0.24, 0.08, 0.08, { x: -0.06 }));
      add(box('pommel', 'accent', 0.08, 0.12, 0.12, { x: -0.2 }));
      add(cylinder('guard', 'accent', 0.14, 0.06, 'z', { x: 0.1 }, 12));
      add(box('quillon', 'accent', 0.05, 0.4, 0.07, { x: 0.1 }));
      add(box('blade', 'accent', 1.32, 0.07, 0.045, { x: 0.86 }));
      add(box('fuller', 'primary', 1.2, 0.025, 0.06, { x: 0.82 }));
      add(cone('tip', 'accent', 0.045, 0.3, 'x', { x: 1.62 }));
      break;
    default:
      add(box('grip', 'dark', 0.18, 0.1, 0.09));
      add(box('blade', 'secondary', 0.75, 0.12, 0.05, { x: 0.54 }));
      add(cone('tip', 'secondary', 0.08, 0.22, 'x', { x: 1.0 }));
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

function align4(n) {
  return (n + 3) & ~3;
}

function writeGlb(file, itemId, style, palette, parts) {
  const json = {
    asset: { version: '2.0', generator: 'ancients generate_item_weapons.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: MATERIALS.map((role) => {
      const color = role === 'primary' ? palette[0] : role === 'secondary' ? palette[1] : role === 'accent' ? palette[2] : '#161820';
      return {
        name: role,
        pbrMetallicRoughness: {
          baseColorFactor: hexToLinearFactor(color),
          metallicFactor: role === 'secondary' ? 0.6 : role === 'accent' ? 0.3 : 0.1,
          roughnessFactor: role === 'accent' ? 0.28 : 0.6
        },
        emissiveFactor: role === 'accent' ? hexToLinearFactor(color).slice(0, 3).map((v) => v * 0.5) : [0, 0, 0]
      };
    }),
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: []
  };
  const chunks = [];
  const pushTyped = (array, target) => {
    const raw = Buffer.from(array.buffer);
    const offset = chunks.reduce((sum, b) => sum + b.length, 0);
    const padded = Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length)]);
    chunks.push(padded);
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length, target });
    return view;
  };
  for (const part of parts) {
    const pos = new Float32Array(part.positions);
    const nor = new Float32Array(part.normals);
    const idx = new Uint16Array(part.indices);
    const posView = pushTyped(pos, 34962);
    const norView = pushTyped(nor, 34962);
    const idxView = pushTyped(idx, 34963);
    const posAccessor = json.accessors.length;
    const b = bounds(part.positions);
    json.accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: b.min, max: b.max });
    const norAccessor = json.accessors.length;
    json.accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const idxAccessor = json.accessors.length;
    json.accessors.push({ bufferView: idxView, componentType: 5123, count: idx.length, type: 'SCALAR' });
    const mesh = json.meshes.length;
    json.meshes.push({
      name: `${itemId}-${style}-${part.name}`,
      primitives: [{
        attributes: { POSITION: posAccessor, NORMAL: norAccessor },
        indices: idxAccessor,
        material: MATERIALS.indexOf(part.mat),
        mode: 4
      }]
    });
    const node = json.nodes.length;
    json.nodes.push({ name: `${itemId}-${part.name}`, mesh });
    json.scenes[0].nodes.push(node);
  }
  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4; // glTF
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonPadded.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4; // JSON
  jsonPadded.copy(out, o); o += jsonPadded.length;
  out.writeUInt32LE(binPadded.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4; // BIN
  binPadded.copy(out, o);
  fs.writeFileSync(file, out);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const [id, def] of Object.entries(ITEMS)) {
    writeGlb(path.join(OUT_DIR, `${id}.glb`), id, def.style, def.palette, partsFor(def.style));
    count++;
  }
  console.log(`generated ${count} item weapon GLBs in ${path.relative(ROOT, OUT_DIR)}`);
}

main();
