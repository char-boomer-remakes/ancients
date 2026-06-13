import type { ArmoryLoadouts, GameSave, HeroLoadoutSlots } from './types';
import { migratePhase5Save } from './phase5';

// ------------------------------------------------------------------
// Armory-management save v6: bench loadouts. The systems layer owns the
// behavior; the core only normalizes the serializable map for migrations.
// ------------------------------------------------------------------

export function normalizeLoadoutSlots(slots: unknown): HeroLoadoutSlots {
  const arr = Array.isArray(slots) ? slots : [];
  const out: HeroLoadoutSlots = [null, null, null, null, null, null];
  for (let i = 0; i < out.length; i++) {
    const v = arr[i];
    out[i] = typeof v === 'string' ? v : null;
  }
  return out;
}

export function normalizeArmoryLoadouts(value: unknown): ArmoryLoadouts {
  if (!value || typeof value !== 'object') return {};
  const out: ArmoryLoadouts = {};
  for (const [heroId, byName] of Object.entries(value as Record<string, unknown>)) {
    if (!byName || typeof byName !== 'object') continue;
    const normalized: Record<string, HeroLoadoutSlots> = {};
    for (const [name, slots] of Object.entries(byName as Record<string, unknown>)) {
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      normalized[name] = normalizeLoadoutSlots(slots);
    }
    if (Object.keys(normalized).length > 0) out[heroId] = normalized;
  }
  return out;
}

export function migratePhase6Save(s: GameSave | { version: number; [k: string]: unknown }): GameSave {
  const base = migratePhase5Save(s as GameSave);
  return {
    ...base,
    version: 6,
    loadouts: normalizeArmoryLoadouts((base as GameSave & { loadouts?: unknown }).loadouts)
  };
}
