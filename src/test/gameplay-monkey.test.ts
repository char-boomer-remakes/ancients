import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Rng } from '../core/rng';
import { freshEchoProgress } from '../core/echo';
import { makeItemState } from '../core/items';
import { xpForLevel } from '../core/stats';
import { Game, newGameSave } from '../systems/game';
import { checkSimInvariants } from './pressure/_fuzz';
import type { GameSave, Vec2 } from '../core/types';

// ============================================================
// PURPLE TEAM — the monkey at the keyboard.
//
// A real player does not issue a tidy script of legal moves. They
// spam-click the map, mash ability keys with no target, sell the wrong
// slot, drag items into nowhere, swap heroes on cooldown, claim quests
// that aren't done, and wander into spawn camps. This suite drives the
// LIVE headless Game through a seeded stream of exactly that — every
// player/HUD-reachable verb, with mostly-random (often illegal) args —
// and asserts the two things that must ALWAYS hold no matter the input:
//
//   1. No action throws. A button a player can press must never crash
//      the game, whatever the current state.
//   2. The world stays well-formed. After every step the sim satisfies
//      the universal invariants (finite/in-bounds positions, hp/mana in
//      range, alive<->hp agreement) and the wallet never goes negative.
//
// A failure prints the seed + step + action so it replays deterministically.
// ============================================================

beforeAll(() => registerAllContent());

function fullSave(team = ['juggernaut', 'sven', 'sniper', 'lich', 'earthshaker']): GameSave {
  const save = newGameSave(team[0]);
  save.party = [...team];
  save.recruited = [...team];
  save.roster = team.map((heroId) => ({
    heroId,
    level: 25,
    xp: xpForLevel(25),
    items: [null, null, null, null, null, null],
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: [],
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0],
    tagGaugeReadyAt: 0
  }));
  save.gold = 100_000;
  return save;
}

function skipCinematics(g: Game): void {
  let guard = 0;
  while (g.cinematic.active && guard++ < 200) g.cinematicSkip();
  g.cinematic.clear();
}

interface MonkeyFail {
  seed: number;
  step: number;
  action: string;
  detail: string;
}

function randomPoint(r: Rng, g: Game, wild: boolean): Vec2 {
  const u = g.activeUnit();
  const b = g.sim.bounds;
  if (wild) {
    // Deliberately off-map / extreme so clamping & sanitization get exercised.
    return { x: r.range(-50_000, b.w + 50_000), y: r.range(-50_000, b.h + 50_000) };
  }
  const base = u ? u.pos : { x: b.w / 2, y: b.h / 2 };
  return { x: base.x + r.range(-1500, 1500), y: base.y + r.range(-1500, 1500) };
}

function someCreepId(g: Game): string {
  return g.region.camps[0]?.creepId ?? [...REG.creeps.keys()][0];
}

function spawnSomeCreeps(g: Game, r: Rng): void {
  const u = g.activeUnit();
  if (!u) return;
  const def = REG.creep(someCreepId(g));
  const n = r.int(1, 4);
  for (let i = 0; i < n; i++) {
    const angle = r.range(0, Math.PI * 2);
    const dist = r.range(120, 500);
    const pos = { x: u.pos.x + Math.cos(angle) * dist, y: u.pos.y + Math.sin(angle) * dist };
    g.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...u.pos }, regionId: g.region.id });
  }
}

function randomUid(r: Rng, g: Game): number {
  const arr = g.sim.unitsArr;
  if (arr.length === 0 || r.chance(0.2)) return r.int(-5, 9999); // sometimes a garbage uid
  return arr[r.int(0, arr.length - 1)].uid;
}

