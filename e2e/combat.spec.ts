import { test, expect } from '@playwright/test';
import { boot, clearCinematics } from './helpers';

// The cast pipeline (actions.ts / gestures.ts / combat.ts) changed a lot in the
// recent passes, but the only existing ability coverage just checked "casting
// doesn't throw". This proves the real contract: an active cast deducts mana,
// starts its cooldown, is blocked while on cooldown, and recovers afterward.
test.describe('combat — ability mana & cooldown', () => {
  test('an active cast deducts mana, goes on cooldown, then recovers', async ({ page }) => {
    await boot(page, { hero: 'crystal-maiden', seed: 31 });
    await clearCinematics(page);

    const r = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addXp(120_000); // max level so every ability is learned
      const u = g.activeUnit();
      const sim = g.sim;
      const point = { x: u.pos.x + 250, y: u.pos.y };

      // Find the first learned ability that actually fires an active cast:
      // cast it and keep the one whose cooldown advances past now (skips
      // passives/toggles and target-only abilities that no-op on a bare point).
      let slot = -1;
      let manaBefore = 0;
      let manaAfter = 0;
      for (let i = 0; i < u.abilities.length; i++) {
        if (u.abilities[i].level <= 0) continue;
        u.mana = u.stats.maxMana;
        if (!u.abilityReady(i, sim.time).ok) continue;
        const mb = u.mana;
        g.castAbility(i, { point });
        t.fastForward(0.7);
        if (u.abilities[i].cooldownUntil > sim.time) {
          slot = i;
          manaBefore = mb;
          manaAfter = u.mana;
          break;
        }
      }
      if (slot < 0) return { slot };

      const onCooldown = u.abilities[slot].cooldownUntil > sim.time;
      const recastReady = u.abilityReady(slot, sim.time);

      // Top mana back up and wait out the cooldown; it should arm again.
      u.mana = u.stats.maxMana;
      t.fastForward(40);
      const readyAgain = u.abilityReady(slot, sim.time);

      return { slot, manaBefore, manaAfter, onCooldown, recastReason: recastReady.reason ?? null, recastOk: recastReady.ok, readyAgainOk: readyAgain.ok };
    });

    expect(r.slot).toBeGreaterThanOrEqual(0);
    expect(r.manaAfter).toBeLessThan(r.manaBefore!); // mana was spent
    expect(r.onCooldown).toBe(true);
    expect(r.recastOk).toBe(false); // blocked while on cooldown
    expect(r.recastReason).toBe('cooldown');
    expect(r.readyAgainOk).toBe(true); // recovered after the cooldown elapsed
  });
});

// The mana/cooldown test above proves the *bookkeeping* of a cast, but never that
// a spell actually lands an effect on an enemy — which is exactly the "spell usage
// is buggy" surface. This stages a live hostile next to the hero, suppresses the
// hero's basic attacks (so any change to the enemy is attributable to spells), and
// fires every learned ability at it, asserting the barrage both deals damage and
// applies at least one status/elemental aura. It's hero-agnostic in shape but uses
// Crystal Maiden because her kit reliably nukes + chills.
test.describe('combat — spells land effects on a live enemy', () => {
  test('an offensive barrage damages and debuffs a staged hostile', async ({ page }) => {
    await boot(page, { hero: 'crystal-maiden', seed: 4242 });
    await clearCinematics(page);

    const r = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addXp(120_000); // max hero level...
      const hero = g.activeUnit();
      const sim = g.sim;
      hero.autoLevelAbilities(); // ...addXp only sets level/xp; this learns the kit
      hero.refresh(sim.time);
      t.skipCinematics();
      const spawn = t.spawnWildCreepNearActive({ count: 1 });

      // Locate the freshly staged hostile: the region already holds camp creeps, so
      // pick the live enemy NEAREST the hero rather than the first in the array.
      const d2 = (u: any) => (u.pos.x - hero.pos.x) ** 2 + (u.pos.y - hero.pos.y) ** 2;
      const enemy = sim.unitsArr
        .filter((u: any) => u.alive && u.team !== hero.team && u.kind !== 'npc')
        .sort((a: any, b: any) => d2(a) - d2(b))[0];
      if (!enemy) return { found: false, spawn };

      const enemyUid = enemy.uid;
      const enemyMaxHp = enemy.stats.maxHp;

      let damagedCasts = 0;      // casts that reduced the enemy's hp
      let statusCasts = 0;       // casts that applied a status or elemental aura
      let activeCasts = 0;       // abilities that actually fired (mana spent / cooldown started)
      let minHpFraction = 1;

      const auraCount = (u: any) => Object.keys(u.elementAuras ?? {}).length;

      for (let i = 0; i < hero.abilities.length; i++) {
        if (hero.abilities[i].level <= 0) continue;

        // Isolate each cast: refill mana, suppress the hero's basic attack, and
        // restore the enemy so per-cast deltas are attributable to the spell.
        hero.mana = hero.stats.maxMana;
        hero.nextAttackReadyAt = sim.time + 1e9; // actions.ts gates autos on this
        enemy.hp = enemyMaxHp;
        enemy.alive = true;
        // Pin the target a fixed, in-range distance from the hero so a fleeing
        // wild creep can't drift out of cast range between iterations.
        enemy.pos = { x: hero.pos.x + 160, y: hero.pos.y };
        const statusesBefore = enemy.statuses.length + auraCount(enemy);
        const manaBefore = hero.mana;

        if (!hero.abilityReady(i, sim.time).ok) continue; // skip passives/toggles
        g.castAbility(i, { uid: enemyUid, point: { x: enemy.pos.x, y: enemy.pos.y } });
        t.skipCinematics(); // a first-blood/resonance stinger would otherwise freeze the sim
        t.fastForward(0.8);

        const fired = hero.abilities[i].cooldownUntil > sim.time || hero.mana < manaBefore;
        if (!fired) continue; // nothing was actually spent (e.g. self-buff no-op)
        activeCasts++;
        const hpFraction = enemy.alive ? enemy.hp / enemyMaxHp : 0;
        if (hpFraction < 1) damagedCasts++;
        if (enemy.statuses.length + auraCount(enemy) > statusesBefore) statusCasts++;
        if (hpFraction < minHpFraction) minHpFraction = hpFraction;
      }

      return { found: true, spawn, activeCasts, damagedCasts, statusCasts, minHpFraction };
    });

    expect(r.found).toBe(true);
    expect(r.spawn?.hostiles).toBe(1);
    expect(r.activeCasts).toBeGreaterThan(0);     // some ability actually fired
    expect(r.damagedCasts).toBeGreaterThan(0);    // a spell dealt damage to the enemy
    expect(r.statusCasts).toBeGreaterThan(0);     // a spell applied a status / elemental aura
    expect(r.minHpFraction!).toBeLessThan(0.95);  // damage was meaningful, not a rounding blip
  });
});
