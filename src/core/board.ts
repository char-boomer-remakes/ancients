import { TUNING } from '../data/tuning';
import { abilityArchetypes, type AbilityArchetype } from './ability-archetype';
import { abilityVal } from './values';
import type { AbilityDef, BoardCol, BoardSlot, EffectNode, Formation, HeroDef, ValueRef, Vec2 } from './types';

export type { BoardCol, BoardSlot, Formation } from './types';

// ============================================================
// The board (AUTOBATTLER_OVERHAUL §3). A discrete deployment grid
// mapped deterministically onto a team's half of the existing arena.
// It authors only what the sim already consumes: each unit's spawn
// position/facing and its home anchor (`homePos`). The sim stays
// continuous; the board just decides where the five start and where
// they want to hold.
//
// Pure, deterministic, headless — no DOM, no three. `slotToWorld` is a
// pure cell -> world map, so a placed team is fully replayable and the
// fallback (`core/macro.ts formationDepth`) is byte-identical to today.
// ============================================================

/** Columns (back -> front) and rows in the deployment grid (§3.1). The board is
 *  4x4 (16 cells); the fielded team is five, so a column can hold fewer heroes
 *  than the roster — placement always packs into free cells (never overflows). */
export const BOARD_COLS = 4;
export const BOARD_ROWS = 4;
export const DRAFT_TEAM_SIZE = 5;
export const BOARD_COL_LABELS = ['Back', 'Guard', 'Vanguard', 'Front'] as const;

const BACK_COL: BoardCol = 0;
const MID_COL: BoardCol = 1;   // central column: AoE casters, supports, flex
const FRONT_COL: BoardCol = 3;

/**
 * Map a deployment cell to a world point + facing, deterministically. The column
 * bands reuse `macroFormationDepth` around the team's existing X-inset so a placed
 * team occupies a wider version of the role heuristic: front toward center, back
 * toward its own edge, and rows spread evenly along the arena height.
 */
export function slotToWorld(team: 0 | 1, slot: BoardSlot): { pos: Vec2; facing: number } {
  const dir = team === 0 ? 1 : -1;
  const baseX = team === 0 ? TUNING.macroTeamXInset : TUNING.arenaWidth - TUNING.macroTeamXInset;
  // col 0 = back (behind the base), center = base line, last col = front (toward center).
  const centerCol = (BOARD_COLS - 1) / 2;
  const colOffset = (slot.col - centerCol) * TUNING.macroFormationDepth;
  const x = baseX + dir * colOffset;

  const rowGap = Math.min(420, TUNING.arenaHeight / (BOARD_ROWS + 1));
  const y = TUNING.arenaHeight / 2 + (slot.row - (BOARD_ROWS - 1) / 2) * rowGap;

  return { pos: { x, y }, facing: team === 0 ? 0 : Math.PI };
}

// ============================================================
// Draft authoring helpers (§3.2 / §4.2). All pure: a hero's kit and roles
// decide a suggested column + row bias; doctrines stamp a whole five at once.
// These only *suggest* — the committed Formation is what the sim consumes.
// ============================================================

const RANGED_AT_RANGE = 550; // mirrors core/macro.ts formationDepth

export type RowPref = 'center' | 'edge' | 'any';

export interface PlacementHint {
  col: BoardCol;
  rowPref: RowPref;
  reason: string;
}

/** The archetype-driven column/row a hero *wants* (§3.2). Pure over the def. */
export function placementHint(def: HeroDef): PlacementHint {
  const arch = new Set<AbilityArchetype>();
  for (const a of def.abilities) for (const x of abilityArchetypes(a)) arch.add(x);
  const roles = def.roles;
  const ranged = def.baseStats.attackRange >= RANGED_AT_RANGE;

  if (roles.includes('durable') || roles.includes('initiator')) {
    return { col: FRONT_COL, rowPref: 'center', reason: 'Frontline — soak the engage.' };
  }
  if (arch.has('teamfight-ult') || arch.has('cluster-nuke')) {
    return { col: MID_COL, rowPref: 'center', reason: 'AoE — a central column catches the most.' };
  }
  if (arch.has('channel')) {
    return { col: BACK_COL, rowPref: 'edge', reason: 'Channel — a protected back cell.' };
  }
  if (arch.has('skillshot-line')) {
    return { col: BACK_COL, rowPref: 'edge', reason: 'Skillshot — an edge angle rakes a row.' };
  }
  if (roles.includes('support') || arch.has('team-buff')) {
    return { col: MID_COL, rowPref: 'any', reason: 'Support — near the core to peel.' };
  }
  if (ranged) {
    return { col: BACK_COL, rowPref: 'any', reason: 'Ranged — hold behind the line.' };
  }
  return { col: MID_COL, rowPref: 'any', reason: 'Flex.' };
}

/** A hero's spatial profile for the board editor's hover readout (§7): how far its kit
 *  reaches, its biggest AoE footprint, and its archetype tags. Pure over the def. */
