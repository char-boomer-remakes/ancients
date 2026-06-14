// ============================================================
// INTERACTION VERIFICATION §3.2 — shared behavioral arena.
//
// One deterministic headless arena + the helpers every per-kind
// harness reuses: synthetic effect execution through the SAME
// engine the game runs (execEffects / applyStatus), event-stream
// queries (folds in the §4 presentation contract), and boundary
// placement through the SHARED collision math (§8) so this matrix
// and COLLISION_HITBOX_SPEC assert the identical effective radius.
// ============================================================

import { Sim } from '../../core/sim';
import { REG } from '../../core/registry';
import { execEffects, type EffectCtx, type EffectPrimary } from '../../core/effects';
import { unitHitRadius, HIT_BODY_RADIUS_FACTOR } from '../../core/collision';
import type { Unit } from '../../core/unit';
import type { EffectNode, SimEvent, Team, Vec2, VfxSpec } from '../../core/types';

export const TEST_VFX: VfxSpec = { archetype: 'ground-aoe', color: '#ffffff' };

export function arena(seed = 4242): Sim {
  const sim = new Sim({ seed, bounds: { w: 8000, h: 8000 } });
  sim.events.captureAll = true;
  return sim;
}

/** Spawn a hero with full mana and no controller (so it only does what we order). */
export function dummyHero(sim: Sim, heroId: string, pos: Vec2, opts: { team?: Team; level?: number; player?: boolean } = {}): Unit {
  const u = sim.spawnHero(REG.hero(heroId), {
    team: opts.team ?? 1,
    pos,
    level: opts.level ?? 20,
    ctrl: { kind: opts.player ? 'player' : 'none' }
  });
  u.mana = 99999;
  return u;
}

export interface Snap {
  hp: number;
  mana: number;
  maxHp: number;
  pos: Vec2;
}

export function snapshot(u: Unit): Snap {
  return { hp: u.hp, mana: u.mana, maxHp: u.stats.maxHp, pos: { ...u.pos } };
}

/** A minimal EffectCtx for executing synthetic EffectNodes with literal values. */
export function ctx(overrides: Partial<EffectCtx> = {}): EffectCtx {
  return { defId: 'test', level: 1, vfx: TEST_VFX, ...overrides };
}

/** Run a synthetic effect list straight through the engine, as a cast would. */
export function exec(sim: Sim, caster: Unit, effects: EffectNode[], primary: EffectPrimary = {}, c: EffectCtx = ctx()): void {
  execEffects(sim, caster, c, effects, primary);
}

export function eventsOf<T extends SimEvent['t']>(sim: Sim, type: T, uid?: number): Extract<SimEvent, { t: T }>[] {
  return sim.events.history.filter((e): e is Extract<SimEvent, { t: T }> => {
    if (e.t !== type) return false;
    if (uid === undefined) return true;
    return (e as { uid?: number }).uid === uid;
  });
}

/**
 * Standardized effective radius for boundary placement (COLLISION_HITBOX_SPEC §5,
 * INTERACTION_VERIFICATION §3.2): authoredRadius + target.hitRadius * 0.5. One
 * number, asserted from both specs through the shared helper.
 */
export function effectiveRadius(authoredRadius: number, target: Unit): number {
  return authoredRadius + unitHitRadius(target) * HIT_BODY_RADIUS_FACTOR;
}

/** Place `target` just inside / just outside the effective radius of a center. */
export function placeInside(target: Unit, center: Vec2, authoredRadius: number): void {
  const r = effectiveRadius(authoredRadius, target) - 12;
  target.pos = { x: center.x + r, y: center.y };
  target.prevPos = { ...target.pos };
}

export function placeOutside(target: Unit, center: Vec2, authoredRadius: number): void {
  const r = effectiveRadius(authoredRadius, target) + 60;
  target.pos = { x: center.x + r, y: center.y };
  target.prevPos = { ...target.pos };
}
