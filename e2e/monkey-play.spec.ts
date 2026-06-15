import { test, expect } from '@playwright/test';
import {
  boot,
  clearCinematics,
  state,
  fastForward,
  expectPartyWellFormed,
  watchPageErrors,
  expectNoPageErrors
} from './helpers';

// ============================================================
// RED / BLUE / PURPLE TEAM — live, in-browser chaos play.
//
// The headless unit monkey (src/test/gameplay-monkey.test.ts) proves the
// Game core survives random input. These specs prove the SAME holds when
// the real loop is running in a real page: input routing, presentation
// events, the HUD-facing verbs, ground loot, quests, and region travel.
//
// Each spec watches page errors and the live party invariants so a crash
// or a corrupt unit fails loudly with the seed that produced it.
// ============================================================

test.describe('monkey play (live)', () => {
  test('a keyboard-masher never crashes the page or corrupts the party', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 4242 });
    await clearCinematics(page);
    await page.evaluate(() => {
      const t = (window as any).__test;
      t.fillParty({ level: 25 });
      t.addGold(200_000);
      t.healParty();
    });

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;

      // tiny seeded PRNG so a failure replays deterministically
      let s = 0x9e3779b9 >>> 0;
      const rnd = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let x = Math.imul(s ^ (s >>> 15), 1 | s);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
      const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
      const pt = (wild: boolean) => {
        const u = g.activeUnit();
        const b = g.sim.bounds;
        if (wild) return { x: -60_000 + rnd() * (b.w + 120_000), y: -60_000 + rnd() * (b.h + 120_000) };
        const base = u ? u.pos : { x: b.w / 2, y: b.h / 2 };
        return { x: base.x + (rnd() - 0.5) * 3000, y: base.y + (rnd() - 0.5) * 3000 };
      };
      const uid = () => {
        const arr = g.sim.unitsArr;
        if (!arr.length || rnd() < 0.2) return ri(-5, 9999);
        return arr[ri(0, arr.length - 1)].uid;
      };

      const actions: { name: string; run: () => void }[] = [
        { name: 'orderMove', run: () => g.orderMove(pt(rnd() < 0.3)) },
        { name: 'orderAttackMove', run: () => g.orderAttackMove(pt(rnd() < 0.3)) },
        { name: 'orderStop', run: () => g.orderStop() },
        { name: 'orderAttack', run: () => g.orderAttack(uid()) },
        { name: 'castAbility', run: () => g.castAbility(ri(0, 3), rnd() < 0.5 ? { point: pt(false) } : { uid: uid() }) },
        { name: 'useItem', run: () => g.useItem(ri(0, 5), { point: pt(false) }) },
        { name: 'sellItem', run: () => g.sellItem(ri(0, 5)) },
        { name: 'dropItem', run: () => g.dropHeroItemToGround(ri(0, 5)) },
        { name: 'moveItem', run: () => g.moveHeroItem(ri(0, 5), ri(0, 5)) },
        { name: 'levelAbility', run: () => g.levelAbility(ri(0, g.party.length - 1), ri(0, 3)) },
        { name: 'buyMastery', run: () => g.buyMasteryNode(ri(0, g.party.length - 1), ri(0, 15)) },
        { name: 'trySwap', run: () => g.trySwap(ri(0, g.party.length)) },
        { name: 'tryCapture', run: () => g.tryCapture(uid()) },
        { name: 'tryInteract', run: () => g.tryInteract(uid()) },
        { name: 'pickup', run: () => g.tryPickupGroundItem(uid()) },
        { name: 'claimQuest', run: () => { const b = g.questBoard(); if (b.length) g.claimQuest(b[ri(0, b.length - 1)].id); } },
        { name: 'spawnFight', run: () => { const r = t.spawnWildCreepNearActive({ count: ri(1, 4) }); return r; } },
        { name: 'tick', run: () => { t.skipCinematics(); t.fastForward(0.05 + rnd() * 0.15); } }
      ];

      for (let step = 0; step < 500; step++) {
        const a = actions[ri(0, actions.length - 1)];
        try {
          a.run();
        } catch (e) {
          return { ok: false, step, action: a.name, message: String((e as Error)?.message ?? e) };
        }
        if (!Number.isFinite(g.gold) || g.gold < 0) {
          return { ok: false, step, action: a.name, message: `gold corrupt ${g.gold}` };
        }
      }
      return { ok: true, step: 500, action: '', message: '' };
    });

    expect(result.ok, `monkey crashed at step ${result.step} on ${result.action}: ${result.message}`).toBe(true);
    await expectPartyWellFormed(page, 'after monkey play');
    expect((await state(page)).ready).toBe(true);
    expectNoPageErrors(errors);
  });

  test('random move-spam (including off-map) never escapes the world or NaNs the hero', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'sniper', seed: 909 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const b = g.sim.bounds;
      let worst = { x: 0, y: 0, ok: true };
      for (let i = 0; i < 40; i++) {
        // slam orders at all eight far corners and random extremes
        const corner = i % 8;
        const fx = (corner & 1 ? 1 : -1) * 99_999;
        const fy = (corner & 2 ? 1 : -1) * 99_999;
        g.orderMove({ x: corner < 4 ? fx : Math.random() * b.w, y: corner < 4 ? fy : Math.random() * b.h });
        for (let k = 0; k < 12; k++) t.step(33);
        const p = g.activeUnit().pos;
        const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= b.w && p.y <= b.h;
        if (!ok) worst = { x: p.x, y: p.y, ok: false };
      }
      const p = g.activeUnit().pos;
      return { worst, finalInBounds: p.x >= 0 && p.y >= 0 && p.x <= b.w && p.y <= b.h, alive: g.activeUnit().alive };
    });

    expect(result.worst.ok, `hero left the world at (${result.worst.x}, ${result.worst.y})`).toBe(true);
    expect(result.finalInBounds).toBe(true);
    expect(result.alive).toBe(true);
    expectNoPageErrors(errors);
  });
});

