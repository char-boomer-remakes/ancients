import type { DomainDef, LootTable } from '../core/types';
import { TUNING } from './tuning';

// Domains (GAMEPLAY_OVERHAUL §3.5, Pillar P5): element-themed instanced challenges
// on the raid runner. Each pairs a scaled boss with a run-wide "disorder" rule and a
// curated, resin-paced loot table. Reuses the raid encounter engine + LootTable + the
// resonance element vocabulary — no new core mechanic, zero exotics.

function domainLoot(guaranteed: string[], assembledPool: string[]): LootTable {
  return {
    guaranteed,
    assembledPool,
    dropPct: { normal: 0.55, nightmare: 0.7, hell: 0.85 },
    pity: TUNING.raidBadLuckPity,
    qualityOdds: { inscribed: 0.1, genuine: 0.05 }
  };
}

export const ALL_DOMAINS: DomainDef[] = [
  {
    id: 'emberfall-rift',
    name: 'Emberfall Rift',
    title: 'Where the Mad Moon Still Burns',
    regionId: 'tranquil-vale',
    element: 'pyro',
    disorder: {
      // The rift's heat opens you to magic and bathes the arena in ambient pyro,
      // so a hydro/cryo answer turns the disorder into Vaporize/Melt pressure.
      mods: { magicResistPct: -8 },
      tick: { element: 'pyro', interval: 6 },
      note: 'Ember Surge: −8% magic resist; ambient pyro bathes the arena every 6s.'
    },
    clear: { kind: 'defeat' },
    encounter: { heroId: 'lich', level: 28, items: ['black-king-bar', 'aghanims-scepter'], hpScale: 2.1, damageScale: 1.0, enrageSec: 120 },
    resinCost: 30,
    loot: domainLoot(['ultimate-orb'], ['octarine-core', 'kaya']),
    dialogue: ['The crater never cooled. Neither did what it left behind.', 'Bring water, or bring ash to add to mine.']
  }
];
