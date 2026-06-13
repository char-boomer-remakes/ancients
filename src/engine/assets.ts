import { AnimationClip, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface HeroModelAsset {
  scene: Group;
  animations: AnimationClip[];
}

export interface HeroAssetManifestEntry {
  heroId: string;
  modelUrl: string;
  clips: Partial<Record<'idle' | 'run' | 'attack' | 'cast' | 'channel' | 'death', string>>;
  sockets: ('weapon' | 'back' | 'shoulder')[];
  fallback: 'procedural';
}

export const PHASE5_STARTER_ASSETS: HeroAssetManifestEntry[] = [
  'juggernaut',
  'crystal-maiden',
  'pudge',
  'earthshaker',
  'sniper',
  'lich'
].map((heroId) => ({
  heroId,
  modelUrl: `/assets/heroes/${heroId}.glb`,
  clips: { idle: 'idle', run: 'run', attack: 'attack', cast: 'cast', channel: 'channel', death: 'death' },
  sockets: ['weapon', 'back', 'shoulder'],
  fallback: 'procedural'
}));

/**
 * Heroes whose authored glTF is actually shipped in /public/assets/heroes.
 * Empty until an original or CC0/CC-BY model is dropped in — gating here keeps the
 * runtime from firing 404s (clean console) while the whole pipeline + fallback stays
 * wired and tested. Asset policy: original + generated + CC0/CC-BY only, never Valve.
 */
export const ENABLED_HERO_MODELS: ReadonlySet<string> = new Set<string>();

/** The manifest entry for a hero, but only when its model is actually available. */
export function heroAssetEntry(heroId: string | undefined): HeroAssetManifestEntry | null {
  if (!heroId || !ENABLED_HERO_MODELS.has(heroId)) return null;
  return PHASE5_STARTER_ASSETS.find((a) => a.heroId === heroId) ?? null;
}

/**
 * Phase 3 (GRAPHICS_SPEC §13): creeps render as authored Quaternius creatures
 * (CC0) when a mapping exists, else fall back to the procedural rig. Specific
 * ids win; otherwise the silhouette `build` picks a sensible archetype so every
 * creep (including summoned minions) resolves to a creature.
 */
const CREATURE_BY_ID: Record<string, string> = {
  ghost: 'ghost',
  'fell-spirit': 'ghost',
  'alpha-wolf': 'wolf',
  'giant-wolf': 'wolf',
  'polar-furbolg': 'yeti',
  'frostbitten-golem': 'yeti',
  'granite-golem': 'golelingevolved',
  'rock-golem': 'golelingevolved',
  'mud-golem': 'golelingevolved',
  'black-dragon': 'dragonevolved',
  hellbear: 'giant',
  'hill-troll': 'orc',
  kobold: 'goblin',
  'kobold-foreman': 'goblin',
  'gnoll-assassin': 'goblin',
  'vhoul-assassin': 'goblin',
  'satyr-banisher': 'demon',
  'satyr-mindstealer': 'demon',
  'harpy-stormcrafter': 'velociraptor',
  'harpy-scout': 'velociraptor',
  wildwing: 'velociraptor',
  'wildwing-ripper': 'velociraptor',
  'enraged-wildkin': 'velociraptor',
  'ice-shaman': 'tribal',
  'ogre-frostmage': 'tribal',
  'prowler-shaman': 'tribal',
  'prowler-acolyte': 'tribal',
  'dark-troll': 'tribal',
  'dark-troll-summoner': 'tribal',
  'centaur-courser': 'bull',
  'centaur-conqueror': 'bull',
  thunderhide: 'bull',
  'ancient-thunderhide': 'bull',
  'elder-jungle-stalker': 'stag',
  'ogre-bruiser': 'orc',
  'ogre-magi-large': 'orc'
};

const CREATURE_BY_BUILD: Record<string, string> = {
  biped: 'goblin',
  brute: 'orc',
  golem: 'golelingevolved',
  quad: 'wolf',
  bird: 'velociraptor',
  blob: 'glubevolved'
};

/** Authored creature GLB URL for a creep, or null to keep the procedural rig. */
export function creepCreatureUrl(creepId: string | undefined, build: string | undefined): string | null {
  const name = (creepId && CREATURE_BY_ID[creepId]) || (build && CREATURE_BY_BUILD[build]) || null;
  return name ? `/assets/creeps/${name}.glb` : null;
}

export class HeroAssetLoader {
  // Vendored GLBs are meshopt-compressed, so the decoder must be wired or loads fail.
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private cache = new Map<string, Promise<HeroModelAsset | null>>();

  /** Resolve a hero's authored scene + clips, or null to keep the procedural rig. */
  loadHero(entry: HeroAssetManifestEntry): Promise<HeroModelAsset | null> {
    const cached = this.cache.get(entry.heroId);
    if (cached) return cached;
    const promise = this.loader.loadAsync(entry.modelUrl)
      .then((gltf) => ({ scene: gltf.scene, animations: gltf.animations ?? [] }))
      .catch(() => null);
    this.cache.set(entry.heroId, promise);
    return promise;
  }

  /** True once a load has been attempted for this hero (success or fallback). */
  has(heroId: string): boolean {
    return this.cache.has(heroId);
  }
}
