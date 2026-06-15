import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_HEROES, registerAllContent } from '../data';
import { ALL_CREEPS } from '../data/creeps';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { fireCast } from '../core/actions';
import { applyDamage, attackImpact } from '../core/combat';
import { abilityMaxLevel, levelArr } from '../core/values';
import { buildHero } from '../core/hero-setup';
import { deriveMasteryTrees } from '../core/mastery';
import { buildAbilityCard } from '../core/describe';
import type { DerivedStats } from '../core/stats';
import type { Unit } from '../core/unit';
import type { AbilityDef, EffectNode, HeroDef, StatModMap, TagBoonDef, TriggerSpec, ValueRef } from '../core/types';

beforeAll(() => registerAllContent());

type SkillOwner =
  | { kind: 'hero'; id: string; slot: number }
  | { kind: 'creep'; id: string; slot: number }
  | { kind: 'summon'; id: string };

interface SkillEntry {
  owner: SkillOwner;
  ownerLabel: string;
  ability: AbilityDef;
}

const STAT_ROUTES: Record<string, (keyof DerivedStats)[]> = {
  str: ['str', 'maxHp', 'hpRegen'],
  agi: ['agi', 'armor', 'attackInterval'],
  int: ['int', 'maxMana', 'manaRegen'],
  damage: ['damage'],
  damagePct: ['damage'],
  armor: ['armor'],
  attackSpeed: ['attackInterval'],
  moveSpeed: ['moveSpeed'],
  moveSpeedPct: ['moveSpeed'],
  hpRegen: ['hpRegen'],
  manaRegen: ['manaRegen'],
  manaRegenPctMax: ['manaRegenPctMax'],
  maxHp: ['maxHp'],
  maxMana: ['maxMana'],
  magicResistPct: ['magicResistPct'],
  spellAmpPct: ['spellAmpPct'],
  statusResistPct: ['statusResistPct'],
  evasionPct: ['evasionPct'],
  lifestealPct: ['lifestealPct'],
  attackRange: ['attackRange'],
  hpRegenPctMax: ['hpRegenPctMax'],
  damageTakenReductionPct: ['damageTakenReductionPct'],
  attackDamageTakenReductionPct: ['attackDamageTakenReductionPct'],
  castRange: ['castRangeBonus'],
  visionPct: [],
  swapCdReductionPct: ['swapCdReductionPct'],
  swapInDamagePct: ['swapInDamagePct'],
  swapInHealPct: ['swapInHealPct'],
  tagBoonAmpPct: ['tagBoonAmpPct'],
  tagGaugeReductionPct: ['tagGaugeReductionPct'],
  tagChainWindowBonusSec: ['tagChainWindowBonusSec'],
  reactionAmpPct: ['reactionAmpPct'],
  elementalGaugeSec: ['elementalGaugeSec'],
  staminaBonus: ['staminaBonus'],
  partyXpAmpPct: ['partyXpAmpPct']
};

function collectNestedAbilitiesFromEffects(effects: EffectNode[] | undefined, out: SkillEntry[], ownerLabel: string): void {
  for (const node of effects ?? []) {
    if (node.kind === 'summon') {
      node.summon.abilities?.forEach((ability, i) => {
        out.push({ owner: { kind: 'summon', id: `${node.summon.id}:${i}` }, ownerLabel: `${ownerLabel}>summon:${node.summon.id}`, ability });
        collectNestedAbilities(ability, out, `${ownerLabel}>summon:${node.summon.id}`);
      });
    } else if (node.kind === 'projectile') {
      collectNestedAbilitiesFromEffects(node.proj.onHit, out, ownerLabel);
    } else if (node.kind === 'repeat') {
      collectNestedAbilitiesFromEffects(node.effects, out, ownerLabel);
    } else if (node.kind === 'zone') {
      collectNestedAbilitiesFromEffects(node.zone.tick?.effects, out, ownerLabel);
      collectNestedAbilitiesFromEffects(node.zone.onEnter?.effects, out, ownerLabel);
    } else if (node.kind === 'status') {
      collectNestedAbilitiesFromEffects(node.params?.periodic?.effects, out, ownerLabel);
    }
  }
}

