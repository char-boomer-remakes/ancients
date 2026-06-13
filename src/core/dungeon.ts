import { Rng } from './rng';
import type {
  AffixDef,
  DifficultyTier,
  DungeonDef,
  DungeonLayout,
  DungeonRoom,
  ItemDropTable,
  ItemRarity,
  MonsterRarity,
  PlannedPack,
  RoomReward,
  RoomType,
  SpawnCard
} from './types';

const TIER_BUDGET_MULT: Record<DifficultyTier, number> = { normal: 1, nightmare: 1.35, hell: 1.75 };
const TIER_AFFIX_COUNT: Record<DifficultyTier, number> = { normal: 1, nightmare: 2, hell: 3 };
const TIER_RANK: Record<DifficultyTier, number> = { normal: 0, nightmare: 1, hell: 2 };
const RARITY_COST_MULT: Record<MonsterRarity, number> = { normal: 1, champion: 2.4, rare: 3.6 };
const RARITY_SCORE: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythical: 3,
  legendary: 4,
  immortal: 5,
  arcana: 6
};

function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) return rng.pick(items);
  const draw = rng.range(0, total);
  let acc = 0;
  for (const item of items) {
    acc += Math.max(0, weight(item));
    if (draw < acc) return item;
  }
  return items[items.length - 1];
}

function tierAtLeast(tier: DifficultyTier, min: DifficultyTier | undefined): boolean {
  return min === undefined || TIER_RANK[tier] >= TIER_RANK[min];
}

function starFor(tier: DifficultyTier, depth: number, rng: Rng): 1 | 2 | 3 {
  const twoStar = tier === 'normal' ? 0.08 : tier === 'nightmare' ? 0.24 : 0.38;
  const threeStar = tier === 'hell' ? 0.12 + depth * 0.006 : tier === 'nightmare' ? 0.04 + depth * 0.004 : depth * 0.002;
  if (rng.chance(Math.min(0.45, threeStar))) return 3;
  if (rng.chance(Math.min(0.65, twoStar + depth * 0.01))) return 2;
  return 1;
}

function upgradeRarity(card: SpawnCard, tier: DifficultyTier, depth: number, rng: Rng): MonsterRarity {
  if (card.rarity) return card.rarity;
  const rareChance = (tier === 'hell' ? 0.08 : tier === 'nightmare' ? 0.04 : 0.015) + depth * 0.004;
  if (rng.chance(Math.min(0.28, rareChance))) return 'rare';
  const championChance = (tier === 'hell' ? 0.22 : tier === 'nightmare' ? 0.14 : 0.08) + depth * 0.008;
  return rng.chance(Math.min(0.45, championChance)) ? 'champion' : 'normal';
}

function pickAffixes(pool: AffixDef[], rarity: MonsterRarity, tier: DifficultyTier, rng: Rng): string[] {
  if (rarity === 'normal') return [];
  const target = Math.min(4, TIER_AFFIX_COUNT[tier] + (rarity === 'rare' ? 1 : 0));
  const chosen: AffixDef[] = [];
  const eligible = pool.filter((a) => tierAtLeast(tier, a.minTier));
  let attempts = 0;
  while (chosen.length < target && attempts < eligible.length * 4) {
    attempts += 1;
    const next = rng.pick(eligible);
    if (chosen.some((a) => a.id === next.id)) continue;
    const blocked = chosen.some((a) => a.excludes?.includes(next.id) || next.excludes?.includes(a.id));
    if (!blocked) chosen.push(next);
  }
  return chosen.map((a) => a.id);
}

function packSize(rarity: MonsterRarity, maxAffordable: number, rng: Rng): number {
  if (rarity === 'rare') return Math.min(maxAffordable, 3);
  if (rarity === 'champion') return Math.min(maxAffordable, rng.int(3, 4));
  return Math.min(maxAffordable, rng.int(1, 3));
}

function rewardFor(type: RoomType, table: ItemDropTable | undefined): RoomReward {
  if (type === 'entrance') return { kind: 'none', roomType: type };
  if (type === 'treasure') return { kind: 'chest', roomType: type, table, guaranteed: table?.guaranteed };
  if (type === 'shrine') return { kind: 'shrine', roomType: type, table };
  if (type === 'rest') return { kind: 'rest', roomType: type };
  if (type === 'boss') return { kind: 'guardian', roomType: type, table, guaranteed: table?.guaranteed, rarity: bestRarity(table) };
  return { kind: 'loot', roomType: type, table, guaranteed: table?.guaranteed, rarity: bestRarity(table) };
}

