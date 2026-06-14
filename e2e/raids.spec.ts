import { test, expect } from '@playwright/test';
import { boot, clearCinematics, watchPageErrors, expectNoPageErrors } from './helpers';

// Live raids (Game.startLiveRaid + LiveRaid) had no browser coverage: only the
// headless auto-resolve (runRaid) was exercised in sessions.spec. The QA plan
// calls for driving a live raid through the player-control path — swapping
// drivers, issuing orders, and adjudicating a clear — inside a real page.
test.describe('live raids', () => {
  test('a full party drives a live raid: swap drivers, order, and clear', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 53 });
    await clearCinematics(page);
    expect(await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }))).toBe(5);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const started = g.startLiveRaid('roshan-pit', 'normal');
      t.skipCinematics();
      if (!started) return { started: false } as const;

      // lazy claim: the driver runs on gambit AI until the first order
      const firstDriver = g.controlledUnit();
      const lazyGambit = firstDriver?.ctrl.kind === 'gambit';

      // swap to the second party slot
      const swapped = g.trySwap(1);
      const driver = g.controlledUnit();
      const driverUid = driver?.uid;

      // issue a move: claims player control and routes the order into the raid sim
      g.orderMove({ x: driver.pos.x + 160, y: driver.pos.y + 20 });
      const claimed = g.liveRaid.sim.unit(driverUid);
      const orderRouted = claimed?.ctrl.kind === 'player' && claimed?.order.kind === 'move';

      // fell the boss (deterministic clear) and let the loop adjudicate the result
      t.clearHostiles();
      let guard = 0;
      while (g.liveRaid && guard++ < 60) t.fastForward(0.1);

      return {
        started: true,
        lazyGambit,
        swapped,
        orderRouted,
        ended: !g.liveRaid,
        codexUnlocked: g.codexUnlocks.has('raid:roshan-pit'),
        clears: g.raidProgress['roshan-pit']?.clears ?? 0
      } as const;
    });

    expect(result.started).toBe(true);
    expect(result.lazyGambit).toBe(true);
    expect(result.swapped).toBe(true);
    expect(result.orderRouted).toBe(true);
    expect(result.ended).toBe(true);
    expect(result.codexUnlocked).toBe(true);
    expect(result.clears).toBeGreaterThanOrEqual(1);
    expectNoPageErrors(errors);
  });

  test('number keys swap drivers and town actions stay blocked mid-raid', async ({ page }) => {
    const errors = watchPageErrors(page);
    // ?hud=1 mounts the real InputController + HUD over the headless scene, so
    // keyboard routing (swap-2, shop, capture) goes through input.ts for real.
    await boot(page, { hero: 'juggernaut', seed: 54, hud: true });
    await clearCinematics(page);
    await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }));

    const setup = await page.evaluate(() => {
      const g = (window as any).__game;
      const started = g.startLiveRaid('roshan-pit', 'normal');
      (window as any).__test.skipCinematics();
      return { started, slot0: g.controlledUnit()?.uid, slot1Uid: g.liveRaid?.partyUids?.[1] };
    });
    expect(setup.started).toBe(true);

    // '2' => swap-2 => drive party slot 2 (input.ts -> trySwap -> selectLiveRaidHero)
    await page.keyboard.press('2');
    const afterSwap = await page.evaluate(() => (window as any).__game.controlledUnit()?.uid);
    expect(afterSwap).toBe(setup.slot1Uid);

    // town actions are guarded inside a live raid: these keys must not open
    // panels, leave the raid, or throw (input.ts `if (g.liveRaid) return`).
    await page.keyboard.press('b'); // shop
    await page.keyboard.press('t'); // capture
    await page.keyboard.press('g'); // interact / travel
    const stillLive = await page.evaluate(() => {
      const shop = document.querySelector('#shop, .shop-panel');
      return {
        raidActive: Boolean((window as any).__game.liveRaid),
        shopOpen: Boolean(shop && getComputedStyle(shop as Element).display !== 'none')
      };
    });
    expect(stillLive.raidActive).toBe(true);
    expect(stillLive.shopOpen).toBe(false);

    expectNoPageErrors(errors);
  });
});
