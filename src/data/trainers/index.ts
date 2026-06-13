import type { TrainerDef } from '../../core/types';

// Route trainers (§3.13): original homages to the five esports-scene archetypes
// — the booming shoutcaster, the analyst-desk sage, the meme-lord streamer, the
// stoic captain, and the unthanked support main. Names + copy are all original.
export const ALL_TRAINERS: TrainerDef[] = [
  {
    id: 'trainer-bellan',
    name: 'Brassthroat Bellan',
    title: 'The Booming Voice of the Pit',
    archetype: 'shoutcaster',
    regionId: 'tranquil-vale',
    dialogue: [
      'WHAT a play! Say it with me — FROM THE LOW GROUND?!',
      "I blew out my voice years ago and I have never once regretted it."
    ]
  },
  {
    id: 'trainer-chalkwright',
    name: 'Mirelle Chalkwright',
    title: 'Sage of the Analyst Desk',
    archetype: 'analyst',
    regionId: 'icewrack',
    dialogue: [
      "Let's roll the replay — your mistake is right there at frame one.",
      "The numbers never lie. You drafted greedy and the map punished you."
    ]
  },
  {
    id: 'trainer-lumen',
    name: 'Pip "Poggers" Lumen',
    title: 'The Meme-Lord of the Feed',
    archetype: 'streamer',
    regionId: 'nightsilver-woods',
    dialogue: [
      'Chat says ratio, and honestly? Chat is usually right.',
      'Smash that follow before I int this lane on purpose.'
    ]
  },
  {
    id: 'trainer-vael',
    name: 'Stonebrook Vael',
    title: 'The Stoic Captain',
    archetype: 'captain',
    regionId: 'devarshi-desert',
    dialogue: [
      'I do not tilt. I do not gloat. I close.',
      'Discipline beats highlight reels in every single game.'
    ]
  },
  {
    id: 'trainer-orla',
    name: 'Wickless Orla',
    title: 'The Unthanked Support Main',
    archetype: 'support',
    regionId: 'shadeshore',
    dialogue: [
      "I warded that ridge. You're welcome — not that you'll ever say it.",
      'I buy the dust, I take the blame, and I win you the game.'
    ]
  }
];
