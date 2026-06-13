# DECISIONS

Dated one-liners for every nontrivial call, per SPEC §0.

- 2026-06-12: Core sim works in raw Dota units (MS 300, ranges 600, etc.); renderer divides by 100 for world units. Dota numbers port verbatim, `tuning.ts` scales globally.
- 2026-06-12: Added two generic composition tools to the effect vocabulary instead of spending exotic slots: `repeat` (count/interval/sub-effects) and target selectors (e.g. `random-enemy-in-radius`, `random-point-in-ring`). Omnislash, Freezing Field, and Chain Frost all compose from primitives; zero exotics spent in Phase 1.
- 2026-06-12: Trigger system generalized: `on-cast`, `on-damage-taken`, `on-attack-land`, `on-kill`, `on-nearby-death`, `on-nearby-enemy-cast` — the spec's listed mechanic flags (Blink lockout, Aftershock, Flesh Heap, Magic Wand) are instances of one generic trigger primitive.
- 2026-06-12: Ability skill points auto-assign on level-up (ult at 6/12/18, basics round-robin via per-hero `skillOrder`). Manual skilling adds UI without Phase-1 value; talents (10/15/20/25) stay manual per spec.
- 2026-06-12: Phase 1 recruitment: non-starter heroes stand at lore spots in Tranquil Vale and join via a Binding Sigil interaction (right-click). The full Find→Trial→Bind chain is Phase 2 scope; this placeholder is replaced then (recruitment framework is not on the P1 checklist; mid-fight hero swap requires a 2nd hero, so some recruitment path must exist in P1).
- 2026-06-12: Power Treads cut from P1 item list in favor of Arcane Boots (tread-switching micro deserves real treatment later; Arcane Boots' mana-battery identity survives intact).
- 2026-06-12: Party wipe in overworld: respawn at town shrine, lose 10% gold (Diablo-style death tax), wild camps the player left reset via normal respawn timers.
- 2026-06-12: Wild creeps leash-reset (return to camp and heal to full) beyond ~1800 units from camp, preventing drag-cheese.
- 2026-06-12: Cleave deals full pre-armor physical to secondary targets (canon-faithful); crits use plain seeded RNG, not pseudo-random distribution (simplest implementation that works).
- 2026-06-12: Attack projectiles always land on arrival (not disjointable) in P1; spell projectiles disjoint on blink/invis/cyclone per canon.
- 2026-06-12: Capture thresholds by tier: small 30%/2.5s, medium 25%/3.0s, large 20%/3.5s, ancient 15%/4.5s — all in tuning.ts.
- 2026-06-12: Entourage creep death: creep returns to storage "fainted" for 90s (tuning), then fieldable again. Keeps death meaningful without dead content.
- 2026-06-12: Phase 1 starts with a 2600g Dawnshade stipend (`TUNING.startingGold`) so the acceptance demo can buy Blink immediately; long-term economy balance is Phase 2+.
- 2026-06-12: Added a tutorial kobold camp and moved Pudge near Dawnshade so capture, companion fielding, recruitment, and 1-5 swap are reachable in the first minute.
- 2026-06-12: Save imports and slot loads now validate version, region/hero/creep references, party bounds, and core shape before starting a game.
- 2026-06-12: Map mode uses procedural in-world markers for town, shrine, camps, and recruitable heroes as the Phase 1 far-readability layer instead of a separate minimap UI.
- 2026-06-12: Added Luna, Sven, and Axe as data-only heroes with no exotic slots; placed them in Tranquil Vale temporarily so the one-region build can recruit/test them before their lore regions exist.
- 2026-06-12: Added spell amplification and status resistance to the stat vocabulary for Kaya/Sange identity instead of treating those items as cosmetic stat sticks.
- 2026-06-12: Increased procedural model tessellation and switched unit materials to smooth Lambert shading; preserves asset-free stylization while reducing placeholder-low-poly jaggedness.
- 2026-06-12: Combat feel pass keeps one shared core: faster AI cadence, role-based macro formations, taunt as forced attacks, and a damage-threat boss controller for 5v1 raids.
- 2026-06-12: Phase 2 echo economy starts as per-hero persisted `EchoProgress`: first owned-echo kill unlocks facet swapping, then one talent tier at a time activates the opposite branch through the generic `buildHero` path.
- 2026-06-12: Phase 2 region travel hot-swaps the single loaded region through the existing save/load event path; this preserves the current renderer architecture while enabling a three-region continent.
- 2026-06-12: Recruitment trials are data-defined per hero and use a generic Find→Trial→Bind interpreter; the bind step is a real enemy hero echo fight, while the six bespoke trial kinds stay lightweight and reusable for Phase 2.
- 2026-06-12: Gyms reuse the headless macro sim as best-of-3 sessions; Captain Calls are simulated as timed player-control windows that issue clutch orders, keeping gym logic testable without a second renderer.
- 2026-06-12: Spec adds a bonus Phase 5 (Resonance, Feel & Fidelity). Resonance is an opt-in Genshin-style elemental layer (7 elements mapped from canon, a generic reaction-table resolver, party-composition resonance buffs) built entirely from the existing status/trigger/aura vocabulary — zero exotic slots, micro+raids only, gyms/Elite Five stay pure Dota.
- 2026-06-12: Phase 5 reverses the procedural-only / no-external-assets rule (finalized decision): heroes get detailed rigged models that resemble (not replicate — exact copies are neither possible nor wanted) their Dota 2 counterparts via a real asset pipeline (GLTFLoader, textures, skeletal animation, post-FX), plus a feel pass (attack-move/stop with shift-queue, per-hero attack animation timed to attackPoint/BAT, real positional SFX, floating combat text). Core stays headless (§1.1); written content stays original (§10). Procedural primitive models remain the P1–P4 placeholder path.
- 2026-06-12: Phase 3 keeps the existing 20 Phase 2 heroes, including Sniper/Jakiro/Omniknight/Windranger, and adds the 44 missing Phase 3 heroes as data-only entries. This yields 64 registered heroes, preserving working fixtures while satisfying the ≥60 acceptance floor.
- 2026-06-12: Planned Phase 3 exotics are registered as no-op data hooks first (`invoke`, `chronosphere`, `stone-gaze`, `reincarnation`, `rearm`, four raid signatures, and `refresh-cooldowns`). The primitive behavior remains testable now; bespoke presentation/implementation can deepen later without changing data IDs.
- 2026-06-12: Boss tier scaling starts at Normal 1.0x, Nightmare 1.65x HP / 1.28x damage, and Hell 2.45x HP / 1.65x damage. Nightmare opens after the regional badge; Hell opens after a cleared Nightmare rerun.
- 2026-06-12: Gated top-tier items are registered as normal `ItemDef`s for inventory/combat resolution but are excluded from all normal shops; Secret Shops sell only components, while bosses and raids own assembled drop chances plus pity.
- 2026-06-12: Neutral items are their own registry with a dedicated save slot/stash. Gold can reroll, reclaim, or enchant three duplicates up-tier, but no gold sink directly sells a neutral or gated top-tier item.
- 2026-06-12: Save v3 adds Phase 3 progression fields and migrates v2-shaped saves by defaulting new maps/stashes/counters and hero neutral slots.
- 2026-06-12: Elite Five draft data uses placeholder original homage names and deterministic pick/ban construction over the recruited roster; Champion remains a marquee 5v5 data team.
