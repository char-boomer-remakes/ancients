import { test, expect } from '@playwright/test';
import { boot, clearCinematics, expectNoPageErrors, watchPageErrors } from './helpers';

test.describe('collision and interaction journeys', () => {
  test('walks to overworld components, interacts with a chest and hero NPC, and respects map bounds', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 12001 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const walkTo = (point: { x: number; y: number }, radius = 90, steps = 900) => {
        g.orderMove(point);
        let minDist = Infinity;
        for (let i = 0; i < steps; i++) {
          t.step(33);
          const p = g.controlledUnit().pos;
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          minDist = Math.min(minDist, d);
          if (d <= radius) return { arrived: true, minDist, pos: { ...p } };
        }
        return { arrived: false, minDist, pos: { ...g.controlledUnit().pos } };
      };

      const chest = g.region.chests.find((c: any) => c.id === 'tv-chest-open-meadow');
      t.teleportActive(chest.pos.x - 650, chest.pos.y);
      const chestWalk = walkTo(chest.pos, 110);
      const openedBefore = g.openedChests.has(chest.id);
      const chestInteract = g.tryInteract();
      const openedAfter = g.openedChests.has(chest.id);

      const npc = g.sim.unitsArr.find((u: any) => u.kind === 'npc' && g.npcAt(u.uid) === 'pudge');
      t.teleportActive(npc.pos.x - 700, npc.pos.y);
      const npcWalk = walkTo(npc.pos, 130);
      g.tryRecruit(npc.uid);
      const npcTouched = Boolean(g.activeTrial || g.recruited.has('pudge') || g.pendingRecruitNpcUid === npc.uid);

      const bounds = g.sim.bounds;
      g.orderMove({ x: bounds.w + 20_000, y: -20_000 });
      const order = g.controlledUnit().order;
      for (let i = 0; i < 240; i++) t.step(33);
      const p = g.controlledUnit().pos;

      return {
        chestWalk,
        openedBefore,
        chestInteract,
        openedAfter,
        npcWalk,
        npcTouched,
        outOfBoundsOrder: order.kind === 'move' ? order.point : null,
        pos: p,
        bounds,
        finite: Number.isFinite(p.x) && Number.isFinite(p.y)
      };
    });

    expect(result.chestWalk.arrived).toBe(true);
    expect(result.openedBefore).toBe(false);
    expect(result.chestInteract).toBe(true);
    expect(result.openedAfter).toBe(true);
    expect(result.npcWalk.arrived).toBe(true);
    expect(result.npcTouched).toBe(true);
    expect(result.outOfBoundsOrder!.x).toBeLessThanOrEqual(result.bounds.w);
    expect(result.outOfBoundsOrder!.y).toBeGreaterThanOrEqual(0);
    expect(result.finite).toBe(true);
    expect(result.pos.x).toBeGreaterThanOrEqual(0);
    expect(result.pos.y).toBeGreaterThanOrEqual(0);
    expect(result.pos.x).toBeLessThanOrEqual(result.bounds.w);
    expect(result.pos.y).toBeLessThanOrEqual(result.bounds.h);
    expectNoPageErrors(errors);
  });

  test('walks to a route gate and travels through it via interact', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 12002 });
    await clearCinematics(page);

    const interacted = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const gate = g.region.gates.find((entry: any) => entry.id === 'tv-to-nw');
      g.recruited.add('pudge'); // satisfy the north-pass recruit gate; this spec is about walking + interact travel.
      t.teleportActive(gate.pos.x, gate.pos.y + 850);
      g.orderMove(gate.pos);
      for (let i = 0; i < 900; i++) {
        t.step(33);
        const p = g.controlledUnit().pos;
        if (Math.hypot(p.x - gate.pos.x, p.y - gate.pos.y) <= gate.radius * 0.7) break;
      }
      return g.tryInteract();
    });

    expect(interacted).toBe(true);
    await page.waitForFunction(() => (window as any).__test.state().regionId === 'nightsilver-woods', null, { timeout: 10_000 });
    expectNoPageErrors(errors);
  });

  test('walks to a dungeon portal, enters, navigates room geometry, and takes an exit', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'crystal-maiden', region: 'icewrack', seed: 12003 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const portal = g.region.dungeons[0];
      const distanceToSegment = (p: any, a: any, b: any) => {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = p.x - a.x;
        const wy = p.y - a.y;
        const c1 = vx * wx + vy * wy;
        const c2 = vx * vx + vy * vy;
        const t = c2 <= 1e-9 ? 0 : Math.max(0, Math.min(1, c1 / c2));
        const px = a.x + vx * t;
        const py = a.y + vy * t;
        return Math.hypot(p.x - px, p.y - py);
      };
      const insideBody = (obstacle: any, point: any, radius: number) => {
        const shape = obstacle.body.shape;
        if (shape.kind === 'circle') return Math.hypot(point.x - obstacle.pos.x, point.y - obstacle.pos.y) < shape.radius + radius - 0.5;
        if (shape.kind === 'capsule') {
          const angle = shape.angle ?? 0;
          const ax = obstacle.pos.x - Math.cos(angle) * shape.halfLength;
          const ay = obstacle.pos.y - Math.sin(angle) * shape.halfLength;
          const bx = obstacle.pos.x + Math.cos(angle) * shape.halfLength;
          const by = obstacle.pos.y + Math.sin(angle) * shape.halfLength;
          return distanceToSegment(point, { x: ax, y: ay }, { x: bx, y: by }) < shape.radius + radius - 0.5;
        }
        const angle = -(shape.angle ?? 0);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const dx = point.x - obstacle.pos.x;
        const dy = point.y - obstacle.pos.y;
        const lx = dx * c - dy * s;
        const ly = dx * s + dy * c;
        const ox = Math.max(Math.abs(lx) - shape.width / 2, 0);
        const oy = Math.max(Math.abs(ly) - shape.depth / 2, 0);
        return (ox === 0 && oy === 0) || Math.hypot(ox, oy) < radius - 0.5;
      };

      t.teleportActive(portal.pos.x, portal.pos.y - 760);
      g.orderMove(portal.pos);
      let portalArrived = false;
      for (let i = 0; i < 900; i++) {
        t.step(33);
        const p = g.controlledUnit().pos;
        if (Math.hypot(p.x - portal.pos.x, p.y - portal.pos.y) <= portal.radius * 0.7) {
          portalArrived = true;
          break;
        }
      }
      const started = g.tryInteract();
      t.skipCinematics();
      const dungeon = g.liveDungeon;
      const driver = dungeon?.drivenUnit();
      const target = dungeon && driver ? { x: dungeon.sim.bounds.w - 220, y: dungeon.sim.bounds.h / 2 } : null;
      let clipped = false;
      let inBounds = true;
      let moved = 0;
      if (dungeon && driver && target) {
        const start = { ...driver.pos };
        g.orderMove(target);
        for (let i = 0; i < 360; i++) {
          t.step(33);
          const p = driver.pos;
          moved = Math.max(moved, Math.hypot(p.x - start.x, p.y - start.y));
          inBounds = inBounds && p.x >= driver.radius && p.y >= driver.radius && p.x <= dungeon.sim.bounds.w - driver.radius && p.y <= dungeon.sim.bounds.h - driver.radius;
          clipped = clipped || dungeon.sim.obstacles.some((o: any) => insideBody(o, p, driver.radius));
        }
        for (let i = 0; i < 80 && !dungeon.exitsUnlocked(); i++) {
          t.clearHostiles();
          t.fastForward(0.25);
        }
      }
      const beforeRoom = dungeon?.room.index ?? -1;
      const exits = dungeon?.availableExits?.() ?? [];
      const exitTaken = exits.length > 0 ? g.chooseDungeonExit(exits[0].index) : false;

      return {
        portalArrived,
        started,
        hasDungeon: Boolean(dungeon),
        obstacleCount: dungeon?.sim.obstacles.length ?? 0,
        clipped,
        inBounds,
        moved,
        beforeRoom,
        afterRoom: g.liveDungeon?.room.index ?? -1,
        exitTaken
      };
    });

    expect(result.portalArrived).toBe(true);
    expect(result.started).toBe(true);
    expect(result.hasDungeon).toBe(true);
    expect(result.obstacleCount).toBeGreaterThan(0);
    expect(result.clipped).toBe(false);
    expect(result.inBounds).toBe(true);
    expect(result.moved).toBeGreaterThan(200);
    expect(result.exitTaken).toBe(true);
    expect(result.afterRoom).not.toBe(result.beforeRoom);
    expectNoPageErrors(errors);
  });

  test('walks into monsters without body overlap while attack-moving through a pack', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 12004 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const hero = g.activeUnit();
      t.addXp(80_000);
      hero.hp = hero.stats.maxHp;
      const fight = t.spawnWildCreepNearActive({ count: 5, creepId: 'kobold' });
      const hostiles = g.sim.unitsArr.filter((u: any) => u.alive && u.team !== hero.team && u.kind !== 'npc');
      for (const h of hostiles) h.ctrl = { kind: 'none' };
      const target = { x: hero.pos.x + 950, y: hero.pos.y };
      g.orderAttackMove(target);
      let overlaps = 0;
      let swings = 0;
      g.sim.events.captureAll = true;
      for (let i = 0; i < 260; i++) {
        t.step(33);
        for (const h of hostiles.filter((u: any) => u.alive)) {
          const d = Math.hypot(hero.pos.x - h.pos.x, hero.pos.y - h.pos.y);
          if (d < hero.radius + h.radius - 1.5) overlaps++;
        }
        swings = g.sim.events.history.filter((e: any) => e.t === 'attack-impact' && e.uid === hero.uid).length;
      }
      return {
        spawned: fight?.hostiles ?? 0,
        overlaps,
        swings,
        alive: hero.alive,
        finite: Number.isFinite(hero.pos.x) && Number.isFinite(hero.pos.y)
      };
    });

    expect(result.spawned).toBeGreaterThanOrEqual(5);
    expect(result.overlaps).toBe(0);
    expect(result.swings).toBeGreaterThan(0);
    expect(result.alive).toBe(true);
    expect(result.finite).toBe(true);
    expectNoPageErrors(errors);
  });

  test('walks into a raid boss: movement body blocks, larger target body still lets attacks acquire', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 12005 });
    await clearCinematics(page);
    await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }));

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const started = g.startLiveRaid('roshan-pit', 'normal');
      t.skipCinematics();
      const raid = g.liveRaid;
      const boss = raid.boss;
      boss.ctrl = { kind: 'none' };
      const driver = raid.claimDriver();
      driver.pos = { x: boss.pos.x - 900, y: boss.pos.y };
      driver.prevPos = { ...driver.pos };
      g.orderMove({ ...boss.pos });
      let minDistance = Infinity;
      for (let i = 0; i < 220; i++) {
        t.step(33);
        minDistance = Math.min(minDistance, Math.hypot(driver.pos.x - boss.pos.x, driver.pos.y - boss.pos.y));
      }
      raid.sim.events.captureAll = true;
      g.orderAttack(boss.uid);
      for (let i = 0; i < 180; i++) t.step(33);
      const attackEvents = raid.sim.events.history.filter((e: any) => (e.t === 'attack-windup' || e.t === 'attack-impact') && e.uid === driver.uid && e.target === boss.uid).length;
      return {
        started,
        movementClearance: boss.radius + driver.radius,
        targetClearance: boss.targetRadius + driver.radius,
        pickRadius: boss.pickRadius,
        minDistance,
        attackEvents,
        acquired: driver.attackTargetUid === boss.uid || driver.windupTargetUid === boss.uid || driver.order.uid === boss.uid,
        finite: Number.isFinite(driver.pos.x) && Number.isFinite(driver.pos.y)
      };
    });

    expect(result.started).toBe(true);
    expect(result.minDistance).toBeGreaterThanOrEqual(result.movementClearance - 4);
    expect(result.minDistance).toBeLessThan(result.targetClearance);
    expect(result.pickRadius).toBeGreaterThan(result.movementClearance);
    expect(result.attackEvents > 0 || result.acquired).toBe(true);
    expect(result.finite).toBe(true);
    expectNoPageErrors(errors);
  });
});
