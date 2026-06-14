import type { LootBand, QuestDef } from '../../core/types';

// ------------------------------------------------------------------
// Quest content (QUEST.md §5). All authored, original, in the game's
// voice. Two flavors: recurring bounties (repeatable, low rewards)
// and event chapters (one-time, chained, special rewards).
// ------------------------------------------------------------------

// Region-agnostic bounties: a steady faucet that follows you everywhere,
// available from the first step out of the Vale.
const GLOBAL_BOUNTIES: QuestDef[] = [
  {
    id: 'bounty-cull-wilds',
    kind: 'recurring',
    name: 'Cull the Wilds',
    giver: 'Binder\u2019s Board',
    summary: 'The shards bleed monsters into the wilds faster than they fade. Thin them.',
    objectives: [{ kind: 'kill-creeps', count: 12, text: 'Defeat wild creeps' }],
    rewards: [
      { kind: 'gold', amount: 400 },
      { kind: 'xp', amount: 320, scope: 'active' }
    ],
    repeatable: true,
    dialogue: ['The board never empties. Neither will the wilds.']
  },
  {
    id: 'bounty-binders-due',
    kind: 'recurring',
    name: 'The Binder\u2019s Due',
    giver: 'Binder\u2019s Board',
    summary: 'A binder proves their hand by what they hold, not what they kill. Bring back two bound beasts.',
    objectives: [{ kind: 'capture-creeps', count: 2, text: 'Capture creeps' }],
    rewards: [
      { kind: 'gold', amount: 350 },
      { kind: 'loot-mark', band: 'early', amount: 1 }
    ],
    repeatable: true,
    dialogue: ['Hold a thing instead of breaking it. Harder. Worth more.']
  },
  {
    id: 'bounty-echo-hunt',
    kind: 'recurring',
    name: 'Echo Hunt',
    giver: 'Binder\u2019s Board',
    summary: 'Old champions keep reforming out of the broken Moon. Put a few of them back down.',
    objectives: [{ kind: 'kill-echoes', count: 3, text: 'Defeat hero echoes' }],
    rewards: [
      { kind: 'gold', amount: 600 },
      { kind: 'xp', amount: 520, scope: 'party' }
    ],
    repeatable: true,
    dialogue: ['A memory that fights back is still a memory. Quiet it.']
  },
  {
    id: 'bounty-pit-contract',
    kind: 'recurring',
    name: 'Pit Contract',
    giver: 'Binder\u2019s Board',
    summary: 'A standing contract on the region\u2019s anchored boss. Renews when the dust settles.',
    objectives: [{ kind: 'clear-boss', count: 1, text: 'Clear any regional boss' }],
    rewards: [
      { kind: 'gold', amount: 900 },
      { kind: 'loot-mark', band: 'mid', amount: 1 }
    ],
    prereq: { badges: 1 },
    cooldownSec: 6 * 60 * 60,
    repeatable: true,
    dialogue: ['Big game pays big. Come back when it has caught its breath.']
  }
];

// ------------------------------------------------------------------
// Per-region bounties. Every region posts its own board, gated behind
// `prereq.region` so a bounty only appears once you have actually reached
// the place, and homed via `regionId` so the journal shows where it was
// posted (and the board can float the region you are standing in to the
// top). Rewards scale with how deep the region sits in the descent.
// ------------------------------------------------------------------

const lootBandFor = (depth: number): LootBand => (depth <= 2 ? 'early' : depth <= 6 ? 'mid' : 'late');
const scale = (base: number, depth: number, step: number): number => base + depth * step;

type RegionBountyTheme =
  | { kind: 'capture'; count: number }
  | { kind: 'echo'; count: number }
  | { kind: 'boss'; cooldownSec: number };

interface RegionBountyMeta {
  regionId: string;
  depth: number;
  board: string;
  cull: { name: string; count: number; summary: string; line: string };
  themed: { name: string; summary: string; line: string; theme: RegionBountyTheme };
}

