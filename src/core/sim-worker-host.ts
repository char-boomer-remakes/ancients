import { Sim } from './sim';
import type { Order, SimEvent, Vec2 } from './types';

export interface SimSnapshotUnit {
  uid: number;
  kind: string;
  team: number;
  alive: boolean;
  pos: Vec2;
  prevPos: Vec2;
  hp: number;
  mana: number;
}

export interface SimSnapshot {
  time: number;
  tickCount: number;
  hash: string;
  units: SimSnapshotUnit[];
  projectiles: number;
  zones: number;
}

/**
 * Deterministic host boundary for the future browser Worker runner.
 *
 * The class intentionally accepts an already-built Sim: game setup, registries,
 * and save hydration stay where they are today. The boundary owns only the
 * fixed-step loop, order injection, event draining, and compact snapshots that
 * the render thread can interpolate.
 */
export class SimWorkerHost {
  constructor(readonly sim: Sim) {}

  order(uid: number, order: Order): void {
    this.sim.order(uid, order);
  }

  stepTicks(ticks: number): SimSnapshot {
    const n = Math.max(0, Math.floor(ticks));
    for (let i = 0; i < n; i++) this.sim.tick();
    return snapshotSim(this.sim);
  }

  drainEvents(): SimEvent[] {
    return this.sim.events.drain();
  }
}

export function snapshotSim(sim: Sim): SimSnapshot {
  return {
    time: sim.time,
    tickCount: sim.tickCount,
    hash: sim.hash(),
    units: sim.unitsArr.map((u) => ({
      uid: u.uid,
      kind: u.kind,
      team: u.team,
      alive: u.alive,
      pos: { ...u.pos },
      prevPos: { ...u.prevPos },
      hp: u.hp,
      mana: u.mana
    })),
    projectiles: sim.projectiles.length,
    zones: sim.zones.length
  };
}
