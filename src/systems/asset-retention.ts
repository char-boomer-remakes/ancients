import { REG } from '../core/registry';
import type { GameSave } from '../core/types';
import { ENABLED_HOLDOUT_SIGNATURES, heroAssetEntry, holdoutReplacementUrl } from '../engine/assets';

// Pure asset-retention policy (OPTIMIZATION 2.0 §D.1/§D.3). These decide which
// already-loaded textures/models survive a region change: main.ts evicts every
// cached URL the new region does NOT retain before building its scene, so the
// cache holds ~one region's footprint instead of accumulating every region the
// player has ever visited. Kept DOM-free and side-effect-free so the eviction
// decision can be unit-tested headlessly (the WebGL rebuild path cannot be).

const TERRAIN_PBR_SET: Record<string, string> = {
  grass: 'Grass001',
  forest: 'Grass001',
  coast: 'Grass001',
  snow: 'Snow010A',
  desert: 'Ground080',
  wasteland: 'Ground048'
};

export function preloadPathsForRegion(regionId: string, includeEnv: boolean, includeVfx: boolean): string[] {
  const region = REG.region(regionId);
  const set = TERRAIN_PBR_SET[region.biome] ?? TERRAIN_PBR_SET.grass;
  const paths = [
    `textures/terrain/${set}_Color.jpg`,
    `textures/terrain/${set}_NormalGL.jpg`,
    `textures/terrain/${set}_Roughness.jpg`
  ];
  if (includeEnv) paths.push('env/vale_day_1k.hdr');
  if (includeVfx) paths.push('vfx/vfx_atlas.webp', 'vfx/beam_ramp.webp');
  return paths;
}

export function retainedAssetUrlsForRegion(regionId: string, includeEnv: boolean, includeVfx: boolean): Set<string> {
  return new Set(preloadPathsForRegion(regionId, includeEnv, includeVfx).map((path) => `/assets/${path}`));
}

export function prewarmModelPathsForSave(save: GameSave): string[] {
  const paths = new Set<string>();
  for (const heroId of save.party) {
    const entry = heroAssetEntry(heroId);
    if (!entry) continue;
    paths.add(entry.modelUrl);
    if (entry.weaponUrl) paths.add(entry.weaponUrl);
  }
  return [...paths];
}

export function assetUrl(path: string): string {
  return path.startsWith('/assets/') ? path : `/assets/${path}`;
}

export function retainedModelUrlsForSave(save: GameSave): Set<string> {
  const paths = new Set(prewarmModelPathsForSave(save).map(assetUrl));
  for (const id of ENABLED_HOLDOUT_SIGNATURES) {
    paths.add(assetUrl(`holdouts/${id}.glb`));
    const replacement = holdoutReplacementUrl(id);
    if (replacement) paths.add(assetUrl(replacement));
  }
  return paths;
}
