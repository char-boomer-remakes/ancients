import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { ALL_ITEMS } from '../data/items';
import { ALL_NEUTRAL_ITEMS } from '../data/neutral-items';
import { gemMods, isGemId } from '../data/gems';
import { ITEM_SET_DEFS, setBonusEffects } from '../data/sets';
import { AFFIX_DEFS, resolveAffix } from '../data/affixes';
import { refreshResolvedMods } from '../data/forge';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState, itemReady } from '../core/items';
import { applyDamage, attackImpact } from '../core/combat';
import { elementForItemHit } from '../core/resonance';
import { Game, newGameSave } from '../systems/game';
import type { AbilityDef, ItemDef, StatModMap, TriggerSpec } from '../core/types';
import type { DerivedStats } from '../core/stats';
import type { Unit } from '../core/unit';

beforeAll(() => registerAllContent());

const usedAsComponent = new Set(ALL_ITEMS.flatMap((item) => item.components ?? []));

// Items whose behavior is intentionally consumed by a game system outside normal
// Unit item surfaces. If this list grows, it should point at a concrete runtime
// system rather than becoming a junk drawer for inert data.
const CODED_SYSTEM_ITEMS: Record<string, string> = {
  'aegis-of-the-immortal': 'Game.raidProgress.aegisHeld / Roshan revive token'
};

const LEGACY_ELEMENT_ITEMS = new Set(['maelstrom', 'mjollnir', 'radiance', 'eye-of-skadi']);

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

function lab(seed: number, item?: ItemDef): { sim: Sim; holder: Unit; enemy: Unit; ally: Unit } {
  const sim = new Sim({ seed, bounds: { w: 6000, h: 4000 } });
  sim.events.captureAll = true;
  const holder = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 2000 }, level: 30, ctrl: { kind: 'player' } });
  const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1120, y: 2000 }, level: 15, ctrl: { kind: 'none' } });
  const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1120, y: 2120 }, level: 15, ctrl: { kind: 'none' } });
  holder.mana = 99999;
  if (item) {
    holder.items[0] = makeItemState(item);
    if (holder.items[0]!.charges === 0 && item.maxCharges) holder.items[0]!.charges = item.maxCharges;
    holder.markStatsDirty();
    holder.refresh(sim.time);
    holder.hp = holder.stats.maxHp;
    holder.mana = holder.stats.maxMana;
  }
  return { sim, holder, enemy, ally };
}

function castArgs(ability: AbilityDef, enemyUid: number, allyUid: number, point: { x: number; y: number }) {
  if (ability.targeting === 'unit-target') return ability.affects === 'ally' ? { uid: allyUid } : { uid: enemyUid };
  if (ability.targeting === 'point-target' || ability.targeting === 'ground-aoe' || ability.targeting === 'skillshot') return { point };
  return {};
}

function hasAuthoredSurface(item: ItemDef): boolean {
  return Boolean(
    (item.passiveMods && Object.keys(item.passiveMods).length > 0) ||
    item.active ||
    item.aura ||
    item.attackMod ||
    item.tagBoon ||
    item.triggers?.length ||
    item.elementOnHit ||
    isGemId(item.id) ||
    LEGACY_ELEMENT_ITEMS.has(item.id)
  );
}

function expectModsRoute(label: string, mods: StatModMap | Record<string, number>, before: Record<keyof DerivedStats, number>, after: Record<keyof DerivedStats, number>): void {
  for (const [key, value] of Object.entries(mods)) {
    if (value === 0) continue;
    const routes = STAT_ROUTES[key];
    expect(routes, `${label}.${key} is not mapped to a derived stat route`).toBeDefined();
    if (routes.length === 0) continue;
    expect(routes.some((stat) => after[stat] !== before[stat]), `${label}.${key} did not affect ${routes.join('/')}`).toBe(true);
  }
}

