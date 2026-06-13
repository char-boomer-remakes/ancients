import { describe, expect, it } from 'vitest';
import { generateDungeon, rollRoomSpawns } from '../core/dungeon';
import { Rng } from '../core/rng';
import type { AffixDef, DungeonDef, ItemDropTable, PlannedPack, RoomType, SpawnCard } from '../core/types';

const DROP: ItemDropTable = {
  guaranteed: [],
  slots: [
    {
      id: 'dungeon-common',
      rarity: 'common',
      rolls: 1,
      chance: { normal: 1, nightmare: 1, hell: 1 },
      pool: [{ id: 'tango', weight: 1 }],
      source: 'dungeon'
    }
  ]
};

const GUARDIAN_DROP: ItemDropTable = {
  guaranteed: ['demon-edge'],
  slots: [
    {
      id: 'guardian-anchor',
      rarity: 'legendary',
      rolls: 1,
      chance: { normal: 0.25, nightmare: 0.4, hell: 0.65 },
      pool: [{ id: 'butterfly', weight: 1 }],
      source: 'dungeon'
    }
  ]
};

function lootByRoom(): Record<RoomType, ItemDropTable> {
  return {
    entrance: DROP,
    combat: DROP,
    elite: DROP,
    treasure: DROP,
    shrine: DROP,
    rest: DROP,
    boss: GUARDIAN_DROP
  };
}

const BASE_DUNGEON: DungeonDef = {
  id: 'test-descent',
  name: 'Test Descent',
  regionId: 'icewrack',
  biome: 'snow',
  templates: ['ice-entry', 'ice-hall', 'ice-vault'],
  roomCount: { min: 8, max: 8 },
  spawnPool: [
    { creepId: 'kobold', weight: 5, cost: 8 },
    { creepId: 'wolf', weight: 3, cost: 16, minDepth: 2 },
    { creepId: 'granite-golem', weight: 1, cost: 32, minDepth: 5, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'molten', 'vortex'],
  guardian: 'boss-phantom-assassin',
  loot: lootByRoom(),
  budget: { base: 36, perDepth: 12 },
  tiers: ['normal', 'nightmare', 'hell']
};

function populationScore(packs: PlannedPack[]): { bodies: number; rarity: number; affixes: number } {
  return packs.reduce((acc, pack) => {
    acc.bodies += pack.cards.length;
    acc.affixes += pack.affixes.length;
    acc.rarity += pack.rarity === 'rare' ? 3 : pack.rarity === 'champion' ? 2 : 1;
    return acc;
  }, { bodies: 0, rarity: 0, affixes: 0 });
}

describe('dungeon generation D0', () => {
  it('generates a stable layout and population for a fixed seed', () => {
    const a = generateDungeon(BASE_DUNGEON, 'hell', 424242);
    const b = generateDungeon(BASE_DUNGEON, 'hell', 424242);
    const c = generateDungeon(BASE_DUNGEON, 'hell', 424243);

    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(a.depth).toBe(8);
    expect(a.rooms.length).toBe(a.depth);
  });

  it('applies the first-cut room graph rules', () => {
    const layout = generateDungeon(BASE_DUNGEON, 'nightmare', 99);
    const rooms = layout.rooms;

    expect(rooms[0].type).toBe('entrance');
    expect(rooms.at(-1)?.type).toBe('boss');
    expect(rooms[layout.depth - 2].type).toBe('rest');
    expect(rooms[Math.floor(layout.depth / 2)].type).toBe('treasure');
    expect(rooms[0].packs).toEqual([]);
    expect(rooms[layout.depth - 2].packs).toEqual([]);
    expect(rooms.at(-1)?.packs).toEqual([]);

    for (const room of rooms) {
      expect(room.index).toBe(rooms.indexOf(room));
      expect(BASE_DUNGEON.templates).toContain(room.templateId);
      expect(new Set(room.exits).size).toBe(room.exits.length);
      for (const exit of room.exits) {
        expect(exit).toBeGreaterThan(room.index);
        expect(exit).toBeLessThan(layout.depth);
      }
      if (room.type !== 'boss') expect(room.exits.length).toBeGreaterThan(0);
    }
  });

  it('scales room populations by budget, depth, and tier over a seed sweep', () => {
    const pool: SpawnCard[] = [
      { creepId: 'kobold', weight: 6, cost: 8 },
      { creepId: 'wolf', weight: 3, cost: 18, minDepth: 2 },
      { creepId: 'granite-golem', weight: 1, cost: 30, minDepth: 5, rarity: 'rare' }
    ];
    const affixes: AffixDef[] = [
      { id: 'jailer', name: 'Jailer', apply: [] },
      { id: 'molten', name: 'Molten', apply: [] },
      { id: 'vortex', name: 'Vortex', apply: [] }
    ];

    const low = { bodies: 0, rarity: 0, affixes: 0 };
    const high = { bodies: 0, rarity: 0, affixes: 0 };
    for (let seed = 1; seed <= 80; seed++) {
      const lowScore = populationScore(rollRoomSpawns(pool, affixes, 40, 'normal', 1, new Rng(seed)));
      const highScore = populationScore(rollRoomSpawns(pool, affixes, 180, 'hell', 8, new Rng(seed)));
      low.bodies += lowScore.bodies;
      low.rarity += lowScore.rarity;
      low.affixes += lowScore.affixes;
      high.bodies += highScore.bodies;
      high.rarity += highScore.rarity;
      high.affixes += highScore.affixes;
    }

    expect(high.bodies).toBeGreaterThan(low.bodies);
    expect(high.rarity).toBeGreaterThan(low.rarity);
    expect(high.affixes).toBeGreaterThan(low.affixes);
  });

  it('respects affix tier gates and exclusions', () => {
    const pool: SpawnCard[] = [{ creepId: 'elite-kobold', weight: 1, cost: 5, rarity: 'rare' }];
    const affixes: AffixDef[] = [
      { id: 'jailer', name: 'Jailer', apply: [], excludes: ['vortex'] },
      { id: 'vortex', name: 'Vortex', apply: [] },
      { id: 'hellfire', name: 'Hellfire', apply: [], minTier: 'hell' }
    ];

    const normal = rollRoomSpawns(pool, affixes, 80, 'normal', 5, new Rng(7));
    for (const pack of normal) {
      expect(pack.affixes).not.toContain('hellfire');
      expect(pack.affixes.includes('jailer') && pack.affixes.includes('vortex')).toBe(false);
    }

    let sawHellOnlyAffix = false;
    for (let seed = 1; seed <= 20; seed++) {
      const hell = rollRoomSpawns(pool, affixes, 80, 'hell', 5, new Rng(seed));
      for (const pack of hell) {
        expect(pack.affixes.includes('jailer') && pack.affixes.includes('vortex')).toBe(false);
        sawHellOnlyAffix = sawHellOnlyAffix || pack.affixes.includes('hellfire');
      }
    }
    expect(sawHellOnlyAffix).toBe(true);
  });
});
