# Asset Gaps — visual revisit pass

A fresh audit of every entity that shows up on screen against the GLBs we actually
ship, looking for: (1) entities still drawing the procedural rig when a real model
exists or could exist, (2) shipped GLBs sitting unused, and (3) creeps/heroes that
map to a creature less accurate than one we already own (or could vendor CC0).

Ground rules unchanged: original + generated + CC0/CC-BY only, never Valve/Blizzard
files; procedural rig stays the floor (`mountHeroModel` hides, never disposes); the
game must still boot with `public/assets/` empty. See `VFX_ASSETS.md` and `ASSETS.md`.

Scope reference (measured from code):

| Surface | Count | Today's GLB source |
|---|---|---|
| Heroes | 122 | 80 KayKit per-hero (`heroes/<id>.glb`) · 31 creature-base (`creeps/<base>.glb`) · 11 holdout replacements |
| Bosses | 42 | none of their own — render as their `heroId` hero unit |
| Raids | 11 | boss = hero; adds = procedural summons |
| Gyms | 8 (×5 enemy heroes) | hero pipeline via `enemyTeam[].heroId` |
| Creeps (registered) | 36 | `creeps/<mapped>.glb` via `creepCreatureUrl` |
| Recruit NPCs | per-region `heroSpawns` | **procedural only** |
| Items | ~151 | procedural parts + VFX (no GLB, by design) |

Biomes are **not** a gap: all 6 (`grass/forest/snow/desert/wasteland/coast`) have a
terrain PBR set, music bed, weather, and color grade wired.

---

## Status

**Shipped:**

- **P0 — recruit NPCs now mount their authored hero GLB.** ✅
- **P1.1 — creep remaps:** `hellbear` → `bear`; `ogre-bruiser` → `orcenemy`;
  harpies → `flier`; owlbears (`wildwing*`, `enraged-wildkin`) → `bear`. ✅
- **P1.2 — creature-base hero remaps:** `ursa` → `bear`; `tidehunter` → new `crab`
  base (reads through the shipped `crabenemy.glb`); `treant-protector` → `treant`. ✅
- **P1.3 — missing creature families generated:** original animated `flier`, `bear`,
  and `treant` GLBs (`scripts/assets/generate_creature_families.mjs`), wired to the
  creeps + hero bases above. ✅

These lit up ~121 authored town models, put the formerly-unused
`crabenemy`/`orcenemy` GLBs to work, and closed the worst "wrong species" reads
(harpies, owlbears, ursa, treant) — all generated/on-disk, no external downloads.
Verified green: `typecheck`, 1562 unit tests, `build`, `assets:check` (creep group
20 → 23 files, budget intact).

**Remaining (need new art or a new system, not blockers):**

- **P2** — more village props (new CC0 art) and an ambient-critter spawn system
  (the `alpaca`/`frog` GLBs are still on disk and unused).
- **P3** — optional signature held-weapon GLBs for marquee items (generator work).

After this pass, the only creature GLBs with no reference at all are `alpaca` and
`frog` (both earmarked for P2 ambient life). `fox`/`spider` are hero-base files,
already referenced through `HERO_COHORTS`.

---

## P0 — Recruit NPCs ignore the hero GLB they already have ✅ DONE

The single biggest visual inconsistency. Every recruitable hero ships a finished
GLB, but the townstanding recruit NPC renders as a flat procedural primitive, so
you walk up to a blocky placeholder, recruit it, and the *same* character snaps to
a fully modeled hero on your team. Bosses, gym enemies, and hero "echoes" all set
`heroId` and get the authored model; recruit NPCs are the one hero-identity unit
that does not.

Cause: `spawnRecruitNpcs` sets `u.visual = { silhouette, palette }` but never sets
`u.heroId`, so `scene.ts` skips `applyHeroLikeness` / `heroAssetEntry` and never
mounts the GLB.

```4945:4964:src/systems/game.ts
  private spawnRecruitNpcs(): void {
    for (const spawn of this.region.heroSpawns) {
      if (this.recruited.has(spawn.heroId)) continue;
      const def = REG.hero(spawn.heroId);
      const u = new Unit({
        kind: 'npc',
        ...
      });
      u.visual = { silhouette: def.silhouette, palette: def.palette };
```

