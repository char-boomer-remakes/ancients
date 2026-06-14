# GAMEPLAY 2.0 REHAUL: shipped balance, loot pacing, and smarter AI

This document is now the implementation record for the Gameplay 2.0 pass. The original proposal asked for deliberate loot pacing, depth-aware combat, broader AI item use, and economy backstops. The code has caught up: the systems below are live in the headless core and guarded by focused tests.

The core boundary still holds. `src/core/` remains deterministic, renderer-free, and seed-driven. The shipped work is mostly data and wiring: `TUNING` values, multi-slot drop tables, tier-aware roll sites, scorer weights, and tests that make the balance contracts visible.

Status of record stays in `PROGRESS.md`. This file explains the shipped design and the remaining follow-up work.

---

## 0. Final Status

### Shipped pillars

| Pillar | Shipped contract | Main code and tests |
|--------|------------------|---------------------|
| Loot heartbeat | One Legendary+ stream per depth band, with late game faster than early game | `TUNING.loot`, `TUNING.overworldEgSlotPct`, `src/test/loot-pacing.test.ts` |
| Drop tables 2.0 | Creeps, echoes, bosses, raids, and dungeons use the multi-slot drop engine with tier, quality, rarity split, and pity where relevant | `rollItemDrops`, `rollLoot`, `DEFAULT_CREEP_DROP_TABLES`, `src/test/phase3-systems.test.ts`, `src/test/dungeon.test.ts` |
| Combat scaling | Overworld creeps scale by region and combat tier; boss armor tier applies; cleave respects armor | `creepCombatScale`, `creepCombatTier`, `applyBossArmorTier`, `cleaveIgnoresArmor`, `src/test/combat-scaling.test.ts` |
| AI polish | Item-active fallback, mana discipline, ult holding, combo sequencing, and centralized scorer knobs are live | `scoreItemByIntent`, `manaAdjustedScore`, `finalAbilityScore`, `comboAdjustedScore`, `src/test/utility-ai.test.ts`, `src/test/reactive-ai.test.ts` |
| Economy backstops | Loot Marks, essence, quality upgrades, Legendary assembly, resin dry loot, and Tinker's Bench reclaim are wired | `blackMarketRedeemLootMark`, `assembleLegendary`, `spendResinForLoot`, `reclaimNeutral`, `src/test/economy.test.ts` |

### Remaining follow-ups

The remaining gaps against the original doc are small and well bounded:

- Cluster targeting uses spatial broadphase, but the cluster picker still compares candidate neighborhoods. Good enough for current tests, still worth a dedicated grid-native pass before summon-heavy encounters grow further.
- Gambling has behavior tests, but no dedicated long-run pacing sim that proves gold-to-Legendary conversion stays near the band floor.
- Essence and quality upgrades have path tests, but no rate-parity sim that proves Progress drops salvage into upgrades at the target rhythm.
- A few small assertions would make the contract sharper: cleave armor mitigation, an explicit unaffordable-cast case, and boss healer targeting.

---

## 1. Loot Pacing: The Heartbeat

The shipped model is faster than the first draft. The original 28/18/11 minute hypothesis was replaced by live floors in `TUNING.loot.egCadenceMinByBand`:

```ts
egCadenceMinByBand: { early: 6, mid: 4, late: 2 }
```

Read that as the headline player promise: a single focused activity should produce a Legendary+ item on a 2-6 minute cadence, with late regions paying faster. Mixed routes can run faster, and the loot-pacing test keeps that ceiling controlled.

`src/test/loot-pacing.test.ts` is the authority for the shipped cadence. It checks:

- The Legendary / Immortal / Arcana split inside EG events.
- Representative overworld farming rates for early, mid, and late bands.
- Boss, raid, and dungeon faucets in the late-band matrix.
- A mixed late-game route and a compounded-faucet ceiling.

### 1.1 Felt tiers

| Felt tier | Rarities | Role in pacing |
|-----------|----------|----------------|
| Chaff | common, uncommon | Consumables, gems, and basic components. Background drops only. |
| Progress | rare, mythical | Components and recipe progress. Feeds assembly and essence. |
| Endgame | legendary | Completed build-defining cores. This is the main cadence target. |
| Chase | immortal, arcana | Rare spikes inside the EG stream, rolled through the same timer. |

### 1.2 Rarity split

Every split-aware EG slot rolls the band rarity first, then picks from matching entries where possible:

| Band | Legendary | Immortal | Arcana |
|------|-----------|----------|--------|
| Early | 95% | 5% | 0% |
| Mid | 90% | 9.5% | 0.5% |
| Late | 84% | 15% | 1% |

