import type { Sim } from '../core/sim';
import type { SimEvent, Vec2 } from '../core/types';

// STORY §7.3 + §6.6 — story detectors live engine/Game-side and read the SimEvent stream
// the renderer already consumes. They never alter an event, a tick, or an outcome, so the
// determinism hash is untouched (same contract as the VFX/audio layers).

const ECHO_SLAM_ID = 'es-echo-slam';
const ECHO_SLAM_RADIUS = 650;
const PIT_RAID_ID = 'roshan-pit';
const HOOK_ID = 'pudge-meat-hook';
const AXE_CALL_ID = 'axe-berserkers-call';
const DREAM_COIL_ID = 'puck-dream-coil';
const CHEN_RECALL_PROXY_IDS = new Set(['chen-divine-favor', 'chen-hand-of-god']);
const TOWN_PORTAL_ITEM_ID = 'boots-of-travel';
const HOOK_WINDOW_SEC = 5;       // a death this long after a hook still counts as "hooked home"
const RECALL_PROXY_WINDOW_SEC = 5;
const AXE_CALL_WINDOW_SEC = 6;
const RAMPAGE_WINDOW_SEC = 8;
const FALLBACK_PHASE_BREAK_PCT = 50; // §6.6 fallback when encounter data has no authored phase threshold

export interface StoryObserveCtx {
  sim: Sim;
  nowSec: number;
  playerTeam: number;
  raidId?: string;       // set inside a raid encounter
  bossHeroId?: string;   // the boss/guardian hero in this encounter
  bossPhaseHpPct?: readonly number[]; // authored phase/mechanic thresholds for this encounter
  townPos?: Vec2;        // the player's base/fountain zone (overworld only)
  townRadius?: number;
}

export type StoryTrigger =
  | { kind: 'legend'; legendId: string }
  | { kind: 'boss-phase'; bossHeroId?: string; raidId?: string }
  | { kind: 'resonance'; reaction: string };

