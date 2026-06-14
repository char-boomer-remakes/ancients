import type { DifficultyTier, ItemDef, ItemGrade, ItemTier, StatModMap } from '../core/types';

export interface GradeDef {
  id: ItemGrade;
  name: string;
  frame: string;
  pips: number;
  affixSlots: number;
  percentile: [number, number];
  signatureChance: number;
  socketChance: number;
}

export const ITEM_GRADES: ItemGrade[] = ['broken', 'worn', 'standard', 'sharp', 'refined', 'pristine'];

export const GRADE_DEFS: Record<ItemGrade, GradeDef> = {
  broken: { id: 'broken', name: 'Broken', frame: '#6f7278', pips: 0, affixSlots: 0, percentile: [0, 0.22], signatureChance: 0, socketChance: 0 },
  worn: { id: 'worn', name: 'Worn', frame: '#9a7042', pips: 1, affixSlots: 1, percentile: [0.18, 0.42], signatureChance: 0, socketChance: 0 },
  standard: { id: 'standard', name: 'Standard', frame: '#b8c0c8', pips: 2, affixSlots: 1, percentile: [0.36, 0.64], signatureChance: 0, socketChance: 0 },
  sharp: { id: 'sharp', name: 'Sharp', frame: '#d9e4ef', pips: 3, affixSlots: 2, percentile: [0.58, 0.8], signatureChance: 0, socketChance: 0.15 },
  refined: { id: 'refined', name: 'Refined', frame: '#d8e7ff', pips: 4, affixSlots: 2, percentile: [0.74, 0.92], signatureChance: 0.08, socketChance: 0.35 },
  pristine: { id: 'pristine', name: 'Pristine', frame: '#ffd86a', pips: 5, affixSlots: 3, percentile: [0.88, 1], signatureChance: 0.2, socketChance: 0.6 }
};

const FLAT_ROLL_STATS = new Set<keyof StatModMap>([
  'damage',
  'armor',
  'str',
  'agi',
  'int',
  'maxHp',
  'maxMana',
  'attackSpeed',
  'hpRegen',
  'manaRegen',
  'moveSpeed'
]);

export type GradeFloorSource = 'normal' | 'elite' | 'boss' | 'raid' | 'special';

function gradeIndex(grade: ItemGrade): number {
  return ITEM_GRADES.indexOf(grade);
}

function gradeAt(idx: number): ItemGrade {
  return ITEM_GRADES[Math.max(0, Math.min(ITEM_GRADES.length - 1, idx))];
}

function tierBaseFloor(tier: ItemTier): ItemGrade {
  if (tier === 'special') return 'pristine';
  if (tier === 't4') return 'standard';
  if (tier === 't3') return 'worn';
  return 'broken';
}

function sourceFloor(source: GradeFloorSource): ItemGrade {
  switch (source) {
    case 'elite': return 'sharp';
    case 'boss': return 'sharp';
    case 'raid': return 'refined';
    case 'special': return 'pristine';
    default: return 'broken';
  }
}

export function itemLevel(cost: number): number {
  if (cost >= 6500) return 21;
  if (cost >= 5000) return 18;
  if (cost >= 3600) return 15;
  if (cost >= 2200) return 11;
  if (cost >= 1200) return 7;
  if (cost >= 500) return 4;
  return 1;
}

export function levelReq(item: ItemDef, grade: ItemGrade = 'standard'): number {
  const bump = grade === 'pristine' ? 2 : grade === 'refined' ? 1 : 0;
  return itemLevel(item.cost) + bump;
}

export function gradeFloor(item: ItemDef, opts: { difficulty?: DifficultyTier; source?: GradeFloorSource } = {}): ItemGrade {
  const floors = [tierBaseFloor(item.tier), sourceFloor(opts.source ?? 'normal')];
  const difficultyBump = opts.difficulty === 'hell' ? 2 : opts.difficulty === 'nightmare' ? 1 : 0;
  const best = floors.reduce((idx, grade) => Math.max(idx, gradeIndex(grade)), 0);
  return gradeAt(best + difficultyBump);
}

export function rollGrade(floor: ItemGrade, roll: number): ItemGrade {
  const min = gradeIndex(floor);
  const steps = ITEM_GRADES.length - min;
  const skewed = Math.pow(Math.max(0, Math.min(1, roll)), 1.75);
  return gradeAt(min + Math.floor(skewed * steps));
}

export function percentileForGrade(grade: ItemGrade, roll: number): number {
  const [lo, hi] = GRADE_DEFS[grade].percentile;
  return lo + (hi - lo) * Math.max(0, Math.min(1, roll));
}

export function statMultiplier(percentile: number): number {
  return 0.8 + Math.max(0, Math.min(1, percentile)) * 0.4;
}

export function gradeBaseStatMods(item: ItemDef, percentile: number): StatModMap {
  const mods: StatModMap = {};
  const mult = statMultiplier(percentile);
  for (const [key, value] of Object.entries(item.passiveMods ?? {}) as [keyof StatModMap, number][]) {
    if (!FLAT_ROLL_STATS.has(key)) continue;
    const delta = Math.round((value * (mult - 1)) * 10) / 10;
    if (delta !== 0) mods[key] = delta;
  }
  return mods;
}