function fireTrigger(sim: Sim, holder: Unit, enemy: Unit, trigger: TriggerSpec): void {
  if (trigger.on === 'on-nearby-enemy-cast') sim.notifyEnemyCast(enemy);
  else if (trigger.on === 'on-nearby-death') sim.killUnit(enemy, null);
  else if (trigger.on === 'on-kill') sim.killUnit(enemy, holder);
  else if (trigger.on === 'on-damage-taken') applyDamage(sim, enemy, holder, 50, 'physical');
  else if (trigger.on === 'on-attack-land') attackImpact(sim, holder, enemy);
  else sim.runTriggers(holder, trigger.on, { other: enemy });
}

describe('item catalog audit — every ItemDef one at a time', () => {
  it('has unique item ids before per-item checks run', () => {
    const ids = ALL_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const item of ALL_ITEMS) {
    describe(item.id, () => {
      it('has a concrete role: runtime surface, recipe component, or documented coded system role', () => {
        const role = hasAuthoredSurface(item) || usedAsComponent.has(item.id) || item.id in CODED_SYSTEM_ITEMS;
        expect(role, `${item.id} has no runtime surface, recipe role, or coded system role`).toBe(true);
      });

      it('does not declare dead readiness-only knobs', () => {
        if (item.damageLockoutSec !== undefined) {
          expect(item.active, `${item.id} damageLockoutSec is only consumed by active item readiness`).toBeDefined();
        }
        if (item.charges !== undefined || item.consumesAllCharges) {
          const hasChargeRuntime = Boolean(item.active || item.triggers?.some((trigger) => trigger.chargeGain));
          expect(hasChargeRuntime, `${item.id} has charges but no active/charge trigger runtime`).toBe(true);
        }
      });

      if (item.passiveMods && Object.keys(item.passiveMods).length > 0) {
        it('routes each passiveMods key into live derived stats', () => {
          const { holder } = lab(1000 + item.id.length);
          const before = { ...holder.stats } as Record<keyof DerivedStats, number>;
          holder.items[0] = makeItemState(item);
          holder.markStatsDirty();
          holder.refresh(0);
          const after = holder.stats as unknown as Record<keyof DerivedStats, number>;
          expectModsRoute(item.id, item.passiveMods ?? {}, before, after);
        });
      }

      if (isGemId(item.id)) {
        it('carries a concrete socket stat payload through gemMods', () => {
          expect(Object.keys(gemMods(item.id)), `${item.id} has no socket stat payload`).not.toHaveLength(0);
        });
      }

      if (item.active) {
        it('enters the active item runtime path, spends cooldown/charges, and emits item-used', () => {
          const { sim, holder, enemy, ally } = lab(2000 + item.id.length, item);
          const state = holder.items[0]!;
          const beforeCharges = state.charges;
          const ready = itemReady(state, item, holder, sim.time);
          expect(ready.ok, `${item.id} readiness failed: ${ready.reason ?? 'unknown'}`).toBe(true);

          sim.order(holder.uid, { kind: 'item', invSlot: 0, ...castArgs(item.active!, enemy.uid, ally.uid, enemy.pos) });
          sim.run(2);

          expect(sim.events.history.some((event) => event.t === 'item-used' && event.itemId === item.id), `${item.id} did not emit item-used`).toBe(true);
          if (beforeCharges > 0) {
            const afterState = holder.items[0];
            const afterCharges = afterState?.charges ?? 0;
            expect(afterCharges, `${item.id} did not spend charges`).toBeLessThan(beforeCharges);
          } else {
            expect(state.cooldownUntil, `${item.id} did not set cooldown`).toBeGreaterThan(0);
          }
        });
      }

      if (item.aura) {
        it('applies its item aura to the correct live target class', () => {
          const { sim, holder, enemy, ally } = lab(3000 + item.id.length, item);
          sim.run(0.7);
          const tag = `aura:${holder.uid}:item:${item.id}`;
          const expectedTarget = item.aura!.affects === 'allies' ? ally : enemy;
          expect(expectedTarget.statuses.some((status) => status.tag === tag), `${item.id} aura did not apply to ${item.aura!.affects}`).toBe(true);
          if (item.aura!.excludeSelf) {
            expect(holder.statuses.some((status) => status.tag === tag), `${item.id} excludeSelf aura applied to holder`).toBe(false);
          }
        });
      }

      if (item.triggers?.length) {
        it('exposes triggers to the sim trigger dispatcher', () => {
          const { sim, holder, enemy } = lab(4000 + item.id.length, item);
          for (const trigger of item.triggers ?? []) {
            if (trigger.chargeGain) {
              expect(item.maxCharges, `${item.id}.${trigger.on} chargeGain needs maxCharges`).toBeGreaterThan(0);
              holder.items[0]!.charges = 0;
            }
            if (trigger.on === 'on-nearby-enemy-cast') sim.notifyEnemyCast(enemy);
            else if (trigger.on === 'on-nearby-death') sim.killUnit(enemy, null);
            else if (trigger.on === 'on-kill') sim.killUnit(enemy, holder);
            else sim.runTriggers(holder, trigger.on, { other: enemy });
          }

          if (item.triggers!.some((trigger) => trigger.chargeGain)) {
            expect(holder.items[0]!.charges, `${item.id} charge trigger did not add charges`).toBeGreaterThan(0);
          }
        });
      }

      if (item.attackMod) {
        it('is collected by the attack-mod pass and can resolve an attack impact', () => {
          const { sim, holder, enemy } = lab(5000 + item.id.length, item);
          expect(holder.collectAttackMods().some((mod) => mod.spec === item.attackMod), `${item.id} attackMod not collected`).toBe(true);
          expect(() => attackImpact(sim, holder, enemy), `${item.id} attackMod impact`).not.toThrow();
        });
      }

      if (item.tagBoon) {
        it('has executable tag-boon payloads for the swap runtime to consume', () => {
          const hasPayload = Boolean((item.tagBoon!.effects?.length ?? 0) > 0 || Object.values(item.tagBoon!.onArchetype ?? {}).some((effects) => (effects?.length ?? 0) > 0));
          expect(hasPayload, `${item.id} tagBoon has no effects/onArchetype payload`).toBe(true);
        });
      }

      if (item.elementOnHit || LEGACY_ELEMENT_ITEMS.has(item.id)) {
        it('routes on-hit element through resonance item lookup and live attack impact', () => {
          const { sim, holder, enemy } = lab(6000 + item.id.length, item);
          sim.resonanceEnabled = true;
          const element = elementForItemHit(item);
          expect(element, `${item.id} has no resolved on-hit element`).toBeTruthy();
          attackImpact(sim, holder, enemy);
          expect(enemy.elementAuras[element!], `${item.id} did not apply ${element} aura on hit`).toBeDefined();
        });
      }
    });
  }
});

describe('neutral item audit — every NeutralItemDef one at a time', () => {
  for (const neutral of ALL_NEUTRAL_ITEMS) {
    describe(neutral.id, () => {
      it('has a live neutral-slot role and legal enchant progression', () => {
        const hasLiveRole = Boolean((neutral.passiveMods && Object.keys(neutral.passiveMods).length > 0) || neutral.aura);
        expect(hasLiveRole, `${neutral.id} has no passive/aura neutral-slot effect`).toBe(true);
        if (neutral.enchantsInto) {
          const next = REG.neutralItem(neutral.enchantsInto);
          expect(next.tier, `${neutral.id} enchants into non-ascending tier`).toBeGreaterThan(neutral.tier);
        }
      });

      if (neutral.passiveMods && Object.keys(neutral.passiveMods).length > 0) {
        it('routes neutral passiveMods through Game neutral-slot stats', () => {
          const base = Game.headless(newGameSave('juggernaut')).activeUnit()!;
          const save = newGameSave('juggernaut');
          save.roster[0].neutralSlot = { id: neutral.id };
          const withNeutral = Game.headless(save).activeUnit()!;
          expectModsRoute(
            neutral.id,
            neutral.passiveMods ?? {},
            { ...base.stats } as Record<keyof DerivedStats, number>,
            withNeutral.stats as unknown as Record<keyof DerivedStats, number>
          );
        });
      }

      if (neutral.aura) {
        it('routes neutral aura through Game spawn into live aura ticks', () => {
          const save = newGameSave('juggernaut');
          save.roster[0].neutralSlot = { id: neutral.id };
          const game = Game.headless(save);
          const holder = game.activeUnit()!;
          expect(holder.setAuras.some((aura) => aura === neutral.aura), `${neutral.id} neutral aura was not installed on unit`).toBe(true);
          const ally = game.sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: holder.pos.x + 800, y: holder.pos.y }, level: 12, ctrl: { kind: 'none' } });
          game.sim.run(0.7);
          expect(ally.statuses.some((status) => status.tag?.startsWith(`aura:${holder.uid}:set:`)), `${neutral.id} neutral aura did not tick`).toBe(true);
        });
      }

      it('does not author neutral surfaces the runtime does not yet consume', () => {
        expect(neutral.active, `${neutral.id} active neutral items are not wired to an input/runtime slot`).toBeUndefined();
        expect(neutral.attackMod, `${neutral.id} neutral attackMod is not wired into Unit.collectAttackMods`).toBeUndefined();
      });
    });
  }
});

