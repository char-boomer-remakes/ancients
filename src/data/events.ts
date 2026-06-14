import type { LegendDef, SeasonalEventDef } from '../core/types';

export const ALL_SEASONAL_EVENTS: SeasonalEventDef[] = [
  {
    id: 'diretide-roshan-candy',
    name: 'Diretide: Roshan Wakes Hungry',
    realEvent: 'Diretide',
    summary: 'A Roshan-candy rite around the Pit: feed the hunger, survive the Roshlings, keep the Loop laughing.',
    mode: 'roshan-candy',
    regionId: 'mad-moon-crater',
    cutsceneId: 'seasonal-diretide-roshan-candy',
    codexTitle: 'Diretide: Roshan Wakes Hungry',
    codexBody: 'One turn of the Loop remembers Roshan as hunger instead of guardian. Candy, Roshlings, and the Pit all point at the same joke: the immortal monster still wants tribute.',
    reward: { kind: 'loot-mark', amount: 1, label: 'late loot mark' }
  },
  {
    id: 'wraith-night-altar',
    name: 'Wraith-Night: The Altar Holds',
    realEvent: 'Wraith-Night',
    summary: 'An Icewrack wave defense at a frozen altar, climaxing on the king who refuses to stay dead.',
    mode: 'wave-defense',
    regionId: 'icewrack',
    cutsceneId: 'seasonal-wraith-night-altar',
    codexTitle: 'Wraith-Night: The Altar Holds',
    codexBody: 'The old altar has seen every dead king stand again. Wraith-Night turns that memory into a siege: hold the line, count the revivals, and let Icewrack ring.',
    reward: { kind: 'gold', amount: 750, label: 'festival purse' }
  },
  {
    id: 'continuum-descent',
    name: "Aghanim's Continuum Descent",
    realEvent: "Aghanim's Labyrinth: The Continuum Conundrum",
    summary: 'An endless-descent framing for the dungeon system, with room choices treated as time folding over itself.',
    mode: 'endless-descent',
    regionId: 'quoidge',
    cutsceneId: 'seasonal-continuum-descent',
    codexTitle: "Aghanim's Continuum Descent",
    codexBody: 'Quoidge scholars insist the dungeon is not below the town. It is beside yesterday. The Continuum event turns endless rooms into a joke only Aghanim would tell twice.',
    reward: { kind: 'loot-mark', amount: 1, label: 'mid loot mark' }
  },
  {
    id: 'cycle-beast',
    name: 'New Bloom: The Cycle Beast',
    realEvent: 'New Bloom / Year Beast',
    summary: 'A timed damage-race rite against a beast that fattens on repeated turns of the Loop.',
    mode: 'damage-race',
    regionId: 'mad-moon-crater',
    cutsceneId: 'seasonal-cycle-beast',
    codexTitle: 'New Bloom: The Cycle Beast',
    codexBody: 'Some cycles begin with a beast. This rite makes the Loop visible as appetite: hit hard, hit together, and prove the year can be beaten before it bites back.',
    reward: { kind: 'loot-mark', amount: 1, label: 'late loot mark' }
  },
  {
    id: 'dark-reef-crawl',
    name: 'Siltbreaker: The Dark Reef',
    realEvent: 'Siltbreaker',
    summary: 'A Shadeshore crawl through old sea-feuds, staged as the tide remembering its dead captains.',
    mode: 'linear-crawl',
    regionId: 'shadeshore',
    cutsceneId: 'seasonal-dark-reef-crawl',
    codexTitle: 'Siltbreaker: The Dark Reef',
    codexBody: 'The Dark Reef is not merely under the sea. It is under every old grudge the tide refuses to drown. The crawl turns Shadeshore into a campaign of salt, wreckage, and old oaths.',
    reward: { kind: 'gold', amount: 900, label: 'reef purse' }
  },
  {
    id: 'collapsing-hollow',
    name: 'Underhollow: The Collapsing Hollow',
    realEvent: 'The Underhollow',
    summary: 'A shrinking descent where the walls themselves hurry the party toward Cheese and trouble.',
    mode: 'hazard-survival',
    regionId: 'mad-moon-crater',
    cutsceneId: 'seasonal-collapsing-hollow',
    codexTitle: 'Underhollow: The Collapsing Hollow',
    codexBody: 'The Hollow is a hole the Loop is tired of holding open. Every passage narrows, every safe turn expires, and the prize is the kind of food only Roshan made famous.',
    reward: { kind: 'loot-mark', amount: 1, label: 'late loot mark' }
  },
  {
    id: 'nemestice-fall',
    name: 'Nemestice Fall',
    realEvent: 'Nemestice',
    summary: 'A crater survival rite under falling fragments of Zet\'s sealing power.',
    mode: 'hazard-survival',
    regionId: 'mad-moon-crater',
    cutsceneId: 'seasonal-nemestice-fall',
    codexTitle: 'Nemestice Fall',
    codexBody: 'Nemestice is the seal remembering it was once a weapon. At the crater, those falling lights are not weather. They are pieces of Zet\'s sacrifice still trying to close the war.',
    reward: { kind: 'loot-mark', amount: 1, label: 'Nemestice shard mark' }
  },
  {
    id: 'crowns-fall',
    name: "Crownfall: A Crown's Fall",
    realEvent: 'Crownfall',
    summary: 'An act-structured recruitment arc framed as a crown losing its claim over the Loop.',
    mode: 'act-trials',
    regionId: 'vile-reaches',
    cutsceneId: 'seasonal-crowns-fall',
    codexTitle: "Crownfall: A Crown's Fall",
    codexBody: 'Crowns are just loops with gold on them. This festival remembers the acts by which a ruler becomes a question, then an answer, then a ruin.',
    reward: { kind: 'gold', amount: 1000, label: 'crown purse' }
  },
  {
    id: 'dark-moon-hunt',
    name: 'Dark Moon Hunt',
    realEvent: 'Dark Moon',
    summary: 'A Nightsilver survival rite beneath Selemene\'s cold, watchful sky.',
    mode: 'wave-defense',
    regionId: 'nightsilver-woods',
    cutsceneId: 'seasonal-dark-moon-hunt',
    codexTitle: 'Dark Moon Hunt',
    codexBody: 'Nightsilver hears two moons at once: Selemene\'s dark one above and the Mad Moon broken through the ground. The hunt is what happens when both look back.',
    reward: { kind: 'gold', amount: 650, label: 'moonlit purse' }
  }
];

