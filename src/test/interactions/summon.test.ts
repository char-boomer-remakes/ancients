import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { arena, ctx, dummyHero, eventsOf, exec } from './_arena';
import type { EffectNode, SummonSpec } from '../../core/types';

// ============================================================
// §3.2 — summon. The unit spawns on the caster's team with its
// declared lifespan, emits a summon event, and is gone after the
// lifetime elapses.
// ============================================================

beforeAll(() => registerAllContent());

const SPEC: SummonSpec = {
  id: 'test-wolf',
  name: 'Test Wolf',
  lifetime: 2,
  stats: { maxHp: 300, damage: 20, armor: 0, moveSpeed: 320, attackRange: 150, baseAttackTime: 1.5 },
  silhouette: { build: 'quad', scale: 0.8 },
  palette: ['#888888', '#aaaaaa', '#cccccc']
};

describe('interactions/summon', () => {
  it('spawns a unit on the caster team and emits a summon event', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const node: EffectNode = { kind: 'summon', at: 'self', summon: SPEC };
    exec(sim, caster, [node], {}, ctx());
    const summons = sim.unitsArr.filter((u) => u.kind === 'summon' && u.ownerUid === caster.uid);
    expect(summons.length).toBe(1);
    expect(summons[0].team).toBe(caster.team);
    expect(eventsOf(sim, 'summon').length).toBe(1);
  });

  it('count spawns the declared number of units', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const node: EffectNode = { kind: 'summon', at: 'self', count: 3, summon: SPEC };
    exec(sim, caster, [node], {}, ctx());
    expect(sim.unitsArr.filter((u) => u.kind === 'summon').length).toBe(3);
  });

  it('the summon expires after its lifetime', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const node: EffectNode = { kind: 'summon', at: 'self', summon: SPEC };
    exec(sim, caster, [node], {}, ctx());
    expect(sim.unitsArr.some((u) => u.kind === 'summon')).toBe(true);
    sim.run(2.5);
    expect(sim.unitsArr.some((u) => u.kind === 'summon' && u.alive)).toBe(false);
  });
});
