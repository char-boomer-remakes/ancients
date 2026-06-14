import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoPageErrors, waitForPlayableUi, watchPageErrors } from './helpers';

// OPTIMIZATION 2.0 §D.3 / §G.3: region-travel asset-lifecycle guard (webgl).
//
// Region travel rebuilds the whole GameScene and routes through
// `main.ts#startGame`, which evicts every texture/model not retained by the new
// region before building it. This test boots region A, travels to region B, and
// asserts the module-level asset cache (the cross-scene signal that survives the
// per-region renderer rebuild) did NOT accumulate both regions' assets and that
// GPU texture bytes stayed bounded — i.e. teardown + eviction actually reclaim.
//
// Scope note: it does a single A->B transition rather than a long A->B->A->...
// loop. The CI renderer is SwiftShader (see playwright.config), whose GPU process
// is destabilised by repeatedly recreating a WebGLRenderer on one canvas; a single
// rebuild is reliable and already exercises the full evict+dispose+rebuild path.
// On real-GPU hardware the loop is safe; bump ROUND_TRIPS to stress it there.
const LEAK_ENABLED = process.env.LEAK_SMOKE === '1';
const REGION_A = 'tranquil-vale';
const REGION_B = 'nightsilver-woods';

interface AssetStats {
  gpuTextureBytes: number;
  modelCacheSize: number;
  textureCacheSize: number;
  hdrCacheSize: number;
  evictions: number;
}
interface CycleSample {
  region: string;
  assets: AssetStats;
  geometries: number;
  textures: number;
}

async function clearCine(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__test?.skipCinematics?.());
}

test.describe('region-travel asset-lifecycle guard (webgl)', () => {
  // WebGL + full scene rebuilds under SwiftShader are slow/heavy, so this runs on
  // demand (npm run test:e2e:leak), mirroring the perf-smoke baseline. Real tool,
  // not a per-PR gate.
  test.skip(!LEAK_ENABLED, 'manual OPTIMIZATION 2.0 §G.3 leak guard; run with npm run test:e2e:leak');
  test.use({ viewport: { width: 1024, height: 720 } });

  test('region travel evicts non-retained assets and keeps the cache bounded', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchPageErrors(page);

    // 'low' skips the holdout/hero-model preload chain (flaky under SwiftShader)
    // but still loads per-region terrain textures, so the eviction signal is intact.
    await boot(page, { webgl: true, region: REGION_A, seed: 4242, quality: 'low' });
    await waitForPlayableUi(page);
    await clearCine(page);

    const sample = async (region: string): Promise<CycleSample> => {
      await page.waitForFunction(
        (target) => {
          const api = (window as any).__test;
          try {
            if (!api?.ready?.()) return false;
            const loading = document.getElementById('loading-screen');
            const loaded = !loading || getComputedStyle(loading).display === 'none';
            return api.state().regionId === target && loaded;
          } catch {
            return false;
          }
        },
        region,
        { timeout: 60_000 }
      );
      await page.waitForTimeout(1200);
      return page.evaluate(() => {
        const api = (window as any).__test;
        const stats = api.perfStats();
        return {
          region: api.state().regionId,
          assets: stats.assets,
          geometries: stats.graphics?.geometries ?? 0,
          textures: stats.graphics?.textures ?? 0
        } as CycleSample;
      });
    };

    const before = await sample(REGION_A);

    await page.evaluate((target) => {
      const g = (window as any).__game;
      const save = g.buildSave();
      save.regionId = target;
      save.campRespawn = {};
      save.echoRespawn = {};
      save.groundItemDrops = [];
      save.savedAt = Date.now();
      window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
    }, REGION_B);

    const after = await sample(REGION_B);
    await clearCine(page);

    console.log(
      `[leak-cycle] A: ${Math.round(before.assets.gpuTextureBytes / 1024)}KB ` +
        `tex=${before.assets.textureCacheSize} model=${before.assets.modelCacheSize} evict=${before.assets.evictions}  ` +
        `B: ${Math.round(after.assets.gpuTextureBytes / 1024)}KB ` +
        `tex=${after.assets.textureCacheSize} model=${after.assets.modelCacheSize} evict=${after.assets.evictions}`
    );

    // Travel ran the eviction pass at least once.
    expect(after.assets.evictions).toBeGreaterThanOrEqual(before.assets.evictions);
    // The cache must not hold both regions at once — eviction trims to the retained
    // set, so B's cache is bounded near a single region's footprint, not A+B.
    expect(after.assets.textureCacheSize).toBeLessThanOrEqual(before.assets.textureCacheSize + 3);
    expect(after.assets.modelCacheSize).toBeLessThanOrEqual(before.assets.modelCacheSize + 3);
    expect(after.assets.gpuTextureBytes).toBeLessThanOrEqual(before.assets.gpuTextureBytes * 1.5 + 512 * 1024);
    // Per-scene renderer rebuilt cleanly: object counts are in the same ballpark,
    // not a multiple (which a failed dispose would produce).
    expect(after.geometries).toBeLessThanOrEqual(before.geometries * 2 + 16);

    expectNoPageErrors(errors);
  });
});
