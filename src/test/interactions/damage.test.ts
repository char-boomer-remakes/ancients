import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { arena, ctx, dummyHero, eventsOf, exec, placeInside, placeOutside, snapshot } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 — damage. Victims in scope lose HP per the resolved amount;
// dtype mitigation applies; out-of-scope units are untouched. The
// boundary cells double as COLLISION_HITBOX_SPEC §5 hit-radius tests.
// ============================================================

beforeAll(() => registerAllContent());

const CENTER = { x: 4000, y: 4000 };
const RADIUS = 400;

describe('interactions/damage', () => {
  it('damages every enemy inside the radius and emits a damage event each', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const inA = dummyHero(sim, 'sniper', { x: CENTER.x, y: CENTER.y }, { team: 1 });
    const inB = dummyHero(sim, 'axe', { x: CENTER.x, y: CENTER.y }, { team: 1 });
    placeInside(inB, CENTER, RADIUS);
    const before = [snapshot(inA), snapshot(inB)];

    exec(sim, caster, [{ kind: 'damage', dtype: 'magical', amount: 200, target: 'enemies-in-radius', radius: RADIUS }], { point: CENTER });

    expect(inA.hp).toBeLessThan(before[0].hp);
    expect(inB.hp).toBeLessThan(before[1].hp);
    expect(eventsOf(sim, 'damage', inA.uid).length).toBeGreaterThan(0);
    expect(eventsOf(sim, 'damage', inB.uid).length).toBeGreaterThan(0);
  });

  it('negative control: a bystander just OUTSIDE the effective radius is untouched, just INSIDE is hit', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const inside = dummyHero(sim, 'sniper', CENTER, { team: 1 });
    const outside = dummyHero(sim, 'sniper', CENTER, { team: 1 });
    placeInside(inside, CENTER, RADIUS);
    placeOutside(outside, CENTER, RADIUS);

    exec(sim, caster, [{ kind: 'damage', dtype: 'magical', amount: 200, target: 'enemies-in-radius', radius: RADIUS }], { point: CENTER });

    expect(inside.hp).toBeLessThan(inside.stats.maxHp);
    expect(outside.hp).toBe(outside.stats.maxHp);
  });

  it('negative control: allies in the radius are not hit by an enemies-in-radius nuke', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const ally = dummyHero(sim, 'crystal-maiden', CENTER, { team: 0 });
    const enemy = dummyHero(sim, 'axe', CENTER, { team: 1 });

    exec(sim, caster, [{ kind: 'damage', dtype: 'magical', amount: 200, target: 'enemies-in-radius', radius: RADIUS }], { point: CENTER });

    expect(ally.hp).toBe(ally.stats.maxHp);
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp);
  });

  it('dtype matters: pure ignores armor, physical does not', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const physTarget = dummyHero(sim, 'axe', { x: 4000, y: 3000 }, { team: 1 });
    const pureTarget = dummyHero(sim, 'axe', { x: 4000, y: 5000 }, { team: 1 });
    const physBefore = physTarget.hp;
    const pureBefore = pureTarget.hp;

    exec(sim, caster, [{ kind: 'damage', dtype: 'physical', amount: 300, target: 'target' }], { target: physTarget });
    exec(sim, caster, [{ kind: 'damage', dtype: 'pure', amount: 300, target: 'target' }], { target: pureTarget });

    const physLost = physBefore - physTarget.hp;
    const pureLost = pureBefore - pureTarget.hp;
    expect(pureLost).toBeGreaterThan(physLost); // armor mitigated the physical hit, not the pure one
    expect(eventsOf(sim, 'damage', physTarget.uid)[0].dtype).toBe('physical');
    expect(eventsOf(sim, 'damage', pureTarget.uid)[0].dtype).toBe('pure');
  });

  it('repeat runs the inner effect `count` times', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const repeat: EffectNode = {
      kind: 'repeat',
      count: 3,
      interval: 0.05,
      effects: [{ kind: 'damage', dtype: 'pure', amount: 40, target: 'target' }]
    };
    exec(sim, caster, [repeat], { target }, ctx());
    sim.run(0.5);
    expect(eventsOf(sim, 'damage', target.uid).length).toBe(3);
  });
});
