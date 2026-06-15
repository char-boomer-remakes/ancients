import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { runMacroBattle, setupMacroSim, type MacroSetup } from '../core/macro';
import {
  BOARD_COLS,
  BOARD_ROWS,
  DRAFT_TEAM_SIZE,
  DOCTRINES,
  counterFormation,
  defaultFormation,
  doctrineFormation,
  fitFormationToBoard,
  slotToWorld,
  type BoardSlot,
  type Formation
} from '../core/board';
import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';

/** Every placement sits in a distinct, in-bounds cell. */
function expectLegalBoard(formation: Formation, expectedCount = DRAFT_TEAM_SIZE): void {
  const slots = Object.values(formation.placements);
  expect(slots.length).toBe(expectedCount);
  for (const s of slots) {
    expect(s.col).toBeGreaterThanOrEqual(0);
    expect(s.col).toBeLessThan(BOARD_COLS);
    expect(s.row).toBeGreaterThanOrEqual(0);
    expect(s.row).toBeLessThan(BOARD_ROWS);
  }
  const cells = new Set(slots.map((s) => `${s.col}:${s.row}`));
  expect(cells.size).toBe(expectedCount);
}

// ============================================================
// AUTOBATTLER_OVERHAUL §3 (Phase 2): the board seam. A pure cell->world
// map plus an optional Formation branch in setupMacroSim that feeds spawn
// + homePos, falling back byte-identically to formationDepth with none.
// ============================================================

beforeAll(() => registerAllContent());

const TEAM_A = [
  { heroId: 'juggernaut', level: 12 },
  { heroId: 'crystal-maiden', level: 12 },
  { heroId: 'pudge', level: 12 },
  { heroId: 'earthshaker', level: 12 },
  { heroId: 'sniper', level: 12 }
];
const TEAM_B = [
  { heroId: 'lich', level: 12 },
  { heroId: 'sven', level: 12 },
  { heroId: 'axe', level: 12 },
  { heroId: 'luna', level: 12 },
  { heroId: 'lion', level: 12 }
];

describe('slotToWorld is a pure deterministic map', () => {
  it('returns identical points for identical cells', () => {
    const slot: BoardSlot = { col: 2, row: 1 };
    expect(slotToWorld(0, slot)).toEqual(slotToWorld(0, slot));
  });

  it('places front toward center and back toward the team edge, mirrored per side', () => {
    const back = slotToWorld(0, { col: 0, row: 1 }).pos;
    const mid = slotToWorld(0, { col: 1, row: 1 }).pos;
    const front = slotToWorld(0, { col: 3, row: 1 }).pos;
    // team 0 advances with +x: columns advance from back edge toward the center line.
    expect(back.x).toBeLessThan(mid.x);
    expect(mid.x).toBeLessThan(front.x);
    // the 4-wide grid straddles the team's X-inset symmetrically (no exact center column).
    expect((slotToWorld(0, { col: 0, row: 1 }).pos.x + slotToWorld(0, { col: 3, row: 1 }).pos.x) / 2)
      .toBe(TUNING.macroTeamXInset);

    // team 1 is mirrored across the arena's vertical center.
    const front1 = slotToWorld(1, { col: 3, row: 1 }).pos;
    expect(front1.x).toBe(TUNING.arenaWidth - front.x);
    expect(slotToWorld(0, { col: 0, row: 2 }).facing).toBe(0);
    expect(slotToWorld(1, { col: 0, row: 2 }).facing).toBe(Math.PI);

    // rows spread vertically and straddle the arena's horizontal center symmetrically.
    const top = slotToWorld(0, { col: 2, row: 0 }).pos;
    const bottom = slotToWorld(0, { col: 2, row: 3 }).pos;
    expect(top.y).toBeLessThan(bottom.y);
    expect((top.y + bottom.y) / 2).toBe(TUNING.arenaHeight / 2);
  });
});

describe('setupMacroSim consumes a supplied Formation', () => {
  it('spawns each placed hero on its cell, with a cell-derived anchor and facing', () => {
    const placements: Record<string, BoardSlot> = {
      juggernaut: { col: 3, row: 0 },
      'crystal-maiden': { col: 0, row: 1 },
      pudge: { col: 3, row: 2 },
      earthshaker: { col: 2, row: 3 },
      sniper: { col: 0, row: 3 }
    };
    const formation: Formation = { placements };
    const sim = setupMacroSim({ seed: 7, teamA: TEAM_A, teamB: TEAM_B, formationA: formation, maxSec: 1 });

    for (const [heroId, slot] of Object.entries(placements)) {
      const u = sim.unitsArr.find((x) => x.team === 0 && x.heroId === heroId)!;
      const w = slotToWorld(0, slot);
      expect(u.pos).toEqual(w.pos);                 // spawned on the cell
      expect(u.ctrl.homePos).toEqual(w.pos);        // anchored to the cell (it holds here)
      expect(u.facing).toBe(w.facing);
    }
  });

  it('falls back to formationDepth for heroes with no cell', () => {
    // Only place one hero; the rest must spawn exactly as an unplaced team would.
    const placed = setupMacroSim({
      seed: 7, teamA: TEAM_A, teamB: TEAM_B, maxSec: 1,
      formationA: { placements: { juggernaut: { col: 3, row: 0 } } }
    });
    const bare = setupMacroSim({ seed: 7, teamA: TEAM_A, teamB: TEAM_B, maxSec: 1 });

    for (const h of TEAM_A) {
      if (h.heroId === 'juggernaut') continue;
      const a = placed.unitsArr.find((x) => x.team === 0 && x.heroId === h.heroId)!;
      const b = bare.unitsArr.find((x) => x.team === 0 && x.heroId === h.heroId)!;
      expect(a.pos).toEqual(b.pos);
      expect(a.ctrl.homePos).toEqual(b.ctrl.homePos);
    }
  });
});

