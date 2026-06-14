import { test, expect } from '@playwright/test';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { boot, expectNoPageErrors, skipActiveCinematic, waitForPlayableUi, watchPageErrors } from './helpers';

const PERF_ENABLED = process.env.PERF_SMOKE === '1';
const SAMPLE_SECONDS = readPositiveNumber(process.env.PERF_SMOKE_SECONDS, 60);
const WARMUP_SECONDS = readPositiveNumber(process.env.PERF_SMOKE_WARMUP_SECONDS, 3);
const UNIT_COUNTS = readUnitCounts(process.env.PERF_SMOKE_UNITS ?? '30,60');
const QUALITY = readQuality(process.env.PERF_SMOKE_QUALITY ?? 'low');
const PERF_OUTPUT = process.env.PERF_SMOKE_OUTPUT;
const RECORD_PROGRESS = process.env.PERF_SMOKE_PROGRESS === '1';

test.describe('browser perf smoke', () => {
  test.skip(!PERF_ENABLED, 'manual OPTIMIZATION 2.0 browser baseline; run with npm run test:e2e:perf');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('records graphics HUD baselines @perf', async ({ page }, testInfo) => {
    test.setTimeout((90 + (WARMUP_SECONDS + SAMPLE_SECONDS + 20) * UNIT_COUNTS.length) * 1000);
    const errors = watchPageErrors(page);
    const records: unknown[] = [];

    await boot(page, { webgl: true, debug: true, hero: 'juggernaut', seed: 2026, quality: QUALITY });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);
    await page.locator('#debug-panel [data-d-stats]').waitFor({ state: 'visible', timeout: 30_000 });

    for (const units of UNIT_COUNTS) {
      const fight = await page.evaluate((unitCount) => {
        const api = (window as any).__test;
        return api.spawnPerfFight({ units: unitCount, creepId: 'kobold', radius: 560 });
      }, units);
      expect(fight).not.toBeNull();
      expect(fight.totalUnits).toBe(units);

      await page.waitForTimeout(WARMUP_SECONDS * 1000);
      await page.evaluate(() => (window as any).__test.resetGraphicsStats());
      await page.waitForTimeout(SAMPLE_SECONDS * 1000);

      const stats = await page.evaluate(() => (window as any).__test.perfStats());
      expect(stats.graphics).not.toBeNull();
      expect(stats.graphics.frameMsP95).toBeGreaterThan(0);
      expect(stats.graphics.drawCalls).toBeGreaterThan(0);

      const record = {
        route: 'browser-perf-smoke',
        units,
        sampleSeconds: SAMPLE_SECONDS,
        warmupSeconds: WARMUP_SECONDS,
        bottleneck: classifyBottleneck(stats),
        fight,
        ...stats
      };
      records.push(record);
      const body = JSON.stringify(record, null, 2);
      await testInfo.attach(`perf-${units}-units.json`, {
        body,
        contentType: 'application/json'
      });
      console.log(
        `[perf-smoke] ${units} units: ` +
          `${stats.graphics.frameMsAvg.toFixed(1)} avg / ${stats.graphics.frameMsP95.toFixed(1)} p95 ms, ` +
          `${stats.graphics.drawCalls} draw, ${Math.round(stats.graphics.triangles / 1000)}k tri, ` +
          `${stats.graphics.textures} tex, ${stats.graphics.programs ?? '?'} programs, ` +
          `dpr ${stats.graphics.dpr.toFixed(2)}, ` +
          `assets ${formatBytes(stats.assets.loadedBytes)} / ${formatBytes(stats.assets.manifestBytes)}`
      );
    }

    const artifact = testInfo.outputPath('perf-baseline.json');
    await writeFile(artifact, JSON.stringify(records, null, 2));
    if (PERF_OUTPUT) {
      await mkdir(path.dirname(PERF_OUTPUT), { recursive: true });
      await writeFile(PERF_OUTPUT, JSON.stringify(records, null, 2));
    }
    if (RECORD_PROGRESS) {
      const lines = records.map((r) => progressLine(r as PerfRecord)).join('\n');
      await appendFile('PROGRESS.md', `\n${lines}\n`);
    }

    expectNoPageErrors(errors);
  });
});

interface PerfRecord {
  units: number;
  sampleSeconds: number;
  bottleneck: string;
  graphics: {
    frameMsAvg: number;
    frameMsP95: number;
    drawCalls: number;
    triangles: number;
    textures: number;
    programs: number | null;
    dpr: number;
    qualityTier: string;
  };
  assets: {
    loadedBytes: number;
    manifestBytes: number;
    gpuTextureBytes: number;
    modelCacheSize: number;
    textureCacheSize: number;
    hdrCacheSize: number;
  };
}

type PerfStatsLike = Pick<PerfRecord, 'graphics'>;

function readPositiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readUnitCounts(raw: string): number[] {
  const counts = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 2)
    .map((n) => Math.floor(n));
  return counts.length > 0 ? counts : [30, 60];
}

function readQuality(raw: string): 'auto' | 'low' | 'medium' | 'high' | 'ultra' {
  return ['auto', 'low', 'medium', 'high', 'ultra'].includes(raw) ? raw as 'auto' | 'low' | 'medium' | 'high' | 'ultra' : 'low';
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}

function classifyBottleneck(stats: PerfStatsLike): string {
  const g = stats.graphics;
  if (g.drawCalls >= 180) return 'draw-call/submission';
  if (g.triangles >= 650_000) return 'geometry/triangles';
  if (g.programs !== null && g.programs >= 80) return 'shader-program variety';
  if (g.frameMsP95 > 20 && g.drawCalls < 140) return 'fill-rate/post-processing likely';
  return 'within baseline envelope';
}

function progressLine(record: PerfRecord): string {
  const g = record.graphics;
  const a = record.assets;
  return `- ${new Date().toISOString().slice(0, 10)}: OPTIMIZATION 2.0 browser perf baseline: ${record.units} units for ${record.sampleSeconds}s -> ${g.frameMsAvg.toFixed(1)} avg / ${g.frameMsP95.toFixed(1)} p95 ms, ${g.drawCalls} draw, ${Math.round(g.triangles / 1000)}k tri, ${g.programs ?? '?'} programs, ${g.qualityTier} DPR ${g.dpr.toFixed(2)}, assets ${formatBytes(a.loadedBytes)} loaded (${formatBytes(a.gpuTextureBytes)} GPU tex), cache m/t/h ${a.modelCacheSize}/${a.textureCacheSize}/${a.hdrCacheSize}; classified ${record.bottleneck}.`;
}
