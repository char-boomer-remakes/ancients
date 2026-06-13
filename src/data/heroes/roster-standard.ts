import type { AbilityDef, HeroBaseStats, HeroDef, StatModMap, VfxArchetype } from '../../core/types';
import { gestureForAbility, soundForAbility } from '../../core/gestures';

type HeroInput = {
  id: string;
  name: string;
  title: string;
  attribute: HeroDef['attribute'];
  roles: string[];
  region: string;
  palette: [string, string, string];
  ranged?: boolean;
  silhouette?: Partial<HeroDef['silhouette']>;
  abilities: AbilityDef[];
};

function baseStats(attribute: HeroDef['attribute'], ranged = false): HeroBaseStats {
  const primary = attribute === 'uni' ? 'str' : attribute;
  return {
    str: primary === 'str' ? 26 : 19,
    agi: primary === 'agi' ? 26 : 19,
    int: primary === 'int' ? 26 : 18,
    strGain: primary === 'str' ? 3.2 : 2.1,
    agiGain: primary === 'agi' ? 3.2 : 2.2,
    intGain: primary === 'int' ? 3.2 : 1.9,
    baseDamage: ranged ? 30 : 38,
    baseArmor: primary === 'agi' ? 4 : 2,
    attackRange: ranged ? 600 : 150,
    attackPoint: ranged ? 0.4 : 0.32,
    baseAttackTime: 1.7,
    attackProjectileSpeed: ranged ? 1000 : undefined,
    moveSpeed: ranged ? 300 : 310,
    turnRate: 0.6,
    hpRegen: primary === 'str' ? 1.8 : 1.2,
    manaRegen: primary === 'int' ? 1.4 : 0.9
  };
}

function vfx(archetype: VfxArchetype, color: string, color2?: string, scale = 0.85): AbilityDef['vfx'] {
  return { archetype, color, color2, scale };
}

function tagged(a: AbilityDef): AbilityDef {
  return { ...a, anim: gestureForAbility(a), sound: soundForAbility(a) };
}

function talents(id: string, abilities: AbilityDef[]): HeroDef['talents'] {
  const basic = abilities.find((a) => !a.ult && a.values?.damage) ?? abilities[0];
  const ult = abilities.find((a) => a.ult && a.values?.damage) ?? abilities.find((a) => a.ult) ?? abilities[3];
  const basicKey = basic.values?.damage ? 'damage' : Object.keys(basic.values ?? { damage: [0] })[0];
  const ultKey = ult.values?.damage ? 'damage' : Object.keys(ult.values ?? { damage: [0] })[0];
  return [
    { level: 10, options: [{ id: `${id}-t10a`, name: '+8 Primary Stats', mods: { str: 3, agi: 3, int: 3 } as StatModMap }, { id: `${id}-t10b`, name: '+100 Health', mods: { maxHp: 100 } }] },
    { level: 15, options: [{ id: `${id}-t15a`, name: '+25 Attack Speed', mods: { attackSpeed: 25 } }, { id: `${id}-t15b`, name: '+10% Spell Amp', mods: { spellAmpPct: 10 } }] },
    { level: 20, options: [{ id: `${id}-t20a`, name: '+Ability Damage', abilityOverride: { abilityId: basic.id, valueKey: basicKey, mode: 'add', amount: 45 } }, { id: `${id}-t20b`, name: '+25 Move Speed', mods: { moveSpeed: 25 } }] },
    { level: 25, options: [{ id: `${id}-t25a`, name: '+Ultimate Damage', abilityOverride: { abilityId: ult.id, valueKey: ultKey, mode: 'add', amount: 90 } }, { id: `${id}-t25b`, name: '+16 All Stats', mods: { str: 16, agi: 16, int: 16 } }] }
  ];
}

function hero(input: HeroInput): HeroDef {
  const ranged = input.ranged ?? input.attribute === 'int';
  const abilities = input.abilities.map(tagged);
  return {
    id: input.id,
    name: input.name,
    title: input.title,
    attribute: input.attribute,
    roles: input.roles,
    region: input.region,
    lore: `${input.name} joins Ancients with a compact kit built around the same battlefield decisions that define the Dota hero.`,
    baseStats: baseStats(input.attribute, ranged),
    abilities,
    skillOrder: [0, 1, 2],
    talents: talents(input.id, abilities),
    facets: [
      { id: `${input.id}-facet-pressure`, name: 'Pressure', description: 'Sharper early fights for the authored roster pass.', mods: input.attribute === 'agi' ? { agi: 6 } : { str: 6 } },
      { id: `${input.id}-facet-reach`, name: 'Reach', description: 'A small cast-range package for macro fights.', mods: { castRange: 75 } }
    ],
    aghanim: { name: `${input.name}'s Scepter`, description: 'A future Scepter variant is logged after the base kit pass.', implemented: false },
    silhouette: {
      build: input.silhouette?.build ?? (input.roles.includes('durable') ? 'brute' : 'biped'),
      scale: input.silhouette?.scale ?? (input.roles.includes('durable') ? 1.08 : 1),
      bodyShape: input.silhouette?.bodyShape ?? (input.attribute === 'str' ? 'bulky' : 'slim'),
      head: input.silhouette?.head ?? (input.attribute === 'str' ? 'helm' : 'bare'),
      weapon: input.silhouette?.weapon ?? (ranged ? 'staff' : 'sword'),
      extras: input.silhouette?.extras ?? (input.roles.includes('carry') ? ['shoulderpads'] : [])
    },
    palette: input.palette,
    barks: [
      `${input.name} has found the shard trail.`,
      'Hold the angle. Count the cooldown.',
      'That echo breaks before I do.',
      'The map gives us a fight. Good.',
      'One more camp, one more answer.',
      'I know this rhythm from another war.'
    ],
    bounty: { xp: 560, gold: 360 },
    recruitmentQuestId: `recruit-${input.id}`,
    animProfile: { rig: ranged ? 'caster' : input.attribute === 'str' ? 'brute' : 'fighter', castStyle: input.attribute === 'int' ? 'spell' : 'weapon', voiceTimbre: input.attribute === 'str' ? 'low' : 'sharp' }
  };
}

const ward = (id: string, name: string, palette: [string, string, string]) => ({
  id,
  name,
  lifetime: 24,
  cannotAttack: false,
  stats: { maxHp: 260, damage: 24, armor: 1, moveSpeed: 0, attackRange: 550, baseAttackTime: 1.4 },
  silhouette: { build: 'ward' as const, scale: 0.55, weapon: 'none' as const },
  palette
});

