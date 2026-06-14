import type { CutsceneDef, RegionDef } from '../core/types';
import { ALL_GYMS } from './gyms';
import { ALL_RAIDS } from './raids';
import { ELITE_DRAFT } from './drafts';
import { TRANQUIL_VALE } from './regions/tranquil-vale';
import { NIGHTSILVER_WOODS } from './regions/nightsilver-woods';
import { ICEWRACK } from './regions/icewrack';
import { PHASE3_REGIONS } from './regions/phase3';

const REGIONS: RegionDef[] = [TRANQUIL_VALE, NIGHTSILVER_WOODS, ICEWRACK, ...PHASE3_REGIONS];

const setpieceShot = { angle: 'wide', move: 'push-in', palette: 'moonlit gold', mood: 'mythic' } as const;
const stingerShot = { angle: 'title-card', move: 'hold', palette: 'biome grade', mood: 'revealing' } as const;

const PROLOGUE: CutsceneDef = {
  id: 'prologue-moon-breaks',
  title: 'The Moon Breaks',
  tier: 'setpiece',
  trigger: { kind: 'new-game' },
  skippable: true,
  letterbox: true,
  music: 'silence',
  category: 'Prologue',
  replayable: true,
  beats: [
    {
      shot: { angle: 'high', move: 'hold', palette: 'cold moonlight', mood: 'held breath' },
      stage: [{ kind: 'title', text: 'The Mad Moon hangs whole over the Radiant shelf.' }],
      hold: 2.2
    },
    {
      shot: { angle: 'close', move: 'snap', palette: 'white fracture', mood: 'sundering' },
      stage: [{ kind: 'title', text: 'A single crack becomes a sky of falling shards.' }],
      line: { speaker: 'Narration', text: 'They sealed the war inside the Moon. The war broke the Moon.' },
      hold: 3.2
    },
    {
      shot: { angle: 'low', move: 'push-in', palette: 'dawn gold', mood: 'awakening' },
      stage: [{ kind: 'title', text: 'At your feet, one shard remembers.' }],
      line: { speaker: 'Narration', text: 'Every shard still remembers it.' },
      sound: 'capture',
      hold: 2.8
    }
  ]
};

const BIND_FIRST: CutsceneDef = {
  id: 'bind-first',
  title: 'What You Are',
  tier: 'setpiece',
  trigger: { kind: 'bind', first: true },
  skippable: true,
  letterbox: true,
  category: 'Binds',
  replayable: true,
  beats: [
    {
      shot: { angle: 'over-shoulder', move: 'push-in', palette: 'shard white', mood: 'uncertain' },
      stage: [{ kind: 'focus', target: 'ally' }],
      line: { speaker: '{hero}', text: '{bark}', portraitHeroId: '{heroId}' },
      hold: 3
    },
    {
      shot: setpieceShot,
      stage: [{ kind: 'vfx', archetype: 'channel', color: '#d8f4ff' }],
      line: { speaker: 'Narration', text: 'It does not die. It remembers you now. The first war you will carry.' },
      sound: 'capture',
      hold: 3.6
    }
  ]
};

const BIND_STINGER: CutsceneDef = {
  id: 'bind-stinger',
  title: '{hero} Joins',
  tier: 'stinger',
  trigger: { kind: 'bind' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'push-in', palette: 'attribute flare', mood: 'claimed' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ffd86a' }],
      line: { speaker: '{hero}', text: '{bark}', portraitHeroId: '{heroId}' },
      sound: 'capture',
      hold: 2.4
    }
  ]
};

function arrival(region: RegionDef): CutsceneDef {
  return {
    id: region.arrivalBeat ?? `arrival-${region.id}`,
    title: region.name,
    tier: region.id === 'mad-moon-crater' ? 'setpiece' : 'stinger',
    trigger: { kind: 'region-arrival', regionId: region.id },
    skippable: true,
    letterbox: region.id === 'mad-moon-crater',
    category: 'Regions',
    replayable: true,
    beats: [
      {
        shot: { ...stingerShot, palette: `${region.biome} grade` },
        stage: [{ kind: 'title', text: region.name }],
        line: { speaker: region.name, text: region.lore },
        hold: region.id === 'mad-moon-crater' ? 5 : 3.4
      }
    ]
  };
}

function badge(gym: (typeof ALL_GYMS)[number]): CutsceneDef {
  const setpiece = ['lunar-badge', 'arcane-badge', 'titan-badge'].includes(gym.badgeId);
  return {
    id: `badge-${gym.badgeId}`,
    title: gym.badgeId.replace(/-/g, ' '),
    tier: setpiece ? 'setpiece' : 'stinger',
    trigger: { kind: 'badge', badgeId: gym.badgeId },
    skippable: true,
    letterbox: setpiece,
    category: 'Regions',
    replayable: true,
    beats: [
      {
        shot: { angle: 'title-card', move: 'hold', palette: 'badge gold', mood: 'earned' },
        stage: [{ kind: 'title', text: '{badge}' }],
        line: { speaker: gym.leader, text: gym.dialogue[0] ?? gym.theme },
        sound: 'badge',
        hold: setpiece ? 4.2 : 2.8
      }
    ]
  };
}

