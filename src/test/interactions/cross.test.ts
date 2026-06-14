import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data/index';
import { REG } from '../../core/registry';
import { applyStatus } from '../../core/effects';
import { dist } from '../../core/math2d';
import { arena, ctx, dummyHero, eventsOf, exec } from './_arena';
import type { EffectNode } from '../../core/types';

// ============================================================
// §3.3 — cross-interactions (SPEC §7): the combinations that
// break. Plus the §3.2 cells coverage.ts routes here: purge and
// exotic. Linken's/Lotus/Refresher are intentionally omitted —
// those mechanics are not yet in core (§8 implementation boundary).
// ============================================================

beforeAll(() => registerAllContent());

function bkb(sim: ReturnType<typeof arena>, target: ReturnType<typeof dummyHero>): void {
  applyStatus(sim, target, target, 'magic-immune', 10, { tag: 'test-bkb' }, ctx());
  target.refresh(sim.time);
}

describe('cross: magic immunity (BKB)', () => {
  it('blocks magical damage and emits immune-block; physical still lands', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    bkb(sim, target);

    const beforeMagic = target.hp;
    exec(sim, caster, [{ kind: 'damage', dtype: 'magical', amount: 300, target: 'target' }], { target });
    expect(target.hp).toBe(beforeMagic); // magical bounced
    expect(eventsOf(sim, 'immune-block', target.uid).length).toBeGreaterThan(0);

    const beforePhys = target.hp;
    exec(sim, caster, [{ kind: 'damage', dtype: 'physical', amount: 300, target: 'target' }], { target });
    expect(target.hp).toBeLessThan(beforePhys); // physical still lands through BKB
  });

  it('blocks a magical status debuff but a piercesImmunity cast still lands', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const target = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    bkb(sim, target);

    exec(sim, caster, [{ kind: 'status', status: 'stun', duration: 2, target: 'target' }], { target });
    expect(target.summary.stunned).toBe(false); // rejected by immunity

    exec(sim, caster, [{ kind: 'status', status: 'stun', duration: 2, target: 'target' }], { target }, ctx({ piercesImmunity: true }));
    expect(target.summary.stunned).toBe(true); // pierces immunity
  });
});

describe('cross: silence breaks a channel', () => {
  it('a silence on the channeler ends the channel; the rolling disable lapses', () => {
    const sim = arena();
    const pudge = dummyHero(sim, 'pudge', { x: 2000, y: 4000 }, { team: 0, level: 18, player: true });
    const victim = dummyHero(sim, 'juggernaut', { x: 2150, y: 4000 }, { team: 1 });
    const slot = pudge.abilities.findIndex((a) => a.def.id === 'pudge-dismember');
    sim.order(pudge.uid, { kind: 'cast', slot, uid: victim.uid });
    sim.run(0.8);
    expect(pudge.channel).not.toBeNull();
    expect(victim.summary.stunned).toBe(true);

    applyStatus(sim, pudge, pudge, 'silence', 2, undefined, ctx());
    sim.run(0.4);
    expect(pudge.channel).toBeNull(); // channel broke
    sim.run(0.8);
    expect(victim.summary.stunned).toBe(false); // disable lapsed once the channel ended
  });
});

describe('cross: purge', () => {
  it('strips enemy buffs but leaves their debuffs', () => {
    const sim = arena();
    const purger = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const enemyAlly = dummyHero(sim, 'sven', { x: 4100, y: 4000 }, { team: 1 });
    // a friendly buff on the enemy (cast by its own teammate) + a debuff (our slow)
    applyStatus(sim, enemyAlly, enemy, 'buff', 8, { tag: 'enemy-buff', mods: { damagePct: 40 } }, ctx());
    applyStatus(sim, purger, enemy, 'slow', 8, { moveSlowPct: 40 }, ctx());
    expect(enemy.summary.mods.damagePct).toBeGreaterThan(0);

    exec(sim, purger, [{ kind: 'purge', target: 'target' } as EffectNode], { target: enemy });
    sim.run(0.05); // refresh the summary
    expect(enemy.summary.mods.damagePct ?? 0).toBe(0); // buff stripped
    expect(enemy.summary.moveSlowFactor).toBeLessThan(1); // their debuff untouched
  });

  it('strips debuffs from an ally', () => {
    const sim = arena();
    const purger = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const ally = dummyHero(sim, 'sven', { x: 2200, y: 4000 }, { team: 0 });
    const enemy = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    applyStatus(sim, enemy, ally, 'slow', 8, { moveSlowPct: 50 }, ctx());
    expect(ally.summary.moveSlowFactor).toBeLessThan(1);

    exec(sim, purger, [{ kind: 'purge', target: 'target' } as EffectNode], { target: ally });
    sim.run(0.05); // refresh the summary
    expect(ally.summary.moveSlowFactor).toBe(1); // ally's debuff cleansed
  });
});

describe('cross: status resist stacks correctly', () => {
  it('scales each stacked debuff duration, not just one', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 0 });
    const plain = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 1 });
    const resistant = dummyHero(sim, 'axe', { x: 4300, y: 4000 }, { team: 1 });
    resistant.permanentMods.statusResistPct = 50;
    resistant.markStatsDirty();
    resistant.refresh(sim.time);

    applyStatus(sim, caster, plain, 'root', 2, undefined, ctx());
    applyStatus(sim, caster, plain, 'silence', 2, undefined, ctx());
    applyStatus(sim, caster, resistant, 'root', 2, undefined, ctx());
    applyStatus(sim, caster, resistant, 'silence', 2, undefined, ctx());
    sim.run(1.2); // past the resisted 1.0s, before the plain 2.0s
    expect(resistant.summary.rooted).toBe(false);
    expect(resistant.summary.silenced).toBe(false); // BOTH debuffs were scaled, not one
    expect(plain.summary.rooted).toBe(true);
    expect(plain.summary.silenced).toBe(true);
  });
});

describe('cross: root vs displace', () => {
  it('root blocks ordinary movement but a blink still relocates the caster', () => {
    const sim = arena();
    const enemy = dummyHero(sim, 'lich', { x: 2000, y: 4000 }, { team: 1 });
    const hero = dummyHero(sim, 'axe', { x: 4000, y: 4000 }, { team: 0, player: true });
    applyStatus(sim, enemy, hero, 'root', 4, undefined, ctx());
    expect(hero.summary.rooted).toBe(true);

    // ordinary move is blocked by the root
    const startPos = { ...hero.pos };
    sim.order(hero.uid, { kind: 'move', point: { x: 5200, y: 4000 } });
    sim.run(1.0);
    expect(dist(hero.pos, startPos)).toBeLessThan(40);

    // blink ignores the root
    const dest = { x: 4800, y: 4000 };
    exec(sim, hero, [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 1200 }], { point: dest });
    expect(dist(hero.pos, dest)).toBeLessThan(50);
  });
});

describe('cross: exotic handler runs', () => {
  it('chronosphere freezes enemies inside its radius', () => {
    const sim = arena();
    const caster = dummyHero(sim, 'lich', { x: 4000, y: 4000 }, { team: 0 });
    const inside = dummyHero(sim, 'axe', { x: 4200, y: 4000 }, { team: 1 });
    const outside = dummyHero(sim, 'sniper', { x: 6000, y: 4000 }, { team: 1 });
    expect(REG.exotics.has('chronosphere')).toBe(true);
    exec(sim, caster, [{ kind: 'exotic', id: 'chronosphere' } as EffectNode], { point: caster.pos });
    sim.run(0.6);
    expect(inside.summary.frozen).toBe(true);
    expect(outside.summary.frozen).toBe(false); // outside the sphere
  });
});
