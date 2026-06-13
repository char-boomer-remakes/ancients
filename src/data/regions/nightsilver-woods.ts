import type { RegionDef } from '../../core/types';

export const NIGHTSILVER_WOODS: RegionDef = {
  id: 'nightsilver-woods',
  name: 'Nightsilver Woods',
  biome: 'forest',
  size: 12000,
  seed: 23017,
  lore: 'A moonlit forest where Selemene’s hunters track the Mad Moon shards by the shadows they refuse to cast.',
  town: { name: 'Moonwake', pos: { x: 5600, y: 6500 }, radius: 820 },
  shrine: { pos: { x: 5600, y: 6200 } },
  shopInventory: [
    'tango', 'healing-salve', 'clarity', 'dust-of-appearance',
    'iron-branch', 'circlet', 'slippers-of-agility', 'mantle-of-intelligence',
    'band-of-elvenskin', 'robe-of-the-magi', 'blade-of-alacrity', 'staff-of-wizardry',
    'boots-of-speed', 'gloves-of-haste', 'sages-mask', 'void-stone', 'chainmail',
    'magic-stick', 'wraith-band', 'null-talisman', 'magic-wand', 'yasha', 'kaya',
    'dragon-lance', 'mask-of-madness', 'blink-dagger', 'euls-scepter', 'force-staff',
    'glimmer-cape', 'diffusal-blade', 'maelstrom', 'drum-of-endurance'
  ],
  camps: [
    { id: 'nw-ghost-1', creepId: 'ghost', count: 4, pos: { x: 3500, y: 5200 }, radius: 260, respawnSec: 75 },
    { id: 'nw-ghost-2', creepId: 'ghost', count: 3, pos: { x: 7400, y: 4400 }, radius: 260, respawnSec: 75 },
    { id: 'nw-wolf-1', creepId: 'alpha-wolf', count: 2, pos: { x: 2900, y: 7800 }, radius: 280, respawnSec: 110 },
    { id: 'nw-wolf-2', creepId: 'alpha-wolf', count: 2, pos: { x: 8800, y: 7800 }, radius: 280, respawnSec: 110 },
    { id: 'nw-satyr-1', creepId: 'satyr-banisher', count: 2, pos: { x: 4700, y: 9000 }, radius: 280, respawnSec: 120 },
    { id: 'nw-harpy-1', creepId: 'harpy-stormcrafter', count: 3, pos: { x: 8800, y: 3300 }, radius: 300, respawnSec: 130 }
  ],
  heroSpawns: [
    { heroId: 'luna', pos: { x: 6900, y: 8050 } },
    { heroId: 'mirana', pos: { x: 3800, y: 8500 } },
    { heroId: 'lina', pos: { x: 8300, y: 5600 } },
    { heroId: 'zeus', pos: { x: 9350, y: 7200 } },
    { heroId: 'drow-ranger', pos: { x: 2500, y: 4400 } }
  ],
  echoSpawns: [
    { id: 'nw-echo-luna', heroId: 'luna', pos: { x: 7600, y: 8600 }, level: 12, respawnSec: 180 },
    { id: 'nw-echo-mirana', heroId: 'mirana', pos: { x: 4300, y: 9450 }, level: 12, respawnSec: 180 },
    { id: 'nw-echo-lina', heroId: 'lina', pos: { x: 9100, y: 5200 }, level: 12, respawnSec: 180 }
  ],
  gates: [
    { id: 'nw-to-tv', name: 'South Pass to Tranquil Vale', pos: { x: 5600, y: 11250 }, radius: 500, toRegionId: 'tranquil-vale', toPos: { x: 6000, y: 1200 } },
    { id: 'nw-to-icewrack', name: 'Frost Road to Icewrack', pos: { x: 10600, y: 1600 }, radius: 500, toRegionId: 'icewrack', toPos: { x: 1600, y: 9800 }, requiredBadge: 'lunar-badge' }
  ],
  gyms: [{ gymId: 'lunar-gym', pos: { x: 6100, y: 3000 }, radius: 650 }],
  props: { treeDensity: 1.0, rockDensity: 0.25 },
  gateHint: 'The Frost Road opens after the Lunar Badge.'
};
