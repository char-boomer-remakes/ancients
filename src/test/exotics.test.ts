import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';

beforeAll(() => registerAllContent());

function arena(seed = 510) {
  const sim = new Sim({ seed, bounds: { w: 6000, h: 4000 } });
  sim.events.captureAll = true;
  return sim;
}

describe('exotic hero hooks', () => {
  it('Rubick Spell Steal immediately casts the target hero signature back at them', () => {
    const sim = arena();
    const rubick = sim.spawnHero(REG.hero('rubick'), { team: 0, pos: { x: 1000, y: 2000 }, level: 18, ctrl: { kind: 'player' } });
    const lion = sim.spawnHero(REG.hero('lion'), { team: 1, pos: { x: 1450, y: 2000 }, level: 18, ctrl: { kind: 'none' } });
    rubick.mana = 9999;
    const hpBefore = lion.hp;

    sim.order(rubick.uid, { kind: 'cast', slot: 3, uid: lion.uid });
    sim.run(1.0);

    expect(sim.events.history.some((e) => e.t === 'cast' && e.abilityId === 'stolen:lion-finger')).toBe(true);
    expect(lion.hp).toBeLessThan(hpBefore - 500);
  });

  it('Tinker Rearm refreshes other ability cooldowns', () => {
    const sim = arena();
    const tinker = sim.spawnHero(REG.hero('tinker'), { team: 0, pos: { x: 1000, y: 2000 }, level: 18, ctrl: { kind: 'player' } });
    const axe = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1300, y: 2000 }, level: 12, ctrl: { kind: 'none' } });
    tinker.mana = 9999;

    sim.order(tinker.uid, { kind: 'cast', slot: 0, uid: axe.uid });
    sim.run(0.6);
    expect(tinker.abilities[0].cooldownUntil).toBeGreaterThan(sim.time);

    sim.order(tinker.uid, { kind: 'cast', slot: 3 });
    sim.run(0.8);
    expect(tinker.abilities[0].cooldownUntil).toBeLessThanOrEqual(sim.time);
  });

  it('Techies Proximity Mines arm after a delay and then detonate on enemies', () => {
    const sim = arena();
    const techies = sim.spawnHero(REG.hero('techies'), { team: 0, pos: { x: 1000, y: 2000 }, level: 18, ctrl: { kind: 'player' } });
    const axe = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1450, y: 2000 }, level: 12, ctrl: { kind: 'none' } });
    techies.mana = 9999;
    const hpBefore = axe.hp;

    sim.order(techies.uid, { kind: 'cast', slot: 3, point: { ...axe.pos } });
    sim.run(0.9);
    expect(axe.hp).toBe(hpBefore);

    sim.run(1.4);
    expect(axe.hp).toBeLessThan(hpBefore);
    expect(sim.events.history.some((e) => e.t === 'zone-spawn')).toBe(true);
  });

  it('Brewmaster Primal Split hides the hero and fields three brewlings', () => {
    const sim = arena();
    const brew = sim.spawnHero(REG.hero('brewmaster'), { team: 0, pos: { x: 1000, y: 2000 }, level: 18, ctrl: { kind: 'player' } });
    brew.mana = 9999;

    sim.order(brew.uid, { kind: 'cast', slot: 3 });
    sim.run(1.0);

    expect(brew.summary.invulnerable).toBe(true);
    expect(brew.summary.untargetable).toBe(true);
    const brewlings = sim.unitsArr.filter((u) => u.ownerUid === brew.uid && u.creepId?.startsWith('brewling-'));
    expect(brewlings.map((u) => u.creepId).sort()).toEqual(['brewling-earth', 'brewling-fire', 'brewling-storm']);
  });
});
