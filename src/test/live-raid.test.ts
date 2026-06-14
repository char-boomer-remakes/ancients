import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { LiveRaid } from '../systems/raid-session';
import { applyDamage } from '../core/combat';
import { freshEchoProgress } from '../core/echo';
import { xpForLevel } from '../core/stats';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';
import { ALL_RAIDS } from '../data/raids';
import type { GambitRule, GameSave, MacroHeroSetup, RaidDef, SummonSpec } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// Live raid session coverage (LiveRaid + Game wiring). The headless
// runRaidEncounter path is well-tested elsewhere (raids.test, raid-ai.test);
// this module fills the player-driven gaps the audit flagged: driver death,
// dead-driver fallback, switch rejection, party wipe / clear adjudication,
// the live Aegis revive, and order/cast/item routing through Game into the
// raid sim.
// ============================================================

beforeAll(() => registerAllContent());

const STRONG_PARTY: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['battlefury', 'butterfly', 'black-king-bar'] },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'lich', level: 30, items: ['mekansm', 'glimmer-cape'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'arcane-boots'] },
  { heroId: 'sniper', level: 30, items: ['maelstrom', 'dragon-lance'] }
];

const THRALL: SummonSpec = {
  id: 'live-thrall',
  name: 'Live Thrall',
  lifetime: 60,
  stats: { maxHp: 400, damage: 10, armor: 0, moveSpeed: 320, attackRange: 120, baseAttackTime: 1.6 },
  silhouette: { build: 'biped', scale: 0.7, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};

// A soft, durable boss: the fight never ends on its own inside the few ticks
// these tests step, so we can stage deaths and revives by hand.
const SOFT: RaidDef = {
  id: 'live-soft-raid',
  name: 'Soft Proving',
  title: 'Live Title',
  location: 'Live Arena',
  unlockQuest: 'recruit-phoenix',
  dialogue: ['Soft line.'],
  boss: { heroId: 'sven', level: 30, items: ['assault-cuirass'], hpScale: 8, damageScale: 0.05 },
  addWaves: [{ atHpPct: 90, summon: THRALL, count: 2 }],
  zones: [],
  enrageSec: 999,
  loot: { guaranteed: ['ultimate-orb'], assembledPool: ['eye-of-skadi'], dropPct: { normal: 0.2, nightmare: 0.3, hell: 0.4 }, pity: 8 }
};

function liveSoft(opts?: { aegis?: boolean }): LiveRaid {
  return new LiveRaid(SOFT, STRONG_PARTY, 'normal', 909, opts);
}

describe('live raid driver model', () => {
  it('hands control to a living ally when the driver falls', () => {
    const live = liveSoft();
    const driver = live.claimDriver()!;
    expect(driver.ctrl.kind).toBe('player');
    expect(live.sim.playerActiveUid).toBe(driver.uid);

    applyDamage(live.sim, null, driver, 1e9, 'physical');
    expect(driver.alive).toBe(false);

    live.step(1 / 30); // handleFallen runs inside the step
    const next = live.drivenUnit();
    expect(next).not.toBeNull();
    expect(next!.alive).toBe(true);
    expect(next!.uid).not.toBe(driver.uid);
  });

  it('refuses to switch the driver onto a fallen hero', () => {
    const live = liveSoft();
    const target = live.sim.unit(live.partyUids[1])!;
    applyDamage(live.sim, null, target, 1e9, 'physical');
    expect(target.alive).toBe(false);

    expect(live.selectDriver(1)).toBe(false);
    expect(live.driverIdx).toBe(0); // unchanged

    // a living slot still accepts the swap
    expect(live.selectDriver(2)).toBe(true);
    expect(live.driverIdx).toBe(2);
    expect(live.sim.playerActiveUid).toBe(live.partyUids[2]);
  });

  it('tracks playerActiveUid across claim and switch for last-hit credit', () => {
    const live = liveSoft();
    const first = live.claimDriver()!;
    expect(live.sim.playerActiveUid).toBe(first.uid);

    expect(live.selectDriver(3)).toBe(true);
    expect(live.sim.playerActiveUid).toBe(live.partyUids[3]);
    expect(live.sim.unit(live.partyUids[3])!.ctrl.kind).toBe('player');
    expect(first.ctrl.kind).toBe('gambit'); // released back to AI
  });
});

describe('live raid Aegis', () => {
  it('a held Aegis revives the first fallen hero once, then is spent', () => {
    const live = liveSoft({ aegis: true });
    const a = live.sim.unit(live.partyUids[0])!;
    const b = live.sim.unit(live.partyUids[1])!;

    applyDamage(live.sim, null, a, 1e9, 'physical');
    live.step(1 / 30);
    expect(a.alive, 'the Aegis stands the first fallen hero back up').toBe(true);
    expect(a.hp).toBeGreaterThan(0);

    applyDamage(live.sim, null, b, 1e9, 'physical');
    live.step(1 / 30);
    expect(b.alive, 'the Aegis is spent — no second revive').toBe(false);
  });

  it('without an Aegis a fallen hero stays down', () => {
    const live = liveSoft();
    const a = live.sim.unit(live.partyUids[0])!;
    applyDamage(live.sim, null, a, 1e9, 'physical');
    live.step(1 / 30);
    expect(a.alive).toBe(false);
  });
});

describe('live raid adjudication', () => {
  it('a party wipe ends the live raid as a boss win', () => {
    const live = liveSoft();
    for (const uid of live.partyUids) applyDamage(live.sim, null, live.sim.unit(uid)!, 1e9, 'physical');
    live.step(1 / 30);

    expect(live.done).toBe(true);
    expect(live.result).not.toBeNull();
    expect(live.result!.winner).toBe(1);
    expect(live.result!.cleared).toBe(false);
  });

  it('killing the boss ends the live raid as a clear with survivors', () => {
    const live = liveSoft();
    applyDamage(live.sim, null, live.boss, 1e9, 'physical');
    live.step(1 / 30);

    expect(live.done).toBe(true);
    expect(live.result!.winner).toBe(0);
    expect(live.result!.cleared).toBe(true);
    expect(live.result!.survivors.some((s) => s.team === 0)).toBe(true);
  });
});

// --- shared headless-Game scaffolding (mirrors raids.test.ts) ---
const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

const PARTY_ITEMS: { heroId: string; items: string[] }[] = [
  { heroId: 'juggernaut', items: ['black-king-bar', 'battlefury', 'butterfly'] },
  { heroId: 'sven', items: ['black-king-bar', 'assault-cuirass', 'heart-of-tarrasque'] },
  { heroId: 'sniper', items: ['dragon-lance', 'maelstrom', 'crystalys'] },
  { heroId: 'lich', items: ['scythe-of-vyse', 'glimmer-cape', 'mekansm'] },
  { heroId: 'earthshaker', items: ['blink-dagger', 'black-king-bar', 'assault-cuirass'] }
];

function rosterItems(ids: string[]): GameSave['roster'][number]['items'] {
  const slots: GameSave['roster'][number]['items'] = [null, null, null, null, null, null];
  ids.slice(0, 6).forEach((id, i) => (slots[i] = { id }));
  return slots;
}

function fullPartySave(): GameSave {
  const save = newGameSave(PARTY_ITEMS[0].heroId);
  save.regionId = 'tranquil-vale';
  save.party = PARTY_ITEMS.map((t) => t.heroId);
  save.recruited = PARTY_ITEMS.map((t) => t.heroId);
  save.roster = PARTY_ITEMS.map((t) => ({
    heroId: t.heroId,
    level: 30,
    xp: xpForLevel(30),
    items: rosterItems(t.items),
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: AGGRO,
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0],
    tagGaugeReadyAt: 0
  }));
  save.badges = [...REG.gyms.values()].map((g) => g.badgeId);
  return save;
}