function themedBounty(m: RegionBountyMeta): QuestDef {
  const t = m.themed.theme;
  const base: Omit<QuestDef, 'objectives' | 'rewards' | 'cooldownSec'> = {
    id: `bounty-${m.regionId}-${t.kind}`,
    kind: 'recurring',
    name: m.themed.name,
    giver: m.board,
    regionId: m.regionId,
    summary: m.themed.summary,
    prereq: { region: m.regionId },
    repeatable: true,
    dialogue: [m.themed.line]
  };
  if (t.kind === 'capture') {
    return {
      ...base,
      objectives: [{ kind: 'capture-creeps', count: t.count, text: `Capture ${t.count} local creeps`, regionId: m.regionId }],
      rewards: [
        { kind: 'gold', amount: scale(280, m.depth, 110) },
        { kind: 'loot-mark', band: lootBandFor(m.depth), amount: 1 }
      ]
    };
  }
  if (t.kind === 'echo') {
    return {
      ...base,
      objectives: [{ kind: 'kill-echoes', count: t.count, text: `Defeat ${t.count} hero echoes here`, regionId: m.regionId }],
      rewards: [
        { kind: 'gold', amount: scale(360, m.depth, 120) },
        { kind: 'xp', amount: scale(320, m.depth, 110), scope: 'party' }
      ]
    };
  }
  // A region-scoped contract on any local anchor boss (no targetId: any of the
  // region's bosses counts), paced behind a cooldown like the global Pit Contract.
  return {
    ...base,
    objectives: [{ kind: 'clear-boss', count: 1, text: 'Clear any boss in this region', regionId: m.regionId }],
    rewards: [
      { kind: 'gold', amount: scale(700, m.depth, 150) },
      { kind: 'loot-mark', band: lootBandFor(m.depth), amount: 1 }
    ],
    cooldownSec: t.cooldownSec
  };
}

function regionBounties(m: RegionBountyMeta): QuestDef[] {
  const cull: QuestDef = {
    id: `bounty-${m.regionId}-cull`,
    kind: 'recurring',
    name: m.cull.name,
    giver: m.board,
    regionId: m.regionId,
    summary: m.cull.summary,
    objectives: [{ kind: 'kill-creeps', count: m.cull.count, text: `Defeat ${m.cull.count} local creeps`, regionId: m.regionId }],
    rewards: [
      { kind: 'gold', amount: scale(300, m.depth, 120) },
      { kind: 'xp', amount: scale(250, m.depth, 95), scope: 'active' }
    ],
    prereq: { region: m.regionId },
    repeatable: true,
    dialogue: [m.cull.line]
  };
  return [cull, themedBounty(m)];
}