export const STANDARD_MISSING_HEROES: HeroDef[] = [
  hero({
    id: 'abaddon', name: 'Abaddon', title: 'Lord of Avernus', attribute: 'str', roles: ['support', 'durable'], region: 'shadeshore', palette: ['#58d8c8', '#1d3340', '#d8fff8'],
    abilities: [
      { id: 'abad-mist-coil', name: 'Mist Coil', targeting: 'unit-target', affects: 'ally', castRange: 575, castPoint: 0.25, manaCost: [50, 55, 60, 65], cooldown: [6, 5.5, 5, 4.5], values: { heal: [100, 150, 200, 250], damage: [0, 0, 0, 0] }, effects: [{ kind: 'heal', amount: 'heal', target: 'target' }, { kind: 'damage', dtype: 'pure', amount: 45, target: 'self' }], vfx: vfx('beam', '#58d8c8') },
      { id: 'abad-aphotic-shield', name: 'Aphotic Shield', targeting: 'unit-target', affects: 'ally', castRange: 500, castPoint: 0.2, manaCost: [85, 95, 105, 115], cooldown: [14, 13, 12, 11], values: { duration: [6, 6, 6, 6], block: [12, 16, 20, 24] }, effects: [{ kind: 'purge', target: 'target' }, { kind: 'statmod', mods: { damageTakenReductionPct: 'block' }, duration: 'duration', target: 'target' }], vfx: vfx('shield', '#7fffe8') },
      { id: 'abad-curse-avernus', name: 'Curse of Avernus', targeting: 'attack-modifier', values: { slow: [12, 18, 24, 30], bonus: [10, 18, 26, 34] }, attackMod: { procChance: 100, bonusDamage: 'bonus', procStatus: { status: 'slow', duration: 2, params: { moveSlowPct: 'slow', tag: 'avernus-curse' } } }, vfx: vfx('stun-stars', '#58d8c8') },
      { id: 'abad-borrowed-time', name: 'Borrowed Time', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [0, 0, 0], cooldown: [80, 65, 50], values: { duration: [5, 6, 7], heal: [220, 320, 420], damage: [0, 0, 0] }, effects: [{ kind: 'statmod', mods: { damageTakenReductionPct: 75, hpRegen: 35 }, duration: 'duration', target: 'self' }, { kind: 'heal', amount: 'heal', target: 'self' }], vfx: vfx('global-mark', '#d8fff8') }
    ]
  }),
  hero({
    id: 'alchemist', name: 'Alchemist', title: 'Razzil Darkbrew', attribute: 'str', roles: ['carry', 'durable'], region: 'vile-reaches', palette: ['#b8d84a', '#5b3318', '#f0d46a'], silhouette: { build: 'brute', scale: 1.14, head: 'bare', weapon: 'cleaver' },
    abilities: [
      { id: 'alc-acid-spray', name: 'Acid Spray', targeting: 'ground-aoe', castRange: 900, castPoint: 0.35, manaCost: [110, 120, 130, 140], cooldown: [22, 21, 20, 19], values: { damage: [24, 32, 40, 48], radius: [475, 500, 525, 550], duration: [8, 8, 8, 8], armor: [-3, -4, -5, -6] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { armor: 'armor' }, duration: 1.2, target: 'target' }] } } }], vfx: vfx('ground-aoe', '#b8d84a') },
      { id: 'alc-concoction', name: 'Unstable Concoction', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.45, manaCost: [90, 100, 110, 120], cooldown: [16, 15, 14, 13], values: { damage: [120, 180, 240, 300], stun: [1.2, 1.6, 2, 2.4] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('stun-stars', '#f0d46a') },
      { id: 'alc-greed', name: "Greevil's Greed", targeting: 'passive', values: { damage: [10, 18, 26, 34] }, passiveMods: { damage: 24, moveSpeed: 10 }, vfx: vfx('shield', '#f0d46a') },
      { id: 'alc-chemical-rage', name: 'Chemical Rage', targeting: 'no-target', ult: true, castPoint: 0.25, manaCost: [50, 100, 150], cooldown: [55, 50, 45], values: { duration: [20, 22, 24], damage: [40, 65, 90] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 80, moveSpeed: 45, hpRegen: 35, damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#b8d84a') }
    ]
  }),
  hero({
    id: 'bristleback', name: 'Bristleback', title: 'Rigwarl', attribute: 'str', roles: ['durable', 'carry'], region: 'vile-reaches', palette: ['#d8a04a', '#6a3520', '#f7e0a0'], silhouette: { build: 'brute', scale: 1.1, head: 'horned', weapon: 'cleaver' },
    abilities: [
      { id: 'bb-goo', name: 'Viscous Nasal Goo', targeting: 'unit-target', affects: 'enemy', castRange: 600, castPoint: 0.2, manaCost: [25, 25, 25, 25], cooldown: [1.8, 1.7, 1.6, 1.5], values: { damage: [0, 0, 0, 0], slow: [20, 25, 30, 35], armor: [-2, -3, -4, -5] }, effects: [{ kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 'slow', tag: 'nasal-goo' } }, { kind: 'statmod', mods: { armor: 'armor' }, duration: 4, target: 'target' }], vfx: vfx('beam', '#d8a04a') },
      { id: 'bb-quill-spray', name: 'Quill Spray', targeting: 'no-target', castPoint: 0, manaCost: [35, 35, 35, 35], cooldown: [3, 3, 3, 3], values: { damage: [80, 130, 180, 230], radius: [650, 650, 650, 650] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('storm', '#f7e0a0') },
      { id: 'bb-bristleback', name: 'Bristleback', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { attackDamageTakenReductionPct: 18, damageTakenReductionPct: 6 }, vfx: vfx('shield', '#6a3520') },
      { id: 'bb-warpath', name: 'Warpath', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [100, 120, 140], cooldown: [45, 40, 35], values: { duration: [8, 10, 12], damage: [50, 80, 110] }, effects: [{ kind: 'statmod', mods: { damage: 'damage', moveSpeedPct: 18 }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#d8a04a') }
    ]
  }),
  hero({
    id: 'dawnbreaker', name: 'Dawnbreaker', title: 'Valora', attribute: 'str', roles: ['carry', 'durable', 'support'], region: 'tranquil-vale', palette: ['#ffd36a', '#b84a32', '#fff3c0'], silhouette: { build: 'brute', scale: 1.08, head: 'helm', weapon: 'totem' },
    abilities: [
      { id: 'dawn-starbreaker', name: 'Starbreaker', targeting: 'no-target', castPoint: 0.25, manaCost: [100, 110, 120, 130], cooldown: [17, 16, 15, 14], values: { damage: [45, 70, 95, 120], radius: [350, 350, 350, 350], swings: [3, 3, 3, 3] }, effects: [{ kind: 'repeat', count: 'swings', interval: 0.25, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 0.25, target: 'enemies-in-radius', radius: 'radius' }] }], vfx: vfx('storm', '#ffd36a') },
      { id: 'dawn-hammer', name: 'Celestial Hammer', targeting: 'skillshot', castRange: 900, castPoint: 0.25, manaCost: [80, 90, 100, 110], cooldown: [18, 17, 16, 15], values: { speed: [1100, 1100, 1100, 1100], damage: [90, 140, 190, 240], slow: [25, 30, 35, 40] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 160, range: 900, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 2.5, target: 'target', params: { moveSlowPct: 'slow' } }] } }], vfx: vfx('projectile', '#fff3c0') },
      { id: 'dawn-luminosity', name: 'Luminosity', targeting: 'attack-modifier', values: { damage: [20, 30, 40, 50], lifesteal: [15, 20, 25, 30] }, attackMod: { procChance: 35, bonusDamage: 'damage', lifestealPct: 'lifesteal' }, vfx: vfx('shield', '#ffd36a') },
      { id: 'dawn-solar-guardian', name: 'Solar Guardian', targeting: 'ground-aoe', ult: true, castRange: 3000, castPoint: 0.6, manaCost: [150, 200, 250], cooldown: [110, 95, 80], values: { damage: [180, 280, 380], heal: [180, 280, 380], radius: [450, 500, 550], stun: [1.2, 1.5, 1.8] }, effects: [{ kind: 'heal', amount: 'heal', target: 'allies-in-radius', radius: 'radius' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('global-mark', '#ffd36a', '#fff3c0') }
    ]
  }),
  hero({
    id: 'dragon-knight', name: 'Dragon Knight', title: 'Davion', attribute: 'str', roles: ['durable', 'carry', 'disabler'], region: 'shadeshore', palette: ['#c84632', '#314a38', '#f0b05a'], silhouette: { build: 'brute', scale: 1.08, head: 'helm', weapon: 'sword' },
    abilities: [
      { id: 'dk-breathe-fire', name: 'Breathe Fire', targeting: 'skillshot', castRange: 700, castPoint: 0.35, manaCost: [90, 100, 110, 120], cooldown: [14, 13, 12, 11], values: { speed: [900, 900, 900, 900], damage: [90, 150, 210, 270], reduction: [-12, -18, -24, -30] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 240, range: 750, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { damagePct: 'reduction' }, duration: 5, target: 'target' }] } }], vfx: vfx('projectile', '#ff6b35') },
      { id: 'dk-dragon-tail', name: 'Dragon Tail', targeting: 'unit-target', affects: 'enemy', castRange: 180, castPoint: 0.25, manaCost: [70, 80, 90, 100], cooldown: [16, 14, 12, 10], values: { damage: [70, 110, 150, 190], stun: [1.6, 2, 2.4, 2.8] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('stun-stars', '#f0b05a') },
      { id: 'dk-dragon-blood', name: 'Dragon Blood', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { armor: 8, hpRegen: 10 }, vfx: vfx('shield', '#314a38') },
      { id: 'dk-elder-dragon-form', name: 'Elder Dragon Form', targeting: 'no-target', ult: true, castPoint: 0.4, manaCost: [50, 50, 50], cooldown: [95, 85, 75], values: { duration: [30, 35, 40], damage: [30, 50, 70] }, effects: [{ kind: 'statmod', mods: { attackRange: 350, damage: 'damage', armor: 6 }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#c84632') }
    ]
  }),
  hero({
    id: 'huskar', name: 'Huskar', title: 'Sacred Warrior', attribute: 'str', roles: ['carry', 'durable'], region: 'vile-reaches', palette: ['#d84a2a', '#ffd06a', '#401510'], ranged: true, silhouette: { build: 'biped', bodyShape: 'slim', head: 'horned', weapon: 'staff' },
    abilities: [
      { id: 'husk-inner-vitality', name: 'Inner Vitality', targeting: 'unit-target', affects: 'ally', castRange: 550, castPoint: 0.25, manaCost: [70, 80, 90, 100], cooldown: [18, 16, 14, 12], values: { duration: [10, 10, 10, 10], regen: [18, 26, 34, 42], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { hpRegen: 'regen' }, duration: 'duration', target: 'target' }], vfx: vfx('shield', '#ffd06a') },
      { id: 'husk-burning-spear', name: 'Burning Spear', targeting: 'attack-modifier', values: { dps: [12, 22, 32, 42], bonus: [8, 12, 16, 20] }, attackMod: { procChance: 100, bonusDamage: 'bonus', procStatus: { status: 'buff', duration: 5, params: { dotDps: 'dps', dotType: 'magical', tag: 'burning-spear' } } }, vfx: vfx('projectile', '#ff5a2a') },
      { id: 'husk-berserkers-blood', name: "Berserker's Blood", targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { attackSpeed: 55, hpRegen: 10, magicResistPct: 12 }, vfx: vfx('shield', '#d84a2a') },
      { id: 'husk-life-break', name: 'Life Break', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 550, castPoint: 0, manaCost: [0, 0, 0], cooldown: [45, 35, 25], values: { damage: [220, 320, 420], slow: [40, 50, 60] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'damage', dtype: 'pure', amount: 120, target: 'self' }, { kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 'slow' } }], vfx: vfx('global-mark', '#d84a2a') }
    ]
  }),
  hero({
    id: 'mars', name: 'Mars', title: 'First Son of Heaven', attribute: 'str', roles: ['initiator', 'durable', 'disabler'], region: 'shadeshore', palette: ['#d83a2e', '#d8b05a', '#3a1010'], silhouette: { build: 'brute', scale: 1.1, head: 'helm', weapon: 'totem', extras: ['cape'] },
    abilities: [
      { id: 'mars-spear', name: 'Spear of Mars', targeting: 'skillshot', castRange: 900, castPoint: 0.25, manaCost: [100, 110, 120, 130], cooldown: [15, 14, 13, 12], values: { speed: [1100, 1100, 1100, 1100], damage: [100, 160, 220, 280], stun: [1.2, 1.6, 2, 2.4] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 120, range: 900, onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }] } }], vfx: vfx('projectile', '#d8b05a') },
      { id: 'mars-gods-rebuke', name: "God's Rebuke", targeting: 'no-target', castPoint: 0.2, manaCost: [80, 90, 100, 110], cooldown: [16, 14, 12, 10], values: { damage: [110, 170, 230, 290], radius: [360, 380, 400, 420] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'displace', mode: 'knockback', target: 'enemies-in-radius', radius: 'radius', distance: 220, speed: 900, toward: 'away-from-caster' }], vfx: vfx('storm', '#d83a2e') },
      { id: 'mars-bulwark', name: 'Bulwark', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { attackDamageTakenReductionPct: 28, armor: 4 }, vfx: vfx('shield', '#d8b05a') },
      { id: 'mars-arena', name: 'Arena of Blood', targeting: 'ground-aoe', ult: true, castRange: 550, castPoint: 0.45, manaCost: [150, 200, 250], cooldown: [100, 90, 80], values: { damage: [180, 280, 380], radius: [475, 525, 575], duration: [5, 6, 7] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', wall: true, onEnter: { affects: 'enemies', effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 0.5, target: 'target' }], windowSec: 1 } } }], vfx: vfx('wall', '#d83a2e', '#d8b05a') }
    ]
  }),
  hero({
    id: 'ogre-magi', name: 'Ogre Magi', title: 'Aggron Stonebreak', attribute: 'str', roles: ['support', 'disabler', 'durable'], region: 'icewrack', palette: ['#3d8cff', '#d84a32', '#ffe08a'], silhouette: { build: 'brute', scale: 1.12, head: 'bare', weapon: 'totem' },
    abilities: [
      { id: 'ogre-fireblast', name: 'Fireblast', targeting: 'unit-target', affects: 'enemy', castRange: 475, castPoint: 0.3, manaCost: [75, 85, 95, 105], cooldown: [11, 10, 9, 8], values: { damage: [90, 150, 210, 270], stun: [1.2, 1.4, 1.6, 1.8] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('stun-stars', '#d84a32') },
      { id: 'ogre-ignite', name: 'Ignite', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.25, manaCost: [80, 90, 100, 110], cooldown: [17, 15, 13, 11], values: { damage: [22, 34, 46, 58], slow: [20, 24, 28, 32] }, effects: [{ kind: 'status', status: 'slow', duration: 5, target: 'target', params: { moveSlowPct: 'slow', dotDps: 'damage', dotType: 'magical', tag: 'ignite' } }], vfx: vfx('beam', '#ff6b35') },
      { id: 'ogre-bloodlust', name: 'Bloodlust', targeting: 'unit-target', affects: 'ally', castRange: 700, castPoint: 0.2, manaCost: [40, 50, 60, 70], cooldown: [20, 18, 16, 14], values: { duration: [20, 22, 24, 26], attack: [35, 45, 55, 65], move: [8, 10, 12, 14] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 'attack', moveSpeedPct: 'move' }, duration: 'duration', target: 'target' }], vfx: vfx('shield', '#ffe08a') },
      { id: 'ogre-multicast', name: 'Multicast', targeting: 'no-target', ult: true, castPoint: 0.25, manaCost: [120, 160, 200], cooldown: [70, 60, 50], values: { damage: [120, 180, 240], count: [2, 3, 4], radius: [700, 800, 900] }, effects: [{ kind: 'repeat', count: 'count', interval: 0.2, radius: 'radius', retarget: 'random-enemy-in-radius', effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'random-enemy-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 0.5, target: 'random-enemy-in-radius', radius: 'radius' }] }], vfx: vfx('global-mark', '#d84a32', '#ffe08a') }
    ]
  }),
  hero({
    id: 'primal-beast', name: 'Primal Beast', title: 'Apex Stomper', attribute: 'str', roles: ['initiator', 'durable', 'disabler'], region: 'vile-reaches', palette: ['#9a4a2f', '#2b1a12', '#f0a05a'], silhouette: { build: 'quad', scale: 1.2, bodyShape: 'bulky', head: 'horned', weapon: 'none' },
    abilities: [
      { id: 'primal-onslaught', name: 'Onslaught', targeting: 'point-target', castRange: 900, castPoint: 0.2, manaCost: [90, 100, 110, 120], cooldown: [22, 20, 18, 16], values: { damage: [90, 150, 210, 270], distance: [750, 800, 850, 900], radius: [280, 300, 320, 340] }, effects: [{ kind: 'displace', mode: 'forced', target: 'self', toward: 'point', distance: 'distance', speed: 1300 }, { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'displace', mode: 'knockback', target: 'enemies-in-radius', radius: 'radius', distance: 220, speed: 900, toward: 'away-from-caster' }], vfx: vfx('global-mark', '#9a4a2f') },
      { id: 'primal-trample', name: 'Trample', targeting: 'no-target', castPoint: 0, manaCost: [90, 95, 100, 105], cooldown: [24, 22, 20, 18], values: { damage: [40, 60, 80, 100], radius: [300, 300, 300, 300], count: [5, 5, 5, 5] }, effects: [{ kind: 'repeat', count: 'count', interval: 0.35, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }] }], vfx: vfx('ground-aoe', '#f0a05a') },
      { id: 'primal-uproar', name: 'Uproar', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { damage: 28, armor: 6, statusResistPct: 15 }, vfx: vfx('shield', '#9a4a2f') },
      { id: 'primal-pulverize', name: 'Pulverize', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 200, castPoint: 0.2, manaCost: [100, 125, 150], cooldown: [40, 35, 30], values: { damage: [120, 180, 240], duration: [2, 2.5, 3] }, effects: [{ kind: 'status', status: 'stun', duration: 'duration', target: 'target' }], channel: { duration: 'duration', tick: { interval: 0.5, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }] } }, vfx: vfx('channel', '#f0a05a') }
    ]
  }),
  hero({
    id: 'spirit-breaker', name: 'Spirit Breaker', title: 'Barathrum', attribute: 'str', roles: ['initiator', 'disabler', 'durable'], region: 'mount-joerlak', palette: ['#486dff', '#1b2148', '#c8d8ff'], silhouette: { build: 'quad', scale: 1.14, bodyShape: 'bulky', head: 'horned', weapon: 'none' },
    abilities: [
      { id: 'sb-charge', name: 'Charge of Darkness', targeting: 'unit-target', affects: 'enemy', castRange: 3000, castPoint: 0.2, manaCost: [100, 100, 100, 100], cooldown: [22, 19, 16, 13], values: { damage: [80, 130, 180, 230], stun: [1, 1.2, 1.4, 1.6] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('hook', '#486dff') },
      { id: 'sb-bulldoze', name: 'Bulldoze', targeting: 'no-target', castPoint: 0, manaCost: [30, 40, 50, 60], cooldown: [22, 20, 18, 16], values: { duration: [6, 7, 8, 9] }, effects: [{ kind: 'statmod', mods: { moveSpeedPct: 20, statusResistPct: 50 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#c8d8ff') },
      { id: 'sb-greater-bash', name: 'Greater Bash', targeting: 'attack-modifier', values: { damage: [25, 45, 65, 85] }, attackMod: { procChance: 25, bonusDamage: 'damage', procStatus: { status: 'stun', duration: 0.8 } }, vfx: vfx('stun-stars', '#486dff') },
      { id: 'sb-nether-strike', name: 'Nether Strike', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0.35, manaCost: [125, 150, 175], cooldown: [70, 50, 30], values: { damage: [200, 320, 440], stun: [1.2, 1.4, 1.6] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('global-mark', '#486dff') }
    ]
  }),
  hero({
    id: 'underlord', name: 'Underlord', title: 'Vrogros', attribute: 'str', roles: ['durable', 'support', 'pusher'], region: 'vile-reaches', palette: ['#6fd84f', '#301830', '#f0a05a'], silhouette: { build: 'brute', scale: 1.16, head: 'horned', weapon: 'cleaver' },
    abilities: [
      { id: 'under-firestorm', name: 'Firestorm', targeting: 'ground-aoe', castRange: 750, castPoint: 0.45, manaCost: [110, 125, 140, 155], cooldown: [15, 14, 13, 12], values: { damage: [35, 50, 65, 80], radius: [425, 450, 475, 500], duration: [6, 6, 6, 6] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }] } } }], vfx: vfx('ground-aoe', '#f0a05a') },
      { id: 'under-pit', name: 'Pit of Malice', targeting: 'ground-aoe', castRange: 750, castPoint: 0.35, manaCost: [80, 90, 100, 110], cooldown: [22, 20, 18, 16], values: { damage: [40, 70, 100, 130], radius: [350, 375, 400, 425], duration: [4, 4, 4, 4], root: [1.2, 1.4, 1.6, 1.8] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', onEnter: { affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'root', duration: 'root', target: 'target' }], windowSec: 1 } } }], vfx: vfx('wall', '#6fd84f') },
      { id: 'under-atrophy-aura', name: 'Atrophy Aura', targeting: 'aura', values: { damage: [0, 0, 0, 0] }, aura: { radius: 900, affects: 'enemies', mods: { damagePct: -18 } }, vfx: vfx('shield', '#301830') },
      { id: 'under-dark-rift', name: 'Dark Rift', targeting: 'point-target', ult: true, castRange: 2500, castPoint: 0.5, manaCost: [125, 175, 225], cooldown: [110, 95, 80], values: { damage: [0, 0, 0], radius: [900, 1000, 1100], heal: [150, 250, 350] }, effects: [{ kind: 'heal', amount: 'heal', target: 'allies-in-radius', radius: 'radius' }, { kind: 'displace', mode: 'blink', target: 'allies-in-radius', radius: 'radius', toward: 'point', distance: 2500 }], vfx: vfx('global-mark', '#6fd84f', '#301830') }
    ]
  }),
  hero({
    id: 'anti-mage', name: 'Anti-Mage', title: 'Magina', attribute: 'agi', roles: ['carry', 'escape'], region: 'quoidge', palette: ['#7c4dff', '#1d1538', '#d8c8ff'], silhouette: { head: 'hood', weapon: 'sword' },
    abilities: [
      { id: 'am-mana-break', name: 'Mana Break', targeting: 'attack-modifier', values: { burn: [20, 30, 40, 50], damage: [20, 30, 40, 50] }, attackMod: { procChance: 100, manaBurnPerHit: 'burn', manaBurnAsDamagePct: 80, bonusDamage: 'damage' }, vfx: vfx('projectile', '#7c4dff') },
      { id: 'am-blink', name: 'Blink', targeting: 'point-target', castRange: 1150, castPoint: 0, manaCost: [60, 60, 60, 60], cooldown: [12, 10, 8, 6], values: { distance: [800, 925, 1050, 1150] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }], vfx: vfx('global-mark', '#7c4dff') },
      { id: 'am-counterspell', name: 'Counterspell', targeting: 'no-target', castPoint: 0, manaCost: [45, 50, 55, 60], cooldown: [15, 13, 11, 9], values: { duration: [1.2, 1.5, 1.8, 2.1] }, effects: [{ kind: 'status', status: 'magic-immune', duration: 'duration', target: 'self' }, { kind: 'statmod', mods: { magicResistPct: 25 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#d8c8ff') },
      { id: 'am-mana-void', name: 'Mana Void', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0.3, manaCost: [100, 200, 300], cooldown: [70, 60, 50], values: { damage: [250, 400, 550], radius: [450, 500, 550], stun: [0.4, 0.6, 0.8] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('global-mark', '#7c4dff') }
    ]
  }),
  hero({
    id: 'bloodseeker', name: 'Bloodseeker', title: 'Strygwyr', attribute: 'agi', roles: ['carry', 'initiator'], region: 'vile-reaches', palette: ['#b01818', '#2a0808', '#ff9a5a'], silhouette: { head: 'mask', weapon: 'cleaver' },
    abilities: [
      { id: 'bs-bloodrage', name: 'Bloodrage', targeting: 'unit-target', affects: 'any', castRange: 700, castPoint: 0.2, manaCost: [25, 25, 25, 25], cooldown: [14, 12, 10, 8], values: { duration: [8, 8, 8, 8], amp: [-8, -12, -16, -20], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { damagePct: 25, spellAmpPct: 18, damageTakenReductionPct: 'amp' }, duration: 'duration', target: 'target' }], vfx: vfx('shield', '#b01818') },
      { id: 'bs-blood-rite', name: 'Blood Rite', targeting: 'ground-aoe', castRange: 900, castPoint: 0.4, manaCost: [90, 100, 110, 120], cooldown: [15, 14, 13, 12], values: { damage: [120, 180, 240, 300], radius: [500, 525, 550, 575], silence: [3, 4, 5, 6] }, effects: [{ kind: 'damage', dtype: 'pure', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'silence', duration: 'silence', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('ground-aoe', '#b01818') },
      { id: 'bs-thirst', name: 'Thirst', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { moveSpeed: 35, damage: 24 }, vfx: vfx('shield', '#ff9a5a') },
      { id: 'bs-rupture', name: 'Rupture', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 800, castPoint: 0.35, manaCost: [100, 150, 200], cooldown: [75, 65, 55], values: { damage: [220, 330, 440], dps: [45, 65, 85] }, effects: [{ kind: 'damage', dtype: 'pure', amount: 'damage', target: 'target' }, { kind: 'status', status: 'buff', duration: 8, target: 'target', params: { dotDps: 'dps', dotType: 'pure', moveSlowPct: 25, tag: 'rupture' } }], vfx: vfx('global-mark', '#b01818') }
    ]
  }),
  hero({
    id: 'clinkz', name: 'Clinkz', title: 'Bone Fletcher', attribute: 'agi', roles: ['carry', 'escape'], region: 'mad-moon-crater', palette: ['#ff6b2f', '#1a1010', '#ffd08a'], ranged: true, silhouette: { head: 'skull', weapon: 'rifle' },
    abilities: [
      { id: 'clinkz-strafe', name: 'Strafe', targeting: 'no-target', castPoint: 0, manaCost: [40, 50, 60, 70], cooldown: [30, 26, 22, 18], values: { duration: [4, 5, 6, 7], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 130, evasionPct: 35 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#ff6b2f') },
      { id: 'clinkz-searing-arrows', name: 'Searing Arrows', targeting: 'attack-modifier', values: { damage: [25, 40, 55, 70] }, attackMod: { procChance: 100, bonusDamage: 'damage' }, vfx: vfx('projectile', '#ff6b2f') },
      { id: 'clinkz-skeleton-walk', name: 'Skeleton Walk', targeting: 'no-target', castPoint: 0, manaCost: [80, 80, 80, 80], cooldown: [20, 18, 16, 14], values: { duration: [12, 16, 20, 24] }, effects: [{ kind: 'status', status: 'invis', duration: 'duration', target: 'self', params: { fadeTime: 0.25, threatDropPct: 60 } }, { kind: 'statmod', mods: { moveSpeedPct: 25 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#ffd08a') },
      { id: 'clinkz-death-pact', name: 'Death Pact', targeting: 'no-target', ult: true, castPoint: 0.2, manaCost: [100, 125, 150], cooldown: [80, 70, 60], values: { duration: [35, 40, 45], damage: [45, 70, 95] }, effects: [{ kind: 'heal', amount: 350, target: 'self' }, { kind: 'statmod', mods: { maxHp: 500, damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#ff6b2f') }
    ]
  }),
  hero({
    id: 'gyrocopter', name: 'Gyrocopter', title: 'Aurel', attribute: 'agi', roles: ['carry', 'nuker'], region: 'shadeshore', palette: ['#d86a32', '#606878', '#ffe0a0'], ranged: true, silhouette: { head: 'helm', weapon: 'rifle' },
    abilities: [
      { id: 'gyro-rocket-barrage', name: 'Rocket Barrage', targeting: 'no-target', castPoint: 0, manaCost: [90, 90, 90, 90], cooldown: [7, 6.5, 6, 5.5], values: { damage: [22, 34, 46, 58], count: [8, 8, 8, 8], radius: [550, 550, 550, 550] }, effects: [{ kind: 'repeat', count: 'count', interval: 0.18, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'random-enemy-in-radius', radius: 'radius' }] }], vfx: vfx('storm', '#d86a32') },
      { id: 'gyro-homing-missile', name: 'Homing Missile', targeting: 'unit-target', affects: 'enemy', castRange: 1000, castPoint: 0.25, manaCost: [120, 130, 140, 150], cooldown: [26, 23, 20, 17], values: { speed: [550, 600, 650, 700], damage: [100, 175, 250, 325], stun: [1.4, 1.8, 2.2, 2.6] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }] } }], vfx: vfx('projectile', '#ffe0a0') },
      { id: 'gyro-flak-cannon', name: 'Flak Cannon', targeting: 'no-target', castPoint: 0, manaCost: [50, 50, 50, 50], cooldown: [24, 22, 20, 18], values: { duration: [6, 7, 8, 9], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 45, damage: 25 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#606878') },
      { id: 'gyro-call-down', name: 'Call Down', targeting: 'ground-aoe', ult: true, castRange: 1000, castPoint: 0.4, manaCost: [125, 150, 175], cooldown: [90, 75, 60], values: { damage: [250, 400, 550], radius: [450, 500, 550], slow: [35, 45, 55] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 4, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow' } }], vfx: vfx('global-mark', '#d86a32', '#ffe0a0') }
    ]
  }),
  hero({
    id: 'hoodwink', name: 'Hoodwink', title: 'Mistwoods Waylayer', attribute: 'agi', roles: ['nuker', 'escape', 'disabler'], region: 'hidden-wood', palette: ['#d88a3a', '#2e5a2e', '#ffe0a0'], ranged: true, silhouette: { head: 'hood', weapon: 'rifle', extras: ['quiver'] },
    abilities: [
      { id: 'hood-acorn-shot', name: 'Acorn Shot', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.25, manaCost: [75, 85, 95, 105], cooldown: [16, 14, 12, 10], values: { speed: [1000, 1000, 1000, 1000], damage: [80, 130, 180, 230], bounces: [2, 3, 4, 5] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', bounces: { count: 'bounces', radius: 475 }, onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }] } }], vfx: vfx('chain', '#d88a3a') },
      { id: 'hood-bushwhack', name: 'Bushwhack', targeting: 'ground-aoe', castRange: 900, castPoint: 0.3, manaCost: [90, 100, 110, 120], cooldown: [15, 14, 13, 12], values: { damage: [75, 125, 175, 225], radius: [275, 300, 325, 350], root: [1.4, 1.7, 2, 2.3] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'root', duration: 'root', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('ground-aoe', '#2e5a2e') },
      { id: 'hood-scurry', name: 'Scurry', targeting: 'no-target', castPoint: 0, manaCost: [35, 40, 45, 50], cooldown: [24, 22, 20, 18], values: { duration: [4, 4.5, 5, 5.5], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { moveSpeedPct: 30, evasionPct: 40 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#ffe0a0') },
      { id: 'hood-sharpshooter', name: 'Sharpshooter', targeting: 'skillshot', ult: true, castRange: 1600, castPoint: 0.4, manaCost: [125, 175, 225], cooldown: [90, 75, 60], values: { speed: [1400, 1400, 1400], damage: [350, 550, 750], slow: [35, 45, 55] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 120, range: 1600, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 'slow' } }] } }], vfx: vfx('projectile', '#ffe0a0') }
    ]
  }),
  hero({
    id: 'razor', name: 'Razor', title: 'Lightning Revenant', attribute: 'agi', roles: ['carry', 'durable'], region: 'mount-joerlak', palette: ['#72d8ff', '#1c2a5a', '#ffffff'], ranged: true, silhouette: { head: 'bare', weapon: 'staff' },
    abilities: [
      { id: 'razor-plasma-field', name: 'Plasma Field', targeting: 'no-target', castPoint: 0.25, manaCost: [125, 125, 125, 125], cooldown: [13, 12, 11, 10], values: { damage: [90, 150, 210, 270], radius: [650, 700, 750, 800], slow: [20, 25, 30, 35] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 1.5, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow' } }], vfx: vfx('storm', '#72d8ff') },
      { id: 'razor-static-link', name: 'Static Link', targeting: 'unit-target', affects: 'enemy', castRange: 550, castPoint: 0.2, manaCost: [65, 65, 65, 65], cooldown: [30, 25, 20, 15], values: { damage: [25, 40, 55, 70], drain: [-20, -30, -40, -50] }, effects: [{ kind: 'statmod', mods: { damage: 'damage' }, duration: 8, target: 'self' }, { kind: 'statmod', mods: { damage: 'drain' }, duration: 8, target: 'target' }], vfx: vfx('beam', '#72d8ff') },
      { id: 'razor-storm-surge', name: 'Storm Surge', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { moveSpeed: 35, magicResistPct: 10 }, vfx: vfx('shield', '#ffffff') },
      { id: 'razor-eye-storm', name: 'Eye of the Storm', targeting: 'no-target', ult: true, castPoint: 0.25, manaCost: [100, 150, 200], cooldown: [80, 70, 60], values: { damage: [80, 120, 160], count: [8, 10, 12], radius: [700, 750, 800] }, effects: [{ kind: 'repeat', count: 'count', interval: 0.5, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'random-enemy-in-radius', radius: 'radius' }, { kind: 'statmod', mods: { armor: -1 }, duration: 6, target: 'random-enemy-in-radius', radius: 'radius' }] }], vfx: vfx('global-mark', '#72d8ff', '#ffffff') }
    ]
  }),
  hero({
    id: 'templar-assassin', name: 'Templar Assassin', title: 'Lanaya', attribute: 'agi', roles: ['carry', 'escape'], region: 'quoidge', palette: ['#d88cff', '#3a1a5a', '#ffe8ff'], ranged: true, silhouette: { head: 'hood', weapon: 'staff' },
    abilities: [
      { id: 'ta-refraction', name: 'Refraction', targeting: 'no-target', castPoint: 0, manaCost: [85, 85, 85, 85], cooldown: [17, 16, 15, 14], values: { duration: [5, 5, 5, 5], damage: [25, 45, 65, 85] }, effects: [{ kind: 'statmod', mods: { damageTakenReductionPct: 45, damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#d88cff') },
      { id: 'ta-meld', name: 'Meld', targeting: 'no-target', castPoint: 0, manaCost: [35, 40, 45, 50], cooldown: [11, 10, 9, 8], values: { duration: [4, 5, 6, 7], damage: [80, 140, 200, 260] }, effects: [{ kind: 'status', status: 'invis', duration: 'duration', target: 'self', params: { fadeTime: 0.1, threatDropPct: 50 } }, { kind: 'statmod', mods: { damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#3a1a5a') },
      { id: 'ta-psi-blades', name: 'Psi Blades', targeting: 'attack-modifier', values: { damage: [15, 25, 35, 45], cleave: [25, 35, 45, 55] }, attackMod: { procChance: 100, bonusDamage: 'damage', cleave: { pct: 'cleave', radius: 500 } }, vfx: vfx('projectile', '#d88cff') },
      { id: 'ta-psionic-trap', name: 'Psionic Trap', targeting: 'ground-aoe', ult: true, castRange: 1200, castPoint: 0.2, manaCost: [15, 15, 15], cooldown: [10, 8, 6], values: { damage: [180, 280, 380], radius: [425, 475, 525], slow: [35, 45, 55] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 5, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow' } }], vfx: vfx('global-mark', '#d88cff') }
    ]
  }),
  hero({
    id: 'troll-warlord', name: 'Troll Warlord', title: 'Jah-rakal', attribute: 'agi', roles: ['carry', 'durable'], region: 'shadeshore', palette: ['#4a9ad8', '#d85a2a', '#f0e0a0'], ranged: true, silhouette: { head: 'horned', weapon: 'rifle' },
    abilities: [
      { id: 'troll-berserkers-rage', name: "Berserker's Rage", targeting: 'no-target', castPoint: 0, manaCost: [0, 0, 0, 0], cooldown: [8, 7, 6, 5], values: { duration: [8, 9, 10, 11], damage: [20, 30, 40, 50] }, effects: [{ kind: 'statmod', mods: { damage: 'damage', armor: 5, moveSpeed: 20 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#d85a2a') },
      { id: 'troll-whirling-axes', name: 'Whirling Axes', targeting: 'no-target', castPoint: 0.2, manaCost: [60, 60, 60, 60], cooldown: [9, 8, 7, 6], values: { damage: [90, 140, 190, 240], radius: [450, 475, 500, 525], blind: [30, 35, 40, 45] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'blind', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'blind' } }], vfx: vfx('storm', '#4a9ad8') },
      { id: 'troll-fervor', name: 'Fervor', targeting: 'attack-modifier', values: { damage: [10, 18, 26, 34] }, attackMod: { procChance: 100, bonusDamage: 'damage' }, passiveMods: { attackSpeed: 35 }, vfx: vfx('shield', '#f0e0a0') },
      { id: 'troll-battle-trance', name: 'Battle Trance', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [150, 150, 150], cooldown: [90, 80, 70], values: { duration: [6, 7, 8], damage: [60, 90, 120] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 180, lifestealPct: 60, damageTakenReductionPct: 35, damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#d85a2a') }
    ]
  }),
  hero({
    id: 'ursa', name: 'Ursa', title: 'Ulfsaar', attribute: 'agi', roles: ['carry', 'durable'], region: 'mount-joerlak', palette: ['#9a5a32', '#2a160c', '#f0c090'], silhouette: { build: 'brute', scale: 1.08, head: 'bare', weapon: 'cleaver' },
    abilities: [
      { id: 'ursa-earthshock', name: 'Earthshock', targeting: 'no-target', castPoint: 0.15, manaCost: [85, 90, 95, 100], cooldown: [12, 11, 10, 9], values: { damage: [90, 140, 190, 240], radius: [400, 425, 450, 475], slow: [25, 30, 35, 40] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow' } }], vfx: vfx('ground-aoe', '#9a5a32') },
      { id: 'ursa-overpower', name: 'Overpower', targeting: 'no-target', castPoint: 0, manaCost: [45, 55, 65, 75], cooldown: [15, 13, 11, 9], values: { duration: [5, 5, 5, 5], damage: [0, 0, 0, 0] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 300 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#f0c090') },
      { id: 'ursa-fury-swipes', name: 'Fury Swipes', targeting: 'attack-modifier', values: { damage: [12, 20, 28, 36] }, attackMod: { procChance: 100, bonusDamage: 'damage' }, vfx: vfx('stun-stars', '#9a5a32') },
      { id: 'ursa-enrage', name: 'Enrage', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [0, 0, 0], cooldown: [70, 55, 40], values: { duration: [4, 5, 6], damage: [50, 80, 110] }, effects: [{ kind: 'statmod', mods: { damageTakenReductionPct: 80, statusResistPct: 60, damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#f0c090') }
    ]
  }),
  hero({
    id: 'venomancer', name: 'Venomancer', title: 'Lesale Deathbringer', attribute: 'agi', roles: ['support', 'pusher'], region: 'devarshi-desert', palette: ['#75d84a', '#243a16', '#d8ff7a'], ranged: true, silhouette: { build: 'quad', scale: 0.9, head: 'horned', weapon: 'none' },
    abilities: [
      { id: 'veno-gale', name: 'Venomous Gale', targeting: 'skillshot', castRange: 900, castPoint: 0.3, manaCost: [95, 105, 115, 125], cooldown: [21, 20, 19, 18], values: { speed: [850, 850, 850, 850], damage: [50, 80, 110, 140], dps: [18, 32, 46, 60], slow: [35, 40, 45, 50] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 140, range: 900, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 6, target: 'target', params: { moveSlowPct: 'slow', dotDps: 'dps', dotType: 'magical', tag: 'venomous-gale' } }] } }], vfx: vfx('projectile', '#75d84a') },
      { id: 'veno-poison-sting', name: 'Poison Sting', targeting: 'attack-modifier', values: { dps: [8, 16, 24, 32], slow: [8, 12, 16, 20] }, attackMod: { procChance: 100, procStatus: { status: 'slow', duration: 6, params: { dotDps: 'dps', dotType: 'magical', moveSlowPct: 'slow', tag: 'poison-sting' } } }, vfx: vfx('projectile', '#d8ff7a') },
      { id: 'veno-plague-ward', name: 'Plague Ward', targeting: 'point-target', castRange: 850, castPoint: 0.25, manaCost: [25, 25, 25, 25], cooldown: [5, 5, 5, 5], values: { damage: [0, 0, 0, 0], count: [1, 1, 1, 1] }, effects: [{ kind: 'summon', at: 'point', count: 'count', summon: ward('venomancer-plague-ward', 'Plague Ward', ['#75d84a', '#243a16', '#d8ff7a']) }], vfx: vfx('summon-pop', '#75d84a') },
      { id: 'veno-poison-nova', name: 'Poison Nova', targeting: 'no-target', ult: true, castPoint: 0.35, manaCost: [200, 300, 400], cooldown: [110, 100, 90], values: { damage: [55, 75, 95], radius: [700, 800, 900] }, effects: [{ kind: 'status', status: 'buff', duration: 12, target: 'enemies-in-radius', radius: 'radius', params: { dotDps: 'damage', dotType: 'magical', tag: 'poison-nova' } }], vfx: vfx('global-mark', '#75d84a', '#d8ff7a') }
    ]
  }),
  hero({
    id: 'weaver', name: 'Weaver', title: 'Skitskurr', attribute: 'agi', roles: ['carry', 'escape'], region: 'mad-moon-crater', palette: ['#7ad8ff', '#2a1a58', '#ffd86a'], silhouette: { build: 'quad', scale: 0.8, head: 'horned', weapon: 'none' },
    abilities: [
      { id: 'weaver-swarm', name: 'The Swarm', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0.3, manaCost: [110, 120, 130, 140], cooldown: [44, 40, 36, 32], values: { speed: [900, 900, 900, 900], damage: [60, 90, 120, 150], armor: [-2, -3, -4, -5] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { armor: 'armor' }, duration: 8, target: 'target' }] } }], vfx: vfx('projectile', '#7ad8ff') },
      { id: 'weaver-shukuchi', name: 'Shukuchi', targeting: 'no-target', castPoint: 0, manaCost: [70, 80, 90, 100], cooldown: [12, 10, 8, 6], values: { duration: [4, 4, 4, 4], damage: [90, 140, 190, 240], radius: [300, 320, 340, 360] }, effects: [{ kind: 'status', status: 'invis', duration: 'duration', target: 'self', params: { fadeTime: 0.1, threatDropPct: 70 } }, { kind: 'statmod', mods: { moveSpeedPct: 45 }, duration: 'duration', target: 'self' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('shield', '#7ad8ff') },
      { id: 'weaver-geminate', name: 'Geminate Attack', targeting: 'attack-modifier', values: { damage: [25, 40, 55, 70] }, attackMod: { procChance: 45, bonusDamage: 'damage' }, passiveMods: { attackSpeed: 20 }, vfx: vfx('projectile', '#ffd86a') },
      { id: 'weaver-time-lapse', name: 'Time Lapse', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [150, 75, 0], cooldown: [70, 55, 40], values: { damage: [0, 0, 0], heal: [350, 550, 750] }, effects: [{ kind: 'purge', target: 'self' }, { kind: 'heal', amount: 'heal', target: 'self' }, { kind: 'displace', mode: 'blink', target: 'self', toward: 'facing', distance: 350 }], vfx: vfx('global-mark', '#7ad8ff', '#ffd86a') }
    ]
  })
];
