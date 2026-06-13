import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { applyDamage } from '../core/combat';
import { freshEchoProgress } from '../core/echo';
import { xpForLevel } from '../core/stats';
import { QUALITY_GRADES, nextQuality, qualityStatMods } from '../data/quality';
import { Game, newGameSave } from '../systems/game';
import type { CreepDef, GambitRule, GameSave, ItemQuality, SimEvent } from '../core/types';

beforeAll(() => registerAllContent());

const AGGRO: GambitRule[] = [
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

/** A single-hero save carrying one main-slot item, optionally at a given quality. */
function soloWithItem(itemId: string, quality?: ItemQuality, level = 25): GameSave {
  const save = newGameSave('juggernaut');
  save.roster[0].level = level;
  save.roster[0].xp = xpForLevel(level);
  save.roster[0].gambits = AGGRO;
  save.roster[0].echo = freshEchoProgress();
  save.roster[0].items = [{ id: itemId, quality }, null, null, null, null, null];
  // all badges => recruit ceiling 30, so a level-25 hero is not clamped down on the first kill
  save.badges = [...REG.gyms.values()].map((gym) => gym.badgeId);
  return save;
}

function creepOfTier(tier: CreepDef['tier']): CreepDef {
  const def = [...REG.creeps.values()].find((c) => c.tier === tier);
  if (!def) throw new Error(`no creep of tier ${tier}`);
  return def;
}

function killWildCreep(g: Game, def: CreepDef): Extract<SimEvent, { t: 'kill-credit' }> {
  const hero = g.activeUnit()!;
  const pos = { x: hero.pos.x + 140, y: hero.pos.y };
  const creep = g.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...pos } });
  const before = g.sim.events.history.length;
  applyDamage(g.sim, hero, creep, 1e9, 'physical');
  g.update(0.05);
  const ev = g.sim.events.history
    .slice(before)
    .find((e): e is Extract<SimEvent, { t: 'kill-credit' }> => e.t === 'kill-credit' && e.victimUid === creep.uid);
  if (!ev) throw new Error('no kill-credit emitted');
  return ev;
}

// ----------------------------------------------------------------
// LOOT L5: quality overlay (pure)
// ----------------------------------------------------------------
describe('quality stat overlay (pure)', () => {
  it('returns no overlay for Standard and a bounded delta otherwise', () => {
    expect(qualityStatMods('standard')).toBeUndefined();
    expect(qualityStatMods(undefined)).toBeUndefined();
    expect(qualityStatMods('genuine')).toEqual(QUALITY_GRADES.genuine.mods);
  });

  it('Corrupted carries both its bonus and its downside', () => {
    const mods = qualityStatMods('corrupted')!;
    expect(mods.damagePct).toBeGreaterThan(0);
    expect(mods.attackSpeed).toBeGreaterThan(0);
    expect(mods.armor).toBeLessThan(0); // the defined trade-off
    expect(mods.maxHp).toBeLessThan(0);
  });

  it('Inscribed grows with banked kills and caps', () => {
    const cap = QUALITY_GRADES.inscribed.killCap!;
    const at0 = qualityStatMods('inscribed', 0)!;
    const at10 = qualityStatMods('inscribed', 10)!;
    const atCap = qualityStatMods('inscribed', cap)!;
    const over = qualityStatMods('inscribed', cap + 999)!;
    expect(at10.damage!).toBeGreaterThan(at0.damage!);
    expect(atCap.damage!).toBeGreaterThan(at10.damage!);
    expect(over.damage).toBe(atCap.damage); // capped: more kills add nothing
  });
});

