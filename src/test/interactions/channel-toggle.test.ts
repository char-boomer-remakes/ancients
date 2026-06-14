import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { REG } from '../../core/registry';
import type { Sim } from '../../core/sim';
import type { Unit } from '../../core/unit';
import { arena, dummyHero } from './_arena';

// ============================================================
// §3.2 — channel & toggle. A channel holds for its duration and
// ticks; a toggle flips on, drains its resource each tick while on,
// and stops when flipped off.
// ============================================================

beforeAll(() => registerAllContent());

function slotOf(unit: ReturnType<typeof dummyHero>, abilityId: string): number {
  return unit.abilities.findIndex((a) => a.def.id === abilityId);
}

describe('interactions/channel', () => {
  it('Dismember channels: holds, disables the victim, and ticks damage', () => {
    const sim = arena();
    const pudge = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0, level: 18, player: true });
    const victim = dummyHero(sim, 'juggernaut', { x: 2150, y: 4000 }, { team: 1 });
    const slot = slotOf(pudge, 'pudge-dismember');
    const before = victim.hp;
    sim.order(pudge.uid, { kind: 'cast', slot, uid: victim.uid });
    sim.run(1.0);
    expect(pudge.channel).not.toBeNull(); // still channeling
    expect(victim.summary.stunned).toBe(true); // held in place by the channel
    expect(victim.hp).toBeLessThan(before); // ticking

    sim.run(4); // past the channel duration
    expect(pudge.channel).toBeNull();
  });
});

describe('interactions/toggle', () => {
  it('Rot toggles on (draining the carrier) and off (stopping the drain)', () => {
    const sim: Sim = arena();
    const pudge = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0, level: 18, player: true });
    // A passive creep dummy (no Counter-Helix-style retaliation) inside Rot's radius.
    const enemy: Unit = sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: 2150, y: 4000 }, wild: true });
    enemy.ctrl = { kind: 'none' };
    const slot = slotOf(pudge, 'pudge-rot');
    expect(REG.hero('pudge').abilities[slot].toggle).toBeDefined();

    sim.order(pudge.uid, { kind: 'cast', slot });
    sim.run(0.4);
    expect(pudge.abilities[slot].toggled).toBe(true);
    const enemyBefore = enemy.hp;
    const pudgeAfterOn = pudge.hp;
    sim.run(1.0);
    expect(pudge.hp).toBeLessThan(pudgeAfterOn); // self-drain while on
    expect(enemy.hp).toBeLessThan(enemyBefore); // rot damages a nearby enemy

    sim.order(pudge.uid, { kind: 'cast', slot });
    sim.run(0.4);
    expect(pudge.abilities[slot].toggled).toBe(false);
    const settled = pudge.hp;
    sim.run(1.0);
    expect(pudge.hp).toBeGreaterThanOrEqual(settled); // drain stopped (regen may tick up)
  });
});
