import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../../data/index';
import { REG } from '../../core/registry';
import { Game, newGameSave } from '../../systems/game';
import { tagBoonPowerScore, tagBudgetTier } from '../../data/tag-boons';
import { heroesWithTagBoon } from './coverage';
import type { GameSave, SimEvent } from '../../core/types';

// ============================================================
// §3.2 tag-in / §3.3 gating / §5 V5 — the swap TRIGGER and GATING.
// The boon's per-kind effect math is already proven by the §3.2
// kind harness; what is new is when it fires: gauge-gated tag-in,
// tag-out boons, combat eligibility, and the §4 power budget. The
// chain-amp + reposition cells live in gameplay-overhaul.test.ts.
// ============================================================

beforeAll(() => registerAllContent());

function bench(active: string, ...benched: string[]): GameSave {
  const save = newGameSave(active);
  for (const id of benched) {
    const rosterEntry = newGameSave(id).roster[0];
    save.recruited.push(id);
    save.party.push(id);
    save.roster.push(rosterEntry);
  }
  return save;
}

function tagBoonEvents(game: Game, when: 'tag-in' | 'tag-out'): Extract<SimEvent, { t: 'tag-boon' }>[] {
  return game.sim.events.history.filter(
    (e): e is Extract<SimEvent, { t: 'tag-boon' }> => e.t === 'tag-boon' && e.when === when
  );
}

describe('tag-in: trigger fires only when the gauge is ready and in combat', () => {
  it('a gauge-ready swap in combat fires the tag-in boon and re-arms the gauge', () => {
    const game = Game.headless(bench('juggernaut', 'earthshaker'));
    game.sim.events.captureAll = true;
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time; // recently in combat
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
    enemy.ctrl = { kind: 'none' };
    const gaugeBefore = game.party[1].tagGaugeReadyAt;

    expect(game.trySwap(1)).toBe(true);

    expect(tagBoonEvents(game, 'tag-in').length).toBe(1); // the trigger fired
    expect(enemy.statuses.some((s) => s.status === 'stun')).toBe(true); // Earthshaker's Lockdown landed
    expect(game.party[1].tagGaugeReadyAt).toBeGreaterThan(gaugeBefore); // gauge re-armed
    expect(game.party[1].tagGaugeReadyAt).toBeGreaterThan(game.sim.time);
  });

  it('negative control: with the gauge DOWN the swap repositions but fires nothing', () => {
    const game = Game.headless(bench('juggernaut', 'earthshaker'));
    game.sim.events.captureAll = true;
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time; // in combat — isolate the gauge as the only gate
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
    enemy.ctrl = { kind: 'none' };
    game.party[1].tagGaugeReadyAt = game.sim.time + 30; // gauge not ready

    expect(game.trySwap(1)).toBe(true); // reposition still succeeds
    expect(game.activeIdx).toBe(1); // the hero swapped in
    expect(tagBoonEvents(game, 'tag-in').length).toBe(0); // gating lives outside the effect resolver
    expect(enemy.statuses.some((s) => s.status === 'stun')).toBe(false); // no stun fired
  });

  it('negative control: a fully out-of-combat swap wastes nothing', () => {
    const game = Game.headless(bench('juggernaut', 'earthshaker'));
    game.sim.events.captureAll = true;
    const active = game.activeUnit()!;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
    enemy.ctrl = { kind: 'none' };
    // no lastEnemyDamageAt → not recently in combat

    expect(game.trySwap(1)).toBe(true);
    expect(tagBoonEvents(game, 'tag-in').length).toBe(0); // boon not spent out of combat
    expect(enemy.statuses.some((s) => s.status === 'stun')).toBe(false);
  });
});

describe('tag-in: tag-out boons fire on swap-OUT, not swap-in', () => {
  it("Warlock's Imprint leaves its Fatal Bond field when he tags OUT", () => {
    const game = Game.headless(bench('warlock', 'juggernaut'));
    game.sim.events.captureAll = true;
    const warlock = game.activeUnit()!;
    warlock.lastEnemyDamageAt = game.sim.time;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: warlock.pos.x + 120, y: warlock.pos.y } });
    enemy.ctrl = { kind: 'none' };
    game.party[0].tagGaugeReadyAt = game.sim.time; // ready to fire on the way out
    const zonesBefore = game.sim.zones.length;

    expect(game.trySwap(1)).toBe(true); // warlock tags OUT

    expect(tagBoonEvents(game, 'tag-out').length).toBe(1);
    expect(game.sim.zones.length).toBeGreaterThan(zonesBefore); // Fatal Bond field dropped behind him
  });
});

describe('tag-in: §4 power budget + census coverage', () => {
  it('every hero ships a tagBoon whose power score sits inside its role tier', () => {
    const BANDS: Record<string, [number, number]> = {
      hypercarry: [10, 50],
      striker: [10, 60],
      frontline: [18, 110],
      support: [38, 150]
    };
    for (const hero of ALL_HEROES) {
      expect(hero.tagBoon, `${hero.id}: tagBoon`).toBeDefined();
      const tier = tagBudgetTier(hero);
      const score = tagBoonPowerScore(hero.tagBoon!);
      const [lo, hi] = BANDS[tier];
      expect(score, `${hero.id} (${tier}) score ${score.toFixed(1)} out of band`).toBeGreaterThanOrEqual(lo);
      expect(score, `${hero.id} (${tier}) score ${score.toFixed(1)} out of band`).toBeLessThanOrEqual(hi);
    }
  });

  it('the census walks tagBoon effects (no hero ships an uncovered boon)', () => {
    expect(heroesWithTagBoon().length).toBe(ALL_HEROES.length);
  });
});
