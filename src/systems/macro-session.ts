import { TUNING } from '../data/tuning';
import { heroesAlive, setupMacroSim, type MacroResult } from '../core/macro';
import type { ControllerRef } from '../core/unit';
import type { GambitRule, GymDef, MacroHeroSetup } from '../core/types';
import type { Sim } from '../core/sim';

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

export class CaptainCallController {
  remaining: number;
  activeUid: number | null = null;
  expiresAt = 0;
  private previous: ControllerRef | null = null;

  constructor(charges = TUNING.captainCallsPerFight) {
    this.remaining = charges;
  }

  activate(sim: Sim, uid: number): boolean {
    const u = sim.unit(uid);
    if (!u || !u.alive || u.team !== 0 || this.remaining <= 0 || this.activeUid !== null) return false;
    this.remaining -= 1;
    this.activeUid = uid;
    this.expiresAt = sim.time + TUNING.captainCallSec;
    this.previous = structuredClone(u.ctrl);
    u.ctrl = { kind: 'player' };
    sim.playerActiveUid = uid;
    return true;
  }

  tick(sim: Sim): void {
    if (this.activeUid === null || sim.time < this.expiresAt) return;
    const u = sim.unit(this.activeUid);
    if (u && this.previous) u.ctrl = this.previous;
    this.activeUid = null;
    this.previous = null;
    sim.playerActiveUid = heroesAlive(sim, 0)[0]?.uid ?? -1;
  }
}

export function runGymMatch(gym: GymDef, team: GymMatchHero[], seed: number): GymMatchResult {
  const rounds: GymRoundResult[] = [];
  let playerWins = 0;
  let enemyWins = 0;
  const bestTo = Math.ceil(gym.bestOf / 2);
  const teamA: MacroHeroSetup[] = team.slice(0, 5).map((h) => ({
    heroId: h.heroId,
    level: h.level,
    items: h.items,
    gambits: h.gambits
  }));

  for (let round = 1; round <= gym.bestOf && playerWins < bestTo && enemyWins < bestTo; round++) {
    const result = runGymRoundWithCaptainCalls({
      seed: seed + round * 17,
      teamA,
      teamB: gym.enemyTeam,
      maxSec: TUNING.macroMaxSec
    });
    if (result.winner === 0) playerWins += 1;
    else if (result.winner === 1) enemyWins += 1;
    rounds.push({ round, winner: result.winner, result });
  }

  return {
    gymId: gym.id,
    playerWins,
    enemyWins,
    winner: playerWins > enemyWins ? 0 : enemyWins > playerWins ? 1 : -1,
    rounds
  };
}

function runGymRoundWithCaptainCalls(setup: { seed: number; teamA: MacroHeroSetup[]; teamB: MacroHeroSetup[]; maxSec: number }): MacroResult {
  const sim = setupMacroSim(setup);
  const captain = new CaptainCallController();
  const maxTicks = Math.round(setup.maxSec / sim.dt);
  let winner: 0 | 1 | -1 = -1;

  while (sim.tickCount < maxTicks) {
    const teamA = heroesAlive(sim, 0);
    const teamB = heroesAlive(sim, 1);
    if (teamA.length === 0 || teamB.length === 0) {
      winner = teamA.length > 0 ? 0 : teamB.length > 0 ? 1 : -1;
      break;
    }
    if (captain.remaining > 0 && captain.activeUid === null && sim.time > 4 + (TUNING.captainCallsPerFight - captain.remaining) * 12) {
      const caller = teamA.find((u) => u.abilityReady(3, sim.time).ok) ?? teamA[0];
      if (caller) captain.activate(sim, caller.uid);
    }
    if (captain.activeUid !== null) {
      const caller = sim.unit(captain.activeUid);
      const target = teamB.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      if (caller && target) {
        caller.order = caller.abilityReady(3, sim.time).ok
          ? { kind: 'cast', slot: 3, uid: target.uid, point: { ...target.pos } }
          : { kind: 'attack-unit', uid: target.uid };
      }
    }
    sim.tick();
    captain.tick(sim);
  }

  if (winner === -1) {
    const score = (team: number) => heroesAlive(sim, team).reduce((acc, u) => acc + u.hp / u.stats.maxHp, 0);
    const a = score(0);
    const b = score(1);
    winner = a > b ? 0 : b > a ? 1 : -1;
  }

  return {
    winner,
    timeSec: sim.time,
    ticks: sim.tickCount,
    survivors: sim.unitsArr
      .filter((u) => u.alive && u.kind === 'hero')
      .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
    hash: sim.hash(),
    sim
  };
}

export function setupCaptainCallSmoke(gym: GymDef, team: GymMatchHero[], seed: number): { sim: Sim; captain: CaptainCallController } {
  const sim = setupMacroSim({
    seed,
    teamA: team.slice(0, 5).map((h) => ({ heroId: h.heroId, level: h.level, items: h.items, gambits: h.gambits })),
    teamB: gym.enemyTeam,
    maxSec: 20
  });
  return { sim, captain: new CaptainCallController() };
}
