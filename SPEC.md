# BUILD SPEC: "ANCIENTS" — A Dota 2 × Pokémon Open-World RPG

You are an expert game-developer agent building this game solo, across many sessions. Build a complete, playable 3D open-world RPG in the browser using **Vite + Three.js + vanilla TypeScript** (no game engine). The game crosses Dota 2 (heroes, spells, items, lore) with Pokémon's structure (open world, collecting, gyms, badges, Elite Four) and Diablo 2's loop (repeatable boss runs, drops, builds). You know Dota 2's heroes, abilities, items, and lore deeply; use that knowledge to populate all game data. Do not invent non-canon abilities.

---

## 0. HOW TO EXECUTE THIS SPEC (read first)

- **Build in phases (§9). A phase is done only when every item on its acceptance checklist passes.** Never check off an item on the strength of a stub, placeholder, or TODO. Do not build ahead of the current phase, with one exception: data schemas are designed for the end state from day one (talents, facets, Aghs hooks exist in the schema in Phase 1 even if their systems land later).
- **Never stall on ambiguity.** Resolve it with this priority order and keep moving:
  1. Dota 2 canon — mechanical identity first (see the two Feel Fidelity rules, §5 and §6)
  2. Readability and fun at action-RPG pacing
  3. The simplest implementation that works
  Log each nontrivial call as a dated one-liner in `DECISIONS.md`.
- **Keep `PROGRESS.md` current**: the §9 checklists with pass/fail status, plus a "how to demo this in 60 seconds" script for the current phase. Start every session by reading `PROGRESS.md` and `DECISIONS.md` and running the test suite. Resume from there; never restart or rewrite working systems. Commit working state with a clear message at every milestone.
- **Tests are ground truth.** `npm test` (vitest) must stay green. The combat core runs headless (§1.1), so combat, data integrity, and progression logic are all testable without a browser. You cannot feel the game; the test suite is how you verify it. When you add content, extend data-lint coverage to include it.
- **Dependencies: `three`, `vite`, `typescript`, `vitest` only** (plus `zod` if you want it for schema validation). No physics engine, no game framework, no asset pipeline. Anything else requires a `DECISIONS.md` entry justifying it.
- Single-player only. Target: latest desktop Chrome, WebGL2. Performance budget: 60fps in gameplay view with 30 active units and ~200 live projectiles/particles. Use instanced meshes, pooled projectiles/VFX, and LOD on the overworld.

## 1. ARCHITECTURE — TWO LOAD-BEARING RULES

Everything else in this spec is content. These two rules are structure; violating them is the project's failure mode.

### 1.1 One renderer-independent combat core

`/src/core/` contains the entire combat simulation: units, stats, abilities, statuses, items, projectiles (as logic objects), capture, XP/gold, and AI controllers. **It never imports Three.js and never touches the DOM.** It advances on a fixed 30 Hz logic tick and is deterministic for a given seed; rendering interpolates between ticks.

Both combat layers are the same core with different drivers:

- **Micro (overworld)**: player input controls one unit; everything else runs an AI controller.
- **Macro (5v5 arena)**: all ten units run gambit controllers (§7); a Captain Call temporarily attaches player input to one unit.
- Controllers are swappable per unit. This is also how raids work (§4): the full party fielded at once in micro, AI allies driven by their own gambits, the boss running a threat-table controller.

A `Unit` is one shared model: stats + statuses + ability slots + item slots + team + controller. Heroes, creeps, echoes, summons, and bosses are all Units with different data.

Because the core is headless, a full 5v5 macro battle must run to completion inside a vitest test in milliseconds. This is mandatory; it is how you verify combat without eyes on the screen.

### 1.2 Data-driven content with a closed vocabulary

All heroes, abilities, items, creeps, regions, trainers, gyms, and quests are plain data files under `/src/data/`. Game systems are generic interpreters. **Adding hero #61 must require zero engine code.**

That promise only holds if abilities compose from a fixed vocabulary (§2) instead of bespoke logic. The escape hatch is an **exotic registry**: at most ~25 scripted behaviors, registered by id and referenced from data, reserved for mechanics that define a hero or a raid boss (Chronosphere's freeze-everyone-but-Void, Stone Gaze's facing check, Reincarnation, Rearm, Invoke). Everything else must compose from primitives. When tempted to write hero-specific code: first try harder with primitives, then spend an exotic slot and record it in `DECISIONS.md`.

