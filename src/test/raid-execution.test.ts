import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { runRaidEncounter, setupRaidSim } from '../core/macro';
import { rollLoot } from '../core/phase3';
import { applyDamage } from '../core/combat';
import { REG } from '../core/registry';
import { ALL_RAIDS } from '../data/raids';
import type { EffectCtx } from '../core/effects';
import type { MacroHeroSetup, RaidDef, SummonSpec } from '../core/types';

// ============================================================
// PROGRESSION_OVERHAUL §4.1 — raids are full-party EXECUTION, not
// "open a loot box after a big HP bar": threat picks a tank, taunts
// override it, a healer saves the focused ally, add waves spawn on
// schedule, and a telegraphed zone is dodge-able without touching the
// (seed-determined) loot. §4.1 also makes the Aghanim Scepter/Shard the
// headline int-lane chase — the Shard must actually be obtainable.
// ============================================================

beforeAll(() => registerAllContent());

const THRALL: SummonSpec = {
  id: 'exec-thrall',
  name: 'Execution Thrall',
  lifetime: 60,
  stats: { maxHp: 400, damage: 10, armor: 0, moveSpeed: 320, attackRange: 120, baseAttackTime: 1.6 },
  silhouette: { build: 'biped', scale: 0.7, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};

const STRONG_PARTY: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['battlefury', 'butterfly', 'black-king-bar'] },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'lich', level: 30, items: ['mekansm', 'glimmer-cape'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'arcane-boots'] },
  { heroId: 'sniper', level: 30, items: ['maelstrom', 'dragon-lance'] }
];

describe('PROGRESSION §4.1 — threat decides the tank, taunt overrides it', () => {
  it('the boss fixes onto the hero who built the most threat', () => {
    const sim = setupRaidSim({
      seed: 7,
      party: [{ heroId: 'axe', level: 24 }, { heroId: 'sniper', level: 24 }],
      boss: { heroId: 'tidehunter', level: 26, hpScale: 4, damageScale: 0.4 },
      maxSec: 20
    });
    const axe = sim.unitsArr.find((u) => u.heroId === 'axe')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    // the durable hero spends threat to peel the boss off the squishy backline
    applyDamage(sim, axe, boss, 700, 'physical', { ignoreArmor: true });
    sim.run(0.5);
    expect(boss.ctrl.focusUid).toBe(axe.uid);
  });

  it('a taunt overrides the threat table outright', () => {
    const sim = setupRaidSim({
      seed: 99,
      party: [{ heroId: 'axe', level: 24 }, { heroId: 'sniper', level: 24 }],
      boss: { heroId: 'tidehunter', level: 26, hpScale: 3, damageScale: 1 },
      maxSec: 20
    });
    const axe = sim.unitsArr.find((u) => u.heroId === 'axe')!;
    const sniper = sim.unitsArr.find((u) => u.heroId === 'sniper')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    // sniper builds the threat lead...
    applyDamage(sim, sniper, boss, 600, 'physical', { ignoreArmor: true });
    sim.run(0.5);
    expect(boss.ctrl.focusUid).toBe(sniper.uid);
    // ...but a taunt drags the boss back onto the tank regardless of the table
    boss.addStatus({ status: 'taunt', tag: 'axe-taunt', sourceUid: axe.uid, sourceTeam: axe.team, until: sim.time + 2, isDebuff: true });
    boss.refresh(sim.time);
    sim.run(0.5);
    expect(boss.order).toMatchObject({ kind: 'attack-unit', uid: axe.uid });
  });
});