const REGION_BOUNTY_META: RegionBountyMeta[] = [
  {
    regionId: 'tranquil-vale', depth: 0, board: 'Dawnshade Board',
    cull: { name: 'Vale Thinning', count: 10, summary: 'Shards still bleed kobolds and trolls onto the Vale\u2019s green shelf. Keep the pastures walkable.', line: 'Honest work. The pasture won\u2019t thin itself.' },
    themed: { name: 'Dawnshade Menagerie', summary: 'Dawnshade\u2019s pens stand empty. Bring back two beasts bound, not broken.', line: 'A full pen is worth more than a full grave.', theme: { kind: 'capture', count: 2 } }
  },
  {
    regionId: 'nightsilver-woods', depth: 1, board: 'Moonwake Board',
    cull: { name: 'Moonlit Cull', count: 12, summary: 'Night things crowd the silver birches past the north pass. Cut their numbers back.', line: 'The woods breathe easier with fewer teeth in them.' },
    themed: { name: 'Echoes Under the Birches', summary: 'Old champions reform under Nightsilver\u2019s moon. Lay two of them back down.', line: 'Even a memory casts a shadow here. Quiet two.', theme: { kind: 'echo', count: 2 } }
  },
  {
    regionId: 'icewrack', depth: 2, board: 'Frostford Board',
    cull: { name: 'Frostford Sweep', count: 12, summary: 'Frostford\u2019s roads ice over with more than weather. Clear the drifts of teeth.', line: 'Cold work, but the bounty\u2019s warm enough.' },
    themed: { name: 'Frostbound Catch', summary: 'Frost beasts make stubborn captures and prouder collections. Bind three.', line: 'Hold them till they stop shivering. Then they\u2019re yours.', theme: { kind: 'capture', count: 3 } }
  },
  {
    regionId: 'devarshi-desert', depth: 3, board: 'Duneclaim Board',
    cull: { name: 'Dune Patrol', count: 14, summary: 'The Devarshi sands hide more than caravans. Patrol them and thin what crawls up.', line: 'Walk the dunes. Leave fewer of them behind you.' },
    themed: { name: 'Duneclaim Contract', summary: 'Duneclaim posts a standing price on the desert\u2019s anchored predators. Take one down.', line: 'Big game, big purse. Renew it when the sand settles.', theme: { kind: 'boss', cooldownSec: 2 * 60 * 60 } }
  },
  {
    regionId: 'shadeshore', depth: 4, board: 'Harborwake Board',
    cull: { name: 'Harbor Watch', count: 14, summary: 'Shadeshore\u2019s tideline crawls after dark. Keep the harbor approaches clear.', line: 'The tide brings them in. You send them back.' },
    themed: { name: 'Harborwake Contract', summary: 'Harborwake hangs a bounty on the deep-water captains that haunt the shore.', line: 'Land the big one. The harbor will drink to it.', theme: { kind: 'boss', cooldownSec: 2 * 60 * 60 } }
  },
  {
    regionId: 'vile-reaches', depth: 5, board: 'Miregate Board',
    cull: { name: 'Mire Thinning', count: 16, summary: 'The Vile Reaches rot faster than they can be walked. Burn the numbers down.', line: 'Nothing clean grows here. Cut what does.' },
    themed: { name: 'The Mire\u2019s Memory', summary: 'The swamp is thick with echoes that refuse to settle. Put three to rest.', line: 'The mire keeps everything. Make it let three go.', theme: { kind: 'echo', count: 3 } }
  },
  {
    regionId: 'quoidge', depth: 6, board: 'Quoidge Forum Board',
    cull: { name: 'Forum Decree', count: 16, summary: 'Quoidge\u2019s scholars decree the streets be kept clear of shard-spawn. Oblige them.', line: 'The Forum pays in coin, not citations. Collect.' },
    themed: { name: 'Lecture Hall Echoes', summary: 'Dead masters keep reconvening in the lecture halls. Adjourn three of them.', line: 'Some lessons end only when you end them.', theme: { kind: 'echo', count: 3 } }
  },
  {
    regionId: 'hidden-wood', depth: 7, board: 'Canopy Court Board',
    cull: { name: 'Canopy Cull', count: 16, summary: 'The Hidden Wood grows beasts the way it grows leaves. Prune the canopy floor.', line: 'The wood always regrows. So does the bounty.' },
    themed: { name: 'Court of Beasts', summary: 'Canopy Court prizes a living menagerie. Bind four of the wood\u2019s wild things.', line: 'Lead them, don\u2019t fell them. The Court counts heads.', theme: { kind: 'capture', count: 4 } }
  },
  {
    regionId: 'mount-joerlak', depth: 8, board: 'Peakhold Board',
    cull: { name: 'Highland Sweep', count: 18, summary: 'Mount Joerlak\u2019s slopes shake loose more than rockfall. Keep the climbs clear.', line: 'Thin air, thick bounty. Earn it.' },
    themed: { name: 'Peakhold Contract', summary: 'Peakhold sets a price on the titans that hold the high passes. Bring one low.', line: 'From the summit it\u2019s all downhill. Start the fall.', theme: { kind: 'boss', cooldownSec: 2 * 60 * 60 } }
  },
  {
    regionId: 'mad-moon-crater', depth: 9, board: 'Tower Approach Board',
    cull: { name: 'Crater Vigil', count: 18, summary: 'At the Tower\u2019s foot the broken Moon spills its worst. Stand vigil and thin it.', line: 'The deepest shards bite hardest. Bite back.' },
    themed: { name: 'The Deepest Memory', summary: 'The crater\u2019s echoes are the oldest and least willing. Lay four to rest.', line: 'The Moon remembers every war here. Quiet four of them.', theme: { kind: 'echo', count: 4 } }
  }
];

const REGION_BOUNTIES: QuestDef[] = REGION_BOUNTY_META.flatMap(regionBounties);

// regionId -> the town board name its bounties post under. Exported so the
// walking quest givers (givers.ts) home to the right board without re-typing it.
export const REGION_BOARD_NAMES: Record<string, string> = Object.fromEntries(
  REGION_BOUNTY_META.map((m) => [m.regionId, m.board])
);