// ----------------------------------------------------------------
// LOOT L5: the overlay flows through the live item-mod pass
// ----------------------------------------------------------------
describe('quality on a live unit (test L5a)', () => {
  it('a Corrupted copy is a measurable sidegrade vs Standard', () => {
    const standard = Game.headless(soloWithItem('battlefury'));
    const corrupted = Game.headless(soloWithItem('battlefury', 'corrupted'));
    const s = standard.activeUnit()!.stats;
    const c = corrupted.activeUnit()!.stats;
    expect(c.damage).toBeGreaterThan(s.damage); // more offense
    expect(c.armor).toBeLessThan(s.armor);       // less survivability
    expect(c.maxHp).toBeLessThan(s.maxHp);
  });

  it('Inscribed banks holder kills into a growing, capped damage stack', () => {
    const g = Game.headless(soloWithItem('battlefury', 'inscribed'));
    g.sim.events.captureAll = true;
    const hero = g.activeUnit()!;
    const slot = hero.items.findIndex((it) => it?.defId === 'battlefury');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(hero.items[slot]!.quality).toBe('inscribed');

    const dmgBefore = hero.stats.damage;
    const small = creepOfTier('small');
    for (let i = 0; i < 6; i++) killWildCreep(g, small);

    expect(hero.items[slot]!.inscribedKills).toBe(6);
    g.activeUnit()!.refresh(g.sim.time);
    expect(g.activeUnit()!.stats.damage).toBeGreaterThan(dmgBefore);

    // the banked stacks survive a save round-trip
    const round = Game.headless(g.buildSave());
    const rHero = round.activeUnit()!;
    const rSlot = rHero.items.findIndex((it) => it?.defId === 'battlefury');
    expect(rHero.items[rSlot]!.inscribedKills).toBe(6);
    expect(rHero.items[rSlot]!.quality).toBe('inscribed');
  });
});

// ----------------------------------------------------------------
// LOOT L5: essence + gold deterministic quality upgrade
// ----------------------------------------------------------------
describe('essence quality upgrade (test L5b)', () => {
  it('spends essence + gold to raise a bound copy one grade, and stops at Unusual', () => {
    const save = soloWithItem('battlefury');
    save.inventoryStash = [{ id: 'butterfly', bound: true }];
    save.gold = 99999;
    const g = Game.headless(save);
    g.essence = 100;

    const quote = g.qualityUpgradeQuote(0)!;
    expect(quote.from).toBe('standard');
    expect(quote.to).toBe(nextQuality('standard'));

    const goldBefore = g.gold;
    const essBefore = g.essence;
    expect(g.upgradeArmoryItemQuality(0)).toBe(true);
    expect(g.inventoryStash[0].quality).toBe(quote.to);
    expect(g.gold).toBe(goldBefore - quote.gold);
    expect(g.essence).toBe(essBefore - quote.essence);

    // walk it to the ceiling; the next call past Unusual refuses
    let guard = 0;
    while (g.qualityUpgradeQuote(0) && guard++ < 10) {
      g.gold = 99999;
      g.essence = 100;
      expect(g.upgradeArmoryItemQuality(0)).toBe(true);
    }
    expect(g.inventoryStash[0].quality).toBe('unusual');
    expect(g.qualityUpgradeQuote(0)).toBeNull();
    expect(g.upgradeArmoryItemQuality(0)).toBe(false);
  });

  it('refuses without enough essence and never upgrades a liquid item', () => {
    const save = soloWithItem('battlefury');
    save.inventoryStash = [{ id: 'butterfly', bound: true }, { id: 'broadsword' }];
    save.gold = 99999;
    const g = Game.headless(save);
    g.essence = 0;

    expect(g.upgradeArmoryItemQuality(0)).toBe(false); // no essence
    expect(g.inventoryStash[0].quality).toBeUndefined();

    g.essence = 100;
    expect(g.qualityUpgradeQuote(1)).toBeNull();        // liquid item, not upgradeable
    expect(g.upgradeArmoryItemQuality(1)).toBe(false);
  });

  it('forging off Inscribed clears its banked kills', () => {
    const save = soloWithItem('battlefury');
    save.inventoryStash = [{ id: 'butterfly', bound: true, quality: 'inscribed', inscribedKills: 30 }];
    save.gold = 99999;
    const g = Game.headless(save);
    g.essence = 100;

    expect(g.qualityUpgradeQuote(0)!.to).toBe('corrupted'); // inscribed -> corrupted
    expect(g.upgradeArmoryItemQuality(0)).toBe(true);
    expect(g.inventoryStash[0].quality).toBe('corrupted');
    expect(g.inventoryStash[0].inscribedKills).toBeUndefined();
  });
});
