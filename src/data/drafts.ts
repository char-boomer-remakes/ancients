import type { DraftDef } from '../core/types';
import { ALL_BOSSES } from './bosses';

export const ELITE_DRAFT: DraftDef = {
  id: 'elite-five',
  members: [
    { name: 'The Laning Captain', pool: ['kunkka', 'tidehunter', 'mirana', 'shadow-fiend', 'crystal-maiden', 'earthshaker', 'witch-doctor'] },
    { name: 'The Tempo Caller', pool: ['storm-spirit', 'ember-spirit', 'riki', 'bounty-hunter', 'slark', 'night-stalker', 'tusk'] },
    { name: 'The Roshan Timer', pool: ['sven', 'juggernaut', 'phantom-assassin', 'medusa', 'lifestealer', 'wraith-king', 'terrorblade'] },
    { name: 'The Spell Archivist', pool: ['invoker', 'zeus', 'skywrath-mage', 'silencer', 'outworld-destroyer', 'tinker', 'lion'] },
    { name: 'The Five-Unit General', pool: ['chen', 'enchantress', 'natures-prophet', 'beastmaster', 'broodmother', 'warlock', 'visage'] }
  ],
  banPickOrder: ['ban', 'ban', 'pick', 'pick', 'ban', 'pick', 'pick', 'ban', 'pick', 'pick', 'pick', 'pick'],
  champion: [
    { heroId: 'faceless-void', level: 30, items: ['black-king-bar', 'butterfly'] },
    { heroId: 'spectre', level: 30, items: ['heart-of-tarrasque'] },
    { heroId: 'invoker', level: 30, items: ['scythe-of-vyse'] },
    { heroId: 'earthshaker', level: 30, items: ['blink-dagger', 'force-staff'] },
    { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'mekansm'] }
  ]
};

export const CHAMPION_BOSS = ALL_BOSSES.find((b) => b.id === 'boss-faceless-void')!;

export const ALL_DRAFTS: DraftDef[] = [ELITE_DRAFT];