// Board strings the region-agnostic quests post under (QuestDef.giver), shared
// with the global quest givers so they post the matching board.
export const GLOBAL_BOUNTY_BOARD = 'Binder\u2019s Board';
export const CHAPTER_BOARD = 'Mending the Moon';

// ------------------------------------------------------------------
// Timed contracts (QUEST.md): recurring bounties on a clock.
// Once posted they must be cleared inside `windowSec` of playtime or the
// progress resets and the contract re-posts — a race the steady board is not.
// These also exercise the long-dormant per-tier objective filter.
// ------------------------------------------------------------------
const TIMED_BOUNTIES: QuestDef[] = [
  {
    id: 'bounty-ancient-reckoning',
    kind: 'recurring',
    name: 'Ancient Reckoning',
    giver: 'Binder\u2019s Board',
    summary: 'An ancient-blooded beast has been sighted. The board pays well — but the trail goes cold fast. Bring down three before it does.',
    objectives: [{ kind: 'kill-creeps', count: 3, tier: 'ancient', text: 'Defeat ancient-tier creeps' }],
    rewards: [
      { kind: 'gold', amount: 1400 },
      { kind: 'loot-mark', band: 'late', amount: 1 }
    ],
    prereq: { badges: 4 },
    windowSec: 30 * 60,
    repeatable: true,
    dialogue: ['Old blood doesn\u2019t wait to be hunted. Move.']
  }
];

const CHAPTERS: QuestDef[] = [
  {
    id: 'chapter-first-light',
    kind: 'event',
    name: 'First Light',
    giver: 'Mending the Moon',
    regionId: 'tranquil-vale',
    summary: 'No binder mends the Moon alone. Draw your first champion out of a shard.',
    objectives: [{ kind: 'recruit-heroes', count: 1, text: 'Recruit a hero' }],
    rewards: [
      { kind: 'gold', amount: 500 },
      { kind: 'xp', amount: 400, scope: 'active' },
      { kind: 'item', itemId: 'magic-wand' }
    ],
    next: 'chapter-vale-warden',
    dialogue: ['One memory carried forward. The first of many.']
  },
  {
    id: 'chapter-vale-warden',
    kind: 'event',
    name: 'Warden of the Vale',
    giver: 'Mending the Moon',
    summary: 'A badge is a region naming you its own. Earn the first one.',
    objectives: [{ kind: 'earn-badge', count: 1, text: 'Earn a gym badge' }],
    rewards: [
      { kind: 'item', itemId: 'broadsword' },
      { kind: 'loot-mark', band: 'early', amount: 1 },
      { kind: 'essence', amount: 40 }
    ],
    prereq: { quests: ['chapter-first-light'] },
    next: 'chapter-deeper-loop',
    dialogue: ['The land remembers who held it. Now it remembers you.']
  },
  {
    id: 'chapter-deeper-loop',
    kind: 'event',
    name: 'Into the Deeper Loop',
    giver: 'Mending the Moon',
    summary: 'The descent steepens. Walk a dungeon to its guardian and put down a boss to prove you can hold the depth.',
    objectives: [
      { kind: 'clear-dungeon', count: 1, text: 'Clear a dungeon' },
      { kind: 'clear-boss', count: 1, text: 'Clear a boss' }
    ],
    rewards: [
      { kind: 'item', itemId: 'ultimate-orb' },
      { kind: 'essence', amount: 80 }
    ],
    prereq: { badges: 3, quests: ['chapter-vale-warden'] },
    next: 'chapter-lost-echo',
    dialogue: ['Each turn of the Loop runs deeper than the last. Keep your feet.']
  },
  {
    id: 'chapter-lost-echo',
    kind: 'event',
    name: 'A Lost Echo',
    giver: 'Mending the Moon',
    summary: 'One memory has been waiting for a binder steady enough to carry it. Quiet five echoes and a boss, and it will answer.',
    objectives: [
      { kind: 'kill-echoes', count: 5, text: 'Defeat hero echoes' },
      { kind: 'clear-boss', count: 1, text: 'Clear a boss' }
    ],
    rewards: [{ kind: 'recruit', heroId: 'marci' }],
    prereq: { badges: 5, quests: ['chapter-deeper-loop'] },
    next: 'chapter-mad-moon',
    dialogue: ['Some echoes do not fight you. They wait to be carried. This one chose you.']
  },
  {
    id: 'chapter-mad-moon',
    kind: 'event',
    name: 'The Mad Moon\u2019s Answer',
    giver: 'Mending the Moon',
    summary: 'The deepest shards remember a war no one survived. Clear a raid and the Moon will answer in kind.',
    objectives: [{ kind: 'clear-raid', count: 1, text: 'Clear a raid' }],
    rewards: [
      { kind: 'title', id: 'moonmender', name: 'Moonmender', note: 'Answered the Mad Moon and lived to gather its pieces.' },
      { kind: 'gold', amount: 4000 },
      { kind: 'item', itemId: 'sacred-relic' }
    ],
    // The doc's spine: ready once you are deep enough — either eight badges in
    // hand or a single raid already broken — and after the Lost Echo chapter.
    prereq: { quests: ['chapter-lost-echo'], anyOf: [{ badges: 8 }, { raidClears: 1 }] },
    dialogue: ['You went where the war still rings, and you came back holding a piece of it.']
  }
];

