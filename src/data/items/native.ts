import type { EffectNode, ItemDef } from '../../core/types';

// ============================================================
// PROGRESSION_OVERHAUL §5 — ANCIENTS-native gear.
//
// Dota items stay Dota-faithful; these original items fill the loops Dota lacked
// and ride the non-Dota StatMods hooks the engine already ships
// (swapInDamagePct, tagBoonAmpPct, tagChainWindowBonusSec, reactionAmpPct,
// staminaBonus) plus aura/triggers/tagBoon/active. Per §5.2: original identity,
// composed from existing hooks, default `special`/utility tier so the gym
// `item-tier-cap` keeps them out of macro, and `exclusiveTo` overworld sources.
//
// Authoring note (§8.6): only `Mentor's Standard` spends the one new `StatMods`
// field (`partyXpAmpPct`). Every other item composes from hooks that already
// existed plus item-id-keyed systems behavior. The fantasies that reach past what
// the combat sim expresses on its own are now wired through their owning systems
// (tuned in `TUNING.nativeItems`): XP funnel + gold→XP (kill/award paths), capture
// threshold + bind (capture), reaction spread/field + tag-chain step + resonance
// grant + dual-Aghs (combat/draft/build), traversal + entourage + world pings.
// ============================================================

// Echo Battery (§5.3 swap-combos): a Soak tag-out banks the element; the next
// tag-in detonates it. Modelled as an item tag line that leaves a lingering
// element field when it rides a Soak boon (the ctx carries the boon element).
const echoBatteryField: EffectNode = {
  kind: 'zone',
  at: 'self',
  zone: {
    shape: 'circle',
    radius: 240,
    duration: 4,
    tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 8, target: 'target' }] },
    auraMods: { affects: 'enemies', mods: { moveSpeedPct: -16 } }
  }
};

const echoBatteryBurst: EffectNode = { kind: 'damage', dtype: 'magical', amount: 90, target: 'enemies-in-radius', radius: 280 };