The implementation lives in `rollEgRarity` and `pickDropEntry` in `src/core/phase3.ts`. Tables opt in with `raritySplit: true`.

### 1.3 Quality at the source

Drops can arrive pre-qualified. Creep and echo EG slots use `qualityOddsByTier()`:

| Tier | Non-Standard chance | Distribution |
|------|---------------------|--------------|
| normal | 8% | mostly Genuine and Frozen |
| nightmare | 18% | more Inscribed, with small Corrupted and Unusual chances |
| hell | 30% | highest source quality chance |

Bosses and raids carry their own `qualityOdds`. The tests in `phase3-systems`, `economy`, `dungeon`, and `marquee` assert that the data is present and rolls upgraded copies on seeded samples.

### 1.4 Hard pity across activities

Loot Marks are the cross-activity floor. Progress+ item drops and boss or raid clears award marks by current loot band. Redeeming `TUNING.loot.bandMarkQuota` marks grants a bound band-appropriate Legendary through the Black Market.

```ts
bandMarkQuota: { early: 24, mid: 18, late: 12 }
```

One implementation detail matters: creep item drops land on the ground, so their item-based marks accrue when the player picks the item up. Echo, boss, raid, quest, and stash-delivered drops award marks immediately.

---

## 2. Drop Tables 2.0

The project now uses the multi-slot drop engine that already existed. `rollItemDrops(table, tier, dryStreaks, rng, band, opts)` supports guaranteed items, ordered slots, tiered chances, quality odds, rarity split, source tags, and pity. The pass was a data and call-site job.

### 2.1 Live source matrix

| Source | Progress drops | Legendary+ drops | Notes |
|--------|----------------|------------------|-------|
| Small creep | consumables and chipped gems | none | background farming |
| Medium creep | consumables, gems, early components | none | early progression |
| Large creep | early components and gems | `0.15 / 0.25 / 0.35` by normal/nightmare/hell | split-aware EG slot |
| Ancient creep | rare and mythical components | `0.20 / 0.32 / 0.46` by tier | best overworld EG faucet |
| Owned-hero echo | attribute-themed components | `0.03 / 0.045 / 0.06` by tier | delivered to Armory |
| Regional boss | themed component anchors | themed assembled pool with pity | banded rarity split |
| Raid | marquee component anchors | raid assembled pool with pity | raid-quality odds |
| Dungeon guardian | room and guardian rewards | guardian anchor with persisted pity | `dryStreaks` stored per dungeon |
| Black Market | recipe wheel | relic wheel, Loot Mark redemption | bound Legendary ceiling |

### 2.2 Tier-aware overworld drops

Overworld creep kills now pass the real region combat tier:

```ts
creepCombatTier(regionId): normal | nightmare | hell
```

That wakes up the `nightmare` and `hell` columns in `DEFAULT_CREEP_DROP_TABLES`. Early regions roll normal tables, mid-depth regions roll nightmare tables, and deep regions roll hell tables.

Dungeon guardian pity also persists. `grantDungeonRoomReward` reads `dungeonProgress[def.id].dryStreaks`, passes it to `rollItemDrops`, then writes back `roll.dryStreaks`. The regression test proves a `pity: 4` guardian slot carries across reward rolls.

### 2.3 Themed boss and raid pools

Boss and raid pools stay identity-driven. Agility bosses point toward Butterfly, Skadi, and other agi cores; strength bosses toward Heart, Cuirass, and BKB; intelligence bosses toward Scythe, Refresher, Aghanim's-style items, and caster cores. `economy.test.ts` checks representative boss themes and source reservations.

Gated prestige items still stay out of shops and gambling. `GATED_TOP_TIER` remains combat or special-source only.

---

## 3. Combat Scaling

Gameplay 2.0 made region depth matter in fights and rewards. The live combat knobs are centralized in `TUNING`:

```ts
applyBossArmorTier: true,
cleaveIgnoresArmor: false,
creepCombatScale: {
  hpByRegion: { /* 1.0 -> 4.2 */ },
  damageByRegion: { /* 1.0 -> 2.32 */ },
  tier: { normal: 1.0, nightmare: 1.5, hell: 2.1 }
}
```

### 3.1 Overworld creep scaling

`creepToBase` applies region and tier scale to wild creep HP and damage. Offensive creep ability values scale by the same damage factor while their geometry stays fixed. That keeps late-region camps relevant without turning every camp into a boss.

`src/test/combat-scaling.test.ts` checks:

