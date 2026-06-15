import { TUNING } from '../data/tuning';
import { heroesAlive, setupMacroSim, type MacroResult } from '../core/macro';
import { counterFormation, defaultFormation } from '../core/board';
import { REG } from '../core/registry';
import { canDraftHero, chooseDraft, counterDraft, pickEnemyBans, repicksAllowed } from '../core/draft';
import type { ControllerRef } from '../core/unit';
import type { Unit } from '../core/unit';
import type { DifficultyTier, Formation, GambitRule, GymDef, MacroHeroSetup } from '../core/types';
import type { Sim } from '../core/sim';

/** An authored board for a lineup (§6.4): the same archetype-aware default the
 *  player gets, so both sides deploy on a real board, not the role heuristic.
 *  Pure over the setups; heroes missing from the registry are skipped. */
export function defaultBoardFor(team: MacroHeroSetup[], opponent?: Formation): Formation {
  const defs = team.map((h) => REG.heroes.get(h.heroId)).filter((d): d is NonNullable<typeof d> => !!d);
  return opponent ? counterFormation(defs, opponent) : defaultFormation(defs);
}

export interface GymMatchHero {
  heroId: string;
  level: number;
  items?: string[];
  gambits?: GambitRule[];
}

export interface GymRoundResult {
  round: number;
  winner: 0 | 1 | -1;
  result: MacroResult;
}

export interface GymMatchResult {
  gymId: string;
  playerWins: number;
  enemyWins: number;
  winner: 0 | 1 | -1;
  rounds: GymRoundResult[];
}

/**
 * A timed player-control window over a gambit-driven hero (SPEC §7). One side
 * of a fight owns a controller; spending a charge hands a chosen hero to
 * `player` control for `captainCallSec`, then reverts and decrements.
 */
export class CaptainCallController {
  remaining: number;
  activeUid: number | null = null;
  expiresAt = 0;
  used = 0;
  private previous: ControllerRef | null = null;

  constructor(public readonly team: 0 | 1 = 0, charges = TUNING.captainCallsPerFight) {
    this.remaining = charges;
  }

  activate(sim: Sim, uid: number): boolean {
    const u = sim.unit(uid);
    if (!u || !u.alive || u.team !== this.team || this.remaining <= 0 || this.activeUid !== null) return false;
    this.remaining -= 1;
    this.used += 1;
    this.activeUid = uid;
    this.expiresAt = sim.time + TUNING.captainCallSec;
    this.previous = structuredClone(u.ctrl);
    u.ctrl = { kind: 'player' };
    if (this.team === 0) sim.playerActiveUid = uid;
    return true;
  }

  tick(sim: Sim): void {
    if (this.activeUid === null || sim.time < this.expiresAt) return;
    const u = sim.unit(this.activeUid);
    if (u && this.previous) u.ctrl = this.previous;
    this.activeUid = null;
    this.previous = null;
    if (this.team === 0) sim.playerActiveUid = heroesAlive(sim, 0)[0]?.uid ?? -1;
  }
}

function toSetups(team: GymMatchHero[]): MacroHeroSetup[] {
  return team.slice(0, 5).map((h) => ({ heroId: h.heroId, level: h.level, items: h.items, gambits: h.gambits }));
}

export interface LiveGymOpts {
  autoPlayer?: boolean;
  formationA?: Formation;
  /** PROGRESSION_OVERHAUL §3: the player's recruited roster activates the asymmetric ban loop. */
  playerRoster?: string[];
  /** Difficulty tier dialing pre-bans / escalation / repick budget (§3.5). */
  tier?: DifficultyTier;
  /** Series length override (Elite Bo5, §3.1); defaults to the gym's bestOf. */
  bestOf?: number;
  /** Extra pre-bans on top of the tier table (Elite is strictly harder, §3.5 `eliteHarderPreBan`). */
  extraPreBans?: number;
  /** Override the per-round voluntary repick budget (Elite forces 0, §3.1.4). */
  repickBudgetOverride?: number;
  /** Bonus Captain Calls for the player side (meta `refightCaptainCall`, §4.2). */
  playerBonusCaptainCalls?: number;
}

/**
 * A live, stepped best-of-N captains series (Phase 6 §3.5, PROGRESSION_OVERHAUL §3).
 * Both sides own a `CaptainCallController`; the enemy receives `gym.enemyBonusCaptainCalls`
 * extra charges. When a `playerRoster` is supplied the asymmetric ban loop runs: the
 * leader pre-bans the player's heroes one-directionally, escalates bans each round
 * (preferring the last winning five), force-repicks banned slots, optionally re-slots
 * its own five, and the player gets a difficulty-scaled repick budget. The same class
 * drives the headless auto-resolve (autoPlayer) and the rendered live fight.
 */
