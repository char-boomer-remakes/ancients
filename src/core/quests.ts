// ============================================================
// Quest logic (QUEST.md): pure, total, deterministic.
// Operates on plain data — a QuestDef, a QuestSave, and a
// snapshot QuestContext — so it stays headless-testable and
// free of three/DOM. The systems layer (Game) feeds it
// normalized QuestEvents and applies the rewards.
// ============================================================

import type { CreepTier, QuestChoice, QuestDef, QuestGiverDef, QuestObjective, QuestObjectiveKind, QuestPrereq, QuestSave, QuestStatus, Vec2 } from './types';

export interface QuestContext {
  badges: number;
  recruited: number;
  raidClears: number;
  reachedRegions: ReadonlySet<string>;
  claimedQuests: ReadonlySet<string>;
  playtimeSec: number;
  questChoices?: ReadonlyMap<string, string>; // fork quest id -> chosen branch id
}

export interface QuestEvent {
  kind: QuestObjectiveKind;
  amount: number;
  regionId?: string;
  tier?: CreepTier;
  targetId?: string;
}

export function defaultQuestSave(def: QuestDef): QuestSave {
  return {
    status: 'locked',
    progress: def.objectives.map(() => 0),
    completions: 0
  };
}

/** Defensive normalize: keep progress array sized to the def, clamp values. */
export function normalizeQuestSave(def: QuestDef, save: QuestSave | undefined): QuestSave {
  const base = save ?? defaultQuestSave(def);
  const progress = def.objectives.map((obj, i) => {
    const v = base.progress[i];
    return clampCount(typeof v === 'number' ? v : 0, obj.count);
  });
  const status: QuestStatus = (['locked', 'active', 'complete', 'claimed', 'cooldown'] as QuestStatus[]).includes(base.status)
    ? base.status
    : 'locked';
  return {
    status,
    progress,
    completions: Math.max(0, Math.floor(base.completions ?? 0)),
    ...(typeof base.availableAt === 'number' ? { availableAt: base.availableAt } : {}),
    ...(typeof base.expiresAt === 'number' ? { expiresAt: base.expiresAt } : {}),
    ...(typeof base.choice === 'string' ? { choice: base.choice } : {})
  };
}

/** A freshly-armed active record: progress zeroed, a timed window opened if the def is timed. */
function enterActive(def: QuestDef, ctx: QuestContext, completions: number): QuestSave {
  const base: QuestSave = { status: 'active', progress: def.objectives.map(() => 0), completions };
  if (def.windowSec && def.windowSec > 0) base.expiresAt = ctx.playtimeSec + def.windowSec;
  return base;
}

export function prereqMet(def: QuestDef, ctx: QuestContext): boolean {
  return prereqSatisfied(def.prereq, ctx);
}

/** A prereq is met when every named gate holds AND, if present, at least one anyOf branch holds. */
function prereqSatisfied(p: QuestPrereq | undefined, ctx: QuestContext): boolean {
  if (!p) return true;
  if (p.badges !== undefined && ctx.badges < p.badges) return false;
  if (p.recruited !== undefined && ctx.recruited < p.recruited) return false;
  if (p.raidClears !== undefined && ctx.raidClears < p.raidClears) return false;
  if (p.region !== undefined && !ctx.reachedRegions.has(p.region)) return false;
  if (p.quests) {
    for (const q of p.quests) if (!ctx.claimedQuests.has(q)) return false;
  }
  if (p.choice) {
    if (ctx.questChoices?.get(p.choice.quest) !== p.choice.choiceId) return false;
  }
  if (p.anyOf && p.anyOf.length > 0) {
    if (!p.anyOf.some((branch) => prereqSatisfied(branch, ctx))) return false;
  }
  return true;
}

/**
 * Lifecycle gate. locked -> active once prereq is met; a recurring quest in
 * cooldown -> active (progress reset) once availableAt elapses. Terminal
 * (claimed) and in-flight (active/complete) states are left untouched.
 */
export function refreshAvailability(def: QuestDef, save: QuestSave, ctx: QuestContext): QuestSave {
  const s = normalizeQuestSave(def, save);
  if (s.status === 'locked') {
    if (prereqMet(def, ctx)) return enterActive(def, ctx, s.completions);
    return s;
  }
  if (s.status === 'cooldown') {
    const ready = s.availableAt === undefined || ctx.playtimeSec >= s.availableAt;
    if (ready && prereqMet(def, ctx)) return enterActive(def, ctx, s.completions);
    return s;
  }
  // Timed quests: an active run that blows its deadline resets and re-arms.
  // (A completed quest has already earned its reward and is left to be claimed.)
  if (s.status === 'active' && s.expiresAt !== undefined && ctx.playtimeSec >= s.expiresAt) {
    return enterActive(def, ctx, s.completions);
  }
  return s;
}