describe('item set audit — every ItemSetDef one at a time', () => {
  for (const set of ITEM_SET_DEFS) {
    describe(set.id, () => {
      it('has resolving pieces and grants its declared bonus surfaces', () => {
        for (const piece of set.pieces) {
          expect(REG.item(piece).set, `${set.id}.${piece} is not tagged back to its set`).toBe(set.id);
        }
        const equipped = set.pieces.map((id) => ({ id }));
        const effects = setBonusEffects(equipped);
        for (const bonus of set.bonuses) {
          for (const [key, value] of Object.entries(bonus.mods ?? {})) {
            expect(effects.mods[key as keyof StatModMap], `${set.id}.${key} missing from aggregate set mods`).toBeGreaterThanOrEqual(value);
          }
          if (bonus.aura) expect(effects.auras, `${set.id} missing authored set aura`).toContain(bonus.aura);
          if (bonus.trigger) expect(effects.triggers, `${set.id} missing authored set trigger`).toContain(bonus.trigger);
        }
      });

      it('applies set stat bonuses exactly once through Unit aggregateMods', () => {
        const { holder } = lab(7000 + set.id.length);
        const before = { ...holder.stats } as Record<keyof DerivedStats, number>;
        set.pieces.forEach((id, index) => {
          holder.items[index] = makeItemState(REG.item(id));
        });
        holder.markStatsDirty();
        holder.refresh(0);
        const expected = setBonusEffects(set.pieces.map((id) => ({ id }))).mods;
        expectModsRoute(set.id, expected, before, holder.stats as unknown as Record<keyof DerivedStats, number>);
      });

      if (set.bonuses.some((bonus) => bonus.aura)) {
        it('routes set auras through live aura ticks', () => {
          const { sim, holder, enemy } = lab(7100 + set.id.length);
          holder.setAuras = setBonusEffects(set.pieces.map((id) => ({ id }))).auras;
          sim.run(0.7);
          expect(enemy.statuses.some((status) => status.tag?.startsWith(`aura:${holder.uid}:set:`)), `${set.id} set aura did not tick`).toBe(true);
        });
      }

      if (set.bonuses.some((bonus) => bonus.trigger)) {
        it('routes set triggers through live trigger dispatch', () => {
          const { sim, holder, enemy } = lab(7200 + set.id.length);
          holder.setTriggers = setBonusEffects(set.pieces.map((id) => ({ id }))).triggers;
          const hpBefore = enemy.hp;
          for (const trigger of holder.setTriggers) fireTrigger(sim, holder, enemy, trigger);
          holder.refresh(sim.time);
          const changed = enemy.hp !== hpBefore || holder.hp !== holder.stats.maxHp || holder.statuses.length > 0 || enemy.statuses.length > 0;
          expect(changed, `${set.id} set trigger produced no observable live effect`).toBe(true);
        });
      }
    });
  }
});

