import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupMacroSim } from '../core/macro';
import { thinkGambit } from '../core/controllers';
import type { EffectCtx } from '../core/effects';
import type { GambitRule, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

function simWithRules(rules: GambitRule[]) {
  const teamA: MacroHeroSetup[] = [{ heroId: 'sniper', level: 18, gambits: rules }];
  const teamB: MacroHeroSetup[] = [
    { heroId: 'sven', level: 18 },
    { heroId: 'crystal-maiden', level: 18 }
  ];
  const sim = setupMacroSim({ seed: 991, teamA, teamB, maxSec: 30 });
  const hero = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
  const enemies = sim.unitsArr.filter((u) => u.team === 1);
  return { sim, hero, enemies };
}

describe('gambit AI positioning and targeting', () => {
  it('focus-fire can acquire the most dangerous enemy', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'always' }], then: { k: 'focus-fire', targetMode: 'most-dangerous' } }
    ]);
    const expected = [...enemies].sort((a, b) => b.stats.damage / b.stats.attackInterval - a.stats.damage / a.stats.attackInterval)[0];

    thinkGambit(sim, hero);

    expect(hero.order).toEqual({ kind: 'attack-unit', uid: expected.uid });
    expect(hero.ctrl.focusUid).toBe(expected.uid);
  });

  it('kite moves away from a close focus target', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'always' }], then: { k: 'kite', distance: 600 } }
    ]);
    const enemy = enemies[0];
    hero.pos = { x: 1000, y: 1000 };
    enemy.pos = { x: 1120, y: 1000 };
    hero.ctrl.focusUid = enemy.uid;

    thinkGambit(sim, hero);

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind === 'move') expect(hero.order.point.x).toBeLessThan(hero.pos.x);
  });

  it('dodge-zones moves out of a hostile damage zone', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'standing-in-zone' }], then: { k: 'dodge-zones' } },
      { if: [{ k: 'always' }], then: { k: 'hold' } }
    ]);
    const enemy = enemies[0];
    const ctx: EffectCtx = { defId: 'test-zone', level: 1, vfx: { archetype: 'ground-aoe', color: '#ff0000' } };
    sim.addZone({
      caster: enemy,
      ctx,
      spec: {
        shape: 'circle',
        radius: 300,
        duration: 5,
        tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 10, target: 'target' }] }
      },
      duration: 5,
      pos: { ...hero.pos },
      radius: 300
    });

    thinkGambit(sim, hero);

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind === 'move') {
      const before = (hero.pos.x - enemy.pos.x) ** 2 + (hero.pos.y - enemy.pos.y) ** 2;
      const after = (hero.order.point.x - hero.pos.x) ** 2 + (hero.order.point.y - hero.pos.y) ** 2;
      expect(before).toBeGreaterThanOrEqual(0);
      expect(after).toBeGreaterThan(0);
    }
  });

  it('enemy-count-by-role gates on how many enemy heroes carry a role', () => {
    // teamB has crystal-maiden (support); exactly 1 support, not 2.
    const enough = simWithRules([
      { if: [{ k: 'enemy-count-by-role', role: 'support', count: 1 }], then: { k: 'hold' } },
      { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
    ]);
    thinkGambit(enough.sim, enough.hero);
    expect(enough.hero.order.kind).toBe('hold'); // ≥1 support → first rule fires

    const notEnough = simWithRules([
      { if: [{ k: 'enemy-count-by-role', role: 'support', count: 2 }], then: { k: 'hold' } },
      { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
    ]);
    thinkGambit(notEnough.sim, notEnough.hero);
    expect(notEnough.hero.order.kind).not.toBe('hold'); // only 1 support → falls through
  });

  it('peel bodies the enemy diving a low-HP ally', () => {
    const teamA: MacroHeroSetup[] = [
      { heroId: 'sven', level: 18, gambits: [{ if: [{ k: 'always' }], then: { k: 'peel' } }] },
      { heroId: 'crystal-maiden', level: 18 }
    ];
    const teamB: MacroHeroSetup[] = [{ heroId: 'sniper', level: 18 }];
    const sim = setupMacroSim({ seed: 4242, teamA, teamB, maxSec: 30 });
    const peeler = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const diver = sim.unitsArr.find((u) => u.team === 1)!;

    ally.pos = { x: 2000, y: 2000 };
    ally.hp = ally.stats.maxHp * 0.3;
    diver.pos = { x: 2080, y: 2000 }; // crowding the wounded ally
    peeler.pos = { x: 1500, y: 2000 };
    sim.rebuildSpatial();

    thinkGambit(sim, peeler);

    expect(peeler.order).toEqual({ kind: 'attack-unit', uid: diver.uid });
  });

  it('spread steps a stacked unit away from a crowding ally', () => {
    const teamA: MacroHeroSetup[] = [
      { heroId: 'sven', level: 18, gambits: [{ if: [{ k: 'always' }], then: { k: 'spread' } }] },
      { heroId: 'juggernaut', level: 18 }
    ];
    const teamB: MacroHeroSetup[] = [{ heroId: 'sniper', level: 18 }];
    const sim = setupMacroSim({ seed: 77, teamA, teamB, maxSec: 30 });
    const u = sim.unitsArr.find((x) => x.team === 0 && x.heroId === 'sven')!;
    const crowd = sim.unitsArr.find((x) => x.team === 0 && x.heroId === 'juggernaut')!;
    u.pos = { x: 3000, y: 3000 };
    crowd.pos = { x: 3050, y: 3000 };
    sim.rebuildSpatial();

    thinkGambit(sim, u);

    expect(u.order.kind).toBe('move');
    if (u.order.kind === 'move') {
      const moved = (u.order.point.x - u.pos.x) ** 2 + (u.order.point.y - u.pos.y) ** 2;
      expect(moved).toBeGreaterThan(0);
      // moved away from the crowding ally
      expect(u.order.point.x).toBeLessThan(crowd.pos.x);
    }
  });

  it('fight-time-gt is relative to the current encounter, not absolute sim time', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'fight-time-gt', sec: 5 }], then: { k: 'hold' } },
      { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
    ]);
    const enemy = enemies[0];
    hero.pos = { x: 1000, y: 1000 };
    enemy.pos = { x: 1300, y: 1000 };
    hero.ctrl.focusUid = enemy.uid;
    sim.time = 100;
    sim.rebuildSpatial();

    thinkGambit(sim, hero);
    expect(hero.order.kind).toBe('attack-unit');
    expect(hero.ctrl.encounterStartAt).toBe(100);

    sim.time = 106;
    thinkGambit(sim, hero);
    expect(hero.order.kind).toBe('hold');
  });
});
