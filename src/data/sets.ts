import type { AuraSpec, ItemSave, ItemSetDef, StatModMap, TriggerSpec } from '../core/types';

export const ITEM_SET_DEFS: ItemSetDef[] = [
  {
    id: 'frostforged',
    name: 'Frostforged',
    pieces: ['shivas-guard', 'eye-of-skadi', 'wind-waker'],
    bonuses: [
      { atPieces: 2, mods: { armor: 6 } },
      {
        atPieces: 3,
        mods: { attackSpeed: 20, spellAmpPct: 8 },
        trigger: {
          on: 'on-attack-land',
          effects: [{ kind: 'status', status: 'slow', duration: 1.5, target: 'target', params: { moveSlowPct: 30, tag: 'frostforged-chill' } }]
        }
      }
    ]
  },
  {
    id: 'bloodbound',
    name: 'Bloodbound',
    pieces: ['satanic', 'bloodthorn', 'heart-of-tarrasque'],
    bonuses: [
      { atPieces: 2, mods: { lifestealPct: 8 } },
      {
        atPieces: 3,
        mods: { damage: 18, maxHp: 180 },
        trigger: {
          on: 'on-kill',
          effects: [{ kind: 'heal', amount: 6, target: 'self', pctMaxHp: true }]
        }
      }
    ]
  },
  {
    id: 'stormforged',
    name: 'Stormforged',
    pieces: ['mjollnir', 'monkey-king-bar', 'daedalus'],
    bonuses: [
      { atPieces: 2, mods: { attackSpeed: 25 } },
      {
        atPieces: 3,
        mods: { damage: 25 },
        trigger: {
          on: 'on-attack-land',
          cooldown: 0.3,
          effects: [{ kind: 'damage', dtype: 'magical', amount: 70, target: 'target' }]
        }
      }
    ]
  },
  {
    id: 'arcanist',
    name: "Arcanist's Regalia",
    pieces: ['octarine-core', 'scythe-of-vyse', 'ethereal-blade'],
    bonuses: [
      { atPieces: 2, mods: { spellAmpPct: 10, manaRegen: 3 } },
      {
        atPieces: 3,
        mods: { int: 30 },
        aura: { radius: 700, affects: 'enemies', mods: { magicResistPct: -8 }, excludeSelf: true }
      }
    ]
  }
];

const SETS_BY_ID = new Map(ITEM_SET_DEFS.map((set) => [set.id, set]));

export function itemSetDef(id: string): ItemSetDef | undefined {
  return SETS_BY_ID.get(id);
}

export interface SetBonusEffects {
  mods: StatModMap;
  auras: AuraSpec[];
  triggers: TriggerSpec[];
}

export interface SetProgress {
  id: string;
  name: string;
  owned: number;
  total: number;
  /** highest piece count that currently grants a bonus (0 if none yet) */
  activeAt: number;
  /** next bonus threshold not yet reached (undefined once maxed) */
  nextAt?: number;
}

function ownedPieces(equipped: (ItemSave | null)[]): Set<string> {
  return new Set(equipped.filter((item): item is ItemSave => !!item).map((item) => item.id));
}

/**
 * Aggregate every active set bonus (stat mods, auras, triggers) for an equipped
 * loadout. Auras and triggers reuse the same sim machinery as item auras/triggers,
 * so a set bonus behaves exactly like an aura item or an affix trigger (ITEM_REHAUL §7).
 */
export function setBonusEffects(equipped: (ItemSave | null)[]): SetBonusEffects {
  const ids = ownedPieces(equipped);
  const out: SetBonusEffects = { mods: {}, auras: [], triggers: [] };
  for (const set of ITEM_SET_DEFS) {
    const pieces = set.pieces.filter((id) => ids.has(id)).length;
    for (const bonus of set.bonuses) {
      if (pieces < bonus.atPieces) continue;
      for (const [key, value] of Object.entries(bonus.mods ?? {}) as [keyof StatModMap, number][]) {
        out.mods[key] = (out.mods[key] ?? 0) + value;
      }
      if (bonus.aura) out.auras.push(bonus.aura);
      if (bonus.trigger) out.triggers.push(bonus.trigger);
    }
  }
  return out;
}

/** Backward-compatible alias: just the aggregated stat mods. */
export function activeSetBonuses(equipped: (ItemSave | null)[]): StatModMap {
  return setBonusEffects(equipped).mods;
}

/** Live "Frostforged 2/3" progress for every set the loadout touches (≥1 piece). */
export function setProgress(equipped: (ItemSave | null)[]): SetProgress[] {
  const ids = ownedPieces(equipped);
  const out: SetProgress[] = [];
  for (const set of ITEM_SET_DEFS) {
    const owned = set.pieces.filter((id) => ids.has(id)).length;
    if (owned === 0) continue;
    const thresholds = set.bonuses.map((b) => b.atPieces).sort((a, b) => a - b);
    const activeAt = thresholds.filter((t) => owned >= t).pop() ?? 0;
    const nextAt = thresholds.find((t) => owned < t);
    out.push({ id: set.id, name: set.name, owned, total: set.pieces.length, activeAt, nextAt });
  }
  return out;
}