**Fix (code-only, no new art):** give the recruit NPC its `heroId` (or a render-only
field the scene reads) so the hero-model path fires for `kind: 'npc'`. Confirm the
scene's GLB branch accepts `npc`, not just `hero`, and keep the procedural fallback.
This lights up authored models for ~121 town NPCs for free.

**Shipped:** added a render-only `Unit.renderHeroId` (the sim/AI never read it),
set it in `spawnRecruitNpcs`, and taught `scene.ts` `createView` to treat a unit as
"hero-like" when it carries a render hero id and is `kind: 'hero' | 'npc'`. All four
mount paths (per-hero GLB, shared creature base, holdout replacement, holdout
signature) now resolve through `renderHeroId`, so recruit standees get the same
authored body — humanoid, creature-base, or holdout — that they become on the team,
with the procedural rig still the floor.

---

## P1 — Shipped creature GLBs sitting unused, while creeps/heroes map crudely

We vendored 20 creature GLBs. The 1.1/1.2 remaps below shipped, which puts
`crabenemy` and `orcenemy` to work. Remaining truly-unreferenced files: `alpaca`,
`frog` (both reserved for P2 ambient critters). `fox`/`spider` are hero-base files,
referenced through `HERO_COHORTS`.

### 1.1 Creeps that map to the wrong body ✅ DONE

`CREATURE_BY_ID` / `CREATURE_BY_BUILD` in `src/engine/assets.ts:190-236`.

| Creep | Real Dota form | Maps to today | Note |
|---|---|---|---|
| `hellbear`, `hellbear-smasher` | bear | ~~`giant`~~ → **`bear`** ✅ | Now the generated bear family (1.3) |
| `harpy-stormcrafter`, `harpy-scout` | winged harpy | ~~`velociraptor`~~ → **`flier`** ✅ | Generated winged flier (1.3) reads airborne |
| `enraged-wildkin`, `wildwing`, `wildwing-ripper` | owlbear | ~~`velociraptor`~~ → **`bear`** ✅ | Bear family beats a small raptor read |
| `thunderhide`, `ancient-thunderhide` | rhino-beast | `bull` | `bull` (ok) — leave |
| `ogre-bruiser` | ogre brute | ~~`orc`~~ → **`orcenemy`** ✅ | Variety: brutes no longer all share `orc.glb` |
| coastal/shadeshore creeps | crabs/sea | n/a (none use crab) | No coast creep is registered, so `crabenemy.glb` is used by the `tidehunter` hero base instead (1.2) |

Shipped: `hellbear`/owlbears → `bear`, harpies → `flier`, `ogre-bruiser` →
`orcenemy`. There is no registered coastal creep, so `crabenemy.glb` is consumed by
the `tidehunter` crab base (1.2) rather than a creep id.

### 1.2 Creature-base heroes that could read closer to Dota ✅ DONE (the on-disk ones)

`HERO_COHORTS` in `src/engine/assets.ts`.

| Hero | Real Dota form | Base today | Note |
|---|---|---|---|
| `ursa` | bear warrior | ~~`giant`~~ → **`bear`** ✅ | Generated bear family (1.3) |
| `tidehunter` | sea leviathan | ~~`giant`~~ → **`crab`** ✅ | `crabenemy.glb` via new `crab` base reads aquatic |
| `treant-protector` | walking tree | ~~`giant`~~ → **`treant`** ✅ | Generated treant family (1.3) |
| `tusk` | walrus | `yeti` | ok; a tusked/walrus GLB later |
| `snapfire` | crone on a lizard mount | `velociraptor` | mount-only read; acceptable |
| `hoodwink` | squirrel | `fox` | ok; squirrel/critter GLB later |
| `gyrocopter` | pilot + autogyro | `goblin` | no vehicle GLB; goblin is the chibi stand-in |

Shipped: `ursa` → `bear`, `tidehunter` → new `crab` base, `treant-protector` →
`treant`. The `crab`/`bear`/`treant` bases were added to `HeroBaseId` +
`CREATURE_HERO_BASES`; `heroBaseUrl` maps `crab` to the shipped `crabenemy.glb` via
a `CREATURE_BASE_FILE` override, while `bear`/`treant` resolve to the same-named
generated files. `tusk`/`snapfire`/`hoodwink`/`gyrocopter` still want bespoke art
and stay on their current bases.

