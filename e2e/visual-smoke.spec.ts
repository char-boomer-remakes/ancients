import { test, expect } from '@playwright/test';
import {
  attachScreenshot,
  boot,
  expectNoPageErrors,
  skipActiveCinematic,
  waitForPlayableUi,
  watchPageErrors
} from './helpers';

test.describe('visual smoke', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('captures major player-facing states @visual', async ({ page }, testInfo) => {
    const errors = watchPageErrors(page);

    await boot(page, { webgl: true, hero: 'juggernaut', seed: 2026 });
    await waitForPlayableUi(page);
    await expect(page.locator('#cinematic-layer')).toBeVisible();
    await attachScreenshot(page, testInfo, '01-cinematic-prologue');

    await skipActiveCinematic(page);
    await expect(page.locator('#cinematic-layer')).toHaveClass(/hidden/);
    await expect(page.locator('#hero-panel')).toContainText('Juggernaut');
    await attachScreenshot(page, testInfo, '02-overworld-hud');

    await page.keyboard.press('b');
    await expect(page.locator('#modal-root:not(.hidden) .modal-card')).toContainText('Shop');
    await attachScreenshot(page, testInfo, '03-town-shop');
    await page.locator('#modal-close').click();

    await page.locator('[data-open="journal"]').click();
    await expect(page.locator('#modal-root:not(.hidden) .modal-card')).toContainText('Quest Journal');
    await attachScreenshot(page, testInfo, '04-quest-journal');
    await page.locator('#modal-close').click();

    await page.locator('[data-open="codex"]').click();
    await expect(page.locator('#modal-root:not(.hidden) .modal-card')).toContainText('Compendium');
    await attachScreenshot(page, testInfo, '05-compendium');
    await page.locator('#modal-close').click();

    await boot(page, { webgl: true, region: 'icewrack', seed: 4242 });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);
    const started = await page.evaluate(() => (window as any).__game.startDungeon('frost-hollow', 'normal'));
    expect(started).toBe(true);
    await page.waitForFunction(() => Boolean((window as any).__test.state().dungeon), null, {
      timeout: 30_000
    });
    await page.evaluate(() => (window as any).__test.fastForward(0.5));
    await expect.poll(async () => (await page.evaluate(() => (window as any).__test.state().dungeon?.id))).toBe(
      'frost-hollow'
    );
    await attachScreenshot(page, testInfo, '06-frost-hollow-dungeon');

    expectNoPageErrors(errors);
  });
});