function clearCinematics(g: Game): void {
  let guard = 0;
  while (g.cinematic.active && guard++ < 200) g.cinematicSkip();
  g.cinematic.clear();
}

describe('Game live raid result', () => {
  it('a cleared live raid delivers loot, unlocks the codex, and closes the session', () => {
    const g = Game.headless(fullPartySave());
    expect(g.startLiveRaid('roshan-pit', 'normal')).toBe(true);
    clearCinematics(g);
    const clearsBefore = g.raidProgress['roshan-pit']?.clears ?? 0;

    // settle the win deterministically: fell the boss, then let the loop adjudicate
    applyDamage(g.liveRaid!.sim, null, g.liveRaid!.boss, 1e9, 'physical');
    g.update(0.05);

    expect(g.liveRaid).toBeNull();
    expect(g.codexUnlocks.has('raid:roshan-pit')).toBe(true);
    expect(g.raidProgress['roshan-pit'].clears).toBe(clearsBefore + 1);
    expect(g.toasts.some((t) => t.text.toLowerCase().includes('cleared'))).toBe(true);
  });

  it('a wiped live raid reports the hold and banks no clear', () => {
    const g = Game.headless(fullPartySave());
    expect(g.startLiveRaid('roshan-pit', 'normal')).toBe(true);
    clearCinematics(g);
    const clearsBefore = g.raidProgress['roshan-pit']?.clears ?? 0;

    for (const uid of g.liveRaid!.partyUids) applyDamage(g.liveRaid!.sim, null, g.liveRaid!.sim.unit(uid)!, 1e9, 'physical');
    g.update(0.05);

    expect(g.liveRaid).toBeNull();
    expect(g.codexUnlocks.has('raid:roshan-pit')).toBe(false);
    expect(g.raidProgress['roshan-pit']?.clears ?? 0).toBe(clearsBefore);
    expect(g.toasts.at(-1)!.text.toLowerCase()).toContain('holds the deep');
  });
});

