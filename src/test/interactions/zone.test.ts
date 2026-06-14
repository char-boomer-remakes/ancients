import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { arena, dummyHero, eventsOf, exec } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.2 — zone. A circle/line persists for its duration; ticks hit
// the declared team only; a wall blocks pathing; onEnter fires once
// in window; the zone expires. Emits zone-spawn / zone-expire (§4).
// ============================================================

beforeAll(() => registerAllContent());

const CENTER = { x: 4000, y: 4000 };

describe('interactions/zone', () => {
  it('a circle zone persists, ticks its team, and expires with events', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', CENTER, { team: 1 });
    const ally = dummyHero(sim, 'sven', { x: CENTER.x + 80, y: CENTER.y }, { team: 0 });
    const zone: EffectNode = {
      kind: 'zone',
      at: 'point',
      zone: {
        shape: 'circle',
        radius: 350,
        duration: 2,
        tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 30, target: 'target' }] }
      }
    };
    exec(sim, caster, [zone], { point: CENTER });
    expect(sim.zones.length).toBe(1);
    expect(eventsOf(sim, 'zone-spawn').length).toBe(1);

    const allyBefore = ally.hp;
    sim.run(2.2);
    expect(enemy.hp).toBeLessThan(enemy.stats.maxHp); // enemy ticked
    expect(ally.hp).toBe(allyBefore); // ally untouched by an enemies-only tick
    expect(sim.zones.length).toBe(0); // expired
    expect(eventsOf(sim, 'zone-expire').length).toBe(1);
  });

  it('onEnter fires once when a unit walks into the zone window', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const walker = dummyHero(sim, 'axe', { x: CENTER.x + 900, y: CENTER.y }, { team: 1, player: true });
    const zone: EffectNode = {
      kind: 'zone',
      at: 'point',
      zone: {
        shape: 'circle',
        radius: 300,
        duration: 6,
        onEnter: { affects: 'enemies', windowSec: 6, effects: [{ kind: 'damage', dtype: 'pure', amount: 50, target: 'target' }] }
      }
    };
    exec(sim, caster, [zone], { point: CENTER });
    const before = walker.hp;
    sim.order(walker.uid, { kind: 'move', point: CENTER });
    sim.run(4);
    const damageEvents = eventsOf(sim, 'damage', walker.uid).length;
    expect(walker.hp).toBeLessThan(before); // entered and took the onEnter hit
    expect(damageEvents).toBe(1); // fires once, not every tick inside
  });

  it('a wall line blocks a walker from crossing', () => {
    const sim = arena();
    // A line zone is drawn from the caster toward the cast point. Put the caster
    // and point on the same horizontal so the wall spans the runner's vertical path.
    const caster = dummyHero(sim, 'earthshaker', { x: 3400, y: 4200 }, { team: 0 });
    const runner = dummyHero(sim, 'juggernaut', { x: 4000, y: 4600 }, { team: 1, player: true });
    const wall: EffectNode = {
      kind: 'zone',
      at: 'point',
      zone: { shape: 'line', length: 1200, width: 96, duration: 4, wall: true }
    };
    exec(sim, caster, [wall], { point: { x: 4600, y: 4200 } });
    const wallZone = sim.zones.find((z) => z.wall);
    expect(wallZone).toBeDefined();

    sim.order(runner.uid, { kind: 'move', point: { x: 4000, y: 3000 } });
    sim.run(2);
    expect(runner.pos.y).toBeGreaterThan(4250); // held on the near side; never crossed the wall line at y=4200
  });
});
