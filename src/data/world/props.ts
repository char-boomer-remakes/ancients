// Declared world sizes for the built & environment layer (OVERWORLD_PLANNING §4).
//
// Buildings, dressing props, foliage, and ambient critters used to size at the
// call site (a hardcoded 3.6 for town buildings, inline prop heights, literal
// critter heights in scene.ts). This is "the one new home": `terrain.ts` and
// `scene.ts` read a declared `WorldSize` from here instead of a literal, so the
// built world has the same single source of truth as creatures.

import type { WorldSize } from '../../core/types';

/** Town buildings (houses, inn, blacksmith) fit to this — replaces the 3.6 literal. */
export const TOWN_BUILDING_SIZE: WorldSize = {
  heightM: 3.6,
  footprintM: 3.0,
  widthM: 6,
  depthM: 6,
  sizeClass: 'structure',
  pose: 'static',
  footprintDecoupled: true
};

/** Authored town dressing props already on disk, each with its declared size. */
export const DRESSING_PROP_SIZES = {
  well: { heightM: 1.9, footprintM: 0.9, sizeClass: 'prop', pose: 'static' },
  cart: { heightM: 1.5, footprintM: 1.0, sizeClass: 'prop', pose: 'static' },
  barrel: { heightM: 1.0, footprintM: 0.4, sizeClass: 'prop', pose: 'static' },
  market: { heightM: 2.0, footprintM: 1.2, sizeClass: 'prop', pose: 'static' }
} as const satisfies Record<string, WorldSize>;

/** Instanced foliage fit targets — replaces the 4.6 / 1.5 literals in terrain.ts. */
export const FOLIAGE_SIZES = {
  tree: { heightM: 4.6, footprintM: 1.2, sizeClass: 'structure', pose: 'static' },
  rock: { heightM: 1.5, footprintM: 0.9, sizeClass: 'prop', pose: 'static' },
  bush: { heightM: 0.9, footprintM: 0.7, sizeClass: 'prop', pose: 'static' },
  fern: { heightM: 0.7, footprintM: 0.45, sizeClass: 'prop', pose: 'static' }
} as const satisfies Record<string, WorldSize>;

export interface AmbientCritterDef {
  id: string;
  url: string;
  speed: number;
  worldSize: WorldSize;
}

/** Ambient town critters — replaces the literal heights in scene.ts. */
export const AMBIENT_CRITTERS: AmbientCritterDef[] = [
  { id: 'alpaca', url: '/assets/creeps/alpaca.glb', speed: 30, worldSize: { heightM: 1.3, footprintM: 0.4, sizeClass: 'small', pose: 'quadruped' } },
  { id: 'fox', url: '/assets/creeps/fox.glb', speed: 78, worldSize: { heightM: 0.7, footprintM: 0.18, sizeClass: 'tiny', pose: 'quadruped' } },
  { id: 'frog', url: '/assets/creeps/frog.glb', speed: 40, worldSize: { heightM: 0.42, footprintM: 0.12, sizeClass: 'tiny', pose: 'quadruped' } }
];

/** All declared built/env sizes, flattened for the §7 coverage matrix + lint. */
export const BUILT_WORLD_SIZES: { id: string; kind: 'building' | 'prop' | 'critter'; worldSize: WorldSize }[] = [
  { id: 'town-building', kind: 'building', worldSize: TOWN_BUILDING_SIZE },
  ...Object.entries(DRESSING_PROP_SIZES).map(([id, worldSize]) => ({ id, kind: 'prop' as const, worldSize })),
  ...Object.entries(FOLIAGE_SIZES).map(([id, worldSize]) => ({ id, kind: 'prop' as const, worldSize })),
  ...AMBIENT_CRITTERS.map((c) => ({ id: c.id, kind: 'critter' as const, worldSize: c.worldSize }))
];
