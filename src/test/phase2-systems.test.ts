import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { runGymMatch, setupCaptainCallSmoke } from '../systems/macro-session';

beforeAll(() => registerAllContent());

describe('Phase 2 gyms and Captain Calls', () => {
  it('runs Lunar Gym as a best-of-3 macro match', () => {
    const gym = REG.gym('lunar-gym');
    const result = runGymMatch(
      gym,
      [
        { heroId: 'juggernaut', level: 18, items: ['battlefury', 'black-king-bar'] },
        { heroId: 'crystal-maiden', level: 18, items: ['glimmer-cape', 'euls-scepter'] },
        { heroId: 'pudge', level: 18, items: ['blink-dagger'] },
        { heroId: 'earthshaker', level: 18, items: ['blink-dagger', 'force-staff'] },
        { heroId: 'sniper', level: 18, items: ['dragon-lance', 'maelstrom'] }
      ],
      777
    );

    expect(result.rounds.length).toBeGreaterThanOrEqual(2);
    expect(result.rounds.length).toBeLessThanOrEqual(3);
    expect([0, 1, -1]).toContain(result.winner);
    expect(result.playerWins + result.enemyWins).toBeGreaterThan(0);
  });

  it('Captain Call temporarily swaps a gambit hero to player control and reverts', () => {
    const gym = REG.gym('lunar-gym');
    const { sim, captain } = setupCaptainCallSmoke(
      gym,
      [
        { heroId: 'juggernaut', level: 14 },
        { heroId: 'crystal-maiden', level: 14 },
        { heroId: 'pudge', level: 14 },
        { heroId: 'earthshaker', level: 14 },
        { heroId: 'sniper', level: 14 }
      ],
      991
    );
    const caller = sim.unitsArr.find((u) => u.team === 0 && u.kind === 'hero')!;
    expect(caller.ctrl.kind).toBe('gambit');
    expect(captain.activate(sim, caller.uid)).toBe(true);
    expect(caller.ctrl.kind).toBe('player');
    expect(captain.remaining).toBe(2);

    sim.run(5.2);
    captain.tick(sim);
    expect(caller.ctrl.kind).toBe('gambit');
    expect(captain.activeUid).toBeNull();
  });
});
