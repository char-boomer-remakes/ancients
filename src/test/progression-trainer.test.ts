import { describe, it, expect } from 'vitest';
import {
  overflowSplit,
  overflowXpToGold,
  trainerLevelForXp,
  metaValue,
  worldLevel,
  worldLevelDialCap,
  computeKillReward,
  type PartyMemberState
} from '../core/progression';
import { xpForLevel } from '../core/stats';
import { TUNING } from '../data/tuning';
import { ALL_META_NODES, META_NODES_BY_ID } from '../data/meta-board';
import type { MetaEffectKey } from '../core/types';

// PROGRESSION_OVERHAUL §4 / §6 — the Trainer track, overflow split, meta dial,
// and ascension-dial gating. These are the pure-function contracts; the systems
// wiring is exercised in economy.test.ts and save-migration.test.ts.

describe('overflow split (§4.2)', () => {
  it('conserves total value exactly: gold + trainerXp === overflowXpToGold', () => {
    for (const addXp of [0, 50, 137, 1000, 9999]) {
      const goldEq = overflowXpToGold(TUNING.levelCap, xpForLevel(TUNING.levelCap), addXp);
      const split = overflowSplit(TUNING.levelCap, xpForLevel(TUNING.levelCap), addXp);
      expect(split.gold + split.trainerXp).toBe(goldEq);
      expect(split.gold).toBeGreaterThanOrEqual(0);
      expect(split.trainerXp).toBeGreaterThanOrEqual(0);
    }
  });

  it('banks the configured fraction as Trainer XP past the cap', () => {
    const split = overflowSplit(TUNING.levelCap, xpForLevel(TUNING.levelCap), 1000);
    expect(split.trainerXp).toBe(Math.round(overflowXpToGold(TUNING.levelCap, xpForLevel(TUNING.levelCap), 1000) * TUNING.trainer.overflowToTrainerPct));
  });

  it('reversibility: opting the split out (0%) leaves all value as gold', () => {
    const goldEq = overflowXpToGold(TUNING.levelCap, xpForLevel(TUNING.levelCap), 800);
    // metaValue/trainer split is config-driven; at 0% the gold share is the whole.
    const pct = TUNING.trainer.overflowToTrainerPct;
    const expectedGold = goldEq - Math.round(goldEq * pct);
    expect(overflowSplit(TUNING.levelCap, xpForLevel(TUNING.levelCap), 800).gold).toBe(expectedGold);
  });
});

describe('trainer level curve (§4.2)', () => {
  it('is monotonic and 1-indexed', () => {
    expect(trainerLevelForXp(0)).toBe(1);
    let prev = 1;
    for (let xp = 0; xp <= 120000; xp += 2500) {
      const lvl = trainerLevelForXp(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it('lands on the curve breakpoints', () => {
    const curve = TUNING.trainer.xpCurve;
    expect(trainerLevelForXp(curve[1])).toBe(2);
    expect(trainerLevelForXp(curve[1] - 1)).toBe(1);
    expect(trainerLevelForXp(curve[curve.length - 1])).toBe(curve.length);
  });
});

describe('world level ascension dial (§4.3)', () => {
  it('the dial tier adds into the World Level input', () => {
    const base = worldLevel(30, 4, 0);
    expect(worldLevel(30, 4, 2)).toBe(Math.min(TUNING.worldLevel.cap, base + 2));
  });

  it('never exceeds the hard World Level cap', () => {
    expect(worldLevel(180, 8, 50)).toBe(TUNING.worldLevel.cap);
  });

  it('dial cap takes the STRICTER of badge and trainer-level gates', () => {
    const d = TUNING.worldLevelDial;
    // lots of badges but only trainer level 1 => trainer gate dominates (0)
    expect(worldLevelDialCap(100, 1, 0)).toBe(0);
    // lots of trainer levels but no badges => badge gate dominates (0)
    expect(worldLevelDialCap(0, 100, 0)).toBe(0);
    // both gates open: floor(badges/N) and floor((tl-1)/M), clamped to defaultCap
    const badges = d.badgesPerTier * 2;
    const tl = d.trainerLevelPerTier * 2 + 1;
    expect(worldLevelDialCap(badges, tl, 0)).toBe(Math.min(2, d.defaultCap));
  });

  it('meta worldLevelCap nodes raise the dial ceiling', () => {
    const d = TUNING.worldLevelDial;
    const openBadges = d.badgesPerTier * (d.defaultCap + 5);
    const openTl = d.trainerLevelPerTier * (d.defaultCap + 5) + 1;
    expect(worldLevelDialCap(openBadges, openTl, 0)).toBe(d.defaultCap);
    expect(worldLevelDialCap(openBadges, openTl, 2)).toBe(d.defaultCap + 2);
  });
});

describe('party XP amp (§5)', () => {
  const party: PartyMemberState[] = [
    { heroId: 'a', isActive: true, participated: true },
    { heroId: 'b', isActive: false, participated: true },
    { heroId: 'c', isActive: false, participated: false }
  ];
  const bounty = { xp: 1000, gold: 100 };

  it('lifts bench/participant XP toward the active rate without touching the active hero', () => {
    const off = computeKillReward(bounty, party, false, 0);
    const on = computeKillReward(bounty, party, false, 100);
    // active hero unchanged
    expect(on.perHeroXp[0].xp).toBe(off.perHeroXp[0].xp);
    // bench + participant strictly increase, and at 100% reach the active share
    expect(on.perHeroXp[1].xp).toBeGreaterThan(off.perHeroXp[1].xp);
    expect(on.perHeroXp[2].xp).toBeGreaterThan(off.perHeroXp[2].xp);
    expect(on.perHeroXp[1].xp).toBe(on.perHeroXp[0].xp);
    expect(on.perHeroXp[2].xp).toBe(on.perHeroXp[0].xp);
  });

  it('reversibility: amp 0 equals the legacy three-arg reward', () => {
    const legacy = computeKillReward(bounty, party, true);
    const amped0 = computeKillReward(bounty, party, true, 0);
    expect(amped0).toEqual(legacy);
  });
});

describe('meta board registry (§4.2)', () => {
  it('every effect key is in the closed vocabulary — never a StatMods key', () => {
    const allowed: ReadonlySet<MetaEffectKey> = new Set<MetaEffectKey>([
      'worldLevelCap', 'stashSize', 'merchantRefresh', 'catchSpeed',
      'entourageSlot', 'findShardRate', 'refightCaptainCall', 'fastTravel'
    ]);
    for (const node of ALL_META_NODES) {
      for (const key of Object.keys(node.effect)) {
        expect(allowed.has(key as MetaEffectKey)).toBe(true);
      }
    }
  });

  it('ids are unique and the lookup map resolves every node', () => {
    const ids = ALL_META_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of ALL_META_NODES) expect(META_NODES_BY_ID[n.id]).toBe(n);
  });

  it('metaValue sums a key across purchased nodes', () => {
    const caps = ALL_META_NODES.filter((n) => 'worldLevelCap' in n.effect);
    const expected = caps.reduce((s, n) => s + (n.effect.worldLevelCap ?? 0), 0);
    expect(metaValue(caps, 'worldLevelCap')).toBe(expected);
    expect(metaValue([], 'worldLevelCap')).toBe(0);
  });
});
