// ============================================================
// INTERACTION VERIFICATION — coverage registry + content census.
//
// Single source of truth shared by both ends of the matrix
// (INTERACTION_VERIFICATION.md §3.1, §7):
//   - the census (interaction-matrix.test.ts) walks all content
//     and buckets it by effect kind / mechanic / status, then
//     fails if a kind that appears in content has no behavioral
//     harness tagged here.
//   - the per-kind harness files (interactions/*.test.ts) import
//     COVERED_* to keep their claims honest against this registry.
// Drift in either direction is a red test, not a silent gap.
// ============================================================

import { ALL_HEROES } from '../../data/index';
import { ALL_ITEMS } from '../../data/items/index';
import { ALL_CREEPS } from '../../data/creeps/index';
import { ALL_NEUTRAL_ITEMS } from '../../data/neutral-items';
import type { AbilityDef, EffectNode, HeroDef, StatusId, TagBoonDef } from '../../core/types';

// ---------- the closed effect vocabulary (src/core/types.ts EffectNode) ----------
export type EffectKind = EffectNode['kind'];

export const ALL_EFFECT_KINDS: EffectKind[] = [
  'damage', 'heal', 'mana', 'status', 'displace', 'zone', 'summon',
  'statmod', 'projectile', 'repeat', 'capture-channel', 'purge', 'exotic'
];

// Non-EffectNode mechanics that ride on abilities/items (§1).
export type Mechanic = 'channel' | 'toggle' | 'aura' | 'passiveMods' | 'triggers' | 'attackMod';
export const ALL_MECHANICS: Mechanic[] = ['channel', 'toggle', 'aura', 'passiveMods', 'triggers', 'attackMod'];

// ---------- the harness registry (what interactions/*.test.ts proves) ----------
// Each entry is claimed by a behavioral file with a positive case + a negative
// control. Adding a new effect kind to content with no entry here fails the census.
export const COVERED_EFFECT_KINDS: Record<EffectKind, string> = {
  damage: 'interactions/damage.test.ts',
  heal: 'interactions/heal-mana.test.ts',
  mana: 'interactions/heal-mana.test.ts',
  status: 'interactions/status.test.ts',
  displace: 'interactions/displace.test.ts',
  zone: 'interactions/zone.test.ts',
  summon: 'interactions/summon.test.ts',
  statmod: 'interactions/aura-trigger.test.ts',
  projectile: 'interactions/projectile.test.ts',
  repeat: 'interactions/damage.test.ts',
  'capture-channel': 'interactions/channel-toggle.test.ts',
  purge: 'interactions/cross.test.ts',
  exotic: 'interactions/cross.test.ts'
};

export const COVERED_MECHANICS: Record<Mechanic, string> = {
  channel: 'interactions/channel-toggle.test.ts',
  toggle: 'interactions/channel-toggle.test.ts',
  aura: 'interactions/aura-trigger.test.ts',
  passiveMods: 'interactions/aura-trigger.test.ts',
  triggers: 'interactions/aura-trigger.test.ts',
  attackMod: 'interactions/aura-trigger.test.ts'
};

// StatusIds with a behavioral assertion in interactions/status.test.ts.
export const COVERED_STATUSES: StatusId[] = [
  'stun', 'root', 'silence', 'hex', 'slow', 'disarm', 'blind', 'fear', 'taunt',
  'invis', 'magic-immune', 'break', 'cyclone', 'sleep', 'frozen', 'buff'
];

// ---------- census walker ----------
export interface Census {
  kinds: Map<EffectKind, number>;
  mechanics: Map<Mechanic, number>;
  statuses: Map<StatusId, number>;
  displaceModes: Map<string, number>;
  exoticIds: Set<string>;
  abilityCount: number;
  tagBoonCount: number;
}

function bump<K>(m: Map<K, number>, k: K): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function walkEffects(effects: EffectNode[] | undefined, c: Census): void {
  if (!effects) return;
  for (const node of effects) {
    bump(c.kinds, node.kind);
    switch (node.kind) {
      case 'status':
        bump(c.statuses, node.status);
        if (node.params?.periodic) walkEffects(node.params.periodic.effects, c);
        break;
      case 'displace':
        bump(c.displaceModes, node.mode);
        break;
      case 'zone':
        if (node.zone.tick) walkEffects(node.zone.tick.effects, c);
        if (node.zone.onEnter) walkEffects(node.zone.onEnter.effects, c);
        break;
      case 'projectile':
        walkEffects(node.proj.onHit, c);
        break;
      case 'repeat':
        walkEffects(node.effects, c);
        break;
      case 'summon':
        for (const sa of node.summon.abilities ?? []) walkAbility(sa, c, false);
        break;
      case 'exotic':
        c.exoticIds.add(node.id);
        break;
      default:
        break;
    }
  }
}

export function walkAbility(def: AbilityDef, c: Census, countSource = true): void {
  if (countSource) c.abilityCount++;
  walkEffects(def.effects, c);
  if (def.channel) {
    bump(c.mechanics, 'channel');
    if (def.channel.tick) walkEffects(def.channel.tick.effects, c);
    if (def.channel.onEnd) walkEffects(def.channel.onEnd, c);
  }
  if (def.toggle) {
    bump(c.mechanics, 'toggle');
    walkEffects(def.toggle.effects, c);
  }
  if (def.aura) bump(c.mechanics, 'aura');
  if (def.passiveMods) bump(c.mechanics, 'passiveMods');
  if (def.attackMod) bump(c.mechanics, 'attackMod');
  for (const trig of def.triggers ?? []) {
    bump(c.mechanics, 'triggers');
    walkEffects(trig.effects, c);
  }
}

function walkTagBoon(boon: TagBoonDef, c: Census): void {
  c.tagBoonCount++;
  walkEffects(boon.effects, c);
  walkEffects(boon.outEffects, c);
}

/** Walk every castable thing + every tagBoon and bucket by kind/mechanic/status. */
export function censusContent(): Census {
  const c: Census = {
    kinds: new Map(),
    mechanics: new Map(),
    statuses: new Map(),
    displaceModes: new Map(),
    exoticIds: new Set(),
    abilityCount: 0,
    tagBoonCount: 0
  };
  for (const hero of ALL_HEROES) {
    for (const a of hero.abilities) walkAbility(a, c);
    if (hero.tagBoon) walkTagBoon(hero.tagBoon, c);
  }
  for (const creep of ALL_CREEPS) for (const a of creep.abilities) walkAbility(a, c);
  for (const item of ALL_ITEMS) if (item.active) walkAbility(item.active, c);
  for (const n of ALL_NEUTRAL_ITEMS) if (n.active) walkAbility(n.active, c);
  return c;
}

export function heroesWithTagBoon(): HeroDef[] {
  return ALL_HEROES.filter((h) => h.tagBoon);
}
