import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { runPerfHarness } from '../engine/perf-harness';

beforeAll(() => registerAllContent());

// ----------------------------------------------------------------
// Test 26: visual perf harness (Phase 6 §3.16, §6)
// The 30-unit / 200-projectile stress scene builds and steps with no
// steady-state allocation in the hot path; the frame time is recorded
// in PROGRESS.md (printed below for the record).
// ----------------------------------------------------------------
describe('visual perf harness (test 26)', () => {
  it('builds + steps a 30-unit / 200-projectile scene with no steady-state allocation', () => {
    const r = runPerfHarness({ units: 30, projectiles: 200 });
    // Recorded into PROGRESS.md → "Phase 6 perf numbers".
    console.log('[perf-harness]', JSON.stringify(r));

    expect(r.units).toBeGreaterThanOrEqual(30);
    expect(r.liveProjectiles).toBeGreaterThanOrEqual(180);

    // Headline guarantee: the projectile pool reuses objects, so the measured
    // window allocates nothing in the render hot path.
    expect(r.steadyStateAllocations).toBe(0);

    // Pooling bounds total allocations near the concurrent high-water mark.
    // Without it we'd allocate one Object3D group per spawn — thousands over
    // a multi-second run — so this ceiling proves the pool is doing its job.
    expect(r.projectileAllocations).toBeLessThanOrEqual(240);

    // A finite, recorded frame time, comfortably bounded for noisy CI.
    expect(Number.isFinite(r.avgFrameMs)).toBe(true);
    expect(r.avgFrameMs).toBeGreaterThan(0);
    expect(r.avgFrameMs).toBeLessThan(40);
  });

  it('LOD tiers the field — near units full, far units reduced/culled', () => {
    const r = runPerfHarness({ units: 30, projectiles: 120 });
    expect(r.lod.full).toBeGreaterThan(0);
    expect(r.lod.reduced + r.lod.culled).toBeGreaterThan(0);
    expect(r.lod.full + r.lod.reduced + r.lod.culled).toBe(r.units);
  });

  it('the capped voice pool never exceeds its cap under sustained casts', () => {
    const r = runPerfHarness({ units: 30, projectiles: 100, voiceCap: 5 });
    expect(r.peakVoices).toBeGreaterThan(0);
    expect(r.peakVoices).toBeLessThanOrEqual(5);
  });

  it('is deterministic — same seed yields the same sim hash', () => {
    const a = runPerfHarness({ seed: 4242, warmupFrames: 30, measureFrames: 60 });
    const b = runPerfHarness({ seed: 4242, warmupFrames: 30, measureFrames: 60 });
    expect(b.hash).toBe(a.hash);
  });
});