// A side chapter that exercises region travel: it gates behind the opening
// chapter but branches off the main spine (no `next`), and homes on the Vale's
// board so the journal can show where it was posted.
const SIDE_CHAPTERS: QuestDef[] = [
  {
    id: 'chapter-wider-loop',
    kind: 'event',
    name: 'The Wider Loop',
    giver: 'Mending the Moon',
    regionId: 'tranquil-vale',
    summary: 'The Vale is only the first turn of a far longer Loop. Cross the north pass into Nightsilver Woods and see how far the break has spread.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Reach Nightsilver Woods', targetId: 'nightsilver-woods' }],
    rewards: [
      { kind: 'gold', amount: 350 },
      { kind: 'loot-mark', band: 'early', amount: 1 }
    ],
    prereq: { quests: ['chapter-first-light'] },
    dialogue: ['One vale mended. A dozen more turns of the Loop wait past the ridge.']
  },
  // Standalone milestone chapters that branch off the spine after First Light.
  // Each is a leaf (no `next`) with a one-time payout the recurring board never
  // gives, and gates on a feat the player reaches naturally on the descent.
  {
    id: 'chapter-vale-roster',
    kind: 'event',
    name: 'Hands Enough to Mend',
    giver: 'Mending the Moon',
    summary: 'No one mends a broken Moon with a single pair of hands. Gather a proper company before the road steepens.',
    objectives: [{ kind: 'recruit-heroes', count: 4, text: 'Recruit 4 heroes' }],
    rewards: [
      { kind: 'gold', amount: 1200 },
      { kind: 'xp', amount: 900, scope: 'party' },
      { kind: 'loot-mark', band: 'mid', amount: 1 }
    ],
    prereq: { quests: ['chapter-first-light'] },
    dialogue: ['Four memories carried, and the work finally looks possible.']
  },
  {
    id: 'chapter-frostbound',
    kind: 'event',
    name: 'The Frostbound Vow',
    giver: 'Mending the Moon',
    regionId: 'icewrack',
    summary: 'Icewrack\u2019s beasts test a binder\u2019s patience more than any duel. Hold five of them and prove your grip will not slip in the cold.',
    objectives: [{ kind: 'capture-creeps', count: 5, text: 'Capture 5 creeps in Icewrack', regionId: 'icewrack' }],
    rewards: [
      { kind: 'essence', amount: 120 },
      { kind: 'item', itemId: 'point-booster' }
    ],
    prereq: { region: 'icewrack', quests: ['chapter-first-light'] },
    dialogue: ['Frost teaches the slowest, surest kind of holding.']
  },
  {
    id: 'chapter-pit-ledger',
    kind: 'event',
    name: 'The Pit Ledger',
    giver: 'Mending the Moon',
    summary: 'The region anchors keep a ledger of who actually puts them down. Sign it four times over and the deep places will know your hand.',
    objectives: [{ kind: 'clear-boss', count: 4, text: 'Clear 4 regional bosses' }],
    rewards: [
      { kind: 'item', itemId: 'demon-edge' },
      { kind: 'essence', amount: 100 }
    ],
    prereq: { badges: 4, quests: ['chapter-first-light'] },
    dialogue: ['Four anchors down. The ledger knows your name now.']
  },
  {
    id: 'chapter-echo-archive',
    kind: 'event',
    name: 'The Echo Archive',
    giver: 'Mending the Moon',
    regionId: 'quoidge',
    summary: 'Quoidge\u2019s archivists pay for echoes laid to rest near the Forum \u2014 they study what the shards leave behind. Quiet eight.',
    objectives: [{ kind: 'kill-echoes', count: 8, text: 'Defeat 8 hero echoes in Quoidge', regionId: 'quoidge' }],
    rewards: [
      { kind: 'item', itemId: 'mystic-staff' },
      { kind: 'loot-mark', band: 'late', amount: 1 }
    ],
    prereq: { region: 'quoidge', quests: ['chapter-first-light'] },
    dialogue: ['Eight memories filed away. The Archive is generous to a thorough hand.']
  }
];

