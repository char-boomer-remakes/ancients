import { Sim } from './sim';
import type { Order, SimEvent, Vec2 } from './types';
import type { SimWorkerRequest, SimWorkerResponse } from './sim-worker-protocol';

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

export function handleSimWorkerRequest(host: SimWorkerHost, request: SimWorkerRequest): SimWorkerResponse {
  try {
    switch (request.kind) {
      case 'init':
        return { id: request.id, ok: false, error: 'sim worker host is already initialized' };
      case 'order':
        host.order(request.uid, request.order);
        return { id: request.id, ok: true };
      case 'step':
        return { id: request.id, ok: true, snapshot: host.stepTicks(request.ticks) };
      case 'snapshot':
        return { id: request.id, ok: true, snapshot: snapshotSim(host.sim) };
      case 'drain-events':
        return { id: request.id, ok: true, events: host.drainEvents() };
    }
  } catch (err) {
    return { id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) };
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