function collectNestedAbilities(ability: AbilityDef, out: SkillEntry[], ownerLabel: string): void {
  collectNestedAbilitiesFromEffects(ability.effects, out, ownerLabel);
  collectNestedAbilitiesFromEffects(ability.channel?.tick?.effects, out, ownerLabel);
  collectNestedAbilitiesFromEffects(ability.channel?.onEnd, out, ownerLabel);
  collectNestedAbilitiesFromEffects(ability.toggle?.effects, out, ownerLabel);
  for (const trigger of ability.triggers ?? []) collectNestedAbilitiesFromEffects(trigger.effects, out, ownerLabel);
}

function allSkillEntries(): SkillEntry[] {
  const out: SkillEntry[] = [];
  for (const hero of ALL_HEROES) {
    hero.abilities.forEach((ability, slot) => {
      const entry = { owner: { kind: 'hero' as const, id: hero.id, slot }, ownerLabel: `hero:${hero.id}`, ability };
      out.push(entry);
      collectNestedAbilities(ability, out, entry.ownerLabel);
    });
  }
  for (const creep of ALL_CREEPS) {
    creep.abilities.forEach((ability, slot) => {
      const entry = { owner: { kind: 'creep' as const, id: creep.id, slot }, ownerLabel: `creep:${creep.id}`, ability };
      out.push(entry);
      collectNestedAbilities(ability, out, entry.ownerLabel);
    });
  }
  return out;
}

function hasRuntimeSurface(ability: AbilityDef): boolean {
  return Boolean(
    (ability.effects && ability.effects.length > 0) ||
    ability.channel ||
    ability.toggle ||
    ability.passiveMods ||
    ability.attackMod ||
    ability.aura ||
    ability.triggers?.length
  );
}

function assertValueRef(ref: ValueRef | undefined, ability: AbilityDef, where: string): void {
  if (ref === undefined || typeof ref === 'number') return;
  expect(ability.values?.[ref], `${where}: missing values.${ref}`).toBeDefined();
}

function walkAttackModValues(ability: AbilityDef, attackMod: AbilityDef['attackMod'], where: string): void {
  if (!attackMod) return;
  assertValueRef(attackMod.critChance, ability, `${where}.critChance`);
  assertValueRef(attackMod.critMult, ability, `${where}.critMult`);
  assertValueRef(attackMod.procChance, ability, `${where}.procChance`);
  assertValueRef(attackMod.procDamage, ability, `${where}.procDamage`);
  assertValueRef(attackMod.procStatus?.duration, ability, `${where}.procStatus.duration`);
  assertValueRef(attackMod.manaBurnPerHit, ability, `${where}.manaBurnPerHit`);
  assertValueRef(attackMod.bonusDamage, ability, `${where}.bonusDamage`);
  assertValueRef(attackMod.bonusDamagePct, ability, `${where}.bonusDamagePct`);
  assertValueRef(attackMod.lifestealPct, ability, `${where}.lifestealPct`);
  assertValueRef(attackMod.cleave?.pct, ability, `${where}.cleave.pct`);
  assertValueRef(attackMod.cleave?.radius, ability, `${where}.cleave.radius`);
}

