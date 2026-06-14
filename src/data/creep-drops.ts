import { TUNING } from './tuning';
import type { CreepTier, DifficultyTier, ItemDropTable, ItemQuality } from '../core/types';

const COMMON_CONSUMABLES = [
  'tango',
  'healing-salve',
  'clarity',
  'dust-of-appearance',
  'observer-ward',
  'sentry-ward',
  'smoke-of-deceit'
].map((id) => ({ id, weight: 1 }));

const EARLY_COMPONENTS = [
  'iron-branch',
  'circlet',
  'gauntlets-of-strength',
  'slippers-of-agility',
  'mantle-of-intelligence',
  'belt-of-strength',
  'band-of-elvenskin',
  'robe-of-the-magi',
  'blades-of-attack'
].map((id) => ({ id, weight: 1 }));

const DEEP_COMPONENTS = [
  'broadsword',
  'claymore',
  'mithril-hammer',
  'demon-edge',
  'eaglesong',
  'reaver',
  'mystic-staff',
  'ultimate-orb',
  'point-booster',
  'sacred-relic'
].map((id) => ({ id, weight: 1 }));

const LARGE_ENDGAME_CORES = [
  'black-king-bar',
  'battlefury',
  'shivas-guard',
  'guardian-greaves',
  'manta-style',
  'sange-and-yasha',
  'kaya-and-sange',
  'yasha-and-kaya',
  'daedalus',
  'monkey-king-bar',
  'silver-edge',
  'ethereal-blade',
  'bloodstone',
  'moon-shard'
].map((id) => ({ id, weight: 1 }));

const ANCIENT_ENDGAME_CORES = [
  'assault-cuirass',
  'manta-style',
  'daedalus',
  'monkey-king-bar',
  'mjollnir',
  'ethereal-blade',
  'wind-waker',
  'bloodstone',
  'moon-shard'
].map((id) => ({ id, weight: 1 }));

export function qualityOddsByTier(): Record<DifficultyTier, Partial<Record<ItemQuality, number>>> {
  const out = {} as Record<DifficultyTier, Partial<Record<ItemQuality, number>>>;
  for (const tier of ['normal', 'nightmare', 'hell'] as const) {
    const chance = TUNING.loot.qualityDropChance[tier];
    out[tier] = {
      standard: 1 - chance,
      genuine: chance * 0.42,
      frozen: chance * 0.24,
      inscribed: chance * 0.22,
      corrupted: chance * 0.09,
      unusual: chance * 0.03
    };
  }
  return out;
}

export const DEFAULT_CREEP_DROP_TABLES: Record<CreepTier, ItemDropTable> = {
  small: {
    guaranteed: [],
    slots: [
      { id: 'creep-common-consumable', rarity: 'common', rolls: 1, chance: { normal: 0.14, nightmare: 0.18, hell: 0.22 }, pool: COMMON_CONSUMABLES, source: 'creep' }
    ]
  },
  medium: {
    guaranteed: [],
    slots: [
      { id: 'creep-common-consumable', rarity: 'common', rolls: 1, chance: { normal: 0.18, nightmare: 0.22, hell: 0.26 }, pool: COMMON_CONSUMABLES, source: 'creep' },
      { id: 'creep-uncommon-component', rarity: 'uncommon', rolls: 1, chance: { normal: 0.06, nightmare: 0.09, hell: 0.12 }, pool: EARLY_COMPONENTS, source: 'creep' }
    ]
  },
  large: {
    guaranteed: [],
    slots: [
      { id: 'creep-common-consumable', rarity: 'common', rolls: 1, chance: { normal: 0.16, nightmare: 0.2, hell: 0.24 }, pool: COMMON_CONSUMABLES, source: 'creep' },
      { id: 'creep-uncommon-component', rarity: 'uncommon', rolls: 1, chance: { normal: 0.22, nightmare: 0.28, hell: 0.34 }, pool: EARLY_COMPONENTS, source: 'creep' },
      { id: 'creep-large-endgame', rarity: 'legendary', rolls: 1, chance: TUNING.overworldEgSlotPct.largeCreep, pool: LARGE_ENDGAME_CORES, qualityOddsByTier: qualityOddsByTier(), source: 'creep' }
    ]
  },
  ancient: {
    guaranteed: [],
    slots: [
      { id: 'creep-rare-component', rarity: 'rare', rolls: 1, chance: { normal: 0.25, nightmare: 0.32, hell: 0.4 }, pool: DEEP_COMPONENTS, source: 'creep' },
      { id: 'creep-mythical-component', rarity: 'mythical', rolls: 1, chance: { normal: 0.08, nightmare: 0.12, hell: 0.18 }, pool: DEEP_COMPONENTS, source: 'creep' },
      { id: 'creep-ancient-endgame', rarity: 'legendary', rolls: 1, chance: TUNING.overworldEgSlotPct.ancientCreep, pool: ANCIENT_ENDGAME_CORES, qualityOddsByTier: qualityOddsByTier(), source: 'creep' }
    ]
  }
};
