import type { BossDef, LootTable } from '../core/types';
import { TUNING } from './tuning';

const ANCHORS = ['butterfly', 'heart-of-tarrasque', 'eye-of-skadi', 'refresher-orb', 'aghanims-scepter', 'divine-rapier'];
const COMPONENTS = ['demon-edge', 'eaglesong', 'reaver', 'mystic-staff', 'ultimate-orb', 'point-booster', 'sacred-relic'];

function loot(heroId: string): LootTable {
  const idx = Math.abs(heroId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
  return {
    guaranteed: [COMPONENTS[idx % COMPONENTS.length]],
    assembledPool: [ANCHORS[idx % ANCHORS.length]],
    dropPct: TUNING.bossAssembledDropPct,
    pity: TUNING.raidBadLuckPity
  };
}

function boss(id: string, heroId: string, region: string, rank: BossDef['rank']): BossDef {
  return {
    id,
    heroId,
    region,
    rank,
    phases: rank === 'boss'
      ? [
          { atHpPct: 66, onEnter: [{ kind: 'status', status: 'buff', duration: 6, target: 'self', params: { mods: { damagePct: 18 }, tag: `${id}-phase-2` } }] },
          { atHpPct: 33, onEnter: [{ kind: 'status', status: 'buff', duration: 8, target: 'self', params: { mods: { attackSpeed: 45 }, tag: `${id}-phase-3` } }], gambitBias: 'finish' }
        ]
      : [{ atHpPct: 50, onEnter: [{ kind: 'status', status: 'buff', duration: 5, target: 'self', params: { mods: { moveSpeedPct: 12 }, tag: `${id}-mini-phase` } }] }],
    loot: loot(heroId),
    tiers: ['normal', 'nightmare', 'hell']
  };
}

const SPECS: [string, string, string, BossDef['rank']][] = [
  ['boss-phantom-assassin', 'phantom-assassin', 'devarshi-desert', 'boss'],
  ['boss-medusa', 'medusa', 'devarshi-desert', 'boss'],
  ['mini-sand-king', 'sand-king', 'devarshi-desert', 'mini-boss'],
  ['mini-nyx-assassin', 'nyx-assassin', 'devarshi-desert', 'mini-boss'],
  ['mini-viper', 'viper', 'devarshi-desert', 'mini-boss'],
  ['boss-kunkka', 'kunkka', 'shadeshore', 'boss'],
  ['boss-tidehunter', 'tidehunter', 'shadeshore', 'boss'],
  ['boss-naga-siren', 'naga-siren', 'shadeshore', 'boss'],
  ['mini-slardar', 'slardar', 'shadeshore', 'mini-boss'],
  ['mini-slark', 'slark', 'shadeshore', 'mini-boss'],
  ['boss-pudge', 'pudge', 'vile-reaches', 'boss'],
  ['boss-lifestealer', 'lifestealer', 'vile-reaches', 'boss'],
  ['boss-doom', 'doom', 'vile-reaches', 'boss'],
  ['boss-wraith-king', 'wraith-king', 'vile-reaches', 'boss'],
  ['mini-undying', 'undying', 'vile-reaches', 'mini-boss'],
  ['mini-night-stalker', 'night-stalker', 'vile-reaches', 'mini-boss'],
  ['boss-invoker', 'invoker', 'quoidge', 'boss'],
  ['boss-zeus', 'zeus', 'quoidge', 'boss'],
  ['mini-silencer', 'silencer', 'quoidge', 'mini-boss'],
  ['mini-outworld-destroyer', 'outworld-destroyer', 'quoidge', 'mini-boss'],
  ['mini-skywrath-mage', 'skywrath-mage', 'quoidge', 'mini-boss'],
  ['mini-tinker', 'tinker', 'quoidge', 'mini-boss'],
  ['boss-natures-prophet', 'natures-prophet', 'hidden-wood', 'boss'],
  ['boss-broodmother', 'broodmother', 'hidden-wood', 'boss'],
  ['mini-enchantress', 'enchantress', 'hidden-wood', 'mini-boss'],
  ['mini-chen', 'chen', 'hidden-wood', 'mini-boss'],
  ['mini-beastmaster', 'beastmaster', 'hidden-wood', 'mini-boss'],
  ['mini-warlock', 'warlock', 'hidden-wood', 'mini-boss'],
  ['mini-visage', 'visage', 'hidden-wood', 'mini-boss'],
  ['boss-magnus', 'magnus', 'mount-joerlak', 'boss'],
  ['boss-elder-titan', 'elder-titan', 'mount-joerlak', 'boss'],
  ['boss-tiny', 'tiny', 'mount-joerlak', 'boss'],
  ['boss-storm-spirit', 'storm-spirit', 'mount-joerlak', 'boss'],
  ['boss-ember-spirit', 'ember-spirit', 'mount-joerlak', 'boss'],
  ['mini-treant-protector', 'treant-protector', 'mount-joerlak', 'mini-boss'],
  ['mini-centaur-warrunner', 'centaur-warrunner', 'mount-joerlak', 'mini-boss'],
  ['boss-spectre', 'spectre', 'mad-moon-crater', 'boss'],
  ['boss-faceless-void', 'faceless-void', 'mad-moon-crater', 'boss'],
  ['boss-terrorblade', 'terrorblade', 'mad-moon-crater', 'boss']
];

export const ALL_BOSSES: BossDef[] = SPECS.map(([id, heroId, region, rank]) => boss(id, heroId, region, rank));