/** Every player/HUD-reachable verb, keyed by name for diagnostic output. */
function actionTable(r: Rng, g: Game): { name: string; run: () => void }[] {
  const slot = () => r.int(0, 5);
  const recIdx = () => r.int(0, g.party.length - 1);
  const abilitySlot = () => r.int(0, 3);
  return [
    { name: 'orderMove', run: () => g.orderMove(randomPoint(r, g, r.chance(0.3))) },
    { name: 'orderAttackMove', run: () => g.orderAttackMove(randomPoint(r, g, r.chance(0.3))) },
    { name: 'orderStop', run: () => g.orderStop() },
    { name: 'orderAttack', run: () => g.orderAttack(randomUid(r, g)) },
    { name: 'castAbility', run: () => g.castAbility(abilitySlot(), r.chance(0.5) ? { point: randomPoint(r, g, false) } : { uid: randomUid(r, g) }) },
    { name: 'useItem', run: () => g.useItem(slot(), { point: randomPoint(r, g, false) }) },
    { name: 'buyItem', run: () => { const inv = g.region.shopInventory; if (inv.length) g.buyItem(inv[r.int(0, inv.length - 1)]); } },
    { name: 'sellItem', run: () => g.sellItem(slot()) },
    { name: 'dropHeroItemToGround', run: () => g.dropHeroItemToGround(slot()) },
    { name: 'moveHeroItem', run: () => g.moveHeroItem(slot(), slot()) },
    { name: 'levelAbility', run: () => g.levelAbility(recIdx(), abilitySlot()) },
    { name: 'buyMasteryNode', run: () => g.buyMasteryNode(recIdx(), r.int(0, 15)) },
    { name: 'trySwap', run: () => g.trySwap(r.int(0, g.party.length)) },
    { name: 'tryCapture', run: () => g.tryCapture(randomUid(r, g)) },
    { name: 'tryInteract', run: () => g.tryInteract() },
    { name: 'tryPickupGroundItem', run: () => g.tryPickupGroundItem(randomUid(r, g)) },
    { name: 'claimQuest', run: () => { const b = g.questBoard(); if (b.length) g.claimQuest(b[r.int(0, b.length - 1)].id); } },
    { name: 'spawnCreeps', run: () => spawnSomeCreeps(g, r) },
    { name: 'tick', run: () => { skipCinematics(g); g.update(r.range(0.02, 0.2)); } }
  ];
}

function checkState(g: Game): string | null {
  if (!Number.isFinite(g.gold) || g.gold < 0) return `gold corrupt: ${g.gold}`;
  if (!Number.isFinite(g.essence) || g.essence < 0) return `essence corrupt: ${g.essence}`;
  if (g.activeIdx < 0 || g.activeIdx >= g.party.length) return `activeIdx out of range: ${g.activeIdx}`;
  const violations = checkSimInvariants(g.sim);
  if (violations.length > 0) {
    const v = violations[0];
    return `sim invariant: uid ${v.uid} (${v.heroId}) ${v.field}: ${v.detail}`;
  }
  return null;
}

function runMonkey(seed: number, steps: number): MonkeyFail[] {
  const r = new Rng(seed >>> 0);
  const g = Game.headless(fullSave());
  skipCinematics(g);
  // Seed the hero with a couple of items so sell/drop/move have something to chew on.
  const u0 = g.activeUnit();
  if (u0) {
    u0.items[0] = makeItemState(REG.item('broadsword'));
    u0.items[1] = makeItemState(REG.item('claymore'));
    u0.markStatsDirty();
    u0.refresh(g.sim.time);
  }

  const fails: MonkeyFail[] = [];
  for (let step = 0; step < steps; step++) {
    const table = actionTable(r, g);
    const action = table[r.int(0, table.length - 1)];
    try {
      action.run();
    } catch (e) {
      fails.push({ seed, step, action: action.name, detail: `THREW: ${(e as Error).message ?? e}` });
      break; // a crash is terminal; stop and report it
    }
    const bad = checkState(g);
    if (bad) {
      fails.push({ seed, step, action: action.name, detail: bad });
      break;
    }
  }
  return fails;
}

describe('monkey play — no player input ever crashes or corrupts the world', () => {
  const SEEDS = [1, 7, 42, 1337, 90210];
  for (const seed of SEEDS) {
    it(`survives 400 random actions (seed ${seed})`, () => {
      const fails = runMonkey(seed, 400);
      if (fails.length > 0) {
        const f = fails[0];
        expect.fail(`[seed ${f.seed} step ${f.step}] ${f.action} -> ${f.detail}`);
      }
    });
  }
});