### 1.3 Missing creature families ✅ DONE (generated)

We had no model for several recurring Dota silhouettes. Rather than download new
packs, these ship as **original, generated, animated GLBs** built the same way as
the holdout replacements (`scripts/assets/generate_creature_families.mjs` →
`public/assets/creeps/{flier,bear,treant}.glb`, runtime-recolored per consumer):

- **Flier** (bird/bat/harpy) ✅ — wired to the `harpy-*` creeps. Reads airborne
  instead of a grounded raptor. (`batrider`/`gyrocopter` stay on their current
  holdout/goblin bases to avoid churn; they can adopt the flier later.)
- **Bear** ✅ — wired to `ursa`, `hellbear`, and the owlbear creeps. (`lone-druid`'s
  spirit-bear summon can adopt it later.)
- **Treant / ent** ✅ — wired to `treant-protector`. (`natures-prophet`'s treant
  summons can adopt it later.)
- **Serpent / naga** — *not built.* `medusa`/`naga-siren` are procedural holdouts
  that already ship animated replacement GLBs (A7), so this family is the lowest
  priority; left for a later pass if a closer read is wanted.

Each generated GLB is a four-material, ~20-mesh model with `idle/run/attack/cast/
death` clips on a single animated rig node, fitted to silhouette height and seated
at runtime by `mountHeroModel`. The procedural rig stays the floor: any missing or
failed load keeps the hand-tuned primitive.

---

## P2 — Town / world set dressing and ambient life

Towns ship 9 building/prop GLBs (`house_1-3`, `inn`, `blacksmith`, `well`, `cart`,
`barrel`, `market_stand_1`). Gaps that would make towns feel inhabited:

- **More medieval-village props** (same Quaternius pack, CC0): fence, lamp/torch,
  signpost, crates, sacks, fountain, banner, additional market stands. Cheap, high
  ambient payoff.
- **Non-combat ambient critters** — `alpaca`, `frog`, `fox` GLBs are already on disk
  and unused; a few wandering animals would make the overworld feel alive without
  new downloads.
- **Vendor / quest-giver presence** — the gamble vendor, black market, quest board
  givers, and 5 route trainers are text/UI only. No standee or NPC marks them in
  world. Optional: place a recruit-NPC-style procedural (or GLB) figure at the
  vendor/quest spots.

---

## P3 — Items stay procedural (by design; one optional upgrade)

~151 items carry no GLB. ~79 use `appearance` (worn parts/weapon swap/tint/aura) and
~28 use `attackVisual`; consumables and raw components are intentionally invisible
(`VFX_ASSETS §6.1`). This is the agreed convention — not a gap.

Optional upgrade only if we want marquee items to pop: the hero-weapon generator
(`scripts/assets/generate_hero_weapons.mjs`) could emit signature held GLBs for a
handful of build-defining weapons (Daedalus, Radiance, Battle Fury, Divine Rapier)
so an equipped artifact swaps the hand model instead of only tinting it. Closed
vocabulary, generated, fallback-safe.

---

## Suggested order

1. ~~**P0 recruit-NPC render id**~~ — ✅ done. Unlocked ~121 authored town models,
   zero new files.
2. ~~**P1.1 + P1.2 on-disk remaps**~~ — ✅ done. `ogre-bruiser`→`orcenemy`,
   `tidehunter`→new `crab` base, plus the bear/flier/treant remaps from 3.
3. ~~**P1.3 generate a flier + bear + treant**~~ — ✅ done. Closes the biggest
   "wrong species" reads (harpies, owlbears, ursa, hellbear, treant). Generated
   original animated GLBs (not downloads); fallback intact.
4. **P2 town props + ambient critters** — *remaining.* An ambient-critter spawn
   system can reuse the on-disk `alpaca`/`frog`; more village props need new art.
5. **P3 signature item weapons** — *remaining, optional.* Only if marquee items
   should read.

Every change keeps the procedural floor and ships green
(`typecheck && test && build`, plus `assets:check` for any asset batch). The shipped
items 1–3 were verified against all four checks (1562 unit tests).
