import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import {
  collisionBodyPushOut,
  normalizeCollisionObstacle,
  rectBody,
  staticCircleObstacle
} from '../core/collision';
import { integrateForcedMoves } from '../core/movement';
import { itemStateFromSave } from '../core/items';
import { Game, newGameSave } from '../systems/game';
import type { CollisionObstacle, Vec2 } from '../core/types';

// ============================================================
// CLIPPING RED TEAM — "units keep ending up inside the scenery."
//
// The movement core only resolves a unit's collisions at its POST-move
// position (no swept test), idle units never resolve at all, and several
// placement paths (spawn, teleport, knockback) move a unit in one shot.
// Each of those is a way to end a tick *inside* a solid body — the visual
// "clipping into the ground/props" the player reported.
//
// These scenarios assert the one invariant that must always hold: after a
// tick settles, a live unit is never overlapping a movement-blocking
// obstacle by more than a hair, and forced motion can't tunnel a unit to
// the far side of a solid wall.
// ============================================================

beforeAll(() => registerAllContent());

function arena(seed = 1): Sim {
  return new Sim({ seed, bounds: { w: 16000, h: 16000 } });
}

function hero(sim: Sim, pos: Vec2, level = 20) {
  return sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos, level, ctrl: { kind: 'none' } });
}

function solid(sim: Sim, pos: Vec2, radius: number, id: string): CollisionObstacle {
  const o = normalizeCollisionObstacle(staticCircleObstacle({ pos, radius, id, blocksMovement: true }));
  sim.obstacles.push(o);
  return o;
}

/** How deep `u` is inside `o` (0 == just touching / outside). */
function penetration(o: CollisionObstacle, u: { pos: Vec2; radius: number }): number {
  const push = collisionBodyPushOut(o.pos, o.body, u.pos, u.radius);
  return push ? push.penetration : 0;
}

function obstacleRadius(o: CollisionObstacle): number {
  return o.body.shape.kind === 'circle' ? o.body.shape.radius : o.radius;
}

// ------------------------------------------------------------
// 1) Knockback into a normal-sized boulder must not tunnel through it.
// ------------------------------------------------------------
describe('knockback vs a solid blocker', () => {
  it('stops on the near side and never clips inside a boulder', () => {
    const sim = arena(11);
    const start = { x: 8000, y: 8000 };
    const u = hero(sim, start);
    const wall = solid(sim, { x: 8000 + 260, y: 8000 }, 120, 'boulder');

    const distance = 1500;
    const speed = 2500;
    u.forced.push({ kind: 'knockback', dir: { x: 1, y: 0 }, speed, until: sim.time + distance / speed });

    let maxPen = 0;
    for (let i = 0; i < 120 && u.forced.length; i++) {
      sim.tick();
      maxPen = Math.max(maxPen, penetration(wall, u));
    }
    // never sank into the rock, and was stopped before crossing to the far side
    expect(maxPen).toBeLessThan(2);
    expect(u.pos.x).toBeLessThan(wall.pos.x);
  });
});

// ------------------------------------------------------------
// 2) Knockback into a SMALL stake at high speed must not skip past it.
//    (small obstacle + big per-tick step = classic tunneling.)
// ------------------------------------------------------------
describe('knockback vs a small obstacle (tunneling)', () => {
  it('does not skip through a small stake at high knockback speed', () => {
    const sim = arena(12);
    const u = hero(sim, { x: 8000, y: 8000 });
    const stake = solid(sim, { x: 8000 + 200, y: 8000 }, 40, 'stake');

    const distance = 1200;
    const speed = 7000; // ~230px per 1/30s tick — bigger than the stake
    u.forced.push({ kind: 'knockback', dir: { x: 1, y: 0 }, speed, until: sim.time + distance / speed });

    let maxPen = 0;
    for (let i = 0; i < 120 && u.forced.length; i++) {
      sim.tick();
      maxPen = Math.max(maxPen, penetration(stake, u));
    }
    expect(maxPen).toBeLessThan(2);
    expect(u.pos.x).toBeLessThan(stake.pos.x);
  });
});

// ------------------------------------------------------------
// 3) A lag spike (one big dt) during a forced move must not teleport
//    a unit through a wall.
// ------------------------------------------------------------
describe('forced move under a frame spike', () => {
  it('a big dt step still cannot cross a solid wall', () => {
    const sim = arena(13);
    const u = hero(sim, { x: 8000, y: 8000 });
    const wall = solid(sim, { x: 8000 + 220, y: 8000 }, 110, 'wall');
    u.forced.push({ kind: 'forced', dir: { x: 1, y: 0 }, speed: 1500, until: sim.time + 2 });

    // simulate a 300ms hitch: one fat integration step instead of ten small ones
    integrateForcedMoves(sim, u, 0.3);
    integrateForcedMoves(sim, u, 0.3);

    expect(penetration(wall, u)).toBeLessThan(2);
    expect(u.pos.x).toBeLessThan(wall.pos.x);
  });
});

