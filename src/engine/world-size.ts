// World-size resolver (OVERWORLD_PLANNING §2/§3).
//
// One canonical real-world size, in meters, for every world entity. Where an
// entity declares an explicit `WorldSize` it wins; otherwise the size derives
// from `SilhouetteSpec.scale` (the 1.8 m standard hero) and the entity's sim
// collision radius, so existing scale-only content stays describable in meters
// with zero migration (§9.1). No core math changes — this is a read layer.

import type { BossDef, CreepDef, HeroDef, QuestGiverDef, SilhouetteSpec, SizeClass, SummonSpec, WorldSize } from '../core/types';
import { TUNING } from '../data/tuning';
import { HERO_HEIGHT_M, heightMFromScale, radiusToFootprint } from './scale';

export interface ResolvedWorldSize {
  heightM: number;
  footprintM: number;
  widthM?: number;
  depthM?: number;
  sizeClass: SizeClass;
  pose: NonNullable<WorldSize['pose']>;
  footprintDecoupled: boolean;
}

/** Height bands per class (meters). The lint flags anything outside its band (§3). */
export const SIZE_BANDS: Record<SizeClass, { min: number; max: number }> = {
  // Creatures.
  tiny: { min: 0.3, max: 0.8 },
  small: { min: 0.8, max: 1.4 },
  human: { min: 1.4, max: 2.2 },
  large: { min: 2.2, max: 3.5 },
  huge: { min: 3.5, max: 6.0 },
  colossal: { min: 6.0, max: 14 },
  // Built & environment.
  prop: { min: 0.3, max: 2.5 },
  structure: { min: 2.5, max: 8 },
  landmark: { min: 8, max: 40 }
};

const CREATURE_CLASSES: SizeClass[] = ['tiny', 'small', 'human', 'large', 'huge', 'colossal'];
const BUILT_CLASSES: SizeClass[] = ['prop', 'structure', 'landmark'];

function inferFrom(heightM: number, order: SizeClass[]): SizeClass {
  for (const sizeClass of order) {
    if (heightM <= SIZE_BANDS[sizeClass].max) return sizeClass;
  }
  return order[order.length - 1];
}

/** Pick the creature class whose band contains the height (clamped to the ends). */
export const inferCreatureSizeClass = (heightM: number): SizeClass => inferFrom(heightM, CREATURE_CLASSES);
/** Pick the built/env class whose band contains the height (clamped to the ends). */
export const inferBuiltSizeClass = (heightM: number): SizeClass => inferFrom(heightM, BUILT_CLASSES);

/** True when `heightM` sits inside the class's §3 band. */
export function inBand(sizeClass: SizeClass, heightM: number): boolean {
  const band = SIZE_BANDS[sizeClass];
  return heightM >= band.min && heightM <= band.max;
}

function poseForBuild(build: SilhouetteSpec['build']): NonNullable<WorldSize['pose']> {
  switch (build) {
    case 'quad': return 'quadruped';
    case 'bird': return 'winged';
    case 'ward': return 'static';
    default: return 'standing';
  }
}

/** Resolve a creature's size from its silhouette, optional override, and sim radius. */
export function creatureWorldSize(
  sil: SilhouetteSpec,
  override: WorldSize | undefined,
  simRadius: number | undefined
): ResolvedWorldSize {
  const heightM = override?.heightM ?? heightMFromScale(sil.scale);
  const footprintM = override?.footprintM
    ?? (simRadius !== undefined ? radiusToFootprint(simRadius) : +(heightM * 0.13).toFixed(3));
  return {
    heightM,
    footprintM,
    widthM: override?.widthM,
    depthM: override?.depthM,
    sizeClass: override?.sizeClass ?? inferCreatureSizeClass(heightM),
    pose: override?.pose ?? poseForBuild(sil.build),
    footprintDecoupled: override?.footprintDecoupled ?? false
  };
}

export const heroWorldSize = (hero: HeroDef): ResolvedWorldSize =>
  creatureWorldSize(hero.silhouette, hero.worldSize, TUNING.unitRadiusHero);

export const creepWorldSize = (creep: CreepDef): ResolvedWorldSize =>
  creatureWorldSize(creep.silhouette, creep.worldSize, TUNING.unitRadiusCreep[creep.tier]);

export const summonWorldSize = (summon: SummonSpec): ResolvedWorldSize =>
  creatureWorldSize(summon.silhouette, summon.worldSize, TUNING.unitRadiusHero);

/** Quest givers are villagers: the human default unless they declare otherwise. */
export function questGiverWorldSize(giver: QuestGiverDef): ResolvedWorldSize {
  const heightM = giver.worldSize?.heightM ?? HERO_HEIGHT_M;
  return {
    heightM,
    footprintM: giver.worldSize?.footprintM ?? radiusToFootprint(TUNING.unitRadiusHero),
    widthM: giver.worldSize?.widthM,
    depthM: giver.worldSize?.depthM,
    sizeClass: giver.worldSize?.sizeClass ?? inferCreatureSizeClass(heightM),
    pose: giver.worldSize?.pose ?? 'standing',
    footprintDecoupled: giver.worldSize?.footprintDecoupled ?? false
  };
}

/**
 * A boss is never just its source hero at 1.0× (closes the §0 gap): `rank` carries
 * a minimum band — mini-boss ≥ `large`, boss ≥ `huge` — and footprint grows with
 * the silhouette. The visual scale-up is intentionally decoupled from the sim
 * radius (regular bosses keep the hero's collision radius; only raid bosses scale
 * it via `raidBossRadiusScale`), so the §6 parity gate skips it.
 */
export function bossWorldSize(boss: BossDef, hero: HeroDef): ResolvedWorldSize {
  const base = heroWorldSize(hero);
  if (boss.worldSize?.heightM) {
    return creatureWorldSize(hero.silhouette, { footprintDecoupled: true, ...boss.worldSize }, TUNING.unitRadiusHero);
  }
  const floorClass: SizeClass = boss.rank === 'boss' ? 'huge' : 'large';
  const heightM = Math.max(base.heightM, SIZE_BANDS[floorClass].min);
  const grow = heightM / base.heightM;
  return {
    heightM,
    footprintM: +(base.footprintM * grow).toFixed(3),
    sizeClass: inferCreatureSizeClass(heightM),
    pose: base.pose,
    footprintDecoupled: true
  };
}

/**
 * Render-only multiplier that lifts a boss's source-hero silhouette to its
 * resolved boss height (§3 / §5.1 "the fit pipeline honors it"). The sim keeps
 * the hero's stats and collision; only the rig height — and everything anchored
 * to it (HP bar, selection ring, camera framing) — grows. Basis-independent: the
 * ratio of declared heights, so it lands the same on-screen size relationship
 * whatever the procedural rig's internal height factor happens to be.
 */
export const bossVisualScale = (boss: BossDef, hero: HeroDef): number =>
  +(bossWorldSize(boss, hero).heightM / heroWorldSize(hero).heightM).toFixed(4);

/** Same lift as {@link bossVisualScale} but for spawn paths that carry only a
 * rank (the raid arena builds its boss from a hero setup, not a `BossDef`). */
export function bossVisualScaleForRank(rank: BossDef['rank'], hero: HeroDef): number {
  const base = heroWorldSize(hero);
  const floorClass: SizeClass = rank === 'boss' ? 'huge' : 'large';
  const heightM = Math.max(base.heightM, SIZE_BANDS[floorClass].min);
  return +(heightM / base.heightM).toFixed(4);
}
