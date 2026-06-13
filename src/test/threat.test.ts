import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupRaidSim } from '../core/macro';
import { healUnit } from '../core/combat';
import { creditHealingThreat, pickThreatTarget, tauntToTop, topThreat } from '../core/threat';
import { makeItemState } from '../core/items';
import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';
import type { Unit } from '../core/unit';

// ============================================================
// AI_OVERHAUL A4: redesigned threat model — healing threat to the
// healer and the melee/ranged aggro ceiling that stops target jitter.
// ============================================================

beforeAll(() => registerAllContent());

function raid(party: string[], bossId = 'sven') {
  const sim = setupRaidSim({
    seed: 31,
    party: party.map((heroId) => ({ heroId, level: 18 })),
    boss: { heroId: bossId, level: 22, hpScale: 3, damageScale: 1 },
    maxSec: 30
  });
  const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
  const get = (heroId: string) => sim.unitsArr.find((u) => u.team === 0 && u.heroId === heroId)!;
  return { sim, boss, get };
}

describe('healing threat', () => {
  it('credits effective healing to the healer on the boss table', () => {
    const { sim, boss, get } = raid(['crystal-maiden', 'sniper']);
    const cm = get('crystal-maiden');
    const sniper = get('sniper');
    // bring the healer into the fight so healing threat is in leash range
    cm.pos = { x: boss.pos.x - 400, y: boss.pos.y };

    sniper.hp = sniper.stats.maxHp * 0.4;
    const healed = healUnit(sim, sniper, 300, cm);
    expect(healed).toBeCloseTo(300, 0);

    const expected = 300 * TUNING.threat.healMult * TUNING.threat.supportMult; // cm is support
    expect(boss.ctrl.threat![cm.uid]).toBeCloseTo(expected, 1);
  });

  it('overhealing generates no threat', () => {
    const { sim, boss, get } = raid(['crystal-maiden', 'sniper']);
    const cm = get('crystal-maiden');
    cm.pos = { x: boss.pos.x - 400, y: boss.pos.y };
    // sniper at full hp: the heal is pure overheal
    const sniper = get('sniper');
    sniper.hp = sniper.stats.maxHp;
    healUnit(sim, sniper, 300, cm);
    expect(boss.ctrl.threat![cm.uid]).toBeUndefined();
  });

  it('a heal far from the fight is out of leash and credits nothing', () => {
    const { sim, boss, get } = raid(['crystal-maiden', 'sniper']);
    const cm = get('crystal-maiden');
    const sniper = get('sniper');
    cm.pos = { x: boss.pos.x - (TUNING.threat.healLeash + 600), y: boss.pos.y };
    sniper.hp = sniper.stats.maxHp * 0.4;
    creditHealingThreat(sim, cm, 300);
    expect(boss.ctrl.threat![cm.uid]).toBeUndefined();
  });
});

describe('aggro ceiling (swap threshold)', () => {
  function setup() {
    const { sim, boss, get } = raid(['axe', 'sniper', 'juggernaut']);
    const axe = get('axe');          // melee tank, the held target
    const sniper = get('sniper');    // ranged challenger
    const jugg = get('juggernaut');  // melee challenger
    boss.ctrl.focusUid = axe.uid;
    return { sim, boss, axe, sniper, jugg };
  }

  it('a ranged challenger needs 130% of the held threat to pull', () => {
    const { sim, boss, axe, sniper } = setup();
    boss.ctrl.threat = { [axe.uid]: 1000, [sniper.uid]: 1200 };
    expect((pickThreatTarget(sim, boss) as Unit).uid).toBe(axe.uid); // 1200 < 1300, no pull

    boss.ctrl.threat = { [axe.uid]: 1000, [sniper.uid]: 1400 };
    expect((pickThreatTarget(sim, boss) as Unit).uid).toBe(sniper.uid); // 1400 >= 1300, pulls
  });

  it('a melee challenger needs only 110% to pull', () => {
    const { sim, boss, axe, jugg } = setup();
    boss.ctrl.threat = { [axe.uid]: 1000, [jugg.uid]: 1050 };
    expect((pickThreatTarget(sim, boss) as Unit).uid).toBe(axe.uid); // 1050 < 1100, no pull

    boss.ctrl.threat = { [axe.uid]: 1000, [jugg.uid]: 1150 };
    expect((pickThreatTarget(sim, boss) as Unit).uid).toBe(jugg.uid); // 1150 >= 1100, pulls
  });

  it('taunt lifts the taunter to the top so it holds aggro after the taunt', () => {
    const { sim, boss, axe, sniper } = setup();
    boss.ctrl.threat = { [axe.uid]: 400, [sniper.uid]: 2000 };
    tauntToTop(boss.ctrl.threat, axe.uid);
    expect(boss.ctrl.threat[axe.uid]).toBe(topThreat(boss.ctrl.threat));
    // with axe now tied at the top and already the held target, the ranged carry can't pull
    expect((pickThreatTarget(sim, boss) as Unit).uid).toBe(axe.uid);
  });
});

describe('threat drops', () => {
  it('save items can reduce a protected ally threat entry', () => {
    const { sim, boss, get } = raid(['crystal-maiden', 'sniper']);
    const cm = get('crystal-maiden');
    const sniper = get('sniper');
    const slot = cm.items.findIndex((s) => s === null);
    cm.items[slot] = makeItemState(REG.item('glimmer-cape'));
    cm.mana = 999;

    boss.ctrl.threat = { [sniper.uid]: 1000, [cm.uid]: 500 };
    sim.fireItemActive(cm, slot, sniper);

    expect(boss.ctrl.threat[sniper.uid]).toBeCloseTo(550, 1);
    expect(boss.ctrl.threat[cm.uid]).toBe(500);
  });
});
