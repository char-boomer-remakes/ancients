import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { freshEchoProgress } from '../core/echo';
import { makeItemState } from '../core/items';
import { xpForLevel } from '../core/stats';
import {
  computeKillReward,
  overflowSplit,
  overflowXpToGold,
  type PartyMemberState
} from '../core/progression';
import { TUNING } from '../data/tuning';
import { Game, newGameSave } from '../systems/game';
import type { GameSave } from '../core/types';

// ============================================================
// RED / BLUE / PURPLE TEAM — adversarial gameplay-loop coverage.
//
// These assert the *contracts* a real player (or a fat-fingered HUD)
// can hit: drop/move/sell/equip items, spend skill & mastery points,
// swap heroes, claim quests, and farm a camp past the level cap.
//
// RED  : feed invalid/out-of-range/double-spend inputs and prove the
//        game rejects them cleanly (returns false, never corrupts).
// BLUE : prove the happy path holds the conservation laws — items are
//        never duplicated or lost, gold never goes negative, a skill
//        point buys exactly one rank.
// The pure progression functions get property checks (conservation,
// monotonicity, bounds) rather than magic-number snapshots.
// ============================================================

beforeAll(() => registerAllContent());

/** A fully-recruited, level-30, 5-hero squad — the state most loops need. */
function fullSave(team = ['juggernaut', 'sven', 'sniper', 'lich', 'earthshaker']): GameSave {
  const save = newGameSave(team[0]);
  save.party = [...team];
  save.recruited = [...team];
  save.roster = team.map((heroId) => ({
    heroId,
    level: 30,
    xp: xpForLevel(30),
    items: [null, null, null, null, null, null],
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: [],
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0],
    tagGaugeReadyAt: 0
  }));
  save.gold = 50_000;
  return save;
}

function skipCinematics(g: Game): void {
  let guard = 0;
  while (g.cinematic.active && guard++ < 200) g.cinematicSkip();
  g.cinematic.clear();
}

/** Multiset of every item id the player owns anywhere: equipped, on the ground, in the Armory. */
function itemCensus(g: Game): Map<string, number> {
  const tally = new Map<string, number>();
  const add = (id: string) => tally.set(id, (tally.get(id) ?? 0) + 1);
  for (const rec of g.party) {
    const u = rec.unit;
    if (!u) continue;
    for (const it of u.items) if (it) add(it.defId);
  }
  for (const drop of g.groundItemDrops) add(drop.item.id);
  for (const it of g.inventoryStash) add(it.id);
  return tally;
}

function censusTotal(c: Map<string, number>): number {
  let n = 0;
  for (const v of c.values()) n += v;
  return n;
}

// ------------------------------------------------------------
// Items: drop / move / sell — conservation + bad-input rejection
// ------------------------------------------------------------
describe('items — drop to ground (red/blue)', () => {
  it('rejects empty/out-of-range slots and conserves the item it does drop', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    const u = g.activeUnit()!;
    u.items[0] = makeItemState(REG.item('broadsword'));
    u.markStatsDirty();
    u.refresh(g.sim.time);

    const before = censusTotal(itemCensus(g));
    // RED: nothing in these slots — must be a clean no-op.
    expect(g.dropHeroItemToGround(5)).toBe(false);
    expect(g.dropHeroItemToGround(99)).toBe(false);
    expect(g.dropHeroItemToGround(-1)).toBe(false);
    expect(censusTotal(itemCensus(g))).toBe(before);

    const groundBefore = g.groundItemDrops.length;
    expect(g.dropHeroItemToGround(0)).toBe(true);
    // BLUE: it left the hero, landed on the ground, and nothing was duplicated.
    expect(u.items.some((it) => it && it.defId === 'broadsword')).toBe(false);
    expect(g.groundItemDrops.length).toBe(groundBefore + 1);
    expect(censusTotal(itemCensus(g))).toBe(before);
    expect(g.groundItemDrops.some((d) => d.item.id === 'broadsword')).toBe(true);
  });
});