export const ALL_LEGENDS: LegendDef[] = [
  {
    id: 'pit-remembers',
    name: 'The Pit Remembers',
    realMoment: 'TI5: Echo Slam in the Roshan pit',
    triggerSummary: 'Earthshaker lands a huge Echo Slam inside Roshan territory.',
    cutsceneId: 'legend-pit-remembers',
    codexTitle: 'The Pit Remembers',
    codexBody: 'Some plays are so loud the Loop keeps a copy. When stone, pit, and Echo Slam agree, the old crowd can almost be heard under Roshan.'
  },
  {
    id: 'hooked-home',
    name: 'Hooked Home',
    realMoment: 'TI3: Fountain Hook',
    triggerSummary: 'Pudge and a recall effect turn a hook into a homecoming trap.',
    cutsceneId: 'legend-hooked-home',
    codexTitle: 'Hooked Home',
    codexBody: 'A hook is usually a straight line. One famous turn of the Loop made it a door. The binder who repeats the trick earns the wink.'
  },
  {
    id: 'call-paid-out',
    name: 'The Call That Paid Out',
    realMoment: 'TI8: the 11-million Berserker\'s Call',
    triggerSummary: 'Axe makes the losing-looking call and falls only after the fight has turned.',
    cutsceneId: 'legend-call-paid-out',
    codexTitle: 'The Call That Paid Out',
    codexBody: 'Some victories look like a hero dying in the middle of everyone. The Loop remembers the call because the answer arrived after the caster paid for it.'
  },
  {
    id: 'coil-closed-game',
    name: 'The Coil That Closed the Game',
    realMoment: 'TI3: the Million-Dollar Dream Coil',
    triggerSummary: 'Puck catches multiple enemies in a decisive Dream Coil.',
    cutsceneId: 'legend-coil-closed-game',
    codexTitle: 'The Coil That Closed the Game',
    codexBody: 'A circle can be a door closing. Puck\'s old trick is not that it hurts; it is that it tells escape to wait one heartbeat too long.'
  },
  {
    id: 'rampage',
    name: 'Rampage',
    realMoment: 'Dota rampage callout',
    triggerSummary: 'One player-controlled hero earns five kills in a short window.',
    cutsceneId: 'legend-rampage',
    codexTitle: 'Rampage',
    codexBody: 'The word survives unchanged because nothing says it cleaner: five fall, one stands, and the Loop makes room for the noise.'
  }
];
