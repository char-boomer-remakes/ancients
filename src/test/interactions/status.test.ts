import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { applyStatus } from '../../core/effects';
import { cannotAttack, cannotCast, cannotMove, isDisabled } from '../../core/status';
import { arena, ctx, dummyHero, eventsOf } from './_arena';
import type { StatusId } from '../../core/types';

// ============================================================
// §3.2 — status. The right StatusId lands as the right summary
// flag for the right duration; the disable semantics separate
// (root≠disarm, silence≠stun); status resist shortens debuffs;
// DoT ticks HP. Each apply emits status-apply (§4 presentation).
// ============================================================

beforeAll(() => registerAllContent());

function apply(sim: ReturnType<typeof arena>, caster: ReturnType<typeof dummyHero>, target: ReturnType<typeof dummyHero>, status: StatusId, dur = 3, params?: Parameters<typeof applyStatus>[5]): void {
  applyStatus(sim, caster, target, status, dur, params, ctx());
}

describe('interactions/status — summary flags per StatusId', () => {
  it('stun disables everything (move, attack, cast)', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'stun');
    expect(t.summary.stunned).toBe(true);
    expect(isDisabled(t.summary)).toBe(true);
    expect(cannotMove(t.summary) && cannotAttack(t.summary) && cannotCast(t.summary)).toBe(true);
    expect(eventsOf(sim, 'status-apply', t.uid).some((e) => e.status === 'stun')).toBe(true);
  });

  it('root stops movement but NOT attacks (cannotMove, not cannotAttack)', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'root');
    expect(t.summary.rooted).toBe(true);
    expect(cannotMove(t.summary)).toBe(true);
    expect(cannotAttack(t.summary)).toBe(false);
  });

  it('silence blocks casting only (not move, not attack)', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'silence');
    expect(t.summary.silenced).toBe(true);
    expect(cannotCast(t.summary)).toBe(true);
    expect(cannotMove(t.summary)).toBe(false);
    expect(cannotAttack(t.summary)).toBe(false);
  });

  it('disarm blocks attacks only (not cast, not move)', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'disarm');
    expect(t.summary.disarmed).toBe(true);
    expect(cannotAttack(t.summary)).toBe(true);
    expect(cannotCast(t.summary)).toBe(false);
    expect(cannotMove(t.summary)).toBe(false);
  });

  it('hex disables and forces base movement speed', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'hex');
    expect(t.summary.hexed).toBe(true);
    expect(isDisabled(t.summary)).toBe(true);
    expect(t.summary.msOverride).toBe(140);
  });

  it('slow lowers the move-slow factor without disabling', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'slow', 3, { moveSlowPct: 40 });
    expect(t.summary.moveSlowFactor).toBeLessThan(1);
    expect(isDisabled(t.summary)).toBe(false);
  });

  it('blind sets a blind percentage', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'blind', 3, { mods: { blindPct: 60 } });
    expect(t.summary.blindPct).toBeGreaterThan(0);
  });

  it('fear and taunt record the source uid', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const feared = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const taunted = dummyHero(sim, 'sven', { x: 4200, y: 4000 }, { team: 1 });
    apply(sim, c, feared, 'fear');
    apply(sim, c, taunted, 'taunt');
    expect(feared.summary.feared).toBe(c.uid);
    expect(cannotAttack(feared.summary)).toBe(true);
    expect(taunted.summary.taunted).toBe(c.uid);
  });

  it('cyclone makes the target untargetable and invulnerable', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'cyclone');
    expect(t.summary.cycloned).toBe(true);
    expect(t.summary.untargetable).toBe(true);
    expect(t.summary.invulnerable).toBe(true);
  });

  it('break, sleep, frozen, magic-immune, invis each set their flag', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'break');
    expect(t.summary.broken).toBe(true);
    apply(sim, c, t, 'sleep');
    expect(t.summary.sleeping).toBe(true);
    apply(sim, c, t, 'frozen');
    expect(t.summary.frozen).toBe(true);
    apply(sim, c, t, 'magic-immune', 5);
    expect(t.summary.magicImmune).toBe(true);

    const inv = dummyHero(sim, 'sniper', { x: 4400, y: 4000 }, { team: 1 });
    apply(sim, c, inv, 'invis', 5, { fadeTime: 0.3 });
    sim.run(0.5);
    expect(inv.summary.invisible).toBe(true);
  });

  it('buff with stat mods applies those mods to the carrier', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'sven', { x: 4000, y: 4000 }, { team: 0 });
    apply(sim, c, t, 'buff', 5, { mods: { damagePct: 50 } });
    expect(t.summary.mods.damagePct).toBeGreaterThan(0);
  });
});

describe('interactions/status — duration, resist, DoT', () => {
  it('a status expires after its duration and emits status-expire', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    apply(sim, c, t, 'stun', 1);
    sim.run(0.5);
    expect(t.summary.stunned).toBe(true);
    sim.run(0.8);
    expect(t.summary.stunned).toBe(false);
    expect(eventsOf(sim, 'status-expire', t.uid).some((e) => e.status === 'stun')).toBe(true);
  });

  it('status resist shortens a debuff: the resisted target recovers first', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const plain = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const resistant = dummyHero(sim, 'axe', { x: 4400, y: 4000 }, { team: 1 });
    resistant.permanentMods.statusResistPct = 50;
    resistant.markStatsDirty();
    resistant.refresh(sim.time);
    expect(resistant.stats.statusResistPct).toBeGreaterThan(0);

    apply(sim, c, plain, 'stun', 2);
    apply(sim, c, resistant, 'stun', 2);
    sim.run(1.2); // past the resisted 1.0s expiry, before the plain 2.0s expiry
    expect(resistant.summary.stunned).toBe(false);
    expect(plain.summary.stunned).toBe(true);
  });

  it('a DoT buff ticks HP down over time', () => {
    const sim = arena();
    const c = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const t = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const before = t.hp;
    apply(sim, c, t, 'buff', 3, { dotDps: 80, dotType: 'magical' });
    sim.run(1.5);
    expect(t.hp).toBeLessThan(before);
  });
});