describe('items — slot reorder (red/blue)', () => {
  it('rejects degenerate moves and never duplicates or loses an item', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    const u = g.activeUnit()!;
    u.items[0] = makeItemState(REG.item('broadsword'));
    u.items[1] = makeItemState(REG.item('claymore'));
    u.markStatsDirty();
    u.refresh(g.sim.time);

    const before = itemCensus(g);
    // RED: same slot, out-of-range, and two-empty-slots are all no-ops.
    expect(g.moveHeroItem(0, 0)).toBe(false);
    expect(g.moveHeroItem(0, 99)).toBe(false);
    expect(g.moveHeroItem(-1, 2)).toBe(false);
    expect(g.moveHeroItem(4, 5)).toBe(false); // both empty
    expect(itemCensus(g)).toEqual(before);

    // BLUE: a real swap preserves the exact multiset of held items.
    expect(g.moveHeroItem(0, 1)).toBe(true);
    expect(itemCensus(g)).toEqual(before);
    // swapping a filled slot with an empty one moves, doesn't clone.
    expect(g.moveHeroItem(0, 4)).toBe(true);
    expect(itemCensus(g)).toEqual(before);
  });
});

describe('items — sell (red/blue)', () => {
  it('sells an unbound item for gold, no-ops on empty, and never goes negative', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    const u = g.activeUnit()!;
    u.items[0] = makeItemState(REG.item('broadsword'));
    u.markStatsDirty();
    u.refresh(g.sim.time);

    const goldStart = g.gold;
    // RED: empty slot sale changes nothing.
    g.sellItem(3);
    expect(g.gold).toBe(goldStart);

    g.sellItem(0);
    expect(g.gold).toBeGreaterThan(goldStart);
    expect(g.gold).toBeGreaterThanOrEqual(0);
    expect(u.items.some((it) => it && it.defId === 'broadsword')).toBe(false);
  });

  it('a BOUND item returns to the Armory instead of vanishing for gold', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    const u = g.activeUnit()!;
    const bound = makeItemState(REG.item('broadsword'));
    bound.bound = true;
    u.items[0] = bound;
    u.markStatsDirty();
    u.refresh(g.sim.time);

    const goldStart = g.gold;
    const total = censusTotal(itemCensus(g));
    const stashStart = g.inventoryStash.length;

    g.sellItem(0);
    // Bound gear is never destroyed: no gold, but it lands back in the stash.
    expect(g.gold).toBe(goldStart);
    expect(g.inventoryStash.length).toBe(stashStart + 1);
    expect(censusTotal(itemCensus(g))).toBe(total);
    expect(u.items.some((it) => it && it.defId === 'broadsword')).toBe(false);
  });
});

describe('items — Armory equip/reclaim round-trip (blue)', () => {
  it('moves a bound item hero<->stash with no duplication or loss', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    g.inventoryStash.push({ id: 'broadsword', bound: true });

    const total = censusTotal(itemCensus(g));
    const stashIdx = g.inventoryStash.findIndex((it) => it.id === 'broadsword');
    expect(g.equipArmoryItem(0, stashIdx)).toBe(true);
    expect(censusTotal(itemCensus(g))).toBe(total);

    const u = g.party[0].unit!;
    const invSlot = u.items.findIndex((it) => it && it.defId === 'broadsword');
    expect(invSlot).toBeGreaterThanOrEqual(0);

    expect(g.reclaimArmoryItem(0, invSlot)).toBe(true);
    expect(censusTotal(itemCensus(g))).toBe(total);
    expect(g.inventoryStash.some((it) => it.id === 'broadsword')).toBe(true);
    // RED: reclaiming an empty slot (already returned) is a clean no-op.
    expect(g.reclaimArmoryItem(0, invSlot)).toBe(false);
  });
});