describe('counterFormation reacts to the authored opponent board', () => {
  it('places a diver onto an exposed back-row threat', () => {
    const enemyDefs = ['earthshaker', 'axe', 'lina', 'lich', 'sniper'].map((id) => REG.hero(id));
    const opponent: Formation = {
      placements: {
        sniper: { col: 0, row: 3 },
        lich: { col: 2, row: 2 },
        sven: { col: 3, row: 2 },
        juggernaut: { col: 3, row: 1 },
        'crystal-maiden': { col: 0, row: 0 }
      }
    };
    const counter = counterFormation(enemyDefs, opponent);

    expect(counter.placements.earthshaker.col).toBe(3);
    expect([0, 3]).toContain(counter.placements.earthshaker.row);
    expect(new Set(Object.values(counter.placements).map((s) => `${s.col}:${s.row}`)).size).toBe(5);
  });
});

describe('defaultFormation and doctrineFormation always yield a legal board', () => {
  const defs = () => TEAM_A.map((h) => REG.hero(h.heroId));

  it('seats the whole five in distinct, in-bounds cells by default', () => {
    expectLegalBoard(defaultFormation(defs()));
  });

  it('is deterministic for the same roster', () => {
    expect(defaultFormation(defs())).toEqual(defaultFormation(defs()));
  });

  it('keeps every doctrine collision-free even when it favors one column', () => {
    // turtle/phalanx push the whole team toward a single column; with five heroes on a
    // four-row column the packer must spill into neighbors rather than stack or drop.
    for (const { id } of DOCTRINES) {
      expectLegalBoard(doctrineFormation(id, defs()));
    }
  });
});

describe('fitFormationToBoard refits a saved formation onto the current board', () => {
  it('clamps out-of-bounds cells from an older/larger grid into the board', () => {
    // A save from the old 3-wide / 5-tall grid: col 2 and row 4 no longer exist.
    const legacy: Formation = {
      placements: {
        juggernaut: { col: 2, row: 4 },
        'crystal-maiden': { col: 0, row: 0 },
        pudge: { col: 1, row: 2 },
        earthshaker: { col: 2, row: 3 },
        sniper: { col: 0, row: 1 }
      }
    };
    const fitted = fitFormationToBoard(legacy, 3);
    expectLegalBoard(fitted);
    // old front column (2 of 0..2) maps proportionally to the new front column (3 of 0..3).
    expect(fitted.placements.juggernaut.col).toBe(3);
  });

  it('is a no-op for a formation already legal on the current board', () => {
    const current: Formation = {
      placements: {
        juggernaut: { col: 3, row: 0 },
        'crystal-maiden': { col: 0, row: 1 },
        pudge: { col: 3, row: 2 },
        earthshaker: { col: 2, row: 3 },
        sniper: { col: 0, row: 3 }
      }
    };
    expect(fitFormationToBoard(current)).toEqual(current);
  });

  it('is deterministic (same save migrates identically)', () => {
    const legacy: Formation = {
      placements: {
        juggernaut: { col: 2, row: 4 },
        'crystal-maiden': { col: 2, row: 4 },
        pudge: { col: 2, row: 4 }
      }
    };
    expect(fitFormationToBoard(legacy, 3)).toEqual(fitFormationToBoard(legacy, 3));
    // three heroes piled on the same dead cell must fan out into three distinct cells.
    expectLegalBoard(fitFormationToBoard(legacy, 3), 3);
  });
});

describe('an unplaced team is byte-identical to today', () => {
  const SETUP: MacroSetup = { seed: 1337, teamA: TEAM_A, teamB: TEAM_B, maxSec: 120 };

  it('no Formation reproduces the exact same fight hash', () => {
    const baseline = runMacroBattle(SETUP);
    const explicitUndefined = runMacroBattle({ ...SETUP, formationA: undefined, formationB: undefined });
    expect(explicitUndefined.hash).toBe(baseline.hash);
    expect(explicitUndefined.ticks).toBe(baseline.ticks);
  });

  it('a supplied Formation actually changes the spawn (and the fight)', () => {
    const baseline = runMacroBattle(SETUP);
    const placed = runMacroBattle({
      ...SETUP,
      formationA: {
        placements: {
          juggernaut: { col: 3, row: 0 },
          'crystal-maiden': { col: 0, row: 3 },
          pudge: { col: 3, row: 2 },
          earthshaker: { col: 2, row: 1 },
          sniper: { col: 0, row: 2 }
        }
      }
    });
    expect(placed.hash).not.toBe(baseline.hash);
    expect(placed.winner).not.toBe(-1); // still resolves decisively
  });
});
