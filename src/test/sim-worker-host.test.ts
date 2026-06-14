import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { SimWorkerHost } from '../core/sim-worker-host';

beforeAll(() => registerAllContent());

function buildDuel(seed = 4242): Sim {
  const sim = new Sim({ seed, bounds: { w: 6000, h: 4000 } });
  sim.spawnHero(REG.hero('juggernaut'), {
    team: 0,
    pos: { x: 2200, y: 2000 },
    level: 16,
    ctrl: { kind: 'creep', homePos: { x: 2200, y: 2000 } }
  });
  sim.spawnHero(REG.hero('axe'), {
    team: 1,
    pos: { x: 2800, y: 2000 },
    level: 16,
    ctrl: { kind: 'creep', homePos: { x: 2800, y: 2000 } }
  });
  return sim;
}

describe('sim worker host boundary', () => {
  it('steps to the same deterministic hash as the in-process sim', () => {
    const direct = buildDuel();
    const hosted = new SimWorkerHost(buildDuel());

    for (let i = 0; i < 180; i++) direct.tick();
    const snapshot = hosted.stepTicks(180);

    expect(snapshot.tickCount).toBe(direct.tickCount);
    expect(snapshot.hash).toBe(direct.hash());
    expect(snapshot.units.length).toBe(direct.unitsArr.length);
  });

  it('applies queued orders through the host before stepping', () => {
    const direct = buildDuel(5151);
    const hostedSim = buildDuel(5151);
    const hosted = new SimWorkerHost(hostedSim);
    const uid = direct.unitsArr[0].uid;
    const order = { kind: 'move' as const, point: { x: 1800, y: 1800 } };

    direct.order(uid, order);
    hosted.order(uid, order);
    for (let i = 0; i < 45; i++) direct.tick();
    const snapshot = hosted.stepTicks(45);

    expect(snapshot.hash).toBe(direct.hash());
  });

  it('documents the 2.0 scale envelope in tuning', () => {
    expect(TUNING.scaleCeilings.overworldUnits).toBeGreaterThanOrEqual(100);
    expect(TUNING.scaleCeilings.raidUnits).toBeGreaterThanOrEqual(TUNING.scaleCeilings.overworldUnits);
    expect(TUNING.scaleCeilings.summons).toBeGreaterThan(0);
    expect(TUNING.scaleCeilings.illusions).toBeGreaterThan(0);
  });
});