Enforced by tests:

- **Data lint**: every entry validates against its schema and all cross-references resolve (item recipes point to real components, abilities map to a VFX archetype, quest/region/hero ids exist, every exotic id has a registered implementation).
- **Boundary check**: nothing in `/src/core/` imports `three`.
- **Synthetic-hero test**: a test-only hero defined purely in JSON is registered at runtime and runs through a headless sim, casting one ability of each targeting type.

### Layout

```
/src/core/     — simulation: units, stats, abilities, statuses, items, projectiles,
                 controllers (player / gambit / creep AI), capture, XP & gold
/src/engine/   — Three.js renderer, camera modes, input, procedural models &
                 animation, VFX, icon generator, save, audio (Phase 4)
/src/systems/  — overworld orchestration: spawning, region streaming, quests,
                 recruitment, shops, day/night, reputation
/src/data/     — heroes/, items/, creeps/, regions/, trainers/, quests/, tuning.ts
/src/ui/       — HUD, menus, shop, party, gambit editor, draft screen, journal, codex
/src/test/     — data lint, sim tests, boundary checks
```

- **All tunables live in data.** `tuning.ts` holds global multipliers (range scale, speed scale, XP curve, gold rates) so the game can be rebalanced centrally. Use Dota numbers as the baseline, then tune.
- **Save**: full RPG save support. Manual save anywhere outside combat, 3 save slots plus an autosave slot (written on town entry, badge, recruitment, and a 60s timer), load from the title screen, and export/import of the full state as a downloadable JSON file. Serialize from one versioned `GameState` object.

## 2. ABILITY & STATUS ENGINE (the vocabulary)

**Targeting types**: `no-target`, `unit-target` (enemy / ally / any), `point-target`, `skillshot` (projectile or instant line; can miss), `ground-aoe`, `channel` (combinable with the above), `toggle`, `passive`, `aura`, `attack-modifier`.

**Effect primitives** (every ability is a composition of these):