function walkEffects(ability: AbilityDef, effects: EffectNode[] | undefined, where: string, exoticIds: string[] = []): void {
  for (const node of effects ?? []) {
    switch (node.kind) {
      case 'damage':
        assertValueRef(node.amount, ability, `${where}.damage.amount`);
        assertValueRef(node.radius, ability, `${where}.damage.radius`);
        break;
      case 'heal':
        assertValueRef(node.amount, ability, `${where}.heal.amount`);
        assertValueRef(node.radius, ability, `${where}.heal.radius`);
        break;
      case 'mana':
        assertValueRef(node.amount, ability, `${where}.mana.amount`);
        assertValueRef(node.radius, ability, `${where}.mana.radius`);
        break;
      case 'status':
        assertValueRef(node.duration, ability, `${where}.status.duration`);
        assertValueRef(node.radius, ability, `${where}.status.radius`);
        assertValueRef(node.params?.dotDps, ability, `${where}.status.dotDps`);
        assertValueRef(node.params?.moveSlowPct, ability, `${where}.status.moveSlowPct`);
        assertValueRef(node.params?.attackSlowPct, ability, `${where}.status.attackSlowPct`);
        for (const [key, ref] of Object.entries(node.params?.mods ?? {})) assertValueRef(ref, ability, `${where}.status.mods.${key}`);
        walkAttackModValues(ability, node.params?.attackMod, `${where}.status.attackMod`);
        walkEffects(ability, node.params?.periodic?.effects, `${where}.status.periodic`, exoticIds);
        break;
      case 'displace':
        assertValueRef(node.distance, ability, `${where}.displace.distance`);
        assertValueRef(node.speed, ability, `${where}.displace.speed`);
        assertValueRef(node.radius, ability, `${where}.displace.radius`);
        break;
      case 'zone':
        assertValueRef(node.zone.radius, ability, `${where}.zone.radius`);
        assertValueRef(node.zone.length, ability, `${where}.zone.length`);
        assertValueRef(node.zone.width, ability, `${where}.zone.width`);
        assertValueRef(node.zone.duration, ability, `${where}.zone.duration`);
        for (const [key, ref] of Object.entries(node.zone.auraMods?.mods ?? {})) assertValueRef(ref, ability, `${where}.zone.auraMods.${key}`);
        walkEffects(ability, node.zone.tick?.effects, `${where}.zone.tick`, exoticIds);
        walkEffects(ability, node.zone.onEnter?.effects, `${where}.zone.onEnter`, exoticIds);
        break;
      case 'summon':
        assertValueRef(node.count, ability, `${where}.summon.count`);
        assertValueRef(node.summon.lifetime, ability, `${where}.summon.lifetime`);
        for (const summoned of node.summon.abilities ?? []) walkAbilityValues(summoned, `${where}.summon.${node.summon.id}`);
        break;
      case 'statmod':
        assertValueRef(node.duration, ability, `${where}.statmod.duration`);
        assertValueRef(node.radius, ability, `${where}.statmod.radius`);
        for (const [key, ref] of Object.entries(node.mods)) assertValueRef(ref, ability, `${where}.statmod.${key}`);
        break;
      case 'projectile':
        assertValueRef(node.proj.speed, ability, `${where}.projectile.speed`);
        assertValueRef(node.proj.width, ability, `${where}.projectile.width`);
        assertValueRef(node.proj.range, ability, `${where}.projectile.range`);
        assertValueRef(node.proj.bounces?.count, ability, `${where}.projectile.bounces.count`);
        assertValueRef(node.proj.bounces?.radius, ability, `${where}.projectile.bounces.radius`);
        walkEffects(ability, node.proj.onHit, `${where}.projectile.onHit`, exoticIds);
        break;
      case 'repeat':
        assertValueRef(node.count, ability, `${where}.repeat.count`);
        assertValueRef(node.radius, ability, `${where}.repeat.radius`);
        walkEffects(ability, node.effects, `${where}.repeat.effects`, exoticIds);
        break;
      case 'exotic':
        exoticIds.push(node.id);
        break;
      case 'capture-channel':
      case 'purge':
        break;
    }
  }
}

function walkAbilityValues(ability: AbilityDef, where: string): string[] {
  const exoticIds: string[] = [];
  assertValueRef(ability.castRange, ability, `${where}.castRange`);
  for (const [key, arr] of Object.entries(ability.values ?? {})) {
    expect(arr.length, `${where}.values.${key} must not be empty`).toBeGreaterThan(0);
  }
  for (const ref of ability.manaCost ?? []) assertValueRef(ref, ability, `${where}.manaCost`);
  for (const ref of ability.cooldown ?? []) assertValueRef(ref, ability, `${where}.cooldown`);
  for (const [key, ref] of Object.entries(ability.passiveMods ?? {})) assertValueRef(ref, ability, `${where}.passiveMods.${key}`);
  for (const [key, ref] of Object.entries(ability.aura?.mods ?? {})) assertValueRef(ref, ability, `${where}.aura.mods.${key}`);
  walkAttackModValues(ability, ability.attackMod, `${where}.attackMod`);
  walkEffects(ability, ability.effects, `${where}.effects`, exoticIds);
  assertValueRef(ability.channel?.duration, ability, `${where}.channel.duration`);
  walkEffects(ability, ability.channel?.tick?.effects, `${where}.channel.tick`, exoticIds);
  walkEffects(ability, ability.channel?.onEnd, `${where}.channel.onEnd`, exoticIds);
  assertValueRef(ability.toggle?.manaPerSec, ability, `${where}.toggle.manaPerSec`);
  assertValueRef(ability.toggle?.selfDamagePerSec, ability, `${where}.toggle.selfDamagePerSec`);
  walkEffects(ability, ability.toggle?.effects, `${where}.toggle.effects`, exoticIds);
  for (const trigger of ability.triggers ?? []) {
    assertValueRef(trigger.radius, ability, `${where}.trigger.${trigger.on}.radius`);
    for (const [key, ref] of Object.entries(trigger.statStack?.mods ?? {})) assertValueRef(ref, ability, `${where}.trigger.${trigger.on}.statStack.${key}`);
    walkEffects(ability, trigger.effects, `${where}.trigger.${trigger.on}.effects`, exoticIds);
  }
  return exoticIds;
}