describe('PROGRESSION §4.1 — healing windows and add control', () => {
  it('a Mekansm healer tops a wounded ally back up (the save window)', () => {
    const sim = setupRaidSim({
      seed: 11,
      party: [{ heroId: 'sven', level: 28, items: ['black-king-bar'] }, { heroId: 'omniknight', level: 28, items: [] }],
      // a harmless boss: the only thing that can move the carry's HP is the healer
      boss: { heroId: 'drow-ranger', level: 20, hpScale: 10, damageScale: 0 },
      maxSec: 30
    });
    const sven = sim.unitsArr.find((u) => u.heroId === 'sven')!;
    const omni = sim.unitsArr.find((u) => u.heroId === 'omniknight')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    // keep the healer beside the carry so the save window is about the decision, not pathing
    omni.pos = { x: sven.pos.x + 60, y: sven.pos.y };
    sim.rebuildSpatial();
    // wound the carry past the healer's save threshold
    applyDamage(sim, boss, sven, sven.stats.maxHp * 0.78, 'physical', { ignoreArmor: true });
    const before = sven.hp / sven.stats.maxHp;
    expect(before).toBeLessThan(0.3);
    sim.run(8);
    const after = sven.hp / sven.stats.maxHp;
    // Purification is a large targeted heal — well beyond passive regen over the window
    expect(after - before, 'the healer answered the save window').toBeGreaterThan(0.1);
  });

  it('add waves enter the sim on their HP-gated schedule', () => {
    const def: RaidDef = {
      id: 'exec-add-raid',
      name: 'Add Proving',
      title: 'Test',
      location: 'Arena',
      unlockQuest: 'recruit-phoenix',
      dialogue: ['line'],
      boss: { heroId: 'sven', level: 30, items: ['assault-cuirass'], hpScale: 4, damageScale: 0.25 },
      addWaves: [{ atHpPct: 90, summon: THRALL, count: 3 }],
      zones: [],
      enrageSec: 60,
      loot: { guaranteed: ['ultimate-orb'], assembledPool: ['eye-of-skadi'], dropPct: { normal: 0.2, nightmare: 0.3, hell: 0.4 }, pity: 8 }
    };
    const r = runRaidEncounter({ def, party: STRONG_PARTY, tier: 'normal', seed: 4242, maxSec: 90, captureEvents: true });
    const wave = r.fired.find((f) => f.kind === 'add-wave');
    expect(wave, 'the add wave fired').toBeTruthy();
    expect(wave!.bossHpPct).toBeLessThanOrEqual(90); // armed only once the boss dipped under the threshold
    const summons = r.sim.events.history.filter((e) => e.t === 'summon');
    expect(summons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('PROGRESSION §4.1 — telegraphs are dodge-able, loot is seed-locked', () => {
  it('a hero standing in a hostile zone walks out of it', () => {
    const sim = setupRaidSim({
      seed: 5,
      party: [{ heroId: 'sven', level: 24 }, { heroId: 'sniper', level: 24 }],
      boss: { heroId: 'tidehunter', level: 26, hpScale: 8, damageScale: 0.1 },
      maxSec: 20
    });
    const hero = sim.unitsArr.find((u) => u.heroId === 'sniper')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const center = { ...hero.pos };
    const radius = 300;
    const ctx: EffectCtx = { defId: 'exec:telegraph', level: 24, vfx: { archetype: 'ground-aoe', color: '#ff7a3a', color2: '#ffd27a' } };
    sim.addZone({
      caster: boss,
      ctx,
      spec: { shape: 'circle', radius, duration: 6, tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 60, target: 'target' }] } },
      duration: 6,
      pos: center,
      radius
    });
    sim.run(3);
    const dx = hero.pos.x - center.x;
    const dy = hero.pos.y - center.y;
    expect(Math.hypot(dx, dy), 'the hero dodged out of the telegraph').toBeGreaterThan(radius);
  });

  it('loot rolls depend only on the seed, never on how the fight played out', () => {
    const def = ALL_RAIDS.find((r) => r.id === 'lord-of-hatred')!;
    // Same seed → identical drop, regardless of dodges/positioning in the live fight.
    const a = rollLoot(def.loot, 'hell', 0, 9001, undefined, 'raid');
    const b = rollLoot(def.loot, 'hell', 0, 9001, undefined, 'raid');
    expect(a.guaranteed.map((g) => g.id)).toEqual(b.guaranteed.map((g) => g.id));
    expect(a.assembled?.id).toEqual(b.assembled?.id);
  });
});

describe('PROGRESSION §4.1 — the Aghanim chase anchors in the int lane', () => {
  it('an int-lane boss can hand out the Aghanim Shard', () => {
    expect(REG.boss('boss-invoker').loot.assembledPool).toContain('aghanims-shard');
    expect(REG.boss('boss-zeus').loot.assembledPool).toContain('aghanims-shard');
  });

  it('every int-lane raid lists the Shard as a chase anchor', () => {
    const intRaids = ALL_RAIDS.filter((r) => r.loot.guaranteed.includes('mystic-staff'));
    expect(intRaids.length).toBeGreaterThan(0);
    expect(intRaids.every((r) => r.loot.assembledPool.includes('aghanims-shard'))).toBe(true);
  });

  it('a determined int-raid grind actually yields a Shard (the chase is real)', () => {
    const def = ALL_RAIDS.find((r) => r.id === 'lord-of-hatred')!;
    let got = false;
    for (let s = 0; s < 600 && !got; s++) {
      const roll = rollLoot(def.loot, 'hell', 0, s * 7 + 1, undefined, 'raid');
      if (roll.assembled?.id === 'aghanims-shard') got = true;
    }
    expect(got).toBe(true);
  });
});
