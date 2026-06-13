import type { RecruitmentQuestDef, TrialDef, TrialKind } from '../../core/types';

const HERO_REGION: Record<string, string> = {
  pudge: 'vile-reaches',
  earthshaker: 'tranquil-vale',
  lich: 'icewrack',
  luna: 'nightsilver-woods',
  sven: 'tranquil-vale',
  axe: 'tranquil-vale',
  'crystal-maiden': 'icewrack',
  sniper: 'tranquil-vale',
  mirana: 'nightsilver-woods',
  lina: 'nightsilver-woods',
  zeus: 'quoidge',
  'drow-ranger': 'tranquil-vale',
  jakiro: 'icewrack',
  'witch-doctor': 'tranquil-vale',
  omniknight: 'tranquil-vale',
  windranger: 'tranquil-vale',
  'phantom-assassin': 'devarshi-desert',
  tusk: 'icewrack',
  'ancient-apparition': 'icewrack',
  'legion-commander': 'tranquil-vale',
  'vengeful-spirit': 'tranquil-vale',
  'shadow-fiend': 'nightsilver-woods',
  riki: 'nightsilver-woods',
  'bounty-hunter': 'nightsilver-woods',
  lion: 'icewrack',
  'winter-wyvern': 'icewrack',
  'sand-king': 'devarshi-desert',
  'nyx-assassin': 'devarshi-desert',
  medusa: 'devarshi-desert',
  viper: 'devarshi-desert',
  kunkka: 'shadeshore',
  tidehunter: 'shadeshore',
  slardar: 'shadeshore',
  'naga-siren': 'shadeshore',
  slark: 'shadeshore',
  lifestealer: 'vile-reaches',
  undying: 'vile-reaches',
  doom: 'vile-reaches',
  'wraith-king': 'vile-reaches',
  'night-stalker': 'vile-reaches',
  invoker: 'quoidge',
  silencer: 'quoidge',
  'outworld-destroyer': 'quoidge',
  'skywrath-mage': 'quoidge',
  tinker: 'quoidge',
  enchantress: 'hidden-wood',
  chen: 'hidden-wood',
  'natures-prophet': 'hidden-wood',
  beastmaster: 'hidden-wood',
  broodmother: 'hidden-wood',
  warlock: 'hidden-wood',
  visage: 'hidden-wood',
  magnus: 'mount-joerlak',
  'elder-titan': 'mount-joerlak',
  tiny: 'mount-joerlak',
  'treant-protector': 'mount-joerlak',
  'centaur-warrunner': 'mount-joerlak',
  'storm-spirit': 'mount-joerlak',
  'ember-spirit': 'mount-joerlak',
  spectre: 'mad-moon-crater',
  'faceless-void': 'mad-moon-crater',
  terrorblade: 'mad-moon-crater',
  phoenix: 'mad-moon-crater',
  io: 'mad-moon-crater'
};

const SPECIAL_TRIALS: Record<string, TrialKind> = {
  invoker: 'combo-exam',
  chen: 'persuasion-gauntlet',
  'phantom-assassin': 'assassination-contract',
  'night-stalker': 'survive-night',
  kunkka: 'faction-choice',
  tidehunter: 'faction-choice',
  'elder-titan': 'lore-riddle',
  sven: 'relic-fetch',
  phoenix: 'raid-recruit',
  io: 'roster-legend'
};

function trialKind(heroId: string): TrialKind {
  if (SPECIAL_TRIALS[heroId]) return SPECIAL_TRIALS[heroId];
  if (heroId.includes('crystal') || heroId.includes('lich') || heroId.includes('winter') || heroId.includes('ancient')) return 'frost-exam';
  if (heroId.includes('sniper') || heroId.includes('mirana') || heroId.includes('pudge') || heroId.includes('windranger')) return 'skillshot-exam';
  if (heroId.includes('luna') || heroId.includes('drow') || heroId.includes('riki')) return 'survive-night';
  if (heroId.includes('axe') || heroId.includes('lina') || heroId.includes('zeus') || heroId.includes('doom')) return 'timed-cull';
  return 'honor-duel';
}

const POS_BY_REGION: Record<string, { x: number; y: number }> = {
  'tranquil-vale': { x: 5900, y: 6800 },
  'nightsilver-woods': { x: 6000, y: 6800 },
  icewrack: { x: 6200, y: 6700 },
  'devarshi-desert': { x: 6000, y: 6900 },
  shadeshore: { x: 5600, y: 6900 },
  'vile-reaches': { x: 6000, y: 6900 },
  quoidge: { x: 6000, y: 6900 },
  'hidden-wood': { x: 5600, y: 6900 },
  'mount-joerlak': { x: 6000, y: 6900 },
  'mad-moon-crater': { x: 7000, y: 7800 }
};

function titleCase(id: string): string {
  return id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function trial(heroId: string): TrialDef {
  const regionId = HERO_REGION[heroId] ?? 'tranquil-vale';
  const kind = trialKind(heroId);
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
      'skillshot-exam': 'Land or dodge a decisive line spell.',
      'combo-exam': 'Chain three spell schools into one clean combo.',
      'persuasion-gauntlet': 'Convert wild creeps instead of killing them.',
      'assassination-contract': 'Mark a target and finish the contract quickly.',
      'faction-choice': 'Choose one side of the Shadeshore captain feud.',
      'lore-riddle': 'Answer the old worldsmith riddle, then fight.',
      'raid-recruit': 'Clear the Roshan-pit recruit encounter.',
      'roster-legend': 'Recruit fifty heroes before the Wisp answers.'
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

export const QUEST_HERO_IDS = Object.keys(HERO_REGION);
export const ALL_TRIALS: TrialDef[] = QUEST_HERO_IDS.map(trial);
export const ALL_QUESTS: RecruitmentQuestDef[] = QUEST_HERO_IDS.map(quest);
