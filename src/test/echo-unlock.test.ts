import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { freshEchoProgress, recordOwnedHeroEchoKill } from '../core/echo';
import { buildHero } from '../core/hero-setup';

beforeAll(() => registerAllContent());

describe('owned hero echoes', () => {
  it('unlock facets on the first kill and talent tiers in order', () => {
    const first = recordOwnedHeroEchoKill(freshEchoProgress());

    expect(first.firstFacetUnlock).toBe(true);
    expect(first.unlockedTier).toBe(0);
    expect(first.progress.kills).toBe(1);
    expect(first.progress.facetSwapUnlocked).toBe(true);
    expect(first.progress.talentTierUnlocks).toEqual([true, false, false, false]);

    const second = recordOwnedHeroEchoKill(first.progress);
    expect(second.firstFacetUnlock).toBe(false);
    expect(second.unlockedTier).toBe(1);
    expect(second.progress.talentTierUnlocks).toEqual([true, true, false, false]);
  });

  it('applies the opposite talent branch only after an echo unlock', () => {
    const jug = REG.hero('juggernaut');
    const primaryOnly = buildHero(jug, [0, null, null, null], 0, freshEchoProgress());
    const bladeFury = primaryOnly.def.abilities.find((a) => a.id === 'jug-blade-fury')!;

    expect(primaryOnly.externalMods.str).toBe(5);
    expect(primaryOnly.externalMods.agi).toBe(5);
    expect(primaryOnly.externalMods.int).toBe(5);
    expect(bladeFury.values!.dpsTick[0]).toBe(21.25);

    const unlocked = recordOwnedHeroEchoKill(freshEchoProgress()).progress;
    const perfectedTier = buildHero(jug, [0, null, null, null], 0, unlocked);
    const perfectedBladeFury = perfectedTier.def.abilities.find((a) => a.id === 'jug-blade-fury')!;

    expect(perfectedTier.externalMods.str).toBe(5);
    expect(perfectedTier.externalMods.agi).toBe(5);
    expect(perfectedTier.externalMods.int).toBe(5);
    expect(perfectedBladeFury.values!.dpsTick[0]).toBe(26.25);
  });
});
