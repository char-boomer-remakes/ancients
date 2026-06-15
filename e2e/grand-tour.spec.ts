import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  attachElementScreenshot,
  attachScreenshot,
  boot,
  expectNoPageErrors,
  expectPartyWellFormed,
  skipActiveCinematic,
  waitForPlayableUi,
  watchPageErrors
} from './helpers';

// ---------------------------------------------------------------------------
// GRAND TOUR — a creative, exploratory QA sweep through the LIVE WebGL build.
//
// The targeted specs prove individual contracts; this one plays the game like a
// curious human would and snapshots what it sees: it walks the overworld, audits
// the authored GLB rigs + their textures on the live scene, stress-tests the
// collision solver with a ring of boulders, fights and hot-swaps heroes mid-pack,
// flips to night, drops into a dungeon, and bursts a raid boss. Every stage takes
// a screenshot and asserts the world stayed finite, on-rails, and error-free.
//
// Everything drives through window.__game / window.__test (the ?test harness),
// the same surface the rest of e2e uses. Real renderer (SwiftShader in CI), real
// HUD, real input.
// ---------------------------------------------------------------------------

const WORLD_SCALE = 100;

// A solid, movement-blocking circle obstacle in the live sim's own normalized
// shape (mirrors normalizeCollisionObstacle), injected straight into g.sim.
const INJECT_BLOCKER = `(function (sim, x, y, radius, id) {
  const o = {
    pos: { x: x, y: y },
    radius: radius,
    id: id,
    source: 'grand-tour.spec',
    body: {
      layer: 'static',
      shape: { kind: 'circle', radius: radius },
      blocksMovement: true,
      blocksProjectiles: false,
      blocksVision: false,
      feedback: { stopSound: 'stone', impactVfx: 'dust', label: id }
    }
  };
  sim.obstacles.push(o);
  return o;
})`;

interface GlbAudit {
  units: number;
  authoredUnits: number;
  authoredMeshes: number;
  texturedMeshes: number;
  texturedUnits: number;
  triangles: number;
  sampleTextureDims: string[];
  perUnit: { heroId: string; authored: boolean; textured: boolean; meshes: number }[];
  assets: {
    gpuTextureBytes: number;
    modelCacheSize: number;
    model: { requests: number; failures: number };
    texture: { requests: number; failures: number };
  } | null;
}

/** Walk the live scene's unit views for mounted authored GLBs + bound textures. */
async function glbAudit(page: Page): Promise<GlbAudit> {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const test = (window as any).__test;
    const views = g?.scene?.views as Map<number, any> | undefined;
    const assets = test?.perfStats?.()?.assets ?? null;
    const out: GlbAudit = {
      units: 0, authoredUnits: 0, authoredMeshes: 0, texturedMeshes: 0, texturedUnits: 0,
      triangles: 0, sampleTextureDims: [], perUnit: [],
      assets: assets && {
        gpuTextureBytes: assets.gpuTextureBytes,
        modelCacheSize: assets.modelCacheSize,
        model: { requests: assets.model.requests, failures: assets.model.failures },
        texture: { requests: assets.texture.requests, failures: assets.texture.failures }
      }
    };
    if (!views) return out;
    const triOf = (geo: any): number => {
      if (!geo) return 0;
      if (geo.index) return geo.index.count / 3;
      const pos = geo.attributes?.position;
      return pos ? pos.count / 3 : 0;
    };
    for (const [uid, view] of views) {
      out.units++;
      const unit = g.sim?.unit?.(uid);
      const heroId = unit?.heroId ?? unit?.creepId ?? unit?.kind ?? String(uid);
      const model = view?.rig?.authoredModel;
      let meshes = 0;
      let textured = false;
      if (model) {
        out.authoredUnits++;
        model.traverse((o: any) => {
          if (!o.isMesh || !o.material) return;
          meshes++;
          out.authoredMeshes++;
          out.triangles += triOf(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m && m.map && m.map.image) {
              out.texturedMeshes++;
              textured = true;
              const img = m.map.image;
              const dim = `${img.width ?? img.naturalWidth ?? 0}x${img.height ?? img.naturalHeight ?? 0}`;
              if (out.sampleTextureDims.length < 6) out.sampleTextureDims.push(dim);
            }
          }
        });
        if (textured) out.texturedUnits++;
      }
      out.perUnit.push({ heroId, authored: Boolean(model), textured, meshes });
    }
    return out;
  });
}

