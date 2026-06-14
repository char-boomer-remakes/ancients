import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { applyDamage } from '../../core/combat';
import { dist } from '../../core/math2d';
import { arena, ctx, dummyHero, exec } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 — the non-EffectNode mechanics that ride on abilities:
// statmod (apply then revert), aura (in range / out of range /
// wrong team), passiveMods (reflected in stats), triggers
// (on-damage-taken proc fires), attackMod (cleave splashes).
// ============================================================

beforeAll(() => registerAllContent());

describe('interactions/statmod', () => {
  it('applies the declared mods for the duration, then reverts', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'sven', { x: 2000, y: 4000 }, { team: 0 });
    const baseDamage = caster.stats.damage;
    const node: EffectNode = { kind: 'statmod', mods: { damage: 100 }, duration: 1, target: 'self' };
    exec(sim, caster, [node], {}, ctx());
    caster.refresh(sim.time);
    expect(caster.stats.damage).toBeGreaterThan(baseDamage);
    sim.run(1.4);
    expect(caster.stats.damage).toBe(baseDamage); // reverted at expiry
  });
});

describe('interactions/aura', () => {
  it('applies to allies in range, not to enemies, and drops when an ally leaves range', () => {
    const sim = arena();
    const luna = dummyHero(sim, 'luna', { x: 4000, y: 4000 }, { team: 0 });
    const nearAlly = dummyHero(sim, 'sniper', { x: 4300, y: 4000 }, { team: 0 });
    const farAlly = dummyHero(sim, 'sven', { x: 7000, y: 7000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', { x: 4300, y: 4200 }, { team: 1 });
    sim.run(1.0);
    // Lunar Blessing (radius 1200, allies) grants bonus attack damage.
    expect(nearAlly.summary.mods.damage ?? 0).toBeGreaterThan(0);
    expect(dist(farAlly.pos, luna.pos)).toBeGreaterThan(1200);
    expect(farAlly.summary.mods.damage ?? 0).toBe(0); // out of range
    expect(enemy.summary.mods.damage ?? 0).toBe(0); // wrong team

    // pull the near ally out of range; the aura mod drops.
    nearAlly.pos = { x: 7500, y: 100 };
    nearAlly.prevPos = { ...nearAlly.pos };
    sim.run(1.0);
    expect(nearAlly.summary.mods.damage ?? 0).toBe(0);
  });
});

describe('interactions/passiveMods', () => {
  it('a passive stat mod is reflected in resolved stats', () => {
    const sim = arena();
    const sniper = dummyHero(sim, 'sniper', { x: 2000, y: 4000 }, { team: 0 });
    // Take Aim is a passive attack-range mod; the resolved range exceeds the 550 base.
    expect(sniper.stats.attackRange).toBeGreaterThan(550);
  });
});

describe('interactions/triggers', () => {
  it('an on-damage-taken trigger (Counter Helix) punishes a melee attacker', () => {
    const sim = arena();
    const axe = dummyHero(sim, 'axe', { x: 2000, y: 4000 }, { team: 0, level: 20 });
    const attacker = dummyHero(sim, 'juggernaut', { x: 2120, y: 4000 }, { team: 1 });
    const before = attacker.hp;
    // Counter Helix has a chance per hit; a short burst of hits makes it near-certain.
    for (let i = 0; i < 12; i++) applyDamage(sim, attacker, axe, 40, 'physical');
    expect(attacker.hp).toBeLessThan(before); // helix splashed back onto the attacker
  });
});

describe('interactions/attackMod', () => {
  it('cleave splashes attack damage onto a neighbor', () => {
    const sim = arena();
    const sven = dummyHero(sim, 'sven', { x: 2000, y: 4000 }, { team: 0, level: 25, player: true });
    const primary = dummyHero(sim, 'axe', { x: 2150, y: 4000 }, { team: 1 });
    const neighbor = dummyHero(sim, 'axe', { x: 2300, y: 4000 }, { team: 1 });
    const before = neighbor.hp;
    sim.order(sven.uid, { kind: 'attack-unit', uid: primary.uid });
    sim.run(3);
    expect(neighbor.hp).toBeLessThan(before); // Great Cleave reached the neighbor
  });
});