- damage (physical / magical / pure; instant, over time, or per-attack), heal, mana burn / restore / drain-per-second
- statuses — **one shared list both combat layers consume**: stun, root, silence, hex, slow (move / attack), disarm, blind, fear, taunt, invisibility (with fade time), magic immunity, break, cyclone (untargetable), sleep, frozen
- displacement: knockback, pull-toward-caster (the Hook drag), forced move, blink (self or target)
- zones: persistent ground AoE (damage / aura / slow), impassable terrain with a duration (Fissure, Ice Wall block movement for everyone)
- summons: Units with creep AI and a lifetime
- stat modifiers: flat or % on any stat (damage, armor, attack speed, move speed, lifesteal, crit, cleave, bash, evasion…), timed or aura-applied
- projectiles: linear (speed, width, range) or homing (disjointable by cyclone/invis/blink)
- mechanic flags: charges, cooldown refund, day/night variant, on-damage-taken triggers (Blink Dagger's lockout), spell block / reflection

**Exotic registry** (budget ~25, of which up to 5 are reserved for raid-boss signature mechanics, §4): Invoke (Quas/Wex/Exort with a reduced 6-spell set), Chronosphere, Stone Gaze, Reincarnation, Rearm, Remote Mines pre-planting, plus your deliberate picks for the remaining roster. Each is data-referenced by id and logged.

**VFX**: ~12 reusable archetypes — projectile, ground-AoE ring, chain, beam, summon-pop, shield, stun-stars, channel, global-mark, hook/tether, wall, storm — color- and shape-parameterized per ability from data. Every ability maps to exactly one archetype (data-lint enforced).

**Icons**: no image assets anywhere. Generate ability and item icons procedurally at startup (2D canvas: layered glyph shapes tinted with the owner's palette), cached as textures for HUD and shop.

## 3. VISUAL STYLE (procedural, no external assets)

- **Stylized low-poly.** Every hero is assembled from Three.js primitives (capsules, cones, boxes, spheres) into a recognizable silhouette plus a 3-color palette from the hero's Dota identity (Crystal Maiden = ice blue/white/silver; Pudge = rot green/flesh pink/rust). Silhouette + palette live in hero data; a single `HeroModelBuilder` assembles them. Creeps reuse the same builder with creep silhouettes.
- **Procedural animation**, one shared controller parameterized per hero (attack speed, cast point): idle bob, walk via limb rotation, cast = raise arm + flash, attack = lunge, death = collapse.
- **Two camera modes over one world**: **Map view** (high tilted camera over a simplified far-LOD world: biome-splatted ground, fog, town/route icons) for traversal, and **Gameplay view** (an angled follow camera locked to the active hero, ~50° pitch with wheel zoom, like Dota's camera) for combat and towns. `M` toggles; transition is a camera fly with a fade fallback.
- Biome ground texturing via procedural splatting (snow, desert, forest, wasteland, coast); props (trees, rocks, ruins) are instanced primitives scattered from region data.
- **Day/night cycle** (~8 minutes) with a lighting shift. Expose a `night` flag to the condition system. Implement at minimum: Night Stalker empowered at night (his echo/boss fight changes), Luna's night bonuses, tighter player vision fog at night.
- Movement and collision are kinematic: terrain height sampling plus circle colliders on units and props. No physics library, no navmesh. Every unit, the player's hero included, moves by steering with local avoidance toward its order point (which also handles temporary walls like Fissure). A coarse grid A* fallback is permitted inside walled dungeons if steering alone gets stuck there.

## 4. WORLD & PROGRESSION

One continent, ~10 regions connected by gated routes. Each region has a town with a shop, wild creep spawns, hero echoes, recruitable heroes, 1–2 bosses, 3–5 mini-bosses, and one **Gym**. Regions follow Dota lore:

1. **Tranquil Vale** (starter region, Radiant-coded) — tutorial, starter choice.
2. **Nightsilver Woods** — Luna, Mirana; lunar theme. GYM 1: "Lunar Gym" (nuke/burst theme).
3. **Icewrack** — Crystal Maiden, Tusk, Ancient Apparition. GYM 2: "Frost Gym" (slows/disables).
4. **Devarshi Desert** — Sand King, Nyx Assassin. GYM 3: "Burrow Gym" (initiation/pickoff).
5. **The Shadeshore / Coast** — Kunkka, Tidehunter, Slardar, Naga Siren. GYM 4: "Tide Gym" (teamfight wombo).
6. **The Vile Reaches** (Dire-coded wasteland) — Pudge, Lifestealer, Undying. GYM 5: "Rot Gym" (attrition/sustain).
7. **Quoidge / Scholar's City** — Invoker, Silencer, Outworld Destroyer. GYM 6: "Arcane Gym" (spell interactions, silences).
8. **The Hidden Wood / Jungle** — Enchantress, Chen, Nature's Prophet. GYM 7: "Wild Gym" (summons/push).
9. **Mount Joerlak / Highlands** — Magnus, Elder Titan. GYM 8: "Titan Gym" (big ult setups).
10. **The Mad Moon Crater** (endgame) — Victory Road equivalent → **Elite Five + Champion** at the "Tower of the Ancients" (a Radiant/Dire throne room). Roshan's Pit is here: the legendary raid boss with a real respawn timer.

- **Badges gate progression**: route barriers, recruit level ceilings, and shop tiers.
- **Boss structure (Diablo 2 model).** Hero echoes are the farmable bosses. The real hero is a singleton recruit, but their echo persists in their region as a repeatable boss after recruitment (lore: Mad Moon fragments keep reforming). Tiering is role- and lore-driven: **hard carries and lore titans are BOSSES** (Spectre, Medusa, Faceless Void, Phantom Assassin, Terrorblade, Doom, Invoker, Wraith King — multi-phase fights built from their kits: Stone Gaze as a don't-look mechanic, Chrono as an arena-freeze phase, Reincarnation as a literal second phase). **Supports and utility heroes are MINI-BOSSES** guarding routes, dungeons, and shrines (faster fights, smaller loot tables). Scaling versions unlock post-badge: Normal/Nightmare/Hell-style difficulty tiers on repeat runs, with randomized loot.
- **The layer split**: the overworld micro layer is the Diablo loop (farm, boss runs, drops, builds); trainers and gyms are the macro layer (drafting, gambits, 5v5 wombo combos). Two games, one roster.
- Each gym leader runs a themed 5v5 macro battle (best of 3) and awards a **Badge**. The Elite Five is five consecutive drafted 5v5s with bans, then a Champion fight.

### Raids (WoW model)

Raids are **5v1 teamfights against a giant boss** (plus adds). The full party is fielded simultaneously in micro; you drive one hero and the other four run their gambits (§7). **1–5 switches which hero you drive.** Everyone simulates continuously, so the swap-in cooldown floor from §6 does not apply, and all five heroes earn participant-rate XP.

- **Threat**: raid bosses run a threat-table controller — damage and healing generate threat, the taunt status overrides it. Tank/healer/DPS roles emerge straight from Dota kits: Axe taunts, Omniknight and Dazzle heal, the carry rides the threat ceiling. Party composition becomes a real raid decision.
- **Mechanics compose from existing primitives**: HP-threshold phase transitions, telegraphed ground zones as dodge checks, add waves (summons), impassable-terrain walls, and a soft enrage timer. Each raid boss may claim one exotic slot for its signature mechanic (§2). A wipe resets the boss; runs stay short and repeatable, on the same Normal/Nightmare/Hell tiers as bosses.
- **Loot drops on probability, Diablo rules.** Every clear rolls the raid's table: guaranteed top-tier components, plus a chance at an **assembled** item from that raid's anchor pool — defaults 10% Normal / 20% Nightmare / 35% Hell, tunable in `tuning.ts` — with bad-luck protection: an assembled drop is guaranteed by the 8th clear without one.
- **Roshan's Pit** (Mad Moon Crater): the flagship raid, on a real respawn timer. Drops the Aegis of the Immortal (a held one-use auto-revive, consumed on death) and anchors Rapier-tier loot; repeat kills add a Refresher Shard and cheese (a mega-consumable), as is canon and law.
- **Cameo raids (3)**: the Mad Moon's fracturing leaks echoes from neighboring universes — the worlds this genre descends from. Each unlocks via a hidden questline after its region's badge, tuned for endgame:
  - **The Lord of Terror** (Diablo), in a hell-rift beneath the Vile Reaches: fear status, spreading fire zones, bone-prison walls, Fallen-style add packs. Anchors Heart of Tarrasque.
  - **The Lich King** (Warcraft), on Icewrack's glacier summit: a remorseless-winter aura zone, Defile (a ground AoE that grows if fed), slain adds raised as undead, heavy frost cleaves. Anchors Eye of Skadi. A loving nod — this game's genre was born as a Warcraft 3 mod.
  - **The Queen of Blades** (StarCraft), in a fallen-star crater in the Devarshi Desert: continuous swarm add waves, creeping infestation ground that spreads if left unattended, burrow ambushes, psionic-storm telegraphs. Anchors Refresher Orb.
  Cameos are mechanical homages with entirely original written content — the same rule as Valve content, extended to Blizzard.

## 5. ROSTER & ITEMS (data authoring)

**Hero entry schema**: id, name, attribute (STR/AGI/INT/Universal), role tags, base stats + growth, movement/attack-range/turn-rate parameters, 4 abilities (each: targeting type, primitive composition or exotic ref, cooldown/manacost/values by level, cast point, VFX archetype), talent tree (4 tiers × 2 choices at 10/15/20/25; talents are data: stat modifiers or ability-field overrides), one facet (a variant flag on one ability or stat package), optional Aghanim's upgrade, silhouette + palette spec, region, recruitment quest id, and ~6 original in-character barks (write new lines in Dota's voice; never copy Valve text).

- **Heroes are SINGLETONS.** Exactly one of each in the world, recruited via quest (§8). Level cap 30: talents are picked at 10/15/20/25 (the opposite branches stay echo-locked, see Hero Echoes below), levels 26–30 are pure stat growth, and post-cap XP converts to gold. At least 60 heroes at ship (§9 staging), with Aghs effects implemented for at least 15. **Cut, don't water down**: heroes whose identity can't survive translation — Rubick (Spell Steal), Meepo (multi-unit micro), Arc Warden (the self-double), Morphling — are excluded from the roster rather than simplified; log each cut in `DECISIONS.md`.
- **Creeps are the wild "Pokémon"**: ~25 catchable neutral types from Dota (kobolds, satyrs, hellbears, trolls, wildwings, golems, thunderhides…) in small/medium/large/ancient tiers, with their real Dota abilities. **Capture**: weaken below 30% HP, then channel a Binding Totem for 2.5s; taking damage interrupts. Deterministic, no catch RNG; higher tiers need lower HP and a longer channel. Creeps respawn, duplicate freely, and merge auto-chess-style (3 copies → star upgrade) to stay endgame-viable. Ancient creeps can hold items. **Caught creeps are fieldable**: bring up to 3 into the overworld as an AI entourage (at most one ancient); they fight on full creep AI, benefit from your aura items, and merge stars keep them endgame-relevant. The macro 5v5 stays heroes-only on your side; early route trainers field creep squads as enemies.
- **Summoners are the world-map class fantasy.** Prioritize them in the roster: Chen, Enchantress, Nature's Prophet, Undying, Warlock, Beastmaster, Visage, Lycan, Broodmother. Their summons run full creep AI and stack with the entourage, turning the overworld into a Diablo 2 Necromancer playstyle: walk the map with an army. Chen's Holy Persuasion converts a wild creep on the spot; a Chen facet can let persuaded creeps stay caught after the fight.
- **Hero Echoes**: wild, region-bound illusion-fragments of heroes. Beating an echo of an unrecruited hero drops attunement shards (advances their quest). Beating an echo of an owned hero unlocks the other branch of one talent tier (4 echoes = both talents at every tier = "perfected"); the first echo also unlocks facet swapping; surplus echoes pay big gold/XP bounties. Dupes are never dead content.
- **Items: at least 50 Dota 2 items** with real recipes (components + recipe cost), passives, and actives: Blink, BKB, Force Staff, Glimmer, Euls, Lotus, Battlefury, Diffusal, Mekansm, Pipe, Aghanim's Scepter, etc.
  - **Slots**: 6 per hero. All six slots' passives and auras apply. Slots 1–4 are key-bound (Z/X/C/V), so up to 4 *actives* are pressable per hero; slots 5–6 are passive slots (an active item parked there keeps its passives but cannot be pressed). The UI auto-sorts actives into keyed slots. The active cap is a constant in `tuning.ts`.
  - **Acquisition is tiered.** Town shops carry low/mid-tier items and components (boots, Magic Wand, Mekansm, Force Staff, Glimmer, Euls, Drums, BKB components…) with regional overlap; one **Secret Shop** per late region sells exclusive components in dangerous spots. **Top-tier game-warping items are never purchasable**: Divine Rapier, Butterfly, Scythe of Vyse, Heart of Tarrasque, Eye of Skadi, Refresher Orb, and Aghanim's Scepters are gated behind boss fights, dungeon quests, or gym/Elite rewards (Scythe from the Arcane Gym questline; Butterfly from a hidden trial; Rapier from Roshan-tier content). **First copy is quest/boss-gated; additional copies are farmable**: boss and mini-boss loot tables drop top-tier COMPONENTS (rare chance at assembled items), and specific bosses are the efficient source for specific items (Butterfly farms from an agility-carry boss, Heart from a strength titan). Raids are the most generous source; their probability rules are in §4.
  - **Rapier keeps its Dota identity**: it drops on hero death in macro battles and the enemy team can claim it for the round. Equipping it is a deliberate gamble.
  - Consumables (tangos, salves, clarities, dust, smoke) drop from creeps; components drop from echoes and trainers; assembled items are crafted or bought. **Gold is trainer-level**: one wallet, allocated across the roster (farm-priority tension).
  - Aura items (Mekansm, Pipe, Drums, Vlads, Assault Cuirass) affect nearby allied units on the field in both layers — the active hero and summons in micro, the whole team in macro and raids — making them roster-building choices.
- **ITEM FEEL FIDELITY (core design rule, parallel to hero feel).** Numbers, costs, and cooldowns may be retuned, but every item's **mechanical identity and decision pattern must match Dota 2**: Blink Dagger is instant repositioning that locks out when you take damage (no blinking out while getting hit); BKB grants temporary magic immunity with visible spell rejection and the classic "when do I pop it" decision; Euls cyclones (self-cast to dodge, enemy-cast to set up); Force Staff pushes any unit in its facing direction, saves and engages alike; Glimmer fades an ally into invisibility; Lotus Orb reflects targeted spells; Diffusal burns mana and purges; Battlefury cleaves; Refresher resets all cooldowns for the double-ult fantasy; Scythe of Vyse is the hard "stop that hero NOW" button. **Heuristic: a Dota player should know what an item does, when to buy it, and when to press it, on sight.**

## 6. MICRO COMBAT (overworld, Diablo 2-style)

- Real-time third-person action combat. **One active hero at a time**, party of 5.
- **Controls (decided)**: click-to-move, Dota-style. **Right-click** moves (click ground) and attacks (click a unit); hold to keep moving. **QWER + DF = abilities** (D/F only for heroes with >4 active slots), quick-cast at the cursor by default, with a click-to-confirm toggle in settings. **Z/X/C/V = item actives**, **1–5 = hero swap**, M = map, Tab = party/inventory. The left hand stays on the keys and the right hand owns movement and aim, mirroring Dota muscle memory. The player's hero moves by the same steering the AI uses (§3); turn rates apply to pathing, which is where hero "weight" shows up.
- **Hero swap on 1–5, mapped to party slots** (active slot highlighted in the HUD), 4s swap cooldown; the swapped-in hero's cooldowns are floored at 50% of remaining (prevents ult-cycling). Mid-fight slot-swapping is a feature: RP → press 3 → cleave.
- XP: active hero 100%, swapped-in participants 75%, bench 50%. +15% gold/XP last-hit bonus when the controlled hero lands the killing blow.
- This layer hosts wild creep fights and capture, echo duels, recruitment trials, dungeons, and raids (§4).
- **HERO FEEL FIDELITY (core design rule).** Numbers (damage, cooldowns, ranges, durations) may be freely retuned for action-RPG pacing, but each hero's **kinesthetic identity must match Dota 2**. The mechanic type, delivery, and decision-making of every ability must survive translation: Pudge's Hook is a slow skillshot that physically drags the target to him; Mirana's Arrow stuns longer the farther it flies; Anti-Mage's Blink is a short-cooldown reposition and Mana Break shreds mana; Invoker actually combines Quas/Wex/Exort to invoke spells; Earthshaker's Fissure creates impassable terrain; Sniper outranges everything but is fragile up close; Sven's cleave rewards stacking enemies; Tinker rearms; Techies pre-plants; Faceless Void's Chrono freezes a zone he must enter; Storm Spirit's mobility burns mana per distance. Channeled spells channel, point-target spells turn the hero, skillshots can miss, melee heroes must close distance. Movement speed, attack range, cast animations, and turn rates stay relatively faithful (then globally scaled via `tuning.ts`) so hero "weight" differences persist: CM feels slow and fragile, Slark feels slippery, Spirit Breaker feels like a truck. **Playtest heuristic: a Dota player picking up any hero should immediately recognize how they play.**

## 7. MACRO COMBAT (trainer/gym battles, RTS × auto chess)

- 5v5 on a small arena, auto-resolving on the shared core. Pre-fight: pick 5, set gambits, item-actives policy, focus priority.
- **Gambit grammar v1** (FF12-style: an ordered rule list per hero, first match wins, ≤8 rules):
  - Conditions: self/ally/enemy HP% threshold, mana% threshold, has-status (stunned / silenced / channeling / magic-immune), enemies-within-radius ≥ N, allies-alive N, target-role/attribute, my-ability-ready, fight-time > T, enemy-cast-seen (category: blink / ult / channel), distance band.
  - Actions: cast ability at an auto-target (lowest-HP enemy | most-clustered point | self | lowest-HP ally | current focus), use item active, attack focus target, retreat to backline, hold.
  - Rules are data. The gambit editor is a HUD list builder, and the same gambit controller drives AI allies in micro raids.
- **3 Captain Calls per fight** (gyms grant enemies more): take direct control of one hero for 5 seconds to land the Black Hole / Ravage / clutch save manually.
- Between rounds (gyms are best-of-3), spend in-fight kill gold on consumables.
- Cross-hero spell interactions must actually work: pulls group enemies for cleaves, silences stop channels, BKB blocks magic, Euls disjoints. These fall out of the shared status engine (§2); verify them with headless sim tests, not by eye.
- The Elite Five uses **draft mode**: alternating picks and bans from your recruited roster vs. their themed pools.

## 8. RECRUITMENT (the quest backbone)

Every hero has a 3-beat chain: **Find** (rumors, lore fragments, echo shards point to a region) → **Trial** (per-hero, in-character) → **Bind** (a 1v1 micro duel against their real kit, doubling as that hero's tutorial; losing relocates them — never a permanent failure).

Implement at least 12 bespoke trial types and template the rest: honor duel (Juggernaut/Sven/Legion Commander), stealth-hunt (Riki), combo exam (Invoker), relic fetch (Sven's shattered sword), a mutually-exclusive faction choice (siding with Kunkka or Tidehunter locks the other out), reputation gates (Omniknight needs good reputation, Shadow Fiend needs souls from kills), timed arena cull (Axe), minefield crossing (Techies), persuasion gauntlet: convert wild creeps to your cause instead of killing them (Chen), assassination contract (Phantom Assassin), survive-the-night (Night Stalker), lore riddle (Elder Titan).

Reputation is a simple karma counter moved by quest choices; it gates the reputation trials. Two specials: a Roshan-pit raid recruit, and one "recruit 50 heroes first" legendary.

## 9. PHASES & ACCEPTANCE (each phase ships playable)

Content staging: P1 = 6 heroes / 15 items / 1 region / 6 creep types → P2 = 20 / 30 / 3 regions / 12 creeps, gyms 1–2 → P3 = 60 / 50 / 10 regions / 25 creeps / 8 gyms + Elite Five + all four raids → P4 = polish.

### Phase 1 — Core loop

Engine + combat core + Tranquil Vale. 6 heroes chosen to cover every targeting type and most primitives (suggested: Juggernaut, Crystal Maiden, Pudge, Earthshaker, Sniper, Lich). Creep spawns, fighting, capture, merge, and the entourage (field a caught creep as an AI companion). Shop + inventory with 15 identity-rich items (Blink, BKB, Euls, Force Staff, Glimmer among them). Save/load. Both camera modes.

Done when:

- `npm run dev` → pick a starter → kill and catch a kobold → field it as a companion → buy and use Blink → swap heroes mid-fight → manual-save to a slot, reload, state intact.
- `npm test` green: data lint; core boundary check; synthetic-hero sim; a fixed-seed 5v5 headless sim that produces the same winner every run; capture and merge unit tests.
- `PROGRESS.md` contains the 60-second demo script proving the above.

### Phase 2 — Systems

Echoes + talent/facet economy; recruitment framework + 6 bespoke trials; +2 regions (Nightsilver Woods, Icewrack); gyms 1–2 with the gambit editor and Captain Calls; roster to 20, items to 30; hero-swap and combat polish.

Done when: gyms 1–2 are beatable end-to-end with player-authored gambits; an echo kill visibly unlocks a talent branch; all 6 trials are completable; sim tests cover silence-interrupts-channel, BKB-blocks-stun, and Euls-disjoints-projectile; data lint covers the grown roster.

### Phase 3 — Content

Full 60-hero roster, 50 items, all 10 regions, 8 gyms, Elite Five draft, all four raids (Roshan + the three cameo wings), day/night effects, reputation, boss/mini-boss difficulty tiers with loot tables.

Done when: data lint proves the counts (≥60 complete hero entries, ≥50 items with resolving recipes, every region populated, every hero has a recruitment chain); a **kit smoke test** passes (every ability of every hero and every item active executes in a headless sim at levels 1/15/30 without errors); the Elite Five is winnable via draft; all four raids are completable and drop from their loot tables; a headless raid sim verifies phase transitions at HP thresholds, add waves, taunt redirecting the boss, and the enrage timer; a Nightmare-tier boss rerun works.

### Phase 4 — Polish

VFX pass; barks and dialogue; balance pass from Dota baselines via `tuning.ts`; minimap (top-down render-to-texture or canvas dots); quest journal; codex with lore entries written in Dota's voice; optional procedural WebAudio SFX (cast/hit/capture/badge jingle — keep it tiny); performance pass against the §0 budget.

## 10. NON-NEGOTIABLES

- Faithful Dota kits, items, and lore; original written content only (no copied Valve or Blizzard text — write new in-character lines).
- Data-driven: heroes/items/quests are data files, systems are generic interpreters, abilities compose from the closed vocabulary with ≤~25 logged exotics.
- One renderer-independent, fixed-timestep, headless-testable combat core shared by both layers.
- Heroes singleton; creeps duplicable and mergeable; echoes = talent unlocks; dupes never dead content.
- Runs in the browser from `npm run dev`; no external art assets; all visuals procedural.
- A phase is done only when its acceptance checklist passes; `npm test` stays green.

