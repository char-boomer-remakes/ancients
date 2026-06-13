import { createRaidMechanicRunner, heroesAlive, setupRaidSim, type RaidEncounterResult } from '../core/macro';
import { raidSetupFromDef } from '../core/phase3';
import type { DifficultyTier, MacroHeroSetup, RaidDef } from '../core/types';
import type { Sim } from '../core/sim';
import type { Unit } from '../core/unit';

export class LiveRaid {
  readonly def: RaidDef;
  readonly tier: DifficultyTier;
  readonly sim: Sim;
  readonly boss: Unit;
  readonly partyUids: number[];
  readonly maxTicks: number;
  private readonly mechanics;
  private readonly handledFallen = new Set<number>();
  private aegisAvailable: boolean;
  private aegisConsumed = false;

  driverIdx = 0;
  done = false;
  result: RaidEncounterResult | null = null;

  constructor(def: RaidDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number, opts?: { maxSec?: number; aegis?: boolean }) {
    this.def = def;
    this.tier = tier;
    const rs = raidSetupFromDef(def, party, tier, seed);
    const limit = opts?.maxSec ?? rs.maxSec;
    this.sim = setupRaidSim({ seed: rs.seed, party: rs.party, boss: rs.boss, maxSec: limit });
    this.boss = this.sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    this.partyUids = this.sim.unitsArr.filter((u) => u.team === 0 && u.kind === 'hero').map((u) => u.uid);
    this.maxTicks = Math.round(limit / this.sim.dt);
    this.mechanics = createRaidMechanicRunner(def, this.sim, this.boss);
    this.aegisAvailable = !!opts?.aegis;
    this.sim.playerActiveUid = this.partyUids[0] ?? -1;
  }

  drivenUnit(): Unit | null {
    const u = this.sim.unit(this.partyUids[this.driverIdx]);
    if (u?.alive) return u;
    return heroesAlive(this.sim, 0)[0] ?? null;
  }

  selectDriver(idx: number): boolean {
    const uid = this.partyUids[idx];
    const u = uid !== undefined ? this.sim.unit(uid) : undefined;
    if (!u || !u.alive) return false;
    this.driverIdx = idx;
    this.sim.playerActiveUid = u.uid;
    return true;
  }

  cameraFollow(): Unit | null {
    return this.drivenUnit() ?? heroesAlive(this.sim, 0)[0] ?? this.boss;
  }

  step(dt: number): void {
    if (this.done) return;
    const ticks = Math.max(1, Math.round(dt / this.sim.dt));
    for (let i = 0; i < ticks && !this.done; i++) this.stepOnce();
  }

  private stepOnce(): void {
    this.sim.tick();
    this.mechanics.tick(this.sim);
    this.handleFallen();
    const partyAlive = heroesAlive(this.sim, 0).length;
    const bossAlive = this.boss.alive ? 1 : 0;
    if (partyAlive === 0 || bossAlive === 0 || this.sim.tickCount >= this.maxTicks) {
      this.done = true;
      const winner = partyAlive > 0 && bossAlive === 0 ? 0 : 1;
      this.result = {
        winner,
        cleared: winner === 0,
        timeSec: this.sim.time,
        ticks: this.sim.tickCount,
        survivors: this.sim.unitsArr
          .filter((u) => u.alive && u.kind === 'hero')
          .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
        hash: this.sim.hash(),
        sim: this.sim,
        rapierDrops: [],
        aegisConsumed: this.aegisConsumed,
        fired: this.mechanics.fired
      };
    }
  }

  private handleFallen(): void {
    for (const uid of this.partyUids) {
      const u = this.sim.unit(uid);
      if (!u || u.alive || this.handledFallen.has(uid)) continue;
      if (this.aegisAvailable) {
        if (this.sim.reviveUnit(u, 1, 1)) {
          this.aegisAvailable = false;
          this.aegisConsumed = true;
          continue;
        }
      }
      this.handledFallen.add(uid);
    }
  }
}