export interface ReachProfile {
  reach: number;       // the longest cast/attack reach across the kit
  footprint: number;   // the largest AoE radius the kit drops
  tags: AbilityArchetype[];
}

function maxRadiusInNodes(def: AbilityDef, nodes: EffectNode[] | undefined, level: number): number {
  if (!nodes) return 0;
  let r = 0;
  for (const n of nodes) {
    const radius = (n as { radius?: ValueRef }).radius;
    if (radius !== undefined) r = Math.max(r, abilityVal(def, radius, level));
    if (n.kind === 'zone') r = Math.max(r, abilityVal(def, n.zone.radius, level), maxRadiusInNodes(def, n.zone.tick?.effects, level));
    if (n.kind === 'projectile') r = Math.max(r, maxRadiusInNodes(def, n.proj.onHit, level));
    if (n.kind === 'repeat') r = Math.max(r, maxRadiusInNodes(def, n.effects, level));
  }
  return r;
}

export function reachProfile(def: HeroDef): ReachProfile {
  const tags = new Set<AbilityArchetype>();
  let reach = def.baseStats.attackRange;
  let footprint = 0;
  for (const a of def.abilities) {
    for (const t of abilityArchetypes(a)) tags.add(t);
    const lvl = a.ult ? 3 : 4;
    if (a.castRange !== undefined) reach = Math.max(reach, abilityVal(a, a.castRange, lvl));
    footprint = Math.max(footprint, maxRadiusInNodes(a, a.effects, lvl), maxRadiusInNodes(a, a.channel?.tick?.effects, lvl));
  }
  return { reach: Math.round(reach), footprint: Math.round(footprint), tags: [...tags].sort() };
}

export type DoctrineId = 'spread' | 'phalanx' | 'flank' | 'turtle';

export interface Doctrine {
  id: DoctrineId;
  name: string;
  describe: string;
}

export const DOCTRINES: readonly Doctrine[] = [
  { id: 'spread', name: 'Spread', describe: 'Each hero where its kit wants; rows fanned wide to dodge AoE.' },
  { id: 'phalanx', name: 'Phalanx', describe: 'Front-liners forward, everyone else stacked safe behind.' },
  { id: 'flank', name: 'Flank', describe: 'Core central; a diver pushed wide and forward to hit the support.' },
  { id: 'turtle', name: 'Turtle', describe: 'Everyone hugging the back edge around the saves.' }
];

/** Row visit order for a preference: center-first, edge-first, or natural. */
function rowOrder(pref: RowPref): number[] {
  const rows = Array.from({ length: BOARD_ROWS }, (_, row) => row);
  const center = (BOARD_ROWS - 1) / 2;
  if (pref === 'center') return rows.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  if (pref === 'edge') return rows.sort((a, b) => Math.abs(b - center) - Math.abs(a - center) || a - b);
  return rows;
}

/**
 * Place an ordered team into the grid, one hero at a time, each into the first free
 * cell of its desired column (falling back to the nearest column when that column is
 * full). Guaranteed collision-free and in-bounds as long as the team fits in the grid
 * (5 heroes on 16 cells), so it stays legal even though a column holds fewer than five.
 */
function packFormation(
  defs: HeroDef[],
  colFor: (def: HeroDef, i: number) => BoardCol,
  rowPrefFor: (def: HeroDef, i: number) => RowPref = () => 'any'
): Formation {
  const placements: Record<string, BoardSlot> = {};
  defs.forEach((def, i) => placeFirstFree(placements, def.id, colFor(def, i), rowOrder(rowPrefFor(def, i))));
  return { placements };
}

/** The walking-party default: each hero on its hint column, packed into free cells. */
export function defaultFormation(defs: HeroDef[]): Formation {
  const five = defs.slice(0, DRAFT_TEAM_SIZE);
  return packFormation(five, (d) => placementHint(d).col, (d) => placementHint(d).rowPref);
}

function rowPressure(formation: Formation | undefined, colMin = 0, colMax = BOARD_COLS - 1): number[] {
  const counts = Array.from({ length: BOARD_ROWS }, () => 0);
  if (!formation) return counts;
  for (const slot of Object.values(formation.placements)) {
    if (slot.col < colMin || slot.col > colMax) continue;
    if (slot.row >= 0 && slot.row < BOARD_ROWS) counts[slot.row] += 1;
  }
  return counts;
}

function rowsByPressure(counts: number[]): number[] {
  const centerRow = (BOARD_ROWS - 1) / 2;
  return Array.from({ length: BOARD_ROWS }, (_, row) => row)
    .sort((a, b) => counts[b] - counts[a] || Math.abs(a - centerRow) - Math.abs(b - centerRow) || a - b);
}

/**
 * Seat a hero in the first free cell of its preferred column (rows tried in the given
 * order), spilling to the nearest column when the preferred one is full. With 16 cells
 * and a five-hero team this never fails to place, so no hero is ever dropped or stacked.
 */
