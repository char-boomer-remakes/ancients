import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoPageErrors, fastForward, skipActiveCinematic, waitForPlayableUi, watchPageErrors } from './helpers';

// ============================================================
// TOAST FEEDBACK (e2e) — the visible half of the presentation bugs
// the headless sim can't see, because they live in the HUD's toast
// column (#toast-col):
//
//   - "the quest menu does not pop up for long enough / I don't know
//     where to go": combat & loot spam shoved the quest direction out
//     of the column. The fix prunes NON-quest toasts first and gives
//     quest toasts a long TTL.
//   - "rewards pop up several times" / future toasts stop showing:
//     once Game.msg() caps history at 60, a fresh toast must still
//     render. The fix keys de-dup on a stable id, not an array index.
//
// presentation-feedback.test.ts pins the Game-side contracts; this
// drives the real HUD and asserts what the player actually sees.
// ============================================================

async function focusGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__test?.state && (window as any).__game), null, { timeout: 30_000 });
  await waitForPlayableUi(page);
  await page.evaluate(() => window.focus());
}

test.describe('toast feedback', () => {
  test('a quest direction survives a burst of combat/loot toasts (not pushed off)', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 7710, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);

    // Drop a quest direction, then bury it under a flood of ordinary spam.
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.msg('Travel to the Frostvault gate to begin the trial.', 'quest');
      for (let i = 0; i < 12; i++) g.msg(`loot drop ${i}`, 'info');
    });
    await fastForward(page, 0.2); // repaint the HUD

    // The column is capped, but the quest toast must NOT be the one evicted.
    const quest = page.locator('#toast-col .toast.quest');
    await expect(quest, 'the quest direction is still on screen').toHaveCount(1);
    await expect(quest).toContainText('Frostvault');
    expect(
      await page.locator('#toast-col .toast').count(),
      'the toast column stays bounded'
    ).toBeLessThanOrEqual(6);
    expectNoPageErrors(errors);
  });

  test('a brand-new toast still renders after the 60-toast history cap', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 7711, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);

    // Overflow the history cap, then emit one more with a distinctive marker.
    await page.evaluate(() => {
      const g = (window as any).__game;
      for (let i = 0; i < 70; i++) g.msg(`spam ${i}`, 'info');
      g.msg('LATEST-AFTER-CAP', 'good');
    });
    await fastForward(page, 0.2);

    // The regression made post-cap toasts silently never render (index reuse
    // tricked the de-dup into thinking they were already shown).
    await expect(page.locator('#toast-col'), 'the newest toast still reaches the player').toContainText('LATEST-AFTER-CAP');
    expectNoPageErrors(errors);
  });
});