describe('rolled affix audit — every ItemAffixDef one at a time', () => {
  for (const affix of AFFIX_DEFS) {
    describe(affix.id, () => {
      it('has at least one live rolled-item surface', () => {
        const hasSurface = Boolean(affix.statRanges || affix.attack || affix.aura || affix.trigger);
        expect(hasSurface, `${affix.id} has no stat/attack/aura/trigger surface`).toBe(true);
      });

      if (affix.statRanges) {
        it('resolves stat ranges into live resolvedMods', () => {
          const resolved = resolveAffix(affix, 1);
          const { holder } = lab(8000 + affix.id.length);
          const before = { ...holder.stats } as Record<keyof DerivedStats, number>;
          const item = makeItemState(REG.item('daedalus'));
          item.resolvedMods = resolved;
          holder.items[0] = item;
          holder.markStatsDirty();
          holder.refresh(0);
          expectModsRoute(affix.id, resolved, before, holder.stats as unknown as Record<keyof DerivedStats, number>);
        });
      }

      if (affix.attack) {
        it('routes affix attack mods through collectAttackMods and attack impact', () => {
          const { sim, holder, enemy } = lab(8100 + affix.id.length);
          const item = makeItemState(REG.item('daedalus'));
          item.affixes = [{ affixId: affix.id, roll: 1, resolved: {} }];
          holder.items[0] = item;
          expect(holder.collectAttackMods().some((mod) => mod.spec === affix.attack), `${affix.id} attack mod not collected`).toBe(true);
          expect(() => attackImpact(sim, holder, enemy), `${affix.id} attack impact`).not.toThrow();
        });
      }

      if (affix.aura) {
        it('routes affix auras through item aura ticks', () => {
          const { sim, holder, ally } = lab(8200 + affix.id.length);
          const item = makeItemState(REG.item('platemail'));
          item.affixes = [{ affixId: affix.id, roll: 1, resolved: {} }];
          holder.items[0] = item;
          sim.run(0.7);
          expect(ally.statuses.some((status) => status.tag === `aura:${holder.uid}:affix:${affix.id}`), `${affix.id} affix aura did not tick`).toBe(true);
        });
      }

      if (affix.trigger) {
        const trigger = affix.trigger;
        it('routes affix triggers through item trigger dispatch', () => {
          const { sim, holder, enemy } = lab(8300 + affix.id.length);
          const item = makeItemState(REG.item('daedalus'));
          item.affixes = [{ affixId: affix.id, roll: 1, resolved: {} }];
          holder.items[0] = item;
          const hpBefore = enemy.hp;
          fireTrigger(sim, holder, enemy, trigger);
          holder.refresh(sim.time);
          const changed = enemy.hp !== hpBefore || holder.triggerStacks.size > 0 || holder.statuses.length > 0 || enemy.statuses.length > 0;
          expect(changed, `${affix.id} trigger produced no observable live effect`).toBe(true);
        });
      }

      it('contributes socket/gem/affix resolved mods through refreshResolvedMods', () => {
        const item = refreshResolvedMods({
          id: 'daedalus',
          grade: 'standard',
          gradeRoll: 0.5,
          affixes: [{ affixId: affix.id, roll: 1, resolved: resolveAffix(affix, 1) }],
          sockets: ['chipped-topaz']
        }, REG.item('daedalus'));
        expect(Object.keys(item.resolvedMods ?? {}).length, `${affix.id} produced no resolved item mods`).toBeGreaterThan(0);
      });
    });
  }
});
