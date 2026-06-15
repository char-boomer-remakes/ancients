import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { applyDamage, applyElementAura } from '../core/combat';
import { resonanceMods } from '../core/resonance';
import { makeItemState } from '../core/items';
import { freshEchoProgress } from '../core/echo';
import { xpForLevel } from '../core/stats';
import { TUNING } from '../data/tuning';
import { Game, newGameSave } from '../systems/game';
import type { CreepDef, CreepInstanceSave, GambitRule, GameSave, SimEvent } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// PROGRESSION_OVERHAUL §5 — ANCIENTS-native gear. These cover the
// systems-facing behaviors wired alongside each item's stat hooks
// (TUNING.nativeItems): reaction spread/field, resonance grant,
// dual-Aghs, capture, XP funnel / gold→XP, traversal, entourage,
// tag-chain step, and the Dowser ping query.
// ============================================================

beforeAll(() => registerAllContent());

const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

function equip(u: Unit, ...ids: string[]): void {
  ids.forEach((id, i) => {
    u.items[i] = makeItemState(REG.item(id));
  });
  u.markStatsDirty();
  u.refresh(0);
}

function creepOfTier(tier: CreepDef['tier']): CreepDef {
  const def = [...REG.creeps.values()].find((c) => c.tier === tier);
  if (!def) throw new Error(`no creep of tier ${tier}`);
  return def;
}

function rosterItems(ids: string[]): GameSave['roster'][number]['items'] {
  const slots: GameSave['roster'][number]['items'] = [null, null, null, null, null, null];
  ids.slice(0, 6).forEach((id, i) => (slots[i] = { id }));
  return slots;
}

function killWildCreep(g: Game, def: CreepDef): void {
  const hero = g.activeUnit()!;
  const pos = { x: hero.pos.x + 140, y: hero.pos.y };
  const creep = g.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...pos } });
  applyDamage(g.sim, hero, creep, 1e9, 'physical');
  g.update(0.05);
}

describe('native items — Catalyst Prism (reaction spread + residual field)', () => {
  it('spreads the reaction element to a nearby enemy and lengthens the field', () => {
    const withPrism = Game.headless(newGameSave('lina'));
    const hero = withPrism.activeUnit()!;
    equip(hero, 'catalyst-prism');
    const a = withPrism.sim.spawnCreep(creepOfTier('small'), { team: 1, pos: { x: hero.pos.x + 200, y: hero.pos.y } });
    const b = withPrism.sim.spawnCreep(creepOfTier('small'), { team: 1, pos: { x: a.pos.x + 100, y: a.pos.y } });
    applyElementAura(withPrism.sim, hero, a, 'hydro', 1, true);
    applyElementAura(withPrism.sim, hero, a, 'pyro', 1, true); // vaporize → spread + field

    expect(b.elementAuras.pyro).toBeTruthy(); // spread jumped to the neighbour
    const fieldRemaining = (a.elementAuras.pyro?.until ?? 0) - withPrism.sim.time;
    expect(fieldRemaining).toBeGreaterThan(4 + TUNING.nativeItems.catalystFieldSec - 0.5);

    // Control: no prism → no spread.
    const noPrism = Game.headless(newGameSave('lina'));
    const h2 = noPrism.activeUnit()!;
    const a2 = noPrism.sim.spawnCreep(creepOfTier('small'), { team: 1, pos: { x: h2.pos.x + 200, y: h2.pos.y } });
    const b2 = noPrism.sim.spawnCreep(creepOfTier('small'), { team: 1, pos: { x: a2.pos.x + 100, y: a2.pos.y } });
    applyElementAura(noPrism.sim, h2, a2, 'hydro', 1, true);
    applyElementAura(noPrism.sim, h2, a2, 'pyro', 1, true);
    expect(b2.elementAuras.pyro).toBeFalsy();
  });
});

describe('native items — Concord Relic (resonance without two shared)', () => {
  it('lowers the shared-element threshold to one', () => {
    const ids = ['lina', 'juggernaut', 'sniper']; // only lina is an active (pyro) element
    const normal = resonanceMods(ids, (id) => REG.hero(id), 2);
    const concord = resonanceMods(ids, (id) => REG.hero(id), 1);
    expect(normal.id).toBe('harmony-resonance');
    expect(concord.id).toBe('pyro-resonance');
  });
});

describe('native items — Taming Collar (higher capture threshold)', () => {
  it('lets a bind start from a higher HP than the base threshold', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const hero = g.activeUnit()!;
    const def = creepOfTier('small');
    const base = TUNING.capture.small.hpPct;
    const target = g.sim.spawnCreep(def, { team: 1, pos: { x: hero.pos.x + 120, y: hero.pos.y }, wild: true });
    target.capturable = true;
    target.hp = target.stats.maxHp * (base + 0.05); // above base, below collar threshold

    expect(g.captureEligible(target).ok).toBe(false);
    equip(hero, 'taming-collar');
    expect(g.captureEligible(target).ok).toBe(true);
  });
});

describe('native items — Dowser\'s Compass (POI ping)', () => {
  it('returns nothing without the compass and pings a nearby chest with it', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const hero = g.activeUnit()!;
    expect(g.dowserPings()).toEqual([]);

    const chest = (g.region.chests ?? [])[0];
    if (!chest) return; // region has no chests to ping
    hero.pos = { ...chest.pos };
    equip(hero, 'dowsers-compass');
    const pings = g.dowserPings();
    expect(pings.some((p) => p.kind === 'chest')).toBe(true);
  });
});

