import { TUNING } from '../data/tuning';
import { combatProfile } from './combat-profile';
import { dist2 } from './math2d';
import type { Sim } from './sim';
import type { Unit } from './unit';

// ============================================================
// Threat model (AI_OVERHAUL §4). Generalized past boss-only: any
// unit whose controller carries a `threat` table accrues threat and
// can be pulled by it. Grounded in WoW threat — damage and healing
// generate threat, tanks multiply it, and an aggro ceiling (melee
// 110% / ranged 130%) keeps the target from jittering. Pure and
// deterministic; ties break by uid.
// ============================================================

export type ThreatTable = Record<number, number>;

/** Per-role threat multiplier: tanks hold aggro, supports shed a little. */
function roleThreatMult(u: Unit): number {
  const role = combatProfile(u).role;
  if (role === 'durable') return TUNING.threat.tankMult;
  if (role === 'initiator') return TUNING.threat.initiatorMult;
  if (role === 'support') return TUNING.threat.supportMult;
  return 1.0;
}

export function addThreat(table: ThreatTable, uid: number, amount: number): void {
  if (amount <= 0) return;
  table[uid] = (table[uid] ?? 0) + amount;
}

/** Highest current threat in a table, or 0 if empty. */
export function topThreat(table: ThreatTable): number {
  let top = 0;
  for (const k in table) {
    const v = table[k];
    if (v > top) top = v;
  }
  return top;
}

/**
 * Credit damage threat to `source` on `victim`'s table, if it keeps one.
 * Spells and attacks weight separately so a nuker drawing aggro is tunable.
 */
export function creditDamageThreat(victim: Unit, source: Unit, amount: number, fromAttack: boolean): void {
  const table = victim.ctrl.threat;
  if (!table || amount <= 0) return;
  const typeMult = fromAttack ? TUNING.threat.attackMult : TUNING.threat.spellMult;
  addThreat(table, source.uid, amount * typeMult * roleThreatMult(source));
}

/**
 * Credit healing threat to `healer` (SPEC §4: effective healing x0.5 to the healer).
 * Every engaged enemy that keeps a threat table and is within reach notices the heal,
 * so a pocket healer climbs the boss's table the way it would in a real raid.
 */
export function creditHealingThreat(sim: Sim, healer: Unit, effectiveHeal: number): void {
  if (effectiveHeal <= 0) return;
  const amount = effectiveHeal * TUNING.threat.healMult * roleThreatMult(healer);
  if (amount <= 0) return;
  const leash2 = TUNING.threat.healLeash * TUNING.threat.healLeash;
  for (const e of sim.unitsArr) {
    if (!e.alive || e.team === healer.team) continue;
    const table = e.ctrl.threat;
    if (!table) continue;                            // only enemies that run a threat table care
    if (dist2(e.pos, healer.pos) > leash2) continue; // out of the fight: no aggro
    addThreat(table, healer.uid, amount);
  }
}

/** Taunt sets the taunter's threat to the current top so it stays the leader after the taunt expires (WoW taunt). */
export function tauntToTop(table: ThreatTable, taunterUid: number): void {
  const top = topThreat(table);
  if ((table[taunterUid] ?? 0) < top) table[taunterUid] = top;
}

/**
 * Threat drop for vanish/save tools. Reduces this unit's entry on every active
 * threat table, leaving the table holder free to re-evaluate on its next think.
 */
export function dropThreat(sim: Sim, target: Unit, pct: number): void {
  const keep = Math.max(0, Math.min(1, 1 - pct / 100));
  for (const holder of sim.unitsArr) {
    const table = holder.ctrl.threat;
    if (!table || table[target.uid] === undefined) continue;
    table[target.uid] *= keep;
    if (table[target.uid] < 1) delete table[target.uid];
  }
}

/** Optional per-encounter decay: scale every entry toward zero. Off unless a caller opts in. */
export function decayThreat(table: ThreatTable, factor: number): void {
  if (factor >= 1) return;
  for (const k in table) {
    table[k] *= factor;
    if (table[k] < 1) delete table[k];
  }
}

function validTarget(sim: Sim, holder: Unit, t: Unit | undefined): t is Unit {
  return !!t && t.alive && t.team !== holder.team && !t.summary.untargetable && t.isVisibleTo(holder.team, sim.time);
}

/**
 * Resolve the threat-table target for `holder` (typically the boss). Prunes dead /
 * untargetable entries, then applies the aggro ceiling: the held target keeps the boss
 * unless a challenger's threat reaches it x the melee/ranged pull threshold. This is
 * what stops boss target jitter and makes the carry "ride the threat ceiling".
 */
export function pickThreatTarget(sim: Sim, holder: Unit): Unit | null {
  const table = holder.ctrl.threat;
  if (!table) return null;

  let top: Unit | null = null;
  let topVal = -Infinity;
  for (const key in table) {
    const uid = Number(key);
    const t = sim.unit(uid);
    if (!validTarget(sim, holder, t)) {
      delete table[uid];
      continue;
    }
    const v = table[uid];
    if (v > topVal || (v === topVal && top !== null && uid < top.uid)) {
      topVal = v;
      top = t;
    }
  }
  if (!top) return null;

  // hold the current target unless the leader clears the aggro ceiling
  const cur = holder.ctrl.focusUid !== undefined ? sim.unit(holder.ctrl.focusUid) : undefined;
  if (validTarget(sim, holder, cur) && table[cur.uid] !== undefined && cur.uid !== top.uid) {
    const curVal = table[cur.uid];
    const need = combatProfile(top).ranged ? TUNING.threat.rangedPull : TUNING.threat.meleePull;
    if (topVal < curVal * need) return cur; // not enough to pull aggro
  }
  return top;
}
