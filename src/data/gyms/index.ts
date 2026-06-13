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

export const ALL_GYMS: GymDef[] = [LUNAR_GYM, FROST_GYM];