export class LiveGymFight {
  readonly gym: GymDef;
  private teamA: MacroHeroSetup[];
  private enemyTeam: MacroHeroSetup[];
  private readonly seed: number;
  private readonly autoPlayer: boolean;
  private readonly bestTo: number;
  private readonly seriesBestOf: number;
  private readonly formationA?: Formation;
  private formationB: Formation;

  readonly tier: DifficultyTier;
  readonly banLoopActive: boolean;
  readonly playerRoster: string[];
  readonly bannedHeroes = new Set<string>();
  private readonly extraPreBans: number;
  /** The per-round voluntary repick budget (§3.1.4); 0 locks the draft (Elite/`hell`). */
  readonly repickBudget: number;
  private readonly playerBonusCalls: number;
  repicksUsedThisRound = 0;
  private lastPlayerFive: string[] = [];
  private readonly level: number;

  round = 1;
  playerWins = 0;
  enemyWins = 0;
  done = false;
  result: GymMatchResult | null = null;

  sim!: Sim;
  playerCaptain!: CaptainCallController;
  enemyCaptain!: CaptainCallController;
  private maxTicks = 0;
  private readonly rounds: GymRoundResult[] = [];

  constructor(gym: GymDef, teamA: GymMatchHero[], seed: number, opts?: LiveGymOpts) {
    this.gym = gym;
    this.teamA = toSetups(teamA);
    this.seed = seed;
    this.autoPlayer = opts?.autoPlayer ?? false;
    this.formationA = opts?.formationA;
    this.tier = opts?.tier ?? 'normal';
    this.extraPreBans = Math.max(0, opts?.extraPreBans ?? 0);
    this.repickBudget = Math.max(0, opts?.repickBudgetOverride ?? repicksAllowed(this.tier));
    this.playerBonusCalls = Math.max(0, opts?.playerBonusCaptainCalls ?? 0);
    this.banLoopActive = !!opts?.playerRoster;
    this.playerRoster = opts?.playerRoster ? [...new Set(opts.playerRoster)] : this.teamA.map((h) => h.heroId);
    this.enemyTeam = gym.enemyTeam.map((h) => ({ ...h }));
    this.level = this.teamA[0]?.level ?? 30;
    this.seriesBestOf = opts?.bestOf ?? gym.bestOf;
    this.bestTo = Math.ceil(this.seriesBestOf / 2);
    if (this.banLoopActive) this.runPreBans();
    this.formationB = defaultBoardFor(this.enemyTeam, this.formationA);
    this.startRound();
  }

  // ---------- asymmetric ban loop (§3.1) ----------

  /** Pre-series one-directional ban phase: the leader bans the player's strongest heroes. */
  private runPreBans(): void {
    const count = TUNING.captainsSeries.enemyPreBansByDifficulty[this.tier] + this.extraPreBans;
    const bans = pickEnemyBans(this.gym.format, this.playerRoster, [], count, this.teamA.map((h) => h.heroId), this.seed + 7);
    for (const b of bans) this.bannedHeroes.add(b);
    this.forceRepickBannedSlots();
  }

  /** Each round the leader bans more of the player's heroes (preferring the last five) and re-slots. */
  private escalateBans(): void {
    const count = TUNING.captainsSeries.betweenRoundBanByDifficulty[this.tier];
    const bans = pickEnemyBans(this.gym.format, this.playerRoster, [...this.bannedHeroes], count, this.lastPlayerFive, this.seed + this.round * 31);
    for (const b of bans) this.bannedHeroes.add(b);
    this.forceRepickBannedSlots();
    this.repicksUsedThisRound = 0;
    if (TUNING.captainsSeries.enemyReslotsOwnFive) {
      const pool = this.gym.counterPool ?? [...REG.heroes.keys()];
      const res = counterDraft(this.gym.format, this.teamA, this.enemyTeam, pool, this.seed + this.round * 53);
      this.enemyTeam = res.enemy.map((h) => ({ ...h }));
      this.formationB = defaultBoardFor(this.enemyTeam, this.formationA);
    }
  }

  /** A ban that hits a hero in the five forces a free repick of that slot from the legal pool. */
  private forceRepickBannedSlots(): void {
    for (let i = 0; i < this.teamA.length; i++) {
      if (!this.bannedHeroes.has(this.teamA[i].heroId)) continue;
      const repl = this.legalReplacement(i);
      if (!repl) continue;
      const prev = this.teamA[i];
      this.teamA[i] = { heroId: repl, level: prev.level, items: prev.items, gambits: prev.gambits };
    }
  }