function lab(entry: SkillEntry): { sim: Sim; caster: Unit; enemy: Unit; ally: Unit; slot: number } | null {
  if (entry.owner.kind === 'summon') return null;
  const sim = new Sim({ seed: 40000 + entry.ability.id.length, bounds: { w: 7000, h: 5000 } });
  sim.events.captureAll = true;
  const caster = entry.owner.kind === 'hero'
    ? sim.spawnHero(REG.hero(entry.owner.id), { team: 0, pos: { x: 2000, y: 2200 }, level: 30, ctrl: { kind: 'player' } })
    : sim.spawnCreep(REG.creep(entry.owner.id), { team: 0, pos: { x: 2000, y: 2200 } });
  caster.ctrl = { kind: 'player' };
  caster.mana = 99999;
  const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 2120, y: 2200 }, level: 20, ctrl: { kind: 'none' } });
  const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 2120, y: 2320 }, level: 20, ctrl: { kind: 'none' } });
  const slot = entry.owner.slot;
  caster.abilities[slot].level = abilityMaxLevel(caster.abilities[slot].def);
  caster.abilities[slot].cooldownUntil = 0;
  caster.abilities[slot].charges = Math.max(caster.abilities[slot].charges, -1);
  caster.markStatsDirty();
  caster.refresh(sim.time);
  caster.hp = caster.stats.maxHp;
  caster.mana = 99999;
  return { sim, caster, enemy, ally, slot };
}

function castArgs(ability: AbilityDef, enemyUid: number, allyUid: number, point: { x: number; y: number }) {
  if (ability.targeting === 'unit-target') return ability.affects === 'ally' ? { uid: allyUid } : { uid: enemyUid };
  if (ability.targeting === 'point-target' || ability.targeting === 'ground-aoe' || ability.targeting === 'skillshot') return { point };
  return {};
}

function expectModsRoute(label: string, mods: Record<string, ValueRef>, before: Record<keyof DerivedStats, number>, after: Record<keyof DerivedStats, number>): void {
  for (const [key, ref] of Object.entries(mods)) {
    if (typeof ref !== 'number' || ref === 0) continue;
    const routes = STAT_ROUTES[key];
    expect(routes, `${label}.${key} is not mapped to a derived stat route`).toBeDefined();
    if (routes.length === 0) continue;
    expect(routes.some((stat) => after[stat] !== before[stat]), `${label}.${key} did not affect ${routes.join('/')}`).toBe(true);
  }
}

function fireTrigger(sim: Sim, caster: Unit, enemy: Unit, trigger: TriggerSpec): void {
  caster.hp = Math.max(1, caster.stats.maxHp * 0.5);
  if (trigger.on === 'on-nearby-enemy-cast') sim.notifyEnemyCast(enemy);
  else if (trigger.on === 'on-nearby-death') sim.killUnit(enemy, null);
  else if (trigger.on === 'on-kill') sim.killUnit(enemy, caster);
  else if (trigger.on === 'on-damage-taken') applyDamage(sim, enemy, caster, 50, 'physical');
  else if (trigger.on === 'on-attack-land') attackImpact(sim, caster, enemy);
  else sim.runTriggers(caster, trigger.on, { other: enemy });
}

