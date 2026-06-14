import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../../data/index';
import { REG } from '../../core/registry';
import { abilityMaxLevel } from '../../core/values';
import { dist } from '../../core/math2d';
import { arena, dummyHero } from './_arena';
import type { AbilityDef, EffectNode, SimEvent } from '../../core/types';

// ============================================================
// §5 V4 — per-signature sweep. Every hero's ULTIMATE (the highest-
// stakes, most bespoke effect) is behaviorally pinned: a castable
// ult casts and emits the signal its declared effect kinds imply;
// a passive ult declares the modifier it rides. Fills the long tail
// the §3.2 kind-harness samples, ult-first (ults carry exotics and
// multi-effect logic).
// ============================================================

beforeAll(() => registerAllContent());

type Signal = SimEvent['t'];

// Map each declared effect kind to the event(s) that prove it ran.
function signalsForEffects(effects: EffectNode[] | undefined, acc: Set<Signal>): void {
  if (!effects) return;
  for (const n of effects) {
    switch (n.kind) {
      case 'damage': acc.add('damage'); break;
      case 'heal': acc.add('heal'); break;
      case 'status': acc.add('status-apply'); if (n.params?.periodic) signalsForEffects(n.params.periodic.effects, acc); break;
      case 'statmod': acc.add('status-apply'); break; // statmod applies a 'buff' status
      case 'displace': if (n.mode === 'blink') acc.add('blink'); break;
      case 'zone': acc.add('zone-spawn'); break;
      case 'summon': acc.add('summon'); break;
      case 'projectile': acc.add('projectile-spawn'); break;
      case 'repeat': signalsForEffects(n.effects, acc); break;
      case 'purge': acc.add('status-expire'); break;
      default: break; // mana / exotic / capture-channel have no single clean signal
    }
  }
}

function expectedSignals(ult: AbilityDef): Set<Signal> {
  const acc = new Set<Signal>();
  signalsForEffects(ult.effects, acc);
  signalsForEffects(ult.channel?.tick?.effects, acc);
  signalsForEffects(ult.channel?.onEnd, acc);
  signalsForEffects(ult.toggle?.effects, acc);
  for (const t of ult.triggers ?? []) signalsForEffects(t.effects, acc);
  return acc;
}

function castArgs(ult: AbilityDef, enemyUid: number, allyUid: number, point: { x: number; y: number }) {
  if (ult.targeting === 'unit-target') return { uid: ult.affects === 'ally' ? allyUid : enemyUid };
  if (ult.targeting === 'point-target' || ult.targeting === 'ground-aoe' || ult.targeting === 'skillshot') return { point };
  return {};
}

const PASSIVE_TARGETING = ['passive', 'aura', 'attack-modifier'];

describe('ultimates: every hero ult is behaviorally pinned', () => {
  for (const hero of ALL_HEROES) {
    const ultSlot = hero.abilities.findIndex((a) => a.ult);
    if (ultSlot < 0) continue;
    const ult = hero.abilities[ultSlot];

    it(`${hero.id} / ${ult.id}`, () => {
      const sim = arena(1000 + hero.id.length);
      const caster = dummyHero(sim, hero.id, { x: 4000, y: 4000 }, { team: 0, level: 30, player: true });
      // max the ult and clear its cooldown
      caster.abilities.forEach((a) => { a.level = Math.max(1, a.level); a.cooldownUntil = 0; });
      caster.abilities[ultSlot].level = abilityMaxLevel(ult);

      if (PASSIVE_TARGETING.includes(ult.targeting)) {
        // a passive ult's identity is the modifier it rides (data-lint covers the values)
        const carries = !!(ult.passiveMods || ult.attackMod || ult.aura || ult.triggers?.length);
        expect(carries, `${hero.id} passive ult ${ult.id} carries no modifier`).toBe(true);
        return;
      }

      const enemy = dummyHero(sim, 'axe', { x: 4280, y: 4000 }, { team: 1 });
      const enemy2 = dummyHero(sim, 'sniper', { x: 4280, y: 4180 }, { team: 1 });
      const ally = dummyHero(sim, 'crystal-maiden', { x: 4200, y: 3850 }, { team: 0 });
      ally.hp = ally.stats.maxHp * 0.4; // so a heal ult shows a heal event
      void enemy2;

      sim.order(caster.uid, { kind: 'cast', slot: ultSlot, ...castArgs(ult, enemy.uid, ally.uid, enemy.pos) });
      const enemyStart = { ...enemy.pos };
      sim.run(4); // cover cast points and channels

      // identity 1: the ult actually cast
      expect(caster.lastAbilityCastId, `${hero.id}: ult never cast`).toBe(ult.id);

      // identity 2: if the ult declares signal-producing kinds, at least one fired
      const expected = expectedSignals(ult);
      if (expected.size > 0) {
        const fired = sim.events.history.some((e) => expected.has(e.t));
        const movedEnemy = dist(enemy.pos, enemyStart) > 30; // covers non-blink displace
        expect(fired || movedEnemy, `${hero.id}: ult ${ult.id} produced none of ${[...expected].join('/')}`).toBe(true);
      }
    });
  }
});
