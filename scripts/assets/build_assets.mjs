// Asset build pipeline (GRAPHICS_SPEC §13.5 Phase 0).
//
// Turns raw, downloaded CC0/CC-BY packs (kept out of git under tmp/asset_src/)
// into small, shipping files under public/assets/. Only the optimized output is
// committed; the raw packs never are. This mirrors the proven gltf-transform +
// meshopt + sharp flow and keeps the repo light enough to boot instantly.
//
// Usage:
//   npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node scripts/assets/build_assets.mjs scripts/assets/specs/<pack>.json [...more]
//
// Spec format (one JSON file per pack, kept beside this script under specs/):
//   { "items": [ {
//     "src":  "tmp/asset_src/Quaternius/Nature/Oak_1.glb", // .glb / .gltf (+ .bin/png)
//     "out":  "models/props/oak_1.glb",                    // relative to public/assets/
//     "type": "model" | "copy",                            // "copy" = byte-for-byte (HDRI/JPG)
//     "keepClips":   ["Idle", "Walk", "Attack"],           // optional: drop other animations
//     "renameClips": { "Armature|Idle": "Idle" },          // optional: applied after '|' strip
//     "maxTex": 512                                        // optional: clamp embedded texture px
//   } ] }
//
// Notes:
// - Clip names like "AnimalArmature|Idle" are stripped to the segment after the
//   last '|', then deduped. keepClips/renameClips run against the stripped name.
// - "model" runs resample + prune + dedup + optional texture webp resize +
//   meshopt(high). It never joins/flattens/simplifies (that corrupts low-poly
//   rigs and hard edges).
// - "copy" is a straight file copy for HDRIs and standalone PBR/normal JPGs that
//   are loaded directly (terrain splats, sky maps, water normals).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');

function resolveSrc(src) {
  return path.isAbsolute(src) ? src : path.join(ROOT, src);
}

function stripClipName(name) {
  const i = name.lastIndexOf('|');
  return i >= 0 ? name.slice(i + 1) : name;
}

async function processModel(io, fns, item) {
  const { dedup, meshopt, prune, resample, textureCompress } = fns.functions;
  const { MeshoptEncoder } = fns.meshopt;
  const sharp = fns.sharp;

  const srcPath = resolveSrc(item.src);
  const outPath = path.join(PUBLIC_ASSETS, item.out);
  const doc = await io.read(srcPath);
  const root = doc.getRoot();

  // Normalize + filter animation clips so we ship only what the animator drives.
  const seen = new Set();
  for (const anim of root.listAnimations()) {
    let name = stripClipName(anim.getName());
    if (item.renameClips && item.renameClips[name]) name = item.renameClips[name];
    const drop = (item.keepClips && !item.keepClips.includes(name)) || seen.has(name);
    if (drop) {
      anim.dispose();
      continue;
    }
    seen.add(name);
    anim.setName(name);
  }
  if (item.keepClips) {
    const missing = item.keepClips.filter((c) => !seen.has(c));
    if (missing.length) console.warn(`  WARN ${item.out}: missing clips ${missing.join(', ')}`);
  }

  const transforms = [resample(), prune(), dedup()];
  if (item.maxTex) {
    transforms.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [item.maxTex, item.maxTex] }));
  }
  transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await doc.transform(...transforms);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  const clips = root.listAnimations().length;
  console.log(`  ${item.out}  ${kb}KB${clips ? ` (${clips} clips)` : ''}`);
}

function processCopy(item) {
  const srcPath = resolveSrc(item.src);
  const outPath = path.join(PUBLIC_ASSETS, item.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(srcPath, outPath);
  console.log(`  ${item.out}  ${(fs.statSync(outPath).size / 1024).toFixed(0)}KB (copy)`);
}

async function loadDeps() {
  // Imported lazily so `node --check` and a deps-free checkout don't fail; the
  // script only needs them when actually building.
  try {
    const [{ NodeIO }, { ALL_EXTENSIONS }, functions, meshopt, sharpMod] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
      import('meshoptimizer'),
      import('sharp')
    ]);
    return { NodeIO, ALL_EXTENSIONS, functions, meshopt, sharp: sharpMod.default ?? sharpMod };
  } catch (err) {
    console.error('Missing build deps. Install them with:');
    console.error('  npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp');
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}

async function main() {
  const specs = process.argv.slice(2);
  if (!specs.length) {
    console.error('usage: node scripts/assets/build_assets.mjs <spec.json> [...]');
    process.exit(1);
  }
  const deps = await loadDeps();
  await deps.meshopt.MeshoptEncoder.ready;
  await deps.meshopt.MeshoptDecoder.ready;
  const io = new deps.NodeIO()
    .registerExtensions(deps.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': deps.meshopt.MeshoptEncoder, 'meshopt.decoder': deps.meshopt.MeshoptDecoder });

  let failures = 0;
  for (const specFile of specs) {
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    console.log(`spec: ${specFile} (${spec.items.length} items)`);
    for (const item of spec.items) {
      try {
        if (item.type === 'copy') processCopy(item);
        else await processModel(io, deps, item);
      } catch (err) {
        failures++;
        console.error(`  FAIL ${item.src}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  if (failures) {
    console.error(`${failures} item(s) failed`);
    process.exit(1);
  }
  console.log('done.');
}

main();
