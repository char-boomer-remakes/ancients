import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { SimWorkerHost, handleSimWorkerRequest, snapshotSim } from '../core/sim-worker-host';
import type { SimWorkerBootstrap, SimWorkerRequest, SimWorkerResponse } from '../core/sim-worker-protocol';

registerAllContent();

let host: SimWorkerHost | null = null;

function buildSim(bootstrap: SimWorkerBootstrap): Sim {
  const sim = new Sim({
    seed: bootstrap.seed ?? 4242,
    bounds: bootstrap.bounds ?? { w: 6000, h: 4000 }
  });
  if (bootstrap.kind === 'duel') {
    const level = bootstrap.level ?? 16;
    sim.spawnHero(REG.hero(bootstrap.team0Hero ?? 'juggernaut'), {
      team: 0,
      pos: { x: 2200, y: 2000 },
      level,
      ctrl: { kind: 'creep', homePos: { x: 2200, y: 2000 } }
    });
    sim.spawnHero(REG.hero(bootstrap.team1Hero ?? 'axe'), {
      team: 1,
      pos: { x: 2800, y: 2000 },
      level,
      ctrl: { kind: 'creep', homePos: { x: 2800, y: 2000 } }
    });
  }
  return sim;
}

function dispatch(request: SimWorkerRequest): SimWorkerResponse {
  if (request.kind === 'init') {
    host = new SimWorkerHost(buildSim(request.bootstrap));
    return { id: request.id, ok: true, snapshot: snapshotSim(host.sim) };
  }
  if (!host) return { id: request.id, ok: false, error: 'sim worker not initialized' };
  return handleSimWorkerRequest(host, request);
}

self.addEventListener('message', (event: MessageEvent<SimWorkerRequest>) => {
  self.postMessage(dispatch(event.data));
});
