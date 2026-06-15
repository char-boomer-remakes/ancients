import type { GameSave } from './types';
import { migratePhase7Save } from './phase7';

// ------------------------------------------------------------------
// Save v8 (PROGRESSION_OVERHAUL §6): adds the Trainer track + meta dial.
// Additive — every field is optional and defaults here, so a pre-v8 save
// loads clean and picks the system up live on the next progression beat.
// ------------------------------------------------------------------

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function nonNegInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && value >= 0 ? Math.floor(value) : fallback;
}

export function migratePhase8Save(s: GameSave | { version: number; [k: string]: unknown }): GameSave {
  const base = migratePhase7Save(s as GameSave) as GameSave & {
    trainerLevel?: unknown;
    trainerXp?: unknown;
    metaNodes?: unknown;
    worldLevelTier?: unknown;
    collectionMilestones?: unknown;
  };
  return {
    ...base,
    version: 8,
    trainerLevel: nonNegInt(base.trainerLevel, 1) || 1,
    trainerXp: nonNegInt(base.trainerXp, 0),
    metaNodes: strArray(base.metaNodes),
    worldLevelTier: nonNegInt(base.worldLevelTier, 0),
    collectionMilestones: strArray(base.collectionMilestones)
  };
}