// ------------------------------------------------------------
// 4) A unit boxed in by a ring of boulders resolves out of all of them.
// ------------------------------------------------------------
describe('obstacle pocket convergence', () => {
  it('a unit pressed by many overlapping boulders ends inside none of them', () => {
    const sim = arena(14);
    const center = { x: 8000, y: 8000 };
    const u = hero(sim, center);
    const ring: CollisionObstacle[] = [];
    const R = 150;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // place each boulder close enough that their bodies overlap the unit
      ring.push(solid(sim, { x: center.x + Math.cos(a) * 120, y: center.y + Math.sin(a) * 120 }, R, `rock-${i}`));
    }
    // nudge the unit so it has an order and runs the resolver
    u.order = { kind: 'move', point: { x: center.x + 40, y: center.y } };
    for (let i = 0; i < 60; i++) sim.tick();

    for (const o of ring) expect(penetration(o, u)).toBeLessThan(2);
  });
});

// ------------------------------------------------------------
// 5) The high-frequency one: a unit placed inside scenery (spawn /
//    teleport / a wall dropped on it) must be ejected, not left clipped.
// ------------------------------------------------------------
describe('a unit standing inside scenery is ejected', () => {
  it('does not stay clipped inside an obstacle while idle', () => {
    const sim = arena(15);
    const obstacle = solid(sim, { x: 8000, y: 8000 }, 140, 'pillar');
    // teleport the unit straight into the pillar centre and leave it idle.
    const u = hero(sim, { x: 8000, y: 8000 });
    u.order = { kind: 'stop' };

    expect(penetration(obstacle, u)).toBeGreaterThan(0); // starts clipped

    for (let i = 0; i < 120; i++) sim.tick();

    // after a couple seconds it should have been pushed out to the rim.
    expect(penetration(obstacle, u)).toBeLessThan(2);
  });
});

// ------------------------------------------------------------
// 6) The player version: dash-spam into a concave prop corner.
// ------------------------------------------------------------
describe('dash into a concave corner', () => {
  it('cannot wedge between two rectangular blockers and the world bounds', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const u = g.activeUnit()!;
    u.pos = { x: 180, y: 180 };
    u.prevPos = { ...u.pos };
    g.sim.obstacles = [
      normalizeCollisionObstacle({
        id: 'corner-wall-x',
        pos: { x: 340, y: 120 },
        radius: 0,
        body: rectBody(360, 70, { blocksMovement: true, feedback: { label: 'north wall' } })
      }),
      normalizeCollisionObstacle({
        id: 'corner-wall-y',
        pos: { x: 120, y: 340 },
        radius: 0,
        body: rectBody(70, 360, { blocksMovement: true, feedback: { label: 'west wall' } })
      })
    ];

    expect(g.tryDash({ x: 480, y: 480 })).toBe(true);
    for (let i = 0; i < 90; i++) g.update(1 / 30);

    expect(Number.isFinite(u.pos.x)).toBe(true);
    expect(Number.isFinite(u.pos.y)).toBe(true);
    expect(u.pos.x).toBeGreaterThanOrEqual(u.radius);
    expect(u.pos.y).toBeGreaterThanOrEqual(u.radius);
    for (const o of g.sim.obstacles) expect(penetration(o, u)).toBeLessThan(2);
  });
});

// ------------------------------------------------------------
// 7) Temporary wall zones should eject idle/stunned units too.
// ------------------------------------------------------------
describe('temporary wall depenetration', () => {
  it('pushes a stopped unit off a wall zone that appears under it', () => {
    const sim = arena(16);
    const u = hero(sim, { x: 8000, y: 8000 });
    const caster = hero(sim, { x: 7600, y: 8000 });
    sim.addZone({
      caster,
      ctx: { defId: 'test-wall', level: 1, vfx: { archetype: 'wall', color: '#ffffff' } },
      spec: { shape: 'line', width: 160, length: 800, duration: 3, wall: true },
      duration: 3,
      a: { x: 7600, y: 8000 },
      b: { x: 8400, y: 8000 },
      width: 160
    });

    for (let i = 0; i < 30; i++) sim.tick();

    const wall = sim.zones.find((z) => z.wall)!;
    expect(Math.abs(u.pos.y - wall.a!.y)).toBeGreaterThanOrEqual(wall.width / 2 + u.radius - 1);
  });
});

// ------------------------------------------------------------
// 8) Dropping loot at nonsense coordinates should never put it under/outside
//    the world, even when the player provides the drop point directly.
// ------------------------------------------------------------
describe('drop points are clamped into playable ground', () => {
  it('clamps player-provided item drop positions to map bounds', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const u = g.activeUnit()!;
    u.items[0] = itemStateFromSave({ id: 'blink-dagger' }, g.sim.time);

    expect(g.dropHeroItemToGround(0, { x: -9999, y: g.sim.bounds.h + 9999 })).toBe(true);
    const drop = g.groundItemDrops.find((d) => d.item.id === 'blink-dagger')!;
    expect(drop.pos.x).toBeGreaterThanOrEqual(48);
    expect(drop.pos.y).toBeLessThanOrEqual(g.sim.bounds.h - 48);
    expect(Number.isFinite(drop.pos.x)).toBe(true);
    expect(Number.isFinite(drop.pos.y)).toBe(true);
  });
});
