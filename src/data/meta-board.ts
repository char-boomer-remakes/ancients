import type { MetaNodeDef } from '../core/types';

// PROGRESSION_OVERHAUL §4.2 — the Trainer meta board. Every node buys access,
// economy, collection, or convenience: a DIAL, never raw power. The `effect`
// vocabulary is closed (MetaEffectKey) and may never carry a `StatMods` key —
// data-lint enforces this so the meta can't become a stat stick.
export const ALL_META_NODES: MetaNodeDef[] = [
  {
    id: 'ascendant-i',
    name: 'Ascendant Attunement I',
    description: 'Raise the World Level ascension ceiling by one tier.',
    cost: 6000,
    effect: { worldLevelCap: 1 }
  },
  {
    id: 'ascendant-ii',
    name: 'Ascendant Attunement II',
    description: 'Raise the World Level ascension ceiling by another tier.',
    cost: 16000,
    effect: { worldLevelCap: 1 },
    requiresTrainerLevel: 4
  },
  {
    id: 'deep-stash',
    name: 'Deep Stash',
    description: 'Expand the neutral stash and inventory vault.',
    cost: 4000,
    effect: { stashSize: 12 }
  },
  {
    id: 'merchant-favor',
    name: "Merchant's Favor",
    description: 'The roaming merchant restocks one extra time per visit.',
    cost: 5000,
    effect: { merchantRefresh: 1 }
  },
  {
    id: 'tamer-hands',
    name: "Tamer's Steady Hands",
    description: 'Capture binds resolve faster.',
    cost: 4500,
    effect: { catchSpeed: 1 }
  },
  {
    id: 'wider-entourage',
    name: 'Wider Entourage',
    description: 'Field one more captured creep.',
    cost: 9000,
    effect: { entourageSlot: 1 },
    requiresTrainerLevel: 3
  },
  {
    id: 'shard-dowser',
    name: 'Shard Dowser',
    description: 'Echo shards turn up more often in the world.',
    cost: 7000,
    effect: { findShardRate: 1 }
  },
  {
    id: 'rematch-tactician',
    name: 'Rematch Tactician',
    description: 'Re-fights grant a bonus Captain Call.',
    cost: 8000,
    effect: { refightCaptainCall: 1 }
  },
  {
    id: 'wayfinder',
    name: 'Wayfinder',
    description: 'Unlock fast travel between discovered waypoints.',
    cost: 6000,
    effect: { fastTravel: 1 }
  }
];

export const META_NODES_BY_ID: Record<string, MetaNodeDef> = Object.fromEntries(ALL_META_NODES.map((n) => [n.id, n]));