function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class StoryDetector {
  private recentHooks: { atSec: number; casterUid: number; targetUid?: number }[] = [];
  private recentRecallProxies: { atSec: number; casterUid: number }[] = [];
  private recentAxeCalls: { atSec: number; casterUid: number }[] = [];
  private recentKills = new Map<number, number[]>();
  private phaseFired = new Set<string>(); // boss uid + authored HP threshold

  /** Reset per-encounter state when a live fight begins. */
  beginEncounter(): void {
    this.phaseFired.clear();
    this.recentHooks = [];
    this.recentRecallProxies = [];
    this.recentAxeCalls = [];
    this.recentKills.clear();
  }

  observe(events: readonly SimEvent[], ctx: StoryObserveCtx): StoryTrigger[] {
    const out: StoryTrigger[] = [];
    // prune stale hook records
    this.recentHooks = this.recentHooks.filter((h) => ctx.nowSec - h.atSec <= HOOK_WINDOW_SEC);
    this.recentRecallProxies = this.recentRecallProxies.filter((h) => ctx.nowSec - h.atSec <= RECALL_PROXY_WINDOW_SEC);
    this.recentAxeCalls = this.recentAxeCalls.filter((h) => ctx.nowSec - h.atSec <= AXE_CALL_WINDOW_SEC);
    for (const [uid, kills] of this.recentKills) {
      const fresh = kills.filter((t) => ctx.nowSec - t <= RAMPAGE_WINDOW_SEC);
      if (fresh.length > 0) this.recentKills.set(uid, fresh);
      else this.recentKills.delete(uid);
    }

    for (const ev of events) {
      if (ev.t === 'cast') {
        const legend = this.onCast(ev, ctx);
        if (legend) out.push(legend);
      } else if (ev.t === 'item-used') {
        this.onItemUsed(ev, ctx);
      } else if (ev.t === 'death') {
        const legend = this.onDeath(ev, ctx);
        if (legend) out.push(legend);
      } else if (ev.t === 'reaction') {
        out.push({ kind: 'resonance', reaction: ev.reaction });
      }
    }

    // §6.6 boss phase break: poll the encounter boss HP after the events apply.
    out.push(...this.observeBossPhase(ctx));
    return out;
  }

  private onCast(ev: Extract<SimEvent, { t: 'cast' }>, ctx: StoryObserveCtx): StoryTrigger | null {
    const caster = ctx.sim.unit(ev.uid);
    if (!caster || caster.team !== ctx.playerTeam) return null;

    // Hooked Home — record a player Pudge hook; resolution happens on a later death.
    if (ev.abilityId === HOOK_ID && caster.heroId === 'pudge') {
      this.recentHooks.push({ atSec: ctx.nowSec, casterUid: ev.uid, targetUid: ev.target });
      return null;
    }

    // The codebase has no literal Chen recall event; track the closest shipped support casts
    // so Hooked Home can recognize a base-zone hook with a recall-like assist when present.
    if (caster.heroId === 'chen' && CHEN_RECALL_PROXY_IDS.has(ev.abilityId)) {
      this.recentRecallProxies.push({ atSec: ctx.nowSec, casterUid: ev.uid });
      return null;
    }

    if (ev.abilityId === AXE_CALL_ID && caster.heroId === 'axe') {
      this.recentAxeCalls.push({ atSec: ctx.nowSec, casterUid: ev.uid });
      return null;
    }

    // The Coil That Closed the Game — no TP channel exists in the sim, so use the
    // strongest available proxy: Dream Coil catches multiple enemies while at least
    // one is moving, casting, channeling, or otherwise trying to leave/act.
    if (ev.abilityId === DREAM_COIL_ID && caster.heroId === 'puck') {
      let caught = 0;
      let escapeAttempts = 0;
      const r2 = 550 * 550;
      const center = ev.point ?? caster.pos;
      for (const u of ctx.sim.unitsArr) {
        if (!u.alive || u.team === ctx.playerTeam || dist2(u.pos, center) > r2) continue;
        caught += 1;
        if (this.isEscapeAttempt(u, ctx.nowSec)) escapeAttempts += 1;
      }
      if (caught >= 2 && escapeAttempts >= 1) return { kind: 'legend', legendId: 'coil-closed-game' };
    }

    // The Pit Remembers — a player Echo Slam catching 4+ enemies inside Roshan's Pit.
    if (ev.abilityId === ECHO_SLAM_ID && caster.heroId === 'earthshaker' && ctx.raidId === PIT_RAID_ID) {
      let caught = 0;
      const r2 = ECHO_SLAM_RADIUS * ECHO_SLAM_RADIUS;
      for (const u of ctx.sim.unitsArr) {
        if (u.alive && u.team !== ctx.playerTeam && dist2(u.pos, caster.pos) <= r2) caught += 1;
      }
      if (caught >= 4) return { kind: 'legend', legendId: 'pit-remembers' };
    }
    return null;
  }

  private onItemUsed(ev: Extract<SimEvent, { t: 'item-used' }>, ctx: StoryObserveCtx): void {
    const caster = ctx.sim.unit(ev.uid);
    if (!caster || caster.team !== ctx.playerTeam) return;
    if (ev.itemId === TOWN_PORTAL_ITEM_ID) this.recentRecallProxies.push({ atSec: ctx.nowSec, casterUid: ev.uid });
  }

  private isEscapeAttempt(u: NonNullable<ReturnType<Sim['unit']>>, nowSec: number): boolean {
    const orderKind = u.order?.kind;
    if (orderKind === 'move' || orderKind === 'attack-move' || orderKind === 'follow' || orderKind === 'cast' || orderKind === 'item') return true;
    if (u.cast || u.channel) return true;
    return nowSec - (u.lastAbilityCastAt ?? -999) <= 1.5;
  }

  private onDeath(ev: Extract<SimEvent, { t: 'death' }>, ctx: StoryObserveCtx): StoryTrigger | null {
    const victim = ctx.sim.unit(ev.uid);
    if (!victim) return null;

    if (victim.team === ctx.playerTeam) {
      this.recentKills.delete(ev.uid);
      const paid = this.recentAxeCalls.some((h) => h.casterUid === ev.uid);
      if (paid) {
        const enemiesAlive = ctx.sim.unitsArr.filter((u) => u.team !== ctx.playerTeam && u.alive).length;
        if (enemiesAlive <= 1) return { kind: 'legend', legendId: 'call-paid-out' };
      }
      return null;
    }

    if (ev.killer !== undefined) {
      const killer = ctx.sim.unit(ev.killer);
      if (killer?.team === ctx.playerTeam) {
        const kills = this.recentKills.get(ev.killer) ?? [];
        kills.push(ctx.nowSec);
        this.recentKills.set(ev.killer, kills);
        if (kills.length >= 5) return { kind: 'legend', legendId: 'rampage' };
      }
    }

    if (!ctx.townPos || this.recentHooks.length === 0) return null;
    const r = ctx.townRadius ?? 900;
    const victimInBase = dist2(victim.pos, ctx.townPos) <= r * r;
    if (!victimInBase) return null;
    // "Hooked home": a recent player Pudge hook ends with the victim dying in the
    // base/fountain zone. A Chen/Town Portal proxy can stand in for the recall part
    // when the shipped mechanics produce one, but the base-zone death is mandatory.
    const homed = this.recentHooks.some((h) => {
      const pudge = ctx.sim.unit(h.casterUid);
      const credited = ev.killer === h.casterUid;
      const targeted = h.targetUid === undefined || h.targetUid === ev.uid;
      const pudgeInBase = !!pudge && pudge.alive && dist2(pudge.pos, ctx.townPos!) <= r * r;
      const recallProxy = this.recentRecallProxies.some((assist) => assist.casterUid !== h.casterUid);
      return credited && targeted && (pudgeInBase || recallProxy);
    });
    return homed ? { kind: 'legend', legendId: 'hooked-home' } : null;
  }

  private observeBossPhase(ctx: StoryObserveCtx): StoryTrigger[] {
    const out: StoryTrigger[] = [];
    for (const u of ctx.sim.unitsArr) {
      if (u.team === ctx.playerTeam || u.ctrl.kind !== 'boss') continue;
      if (!u.alive) continue;
      const hpPct = 100 * u.hp / Math.max(1, u.stats.maxHp);
      const thresholds = [...(ctx.bossPhaseHpPct?.length ? ctx.bossPhaseHpPct : [FALLBACK_PHASE_BREAK_PCT])]
        .filter((pct) => pct > 0 && pct < 100)
        .sort((a, b) => b - a);
      for (const threshold of thresholds) {
        const key = `${u.uid}:${threshold}`;
        if (this.phaseFired.has(key) || hpPct > threshold) continue;
        this.phaseFired.add(key);
        out.push({ kind: 'boss-phase', bossHeroId: ctx.bossHeroId ?? u.heroId, raidId: ctx.raidId });
        break;
      }
    }
    return out;
  }
}