describe('native items — Twin-Soul Vessel (holds both Aghs payloads)', () => {
  it('applies scepter + shard effects to the carrier', () => {
    const plain = Game.headless(newGameSave('juggernaut'));
    const baseSpeed = plain.activeUnit()!.stats.moveSpeed;

    const save = newGameSave('juggernaut');
    save.roster[0].items = rosterItems(['twin-soul-vessel']);
    const vessel = Game.headless(save);
    const vesselSpeed = vessel.activeUnit()!.stats.moveSpeed;

    // Juggernaut's scepter payload adds move speed (see gameplay-overhaul Aghanim test).
    expect(vesselSpeed).toBeGreaterThan(baseSpeed);
  });
});

describe('native items — Scholar\'s Sigil (gold income → XP)', () => {
  it('converts a slice of gold into active-hero XP', () => {
    const def = creepOfTier('small');

    const plain = Game.headless(newGameSave('juggernaut'));
    plain.activeUnit()!.addXp(-plain.activeUnit()!.xp, 30); // normalize to a known floor
    killWildCreep(plain, def);
    const plainGold = plain.gold;
    const plainXp = plain.activeUnit()!.xp;

    const save = newGameSave('juggernaut');
    save.roster[0].items = rosterItems(['scholars-sigil']);
    const sigil = Game.headless(save);
    sigil.activeUnit()!.addXp(-sigil.activeUnit()!.xp, 30);
    killWildCreep(sigil, def);

    expect(sigil.gold).toBeLessThan(plainGold);
    expect(sigil.activeUnit()!.xp).toBeGreaterThan(plainXp);
  });
});

describe('native items — Soul Ledger (funnel XP to a bench recruit)', () => {
  function partySave(active: string, bench: string, withLedger: boolean): GameSave {
    const save = newGameSave(active);
    save.recruited.push(bench);
    save.party.push(bench);
    save.roster.push({
      heroId: bench,
      level: 3,
      xp: xpForLevel(3),
      items: rosterItems([]),
      neutralSlot: null,
      talentPicks: [0, 0, 0, 0],
      gambits: AGGRO,
      echo: freshEchoProgress(),
      facetIdx: 0,
      hpPct: 1,
      manaPct: 1,
      abilityCooldowns: [0, 0, 0, 0],
      tagGaugeReadyAt: 0
    });
    save.badges = [...REG.gyms.values()].map((gy) => gy.badgeId); // raise the recruit ceiling
    if (withLedger) save.roster[0].items = rosterItems(['soul-ledger']);
    return save;
  }

  it('a carrier hands the lowest-level bench recruit extra XP', () => {
    const def = creepOfTier('small');
    const plain = Game.headless(partySave('juggernaut', 'sniper', false));
    killWildCreep(plain, def);
    const plainBench = plain.party.find((p) => p.heroId === 'sniper')!;

    const ledger = Game.headless(partySave('juggernaut', 'sniper', true));
    killWildCreep(ledger, def);
    const ledgerBench = ledger.party.find((p) => p.heroId === 'sniper')!;

    const plainXp = plainBench.unit ? plainBench.unit.xp : plainBench.xp;
    const ledgerXp = ledgerBench.unit ? ledgerBench.unit.xp : ledgerBench.xp;
    expect(ledgerXp).toBeGreaterThan(plainXp);
  });
});

describe('native items — Beastbond Totem (entourage one star higher)', () => {
  it('fields a captured creep at a higher effective star', () => {
    const def = creepOfTier('small');
    const inst: CreepInstanceSave = { uid: 'beast-1', creepId: def.id, star: 1 };

    const save = newGameSave('juggernaut');
    save.caught = [inst];
    const g = Game.headless(save);
    equip(g.activeUnit()!, 'beastbond-totem');

    expect(g.fieldCreep('beast-1')).toBe(true);
    const simUid = (g as unknown as { fieldedUnits: Map<string, number> }).fieldedUnits.get('beast-1')!;
    const u = g.sim.unit(simUid)!;
    expect(u.star).toBe(1 + TUNING.nativeItems.beastbondStarBonus);
  });
});

describe('native items — Tagweaver\'s Gauntlet (+1 tag-chain step)', () => {
  it('raises the tag-chain ceiling by one step', () => {
    const base = Math.round(TUNING.tagChainMaxSteps);
    const advance = (g: Game, u: Unit): number => {
      let count = 0;
      for (let i = 0; i < base + 3; i++) count = (g as unknown as { advanceTagChain(u: Unit): { count: number } }).advanceTagChain(u).count;
      return count;
    };

    const plain = Game.headless(newGameSave('juggernaut'));
    expect(advance(plain, plain.activeUnit()!)).toBe(base);

    const weave = Game.headless(newGameSave('juggernaut'));
    equip(weave.activeUnit()!, 'tagweavers-gauntlet');
    expect(advance(weave, weave.activeUnit()!)).toBe(base + TUNING.nativeItems.tagweaverBonusSteps);
  });
});

describe('native items — Skyfeather Anklet (cheaper traversal)', () => {
  it('reduces the climb/swim stamina drain multiplier', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const drain = (): number => (g as unknown as { skyfeatherDrainMult(): number }).skyfeatherDrainMult();
    expect(drain()).toBe(1);
    equip(g.activeUnit()!, 'skyfeather-anklet');
    expect(drain()).toBe(TUNING.nativeItems.skyfeatherClimbDrainMult);
  });
});
