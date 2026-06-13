import type { DraftDef } from '../core/types';
import { ALL_BOSSES } from './bosses';

// The Elite Five + Champion are original homages to Dota 2 esports role
// archetypes and the back-to-back-champion legend (§3.13). All copy original.
export const ELITE_DRAFT: DraftDef = {
  id: 'elite-five',
  members: [
    {
      name: 'The Laning Captain',
      title: 'Warlord of the Safelane',
      pool: ['kunkka', 'tidehunter', 'mirana', 'shadow-fiend', 'crystal-maiden', 'earthshaker', 'witch-doctor'],
      dialogue: ["Lanes are won in the first ten seconds. I've already won.", 'Stack, pull, deny — the fundamentals never lose.']
    },
    {
      name: 'The Tempo Caller',
      title: 'Metronome of the Mid',
      pool: ['storm-spirit', 'ember-spirit', 'riki', 'bounty-hunter', 'slark', 'night-stalker', 'tusk', 'monkey-king', 'morphling'],
      dialogue: ['I set the pace. You just try to keep up.', 'Every rotation lands on the beat — my beat.']
    },
    {
      name: 'The Roshan Timer',
      title: 'Keeper of the Pit Clock',
      pool: ['sven', 'juggernaut', 'phantom-assassin', 'medusa', 'lifestealer', 'wraith-king', 'terrorblade', 'chaos-knight', 'phantom-lancer'],
      dialogue: ['I know exactly when the pit opens. Do you?', 'Smoke up — the timer already says we win this one.']
    },
    {
      name: 'The Spell Archivist',
      title: 'Curator of Combos',
      pool: ['invoker', 'zeus', 'skywrath-mage', 'silencer', 'outworld-destroyer', 'tinker', 'lion', 'rubick', 'arc-warden', 'techies'],
      dialogue: ['I keep a spell for every problem. Yours begins now.', 'Invoke, react, repeat.']
    },
    {
      name: 'The Five-Unit General',
      title: 'Commander of the Swarm',
      pool: ['chen', 'enchantress', 'natures-prophet', 'beastmaster', 'broodmother', 'warlock', 'visage', 'meepo', 'brewmaster'],
      dialogue: ['You fight five heroes. I fight with fifty units.', 'Micro is just leadership at speed.']
    }
  ],
  banPickOrder: ['ban', 'ban', 'pick', 'pick', 'ban', 'pick', 'pick', 'ban', 'pick', 'pick', 'pick', 'pick'],
  champion: [
    { heroId: 'faceless-void', level: 30, items: ['black-king-bar', 'butterfly'] },
    { heroId: 'spectre', level: 30, items: ['heart-of-tarrasque'] },
    { heroId: 'invoker', level: 30, items: ['scythe-of-vyse'] },
    { heroId: 'earthshaker', level: 30, items: ['blink-dagger', 'force-staff'] },
    { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'mekansm'] }
  ],
  championName: 'Avaryn the Twice-Crowned',
  championTitle: 'The Back-to-Back Ascendant',
  championDialogue: [
    'Two crowns, no equals. A third would just be greedy.',
    'They wrote the meta. I rewrote it — twice.',
    'Sit down. The throne was never up for draft.'
  ]
};

export const CHAMPION_BOSS = ALL_BOSSES.find((b) => b.id === 'boss-faceless-void')!;

export const ALL_DRAFTS: DraftDef[] = [ELITE_DRAFT];
