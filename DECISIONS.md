# DECISIONS

Dated one-liners for every nontrivial call, per SPEC §0.

- **2026-06-12** — Core sim works in raw Dota units (positions, ranges, speeds); the renderer divides by 100 for world meshes. Canon numbers port verbatim; `tuning.ts` multipliers sit on top.
- **2026-06-12** — `repeat` blocks and target selectors (random-enemy-in-radius, clustered-point, lowest-HP-ally…) are composition glue inside the closed effect vocabulary, not new mechanics. Omnislash composes from untargetable + repeat(blink→strike) instead of spending an exotic slot. Exotic count after P1: **0 of ~25**.
- **2026-06-12** — The spec's mechanic-flag examples (on-damage-taken, charges) generalize to one trigger primitive: `damage_taken / spell_cast / attack_landed / kill / enemy_ability_cast_nearby / death_nearby`. Covers Blink lockout, Aftershock, Flesh Heap, Magic Wand with zero bespoke code.
- **2026-06-12** — P1 recruitment: the five non-starter heroes stand at landmarks in Tranquil Vale and join when interacted with. Find→Trial→Bind chains are Phase 2 scope per staging; this placement is the honest P1 subset (P1 acceptance only requires starter pick + mid-fight swap).
- **2026-06-12** — P1 item list: Arcane Boots over Power Treads (tread-switch UI deferred to P2+); actives chosen for identity coverage: Blink, BKB, Euls, Force Staff, Glimmer, Mekansm, Diffusal, Magic Wand, Arcane Boots.
- **2026-06-12** — Party wipe in the overworld: respawn at the town shrine with a 10% gold penalty; camps you cleared stay cleared until their respawn timers fire.
- **2026-06-12** — Tests avoid `@types/node`: the core boundary check reads `/src/core` sources through Vite's raw glob import instead of `node:fs`, keeping dependencies to the approved list.
- **2026-06-12** — Caught creeps don't gain XP levels; star merges (3→★) are their whole progression track. Keeps the wallet/XP economy hero-centric.
- **2026-06-12** — Cleave splashes full pre-mitigation physical damage in a circle around the victim (no armor reduction on splash), per Dota identity.
- **2026-06-12** — Wild creeps leash back to camp and heal to full on reset, preventing tower-less kiting cheese.