  private legalReplacement(excludeIdx: number): string | null {
    const teamWithout = this.teamA.filter((_, i) => i !== excludeIdx);
    return chooseDraft({
      pool: this.playerRoster,
      team: teamWithout,
      banned: [...this.bannedHeroes],
      format: this.gym.format,
      level: this.teamA[excludeIdx]?.level ?? this.level,
      seed: this.seed + this.round * 131 + excludeIdx
    });
  }

  /** Voluntary between-round repick, bounded by the difficulty repick budget (§3.1.4). */
  requestRepick(slotIdx: number, newHeroId: string): boolean {
    if (this.done) return false;
    if (this.repicksUsedThisRound >= this.repickBudget) return false;
    if (slotIdx < 0 || slotIdx >= this.teamA.length) return false;
    if (this.bannedHeroes.has(newHeroId)) return false;
    if (!this.playerRoster.includes(newHeroId)) return false;
    if (this.teamA.some((h) => h.heroId === newHeroId)) return false;
    const teamWithout = this.teamA.filter((_, i) => i !== slotIdx);
    if (!canDraftHero(this.gym.format, teamWithout, newHeroId, this.teamA[slotIdx].level)) return false;
    const prev = this.teamA[slotIdx];
    this.teamA[slotIdx] = { heroId: newHeroId, level: prev.level, items: prev.items, gambits: prev.gambits };
    this.repicksUsedThisRound += 1;
    return true;
  }

  /** Heroes the player may swap into `slotIdx` right now (legal + not banned). */
  legalRepickPool(slotIdx: number): string[] {
    const teamWithout = this.teamA.filter((_, i) => i !== slotIdx);
    return this.playerRoster.filter((id) => !this.bannedHeroes.has(id) && canDraftHero(this.gym.format, teamWithout, id, this.level));
  }

  /** Draft-ban readout for the live overlay (§3.4 / §8 legibility): bans + repick budget. */
  banReadout(): { banned: string[]; repickBudget: number; repicksUsed: number; round: number; bestOf: number } {
    return {
      banned: [...this.bannedHeroes],
      repickBudget: this.repickBudget,
      repicksUsed: this.repicksUsedThisRound,
      round: this.round,
      bestOf: this.seriesBestOf
    };
  }

  /** The player's current fielded five (heroIds), after any forced/voluntary repicks. */
  currentPlayerFive(): string[] {
    return this.teamA.map((h) => h.heroId);
  }

  /** The enemy's current five (heroIds), after any counter-draft re-slot. */
  currentEnemyFive(): string[] {
    return this.enemyTeam.map((h) => h.heroId);
  }

  private startRound(): void {
    this.sim = setupMacroSim({
      seed: this.seed + this.round * 17,
      teamA: this.teamA,
      teamB: this.enemyTeam,
      maxSec: TUNING.macroMaxSec,
      formationA: this.formationA,
      formationB: this.formationB
    });
    this.playerCaptain = new CaptainCallController(0, TUNING.captainCallsPerFight + this.playerBonusCalls);
    this.enemyCaptain = new CaptainCallController(1, TUNING.captainCallsPerFight + (this.gym.enemyBonusCaptainCalls ?? 0));
    this.sim.playerActiveUid = heroesAlive(this.sim, 0)[0]?.uid ?? -1;
    this.maxTicks = Math.round(TUNING.macroMaxSec / this.sim.dt);
  }

  /** Advance the live fight by `dt` real seconds (fixed sim ticks under the hood). */
  step(dt: number): void {
    if (this.done) return;
    const ticks = Math.max(1, Math.round(dt / this.sim.dt));
    for (let i = 0; i < ticks && !this.done; i++) {
      if (this.stepOnce()) break;
    }
  }

  /** Run to a final result with no live player (used by auto-resolve + tests). */
  runHeadless(): GymMatchResult {
    let guard = 0;
    while (!this.done && guard++ < 5_000_000) this.stepOnce();
    return this.result!;
  }

  /** Player spends a charge on an ult-ready hero (or `preferUid`). */
  playerCaptainCall(preferUid?: number): boolean {
    if (this.done) return false;
    const own = heroesAlive(this.sim, 0);
    if (own.length === 0) return false;
    let caller = preferUid !== undefined ? this.sim.unit(preferUid) : undefined;
    if (!caller || !caller.alive || caller.team !== 0) {
      caller = own.find((u) => u.abilityReady(3, this.sim.time).ok) ?? own[0];
    }
    return caller ? this.playerCaptain.activate(this.sim, caller.uid) : false;
  }

  /** Player-side heroes still alive in the current round, in party/spawn order. */
  playerHeroes(): Unit[] {
    return heroesAlive(this.sim, 0);
  }

  /** Unit currently driven by live input during a real Captain's Call. */
  playerDrivenUnit(): Unit | null {
    if (this.playerCaptain.activeUid === null) return null;
    return this.sim.unit(this.playerCaptain.activeUid) ?? null;
  }