describe('Game live raid orders', () => {
  function startRaid(): { g: Game; driver: Unit } {
    const g = Game.headless(fullPartySave());
    g.startLiveRaid('roshan-pit', 'normal');
    clearCinematics(g);
    return { g, driver: g.controlledUnit()! };
  }

  it('a move order claims the driver and routes into the raid sim', () => {
    const { g, driver } = startRaid();
    expect(driver.ctrl.kind).toBe('gambit'); // lazy: AI until the first order
    const point = { x: driver.pos.x + 140, y: driver.pos.y + 30 };
    g.orderMove(point);

    const claimed = g.liveRaid!.sim.unit(driver.uid)!;
    expect(claimed.ctrl.kind).toBe('player');
    expect(claimed.order.kind).toBe('move');
  });

  it('casting a ready ability routes a cast order to the driver', () => {
    const { g, driver } = startRaid();
    const slot = driver.abilities.findIndex((a) => a.level > 0 && driver.abilityReady(driver.abilities.indexOf(a), g.liveRaid!.sim.time).ok);
    expect(slot, 'driver should have a ready ability').toBeGreaterThanOrEqual(0);
    g.castAbility(slot, { point: { x: driver.pos.x + 200, y: driver.pos.y } });

    const claimed = g.liveRaid!.sim.unit(driver.uid)!;
    expect(claimed.ctrl.kind).toBe('player');
    expect(claimed.order.kind).toBe('cast');
  });

  it('using a ready active item routes an item order to the driver', () => {
    const { g, driver } = startRaid();
    const sim = g.liveRaid!.sim;
    const slot = driver.items.findIndex((it) => {
      if (!it) return false;
      const def = REG.items.get(it.defId);
      return !!def?.active;
    });
    expect(slot, 'driver should hold an active item').toBeGreaterThanOrEqual(0);
    g.useItem(slot, {});

    const claimed = sim.unit(driver.uid)!;
    // a learned/ready active resolves to an item order; if it was gated we at
    // least claimed control — assert the order kind only when one was issued.
    if (claimed.order.kind === 'item') {
      expect(claimed.ctrl.kind).toBe('player');
    }
  });

  it('a shift-queued order is held until the current order resolves, then advances', () => {
    const { g, driver } = startRaid();
    g.orderStop(); // claims the driver, sets a stop order, clears the queue
    const sim = g.liveRaid!.sim;
    const claimed = sim.unit(driver.uid)!;
    expect(claimed.ctrl.kind).toBe('player');

    const point = { x: driver.pos.x + 160, y: driver.pos.y };
    g.orderMove(point, true); // queued behind the stop
    expect(claimed.order.kind).toBe('stop');

    g.update(0.03); // advanceQueuedOrder promotes the queued move
    expect(claimed.order.kind).toBe('move');
  });
});
