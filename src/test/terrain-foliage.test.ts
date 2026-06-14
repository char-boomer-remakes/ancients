import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { planGrassTufts } from '../engine/terrain';

// GRAPHICS_SPEC §13 Phase 2 (foliage finish): the billboard grass-tuft layer.
// The mesh/texture build needs a browser, but placement is a pure function, so
// the determinism + tier/biome gating that actually matters is asserted here.

beforeAll(() => registerAllContent());

describe('grass-tuft placement (planGrassTufts)', () => {
  it('returns nothing at zero density (low tier stays tuft-free)', () => {
    const vale = REG.region('tranquil-vale');
    expect(planGrassTufts(vale, 0)).toHaveLength(0);
    expect(planGrassTufts(vale, -1)).toHaveLength(0);
  });

  it('is deterministic for a fixed region + density (no per-build drift)', () => {
    const vale = REG.region('tranquil-vale');
    const a = planGrassTufts(vale, 1);
    const b = planGrassTufts(vale, 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('scales tuft count with the quality density multiplier', () => {
    const vale = REG.region('tranquil-vale');
    const half = planGrassTufts(vale, 0.5).length;
    const full = planGrassTufts(vale, 1).length;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('keeps arid biomes far sparser than lush ones at equal density', () => {
    const grass = planGrassTufts(REG.region('tranquil-vale'), 1).length;
    const desert = planGrassTufts(REG.region('devarshi-desert'), 1).length;
    expect(desert).toBeLessThan(grass);
  });

  it('keeps tufts inside the playfield and clear of the town center', () => {
    const vale = REG.region('tranquil-vale');
    const tufts = planGrassTufts(vale, 1);
    const townR = vale.town.radius + 150;
    for (const t of tufts) {
      expect(t.x).toBeGreaterThanOrEqual(300);
      expect(t.x).toBeLessThanOrEqual(vale.size - 300);
      expect(t.y).toBeGreaterThanOrEqual(300);
      expect(t.y).toBeLessThanOrEqual(vale.size - 300);
      expect(Math.hypot(t.x - vale.town.pos.x, t.y - vale.town.pos.y)).toBeGreaterThan(townR);
    }
  });
});
