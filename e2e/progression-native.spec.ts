import { test, expect } from '@playwright/test';
import { boot, clearCinematics, expectNoPageErrors, watchPageErrors } from './helpers';

test.describe('progression/native regression coverage', () => {
  test('native shop items equip through Armory and apply live stat hooks', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 151 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const heroId = g.party[g.activeIdx].heroId;
      const ids = ['mentors-standard', 'skyfeather-anklet', 'catalyst-prism', 'tagweavers-gauntlet'];
      t.addXp(200_000);
      const before = { ...g.activeUnit().stats };

      for (const id of ids) g.inventoryStash.push({ id });
      const equipped = ids.map((id) => {
        const idx = g.inventoryStash.findIndex((it: any) => it.id === id);
        return g.equipArmoryItemForHero(heroId, idx);
      });

      const u = g.activeUnit();
      u.refresh(g.sim.time);
      return {
        equipped,
        held: u.items.filter((it: any) => it).map((it: any) => it.defId),
        stats: {
          partyXpAmpPct: u.stats.partyXpAmpPct,
          staminaBonus: u.stats.staminaBonus,
          reactionAmpPct: u.stats.reactionAmpPct,
          tagChainWindowBonusSec: u.stats.tagChainWindowBonusSec
        },
        before: {
          partyXpAmpPct: before.partyXpAmpPct,
          staminaBonus: before.staminaBonus,
          reactionAmpPct: before.reactionAmpPct,
          tagChainWindowBonusSec: before.tagChainWindowBonusSec
        }
      };
    });

    expect(result.equipped).toEqual([true, true, true, true]);
    expect(result.held).toEqual(expect.arrayContaining(['mentors-standard', 'skyfeather-anklet', 'catalyst-prism', 'tagweavers-gauntlet']));
    expect(result.stats.partyXpAmpPct).toBeGreaterThan(result.before.partyXpAmpPct);
    expect(result.stats.staminaBonus).toBeGreaterThan(result.before.staminaBonus);
    expect(result.stats.reactionAmpPct).toBeGreaterThan(result.before.reactionAmpPct);
    expect(result.stats.tagChainWindowBonusSec).toBeGreaterThan(result.before.tagChainWindowBonusSec);
    expectNoPageErrors(errors);
  });

  test('raid-native relics are not shop-sold, but can be picked up from raid drops', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 152 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const u = g.activeUnit();
      const ids = ['concord-relic', 'twin-soul-vessel'];
      const shopSells = ids.map((id) => g.shopSells(id));
      const drops = g.spawnGroundItems(ids.map((id) => ({ id })), u.pos, { source: 'raid' });
      const picked = drops.map((drop: any) => g.pickupGroundItem(drop.uid));
      return {
        shopSells,
        picked,
        held: u.items.filter((it: any) => it).map((it: any) => it.defId),
        codex: ids.map((id) => g.codexUnlocks.has(`item:${id}`)),
        groundLeft: g.visibleGroundItemDrops().filter((drop: any) => ids.includes(drop.item.id)).length
      };
    });

    expect(result.shopSells).toEqual([false, false]);
    expect(result.picked).toEqual([true, true]);
    expect(result.held).toEqual(expect.arrayContaining(['concord-relic', 'twin-soul-vessel']));
    expect(result.codex).toEqual([true, true]);
    expect(result.groundLeft).toBe(0);
    expectNoPageErrors(errors);
  });

  test('World Level texture shield scales through the live page runtime', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', region: 'icewrack', seed: 153 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const textureElite = g.textureOverworldElite;
      if (typeof textureElite !== 'function') return { hasMethod: false } as const;

      t.spawnWildCreepNearActive({ count: 1, creepId: 'kobold' });
      const target = g.sim.unitsArr.find((u: any) => u.team !== g.activeUnit().team);
      const rng = {
        next: () => 0.25,
        range: (min: number, max: number) => min + (max - min) * 0.25,
        int: (min: number) => min,
        chance: () => false,
        pick: (arr: any[]) => arr[0],
        fork: function () {
          return this;
        }
      };

      textureElite.call(g, target, 0, rng);
      const flat = target.elementalShield?.maxHp ?? 0;
      target.elementalShield = undefined;
      textureElite.call(g, target, 8, rng);
      const featured = target.elementalShield?.maxHp ?? 0;
      return {
        hasMethod: true,
        maxHp: target.stats.maxHp,
        flat,
        featured,
        weakMult: target.elementalShield?.weakMult,
        weaknessCount: target.elementalShield?.weakTo?.length ?? 0
      };
    });

    expect(result.hasMethod).toBe(true);
    expect(result.flat).toBeGreaterThan(0);
    expect(result.featured).toBeGreaterThan(result.flat);
    expect(result.featured / result.maxHp).toBeGreaterThan(result.flat / result.maxHp);
    expect(result.weakMult).toBeGreaterThan(1);
    expect(result.weaknessCount).toBeGreaterThan(0);
    expectNoPageErrors(errors);
  });

  // The bug class that slipped through the gym slice: the §3.2 level-cap rule met
  // the §5.4 counter-draft + §3.1 ban loop only at runtime, where over-cap/empty
  // teams crashed. challengeGym (in sessions.spec) auto-resolves WITHOUT the live
  // LiveGymFight ban loop, so this drives the live path end-to-end in the browser.
  test('the live captains-series fight runs to a result without fielding an over-cap or banned hero', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 154 });
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      const GYM = 'lunar-gym'; // caps the draft (PROGRESSION §3.2) + counter-drafts last-pick
      // a deep recruited roster so the leader's bans have heroes to bite into and
      // the player has legal repicks (the forced-repick / re-slot path).
      const POOL = ['juggernaut', 'sven', 'phantom-assassin', 'sniper', 'luna', 'axe',
        'earthshaker', 'tidehunter', 'lich', 'crystal-maiden', 'witch-doctor', 'lina', 'zeus'];
      const partyCount = t.fillParty({ heroIds: POOL.slice(1, 5), level: 14 });
      for (const id of POOL) g.recruited.add(id);

      // a cap-legal five with two carries so the last-pick lockdown actually fires
      const five = ['juggernaut', 'luna', 'lich', 'crystal-maiden', 'tidehunter'];
      const draftHeroes = five.map((heroId) => ({ heroId, level: 14, items: ['black-king-bar', 'crystalys'] }));
      g.commitGymDraft(GYM, { heroes: draftHeroes, formation: { placements: {} } });

      const started = g.startLiveGym(GYM);
      const live = g.liveGym;
      if (!live) return { started, hasResult: false, partyCount, party: g.party.map((r: any) => r.heroId) } as any;
      const cap = live.gym.format.rules.find((r: any) => r.kind === 'level-cap')?.max ?? 30;
      const res = live.runHeadless();
      const banned = [...live.bannedHeroes];
      const playerFive = live.currentPlayerFive();
      const enemyFive = live.currentEnemyFive();
      return {
        started,
        hasResult: !!res,
        partyCount,
        cap,
        banned,
        playerFive,
        enemyFive,
        playerUnique: new Set(playerFive).size,
        enemyUnique: new Set(enemyFive).size,
        bannedFielded: playerFive.filter((id: string) => banned.includes(id)),
        counterEnemy: g.lastCounterDraft ? g.lastCounterDraft.enemy.map((h: any) => ({ id: h.heroId, level: h.level })) : null
      };
    });

    expect(result.started).toBe(true);
    expect(result.hasResult).toBe(true);
    expect(result.playerFive.length).toBe(5);
    expect(result.playerUnique).toBe(5);
    expect(result.enemyFive.length).toBe(5);
    expect(result.enemyUnique).toBe(5);
    // the leader never bricks the player's five: no banned hero is ever fielded
    expect(result.bannedFielded).toEqual([]);
    // the live counter-draft respects the gym's level cap (the enemyLevel regression)
    if (result.counterEnemy) {
      for (const h of result.counterEnemy) expect(h.level).toBeLessThanOrEqual(result.cap);
    }
    expectNoPageErrors(errors);
  });
});
