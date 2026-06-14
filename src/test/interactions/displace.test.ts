import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { applyStatus } from '../../core/effects';
import { dist } from '../../core/math2d';
import { arena, ctx, dummyHero, eventsOf, exec, snapshot } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 — displace. blink/knockback/pull/forced each move the right
// unit the right way; blink emits the blink event; magic-immunity
// rejects an enemy displace (negative control / cross-check).
// ============================================================

beforeAll(() => registerAllContent());

describe('interactions/displace', () => {
  it('blink moves the caster toward the point and emits a blink event', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'axe', { x: 2000, y: 4000 }, { team: 0 });
    const from = snapshot(caster).pos;
    const dest = { x: 3000, y: 4000 };
    exec(sim, caster, [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 1200 }], { point: dest });
    expect(dist(caster.pos, dest)).toBeLessThan(50);
    expect(dist(caster.pos, from)).toBeGreaterThan(500);
    expect(eventsOf(sim, 'blink', caster.uid).length).toBe(1);
  });

  it('knockback pushes the target away from the caster', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'sven', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'axe', { x: 2400, y: 4000 }, { team: 1 });
    const start = snapshot(target).pos;
    exec(sim, caster, [{ kind: 'displace', mode: 'knockback', target: 'target', toward: 'away-from-caster', distance: 300, speed: 700 }], { target });
    sim.run(0.8);
    expect(target.pos.x).toBeGreaterThan(start.x + 150); // pushed further from caster
  });

  it('pull drags the target toward the caster', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'sniper', { x: 3200, y: 4000 }, { team: 1 });
    const before = dist(target.pos, caster.pos);
    exec(sim, caster, [{ kind: 'displace', mode: 'pull', target: 'target', speed: 950 }], { target });
    sim.run(1.0);
    expect(dist(target.pos, caster.pos)).toBeLessThan(before - 200);
  });

  it('forced toward caster moves the target inward', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'sniper', { x: 3000, y: 4000 }, { team: 1 });
    const before = dist(target.pos, caster.pos);
    exec(sim, caster, [{ kind: 'displace', mode: 'forced', target: 'target', toward: 'caster', distance: 400, speed: 800 }], { target });
    sim.run(0.8);
    expect(dist(target.pos, caster.pos)).toBeLessThan(before - 150);
  });

  it('negative control: a magic-immune enemy is not displaced and emits immune-block', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'sven', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'axe', { x: 2400, y: 4000 }, { team: 1 });
    applyStatus(sim, target, target, 'magic-immune', 10, undefined, ctx());
    target.refresh(sim.time);
    const start = snapshot(target).pos;
    const knock: EffectNode = { kind: 'displace', mode: 'knockback', target: 'target', toward: 'away-from-caster', distance: 300, speed: 700 };
    exec(sim, caster, [knock], { target });
    sim.run(0.8);
    expect(dist(target.pos, start)).toBeLessThan(40);
    expect(eventsOf(sim, 'immune-block', target.uid).length).toBeGreaterThan(0);
  });
});
