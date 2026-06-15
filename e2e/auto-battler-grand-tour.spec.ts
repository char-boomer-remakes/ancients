import { test, expect, type Page, type TestInfo } from '@playwright/test';
import {
  attachElementScreenshot,
  attachScreenshot,
  boot,
  clearCinematics,
  expectNoPageErrors,
  waitForPlayableUi,
  watchPageErrors
} from './helpers';

// ---------------------------------------------------------------------------
// AUTO-BATTLER GRAND TOUR — a creative, exploratory QA sweep through the LIVE
// gym fight (the macro 5v5).
//
// The targeted auto-battler spec proves the draft/commit/select/cast contracts;
// this one watches a *full* live fight play out and audits what the targeted
// spec never asserts:
//   1. (headless, fast) both sides' AI actually moves and *reacts* — it
//      repositions, re-targets, fires spells, and spends items, rather than
//      standing frozen or blowing everything on tick one. This is the heart of
//      the "the AI behaves weirdly / never uses items" complaint.
//   2. (WebGL, @visual) the authored GLB rigs mount on the macro units and stay
//      pinned to the terrain without clipping into the floor or each other.
//
// Drives through window.__game / window.__test (the ?test harness).
// ---------------------------------------------------------------------------

const MODAL_CARD = '#modal-root:not(.hidden) .modal-card';
const LIVE_GYM_BAR = '#live-gym-bar:not(.hidden)';

// Empty authored rules = "let the brain drive": every decision (which ability,
// which item, kite vs commit, save an ally) falls through to the utility scorer,
// the realistic default for a player who hasn't hand-authored gambits. An
// unconditional `attack-focus` catch-all would instead short-circuit the scorer
// and suppress all item use — exactly the trap the default gambits avoid.
const BRAIN_DRIVEN_GAMBIT: unknown[] = [];

const LOADOUTS: Record<string, string[]> = {
  juggernaut: ['black-king-bar', 'blink-dagger'],
  sven: ['black-king-bar', 'crystalys'],
  sniper: ['black-king-bar', 'dragon-lance'],
  lich: ['black-king-bar', 'glimmer-cape'],
  lina: ['black-king-bar', 'kaya'],
  zeus: ['black-king-bar', 'arcane-boots']
};

async function prepare(page: Page): Promise<void> {
  await page.evaluate((args) => {
    const { aggro, loadouts } = args;
    const t = (window as any).__test;
    const g = (window as any).__game;
    t.fillParty({ heroIds: ['sven', 'sniper', 'lich', 'lina'], level: 16 });
    g.recruitHero('zeus');
    t.skipCinematics();
    for (const rec of g.party) {
      const ids = loadouts[rec.heroId] ?? ['black-king-bar'];
      rec.items = [0, 1, 2, 3, 4, 5].map((idx: number) => (ids[idx] ? { id: ids[idx] } : null));
      rec.gambits = aggro;
      if (rec.unit) {
        rec.unit.hp = rec.unit.stats.maxHp;
        rec.unit.mana = rec.unit.stats.maxMana;
      }
    }
    g.commitGymDraft('lunar-gym', {
      heroes: ['juggernaut', 'sven', 'sniper', 'lich', 'lina'].map((heroId: string) => ({
        heroId,
        level: 16,
        items: loadouts[heroId],
        gambits: aggro
      })),
      formation: {
        placements: {
          juggernaut: { col: 3, row: 2 },
          sven: { col: 3, row: 1 },
          sniper: { col: 0, row: 3 },
          lich: { col: 0, row: 0 },
          lina: { col: 2, row: 2 }
        }
      }
    });
  }, { aggro: BRAIN_DRIVEN_GAMBIT, loadouts: LOADOUTS });
}

interface TeamBehavior {
  team: number;
  units: number;
  moversReacting: number;       // units that moved a meaningful distance
  totalMovement: number;        // summed path length across units (world units)
  distinctOrderKinds: string[]; // order kinds observed across the fight
  focusSwitches: number;        // how often AI re-targeted (reaction proxy)
  casts: number;                // ability cast events
  distinctAbilities: string[];
  itemsUsed: number;            // item-used events
  distinctItems: string[];
}

interface FightObservation {
  durationSec: number;
  endedEarly: boolean;
  perTeam: TeamBehavior[];
  anyHpNaN: boolean;
  anyPosNaN: boolean;
  worstOverlapPenetration: number; // deepest unit-vs-unit body overlap (world units)
}

/**
 * Step the live fight in small chunks, sampling AI movement, re-targeting,
 * casts, and item use for both teams. Pure sim — runs in headless render mode.
 */