function raidIntro(raid: (typeof ALL_RAIDS)[number]): CutsceneDef {
  return {
    id: `raid-intro-${raid.id}`,
    title: raid.name,
    tier: 'setpiece',
    trigger: { kind: 'raid-intro', raidId: raid.id },
    skippable: true,
    letterbox: true,
    category: 'Raids',
    replayable: true,
    beats: [
      {
        shot: { angle: 'wide', move: 'crane', palette: 'raid shadow', mood: 'withheld' },
        stage: [{ kind: 'title', text: raid.location }],
        line: { speaker: raid.name, text: raid.dialogue[0] ?? raid.title },
        hold: 3
      },
      {
        shot: { angle: 'low', move: 'push-in', palette: 'claimant accent', mood: 'threatening' },
        stage: [{ kind: 'focus', target: 'boss' }],
        line: { speaker: raid.name, text: raid.dialogue[1] ?? raid.title },
        sound: 'raid-clear',
        hold: 3.2
      }
    ]
  };
}

const RAID_CLEAR: CutsceneDef = {
  id: 'raid-clear-stinger',
  title: '{raid} Falls',
  tier: 'stinger',
  trigger: { kind: 'raid-clear' },
  skippable: true,
  letterbox: false,
  category: 'Raids',
  replayable: false,
  beats: [
    {
      shot: { angle: 'wide', move: 'pull-back', palette: 'loot gold', mood: 'claimed' },
      stage: [{ kind: 'vfx', archetype: 'ground-aoe', color: '#ffd86a' }],
      line: { speaker: 'Spoils', text: '{raid} falls. The floor answers with proof.' },
      sound: 'raid-clear',
      hold: 2.4
    }
  ]
};

const BOSS_CLEAR: CutsceneDef = {
  id: 'boss-clear-stinger',
  title: '{boss} Defeated',
  tier: 'stinger',
  trigger: { kind: 'boss-clear' },
  skippable: true,
  letterbox: false,
  category: 'Bosses',
  replayable: false,
  beats: [
    {
      shot: { angle: 'low', move: 'pull-back', palette: 'victory gold', mood: 'released' },
      stage: [{ kind: 'focus', target: 'boss' }],
      line: { speaker: 'Boss Clear', text: '{boss} breaks. The shard-road opens wider.' },
      sound: 'raid-clear',
      hold: 2.5
    }
  ]
};

const ECHO_MILESTONE: CutsceneDef = {
  id: 'echo-milestone-stinger',
  title: 'A War You Carry',
  tier: 'stinger',
  trigger: { kind: 'echo-milestone' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'push-in', palette: 'echo blue', mood: 'remembered' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#9db8ff' }],
      line: { speaker: '{hero}', text: '{echoLine}' },
      sound: 'levelup',
      hold: 2.8
    }
  ]
};

const ELITE_OPEN: CutsceneDef = {
  id: 'elite-gauntlet-open',
  title: 'The Gauntlet Opens',
  tier: 'setpiece',
  trigger: { kind: 'elite-start' },
  skippable: true,
  letterbox: true,
  category: 'Endgame',
  replayable: true,
  beats: [
    {
      shot: { angle: 'wide', move: 'crane', palette: 'tower shadow', mood: 'final gate' },
      stage: [{ kind: 'title', text: 'Five doors before the Tower.' }],
      line: { speaker: 'Elite Five', text: 'Five doors, one Champion, and the Tower above them all.' },
      hold: 4
    }
  ]
};

const ELITE_PERSONAS: CutsceneDef[] = ELITE_DRAFT.members.map((member, index) => ({
  id: `elite-persona-${index}`,
  title: member.name,
  tier: 'stinger',
  trigger: { kind: 'elite-persona', index },
  skippable: true,
  letterbox: false,
  category: 'Endgame',
  replayable: false,
  beats: [
    {
      shot: { angle: 'title-card', move: 'hold', palette: 'draft gold', mood: 'competitive' },
      stage: [{ kind: 'title', text: member.title }],
      line: { speaker: member.name, text: member.dialogue[0] ?? member.title },
      hold: 2.8
    }
  ]
}));

const CHAMPION_CLEAR: CutsceneDef = {
  id: 'champion-clear',
  title: 'Two Crowns, No Equals',
  tier: 'setpiece',
  trigger: { kind: 'champion-clear' },
  skippable: true,
  letterbox: true,
  category: 'Endgame',
  replayable: true,
  beats: [
    {
      shot: { angle: 'low', move: 'push-in', palette: 'radiant and dire', mood: 'concession' },
      stage: [{ kind: 'title', text: ELITE_DRAFT.championTitle }],
      line: { speaker: ELITE_DRAFT.championName, text: ELITE_DRAFT.championDialogue[0] },
      hold: 3.6
    },
    {
      shot: { angle: 'wide', move: 'crane', palette: 'crater moonlight', mood: 'choice' },
      stage: [{ kind: 'focus', target: 'tower' }],
      line: { speaker: 'The Tower', text: 'The Loop is open. Decide what the world remembers next.' },
      sound: 'raid-clear',
      hold: 4.2
    }
  ]
};

export const ALL_CUTSCENES: CutsceneDef[] = [
  PROLOGUE,
  BIND_FIRST,
  BIND_STINGER,
  ...REGIONS.map(arrival),
  ...ALL_GYMS.map(badge),
  ...ALL_RAIDS.map(raidIntro),
  RAID_CLEAR,
  BOSS_CLEAR,
  ECHO_MILESTONE,
  ELITE_OPEN,
  ...ELITE_PERSONAS,
  CHAMPION_CLEAR
];