test.describe('item handling (live)', () => {
  test('dropping an item then walking back over it re-banks it (conservation)', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 71 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      t.addGold(100_000);
      t.addXp(120_000); // clear any item level-gate
      // Buy something real from this region's shop to hold.
      let bought: string | null = null;
      for (const id of g.region.shopInventory) {
        if (g.shopSells(id)) { g.buyItem(id); bought = id; break; }
      }
      const u = g.activeUnit();
      const heldBefore = u.items.filter((it: any) => it).length;

      // Drop the first held item to the ground right under the hero.
      const slot = u.items.findIndex((it: any) => it);
      const droppedId = u.items[slot]?.defId;
      const okDrop = g.dropHeroItemToGround(slot, { x: u.pos.x, y: u.pos.y });
      const heldAfterDrop = u.items.filter((it: any) => it).length;
      const onGround = g.visibleGroundItemDrops().length;

      // Walk back over it: the pending-pickup path banks it on arrival.
      const drop = g.groundItemDrops[g.groundItemDrops.length - 1];
      const picked = g.pickupGroundItem(drop.uid);
      const heldAfterPickup = u.items.filter((it: any) => it).length;

      return { bought, droppedId, okDrop, heldBefore, heldAfterDrop, onGround, picked, heldAfterPickup, hasItBack: u.items.some((it: any) => it && it.defId === droppedId) };
    });

    expect(result.bought).not.toBeNull();
    expect(result.okDrop).toBe(true);
    expect(result.heldAfterDrop).toBe(result.heldBefore - 1);
    expect(result.onGround).toBeGreaterThan(0);
    expect(result.picked).toBe(true);
    expect(result.heldAfterPickup).toBe(result.heldBefore); // conserved end-to-end
    expect(result.hasItBack).toBe(true);
    expectNoPageErrors(errors);
  });
});

test.describe('quest log (live)', () => {
  test('an unready claim is rejected; a completed bounty pays out exactly once', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 88 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      g.refreshQuests();

      // RED: a live but unfinished bounty can't be claimed.
      const before = g.questBoard();
      const unfinished = before.find((q: any) => q.status === 'active' && !q.claimable);
      const goldBeforeBad = Math.round(g.gold);
      const badClaim = unfinished ? g.claimQuest(unfinished.id) : false;
      const goldAfterBad = Math.round(g.gold);

      // Drive "Cull the Wilds" (12 wild creeps) to complete via the public quest seam.
      for (let i = 0; i < 12; i++) {
        t.advanceQuest({ kind: 'kill-creeps', amount: 1, tier: 'small', regionId: g.region.id });
      }
      const cull = g.questBoard().find((q: any) => q.id === 'bounty-cull-wilds');
      const goldBeforeGood = Math.round(g.gold);
      const goodClaim = g.claimQuest('bounty-cull-wilds');
      const goldAfterGood = Math.round(g.gold);
      // A recurring bounty re-arms with progress reset, not instantly re-claimable.
      const reclaim = g.claimQuest('bounty-cull-wilds');

      return { badClaim, goldBeforeBad, goldAfterBad, cullClaimable: cull?.claimable, goodClaim, goldBeforeGood, goldAfterGood, reclaim };
    });

    expect(result.badClaim).toBe(false);
    expect(result.goldAfterBad).toBe(result.goldBeforeBad);
    expect(result.cullClaimable).toBe(true);
    expect(result.goodClaim).toBe(true);
    expect(result.goldAfterGood).toBeGreaterThan(result.goldBeforeGood);
    expect(result.reclaim).toBe(false);
    expectNoPageErrors(errors);
  });
});

test.describe('navigation (live)', () => {
  test('descend a cave to a full clear and surface back into the overworld', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { region: 'icewrack', seed: 4242 });
    await clearCinematics(page);
    expect(await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }))).toBe(5);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const started = g.startDungeon('frost-hollow', 'normal');
      if (!started) return { started: false } as const;
      const roomsSeen = new Set<number>();
      let guard = 0;
      while (g.liveDungeon && guard++ < 400) {
        t.skipCinematics();
        g.paused = false;
        t.fastForward(0.6);
        t.clearHostiles();
        const d = g.liveDungeon;
        if (d) {
          roomsSeen.add(d.room.index);
          if (d.exitsUnlocked()) {
            const ex = d.availableExits();
            if (ex.length) g.chooseDungeonExit(ex[0].index);
          }
        }
      }
      const prog = g.dungeonProgress['frost-hollow'] ?? null;
      return { started: true, finished: !g.liveDungeon, roomsVisited: roomsSeen.size, clears: prog?.clears ?? 0, bestDepth: prog?.bestDepth ?? 0, backInTown: g.inTown() };
    });

    expect(result.started).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.roomsVisited).toBeGreaterThan(1);
    expect(result.clears).toBeGreaterThanOrEqual(1);
    expect(result.bestDepth).toBeGreaterThan(0);
    expect((await state(page)).dungeon).toBeNull();
    expectNoPageErrors(errors);
  });
});