export function matchesObjective(obj: QuestObjective, ev: QuestEvent): boolean {
  if (obj.kind !== ev.kind) return false;
  if (obj.regionId !== undefined && obj.regionId !== ev.regionId) return false;
  if (obj.tier !== undefined && obj.tier !== ev.tier) return false;
  if (obj.targetId !== undefined && obj.targetId !== ev.targetId) return false;
  return true;
}

export function isComplete(def: QuestDef, save: QuestSave): boolean {
  return def.objectives.every((obj, i) => (save.progress[i] ?? 0) >= obj.count);
}

/** Increment matching objectives on an active quest; flip to complete when all met. */
export function advance(def: QuestDef, save: QuestSave, ev: QuestEvent): { save: QuestSave; justCompleted: boolean } {
  const s = normalizeQuestSave(def, save);
  if (s.status !== 'active') return { save: s, justCompleted: false };
  const amount = Math.max(0, Math.floor(ev.amount));
  if (amount === 0) return { save: s, justCompleted: false };
  let changed = false;
  const progress = s.progress.map((cur, i) => {
    const obj = def.objectives[i];
    if (!matchesObjective(obj, ev)) return cur;
    const next = clampCount(cur + amount, obj.count);
    if (next !== cur) changed = true;
    return next;
  });
  if (!changed) return { save: s, justCompleted: false };
  const next: QuestSave = { ...s, progress };
  if (isComplete(def, next)) {
    next.status = 'complete';
    delete next.expiresAt; // the run beat the clock; the reward is locked in
    return { save: next, justCompleted: true };
  }
  return { save: next, justCompleted: false };
}

/** Resolve which branch a fork quest claim selected, defaulting to the first. */
export function chosenBranch(def: QuestDef, choiceId?: string): QuestChoice | undefined {
  if (!def.choices || def.choices.length === 0) return undefined;
  return def.choices.find((c) => c.id === choiceId) ?? def.choices[0];
}

/**
 * Claim a completed quest. Event quests become claimed (terminal); recurring
 * quests go to cooldown (re-arms after cooldownSec) or straight back to active
 * when no cooldown is set. A fork quest records the branch taken so its
 * choice-gated successor unlocks. Returns the same save when not claimable.
 */
export function claim(def: QuestDef, save: QuestSave, ctx: QuestContext, choiceId?: string): { save: QuestSave; claimed: boolean } {
  const s = normalizeQuestSave(def, save);
  if (s.status !== 'complete') return { save: s, claimed: false };
  const completions = s.completions + 1;
  if (def.kind === 'recurring') {
    const cd = def.cooldownSec ?? 0;
    if (cd > 0) {
      // The timed window (if any) re-opens when the cooldown re-arms, not now.
      return { save: { status: 'cooldown', progress: def.objectives.map(() => 0), completions, availableAt: ctx.playtimeSec + cd }, claimed: true };
    }
    return { save: enterActive(def, ctx, completions), claimed: true };
  }
  const branch = chosenBranch(def, choiceId);
  return {
    save: { status: 'claimed', progress: s.progress, completions, ...(branch ? { choice: branch.id } : {}) },
    claimed: true
  };
}

function clampCount(v: number, max: number): number {
  if (v < 0) return 0;
  if (v > max) return max;
  return Math.floor(v);
}

// ============================================================
// Quest givers (QUEST.md): NPCs that walk the world. Position
// is a pure, deterministic function of playtime — no save state,
// no RNG — so the headless core stays authoritative and the
// renderer (and the proximity check) just read it.
// ============================================================

/** The closed patrol loop: home -> each waypoint -> back to home. */
function patrolLoop(def: QuestGiverDef): Vec2[] {
  const pts = [def.home, ...(def.patrol ?? [])];
  if (pts.length <= 1) return pts;
  return [...pts, def.home];
}

/**
 * Where the giver stands at playtime `t`, walking its patrol loop at constant
 * speed. With no patrol it stands at `home`. Total and deterministic.
 */
export function questGiverPos(def: QuestGiverDef, t: number): Vec2 {
  const loop = patrolLoop(def);
  if (loop.length <= 1) return { x: def.home.x, y: def.home.y };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const d = Math.hypot(loop[i + 1].x - loop[i].x, loop[i + 1].y - loop[i].y);
    segLens.push(d);
    total += d;
  }
  if (total <= 1e-6) return { x: def.home.x, y: def.home.y };
  const loopSec = def.loopSec && def.loopSec > 0 ? def.loopSec : 60;
  const phase = ((t % loopSec) + loopSec) % loopSec; // wrap negatives too
  let walk = (phase / loopSec) * total;
  for (let i = 0; i < segLens.length; i++) {
    if (walk <= segLens[i] || i === segLens.length - 1) {
      const frac = segLens[i] > 1e-6 ? walk / segLens[i] : 0;
      return {
        x: loop[i].x + (loop[i + 1].x - loop[i].x) * frac,
        y: loop[i].y + (loop[i + 1].y - loop[i].y) * frac
      };
    }
    walk -= segLens[i];
  }
  return { x: def.home.x, y: def.home.y };
}
