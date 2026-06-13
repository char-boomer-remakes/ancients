import { TUNING } from '../data/tuning';
import type { GameSave } from './types';
import { migratePhase4Save } from './phase4';
import type { GameSaveV3 } from './phase3';

// ------------------------------------------------------------------
// Gameplay-overhaul save v5: stamina, discovery/exploration state, and
// soft resin pacing. The fields are systems-owned; the core only knows the
// serializable shape so older saves can migrate deterministically.
// ------------------------------------------------------------------

export function defaultPhase5SaveFields(playtimeSec = 0): Pick<
  GameSave,
  'stamina' | 'discovered' | 'openedChests' | 'collectedShards' | 'solvedPuzzles' | 'shardsTurnedIn' | 'explorationPct' | 'resin' | 'resinUpdatedAt' | 'essence'
> {
  return {
    stamina: TUNING.traversal.staminaMax,
    discovered: [],
    openedChests: [],
    collectedShards: [],
    solvedPuzzles: [],
    shardsTurnedIn: {},
    explorationPct: {},
    resin: TUNING.resin.max,
    resinUpdatedAt: playtimeSec,
    essence: 0
  };
}

export function migratePhase5Save(s: GameSaveV3 | GameSave): GameSave {
  const base = migratePhase4Save(s);
  const defaults = defaultPhase5SaveFields(base.playtimeSec);
  return {
    ...base,
    version: 5,
    stamina: typeof base.stamina === 'number' ? Math.max(0, Math.min(TUNING.traversal.staminaMax, base.stamina)) : defaults.stamina,
    discovered: Array.isArray(base.discovered) ? [...base.discovered] : defaults.discovered,
    openedChests: Array.isArray(base.openedChests) ? [...base.openedChests] : defaults.openedChests,
    collectedShards: Array.isArray(base.collectedShards) ? [...base.collectedShards] : defaults.collectedShards,
    solvedPuzzles: Array.isArray(base.solvedPuzzles) ? [...base.solvedPuzzles] : defaults.solvedPuzzles,
    shardsTurnedIn: base.shardsTurnedIn && typeof base.shardsTurnedIn === 'object' ? { ...base.shardsTurnedIn } : defaults.shardsTurnedIn,
    explorationPct: base.explorationPct && typeof base.explorationPct === 'object' ? { ...base.explorationPct } : defaults.explorationPct,
    resin: typeof base.resin === 'number' ? Math.max(0, Math.min(TUNING.resin.max, base.resin)) : defaults.resin,
    resinUpdatedAt: typeof base.resinUpdatedAt === 'number' ? base.resinUpdatedAt : defaults.resinUpdatedAt,
    essence: typeof base.essence === 'number' ? Math.max(0, Math.floor(base.essence)) : defaults.essence
  };
}
