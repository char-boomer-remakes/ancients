import { test, expect } from '@playwright/test';
import { boot, clearCinematics, state, expectPartyWellFormed, watchPageErrors, expectNoPageErrors } from './helpers';

// PROGRESSION_OVERHAUL §2/§5/§6 — proven end-to-end in the real browser build.
//
// These cover the loops the recent bug-fix pass touched but that no e2e exercised:
//   - the shared-wallet party XP split (a kill feeds the WHOLE party, not just the
//     active hero),
//   - the World Level reward multiplier (a featured-encounter kill pays more), and
//   - state integrity through a chaotic fight (no NaN/over-cap corruption).
// They drive the live Game through the ?test harness (window.__test / __game).

test.describe('progression — World Level & party rewards', () => {
  test('a single kill distributes XP across the whole party (active + bench)', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 4242 });
    await clearCinematics(page);

    const r = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.fillParty({ level: 4 });
      t.skipCinematics(); // recruiting heroes can queue cut-scenes that pause update()
      t.healParty();

      const xp = () => g.party.map((rec: any) => (rec.unit ? rec.unit.xp : rec.xp));
      const before = xp();
      const activeIdx = g.activeIdx;
      const a = g.activeUnit();

      // Drop a handful of wild creeps and slay ONLY those (snapshot uids first so we
      // don't credit the region's ambient packs and accidentally cap the hero).
      const pre = new Set(g.sim.unitsArr.filter((u: any) => u.alive && u.team !== a.team).map((u: any) => u.uid));
      t.spawnWildCreepNearActive({ count: 6 });
      const fresh = g.sim.unitsArr.filter((u: any) => u.alive && u.team !== a.team && !pre.has(u.uid));
      let killed = 0;
      for (const c of fresh) { g.sim.killUnit(c, a); killed++; }
      t.fastForward(0.5); // drain + route the queued kill-credit events

      const after = xp();
      const deltas = after.map((v: number, i: number) => v - before[i]);
      const benchGain = deltas.filter((_: number, i: number) => i !== activeIdx).reduce((a: number, b: number) => a + b, 0);
      return { size: g.party.length, killed, activeDelta: deltas[activeIdx], benchGain, total: deltas.reduce((a: number, b: number) => a + b, 0) };
    });

    expect(r.size).toBeGreaterThanOrEqual(3);
    expect(r.killed).toBeGreaterThan(0);
    expect(r.activeDelta, 'the active hero banked XP from its kills').toBeGreaterThan(0);
    // The shared wallet must reach the bench, not just the active hero (§6).
    expect(r.benchGain, 'bench/participant heroes shared in the XP').toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(r.activeDelta);

    expectNoPageErrors(errors);
  });

  test('a higher encounter World Level pays a bigger bounty (§2.3 reward multiplier)', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 7 });
    await clearCinematics(page);

    const r = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      // Keep the active hero low-level so reward XP banks cleanly (no cap overflow).
      t.healParty();
      const active = () => g.activeUnit();

      // Reward XP scales with the encounter World Level, so an isolated kill of the
      // *same* creep at a higher WL must bank more XP into the killer. We kill ONLY
      // the freshly-spawned creep (uid snapshot) so ambient packs never cap the hero.
      const measureKillXp = (wl: number): number => {
        const a = active();
        const pre = new Set(g.sim.unitsArr.filter((u: any) => u.alive && u.team !== a.team).map((u: any) => u.uid));
        t.spawnWildCreepNearActive({ count: 1 });
        const creep = g.sim.unitsArr.find((u: any) => u.alive && u.team !== a.team && !pre.has(u.uid));
        if (!creep) return -1;
        creep.encounterWorldLevel = wl; // §2.3: featured WL lifts the reward

        const xpBefore = a.xp;
        g.sim.killUnit(creep, a);
        t.step(); t.step(); // drain + route the kill-credit (minimal sim noise)
        return active().xp - xpBefore;
      };

      const low = measureKillXp(0);
      const high = measureKillXp(8); // WL cap (TUNING.worldLevel.cap)
      return { low, high };
    });

    expect(r.low).toBeGreaterThan(0);
    expect(r.high).toBeGreaterThan(0);
    expect(r.high).toBeGreaterThan(r.low); // the WL reward multiplier is live
  });

  test('the party stays well-formed through a chaotic fastForwarded fight', async ({ page }) => {
    await boot(page, { hero: 'sven', seed: 99 });
    await clearCinematics(page);

    await page.evaluate(() => {
      const t = (window as any).__test;
      t.fillParty({ level: 12 });
      t.skipCinematics(); // recruiting heroes can queue cut-scenes that pause update()
      t.healParty();
      t.spawnWildCreepNearActive({ count: 6 });
    });

    // Step the sim through the brawl in chunks; corruption (NaN/over-cap HP/mana,
    // living-at-zero) would surface as a party-invariant violation.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => (window as any).__test.fastForward(1.5));
      await expectPartyWellFormed(page, `combat step ${i}`);
    }
  });
});

test.describe('progression — basic boot sanity', () => {
  test('a fresh game boots with a live, well-formed party in a real region', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'crystal-maiden', seed: 1 });
    await clearCinematics(page);

    const s = await state(page);
    expect(s.ready).toBe(true);
    expect(s.regionId).toBeTruthy();
    expect(s.party.length).toBeGreaterThanOrEqual(1);
    expect(s.party[0].alive).toBe(true);
    expect(s.party[0].maxHp).toBeGreaterThan(0);
    await expectPartyWellFormed(page, 'fresh boot');

    expectNoPageErrors(errors);
  });
});
