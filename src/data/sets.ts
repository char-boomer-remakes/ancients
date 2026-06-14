import type { ItemSave, ItemSetDef, StatModMap } from '../core/types';

export const ITEM_SET_DEFS: ItemSetDef[] = [
  {
    id: 'frostforged',
    name: 'Frostforged',
    pieces: ['shivas-guard', 'eye-of-skadi', 'wind-waker'],
    bonuses: [
      { atPieces: 2, mods: { armor: 6 } },
      { atPieces: 3, mods: { attackSpeed: 20, spellAmpPct: 8 } }
    ]
  },
  {
    id: 'bloodbound',
    name: 'Bloodbound',
    pieces: ['satanic', 'bloodthorn', 'heart-of-tarrasque'],
    bonuses: [
      { atPieces: 2, mods: { lifestealPct: 8 } },
      { atPieces: 3, mods: { damage: 18, maxHp: 180 } }
    ]
  }
];

const SETS_BY_ID = new Map(ITEM_SET_DEFS.map((set) => [set.id, set]));

export function itemSetDef(id: string): ItemSetDef | undefined {
  return SETS_BY_ID.get(id);
}

export function activeSetBonuses(equipped: (ItemSave | null)[]): StatModMap {
  const ids = new Set(equipped.filter((item): item is ItemSave => !!item).map((item) => item.id));
  const mods: StatModMap = {};
  for (const set of ITEM_SET_DEFS) {
    const pieces = set.pieces.filter((id) => ids.has(id)).length;
    for (const bonus of set.bonuses) {
      if (pieces < bonus.atPieces || !bonus.mods) continue;
      for (const [key, value] of Object.entries(bonus.mods) as [keyof StatModMap, number][]) {
        mods[key] = (mods[key] ?? 0) + value;
      }
    }
  }
  return mods;
}