async function observeFight(page: Page, durationSec: number): Promise<FightObservation> {
  return page.evaluate((seconds) => {
    const g = (window as any).__game;
    const t = (window as any).__test;
    const fight = g.liveGym;
    const sim = fight.sim;
    sim.events.captureAll = true;
    const historyStart = sim.events.history.length;

    const perUnit = new Map<number, {
      team: number;
      path: number;
      last: { x: number; y: number };
      orders: Set<string>;
      lastFocus: string | null;
      focusSwitches: number;
    }>();
    for (const u of sim.unitsArr) {
      if (u.kind !== 'hero') continue;
      perUnit.set(u.uid, { team: u.team, path: 0, last: { ...u.pos }, orders: new Set(), lastFocus: null, focusSwitches: 0 });
    }

    let anyHpNaN = false;
    let anyPosNaN = false;
    let worstOverlap = 0;
    const stepSec = 0.1;
    const samples = Math.round(seconds / stepSec);
    let endedEarly = false;
    for (let s = 0; s < samples; s++) {
      t.fastForward(stepSec);
      if (!g.liveGym) { endedEarly = true; break; }
      const heroes = sim.unitsArr.filter((u: any) => u.kind === 'hero');
      for (const u of heroes) {
        const rec = perUnit.get(u.uid);
        if (!rec) continue;
        if (!u.pos || !Number.isFinite(u.pos.x) || !Number.isFinite(u.pos.y)) { anyPosNaN = true; continue; }
        rec.path += Math.hypot(u.pos.x - rec.last.x, u.pos.y - rec.last.y);
        rec.last = { x: u.pos.x, y: u.pos.y };
        rec.orders.add(u.order?.kind ?? 'none');
        const focus = u.order?.uid ?? u.order?.targetUid ?? null;
        if (focus != null && String(focus) !== rec.lastFocus) {
          rec.focusSwitches++;
          rec.lastFocus = String(focus);
        }
        if (!Number.isFinite(u.hp)) anyHpNaN = true;
      }
      const living = heroes.filter((u: any) => u.alive);
      for (let i = 0; i < living.length; i++) {
        for (let j = i + 1; j < living.length; j++) {
          const a = living[i], b = living[j];
          const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
          const pen = (a.radius + b.radius) - d;
          if (pen > worstOverlap) worstOverlap = pen;
        }
      }
    }

    const history = sim.events.history.slice(historyStart);
    const perTeam = [0, 1].map((team) => {
      const units = [...perUnit.values()].filter((r) => r.team === team);
      const teamUids = new Set(sim.unitsArr.filter((u: any) => u.team === team).map((u: any) => u.uid));
      const casts = history.filter((e: any) => e.t === 'cast' && teamUids.has(e.uid));
      const items = history.filter((e: any) => e.t === 'item-used' && teamUids.has(e.uid));
      return {
        team,
        units: units.length,
        moversReacting: units.filter((r) => r.path > 80).length,
        totalMovement: Math.round(units.reduce((acc, r) => acc + r.path, 0)),
        distinctOrderKinds: [...new Set(units.flatMap((r) => [...r.orders]))],
        focusSwitches: units.reduce((acc, r) => acc + r.focusSwitches, 0),
        casts: casts.length,
        distinctAbilities: [...new Set(casts.map((e: any) => e.abilityId).filter(Boolean))],
        itemsUsed: items.length,
        distinctItems: [...new Set(items.map((e: any) => e.itemId).filter(Boolean))]
      } as TeamBehavior;
    });

    return {
      durationSec: seconds,
      endedEarly,
      perTeam,
      anyHpNaN,
      anyPosNaN,
      worstOverlapPenetration: Math.round(worstOverlap)
    } as FightObservation;
  }, durationSec);
}

