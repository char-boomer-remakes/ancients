import type { RecruitmentQuestDef, TrialDef, TrialKind } from '../../core/types';

const TRIAL_KIND_BY_HERO: Record<string, TrialKind> = {
  pudge: 'skillshot-exam',
  earthshaker: 'relic-fetch',
  lich: 'frost-exam',
  luna: 'survive-night',
  sven: 'honor-duel',
  axe: 'timed-cull',
  'crystal-maiden': 'frost-exam',
  sniper: 'skillshot-exam',
  mirana: 'skillshot-exam',
  lina: 'timed-cull',
  zeus: 'timed-cull',
  'drow-ranger': 'survive-night',
  jakiro: 'frost-exam',
  'witch-doctor': 'relic-fetch',
  omniknight: 'honor-duel',
  windranger: 'skillshot-exam',
  'phantom-assassin': 'honor-duel',
  tusk: 'honor-duel',
  'ancient-apparition': 'frost-exam'
};

const REGION_BY_HERO: Record<string, string> = {
  luna: 'nightsilver-woods',
  mirana: 'nightsilver-woods',
  lina: 'nightsilver-woods',
  zeus: 'nightsilver-woods',
  'drow-ranger': 'nightsilver-woods',
  'crystal-maiden': 'icewrack',
  jakiro: 'icewrack',
  tusk: 'icewrack',
  'ancient-apparition': 'icewrack'
};

const POS_BY_REGION: Record<string, { x: number; y: number }> = {
  'tranquil-vale': { x: 5900, y: 6800 },
  'nightsilver-woods': { x: 6000, y: 6800 },
  icewrack: { x: 6200, y: 6700 }
};

function titleCase(id: string): string {
  return id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function trial(heroId: string): TrialDef {
  const regionId = REGION_BY_HERO[heroId] ?? 'tranquil-vale';
  const kind = TRIAL_KIND_BY_HERO[heroId];
  return {
    id: `trial-${heroId}`,
    heroId,
    kind,
    name: `${titleCase(heroId)} Trial`,
    description: {
      'honor-duel': 'Win a clean duel against the hero echo.',
      'timed-cull': 'Cull a small wave before the trial flame gutters out.',
      'relic-fetch': 'Recover a lore relic from a guarded marker.',
      'survive-night': 'Stand your ground under nightfall.',
      'frost-exam': 'Prove you can fight through slows and disables.',
      'skillshot-exam': 'Land or dodge a decisive line spell.'
    }[kind],
    regionId,
    pos: POS_BY_REGION[regionId]
  };
}

function quest(heroId: string): RecruitmentQuestDef {
  return {
    id: `recruit-${heroId}`,
    heroId,
    trialId: `trial-${heroId}`,
    findText: `${titleCase(heroId)} has been sighted near an echo scar.`,
    trialText: `Complete ${titleCase(heroId)}'s trial, then challenge the binding echo.`,
    bindText: `Defeat ${titleCase(heroId)} in a binding duel to recruit them.`
  };
}

export const QUEST_HERO_IDS = Object.keys(TRIAL_KIND_BY_HERO);
export const ALL_TRIALS: TrialDef[] = QUEST_HERO_IDS.map(trial);
export const ALL_QUESTS: RecruitmentQuestDef[] = QUEST_HERO_IDS.map(quest);
