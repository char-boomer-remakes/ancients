import { it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';

registerAllContent();

function fullPartyGame(regionId = 'tranquil-vale'): Game {
  const save = newGameSave('juggernaut');
  const heroes = ['juggernaut', 'axe', 'crystal-maiden', 'sniper', 'sven'];
  const template = save.roster[0];
  save.playtimeSec = 1;
  save.regionId = regionId;
  save.playerPos = { ...REG.region(regionId).town.pos };
  save.party = heroes;
  save.recruited = heroes;
  save.roster = heroes.map((heroId) => ({
    ...structuredClone(template),
    heroId,
    level: 30,
    xp: 0
  }));
  return Game.headless(save);
}

it('probes continuum objective', () => {
  const g = fullPartyGame('quoidge');
  console.log('launch', g.runSeasonalEvent('continuum-descent'));
  const d = g.liveDungeon!;
  console.log('start', {
    done: d.done,
    room: d.room.index,
    type: d.room.type,
    exits: d.room.exits,
    enemies: d.enemyUids.length,
    obj: d.festivalObjective(),
    time: d.sim.time
  });
  for (const seconds of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21]) {
    d.step(seconds - d.sim.time);
    console.log('t', seconds, {
      done: d.done,
      room: d.room.index,
      type: d.room.type,
      awaiting: d.exitsUnlocked(),
      exits: d.room.exits,
      enemies: d.enemyUids.filter((uid) => d.sim.unit(uid)?.alive).length,
      obj: d.festivalObjective(),
      result: d.result
    });
    if (d.done) break;
  }
});