function patchTargets(hero: HeroDef): { label: string; abilityId: string; valueKey?: string }[] {
  const targets: { label: string; abilityId: string; valueKey?: string }[] = [];
  for (const [tierIdx, tier] of hero.talents.entries()) {
    for (const talent of tier.options) {
      if (talent.abilityOverride) targets.push({ label: `${hero.id}.talent${tierIdx}.${talent.id}`, ...talent.abilityOverride });
      if (talent.cooldownAdd) targets.push({ label: `${hero.id}.talent${tierIdx}.${talent.id}.cooldown`, abilityId: talent.cooldownAdd.abilityId });
    }
  }
  for (const facet of hero.facets) {
    if (facet.abilityValueOverride) targets.push({ label: `${hero.id}.facet.${facet.id}`, ...facet.abilityValueOverride });
  }
  for (const branch of deriveMasteryTrees(hero)) {
    targets.push({ label: `${hero.id}.mastery.${branch.abilityId}`, abilityId: branch.abilityId });
    for (const node of branch.nodes) {
      if (node.abilityOverride) targets.push({ label: `${hero.id}.mastery.${node.id}`, ...node.abilityOverride });
      if (node.cooldownAdd) targets.push({ label: `${hero.id}.mastery.${node.id}.cooldown`, abilityId: node.cooldownAdd.abilityId });
      if (node.abilityPatch) targets.push({ label: `${hero.id}.mastery.${node.id}.patch`, abilityId: node.abilityPatch.abilityId });
    }
  }
  for (const [kind, payload] of Object.entries(hero.aghanim ?? {}) as [string, NonNullable<HeroDef['aghanim']>[keyof NonNullable<HeroDef['aghanim']>]][]) {
    if (!payload || typeof payload === 'string' || typeof payload === 'boolean') continue;
    for (const ov of payload.abilityValueOverrides ?? []) targets.push({ label: `${hero.id}.aghanim.${kind}`, ...ov });
    for (const cd of payload.cooldownAdds ?? []) targets.push({ label: `${hero.id}.aghanim.${kind}.cooldown`, abilityId: cd.abilityId });
    for (const patch of payload.abilityPatches ?? []) targets.push({ label: `${hero.id}.aghanim.${kind}.patch`, abilityId: patch.abilityId });
  }
  return targets;
}

function tagBoonEffects(boon: TagBoonDef): EffectNode[] {
  return [...boon.effects, ...(boon.outEffects ?? [])];
}

