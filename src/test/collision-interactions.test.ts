import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { freshEchoProgress } from '../core/echo';
import { dist } from '../core/math2d';
import { resolveCollisions } from '../core/movement';
import { directWalkable } from '../core/pathfind';
import { xpForLevel } from '../core/stats';
import {
  capsuleBody,
  collisionBodyPushOut,
  normalizeCollisionObstacle,
  rectBody,
  unitPickRadius,
  unitTargetRadius
} from '../core/collision';
import { Game, newGameSave } from '../systems/game';
import { LiveRaid } from '../systems/raid-session';
import type { CollisionObstacle, GameSave, MacroHeroSetup, Vec2 } from '../core/types';
import type { Unit } from '../core/unit';

beforeAll(() => registerAllContent());

function fullPartySave(): GameSave {
  const heroes = ['juggernaut', 'sven', 'sniper', 'lich', 'crystal-maiden'];
  const save = newGameSave(heroes[0]);
  save.party = heroes;
  save.recruited = heroes;
  save.roster = heroes.map((heroId) => ({
    heroId,
    level: 30,
    xp: xpForLevel(30),
    items: [null, null, null, null, null, null],
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: [],
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0],
    tagGaugeReadyAt: 0
  }));
  return save;
}

function obstacleClearance(obstacle: CollisionObstacle, point: Vec2, radius: number): boolean {
  return collisionBodyPushOut(obstacle.pos, obstacle.body, point, radius) === null;
}

describe('collision interaction edge cases', () => {
  it('routes through an offset dungeon-style door gap instead of wedging on rect walls', () => {
    const sim = new Sim({
      seed: 91001,
      bounds: { w: 5000, h: 4000 },
      obstacles: [
        normalizeCollisionObstacle({
          id: 'door-wall-top',
          pos: { x: 2500, y: 1300 },
          radius: 0,
          body: rectBody(140, 1000, { layer: 'wall', blocksMovement: true, blocksProjectiles: true, feedback: { label: 'top wall' } })
        }),
        normalizeCollisionObstacle({
          id: 'door-wall-bottom',
          pos: { x: 2500, y: 2850 },
          radius: 0,
          body: rectBody(140, 900, { layer: 'wall', blocksMovement: true, blocksProjectiles: true, feedback: { label: 'bottom wall' } })
        })
      ]
    });
    const unit = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1200, y: 1500 }, level: 1, ctrl: { kind: 'none' } });
    const goal = { x: 3800, y: 1500 };

    expect(directWalkable(sim, unit.pos, goal, unit.radius), 'the straight line is blocked by the upper wall').toBe(false);
    sim.order(unit.uid, { kind: 'move', point: goal });

    let clipped = false;
    let wentThroughDoorBand = false;
    for (let i = 0; i < 900; i++) {
      sim.tick();
      clipped = clipped || sim.obstacles.some((o) => !obstacleClearance(o, unit.pos, unit.radius));
      wentThroughDoorBand = wentThroughDoorBand || (unit.pos.x > 2420 && unit.pos.x < 2580 && unit.pos.y > 1800 && unit.pos.y < 2400);
      if (unit.order.kind === 'stop') break;
    }

    expect(clipped).toBe(false);
    expect(wentThroughDoorBand, 'path should pass through the authored doorway gap').toBe(true);
    expect(unit.order.kind).toBe('stop');
    expect(dist(unit.pos, goal)).toBeLessThan(80);
  });

  it('sanitizes player move clicks out of overlapping rect/capsule scenery and map bounds', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const u = g.activeUnit()!;
    u.pos = { x: 220, y: 220 };
    u.prevPos = { ...u.pos };
    const sim = g.sim;
    sim.obstacles.push(
      normalizeCollisionObstacle({
        id: 'overlap-building',
        pos: { x: 120, y: 120 },
        radius: 0,
        body: rectBody(280, 220, { layer: 'static', blocksMovement: true, feedback: { label: 'overlap building' } })
      }),
      normalizeCollisionObstacle({
        id: 'overlap-fence',
        pos: { x: 245, y: 135 },
        radius: 0,
        body: capsuleBody(170, 32, { layer: 'wall', blocksMovement: true, feedback: { label: 'overlap fence' } })
      })
    );

    const nearest = (g as unknown as { nearestWalkablePoint: (sim: Sim, u: Unit, point: Vec2) => Vec2 }).nearestWalkablePoint.bind(g);
    const unsafeClick = { x: -250, y: 120 };
    const safe = nearest(sim, u, unsafeClick);

    expect(safe.x).toBeGreaterThanOrEqual(u.radius);
    expect(safe.y).toBeGreaterThanOrEqual(u.radius);
    for (const obstacle of sim.obstacles) {
      expect(obstacleClearance(obstacle, safe, u.radius + 10), `${obstacle.id} still contains sanitized click`).toBe(true);
    }
  });

  it('keeps raid boss movement bodies smaller than their target/pick bodies', () => {
    const party: MacroHeroSetup[] = ['juggernaut', 'sven', 'sniper', 'lich', 'crystal-maiden'].map((heroId) => ({ heroId, level: 30 }));
    const raid = new LiveRaid(REG.raid('roshan-pit'), party, 'normal', 91002);
    const boss = raid.boss;
    const driver = raid.claimDriver()!;
    boss.ctrl = { kind: 'none' };
    driver.ctrl = { kind: 'none' };

    expect(boss.footprintDecoupled).toBe(true);
    expect(unitTargetRadius(boss)).toBeGreaterThan(boss.radius);
    expect(unitPickRadius(boss)).toBeGreaterThan(unitTargetRadius(boss));

    driver.pos = { x: boss.pos.x - (boss.radius + driver.radius - 12), y: boss.pos.y };
    for (let i = 0; i < 12; i++) resolveCollisions(raid.sim, driver);
    const movementDistance = dist(driver.pos, boss.pos);

    expect(movementDistance).toBeGreaterThanOrEqual(boss.radius + driver.radius - 0.5);
    expect(movementDistance).toBeLessThan(unitTargetRadius(boss) + driver.radius);
  });

  it('keeps live raid player orders out of a large boss body while still acquiring the boss', () => {
    const g = Game.headless(fullPartySave());
    expect(g.startLiveRaid('roshan-pit', 'normal')).toBe(true);
    const raid = g.liveRaid!;
    const boss = raid.boss;
    boss.ctrl = { kind: 'none' };
    const driver = raid.claimDriver()!;
    driver.pos = { x: boss.pos.x - 900, y: boss.pos.y };
    driver.prevPos = { ...driver.pos };
    driver.facing = 0;

    g.orderMove({ ...boss.pos }, false, false);
    let minDistance = Infinity;
    for (let i = 0; i < 180; i++) {
      g.update(1 / 30);
      minDistance = Math.min(minDistance, dist(driver.pos, boss.pos));
    }
    expect(minDistance).toBeGreaterThanOrEqual(boss.radius + driver.radius - 4);

    g.orderAttack(boss.uid);
    for (let i = 0; i < 120; i++) g.update(1 / 30);
    expect(['attack-unit', 'stop', 'hold']).toContain(driver.order.kind);
    expect(driver.attackTargetUid === boss.uid || driver.windupTargetUid === boss.uid || driver.order.kind === 'attack-unit').toBe(true);
  });
});