- Region depth maps to normal, nightmare, and hell combat tiers.
- Late hell creeps gain the expected HP and damage multipliers.
- Offensive ability values scale while radius stays unchanged.
- Representative trash and ancient TTK stays in broad farming bands.
- A geared party clears a normal regional boss in the intended fight-length range.

### 3.2 Boss armor tier

`bossTierScale.armor` is live. Regional boss, raid, and dungeon guardian setup carry `armorScale`, and macro setup applies it through `externalMods.armor` when `TUNING.applyBossArmorTier` is true.

This gives Hell physical fights a real armor axis and makes shred, magic damage, and mixed damage matter.

### 3.3 Cleave armor

Cleave secondary hits now respect armor through `TUNING.cleaveIgnoresArmor: false`. Cleave remains strong against low-armor bodies, but it no longer bypasses the whole Hell armor budget.

### 3.4 Progression smoothing

The level and recruit gates were smoothed as part of the same pass:

```ts
xpCurve[1] = 230
recruitLevelCap: [18, 25, 30]
```

`levelFromXp(0)` now stays level 1, level 2 costs real XP, and badge-limited recruits have more room before the final cap.

---

## 4. AI Polish

The AI overhaul is now sharper and still data-driven. The scorer still uses utility, profiles, threat, focus, and boss phase logic. Gameplay 2.0 added broader item understanding, resource discipline, and centralized knobs.

### 4.1 Item-active fallback

The five hand-tuned item considers remain the trusted path for BKB, Force Staff, Glimmer, Mek, and Eul. Every other active item can now fall back through the same ability intent classifier used for spells.

`scoreItemByIntent` lets Blink, Rod of Atos, Diffusal Blade, Scythe of Vyse, and future active items score as escape, control, save, buff, nuke, or AoE tools through shared intent data. `reactive-ai.test.ts` covers representative non-whitelisted actives.

### 4.2 Mana discipline and ult holding

`manaAdjustedScore` discounts low-value expensive casts when the unit would fall below `TUNING.ai.manaFloorPct`. `abilityReady` still provides the hard affordance gate.

AoE ults also get hold-for-value behavior. At Nightmare+ AI depth, `finalAbilityScore` discounts an AoE ult when the target cluster is smaller than `TUNING.ai.holdClusterMin`. `utility-ai.test.ts` covers both mana conservation and ult holding.

### 4.3 Combo sequencing

Hero combo data now gives the scorer light ordering hints. A setup spell can raise the score of a follow-up ult inside `comboWindowSec`, scaled by AI depth. The test suite checks Earthshaker's Fissure into Echo Slam and validates combo data across the roster.

### 4.4 Centralized knobs and heuristic fixes

The AI constants that used to live inline now sit under `TUNING.ai`: caster bias, danger normalization, cluster radius, kite and zone margins, item ranges, boss score multipliers, raid-aware behavior, and combo weights.

The small heuristic fixes are also live:

- `dangerousScore` has one implementation in `utility.ts` and is imported by `controllers.ts`.
- `fight-time-gt` reads encounter-relative time through `encounterStartAt`.
- `enemies-within` filters through `enemyCandidate`, so it counts hostile combat units.
- `incoming-disable` checks whether the hard disable is actually aimed at the unit.
- Boss healer preference weights HP need, threat, and reach.

The perf follow-up is cluster selection. It uses spatial broadphase today, but the candidate comparison is still pairwise over nearby enemies.

---

## 5. Economy Backstops

The economy now gives dry streaks three exits: deterministic marks, essence quality upgrades, and specific Legendary assembly.

### 5.1 Relic wheel

The Black Market relic wheel spends escalating gold and vends bound assembled cores up to the Legendary ceiling:

```ts
relicWheelBaseCost: 2400
relicWheelStepCost: 450
relicRarityCeiling: 'legendary'
```

It vends up to Legendary and keeps Immortal, Arcana, and `GATED_TOP_TIER` items in combat or special sources. Relic copies can arrive pre-upgraded through `relicQualityOdds`, capped below Unusual.

### 5.2 Essence and quality

Salvage mints essence by rarity. Essence plus gold upgrades item quality one grade at a time through `TUNING.blackMarket.qualityUpgrade`.

The live quality ladder remains:

```text
standard -> genuine -> frozen -> inscribed -> corrupted -> unusual
```

Inscribed items keep growing through kill progress, so owned items continue absorbing loot after the first copy drops.

### 5.3 Legendary assembly

`legendaryAssemblyOptions` and `assembleLegendary` provide the deterministic route: hold the needed rare/mythical components, pay `assemblyEssence`, and craft a specific bound Legendary. Immortals and Arcana stay chase drops.