// ------------------------------------------------------------
// Leveling & skill selection
// ------------------------------------------------------------
describe('skill points (red/blue)', () => {
  it('refuses to spend a point the hero has not earned, then spends exactly one', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    skipCinematics(g);
    const rec = g.party[0];
    const hero = g.activeUnit()!;

    // RED: at level 1 the starter has no pending point — no rank may be bought.
    expect(g.pendingSkillPoints(rec)).toBe(0);
    expect(g.levelAbility(0, 1)).toBe(false);
    const ranksBefore = hero.abilities.map((a) => a.level);

    hero.addXp(xpForLevel(2));
    rec.level = hero.level;
    rec.xp = hero.xp;
    expect(g.pendingSkillPoints(rec)).toBe(1);

    // RED: the ultimate is level-gated even with a point in hand.
    expect(g.canLevelAbility(0, 3)).toBe(false);
    expect(g.levelAbility(0, 3)).toBe(false);

    // BLUE: a legal basic rank consumes the point and raises exactly that ability.
    expect(g.levelAbility(0, 1)).toBe(true);
    expect(g.pendingSkillPoints(rec)).toBe(0);
    expect(hero.abilities[1].level).toBe(ranksBefore[1] + 1);
    // The point is spent: a second buy with no point left is rejected.
    expect(g.levelAbility(0, 0)).toBe(false);
  });
});

describe('mastery nodes (red/blue)', () => {
  it('buys a legal node once and rejects locked/out-of-range nodes', () => {
    const save = newGameSave('juggernaut');
    save.roster[0].level = 2;
    save.roster[0].xp = xpForLevel(2);
    save.roster[0].abilityLevels = [1, 0, 0, 0];
    const g = Game.headless(save);
    skipCinematics(g);

    expect(g.pendingMasteryPoints(g.party[0])).toBe(1);
    // RED: an out-of-range node index can't be bought.
    expect(g.canBuyMasteryNode(0, 999)).toBe(false);
    expect(g.buyMasteryNode(0, 999)).toBe(false);
    expect(g.pendingMasteryPoints(g.party[0])).toBe(1);

    // BLUE: a real tier-1 node spends the point.
    expect(g.buyMasteryNode(0, 0)).toBe(true);
    expect(g.pendingMasteryPoints(g.party[0])).toBe(0);
  });
});

// ------------------------------------------------------------
// Hero swap
// ------------------------------------------------------------
describe('hero swap (red/blue)', () => {
  it('rejects self/missing slots, swaps a valid one, and arms the cooldown', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    g.settings.swapCharges = false; // deterministic cooldown gate, not charge meter

    expect(g.activeIdx).toBe(0);
    // RED: swapping to the active slot or a non-existent slot does nothing.
    expect(g.trySwap(0)).toBe(false);
    expect(g.trySwap(99)).toBe(false);
    expect(g.activeIdx).toBe(0);

    // BLUE: a valid swap changes the driver and arms the swap cooldown.
    expect(g.trySwap(1)).toBe(true);
    expect(g.activeIdx).toBe(1);
    expect(g.controlledUnit()?.heroId).toBe('sven');
    expect(g.swapReadyAt).toBeGreaterThan(g.sim.time);

    // RED: a second instant swap is blocked by that cooldown.
    expect(g.trySwap(2)).toBe(false);
    expect(g.activeIdx).toBe(1);
  });
});

// ------------------------------------------------------------
// Orders: attacking items / garbage / real targets
// ------------------------------------------------------------
describe('attack orders (red/blue)', () => {
  it('attacking a ground item, a dead uid, or garbage never throws or corrupts state', () => {
    const g = Game.headless(fullSave());
    skipCinematics(g);
    const u = g.activeUnit()!;

    // A loot drop is NOT a unit — ordering an attack on it must be a clean no-op.
    const [drop] = g.spawnGroundItems([{ id: 'broadsword' }], { x: u.pos.x + 60, y: u.pos.y }, { source: 'creep' });
    expect(() => g.orderAttack(drop.uid)).not.toThrow();
    expect(() => g.orderAttack(-1)).not.toThrow();
    expect(() => g.orderAttack(999_999)).not.toThrow();
    // None of that bound a live attack onto a phantom target.
    expect(g.activeUnit()!.alive).toBe(true);

    // BLUE: a real enemy yields a real attack order.
    const def = REG.creep(g.region.camps[0]?.creepId ?? [...REG.creeps.keys()][0]);
    const foe = g.sim.spawnCreep(def, { team: 1, pos: { x: u.pos.x + 140, y: u.pos.y }, wild: true, homePos: { ...u.pos }, regionId: g.region.id });
    g.orderAttack(foe.uid);
    expect(g.controlledUnit()!.order.kind).toBe('attack-unit');
  });
});

