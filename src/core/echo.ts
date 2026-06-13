import type { EchoProgress } from './types';

export const TALENT_TIER_COUNT = 4;
export type TalentPick = 0 | 1 | null;

export function freshEchoProgress(): EchoProgress {
  return {
    kills: 0,
    facetSwapUnlocked: false,
    talentTierUnlocks: Array(TALENT_TIER_COUNT).fill(false)
  };
}

export function normalizeEchoProgress(progress?: Partial<EchoProgress>): EchoProgress {
  const kills = Math.max(0, Math.floor(progress?.kills ?? 0));
  const unlocks = Array(TALENT_TIER_COUNT)
    .fill(false)
    .map((_, i) => progress?.talentTierUnlocks?.[i] === true);

  return {
    kills,
    facetSwapUnlocked: progress?.facetSwapUnlocked === true || kills > 0,
    talentTierUnlocks: unlocks
  };
}

export function activeTalentOptionsForTier(picks: TalentPick[], progress: EchoProgress | undefined, tier: number): (0 | 1)[] {
  const pick = picks[tier];
  if (pick === null || pick === undefined) return [];
  const out: (0 | 1)[] = [pick];
  const echo = normalizeEchoProgress(progress);
  if (echo.talentTierUnlocks[tier]) out.push(pick === 0 ? 1 : 0);
  return out;
}

export function recordOwnedHeroEchoKill(progress: EchoProgress | undefined): {
  progress: EchoProgress;
  unlockedTier: number | null;
  firstFacetUnlock: boolean;
} {
  const next = normalizeEchoProgress(progress);
  const firstFacetUnlock = !next.facetSwapUnlocked;
  next.kills += 1;
  next.facetSwapUnlocked = true;

  const unlockedTier = next.talentTierUnlocks.findIndex((unlocked) => !unlocked);
  if (unlockedTier >= 0) next.talentTierUnlocks[unlockedTier] = true;

  return {
    progress: next,
    unlockedTier: unlockedTier >= 0 ? unlockedTier : null,
    firstFacetUnlock
  };
}