This gives Progress-tier components a clear job and gives the player a target when RNG misses the desired core.

### 5.4 Resin and reclaim

Resin is wired and defaults off:

```ts
resin.enabled: false
```

When enabled, boss, raid, dungeon guardian, domain, and leylines can spend resin for full loot. Empty resin converts rich repeat loot into reduced dry gold through `dryLootGoldPct` while still allowing the clear.

Tinker's Bench reclaim now charges `TUNING.tinkersBench.reclaimCost` and returns the neutral copy to the stash. The old free-reclaim gap is closed.

---

## 6. Live Tuning Block

The high-signal Gameplay 2.0 knobs live here:

```ts
// combat
applyBossArmorTier: true,
cleaveIgnoresArmor: false,
creepCombatScale: {
  hpByRegion: { /* tranquil-vale 1.0 ... mad-moon-crater 4.2 */ },
  damageByRegion: { /* tranquil-vale 1.0 ... mad-moon-crater 2.32 */ },
  tier: { normal: 1.0, nightmare: 1.5, hell: 2.1 }
},
recruitLevelCap: [18, 25, 30],

// loot
loot: {
  egCadenceMinByBand: { early: 6, mid: 4, late: 2 },
  egRaritySplit: {
    early: { legendary: 0.95, immortal: 0.05, arcana: 0.0 },
    mid: { legendary: 0.90, immortal: 0.095, arcana: 0.005 },
    late: { legendary: 0.84, immortal: 0.15, arcana: 0.01 }
  },
  qualityDropChance: { normal: 0.08, nightmare: 0.18, hell: 0.30 },
  bandMarkQuota: { early: 24, mid: 18, late: 12 }
},
overworldEgSlotPct: {
  largeCreep: { normal: 0.15, nightmare: 0.25, hell: 0.35 },
  ancientCreep: { normal: 0.20, nightmare: 0.32, hell: 0.46 },
  echo: { normal: 0.03, nightmare: 0.045, hell: 0.06 }
},

// AI
ai: {
  manaFloorPct: 0.18,
  manaConservationWeight: 0.5,
  holdClusterMin: 2,
  itemIntentFallback: true,
  comboWindowSec: 4,
  comboWeight: 1.25
},

// economy
blackMarket: {
  relicWheelBaseCost: 2400,
  relicWheelStepCost: 450,
  relicRarityCeiling: 'legendary',
  assemblyEssence: 10
},
tinkersBench: { reclaimCost: 150 },
resin: { enabled: false }
```

---

## 7. Acceptance

Gameplay 2.0 is accepted when these remain green:

```bash
npm run typecheck
npm test
npm run build
```

Focused contracts:

| Contract | Test file |
|----------|-----------|
| Loot pacing and EG ceiling | `src/test/loot-pacing.test.ts` |
| Creep scaling and TTK bands | `src/test/combat-scaling.test.ts` |
| Drop engine, tier odds, boss armor | `src/test/phase3-systems.test.ts` |
| Dungeon guardian pity | `src/test/dungeon.test.ts` |
| Black Market, Loot Marks, assembly, resin, reclaim | `src/test/economy.test.ts` |
| Mana discipline, ult holding, combo sequencing | `src/test/utility-ai.test.ts` |
| Reactive item use and incoming-disable geometry | `src/test/reactive-ai.test.ts` |
| Encounter-relative gambits | `src/test/gambit-ai.test.ts` |
| Boundary guard | `src/test/boundary.test.ts` |

### Remaining acceptance tests worth adding

- A `gamble-pacing` sim that checks relic-wheel gold-to-Legendary conversion against the band floor.
- An essence parity sim that checks Progress-tier salvage converts into quality upgrades at the intended rate.
- A small cleave-armor unit test.
- An explicit unaffordable-cast assertion beside the existing mana-conservation test.
- A boss healer targeting test for the HP/threat/reach weighting.

---

## 8. Risks and Balance Notes

Loot pacing is locked by simulation. If the player-facing cadence feels off, move the constants and update the pacing sim together.

Mixed routes are intentionally faster than one repeated activity. The ceiling test is the guardrail. If late routes start raining loot, tune the compounded ceiling before nerfing every source.

Creep scaling and cleave armor are the changes players will feel first. They make late regions and Hell-tier armor matter. Keep any future changes tied to TTK tests so the feel stays measurable.

The item-active fallback is broad by design. A few odd active items may need hand-tuned overrides, but the fallback gives new catalog items useful behavior on day one.

Resin remains opt-in. It is a pacing lever for repeat rich content while default progression stays open.
