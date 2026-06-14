import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { normalizeCollisionObstacle, staticCircleObstacle } from '../../core/collision';
import { arena, ctx, dummyHero, eventsOf, exec } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 / COLLISION_HITBOX_SPEC §5 — projectile. The named policies:
// linear sweep hits the first valid unit, aim-wide whiffs and
// expires, hitsAllies gates friendly collision, a projectile-
// blocking obstacle intercepts before a unit and emits
// projectile-block (onHit must NOT run after a block), disjointable
// drops a homing projectile, onHit runs only on impact.
// ============================================================

beforeAll(() => registerAllContent());

const onHit: EffectNode[] = [{ kind: 'damage', dtype: 'magical', amount: 120, target: 'target' }];

describe('interactions/projectile', () => {
  it('a linear projectile hits the first valid enemy and runs onHit', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'sniper', { x: 3000, y: 4000 }, { team: 1 });
    const before = enemy.hp;
    const proj: EffectNode = { kind: 'projectile', to: 'target', proj: { model: 'linear', speed: 1500, width: 120, range: 2000, onHit } };
    exec(sim, caster, [proj], { target: enemy });
    expect(eventsOf(sim, 'projectile-spawn').length).toBe(1);
    sim.run(1.5);
    expect(enemy.hp).toBeLessThan(before);
    expect(eventsOf(sim, 'projectile-hit').length).toBe(1);
  });

  it('an aim-wide linear projectile misses and expires without an onHit', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'sniper', { x: 3000, y: 4000 }, { team: 1 });
    const proj: EffectNode = { kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 1500, width: 90, range: 1200, onHit } };
    exec(sim, caster, [proj], { point: { x: 3000, y: 4900 } }); // aimed wide of the enemy
    sim.run(2);
    expect(enemy.hp).toBe(enemy.stats.maxHp);
    expect(eventsOf(sim, 'projectile-hit').length).toBe(0);
    expect(eventsOf(sim, 'projectile-expire').length).toBe(1);
  });

  it('hitsAllies=false: a friendly unit in the path is not hit', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const ally = dummyHero(sim, 'sniper', { x: 2600, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', { x: 3200, y: 4000 }, { team: 1 });
    const proj: EffectNode = { kind: 'projectile', to: 'target', proj: { model: 'linear', speed: 1600, width: 120, range: 2000, hitsAllies: false, onHit } };
    exec(sim, caster, [proj], { target: enemy });
    sim.run(1.5);
    expect(ally.hp).toBe(ally.stats.maxHp); // friendly passed through
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp);
  });

  it('a projectile-blocking obstacle intercepts before the unit; onHit does not run', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'sniper', { x: 3000, y: 4000 }, { team: 1 });
    sim.obstacles = [normalizeCollisionObstacle(staticCircleObstacle({
      pos: { x: 2500, y: 4000 },
      radius: 80,
      id: 'wall',
      blocksProjectiles: true
    }))];
    const before = enemy.hp;
    const proj: EffectNode = { kind: 'projectile', to: 'target', proj: { model: 'linear', speed: 1500, width: 90, range: 2000, onHit } };
    exec(sim, caster, [proj], { target: enemy });
    sim.run(1.5);
    expect(enemy.hp).toBe(before); // never reached the enemy
    expect(eventsOf(sim, 'projectile-block').length).toBe(1);
    expect(eventsOf(sim, 'projectile-hit').length).toBe(0);
  });

  it('a disjointable homing projectile can be dropped before impact', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'sniper', { x: 4500, y: 4000 }, { team: 1 });
    const proj: EffectNode = { kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 900, disjointable: true, onHit } };
    exec(sim, caster, [proj], { target: enemy });
    sim.run(0.2);
    sim.disjointProjectiles(enemy.uid);
    sim.run(3);
    expect(enemy.hp).toBe(enemy.stats.maxHp); // dropped: never landed
    expect(eventsOf(sim, 'projectile-expire').length).toBeGreaterThan(0);
    expect(eventsOf(sim, 'projectile-hit').length).toBe(0);
  });
});