describe('skill catalog audit — every authored ability one at a time', () => {
  const entries = allSkillEntries();

  it('has unique owner/id slots for audit reporting', () => {
    const keys = entries.map((entry) => `${entry.ownerLabel}:${entry.ability.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const entry of entries) {
    const label = `${entry.ownerLabel}:${entry.ability.id}`;

    describe(label, () => {
      it('has a concrete runtime surface', () => {
        expect(hasRuntimeSurface(entry.ability), `${label} has no effect/passive/aura/trigger/channel/toggle surface`).toBe(true);
      });

      it('resolves every authored ValueRef and exotic id', () => {
        const exoticIds = walkAbilityValues(entry.ability, label);
        for (const id of exoticIds) expect(REG.exotics.has(id), `${label} exotic ${id} is not registered`).toBe(true);
      });

      it('builds tooltip cards at rank 1 and max rank', () => {
        for (const level of [1, abilityMaxLevel(entry.ability)]) {
          const card = buildAbilityCard(entry.ability, level);
          expect(card.name, `${label} missing tooltip name`).toBeTruthy();
          expect(card.effect.length, `${label} missing tooltip effects at ${level}`).toBeGreaterThan(0);
        }
      });

      if (!['passive', 'aura', 'attack-modifier'].includes(entry.ability.targeting) && entry.owner.kind !== 'summon') {
        it('enters the live cast runtime and emits a cast event', () => {
          const setup = lab(entry)!;
          if (entry.owner.kind === 'creep') {
            const target = entry.ability.affects === 'ally' ? setup.ally : setup.enemy;
            fireCast(setup.sim, setup.caster, 'ability', setup.slot, entry.ability.targeting === 'unit-target' ? target : undefined, setup.enemy.pos);
          } else {
            setup.sim.order(setup.caster.uid, { kind: 'cast', slot: setup.slot, ...castArgs(entry.ability, setup.enemy.uid, setup.ally.uid, setup.enemy.pos) });
          }
          setup.sim.run(2.5);
          expect(setup.sim.events.history.some((event) => event.t === 'cast' && event.uid === setup.caster.uid && event.abilityId === entry.ability.id), `${label} did not emit cast`).toBe(true);
        });
      }

      if (entry.ability.passiveMods && entry.owner.kind !== 'summon') {
        it('routes passiveMods through live derived stats', () => {
          const setup = lab(entry)!;
          setup.caster.abilities[setup.slot].level = 0;
          setup.caster.markStatsDirty();
          setup.caster.refresh(setup.sim.time);
          const before = { ...setup.caster.stats } as Record<keyof DerivedStats, number>;
          setup.caster.abilities[setup.slot].level = abilityMaxLevel(setup.caster.abilities[setup.slot].def);
          setup.caster.markStatsDirty();
          setup.caster.refresh(setup.sim.time);
          expectModsRoute(label, entry.ability.passiveMods ?? {}, before, setup.caster.stats as unknown as Record<keyof DerivedStats, number>);
        });
      }

      if (entry.ability.aura && entry.owner.kind !== 'summon') {
        it('routes ability auras through live aura ticks', () => {
          const setup = lab(entry)!;
          setup.sim.run(0.7);
          const target = entry.ability.aura!.affects === 'allies' ? setup.ally : setup.enemy;
          expect(target.statuses.some((status) => status.tag === `aura:${setup.caster.uid}:${entry.ability.id}`), `${label} aura did not tick`).toBe(true);
        });
      }

      if (entry.ability.attackMod && entry.owner.kind !== 'summon') {
        it('routes attackMod through collectAttackMods and attack impact', () => {
          const setup = lab(entry)!;
          expect(setup.caster.collectAttackMods().some((mod) => mod.spec === setup.caster.abilities[setup.slot].def.attackMod), `${label} attackMod not collected`).toBe(true);
          expect(() => attackImpact(setup.sim, setup.caster, setup.enemy), `${label} attack impact`).not.toThrow();
        });
      }

      if (entry.ability.triggers?.length && entry.owner.kind !== 'summon') {
        it('routes triggers through live trigger dispatch', () => {
          const setup = lab(entry)!;
          const before = {
            enemyHp: setup.enemy.hp,
            casterHp: setup.caster.hp,
            casterStatuses: setup.caster.statuses.length,
            enemyStatuses: setup.enemy.statuses.length,
            stacks: setup.caster.triggerStacks.size
          };
          for (const trigger of entry.ability.triggers ?? []) fireTrigger(setup.sim, setup.caster, setup.enemy, trigger);
          setup.caster.refresh(setup.sim.time);
          const changed =
            setup.enemy.hp !== before.enemyHp ||
            setup.caster.hp !== before.casterHp ||
            setup.caster.statuses.length !== before.casterStatuses ||
            setup.enemy.statuses.length !== before.enemyStatuses ||
            setup.caster.triggerStacks.size !== before.stacks;
          expect(changed, `${label} trigger produced no observable live effect`).toBe(true);
        });
      }
    });
  }
});

describe('skill patch audit — talents, facets, mastery, and Aghanim payloads', () => {
  for (const hero of ALL_HEROES) {
    describe(hero.id, () => {
      it('targets existing abilities and value keys', () => {
        const byId = new Map(hero.abilities.map((ability) => [ability.id, ability]));
        for (const target of patchTargets(hero)) {
          const ability = byId.get(target.abilityId);
          expect(ability, `${target.label} targets missing ability ${target.abilityId}`).toBeDefined();
          if (target.valueKey) expect(ability!.values?.[target.valueKey], `${target.label} targets missing values.${target.valueKey}`).toBeDefined();
        }
      });

      it('buildHero applies scepter and shard payloads without leaving invalid ability refs', () => {
        for (const augments of [{ scepter: true }, { shard: true }, { scepter: true, shard: true }]) {
          const built = buildHero(hero, [0, 0, 0, 0], 0, undefined, augments);
          expect(built.def.abilities).toHaveLength(hero.abilities.length);
          for (const ability of built.def.abilities) {
            const exoticIds = walkAbilityValues(ability, `${hero.id}.built.${ability.id}`);
            for (const id of exoticIds) expect(REG.exotics.has(id), `${hero.id}.built.${ability.id} exotic ${id} is not registered`).toBe(true);
          }
        }
      });
    });
  }
});

describe('hero tag boon audit — swap skills that ride hero gauges', () => {
  for (const hero of ALL_HEROES.filter((h) => h.tagBoon)) {
    describe(hero.id, () => {
      it('has executable tag boon payloads and registered exotics', () => {
        const boon = hero.tagBoon!;
        expect(tagBoonEffects(boon).length, `${hero.id} tag boon has no payload`).toBeGreaterThan(0);
        const carrier: AbilityDef = {
          id: `${hero.id}-tag-boon-audit`,
          name: `${hero.name} Tag Boon Audit`,
          targeting: 'no-target',
          values: { swapInDamagePct: [10], swapInHealPct: [10], tagDuration: [3] },
          effects: tagBoonEffects(boon),
          vfx: { archetype: 'global-mark', color: '#ffffff' }
        };
        const exoticIds = walkAbilityValues(carrier, `${hero.id}.tagBoon`);
        for (const id of exoticIds) expect(REG.exotics.has(id), `${hero.id}.tagBoon exotic ${id} is not registered`).toBe(true);
      });
    });
  }
});