// ------------------------------------------------------------------
// Second spine: "The Outworld Seal" (QUEST.md). A post-Mad-Moon
// questline about the claimants who crossed worlds when the seal thinned
// (README: the Renegade Marshal, the Forsaken Queen, the Lords of Hatred and
// Destruction). It chains off the end of the main spine and pays out in raid
// gear and a title, walking alongside the endgame instead of the badge run.
// ------------------------------------------------------------------
const OUTWORLD_CHAPTERS: QuestDef[] = [
  {
    id: 'chapter-outworld-cracks',
    kind: 'event',
    name: 'Cracks in the Seal',
    giver: 'Mending the Moon',
    summary: 'The Moon answered, and something on the other side answered back. The seal that held the Ancients is thinning. Break two raids open and see what is pressing through.',
    objectives: [{ kind: 'clear-raid', count: 2, text: 'Clear raids' }],
    rewards: [
      { kind: 'item', itemId: 'octarine-core' },
      { kind: 'essence', amount: 150 }
    ],
    prereq: { quests: ['chapter-mad-moon'] },
    next: 'chapter-outworld-renegade',
    dialogue: ['Every shard you gather thins the wall a little more. They feel it too.']
  },
  {
    id: 'chapter-outworld-renegade',
    kind: 'event',
    name: 'The Renegade\u2019s Wake',
    giver: 'Mending the Moon',
    summary: 'A claimant walks the deep places now, and the anchors it passes do not rise again. Clear a raid and put down two of the bosses it has stirred.',
    objectives: [
      { kind: 'clear-raid', count: 1, text: 'Clear a raid' },
      { kind: 'clear-boss', count: 2, text: 'Clear bosses in its wake' }
    ],
    rewards: [{ kind: 'item', itemId: 'eye-of-skadi' }],
    prereq: { quests: ['chapter-outworld-cracks'] },
    next: 'chapter-outworld-seal',
    dialogue: ['It is not from here. It came for the same prize you did, and it does not mean to share.']
  },
  {
    id: 'chapter-outworld-seal',
    kind: 'event',
    name: 'Mend the Seal',
    giver: 'Mending the Moon',
    summary: 'The breach can be closed, but only from the deepest war. Clear three raids and carry their shards back to the wall before another claimant slips the seal.',
    objectives: [{ kind: 'clear-raid', count: 3, text: 'Clear raids' }],
    rewards: [
      { kind: 'title', id: 'sealwarden', name: 'Sealwarden', note: 'Closed the breach the broken Moon tore between worlds.' },
      { kind: 'item', itemId: 'aghanims-blessing' }
    ],
    prereq: { quests: ['chapter-outworld-renegade'] },
    dialogue: ['Held. For now the wall is yours to keep, and the prize beneath it stays ours.']
  }
];