/**
 * Let the real-renderer rAF loop paint the current stepped sim state, then snap.
 *
 * Screenshots here are exploratory diagnostics, not the test contract — the
 * assertions are. Under a saturated software-GL host (e.g. another WebGL suite
 * running in parallel) a canvas capture can miss its stability window; we record
 * that as an annotation and keep going rather than failing an otherwise-green
 * gameplay journey on a renderer-capture hiccup.
 */
async function paintAndShoot(page: Page, testInfo: TestInfo, name: string, target?: string): Promise<void> {
  await page.evaluate(() => (window as any).__test.step(33));
  await page.waitForTimeout(260); // give rAF a couple of frames to composite
  try {
    if (target) await attachElementScreenshot(page, testInfo, name, target);
    else await attachScreenshot(page, testInfo, name);
  } catch (err) {
    testInfo.annotations.push({ type: 'screenshot-skipped', description: `${name}: ${String(err).split('\n')[0]}` });
  }
}

test.describe('grand tour — creative QA sweep @visual', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('overworld: GLB + texture audit, collision ring, combat hot-swap, day→night', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    const errors = watchPageErrors(page);

    // 'high' forces the party-model preload chain (main.ts gates it on tier !== 'low'),
    // so the starter's authored GLB is warm and the scene is at full fidelity.
    await boot(page, { webgl: true, hero: 'juggernaut', region: 'icewrack', seed: 90210, quality: 'high' });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);

    // Field a varied party so the swap stage has real heroes to tag between.
    await page.evaluate(() => (window as any).__test.fillParty({ heroIds: ['earthshaker', 'lich', 'luna', 'sven'], level: 18 }));
    await skipActiveCinematic(page);

    // Stream the authored rigs in: drive a few frames until the starter's GLB lands.
    let audit = await glbAudit(page);
    await expect.poll(async () => {
      await page.evaluate(() => (window as any).__test.step(33));
      audit = await glbAudit(page);
      return audit.authoredUnits > 0 && audit.texturedMeshes > 0;
    }, { timeout: 90_000, intervals: [300] }).toBe(true);

    await paintAndShoot(page, testInfo, 'tour-01-overworld-follow');

    // --- GLB / texture audit: report what actually mounted on the live rigs. ---
    testInfo.annotations.push({ type: 'glb-audit', description: JSON.stringify({
      units: audit.units,
      authoredUnits: audit.authoredUnits,
      texturedUnits: audit.texturedUnits,
      authoredMeshes: audit.authoredMeshes,
      texturedMeshes: audit.texturedMeshes,
      triangles: Math.round(audit.triangles),
      sampleTextureDims: audit.sampleTextureDims,
      assets: audit.assets
    }) });
    await testInfo.attach('glb-audit.json', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });

    expect(audit.authoredUnits, 'units with an authored GLB mounted').toBeGreaterThan(0);
    expect(audit.texturedMeshes, 'authored meshes carrying a texture map').toBeGreaterThan(0);
    expect(audit.triangles, 'authored triangles on the live rigs').toBeGreaterThan(0);
    expect(audit.assets, 'asset cache stats available in WebGL mode').not.toBeNull();
    expect(audit.assets!.model.failures, 'GLB model load failures').toBe(0);
    expect(audit.assets!.texture.failures, 'texture load failures').toBe(0);
    expect(audit.assets!.gpuTextureBytes, 'GPU texture memory uploaded').toBeGreaterThan(0);

    // --- Top-down map camera, for a different read on the same scene. ---
    await page.evaluate(() => (window as any).__game.scene.toggleCameraMode());
    await paintAndShoot(page, testInfo, 'tour-02-overworld-topdown');
    await page.evaluate(() => {
      const g = (window as any).__game;
      // back to follow cam for the rest of the tour
      if (g.scene.cameraMode === 'map') g.scene.toggleCameraMode();
    });

    // --- Collision ring: box the hero in with boulders and shove through them. ---
    const collision = await page.evaluate((injectSrc) => {
      const inject = eval(injectSrc) as (sim: any, x: number, y: number, r: number, id: string) => any;
      const t = (window as any).__test;
      const g = (window as any).__game;
      const start = { x: 5200, y: 5200 };
      t.teleportActive(start.x, start.y);
      const u = g.controlledUnit();
      const radius = 130;
      const ringR = 360;
      const blockers: { x: number; y: number }[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = { x: start.x + Math.cos(a) * ringR, y: start.y + Math.sin(a) * ringR };
        inject(g.sim, b.x, b.y, radius, 'tour-ring-' + i);
        blockers.push(b);
      }
      // Try to barge straight out through the ring in several directions.
      const heroR = u.radius;
      let penetrations = 0;
      let minClear = Infinity;
      let maxDelta = 0; // rendered-feet vs terrain height drift
      const targets = [
        { x: start.x + 1600, y: start.y },
        { x: start.x, y: start.y + 1600 },
        { x: start.x - 1600, y: start.y - 1200 }
      ];
      for (const target of targets) {
        g.orderMove(target);
        for (let i = 0; i < 80; i++) {
          t.step(33);
          const p = g.controlledUnit().pos;
          for (const b of blockers) {
            const d = Math.hypot(p.x - b.x, p.y - b.y);
            const clear = d - (radius + heroR);
            if (clear < minClear) minClear = clear;
            if (d < radius + heroR - 2) penetrations++;
          }
          const view = g.scene.views?.get(g.controlledUnit().uid);
          if (view) {
            const rootY = view.rig.root.position.y;
            const ground = g.scene.groundHeightAt(p.x, p.y);
            const expected = ground + ((g.controlledUnit().renderHeight ?? 0) / 100);
            maxDelta = Math.max(maxDelta, Math.abs(rootY - expected));
          }
        }
      }
      const end = g.controlledUnit().pos;
      return {
        penetrations,
        minClear,
        maxDelta,
        movedFromStart: Math.hypot(end.x - start.x, end.y - start.y),
        finite: Number.isFinite(end.x) && Number.isFinite(end.y),
        inBounds: end.x >= 0 && end.y >= 0 && end.x <= g.sim.bounds.w && end.y <= g.sim.bounds.h
      };
    }, INJECT_BLOCKER);

    await paintAndShoot(page, testInfo, 'tour-03-collision-ring');
    testInfo.annotations.push({ type: 'collision', description: JSON.stringify(collision) });
    expect(collision.finite).toBe(true);
    expect(collision.inBounds).toBe(true);
    expect(collision.penetrations, 'hero never clipped inside a boulder body').toBe(0);
    expect(collision.maxDelta, 'rendered feet stayed pinned to terrain height').toBeLessThan(0.6);

    // --- Combat: spawn a pack and attack-move into it. ---
    await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addXp(120_000);
      t.healParty();
      const hero = g.activeUnit();
      hero.hp = hero.stats.maxHp;
      t.spawnWildCreepNearActive({ count: 6 });
      g.orderAttackMove({ x: hero.pos.x + 500, y: hero.pos.y });
    });
    for (let i = 0; i < 4; i++) await page.evaluate(() => (window as any).__test.step(33));
    await paintAndShoot(page, testInfo, 'tour-04-combat-melee');
    await expectPartyWellFormed(page, 'after melee');

    // --- Hot-swap mid-combat: tag in Earthshaker; expect the tag-in cue/boon. ---
    const swap = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      g.sim.events.captureAll = true;
      g.settings.resonance = true;
      const a = g.activeUnit();
      if (a) a.lastEnemyDamageAt = g.sim.time;
      const esIdx = g.party.findIndex((r: any) => r.heroId === 'earthshaker');
      const before = g.activeIdx;
      const swapped = esIdx >= 0 ? g.trySwap(esIdx) : false;
      let heroTags = 0;
      for (let i = 0; i < 10; i++) {
        t.step(33);
        heroTags += (g.frameEvents ?? []).filter((e: any) => e.t === 'hero-tag').length;
      }
      const tagBoons = g.sim.events.history.filter((e: any) => e.t === 'tag-boon' && e.when === 'tag-in').length;
      return { before, esIdx, swapped, activeIdx: g.activeIdx, heroTags, tagBoons };
    });
    await paintAndShoot(page, testInfo, 'tour-05-swap-tagin');
    testInfo.annotations.push({ type: 'swap', description: JSON.stringify(swap) });
    if (swap.esIdx >= 0) {
      expect(swap.swapped, 'swap to Earthshaker took').toBe(true);
      expect(swap.activeIdx, 'active hero is now Earthshaker').toBe(swap.esIdx);
      expect(swap.heroTags + swap.tagBoons, 'a tag-in cue or boon fired').toBeGreaterThan(0);
    }
    await expectPartyWellFormed(page, 'after swap');

    // --- Day → night: push the clock past dusk and let the lighting settle. ---
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.dayTime = 0.66; // past 0.5 → night
      for (let i = 0; i < 40; i++) (window as any).__test.step(33); // ease sun/sky/IBL toward night
    });
    await page.waitForTimeout(300);
    const night = await page.evaluate(() => (window as any).__test.state().isNight);
    await attachScreenshot(page, testInfo, 'tour-06-overworld-night');
    expect(night, 'world flipped to night').toBe(true);

    await expectPartyWellFormed(page, 'end of overworld tour');
    expectNoPageErrors(errors);
  });

  test('dungeon: descend Frost Hollow, navigate room geometry without clipping', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchPageErrors(page);
    await boot(page, { webgl: true, hero: 'crystal-maiden', region: 'icewrack', seed: 73311, quality: 'low' });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);
    await page.evaluate(() => (window as any).__test.fillParty({ level: 24 }));
    await skipActiveCinematic(page);

    const entry = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const started = g.startDungeon('frost-hollow', 'normal');
      t.skipCinematics();
      for (let i = 0; i < 24; i++) { t.skipCinematics(); t.step(33); }
      const d = g.liveDungeon;
      return {
        started,
        hasDungeon: Boolean(d),
        roomType: d?.room?.type ?? null,
        depth: d?.layout?.depth ?? 0,
        obstacles: d?.sim?.obstacles?.length ?? 0
      };
    });
    expect(entry.started).toBe(true);
    expect(entry.hasDungeon).toBe(true);
    await paintAndShoot(page, testInfo, 'tour-07-dungeon-room');

    // Navigate the room: drive the driver across the floor, watch for clipping and
    // out-of-bounds, then clear and take an exit.
    const nav = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const distSeg = (p: any, a: any, b: any) => {
        const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
        const c1 = vx * wx + vy * wy, c2 = vx * vx + vy * vy;
        const tt = c2 <= 1e-9 ? 0 : Math.max(0, Math.min(1, c1 / c2));
        return Math.hypot(p.x - (a.x + vx * tt), p.y - (a.y + vy * tt));
      };
      const inside = (o: any, p: any, r: number) => {
        const s = o.body.shape;
        if (s.kind === 'circle') return Math.hypot(p.x - o.pos.x, p.y - o.pos.y) < s.radius + r - 0.5;
        if (s.kind === 'capsule') {
          const ang = s.angle ?? 0;
          const ax = o.pos.x - Math.cos(ang) * s.halfLength, ay = o.pos.y - Math.sin(ang) * s.halfLength;
          const bx = o.pos.x + Math.cos(ang) * s.halfLength, by = o.pos.y + Math.sin(ang) * s.halfLength;
          return distSeg(p, { x: ax, y: ay }, { x: bx, y: by }) < s.radius + r - 0.5;
        }
        const ang = -(s.angle ?? 0), c = Math.cos(ang), si = Math.sin(ang);
        const dx = p.x - o.pos.x, dy = p.y - o.pos.y;
        const lx = dx * c - dy * si, ly = dx * si + dy * c;
        const ox = Math.max(Math.abs(lx) - s.width / 2, 0), oy = Math.max(Math.abs(ly) - s.depth / 2, 0);
        return (ox === 0 && oy === 0) || Math.hypot(ox, oy) < r - 0.5;
      };
      const d = g.liveDungeon;
      const driver = d.drivenUnit();
      const start = { ...driver.pos };
      let clipped = false, inBounds = true, moved = 0;
      g.orderMove({ x: d.sim.bounds.w - 200, y: d.sim.bounds.h - 200 });
      for (let i = 0; i < 200; i++) {
        t.step(33);
        const p = driver.pos;
        moved = Math.max(moved, Math.hypot(p.x - start.x, p.y - start.y));
        inBounds = inBounds && p.x >= driver.radius && p.y >= driver.radius && p.x <= d.sim.bounds.w - driver.radius && p.y <= d.sim.bounds.h - driver.radius;
        clipped = clipped || d.sim.obstacles.some((o: any) => inside(o, p, driver.radius));
      }
      for (let i = 0; i < 80 && !d.exitsUnlocked(); i++) { t.clearHostiles(); t.fastForward(0.25); }
      const beforeRoom = d.room.index;
      const exits = d.availableExits?.() ?? [];
      const exitTaken = exits.length > 0 ? g.chooseDungeonExit(exits[0].index) : false;
      return {
        moved, clipped, inBounds,
        beforeRoom,
        afterRoom: g.liveDungeon?.room.index ?? -1,
        exitTaken,
        finished: !g.liveDungeon
      };
    });
    testInfo.annotations.push({ type: 'dungeon-nav', description: JSON.stringify(nav) });
    expect(nav.clipped, 'driver never clipped a room obstacle').toBe(false);
    expect(nav.inBounds, 'driver stayed inside the room bounds').toBe(true);
    expect(nav.moved, 'driver actually traversed the room').toBeGreaterThan(150);
    expect(nav.exitTaken || nav.finished, 'took an exit or completed the dungeon').toBe(true);

    await page.evaluate(() => { for (let i = 0; i < 16; i++) { (window as any).__test.skipCinematics(); (window as any).__test.step(33); } });
    await paintAndShoot(page, testInfo, 'tour-08-dungeon-next-room');
    expectNoPageErrors(errors);
  });

  test('raid: drop into Roshan Pit, swap drivers, cast, and render the boss', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = watchPageErrors(page);
    await boot(page, { webgl: true, hero: 'juggernaut', seed: 53117, quality: 'low' });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);
    await page.evaluate(() => (window as any).__test.fillParty({ heroIds: ['juggernaut', 'lich', 'lina', 'sniper', 'sven'], level: 30 }));
    await skipActiveCinematic(page);

    const start = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const started = g.startLiveRaid('roshan-pit', 'normal');
      let guard = 0;
      while (g.cinematic.active && guard++ < 200) g.cinematicSkip();
      g.cinematic.clear();
      const layer = document.getElementById('cinematic-layer');
      if (layer) { layer.classList.add('hidden'); layer.innerHTML = ''; }
      for (let i = 0; i < 30; i++) { t.skipCinematics(); t.fastForward(0.1); }
      return {
        started,
        bossAlive: Boolean(g.liveRaid?.boss?.alive),
        bossName: g.liveRaid?.boss?.name ?? null,
        units: g.liveRaid?.sim?.unitsArr?.filter((u: any) => u.alive).length ?? 0
      };
    });
    expect(start.started).toBe(true);
    expect(start.bossAlive).toBe(true);
    await page.waitForTimeout(400);
    await paintAndShoot(page, testInfo, 'tour-09-raid-boss');

    const engage = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const raid = g.liveRaid;
      const boss = raid.boss;

      // claim + swap drivers (1 -> 2)
      g.orderMove({ ...boss.pos });
      const swapped = g.trySwap(1);
      const driver = g.controlledUnit();
      driver.mana = driver.stats.maxMana;

      // fire the first ready ability at the boss
      let spellId: string | null = null;
      const sim = raid.sim;
      for (let slot = 0; slot < driver.abilities.length; slot++) {
        const ab = driver.abilities[slot];
        if (!ab || ab.level <= 0 || !driver.abilityReady(slot, sim.time).ok) continue;
        const args = ab.def.targeting === 'unit-target' ? { uid: boss.uid }
          : (ab.def.targeting === 'no-target' || ab.def.targeting === 'toggle') ? {}
          : { point: { ...boss.pos } };
        g.castAbility(slot, args);
        for (let i = 0; i < 16; i++) { t.skipCinematics(); t.fastForward(0.1); }
        if (driver.abilities[slot].cooldownUntil > sim.time) { spellId = ab.def.id; break; }
      }
      g.orderAttack(boss.uid);
      for (let i = 0; i < 30; i++) { t.skipCinematics(); t.fastForward(0.1); }
      const readout = g.combatReadout();
      const perf = t.perfStats();
      return {
        swapped,
        driverHeroId: driver.heroId,
        spellId,
        bossThreatTarget: readout.bossThreat?.targetName ?? null,
        raidReadout: Boolean(readout.raid),
        drawCalls: perf.graphics?.drawCalls ?? 0,
        triangles: perf.graphics?.triangles ?? 0,
        modelRequests: perf.assets.model.requests,
        modelFailures: perf.assets.model.failures
      };
    });
    await page.waitForTimeout(300);
    await paintAndShoot(page, testInfo, 'tour-10-raid-engage');
    testInfo.annotations.push({ type: 'raid', description: JSON.stringify(engage) });

    expect(engage.swapped, 'swapped to a second raid driver').toBe(true);
    expect(engage.raidReadout, 'raid execution readout is live').toBe(true);
    expect(engage.drawCalls, 'scene is drawing real geometry').toBeGreaterThan(0);
    expect(engage.triangles).toBeGreaterThan(0);
    expect(engage.modelFailures, 'no GLB load failures in the raid').toBe(0);
    expectNoPageErrors(errors);
  });
});