test.describe('auto-battler grand tour — live fight QA sweep', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test('live gym AI: both sides move, re-target, cast spells, and spend items', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchPageErrors(page);
    await boot(page, { hud: true, hero: 'juggernaut', seed: 4242 });
    await clearCinematics(page);
    await prepare(page);

    await page.evaluate(() => {
      (window as any).__hud.openGymPrefight('lunar-gym');
      (window as any).__test.step();
    });
    await expect(page.locator(MODAL_CARD)).toContainText('Lunar Gym');
    await attachElementScreenshot(page, testInfo, 'abgt-01-prefight', MODAL_CARD);

    await page.evaluate(() => (document.querySelector('[data-pf="live"]') as HTMLButtonElement | null)?.click());
    await page.evaluate(() => (window as any).__test.step());
    await expect(page.locator(LIVE_GYM_BAR)).toBeVisible();

    const obs = await observeFight(page, 18);
    testInfo.annotations.push({ type: 'fight', description: JSON.stringify(obs) });
    await testInfo.attach('fight-observation.json', { body: JSON.stringify(obs, null, 2), contentType: 'application/json' });

    for (const team of obs.perTeam) {
      const label = team.team === 0 ? 'player' : 'enemy';
      expect(team.units, `${label} fielded a five`).toBe(5);
      expect(team.totalMovement, `${label} AI actually moved`).toBeGreaterThan(400);
      expect(team.moversReacting, `${label} units repositioned, not frozen`).toBeGreaterThanOrEqual(2);
      expect(team.focusSwitches, `${label} AI re-targeted (reacted to the fight)`).toBeGreaterThan(0);
      expect(team.casts, `${label} AI fired spells`).toBeGreaterThan(0);
    }

    // Intelligent item use: at least one side spends an item during the fight.
    const totalItems = obs.perTeam.reduce((acc, t) => acc + t.itemsUsed, 0);
    expect(totalItems, 'AI spent at least one item in the fight').toBeGreaterThan(0);

    // Sanity / corruption gates.
    expect(obs.anyHpNaN, 'no NaN HP leaked into the fight').toBe(false);
    expect(obs.anyPosNaN, 'no NaN position leaked into the fight').toBe(false);
    expect(obs.worstOverlapPenetration, 'units did not stack on one cell').toBeLessThan(70);

    expectNoPageErrors(errors);
  });

  test('live gym render: authored rigs mount and stay pinned to terrain @visual', async ({ page }, testInfo) => {
    test.setTimeout(220_000);
    const errors = watchPageErrors(page);
    await boot(page, { webgl: true, hud: true, hero: 'juggernaut', seed: 4243, quality: 'low' });
    await waitForPlayableUi(page);
    await clearCinematics(page);
    await prepare(page);

    await page.evaluate(() => {
      (window as any).__hud.openGymPrefight('lunar-gym');
      (window as any).__test.step();
    });
    await page.evaluate(() => (document.querySelector('[data-pf="live"]') as HTMLButtonElement | null)?.click());
    await page.waitForFunction(() => !document.querySelector('#live-gym-bar.hidden'), null, { timeout: 60_000 });
    await page.evaluate(() => (window as any).__test.fastForward(0.5));

    // Let the rigs stream in and the fight develop a few frames.
    let audit = await rigAudit(page);
    await expect.poll(async () => {
      await page.evaluate(() => (window as any).__test.fastForward(0.4));
      audit = await rigAudit(page);
      return audit.authoredRigs > 0;
    }, { timeout: 120_000, intervals: [500] }).toBe(true);

    await attachElementScreenshot(page, testInfo, 'abgt-10-live-render', '#game-canvas');
    await attachScreenshot(page, testInfo, 'abgt-11-live-full');

    testInfo.annotations.push({ type: 'rig-audit', description: JSON.stringify(audit) });
    await testInfo.attach('rig-audit.json', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });

    expect(audit.auditedViews, 'gym units have live scene views').toBeGreaterThan(0);
    expect(audit.authoredRigs, 'authored GLB rigs mounted on macro units').toBeGreaterThan(0);
    expect(audit.maxGroundDelta, 'rendered feet stayed pinned to terrain').toBeLessThan(0.8);
    expect(audit.belowGround, 'no rig sank beneath the floor').toBe(0);
    if (audit.graphics) {
      expect(audit.graphics.drawCalls, 'scene is drawing real geometry').toBeGreaterThan(0);
      expect(audit.graphics.triangles).toBeGreaterThan(0);
    }
    expect(audit.modelFailures, 'no GLB load failures in the gym').toBe(0);
    expectNoPageErrors(errors);
  });
});

interface RigAudit {
  auditedViews: number;
  authoredRigs: number;
  texturedRigs: number;
  maxGroundDelta: number;
  belowGround: number;
  graphics: { drawCalls: number; triangles: number } | null;
  modelFailures: number;
}

async function rigAudit(page: Page): Promise<RigAudit> {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const t = (window as any).__test;
    const sim = g.liveGym?.sim ?? g.sim;
    const views = g.scene?.views as Map<number, any> | undefined;
    let auditedViews = 0, authoredRigs = 0, texturedRigs = 0, maxGroundDelta = 0, belowGround = 0;
    if (views) {
      for (const [uid, view] of views) {
        const u = sim.unit?.(uid);
        if (!u || u.kind !== 'hero') continue;
        const root = view?.rig?.root;
        // Off-screen units early-return in updateView before their Y is pinned, so
        // their rigs hold a stale/origin position. Only audit on-screen, placed rigs.
        const onScreen = !!root && root.visible && root.position.lengthSq() > 0;
        if (!onScreen) continue;
        auditedViews++;
        if (view?.rig?.authoredModel) {
          authoredRigs++;
          let textured = false;
          view.rig.authoredModel.traverse((o: any) => {
            if (!o.isMesh || !o.material) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) if (m && m.map && m.map.image) textured = true;
          });
          if (textured) texturedRigs++;
        }
        if (typeof root.position.y === 'number' && g.scene.groundHeightAt) {
          // Sample terrain at the rig's *rendered* (smoothed) position, exactly as
          // the renderer does — sampling at the lagging sim position instead would
          // read slope*lerp drift as a phantom float. The real clipping question is
          // whether the rendered feet ever sink beneath the floor they stand on.
          const ground = g.scene.groundHeightAt(root.position.x * 100, root.position.z * 100);
          const expected = ground + ((u.renderHeight ?? 0) / 100);
          maxGroundDelta = Math.max(maxGroundDelta, Math.abs(root.position.y - expected));
          if (root.position.y < ground - 0.25) belowGround++;
        }
      }
    }
    const perf = t.perfStats ? t.perfStats() : null;
    return {
      auditedViews, authoredRigs, texturedRigs, maxGroundDelta, belowGround,
      graphics: perf?.graphics ? { drawCalls: perf.graphics.drawCalls, triangles: perf.graphics.triangles } : null,
      modelFailures: perf?.assets?.model?.failures ?? 0
    } as RigAudit;
  });
}