// ------------------------------------------------------------
// Quest log
// ------------------------------------------------------------
describe('quest claims (red)', () => {
  it('rejects unknown ids and quests that are not ready to claim', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    skipCinematics(g);
    g.refreshQuests();

    expect(g.claimQuest('this-quest-does-not-exist')).toBe(false);

    // An active-but-incomplete bounty cannot be claimed for its reward.
    const board = g.questBoard();
    const active = board.find((q) => q.status === 'active' && !q.claimable);
    expect(active).toBeDefined();
    const goldBefore = g.gold;
    expect(g.claimQuest(active!.id)).toBe(false);
    expect(g.gold).toBe(goldBefore);
  });
});

// ------------------------------------------------------------
// Spawn camping / post-cap overflow (pure progression laws)
// ------------------------------------------------------------
describe('spawn-camp economy (purple — property laws)', () => {
  it('post-cap overflow conserves value and is monotonic in XP farmed', () => {
    const cap = TUNING.levelCap;
    const capXp = xpForLevel(cap);
    let prev = -1;
    for (let addXp = 0; addXp <= 20_000; addXp += 137) {
      const goldEq = overflowXpToGold(cap, capXp, addXp);
      const split = overflowSplit(cap, capXp, addXp);
      // conservation: the split never invents or loses value.
      expect(split.gold + split.trainerXp).toBe(goldEq);
      expect(split.gold).toBeGreaterThanOrEqual(0);
      expect(split.trainerXp).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(goldEq)).toBe(true);
      // monotonic: farming more never pays less.
      expect(goldEq).toBeGreaterThanOrEqual(prev);
      prev = goldEq;
    }
  });

  it('a capped hero camping a respawn converts every kill to gold, never infinite levels', () => {
    const cap = TUNING.levelCap;
    const capXp = xpForLevel(cap);
    // Each kill grants real XP; past the cap it must surface as gold-equivalent > 0.
    const perKill = 500;
    let banked = 0;
    for (let kill = 0; kill < 50; kill++) {
      const goldEq = overflowXpToGold(cap, capXp, perKill);
      expect(goldEq).toBeGreaterThan(0);
      banked += goldEq;
    }
    // 50 identical kills bank exactly 50x a single kill (no runaway compounding).
    expect(banked).toBe(50 * overflowXpToGold(cap, capXp, perKill));
  });

  it('kill rewards stay bounded by the active share and honor the last-hit bonus', () => {
    const party: PartyMemberState[] = [
      { heroId: 'a', isActive: true, participated: true },
      { heroId: 'b', isActive: false, participated: true },
      { heroId: 'c', isActive: false, participated: false }
    ];
    const bounty = { xp: 1000, gold: 100 };

    const plain = computeKillReward(bounty, party, false);
    const active = plain.perHeroXp.find((h) => h.heroId === 'a')!.xp;
    // No hero out-earns the active driver; bench <= participant <= active.
    for (const h of plain.perHeroXp) expect(h.xp).toBeLessThanOrEqual(active);
    const participant = plain.perHeroXp.find((h) => h.heroId === 'b')!.xp;
    const bench = plain.perHeroXp.find((h) => h.heroId === 'c')!.xp;
    expect(bench).toBeLessThanOrEqual(participant);
    expect(participant).toBeLessThanOrEqual(active);

    // RED: last-hit bonus raises gold, never lowers it.
    const lastHit = computeKillReward(bounty, party, true);
    expect(lastHit.gold).toBeGreaterThan(plain.gold);

    // BLUE: a full party-XP amp pulls every share up to the active rate.
    const amped = computeKillReward(bounty, party, false, 100);
    const ampActive = amped.perHeroXp.find((h) => h.heroId === 'a')!.xp;
    for (const h of amped.perHeroXp) expect(h.xp).toBe(ampActive);
  });
});
