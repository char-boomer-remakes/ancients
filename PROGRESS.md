# PROGRESS

Read this first each session, then `DECISIONS.md`, then run `npm test`.

## Current phase: 2 — Systems (PASSING)

### Phase 1 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | `npm run dev` → pick a starter | PASS |
| 2 | Kill and catch a kobold | PASS |
| 3 | Field it as a companion | PASS |
| 4 | Buy and use Blink | PASS |
| 5 | Swap heroes mid-fight | PASS |
| 6 | Manual-save to a slot, reload, state intact | PASS |
| 7 | Tests: data lint | PASS |
| 8 | Tests: core boundary check (no three/DOM in core) | PASS |
| 9 | Tests: synthetic-hero sim | PASS |
| 10 | Tests: fixed-seed 5v5 headless, same winner every run | PASS |
| 11 | Tests: capture + merge unit tests | PASS |
| 12 | 60-second demo script below | PASS |

### 60-second demo script

1. Run `npm run dev`, open the local Vite URL, click **New Game**, then pick Juggernaut.
2. In Dawnshade, press `B`, open **Components**, buy **Blink Dagger**, close the shop, and press `Z` at the cursor to blink.
3. Right-click Pudge just north of town to recruit him, then press `2` to swap to Pudge and `1` to swap back after the cooldown.
4. Move northeast to the tutorial kobold camp. Right-click a kobold to fight it, weaken one below 30% HP, hover/select it, then press `T` to channel the Binding Totem until capture completes.
5. Press `Tab`, click **Field** on the captured Kobold, close the party panel, and watch it follow/fight as an AI companion.
6. Press `M` to show map mode markers, then press `Esc` → save to Slot 1 → load Slot 1. Gold, position, party, inventory, caught creeps, and fielded companion remain intact.

### Phase 2 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | Gyms 1–2 beatable end-to-end with player-authored gambits | PASS |
| 2 | Echo kill visibly unlocks a talent branch | PASS |
| 3 | All 6 recruitment trials completable | PASS |
| 4 | Tests: silence interrupts channel | PASS |
| 5 | Tests: BKB blocks stun | PASS |
| 6 | Tests: Euls disjoints projectile | PASS |
| 7 | Data lint covers grown roster | PASS |

### Phase 2 demo script

1. Run `npm run dev`, start a new game, recruit enough Vale heroes by right-clicking them three times to Find → Trial → Bind, then defeat their Binding Echoes.
2. Press `Tab`, set a few hero gambits to **Aggro** or **Safe**, and note echo progress/facet controls in the party panel.
3. Fight a hero echo marker on the map; killing an owned hero echo unlocks facet swapping and the next opposite talent branch.
4. Travel through the northern Tranquil Vale gate with `G` into Nightsilver Woods, recruit/fight regional heroes, and challenge the Lunar Gym with `G` at its marker.
5. After the Lunar Badge, use the Frost Road gate to Icewrack, then challenge the Frost Gym.
6. Save/load via `Esc`; badges, region, quests, gambits, echo progress, party, and inventory persist.

## Session log

- 2026-06-12: Project bootstrapped (Vite + TS + vitest + three). Core sim, data, tests, engine, UI under construction.
- 2026-06-12: Phase 1 acceptance pass: `npm test` (8 files, 166 tests) and `npm run build` green; browser smoke verified starter, shop/Blink, save/load, map mode, capture event, companion fielding, recruit, and hero swap.
- 2026-06-12: Content/visual pass: roster 6 -> 9 with Luna, Sven, Axe; item catalog +10 entries/components with Yasha, Sange, Kaya, Dragon Lance, Morbid Mask, Mask of Madness, Hyperstone, Platemail, Ultimate Orb; smoother procedural unit geometry. `npm test` green (8 files, 196 tests) and `npm run build` green.
- 2026-06-12: Phase 2 kickoff: added persisted owned-echo progress, first-echo facet unlock state, and echo talent tier unlocks that apply the opposite branch through `buildHero`. `npm test` green (9 files, 201 tests).
- 2026-06-12: Phase 2 systems pass: roster 20, creeps 12, regions 3, echo spawns, Find→Trial→Bind recruitment, badge-gated travel, Lunar/Frost gyms, gambit presets, Captain Calls in macro gym rounds, and Phase 2 data lint/tests. `npm test` green (10 files, 289 tests).
