import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { NATIVE } from '../data/items';
import { ALL_RAIDS } from '../data/raids';
import { ALL_DOMAINS } from '../data/domains';
import { runDomainEncounter } from '../core/macro';
import { ALL_GYMS } from '../data/gyms';
import { computeKillReward, worldLevelScale } from '../core/progression';
import { REG } from '../core/registry';
import { Rng } from '../core/rng';
import { makeItemState } from '../core/items';
import {
  buildLegalTeam,
  counterDraft,
  formatLevelCap,
  formatSatisfiable,
  isLegalDraft,
  pickEnemyBans,
  repicksAllowed
} from '../core/draft';
import { TUNING } from '../data/tuning';
import { Game, newGameSave } from '../systems/game';
import { LiveGymFight, runGymMatch, type GymMatchHero } from '../systems/macro-session';
import { bossFightSetupFromDef, raidSetupFromDef } from '../core/phase3';
import { ALL_BOSSES } from '../data/bosses';
import { META_NODES_BY_ID } from '../data/meta-board';
import type { DraftFormat, GambitRule, GameSave, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

// ---- shared fixtures for the draft/series interplay blocks ----
const ALL_IDS = (): string[] => [...REG.heroes.keys()].sort();
const withRole = (role: string): string[] => ALL_IDS().filter((id) => REG.hero(id).roles.includes(role));
const withoutRole = (role: string): string[] => ALL_IDS().filter((id) => !REG.hero(id).roles.includes(role));
const teamOf = (ids: string[], level: number, items?: string[]): MacroHeroSetup[] =>
  ids.map((heroId) => ({ heroId, level, items }));

// A diverse pool of strong heroes covering every role/attribute, so buildLegalTeam
// can satisfy each gym's format while still fielding heroes that fight (mirrors draft-format.test).
const STRONG_POOL = [
  'juggernaut', 'sven', 'phantom-assassin', 'sniper', 'luna', 'medusa', 'wraith-king', 'lifestealer',
  'axe', 'earthshaker', 'magnus', 'tidehunter', 'centaur-warrunner',
  'lich', 'crystal-maiden', 'witch-doctor', 'jakiro', 'lina', 'zeus', 'skywrath-mage'
];
const STRONG_ITEMS = ['black-king-bar', 'battlefury', 'crystalys']; // all tier ≤ 2, legal under every gym
const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

const MARQUEE_RAID_IDS = new Set([
  'renegade-marshal',
  'void-prelate',
  'forsaken-queen',
  'sundered-betrayer',
  'prime-evil',
  'lord-of-hatred',
  'last-eldwurm'
]);

function headlessGame(regionId = 'tranquil-vale'): Game {
  const save = newGameSave('juggernaut');
  save.regionId = regionId;
  save.worldSeed = 20260615;
  return Game.headless(save);
}

describe('progression overhaul regression interplays', () => {
  it('makes World Level texture load-bearing through the live elite shield path', () => {
    const game = headlessGame('icewrack');
    const textureElite = (game as unknown as { textureOverworldElite(u: unknown, wl: number, rng: Rng): void }).textureOverworldElite.bind(game);
    const spawn = () =>
      game.sim.spawnCreep(REG.creep('kobold'), {
        team: 1,
        pos: { x: 1200, y: 1200 },
        wild: true,
        regionId: game.region.id
      });

    const flat = spawn();
    textureElite(flat, 0, new Rng(101));
    const featured = spawn();
    textureElite(featured, TUNING.worldLevel.cap, new Rng(102));

    const flatExpected = Math.round(flat.stats.maxHp * TUNING.worldLevel.shieldBasePct);
    const featuredFrac =
      TUNING.worldLevel.shieldBasePct +
      worldLevelScale(TUNING.worldLevel.cap).texture * TUNING.worldLevel.shieldTextureMult;
    const featuredExpected = Math.round(featured.stats.maxHp * featuredFrac);

    expect(flat.elementalShield?.maxHp).toBe(flatExpected);
    expect(featured.elementalShield?.maxHp).toBe(featuredExpected);
    expect(featured.elementalShield!.maxHp / featured.stats.maxHp).toBeGreaterThan(flat.elementalShield!.maxHp / flat.stats.maxHp);
  });

  it('turns native item data into runtime stats and party reward behavior', () => {
    const game = headlessGame();
    const hero = game.activeUnit()!;
    const statsBefore = { ...hero.stats };

    for (const [slot, id] of ['mentors-standard', 'skyfeather-anklet', 'catalyst-prism', 'tagweavers-gauntlet'].entries()) {
      hero.items[slot] = makeItemState(REG.item(id));
    }
    hero.markStatsDirty();
    hero.refresh(game.sim.time);

    expect(hero.stats.partyXpAmpPct).toBeGreaterThan(statsBefore.partyXpAmpPct);
    expect(hero.stats.staminaBonus).toBeGreaterThan(statsBefore.staminaBonus);
    expect(hero.stats.reactionAmpPct).toBeGreaterThan(statsBefore.reactionAmpPct);
    expect(hero.stats.tagChainWindowBonusSec).toBeGreaterThan(statsBefore.tagChainWindowBonusSec);

    const party = [
      { heroId: 'juggernaut', isActive: true, participated: true },
      { heroId: 'sven', isActive: false, participated: false },
      { heroId: 'lich', isActive: false, participated: true }
    ];
    const base = computeKillReward({ xp: 100, gold: 10 }, party, false, 0);
    const amped = computeKillReward({ xp: 100, gold: 10 }, party, false, hero.stats.partyXpAmpPct);

    expect(amped.perHeroXp[0].xp).toBe(base.perHeroXp[0].xp);
    expect(amped.perHeroXp[1].xp).toBeGreaterThan(base.perHeroXp[1].xp);
    expect(amped.perHeroXp[2].xp).toBeGreaterThan(base.perHeroXp[2].xp);
  });

  it('keeps native raid relics homed in real raids without polluting marquee lane anchors', () => {
    const raidNative = NATIVE.filter((item) => item.exclusiveTo?.includes('raid'));
    expect(raidNative.map((item) => item.id).sort()).toEqual(['concord-relic', 'twin-soul-vessel']);

    for (const item of raidNative) {
      const homes = ALL_RAIDS.filter((raid) => [...raid.loot.guaranteed, ...raid.loot.assembledPool].includes(item.id));
      expect(homes.length, `${item.id} has a concrete raid home`).toBeGreaterThan(0);
      expect(homes.every((raid) => !MARQUEE_RAID_IDS.has(raid.id)), `${item.id} stays out of marquee chassis-lane pools`).toBe(true);
      expect(item.tier, `${item.id} remains macro-banned utility gear`).toBe('special');
      expect(item.rarity).toBe('arcana');
    }
  });
});

// ============================================================
// The class of bug that actually slipped through the gym slice: the
// level-cap rule (§3.2) was added to every gym format, but the counter-draft
// (§5.4) and the team builder defaulted heroes to level 30. Under a cap < 30
// that produced over-cap heroes, empty teams, and an out-of-bounds swap-target
// crash. These features were each unit-tested in ISOLATION (every rule kind, a
// happy-path counter-draft on one gym) but never together — so the interplay
// went uncaught. The blocks below pin the interplay directly.
// ============================================================

describe('counter-draft × level-cap — the interplay that crashed (PROGRESSION §3.2 / §5.4)', () => {
  it('returns a full, format-legal, cap-respecting five for EVERY gym across seeds', () => {
    for (const gym of ALL_GYMS) {
      const cap = formatLevelCap(gym.format) ?? 30;
      const pool = gym.counterPool ?? ALL_IDS();
      for (let seed = 1; seed <= 6; seed++) {
        const player = buildLegalTeam(gym.format, STRONG_POOL, seed, { level: cap });
        const baseEnemy = buildLegalTeam(gym.format, pool, seed * 7 + 1, { level: cap });
        expect(baseEnemy.length, `${gym.id}: base enemy fills`).toBe(5);
        const res = counterDraft(gym.format, player, baseEnemy, pool, seed * 101);
        // never starves the five and never bricks the format under the cap
        expect(res.enemy.length, `${gym.id} seed ${seed}: enemy stays full`).toBe(baseEnemy.length);
        expect(isLegalDraft(gym.format, res.enemy), `${gym.id} seed ${seed}: counter five legal`).toBe(true);
        expect(new Set(res.enemy.map((h) => h.heroId)).size, `${gym.id} seed ${seed}: no dup`).toBe(res.enemy.length);
        for (const h of res.enemy) {
          expect(h.level ?? 30, `${gym.id} seed ${seed}: ${h.heroId} within cap`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });

  it('levels a swapped-in counter to the format cap, not a hardcoded default (the enemyLevel bug)', () => {
    const frost = ALL_GYMS.find((g) => g.id === 'frost-gym')!; // a level-capped, last-pick gym
    const cap = formatLevelCap(frost.format)!;
    // a legal at-cap base five + a double-carry player so the last-pick lockdown fires
    const baseEnemy = buildLegalTeam(frost.format, ALL_IDS(), 7, { level: cap });
    const player = teamOf([...withRole('carry').slice(0, 2), ...withoutRole('carry').slice(0, 3)], cap);
    const res = counterDraft(frost.format, player, baseEnemy, ALL_IDS(), 4242);
    expect(res.swappedIn.length, 'a double-carry draws at least one counter').toBeGreaterThanOrEqual(1);
    // the regression: swapped-in heroes must be leveled to the cap (14), never the
    // old hardcoded 24/30 — which would have fielded an illegal over-cap counter.
    for (const id of res.swappedIn) {
      const slot = res.enemy.find((h) => h.heroId === id)!;
      expect(slot.level, `${id} swapped in at the cap`).toBe(cap);
    }
    expect(isLegalDraft(frost.format, res.enemy)).toBe(true);
  });

  it('never throws on starved or short inputs (the out-of-bounds swap-target crash)', () => {
    const frost = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    const player = teamOf(ALL_IDS().slice(0, 5), 14);
    // empty counter pool → nothing legal to swap to → unchanged, no throw
    expect(() => counterDraft(frost.format, player, frost.enemyTeam, [], 1)).not.toThrow();
    expect(counterDraft(frost.format, player, frost.enemyTeam, [], 1).swappedIn.length).toBe(0);
    // a pool of only-invalid ids → no legal counter, no throw
    expect(() => counterDraft(frost.format, player, frost.enemyTeam, ['not-a-hero', 'nope'], 2)).not.toThrow();
    // a short (single-hero) base enemy still resolves without indexing past the array
    expect(() => counterDraft(frost.format, player, teamOf([ALL_IDS()[0]], 14), ALL_IDS(), 3)).not.toThrow();
  });

  it('mirror-shape falls back to the base five when the pool cannot fill (never an empty team)', () => {
    const fmt: DraftFormat = { rules: [{ kind: 'level-cap', max: 14 }], counterDraft: 'mirror-shape' };
    const player = teamOf(ALL_IDS().slice(0, 5), 14);
    const base = teamOf(ALL_IDS().slice(5, 10), 14);
    const res = counterDraft(fmt, player, base, [], 9);
    expect(res.enemy.length).toBe(5);
    expect(res.enemy.map((h) => h.heroId)).toEqual(base.map((h) => h.heroId));
  });
});

describe('Captains Series ban loop stays legal/capped/crash-free (PROGRESSION §3.1–§3.2)', () => {
  it('a hell-tier series over a deep roster never fields a banned/duplicate five and stays re-fightable', () => {
    for (const gym of ALL_GYMS) {
      const cap = formatLevelCap(gym.format) ?? 30;
      const five: GymMatchHero[] = buildLegalTeam(gym.format, STRONG_POOL, 5, { level: cap, items: () => STRONG_ITEMS })
        .map((h) => ({ heroId: h.heroId, level: cap, items: STRONG_ITEMS, gambits: AGGRO }));
      const fight = new LiveGymFight(gym, five, 13, { playerRoster: STRONG_POOL, tier: 'hell' });
      expect(() => fight.runHeadless(), `${gym.id}: hell series resolves`).not.toThrow();

      const player = fight.currentPlayerFive();
      expect(player.length, `${gym.id}: full player five`).toBe(5);
      expect(new Set(player).size, `${gym.id}: unique player five`).toBe(5);
      for (const id of player) expect(fight.bannedHeroes.has(id), `${gym.id}: ${id} fielded despite ban`).toBe(false);
      expect(fight.currentEnemyFive().length, `${gym.id}: full enemy five`).toBe(5);

      // a loss is never a wall: the surviving roster can still field a legal five (§3.1 floor)
      const remaining = STRONG_POOL.filter((id) => !fight.bannedHeroes.has(id));
      expect(formatSatisfiable(gym.format, remaining), `${gym.id}: re-fightable after bans`).toBe(true);
    }
  }, 120000);

  it('after max pre-bans, a counter-draft against the survivors is still legal and capped', () => {
    const gym = ALL_GYMS.find((g) => g.id === 'frost-gym')!;
    const cap = formatLevelCap(gym.format)!;
    const bans = pickEnemyBans(gym.format, STRONG_POOL, [], 99, STRONG_POOL.slice(0, 5), 7);
    const survivors = STRONG_POOL.filter((id) => !bans.includes(id));
    expect(formatSatisfiable(gym.format, survivors)).toBe(true);
    const player = buildLegalTeam(gym.format, survivors, 3, { level: cap });
    const baseEnemy = buildLegalTeam(gym.format, survivors, 11, { level: cap });
    const res = counterDraft(gym.format, player, baseEnemy, survivors, 31);
    expect(res.enemy.length).toBe(5);
    expect(isLegalDraft(gym.format, res.enemy)).toBe(true);
    for (const h of res.enemy) expect(h.level ?? 30).toBeLessThanOrEqual(cap);
  });
});

describe('asymmetric ban loop reaches the auto-resolve + Elite paths (PROGRESSION §3.1/§3.5)', () => {
  const gym = ALL_GYMS[0];
  const five: GymMatchHero[] = STRONG_POOL.slice(0, 5).map((heroId) => ({ heroId, level: 30, items: STRONG_ITEMS, gambits: AGGRO }));

  it('runGymMatch forwards the ban loop: a deep roster gets pre-bans the bare five never sees', () => {
    const noLoop = new LiveGymFight(gym, five, 7);
    expect(noLoop.banLoopActive).toBe(false);
    expect(noLoop.bannedHeroes.size).toBe(0);

    // the auto-resolve helper now activates the loop when a roster + tier are supplied
    const withLoop = new LiveGymFight(gym, five, 7, { autoPlayer: true, playerRoster: STRONG_POOL, tier: 'normal' });
    expect(withLoop.banLoopActive).toBe(true);
    expect(withLoop.bannedHeroes.size).toBe(TUNING.captainsSeries.enemyPreBansByDifficulty.normal);
    expect(() => runGymMatch(gym, five, 7, undefined, { playerRoster: STRONG_POOL, tier: 'normal' })).not.toThrow();
  });

  it('Elite knobs: +eliteHarderPreBan pre-bans over the gym tier and the repick budget locks to 0', () => {
    const seed = 31;
    const baseTier = new LiveGymFight(gym, five, seed, { playerRoster: STRONG_POOL, tier: 'normal' });
    const elite = new LiveGymFight(gym, five, seed, {
      playerRoster: STRONG_POOL,
      tier: 'normal',
      extraPreBans: TUNING.captainsSeries.eliteHarderPreBan,
      repickBudgetOverride: 0
    });

    // a deep, role-diverse roster leaves headroom, so the extra pre-ban actually lands
    expect(elite.bannedHeroes.size).toBe(baseTier.bannedHeroes.size + TUNING.captainsSeries.eliteHarderPreBan);
    expect(baseTier.repickBudget).toBe(repicksAllowed('normal'));
    expect(elite.repickBudget).toBe(0);
    expect(elite.requestRepick(0, STRONG_POOL.at(-1)!)).toBe(false); // locked draft
  });

  it('a bonus Captain Call (refightCaptainCall) raises only the player side', () => {
    const fight = new LiveGymFight(gym, five, 5, { playerRoster: STRONG_POOL, tier: 'normal', playerBonusCaptainCalls: 2 });
    expect(fight.playerCaptain.remaining).toBe(TUNING.captainCallsPerFight + 2);
    expect(fight.enemyCaptain.remaining).toBe(TUNING.captainCallsPerFight + (gym.enemyBonusCaptainCalls ?? 0));
  });
});

describe('World Level threads boss/raid combat + loot together (PROGRESSION §4.3)', () => {
  const party: MacroHeroSetup[] = STRONG_POOL.slice(0, 5).map((heroId) => ({ heroId, level: 30, items: STRONG_ITEMS }));

  it('a higher featured World Level scales the boss HP/damage columns', () => {
    const boss = ALL_BOSSES[0];
    const flat = bossFightSetupFromDef(boss, party, 'normal', 1, 0);
    const dialed = bossFightSetupFromDef(boss, party, 'normal', 1, TUNING.worldLevel.cap);
    expect(dialed.boss.hpScale).toBeGreaterThan(flat.boss.hpScale);
    expect(dialed.boss.damageScale).toBeGreaterThan(flat.boss.damageScale);
  });

  it('a higher featured World Level scales the raid HP/damage columns', () => {
    const raid = ALL_RAIDS[0];
    const flat = raidSetupFromDef(raid, party, 'normal', 1, 0);
    const dialed = raidSetupFromDef(raid, party, 'normal', 1, TUNING.worldLevel.cap);
    expect(dialed.boss.hpScale).toBeGreaterThan(flat.boss.hpScale);
    expect(dialed.boss.damageScale).toBeGreaterThan(flat.boss.damageScale);
  });

  it('a higher featured World Level makes the same domain fight a longer clear', () => {
    const domain = ALL_DOMAINS[0];
    const run = (worldLevel: number) =>
      runDomainEncounter({ seed: 4242, party, boss: domain.encounter, worldLevel, clear: domain.clear });
    const flat = run(0);
    const dialed = run(TUNING.worldLevel.cap);
    expect(flat.cleared).toBe(true);
    expect(dialed.cleared).toBe(true);
    // The dialed boss carries the WL HP column, so the clear takes strictly longer.
    expect(dialed.timeSec).toBeGreaterThan(flat.timeSec);
  });
});

describe('Trainer meta board: purchase + runtime effects (PROGRESSION §4.2)', () => {
  function trainerSave(): GameSave {
    const save = newGameSave('juggernaut');
    save.trainerXp = 50000;
    save.trainerLevel = 6;                       // clears the requiresTrainerLevel gates
    save.badges = ['lunar-badge', 'frost-badge', 'burrow-badge', 'tide-badge'];
    return save;
  }

  it('spends Trainer XP, never drops Trainer Level, and refuses a second purchase', () => {
    const g = Game.headless(trainerSave());
    const node = META_NODES_BY_ID['merchant-favor'];
    const xpBefore = g.trainerXp;
    const levelBefore = g.trainerLevel;
    expect(g.buyMetaNode('merchant-favor')).toBe(true);
    expect(g.trainerXp).toBe(xpBefore - node.cost);
    expect(g.trainerLevel).toBe(levelBefore);    // high-water mark, spending never un-levels
    expect(g.metaBonus('merchantRefresh')).toBe(1);
    expect(g.buyMetaNode('merchant-favor')).toBe(false); // already owned
  });

  it('gates a node behind its Trainer Level and refuses when XP is short', () => {
    const save = trainerSave();
    save.trainerLevel = 2;                        // below ascendant-ii's requirement of 4
    const g = Game.headless(save);
    expect(g.buyMetaNode('ascendant-ii')).toBe(false);
    const poor = trainerSave();
    poor.trainerXp = 10;
    const g2 = Game.headless(poor);
    expect(g2.buyMetaNode('wider-entourage')).toBe(false);
  });

  it('wider-entourage raises the fielded-creep cap at runtime', () => {
    const g = Game.headless(trainerSave());
    expect(g.entourageMax()).toBe(TUNING.entourageMax);
    expect(g.buyMetaNode('wider-entourage')).toBe(true);
    expect(g.entourageMax()).toBe(TUNING.entourageMax + 1);
  });

  it('fast travel stays locked until Wayfinder is purchased', () => {
    const g = Game.headless(trainerSave());
    expect(g.fastTravelToWaypoint('any-waystone')).toBe(false);
    expect(g.toasts.at(-1)!.text.toLowerCase()).toContain('locked');
    expect(g.buyMetaNode('wayfinder')).toBe(true);
    expect(g.metaBonus('fastTravel')).toBe(1);
  });

  it('catchSpeed shortens the overworld capture channel multiplier', () => {
    const g = Game.headless(trainerSave());
    expect(g.sim.captureChannelMult).toBe(1);
    expect(g.buyMetaNode('tamer-hands')).toBe(true);
    expect(g.sim.captureChannelMult).toBeLessThan(1);
  });

  it('the World Level dial setter clamps to what badges + Trainer Level unlock and persists', () => {
    const g = Game.headless(trainerSave());
    const max = g.worldLevelDialMax();
    expect(max).toBeGreaterThan(0);
    expect(g.setWorldLevelTier(99)).toBe(true);
    expect(g.worldLevelDialView().tier).toBe(max);
    expect(g.buildSave().worldLevelTier).toBe(max);
    expect(g.setWorldLevelTier(-5)).toBe(true);
    expect(g.worldLevelDialView().tier).toBe(0);
  });
});

describe('Game path: committing + starting every gym keeps the live counter-draft legal', () => {
  function fullSave(ids: string[]) {
    const save = newGameSave(ids[0]);
    const template = structuredClone(save.roster[0]);
    save.party = ids.slice(0, 5);
    save.recruited = [...new Set([...ids, ...save.recruited])];
    save.roster = ids.map((heroId) => ({ ...structuredClone(template), heroId, level: 30 }));
    return save;
  }

  it('drafts a cap-legal five into each gym and the live counter-draft never bricks the run', () => {
    for (const gym of ALL_GYMS) {
      const cap = formatLevelCap(gym.format) ?? 30;
      const draftHeroes: MacroHeroSetup[] = buildLegalTeam(gym.format, STRONG_POOL, 5, { level: cap, items: () => STRONG_ITEMS })
        .map((h) => ({ heroId: h.heroId, level: cap, items: STRONG_ITEMS }));
      const game = Game.headless(fullSave(STRONG_POOL));
      expect(() => {
        game.commitGymDraft(gym.id, { heroes: draftHeroes, formation: { placements: {} } });
        game.startLiveGym(gym.id);
      }, `${gym.id}: commit + start should not throw`).not.toThrow();

      const cd = game.lastCounterDraft;
      if (cd) {
        expect(cd.enemy.length, `${gym.id}: live enemy full`).toBe(5);
        expect(isLegalDraft(gym.format, cd.enemy), `${gym.id}: live enemy legal`).toBe(true);
        for (const h of cd.enemy) {
          expect(h.level ?? 30, `${gym.id}: live enemy within cap`).toBeLessThanOrEqual(cap);
        }
      }
    }
  });
});
