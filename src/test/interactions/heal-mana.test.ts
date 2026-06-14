import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { arena, dummyHero, eventsOf, exec } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 — heal & mana. Heal caps at max and pctMaxHp scales with
// max HP; mana restore raises mana; mana burn floors at 0. Allies
// heal, enemies do not (negative control).
// ============================================================

beforeAll(() => registerAllContent());

describe('interactions/heal', () => {
  it('heals an ally and caps at max HP', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'crystal-maiden', { x: 2000, y: 4000 }, { team: 0 });
    const ally = dummyHero(sim, 'sven', { x: 2200, y: 4000 }, { team: 0 });
    ally.hp = 100;
    exec(sim, caster, [{ kind: 'heal', amount: 300, target: 'target' }], { target: ally });
    expect(ally.hp).toBe(400);
    expect(eventsOf(sim, 'heal', ally.uid).length).toBeGreaterThan(0);

    ally.hp = ally.stats.maxHp - 50;
    exec(sim, caster, [{ kind: 'heal', amount: 9999, target: 'target' }], { target: ally });
    expect(ally.hp).toBe(ally.stats.maxHp); // capped
  });

  it('pctMaxHp scales with the target max HP', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'crystal-maiden', { x: 2000, y: 4000 }, { team: 0 });
    const small = dummyHero(sim, 'crystal-maiden', { x: 2200, y: 4000 }, { team: 0 });
    const big = dummyHero(sim, 'axe', { x: 2400, y: 4000 }, { team: 0 });
    small.hp = 1;
    big.hp = 1;
    expect(big.stats.maxHp).toBeGreaterThan(small.stats.maxHp);
    const heal: EffectNode = { kind: 'heal', amount: 10, pctMaxHp: true, target: 'target' };
    exec(sim, caster, [heal], { target: small });
    exec(sim, caster, [heal], { target: big });
    expect(big.hp - 1).toBeGreaterThan(small.hp - 1); // same % → bigger absolute on the bigger pool
  });

  it('negative control: an enemy is not healed by an ally heal', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'crystal-maiden', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    enemy.hp = 100;
    exec(sim, caster, [{ kind: 'heal', amount: 200, target: 'allies-in-radius', radius: 4000 }], { point: caster.pos });
    expect(enemy.hp).toBe(100); // enemies excluded from an allies heal
  });
});

describe('interactions/mana', () => {
  it('restore raises mana toward the cap', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'crystal-maiden', { x: 2000, y: 4000 }, { team: 0 });
    const ally = dummyHero(sim, 'lich', { x: 2200, y: 4000 }, { team: 0 });
    ally.mana = 0;
    exec(sim, caster, [{ kind: 'mana', op: 'restore', amount: 150, target: 'target' }], { target: ally });
    expect(ally.mana).toBe(150);
  });

  it('burn floors at 0 and never goes negative', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'crystal-maiden', { x: 4000, y: 4000 }, { team: 1 });
    enemy.mana = 80;
    exec(sim, caster, [{ kind: 'mana', op: 'burn', amount: 500, target: 'target' }], { target: enemy });
    expect(enemy.mana).toBe(0); // floored, not negative
  });
});
