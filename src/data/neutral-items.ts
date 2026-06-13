import type { NeutralItemDef } from '../core/types';

export const ALL_NEUTRAL_ITEMS: NeutralItemDef[] = [
  {
    id: 'trusty-shovel',
    name: 'Trusty Shovel',
    tier: 1,
    dropFromTier: 'small',
    passiveMods: { maxHp: 80 },
    enchantsInto: 'vambrace',
    lore: 'A little luck on a stick.',
    glyph: 'shovel'
  },
  {
    id: 'faded-broach',
    name: 'Faded Broach',
    tier: 1,
    dropFromTier: 'small',
    passiveMods: { moveSpeed: 20, maxMana: 125 },
    enchantsInto: 'grove-bow',
    lore: 'The clasp is old; the haste is fresh.',
    glyph: 'broach'
  },
  {
    id: 'arcane-ring',
    name: 'Arcane Ring',
    tier: 1,
    dropFromTier: 'small',
    passiveMods: { armor: 2, manaRegen: 1 },
    enchantsInto: 'pupils-gift',
    lore: 'A small circle for large spell habits.',
    glyph: 'ring'
  },
  {
    id: 'grove-bow',
    name: 'Grove Bow',
    tier: 2,
    dropFromTier: 'medium',
    passiveMods: { attackRange: 75, attackSpeed: 15 },
    enchantsInto: 'elven-tunic',
    lore: 'A branch that remembers where the target stood.',
    glyph: 'bow'
  },
  {
    id: 'vambrace',
    name: 'Vambrace',
    tier: 2,
    dropFromTier: 'medium',
    passiveMods: { str: 6, agi: 6, int: 6 },
    enchantsInto: 'paladin-sword',
    lore: 'It reinforces whichever arm needs convincing.',
    glyph: 'bracer'
  },
  {
    id: 'pupils-gift',
    name: "Pupil's Gift",
    tier: 2,
    dropFromTier: 'medium',
    passiveMods: { str: 8, agi: 8, int: 8 },
    enchantsInto: 'vortex-storm-globe',
    lore: 'A lesson from the attributes you did not choose.',
    glyph: 'orb'
  },
  {
    id: 'elven-tunic',
    name: 'Elven Tunic',
    tier: 3,
    dropFromTier: 'large',
    passiveMods: { attackSpeed: 26, evasionPct: 16 },
    enchantsInto: 'ninja-gear',
    lore: 'It moves a heartbeat before you do.',
    glyph: 'cloak'
  },
  {
    id: 'paladin-sword',
    name: 'Paladin Sword',
    tier: 3,
    dropFromTier: 'large',
    passiveMods: { damage: 18, lifestealPct: 16 },
    enchantsInto: 'telescope',
    lore: 'A weapon that believes healing should be aggressive.',
    glyph: 'blade'
  },
  {
    id: 'vortex-storm-globe',
    name: 'Vortex Storm-globe',
    tier: 3,
    dropFromTier: 'large',
    passiveMods: { spellAmpPct: 10, manaRegen: 2 },
    enchantsInto: 'spell-prism',
    lore: 'Thunder in a bottle, technically.',
    glyph: 'orb'
  },
  {
    id: 'telescope',
    name: 'Telescope',
    tier: 4,
    dropFromTier: 'ancient',
    aura: { radius: 'global', affects: 'allies', mods: { attackRange: 110, castRange: 110 }, excludeSelf: true },
    enchantsInto: 'apex',
    lore: 'The backline gets a better idea of distance.',
    glyph: 'scope'
  },
  {
    id: 'ninja-gear',
    name: 'Ninja Gear',
    tier: 4,
    dropFromTier: 'ancient',
    passiveMods: { agi: 20, moveSpeed: 25 },
    enchantsInto: 'force-boots',
    lore: 'It goes where the fight briefly forgot to look.',
    glyph: 'mask'
  },
  {
    id: 'spell-prism',
    name: 'Spell Prism',
    tier: 4,
    dropFromTier: 'ancient',
    passiveMods: { int: 12, manaRegen: 4, spellAmpPct: 8 },
    enchantsInto: 'mirror-shield',
    lore: 'Every cooldown sees a shorter shadow.',
    glyph: 'gem'
  },
  {
    id: 'apex',
    name: 'Apex',
    tier: 5,
    dropFromTier: 'ancient',
    passiveMods: { str: 28, agi: 28, int: 28 },
    lore: 'The attribute mountain, pocket-sized.',
    glyph: 'crown'
  },
  {
    id: 'force-boots',
    name: 'Force Boots',
    tier: 5,
    dropFromTier: 'ancient',
    passiveMods: { moveSpeed: 115, hpRegen: 30 },
    lore: 'Feet first through the impossible angle.',
    glyph: 'boot'
  },
  {
    id: 'mirror-shield',
    name: 'Mirror Shield',
    tier: 5,
    dropFromTier: 'ancient',
    passiveMods: { str: 16, agi: 16, int: 16, magicResistPct: 20 },
    lore: 'It reflects certainty back at the caster.',
    glyph: 'shield'
  }
];