export const NATIVE: ItemDef[] = [
  // ---------- Collection / leveling ----------
  {
    id: 'mentors-standard',
    name: "Mentor's Standard",
    tier: 'special',
    cost: 2600,
    rarity: 'mythical',
    exclusiveTo: ['shop'],
    passiveMods: { partyXpAmpPct: 40, int: 6, maxMana: 100 },
    description: 'AURA: while the active hero carries it, the whole party banks XP closer to the active rate.',
    lore: 'A field banner. The whole company learns from the one who carries it forward.',
    glyph: 'banner',
    appearance: { parts: ['banner'], tint: '#7de2a0', aura: { archetype: 'global-mark', color: '#7de2a0', color2: '#ffffff' } }
  },
  {
    id: 'soul-ledger',
    name: 'Soul Ledger',
    tier: 'special',
    cost: 2200,
    rarity: 'rare',
    exclusiveTo: ['shop'],
    passiveMods: { int: 8, hpRegen: 4, manaRegen: 2 },
    triggers: [
      { on: 'on-kill', cooldown: 0.5, effects: [{ kind: 'mana', op: 'restore', amount: 40, target: 'allies-in-radius', radius: 900 }] }
    ],
    description: 'On a kill, funnel a chosen bench recruit a larger share of the XP and refresh the party a little mana.',
    lore: 'A debt-book bound in its own ink. Every fallen foe pays the apprentice you name.',
    glyph: 'tome',
    appearance: { parts: ['mana-orb'], tint: '#c8b06a', aura: { archetype: 'global-mark', color: '#c8b06a', color2: '#fff2c2' } }
  },
  {
    id: 'scholars-sigil',
    name: "Scholar's Sigil",
    tier: 'special',
    cost: 1900,
    rarity: 'rare',
    exclusiveTo: ['shop'],
    passiveMods: { int: 10, manaRegenPctMax: 0.4, spellAmpPct: 8 },
    description: 'Convert a slice of gold income into hero XP — the inverse of the post-cap XP→gold conversion.',
    lore: 'It reads coin as cleanly as a primer. Wealth, spent on becoming wiser.',
    glyph: 'rune',
    appearance: { parts: ['mana-orb'], tint: '#8fb8ff', aura: { archetype: 'global-mark', color: '#8fb8ff', color2: '#e8f0ff' } }
  },

  // ---------- Capture / entourage ----------
  {
    id: 'taming-collar',
    name: 'Taming Collar',
    tier: 'special',
    cost: 2000,
    rarity: 'rare',
    exclusiveTo: ['shop'],
    passiveMods: { statusResistPct: 12, maxHp: 200, armor: 3 },
    description: 'Raise the capture HP threshold and shorten the bind channel (reads TUNING.capture).',
    lore: 'Woven from the manes of every beast that ever yielded. They feel it before they see it.',
    glyph: 'collar',
    appearance: { parts: ['shield'], tint: '#b07a4a', aura: { archetype: 'shield', color: '#b07a4a', color2: '#ffd9a8' } }
  },
  {
    id: 'beastbond-totem',
    name: 'Beastbond Totem',
    tier: 'special',
    cost: 2400,
    rarity: 'mythical',
    exclusiveTo: ['shop'],
    aura: { radius: 1200, affects: 'allies', mods: { hpRegen: 3, armor: 2 } },
    description: 'Your entourage inherits your aura items at full value and fights as if one star higher.',
    lore: 'Cut from a heartwood the wild things still circle. What you tame, it makes kin.',
    glyph: 'totem',
    appearance: { parts: ['heart-core'], tint: '#7dd6a0', aura: { archetype: 'ground-aoe', color: '#7dd6a0', color2: '#e7d9a8' } }
  },

  // ---------- Swap-combos ----------
  {
    id: 'echo-battery',
    name: 'Echo Battery',
    tier: 'special',
    cost: 2600,
    rarity: 'mythical',
    exclusiveTo: ['shop'],
    passiveMods: { tagBoonAmpPct: 15, maxMana: 120 },
    tagBoon: {
      fire: 'both',
      effects: [echoBatteryBurst],
      onArchetype: { Soak: [echoBatteryField] },
      tooltip: 'TAG: bank the element on swap-out, detonate it on the next swap-in (Soak leaves a field).'
    },
    description: 'Bank the boon element on tag-out and discharge it on the next tag-in; a Soak boon leaves a lingering field.',
    lore: 'A coil that never quite forgets the last spark you fed it.',
    glyph: 'orb',
    appearance: { parts: ['mana-orb'], tint: '#5fe0d0', aura: { archetype: 'storm', color: '#5fe0d0', color2: '#e8fbff' } }
  },
  {
    id: 'catalyst-prism',
    name: 'Catalyst Prism',
    tier: 'special',
    cost: 2500,
    rarity: 'mythical',
    exclusiveTo: ['shop'],
    passiveMods: { reactionAmpPct: 25, spellAmpPct: 6 },
    description: 'Element reactions spread to +1 nearby target and leave a short residual field.',
    lore: 'Light goes in plain and comes out furious. The vale alchemists never agreed on why.',
    glyph: 'gem',
    appearance: { parts: ['crystal-edge'], tint: '#ff8fd0', aura: { archetype: 'chain', color: '#ff8fd0', color2: '#fff0fb' } }
  },
  {
    id: 'tagweavers-gauntlet',
    name: "Tagweaver's Gauntlet",
    tier: 'special',
    cost: 2300,
    rarity: 'mythical',
    exclusiveTo: ['shop'],
    passiveMods: { tagChainWindowBonusSec: 1.5, tagBoonAmpPct: 10, tagGaugeReductionPct: 10 },
    description: 'Adds +1 tag-chain step and widens the chain window, so swap-rotations carry further.',
    lore: 'Five fingers, five elements, one rhythm. Learn it and the swaps play themselves.',
    glyph: 'gauntlet',
    appearance: { parts: ['pauldrons'], tint: '#d8a0ff', aura: { archetype: 'chain', color: '#d8a0ff', color2: '#f4e8ff' } }
  },

  // ---------- Exploration ----------
  {
    id: 'skyfeather-anklet',
    name: 'Skyfeather Anklet',
    tier: 'special',
    cost: 1700,
    rarity: 'rare',
    exclusiveTo: ['shop'],
    passiveMods: { staminaBonus: 50, moveSpeed: 30, moveSpeedPct: 5 },
    description: 'Raise the stamina cap, glide faster, and pay less stamina on climbs.',
    lore: 'A single feather from a bird that never once touched the ground.',
    glyph: 'feather',
    appearance: { parts: ['boot-trail', 'wing-blades'], tint: '#bfe8ff', aura: { archetype: 'storm', color: '#bfe8ff', color2: '#ffffff' } }
  },
  {
    id: 'dowsers-compass',
    name: "Dowser's Compass",
    tier: 'special',
    cost: 1500,
    rarity: 'rare',
    exclusiveTo: ['shop'],
    passiveMods: { castRange: 50 },
    description: 'Ping nearby chests, echo shards, and element sources on the field.',
    lore: 'The needle ignores north entirely. It only ever points at what you came to find.',
    glyph: 'compass',
    appearance: { parts: ['mana-orb'], tint: '#ffd27a', aura: { archetype: 'global-mark', color: '#ffd27a', color2: '#fff6da' } }
  },

  // ---------- Raid chase (Unusual/arcana, raid-gated, macro-banned) ----------
  {
    id: 'concord-relic',
    name: 'Concord Relic',
    tier: 'special',
    cost: 6200,
    rarity: 'arcana',
    exclusiveTo: ['raid'],
    aura: { radius: 'global', affects: 'allies', mods: { magicResistPct: 8, spellAmpPct: 8 } },
    passiveMods: { reactionAmpPct: 20, int: 12 },
    description: 'Grant the whole party resonance even without two shared elements — the field reacts as one.',
    lore: 'Two souls were enough to spark resonance. This relic remembers when there were thousands.',
    glyph: 'orb',
    appearance: { parts: ['mana-orb', 'halo'], tint: '#9fffe0', aura: { archetype: 'global-mark', color: '#9fffe0', color2: '#ffffff' } }
  },
  {
    id: 'twin-soul-vessel',
    name: 'Twin-Soul Vessel',
    tier: 'special',
    cost: 7400,
    rarity: 'arcana',
    exclusiveTo: ['raid'],
    passiveMods: { int: 16, maxMana: 300, manaRegenPctMax: 0.5, spellAmpPct: 12, castRange: 100 },
    description: 'Hold the Aghanim Scepter and Shard upgrades for the carrier at once — one vessel, two souls.',
    lore: 'A reliquary built to cage one ascendant spirit. They poured in two, and it held.',
    glyph: 'orb',
    appearance: { parts: ['mana-orb', 'heart-core'], tint: '#c8a0ff', aura: { archetype: 'shield', color: '#c8a0ff', color2: '#ffe8ff' } }
  }
];
