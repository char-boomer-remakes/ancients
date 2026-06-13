import type { GymDef } from '../../core/types';

export const LUNAR_GYM: GymDef = {
  id: 'lunar-gym',
  name: 'Lunar Gym',
  badgeId: 'lunar-badge',
  regionId: 'nightsilver-woods',
  leader: 'Moonwarden Seryn',
  theme: 'Burst damage, night vision, and clustered nukes.',
  bestOf: 3,
  enemyBonusCaptainCalls: 1,
  enemyTeam: [
    { heroId: 'luna', level: 14, items: ['yasha', 'dragon-lance'] },
    { heroId: 'mirana', level: 14, items: ['euls-scepter'] },
    { heroId: 'lina', level: 14, items: ['kaya'] },
    { heroId: 'zeus', level: 14, items: ['arcane-boots'] },
    { heroId: 'lich', level: 14, items: ['glimmer-cape'] }
  ]
};

export const FROST_GYM: GymDef = {
  id: 'frost-gym',
  name: 'Frost Gym',
  badgeId: 'frost-badge',
  regionId: 'icewrack',
  leader: 'Warden Blueheart',
  theme: 'Slows, roots, silences, and channel disruption.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  enemyTeam: [
    { heroId: 'crystal-maiden', level: 17, items: ['glimmer-cape', 'euls-scepter'] },
    { heroId: 'jakiro', level: 17, items: ['arcane-boots'] },
    { heroId: 'ancient-apparition', level: 17, items: ['kaya'] },
    { heroId: 'tusk', level: 17, items: ['blink-dagger'] },
    { heroId: 'earthshaker', level: 17, items: ['force-staff'] }
  ]
};

export const BURROW_GYM: GymDef = {
  id: 'burrow-gym',
  name: 'Burrow Gym',
  badgeId: 'burrow-badge',
  regionId: 'devarshi-desert',
  leader: 'Captain Dunespark',
  theme: 'Blink initiations, sand disables, and carry punish windows.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  enemyTeam: [
    { heroId: 'sand-king', level: 20, items: ['blink-dagger', 'arcane-boots'] },
    { heroId: 'nyx-assassin', level: 20, items: ['euls-scepter'] },
    { heroId: 'phantom-assassin', level: 20, items: ['crystalys', 'black-king-bar'] },
    { heroId: 'medusa', level: 20, items: ['dragon-lance', 'ultimate-orb'] },
    { heroId: 'viper', level: 20, items: ['yasha'] }
  ]
};

export const TIDE_GYM: GymDef = {
  id: 'tide-gym',
  name: 'Tide Gym',
  badgeId: 'tide-badge',
  regionId: 'shadeshore',
  leader: 'Admiral Breakwater',
  theme: 'Boat timings, huge stuns, and river-fight durability.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  enemyTeam: [
    { heroId: 'kunkka', level: 22, items: ['black-king-bar', 'battlefury'] },
    { heroId: 'tidehunter', level: 22, items: ['blink-dagger', 'vladmirs-offering'] },
    { heroId: 'slardar', level: 22, items: ['blink-dagger'] },
    { heroId: 'naga-siren', level: 22, items: ['diffusal-blade'] },
    { heroId: 'slark', level: 22, items: ['yasha', 'mask-of-madness'] }
  ]
};

export const ROT_GYM: GymDef = {
  id: 'rot-gym',
  name: 'Rot Gym',
  badgeId: 'rot-badge',
  regionId: 'vile-reaches',
  leader: 'Mirecaller Voss',
  theme: 'Attrition, silences, reincarnation checks, and night pressure.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  enemyTeam: [
    { heroId: 'pudge', level: 24, items: ['blink-dagger', 'vladmirs-offering'] },
    { heroId: 'lifestealer', level: 24, items: ['sange'] },
    { heroId: 'undying', level: 24, items: ['mekansm'] },
    { heroId: 'doom', level: 24, items: ['black-king-bar'] },
    { heroId: 'wraith-king', level: 24, items: ['crystalys'] }
  ]
};

export const ARCANE_GYM: GymDef = {
  id: 'arcane-gym',
  name: 'Arcane Gym',
  badgeId: 'arcane-badge',
  regionId: 'quoidge',
  leader: 'Archivist Callstep',
  theme: 'Long-range spell chains and cooldown resets.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  enemyTeam: [
    { heroId: 'invoker', level: 26, items: ['kaya', 'euls-scepter'] },
    { heroId: 'silencer', level: 26, items: ['force-staff'] },
    { heroId: 'outworld-destroyer', level: 26, items: ['ultimate-orb'] },
    { heroId: 'skywrath-mage', level: 26, items: ['arcane-boots'] },
    { heroId: 'tinker', level: 26, items: ['blink-dagger'] }
  ]
};

export const WILD_GYM: GymDef = {
  id: 'wild-gym',
  name: 'Wild Gym',
  badgeId: 'wild-badge',
  regionId: 'hidden-wood',
  leader: 'Keeper Greenroom',
  theme: 'Summons, neutral conversion, and aura stacking.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  enemyTeam: [
    { heroId: 'enchantress', level: 27, items: ['dragon-lance'] },
    { heroId: 'chen', level: 27, items: ['mekansm'] },
    { heroId: 'natures-prophet', level: 27, items: ['maelstrom'] },
    { heroId: 'beastmaster', level: 27, items: ['vladmirs-offering'] },
    { heroId: 'broodmother', level: 27, items: ['diffusal-blade'] }
  ]
};

export const TITAN_GYM: GymDef = {
  id: 'titan-gym',
  name: 'Titan Gym',
  badgeId: 'titan-badge',
  regionId: 'mount-joerlak',
  leader: 'Summit Marshal',
  theme: 'Huge initiations and highland carry checks.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  enemyTeam: [
    { heroId: 'magnus', level: 29, items: ['blink-dagger', 'black-king-bar'] },
    { heroId: 'elder-titan', level: 29, items: ['force-staff'] },
    { heroId: 'tiny', level: 29, items: ['battlefury'] },
    { heroId: 'centaur-warrunner', level: 29, items: ['vladmirs-offering'] },
    { heroId: 'storm-spirit', level: 29, items: ['kaya'] }
  ]
};

export const ALL_GYMS: GymDef[] = [LUNAR_GYM, FROST_GYM, BURROW_GYM, TIDE_GYM, ROT_GYM, ARCANE_GYM, WILD_GYM, TITAN_GYM];