function placeFirstFree(
  placements: Record<string, BoardSlot>,
  heroId: string,
  preferCol: BoardCol,
  rows: number[]
): void {
  const used = new Set(Object.values(placements).map((s) => `${s.col}:${s.row}`));
  const cols = Array.from({ length: BOARD_COLS }, (_, c) => c)
    .sort((a, b) => Math.abs(a - preferCol) - Math.abs(b - preferCol) || a - b);
  for (const col of cols) {
    const rowList = col === preferCol ? rows : Array.from({ length: BOARD_ROWS }, (_, r) => r);
    for (const row of rowList) {
      if (row < 0 || row >= BOARD_ROWS) continue;
      if (!used.has(`${col}:${row}`)) {
        placements[heroId] = { col: col as BoardCol, row };
        return;
      }
    }
    // the preferred column may have unvisited rows beyond `rows`; scan it fully before spilling.
    if (col === preferCol) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        if (!used.has(`${col}:${row}`)) {
          placements[heroId] = { col, row };
          return;
        }
      }
    }
  }
}

/**
 * Refit an arbitrary saved formation onto the current board (save migration §4): map
 * each column proportionally from the source grid width, clamp rows, and re-pack so the
 * result is always legal even when the board shrank below the source. Pure + deterministic
 * (heroes seated in stable id order), so two identical saves migrate identically.
 */
export function fitFormationToBoard(formation: Formation, sourceCols: number = BOARD_COLS): Formation {
  const srcMax = Math.max(1, sourceCols - 1);
  const dstMax = BOARD_COLS - 1;
  const placements: Record<string, BoardSlot> = {};
  const entries = Object.entries(formation.placements).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [id, slot] of entries) {
    const mappedCol = Math.min(dstMax, Math.max(0, Math.round((slot.col * dstMax) / srcMax))) as BoardCol;
    const clampedRow = Math.min(BOARD_ROWS - 1, Math.max(0, Math.round(slot.row)));
    placeFirstFree(placements, id, mappedCol, [clampedRow]);
  }
  return { placements };
}

/**
 * Enemy-side counter-placement (§6.4): when the player authors a board, the
 * opponent does not merely stamp its default. Divers line up on exposed back-row
 * threats, frontliners meet the densest contact row, and fragile casters choose
 * lower-pressure rows. It is still just a Formation: no stat buffs, no scripts.
 */
export function counterFormation(defs: HeroDef[], opponent?: Formation): Formation {
  if (!opponent) return defaultFormation(defs);
  const five = defs.slice(0, DRAFT_TEAM_SIZE);
  const allPressure = rowPressure(opponent);
  const backPressure = rowPressure(opponent, BACK_COL, BACK_COL);
  const hotRows = rowsByPressure(allPressure);
  const exposedBackRows = rowsByPressure(backPressure).filter((row) => backPressure[row] > 0);
  const centerRow = (BOARD_ROWS - 1) / 2;
  const coolRows = Array.from({ length: BOARD_ROWS }, (_, row) => row)
    .sort((a, b) => allPressure[a] - allPressure[b] || Math.abs(b - centerRow) - Math.abs(a - centerRow) || a - b);
  const placements: Record<string, BoardSlot> = {};

  const isDiver = (d: HeroDef) => d.roles.includes('initiator') || d.roles.includes('escape');
  const isFront = (d: HeroDef) => d.roles.includes('durable') || d.roles.includes('initiator');

  for (const def of five.filter(isDiver)) {
    placeFirstFree(placements, def.id, FRONT_COL, exposedBackRows.length ? exposedBackRows : hotRows);
  }
  for (const def of five.filter((d) => isFront(d) && !placements[d.id])) {
    placeFirstFree(placements, def.id, FRONT_COL, hotRows);
  }
  for (const def of five.filter((d) => !placements[d.id])) {
    const hint = placementHint(def);
    const col = hint.col === FRONT_COL ? MID_COL : hint.col;
    placeFirstFree(placements, def.id, col, coolRows);
  }

  return { placements };
}

/** Stamp a doctrine over the five (§4.2). Always yields a legal, collision-free board —
 *  single-column doctrines that can't fit the whole team spill into the nearest column. */
export function doctrineFormation(id: DoctrineId, defs: HeroDef[]): Formation {
  const five = defs.slice(0, DRAFT_TEAM_SIZE);
  const isDiver = (d: HeroDef) => d.roles.includes('initiator') || d.roles.includes('escape');
  const colFor = (def: HeroDef): BoardCol => {
    switch (id) {
      case 'phalanx':
        return def.roles.includes('durable') || def.roles.includes('initiator') ? FRONT_COL : BACK_COL;
      case 'flank':
        return isDiver(def) ? FRONT_COL : MID_COL;
      case 'turtle':
        return BACK_COL;
      case 'spread':
      default:
        return placementHint(def).col;
    }
  };
  const rowPrefFor = (def: HeroDef): RowPref =>
    id === 'flank' && isDiver(def) ? 'edge' : id === 'spread' ? placementHint(def).rowPref : 'any';
  return packFormation(five, colFor, rowPrefFor);
}