function bestRarity(table: ItemDropTable | undefined): ItemRarity | undefined {
  let best: ItemRarity | undefined;
  for (const slot of table?.slots ?? []) {
    if (!best || RARITY_SCORE[slot.rarity] > RARITY_SCORE[best]) best = slot.rarity;
  }
  return best;
}

function roomTypeAt(index: number, depth: number, rng: Rng): RoomType {
  if (index === 0) return 'entrance';
  if (index === depth - 1) return 'boss';
  if (depth >= 4 && index === depth - 2) return 'rest';
  if (depth >= 5 && index === Math.floor(depth / 2)) return 'treasure';
  if (index <= 1) return 'combat';
  const roll = rng.next();
  if (roll < 0.16) return 'elite';
  if (roll < 0.28) return 'shrine';
  return 'combat';
}

function roomBudget(def: DungeonDef, tier: DifficultyTier, depth: number, type: RoomType): number {
  const roleMult = type === 'elite' ? 1.65 : type === 'boss' ? 0 : type === 'combat' ? 1 : 0;
  return Math.round((def.budget.base + depth * def.budget.perDepth) * TIER_BUDGET_MULT[tier] * roleMult);
}

export function rollRoomSpawns(
  pool: SpawnCard[],
  affixPool: AffixDef[],
  budget: number,
  tier: DifficultyTier,
  depth: number,
  rng: Rng
): PlannedPack[] {
  const packs: PlannedPack[] = [];
  let remaining = Math.max(0, Math.floor(budget));
  const maxPacks = Math.max(1, 5 + Math.floor(depth / 3));
  let attempts = 0;

  while (remaining > 0 && packs.length < maxPacks && attempts < maxPacks * 12) {
    attempts += 1;
    const eligible = pool.filter((card) => {
      if (card.weight <= 0 || card.cost <= 0) return false;
      if ((card.minDepth ?? 0) > depth) return false;
      // Once the budget gets large, retire trivial cards unless they are the only legal choice.
      return card.cost >= Math.max(1, budget * 0.08) || pool.filter((c) => (c.minDepth ?? 0) <= depth).length === 1;
    });
    if (eligible.length === 0) break;

    const card = weightedPick(eligible, (c) => c.weight, rng);
    const rarity = upgradeRarity(card, tier, depth, rng);
    const costPerCreep = Math.max(1, Math.ceil(card.cost * RARITY_COST_MULT[rarity]));
    const affordable = Math.floor(remaining / costPerCreep);
    if (affordable <= 0) continue;

    const size = packSize(rarity, affordable, rng);
    const star = rarity === 'normal' ? starFor(tier, depth, rng) : tier === 'hell' ? 3 : tier === 'nightmare' ? 2 : 1;
    const cards = Array.from({ length: size }, () => ({ creepId: card.creepId, star }));
    packs.push({
      cards,
      rarity,
      affixes: pickAffixes(affixPool, rarity, tier, rng),
      anchorIndex: packs.length
    });
    remaining -= costPerCreep * size;
  }

  return packs;
}

export function generateDungeon(def: DungeonDef, tier: DifficultyTier, seed: number): DungeonLayout {
  if (!def.tiers.includes(tier)) throw new Error(`dungeon ${def.id} does not support tier ${tier}`);
  if (def.templates.length === 0) throw new Error(`dungeon ${def.id} has no room templates`);
  const rng = new Rng(seed);
  const affixes = def.affixPool.map((id) => ({ id, name: id, apply: [] }));
  const min = Math.max(3, Math.floor(def.roomCount.min));
  const max = Math.max(min, Math.floor(def.roomCount.max));
  const depth = rng.int(min, max);

  const rooms: DungeonRoom[] = [];
  for (let index = 0; index < depth; index++) {
    const type = roomTypeAt(index, depth, rng);
    const exits: number[] = [];
    if (index < depth - 1) exits.push(index + 1);
    if (index > 0 && index < depth - 3 && rng.chance(0.3)) exits.push(index + 2);

    const budget = roomBudget(def, tier, index, type);
    const packs = budget > 0
      ? rollRoomSpawns(def.spawnPool, affixes, budget, tier, index, rng.fork(index + 31))
      : [];

    rooms.push({
      index,
      type,
      templateId: rng.pick(def.templates),
      exits,
      reward: rewardFor(type, def.loot[type]),
      packs
    });
  }

  return {
    seed,
    def: def.id,
    tier,
    depth,
    rooms
  };
}
