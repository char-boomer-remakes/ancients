import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../data';
import { ALL_ITEMS } from '../data/items';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState } from '../core/items';
import type { AbilityDef } from '../core/types';

beforeAll(() => registerAllContent());

function castArgs(ability: AbilityDef, enemyUid: number, allyUid: number, point: { x: number; y: number }) {
  if (ability.targeting === 'unit-target') return ability.affects === 'ally' ? { uid: allyUid } : { uid: enemyUid };
  if (ability.targeting === 'point-target' || ability.targeting === 'ground-aoe' || ability.targeting === 'skillshot') return { point };
  return {};
}

describe('Phase 3 kit smoke', () => {
  it('casts every hero ability at levels 1, 15, and 30 without throwing', () => {
    for (const hero of ALL_HEROES) {
      for (const level of [1, 15, 30]) {
        const sim = new Sim({ seed: 9000 + level, bounds: { w: 6000, h: 4000 } });
        const caster = sim.spawnHero(REG.hero(hero.id), { team: 0, pos: { x: 1000, y: 2000 }, level, ctrl: { kind: 'player' } });
        const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1350, y: 2000 }, level: 15, ctrl: { kind: 'none' } });
        const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1150, y: 2200 }, level: 15, ctrl: { kind: 'none' } });
        caster.mana = 99999;
        caster.abilities.forEach((a) => {
          a.level = Math.max(1, a.level);
          a.cooldownUntil = 0;
        });

        for (let slot = 0; slot < caster.abilities.length; slot++) {
          const ability = caster.abilities[slot].def;
          if (['passive', 'aura', 'attack-modifier'].includes(ability.targeting)) continue;
          expect(() => {
            sim.order(caster.uid, { kind: 'cast', slot, ...castArgs(ability, enemy.uid, ally.uid, enemy.pos) });
            sim.run(0.35);
            caster.mana = 99999;
            caster.abilities[slot].cooldownUntil = 0;
          }, `${hero.id}/${ability.id}/L${level}`).not.toThrow();
        }
      }
    }
  });

  it('uses every item active without throwing', () => {
    for (const item of ALL_ITEMS.filter((i) => i.active)) {
      const sim = new Sim({ seed: 12000 + item.id.length, bounds: { w: 6000, h: 4000 } });
      const holder = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 2000 }, level: 30, ctrl: { kind: 'player' } });
      const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1350, y: 2000 }, level: 15, ctrl: { kind: 'none' } });
      const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1150, y: 2200 }, level: 15, ctrl: { kind: 'none' } });
      holder.mana = 99999;
      holder.items[0] = makeItemState(item);
      const active = item.active!;
      expect(() => {
        sim.order(holder.uid, { kind: 'item', invSlot: 0, ...castArgs(active, enemy.uid, ally.uid, enemy.pos) });
        sim.run(0.4);
      }, `item:${item.id}`).not.toThrow();
    }
  });
});
