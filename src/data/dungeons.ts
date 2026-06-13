import type { DungeonDef, ItemDropTable, RoomType } from '../core/types';

const COMMON_ROOM_DROP: ItemDropTable = {
  guaranteed: ['clarity'],
  slots: [
    {
      id: 'frost-hollow-consumable',
      rarity: 'common',
      rolls: 1,
      chance: { normal: 0.45, nightmare: 0.55, hell: 0.65 },
      pool: [
        { id: 'healing-salve', weight: 2 },
        { id: 'clarity', weight: 2 },
        { id: 'tango', weight: 1 }
      ],
      source: 'dungeon'
    },
    {
      id: 'frost-hollow-component',
      rarity: 'rare',
      rolls: 1,
      chance: { normal: 0.18, nightmare: 0.28, hell: 0.38 },
      pool: [
        { id: 'broadsword', weight: 2 },
        { id: 'claymore', weight: 2 },
        { id: 'mithril-hammer', weight: 1 },
        { id: 'ultimate-orb', weight: 1 }
      ],
      source: 'dungeon'
    }
  ]
};

const ELITE_ROOM_DROP: ItemDropTable = {
  guaranteed: ['clarity'],
  slots: [
    {
      id: 'frost-hollow-elite-component',
      rarity: 'mythical',
      rolls: 1,
      chance: { normal: 0.3, nightmare: 0.45, hell: 0.6 },
      pool: [
        { id: 'demon-edge', weight: 2 },
        { id: 'eaglesong', weight: 1 },
        { id: 'ultimate-orb', weight: 2 },
        { id: 'point-booster', weight: 2 }
      ],
      source: 'dungeon'
    }
  ]
};

const GUARDIAN_DROP: ItemDropTable = {
  guaranteed: ['ultimate-orb'],
  slots: [
    {
      id: 'frost-hollow-guardian-anchor',
      rarity: 'legendary',
      rolls: 1,
      chance: { normal: 0.16, nightmare: 0.28, hell: 0.42 },
      pool: [
        { id: 'eye-of-skadi', weight: 2 },
        { id: 'refresher-orb', weight: 1 }
      ],
      pity: 4,
      source: 'dungeon'
    }
  ]
};

function roomLoot(): Record<RoomType, ItemDropTable> {
  return {
    entrance: COMMON_ROOM_DROP,
    combat: COMMON_ROOM_DROP,
    elite: ELITE_ROOM_DROP,
    treasure: ELITE_ROOM_DROP,
    shrine: COMMON_ROOM_DROP,
    rest: COMMON_ROOM_DROP,
    boss: GUARDIAN_DROP
  };
}

export const FROST_HOLLOW: DungeonDef = {
  id: 'frost-hollow',
  name: 'Frost Hollow',
  regionId: 'icewrack',
  biome: 'snow',
  templates: ['frost-entry', 'frost-crossing', 'frost-cache'],
  roomCount: { min: 6, max: 8 },
  spawnPool: [
    { creepId: 'ghost', weight: 4, cost: 10 },
    { creepId: 'ice-shaman', weight: 3, cost: 18, minDepth: 1 },
    { creepId: 'polar-furbolg', weight: 2, cost: 28, minDepth: 2 },
    { creepId: 'granite-golem', weight: 1, cost: 42, minDepth: 4, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'frozen', 'vortex'],
  guardian: 'boss-medusa',
  loot: roomLoot(),
  budget: { base: 42, perDepth: 14 },
  tiers: ['normal', 'nightmare', 'hell']
};

export const ALL_DUNGEONS: DungeonDef[] = [FROST_HOLLOW];
