import type { QuestGiverDef, RegionDef, Vec2 } from '../../core/types';
import { CHAPTER_BOARD, GLOBAL_BOUNTY_BOARD, REGION_BOARD_NAMES } from './board';

// ------------------------------------------------------------------
// Quest givers (QUEST.md): the boards are not abstractions any more —
// each is a named NPC who paces a patrol near a region's town and posts
// the matching board. Givers carry no save state; their position is a
// pure function of playtime (see core/quests.ts#questGiverPos), so the
// world layer stays presentational and the core stays authoritative.
//
// A giver's `board` matches QuestDef.giver, which is how Game decides
// which quests it posts. Region givers post their region board; the two
// Hub givers post the region-agnostic global bounties, the chapter spine,
// and the Tower fork.
// ------------------------------------------------------------------

interface GiverFlavor {
  name: string;
  title: string;
}

// Original, in the game's voice — one keeper per region board.
const REGION_GIVERS: Record<string, GiverFlavor> = {
  'tranquil-vale': { name: 'Quartermaster Dawnshade', title: 'Keeper of the Dawnshade Board' },
  'nightsilver-woods': { name: 'Herald Moonwake', title: 'Crier of the Moonwake Board' },
  icewrack: { name: 'Factor Frostford', title: 'Ledger of the Frostford Board' },
  'devarshi-desert': { name: 'Reeve Duneclaim', title: 'Posting the Duneclaim Board' },
  shadeshore: { name: 'Harbormaster Wake', title: 'Voice of the Harborwake Board' },
  'vile-reaches': { name: 'Warden Miregate', title: 'Holder of the Miregate Board' },
  quoidge: { name: 'Proctor Quill', title: 'Clerk of the Quoidge Forum Board' },
  'hidden-wood': { name: 'Steward Bramblewick', title: 'Speaker for the Canopy Court Board' },
  'mount-joerlak': { name: 'Castellan Peakhold', title: 'Warden of the Peakhold Board' },
  'mad-moon-crater': { name: 'Vigilkeeper Ostren', title: 'Last post before the Tower Approach Board' }
};

// The board for the endgame fork + its epilogues (kept in sync with board.ts).
const TOWER_BOARD = 'The Tower of the Ancients';

// Hub givers post a region-agnostic board (globals, the chapter spine, the Tower
// fork) rather than a single region's bounties. Each still stands in one region.
const HUB_GIVERS: { id: string; board: string; regionId: string; flavor: GiverFlavor }[] = [
  {
    id: 'giver-binder-courier',
    board: GLOBAL_BOUNTY_BOARD,
    regionId: 'tranquil-vale',
    flavor: { name: 'Courier Tessel', title: "Runs the Binder's Board between towns" }
  },
  {
    id: 'giver-moonmender-herald',
    board: CHAPTER_BOARD,
    regionId: 'tranquil-vale',
    flavor: { name: 'Herald Vesna', title: 'Carries word of the Mending of the Moon' }
  },
  {
    id: 'giver-tower-warden',
    board: TOWER_BOARD,
    regionId: 'mad-moon-crater',
    flavor: { name: 'Warden of the Approach', title: 'Keeps the last vigil before the Tower' }
  }
];

// A small triangular patrol around a town center; `idx` fans givers out so two
// who share a town do not stand on top of each other.
function patrolAround(center: Vec2, idx: number): { home: Vec2; patrol: Vec2[] } {
  const base = idx * 2.39996; // ~137.5°, a low-overlap fan
  const r = 540;
  const at = (a: number): Vec2 => ({ x: Math.round(center.x + Math.cos(a) * r), y: Math.round(center.y + Math.sin(a) * r) });
  return { home: at(base), patrol: [at(base + 2.0944), at(base + 4.1888)] };
}

export function buildQuestGivers(regions: readonly RegionDef[]): QuestGiverDef[] {
  const out: QuestGiverDef[] = [];
  const townOf = (regionId: string): Vec2 | undefined => regions.find((r) => r.id === regionId)?.town.pos;
  // Track how many givers already stand in each town so they fan out (slot index).
  const slotUsed = new Map<string, number>();
  const nextSlot = (regionId: string): number => {
    const s = slotUsed.get(regionId) ?? 0;
    slotUsed.set(regionId, s + 1);
    return s;
  };

  // Hub givers first: they post the region-agnostic boards and take low slots.
  for (const hub of HUB_GIVERS) {
    const center = townOf(hub.regionId);
    if (!center) continue;
    const { home, patrol } = patrolAround(center, nextSlot(hub.regionId));
    out.push({
      id: hub.id,
      name: hub.flavor.name,
      title: hub.flavor.title,
      regionId: hub.regionId,
      board: hub.board,
      home,
      patrol,
      loopSec: 52,
      radius: 360
    });
  }

  // One keeper per region board, fanned out into the next free town slot.
  for (const region of regions) {
    const flavor = REGION_GIVERS[region.id];
    const board = REGION_BOARD_NAMES[region.id];
    if (!flavor || !board) continue;
    const { home, patrol } = patrolAround(region.town.pos, nextSlot(region.id));
    out.push({
      id: `giver-${region.id}`,
      name: flavor.name,
      title: flavor.title,
      regionId: region.id,
      board,
      home,
      patrol,
      loopSec: 48,
      radius: 360
    });
  }

  return out;
}