  /** The unit the camera should track: an active player caller, else a player hero. */
  cameraFollow(): Unit | null {
    if (this.playerCaptain.activeUid !== null) {
      const u = this.sim.unit(this.playerCaptain.activeUid);
      if (u) return u;
    }
    return heroesAlive(this.sim, 0)[0] ?? null;
  }

  /** Returns true once the round has ended. */
  private stepOnce(): boolean {
    if (this.done) return true;
    const a = heroesAlive(this.sim, 0);
    const b = heroesAlive(this.sim, 1);
    if (a.length === 0 || b.length === 0 || this.sim.tickCount >= this.maxTicks) {
      this.endRound();
      return true;
    }
    this.autoCall(this.enemyCaptain, b);
    if (this.autoPlayer) this.autoCall(this.playerCaptain, a);
    this.steer(this.enemyCaptain, a);
    if (this.autoPlayer) this.steer(this.playerCaptain, b);
    this.sim.tick();
    this.playerCaptain.tick(this.sim);
    this.enemyCaptain.tick(this.sim);
    return false;
  }

  private autoCall(cap: CaptainCallController, own: Unit[]): void {
    if (cap.remaining <= 0 || cap.activeUid !== null) return;
    if (this.sim.time <= 4 + cap.used * 12) return;
    const caller = own.find((u) => u.abilityReady(3, this.sim.time).ok) ?? own[0];
    if (caller) cap.activate(this.sim, caller.uid);
  }

  private steer(cap: CaptainCallController, foes: Unit[]): void {
    if (cap.activeUid === null) return;
    const caller = this.sim.unit(cap.activeUid);
    if (!caller) return;
    const target = [...foes].sort((x, y) => x.hp / x.stats.maxHp - y.hp / y.stats.maxHp)[0];
    if (!target) return;
    caller.order = caller.abilityReady(3, this.sim.time).ok
      ? { kind: 'cast', slot: 3, uid: target.uid, point: { ...target.pos } }
      : { kind: 'attack-unit', uid: target.uid };
  }

  private endRound(): void {
    let winner = this.decideWinner();
    if (winner === 0) this.playerWins += 1;
    else if (winner === 1) this.enemyWins += 1;
    this.rounds.push({ round: this.round, winner, result: this.snapshot(winner) });
    // Remember the five that just played; the leader bans the MVP of a winning five (§3.1.3).
    this.lastPlayerFive = this.teamA.map((h) => h.heroId);

    if (this.playerWins >= this.bestTo || this.enemyWins >= this.bestTo || this.round >= this.seriesBestOf) {
      this.done = true;
      this.result = {
        gymId: this.gym.id,
        playerWins: this.playerWins,
        enemyWins: this.enemyWins,
        winner: this.playerWins > this.enemyWins ? 0 : this.enemyWins > this.playerWins ? 1 : -1,
        rounds: this.rounds
      };
      return;
    }
    this.round += 1;
    if (this.banLoopActive) this.escalateBans();
    this.startRound();
  }

  private decideWinner(): 0 | 1 | -1 {
    const a = heroesAlive(this.sim, 0).length;
    const b = heroesAlive(this.sim, 1).length;
    if (a > 0 && b === 0) return 0;
    if (b > 0 && a === 0) return 1;
    const score = (team: number) => heroesAlive(this.sim, team).reduce((acc, u) => acc + u.hp / u.stats.maxHp, 0);
    const sa = score(0);
    const sb = score(1);
    return sa > sb ? 0 : sb > sa ? 1 : -1;
  }

  private snapshot(winner: 0 | 1 | -1): MacroResult {
    return {
      winner,
      timeSec: this.sim.time,
      ticks: this.sim.tickCount,
      survivors: this.sim.unitsArr
        .filter((u) => u.alive && u.kind === 'hero')
        .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
      hash: this.sim.hash(),
      sim: this.sim,
      rapierDrops: [],
      aegisConsumed: false
    };
  }
}

export function runGymMatch(
  gym: GymDef,
  team: GymMatchHero[],
  seed: number,
  formationA?: Formation,
  opts?: Omit<LiveGymOpts, 'autoPlayer' | 'formationA'>
): GymMatchResult {
  return new LiveGymFight(gym, team, seed, { autoPlayer: true, formationA, ...opts }).runHeadless();
}

export function setupCaptainCallSmoke(gym: GymDef, team: GymMatchHero[], seed: number): { sim: Sim; captain: CaptainCallController } {
  const sim = setupMacroSim({
    seed,
    teamA: toSetups(team),
    teamB: gym.enemyTeam,
    maxSec: 20
  });
  return { sim, captain: new CaptainCallController() };
}