// ------------------------------------------------------------------
// The fork: "Zet's Question" (QUEST.md branching choice-quests).
// At the Tower, the game poses Zet's own choice (README): reunite the Ancients
// and end the war, keep the eternal game turning, or break the Loop and let the
// world out. Claiming the quest takes exactly one branch — granting that
// branch's title and reward and unlocking only its epilogue.
// ------------------------------------------------------------------
const ENDGAME_FORK: QuestDef[] = [
  {
    id: 'fork-zets-question',
    kind: 'event',
    name: 'Zet\u2019s Question',
    giver: 'The Tower of the Ancients',
    regionId: 'mad-moon-crater',
    summary: 'You answered the Mad Moon and walked back out of the war. Now the Tower asks what Zet could not: with the pieces in your hands, what becomes of the Loop? Return to the Tower and decide.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Return to the Tower of the Ancients', targetId: 'mad-moon-crater', regionId: 'mad-moon-crater' }],
    rewards: [{ kind: 'gold', amount: 2000 }],
    prereq: { quests: ['chapter-mad-moon'] },
    choices: [
      {
        id: 'reunite',
        label: 'Reunite the Ancients',
        note: 'End the war. Make the broken mind whole and let the Loop fall silent.',
        rewards: [
          { kind: 'title', id: 'worldmender', name: 'Worldmender', note: 'Gathered the broken Moon back into one mind and ended the war.' },
          { kind: 'gold', amount: 5000 }
        ],
        next: 'epilogue-reunite'
      },
      {
        id: 'eternal',
        label: 'Keep the eternal game',
        note: 'Let the war turn forever, as it always has. Some things are not meant to end.',
        rewards: [
          { kind: 'title', id: 'eternal-warden', name: 'Eternal Warden', note: 'Chose to keep the Loop turning, and stands watch over the eternal game.' },
          { kind: 'essence', amount: 300 }
        ],
        next: 'epilogue-eternal'
      },
      {
        id: 'break',
        label: 'Break the Loop',
        note: 'Shatter the rule that resets the world and let everything out for good.',
        rewards: [
          { kind: 'title', id: 'loop-breaker', name: 'Looser of the Loop', note: 'Broke the rule that bound the world and let it out for good.' },
          { kind: 'item', itemId: 'divine-rapier' }
        ],
        next: 'epilogue-break'
      }
    ],
    dialogue: ['Three fragments woke with names, and one spent itself sealing the other two. The shard you carry remembers the choice. Now it is yours.']
  },
  // Branch epilogues — each gates on the specific choice taken, so only the
  // path you chose ever opens. Leaves (no `next`), each a one-time payout.
  {
    id: 'epilogue-reunite',
    kind: 'event',
    name: 'The Silence After',
    giver: 'The Tower of the Ancients',
    regionId: 'mad-moon-crater',
    summary: 'The Ancients are one again and the war has stopped. Walk the crater once more and see a world that no longer resets.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Walk the quieted crater', targetId: 'mad-moon-crater', regionId: 'mad-moon-crater' }],
    rewards: [{ kind: 'item', itemId: 'aghanims-scepter' }],
    prereq: { choice: { quest: 'fork-zets-question', choiceId: 'reunite' } },
    dialogue: ['No more turns. No more wars to remember. Only the quiet you made.']
  },
  {
    id: 'epilogue-eternal',
    kind: 'event',
    name: 'The Game Goes On',
    giver: 'The Tower of the Ancients',
    regionId: 'mad-moon-crater',
    summary: 'The Loop turns as it always has, and you turn with it now — its warden, not its prisoner. Take your post at the Tower.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Take your post at the Tower', targetId: 'mad-moon-crater', regionId: 'mad-moon-crater' }],
    rewards: [{ kind: 'item', itemId: 'refresher-orb' }],
    prereq: { choice: { quest: 'fork-zets-question', choiceId: 'eternal' } },
    dialogue: ['The war begins again, and you are ready for it. You will always be ready for it.']
  },
  {
    id: 'epilogue-break',
    kind: 'event',
    name: 'The World Let Out',
    giver: 'The Tower of the Ancients',
    regionId: 'mad-moon-crater',
    summary: 'The Loop is broken and the world spills past its old edges for the first time. Step into the crater and see what comes next — no one has before.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Step past the broken Loop', targetId: 'mad-moon-crater', regionId: 'mad-moon-crater' }],
    rewards: [{ kind: 'item', itemId: 'eye-of-skadi' }],
    prereq: { choice: { quest: 'fork-zets-question', choiceId: 'break' } },
    dialogue: ['Whatever happens now happens once. That is the gift, and the cost.']
  }
];

export const ALL_QUEST_DEFS: QuestDef[] = [
  ...GLOBAL_BOUNTIES,
  ...REGION_BOUNTIES,
  ...TIMED_BOUNTIES,
  ...CHAPTERS,
  ...SIDE_CHAPTERS,
  ...OUTWORLD_CHAPTERS,
  ...ENDGAME_FORK
];
