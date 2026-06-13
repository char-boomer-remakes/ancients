import { combatProfile } from './combat-profile';
import { dist2 } from './math2d';
import { pickThreatTarget } from './threat';
import { REG } from './registry';
import type { Sim } from './sim';
import type { Unit } from './unit';

// ============================================================
// Boss phase-FSM (AI_OVERHAUL §5, Layer 3). A thin outer machine —
// opening / sustained / pressure / enrage / desperation — that picks
// a target *posture* each phase. Inside a phase the boss still uses
// the shared utility scorer to choose the action (cast / cluster /
// attack); the FSM only biases *who* it commits to. The scripted
// beats in createRaidMechanicRunner stay authoritative.
//
// Variety is seeded off a fork of sim.rng (deterministic, and isolated
// so it does not perturb the global stream), so attempts differ while
// replays stay identical.
// ============================================================

export type BossPhase = 'opening' | 'sustained' | 'pressure' | 'enrage' | 'desperation';
export type BossTargetPref = 'threat' | 'healer' | 'cluster' | 'kill';

export interface BossState {
  /** raid enrage timer in seconds; once crossed the boss enters the enrage phase */
  enrageSec?: number;
  /** 0..1 opportunism: how often the boss leaves the threat target for a play */
  depth: number;
  /** last phase the plan was rolled for (so the pref is stable within a phase) */
  phase?: BossPhase;
  /** the target posture chosen for the current phase */
  pref?: BossTargetPref;
}

const CLUSTER_RADIUS = 360;

function enemyOf(sim: Sim, boss: Unit, o: Unit): boolean {
  return o.alive && o.team !== boss.team && o.kind !== 'npc' && !o.summary.untargetable && o.isVisibleTo(boss.team, sim.time);
}

/** Phase from the enrage timer and boss HP. HP sub-phases give the late fight teeth. */
export function bossPhaseOf(sim: Sim, boss: Unit): BossPhase {
  const cfg = boss.ctrl.boss;
  const hpPct = boss.hp / Math.max(1, boss.stats.maxHp);
  if (cfg?.enrageSec !== undefined && sim.time >= cfg.enrageSec) return 'enrage';
  if (hpPct <= 0.18) return 'desperation';
  if (hpPct <= 0.5) return 'pressure';
  if (hpPct >= 0.85) return 'opening';
  return 'sustained';
}

/** Seeded posture for a phase. Higher depth => more off-threat plays. Isolated rng. */
function rollPref(sim: Sim, boss: Unit, phase: BossPhase, depth: number): BossTargetPref {
  const r = sim.rng.fork(boss.uid * 131 + phaseCode(phase) * 7 + Math.floor(sim.time));
  switch (phase) {
    case 'pressure': return r.chance(depth * 0.45) ? 'healer' : 'threat';
    case 'enrage': return r.chance(depth * 0.5) ? 'cluster' : 'threat';
    case 'desperation': return r.chance(depth * 0.5) ? 'kill' : 'threat';
    default: return 'threat'; // opening / sustained: honor the threat table
  }
}

function phaseCode(p: BossPhase): number {
  return p === 'opening' ? 1 : p === 'sustained' ? 2 : p === 'pressure' ? 3 : p === 'enrage' ? 4 : 5;
}

/** Nearest enemy support: the healer the boss wants to cut off. */
function reachableHealer(sim: Sim, boss: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const o of sim.unitsArr) {
    if (!enemyOf(sim, boss, o) || o.kind !== 'hero' || !o.heroId) continue;
    if (combatProfile(o).role !== 'support') continue;
    const d = dist2(o.pos, boss.pos);
    if (d < bestD || (d === bestD && best !== null && o.uid < best.uid)) { bestD = d; best = o; }
  }
  return best;
}

/** Enemy whose neighborhood packs the most bodies: the AoE anchor. */
function clusterTarget(sim: Sim, boss: Unit): Unit | null {
  const enemies = sim.unitsArr.filter((o) => enemyOf(sim, boss, o));
  let best: Unit | null = null;
  let bestCount = -1;
  for (const c of enemies) {
    let n = 0;
    for (const o of enemies) if (dist2(o.pos, c.pos) <= CLUSTER_RADIUS * CLUSTER_RADIUS) n++;
    if (n > bestCount || (n === bestCount && best !== null && c.uid < best.uid)) { bestCount = n; best = c; }
  }
  return best;
}

/** Lowest effective-HP enemy: secure a kill. */
function killTarget(sim: Sim, boss: Unit): Unit | null {
  let best: Unit | null = null;
  let bestPct = Infinity;
  for (const o of sim.unitsArr) {
    if (!enemyOf(sim, boss, o)) continue;
    const pct = o.hp / Math.max(1, o.stats.maxHp);
    if (pct < bestPct || (pct === bestPct && best !== null && o.uid < best.uid)) { bestPct = pct; best = o; }
  }
  return best;
}

/**
 * Boss focus for this think: the threat target by default, overridden by the
 * phase posture (healer / cluster / kill) when the seeded plan calls for it.
 * The shared scorer then turns the focus into an action.
 */
export function pickBossFocus(sim: Sim, boss: Unit): Unit | null {
  const cfg = boss.ctrl.boss;
  const threatT = pickThreatTarget(sim, boss);
  if (!cfg) return threatT; // no brain configured: pure threat (unchanged behavior)

  const depth = cfg.depth;
  const phase = bossPhaseOf(sim, boss);
  if (cfg.phase !== phase) {
    cfg.phase = phase;
    cfg.pref = rollPref(sim, boss, phase, depth);
  }

  let chosen: Unit | null = null;
  if (cfg.pref === 'healer') chosen = reachableHealer(sim, boss);
  else if (cfg.pref === 'cluster') chosen = clusterTarget(sim, boss);
  else if (cfg.pref === 'kill') chosen = killTarget(sim, boss);

  return chosen ?? threatT;
}
