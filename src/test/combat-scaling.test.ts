import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { creepCombatTier } from '../core/phase3';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';

beforeAll(() => registerAllContent());

describe('Gameplay 2.0 combat scaling', () => {
  it('maps region depth to overworld creep combat tier', () => {
    expect(creepCombatTier('tranquil-vale')).toBe('normal');
    expect(creepCombatTier('shadeshore')).toBe('nightmare');
    expect(creepCombatTier('mad-moon-crater')).toBe('hell');
  });

  it('scales wild creep durability and damage by region and tier', () => {
    const def = REG.creep('hellbear');
    const baseSim = new Sim({ seed: 1, bounds: { w: 3000, h: 3000 } });
    const lateSim = new Sim({ seed: 1, bounds: { w: 3000, h: 3000 } });

    const base = baseSim.spawnCreep(def, { team: 1, pos: { x: 500, y: 500 }, wild: true });
    const late = lateSim.spawnCreep(def, {
      team: 1,
      pos: { x: 500, y: 500 },
      wild: true,
      regionId: 'mad-moon-crater',
      combatTier: 'hell'
    });

    expect(late.stats.maxHp).toBeGreaterThan(base.stats.maxHp * 8);
    expect(late.stats.damage).toBeGreaterThan(base.stats.damage * 4);
    expect(late.stats.maxHp).toBeCloseTo(base.stats.maxHp * TUNING.creepCombatScale.hpByRegion['mad-moon-crater'] * TUNING.creepCombatScale.tier.hell, 0);
  });
});
