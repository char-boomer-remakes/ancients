# HUD & UI OVERHAUL — "ANCIENTS"

The interaction and information layer the game's depth now demands. Companion to `PRESENTATION_SPEC.md` (which set the direction for HUD juice in `§5`, menu/title/shop in `§6`, and settings/accessibility in `§7`), `QUEST.md` (the quest board this surfaces), `SOUND_MAP.md` (the audio archetypes this extends to the UI), and `ASSETS.md` (the generate-or-download policy this respects). Same crunch-mode footing as `SPEC.md §0`: direction and priority, not a gate.

Where `PRESENTATION_SPEC.md §5` named the *feel* of a modern HUD — count-up gold, tweened bars, cooldown sweeps — this spec names the **information architecture and the controls**: the stats the depth of the game has outgrown the HUD's ability to show (HP/mana regen detail, XP-to-next, a full character sheet, buffs and debuffs), a persistent quest tracker, an interactive minimap, configurable key bindings, and a UI that clicks, hovers, and opens with sound. The two specs are meant to land together; this one is the detailed build behind `§5.3`, `§5.4`, and `§7`, plus the new surfaces those sections did not cover.

The throughline is unchanged and non-negotiable. **The headless deterministic core (`SPEC.md §1.1`, `src/core/`) stays untouched.** Every readout here is a view-model the HUD already reads or can derive from one (`describe.ts`, `progression.ts`, `quests.ts`). Every control writes to `GameSave['settings']` and never to the sim. `boundary.test.ts` stays green and the determinism hashes (`OPTIMIZATION_SPEC.md §D.2`) stay byte-identical.

---

## 0. WHERE WE ARE (measured today)

An honest read of the current HUD, with file references so the work has a starting line. The framework is plain DOM + CSS injected into `#ui-root` over a Three.js canvas — no React/Phaser/Pixi — and all of it lives in one `Hud` class (`src/ui/hud.ts`) styled by `src/ui/styles.css`, refreshed every frame from `Game`.

**The command card is a solid baseline.** `renderHeroPanel()` (`hud.ts:768`) draws the portrait, level, HP/mana bars with numerics, an XP bar, a live stat strip (`DMG · ARM · MS · HP regen/s · MP regen/s`, `hud.ts:894`), the QWERDF ability row with bottom-up cooldown overlays, and a 3×2 item grid. It works. What it lacks is the depth the game has grown into.

**The information gaps the request named are real:**

- **XP-to-next is computed but not shown.** `xpProgress()` (`src/core/progression.ts:49`) returns `current`/`needed`/`pct`; the HUD renders only the `pct` fill (`hud.ts:892`). The player can see the bar move but never "412 / 900 to L8."
- **Regen is shown as a flat rate, not explained.** `liveRegen()` (`hud.ts:185`) and the strip give `+N/s`, but there is no breakdown (base + items + talents), no "seconds to full," and no parity on the party frames.
- **No buff/debuff display anywhere.** Status reads only as world hover text ("Stunned", "Silenced", `worldStatusLabels`, `hud.ts:593`). No icon row on the hero, the party frames, or over a unit's head. For a game with stuns, silences, slows, auras, and toggles, this is the biggest single gap.
- **No character sheet.** Attack speed, magic resist, spell amp, lifesteal, evasion, status resist, cast range, and vision exist in `describe.ts` (`STAT_LABELS`, `statLines`) and on the unit, but live only inside hover tooltips. There is no panel that lists a hero's full derived build.
- **The quest UI is a modal, not a tracker.** The Journal (`renderJournalModal`, `hud.ts:2519`, key `J`) renders `questBoard()` (`QUEST.md §6`) only when opened. There is no pinned on-screen objective, and no minimap marker driven by a quest target.

**The minimap is display-only.** `renderMinimap()` (`hud.ts:670`) paints biome-colored POI dots each frame. There are no event listeners on `#minimap` anywhere in the repo — no click-to-move, no click-to-look, no ping, no camera-viewport rectangle, no day/night tint. `GameSave.settings.minimap` exists in the save but the HUD never reads it. (Note: `M` toggles the *camera mode*, not the minimap, `input.ts:345`.)

**Key bindings are hardcoded.** Every control is a string literal in `src/systems/input.ts` (`ABILITY_KEYS`, `ITEM_KEYS`, the `switch` at line 312). There is no keymap, no rebinding UI, and the HUD's hotkey labels are a *second* hardcoded copy (`hud.ts:27`) that can drift from input. The top bar even renders the whole control list as one dense always-on string (`hud.ts:666`).

**The UI is silent.** `audio.ts` is a strong sim-event-driven system (`handleEvent`, casts, impacts, gold, stingers) but has no UI layer: no button click, no hover, no menu open/close, no ability-ready blip, no low-HP heartbeat, no error buzz. Menu interactions make no sound unless they happen to fire a sim event.

**Settings are deep on graphics/audio, thin on control and layout.** `renderMenuModal()` (`hud.ts:2879`) exposes quality tiers, the full audio mixer, and accessibility toggles (`GraphicsSettings`, `types.ts:326`). It exposes no keybinds, no UI scale, and does not surface or honor the `minimap` toggle that already exists in the save.

**Two highest-leverage moves.** First, close the information gaps the depth of the game has opened — buffs/debuffs, XP-to-next, the character sheet — because they are pure reads of data we already compute and they change how readable a fight is. Second, make the controls and the minimap *interactive and configurable* — a keymap layer, click-to-move, and UI sound — because that is the difference between a tech demo and a game you sit down with.

---

## 1. PRINCIPLES & LAYOUT

The research consensus for information-dense action games (MOBA/ARPG): players spend ~80% of visual attention on the world, so the HUD must read at a glance, cluster critical data where the eye already lands, and disclose the rest progressively. Legibility over minimalism for the dense panels; contextual fade for the situational ones.

**Screen zones** (anchored, conventional, so muscle memory transfers in):

| Zone | Owns | Persistence |
|---|---|---|
| Bottom-center | Command card: portrait, bars, abilities, items, buffs (`§2`) | Always |
| Top-left | Party frames + entourage (`§5`) | Always |
| Top-center | Region, day/night clock, badges (`§6`) | Always |
| Top-right | Gold, stamina, moonflow, exploration (`PRESENTATION_SPEC §5.1`) | Always |
| Bottom-right | Minimap (`§8`) | Toggleable (`settings.minimap`) |
| Right edge, mid | Quest tracker (`§7`) | Toggleable / pinned |
| Bottom-left rising | Toasts + killfeed (`§9`) | Situational, fades |
| Over-unit | Buff/debuff pips, cast bars, floaters (`§4`) | Situational |

**Information hierarchy** (drives size, contrast, and motion, per the research tiers):

1. **Critical** — low-HP warning, hard CC on your hero, an enemy ult incoming. Large, high-contrast, animated.
2. **Important** — your HP/mana, ability cooldowns, the active objective. Medium, always legible.
3. **Informational** — XP gained, gold pickups, minor buffs. Small, subtle.
4. **Ambient** — clock, exploration %, region name. Quiet, blends.

**Cross-cutting rules:**

- **One source of truth for controls and labels.** The HUD reads the live keymap (`§10`) for every hotkey glyph; no second hardcoded array.
- **UI scale and safe area.** A single `--ui-scale` multiplier (`§12`) on a root wrapper, 0.75×–1.5×, with a safe-area inset so nothing crops on odd aspect ratios. Minimum on-screen text 16px at 1× (per the accessibility floor in the research).
- **Progressive disclosure.** Persistent: bars, abilities, minimap, party. Contextual (fade in on relevance): buff icons, quest updates, killfeed, hints. Toggleable panels: character sheet, full quest journal, help overlay.
- **Accessibility is built in, not bolted on** (`§12`, extends `PRESENTATION_SPEC §7.3`): never color-only (icon + shape + color), respect `reducedMotion` on every tween, honor the colorblind palette on bars and status icons, and keep contrast at the WCAG AA floor.

---

## 2. THE COMMAND CARD

The bottom-center card (`renderHeroPanel`, `hud.ts:768`) is the densest, most-read surface. The build extends it without moving its logic.

### 2.1 Bars with the numbers the depth needs

- **HP / mana**: keep the numeric `current / max`, add the **tween + damage-ghost + low-HP pulse** from `PRESENTATION_SPEC §5.3`. Add a small **regen readout** inline (`+12.4/s`) and, on hover, a breakdown tooltip (base + item + talent + aura contributions, all already separable in the stat pipeline) and a "≈9s to full." Threshold colors keyed to the colorblind setting.
- **XP**: surface the data `xpProgress()` already returns — show `current / needed` and the remaining amount on or beside the bar (`hud.ts:892`), with the level number prominent. On level-up, a fill-to-full sweep and a ready-flash on any ability that just unlocked a point.
- **Mana-starved ability state**: the `nomana` class exists (`styles.css`); make it unmistakable (desaturated icon + a "need N mana" line in the tooltip).

### 2.2 Cooldown sweep and ready-flash

Replace the bottom-up height bar (`hud.ts:805`) with a **conic-gradient radial sweep** (`PRESENTATION_SPEC §5.3`), the numeric seconds-remaining centered, a **ready-flash + ability-ready blip** (`§11`) when it completes, and the existing rich hover card (`buildAbilityCard`). Items get the same sweep and a **rarity-colored border** matching the loot tiers (`PRESENTATION_SPEC §1.5`) so a legendary reads at a glance in the bag, shop, and loot beam alike.

### 2.3 A buff/debuff strip on the card

A compact status row docked to the command card (and mirrored on party frames, `§5`, and over-head, `§4`): one pip per active modifier, icon + duration ring + stack count, ordered debuffs-first (the things that can kill you read first). Tooltip on hover. This is the headline new readout — see `§4` for the full status system.

---

## 3. CHARACTER SHEET (new)

A toggleable panel that lists the active hero's **full derived build** — the data that today only appears in scattered hover tooltips. It is a pure read of the unit and `describe.ts` (`STAT_LABELS`, `statLines`, `hud.ts`-side formatting already exists), so it needs no core change.

Grouped, scannable, two columns:

- **Attributes** — STR / AGI / INT, primary highlighted, with each attribute's derived contribution (e.g. "STR → +HP, +regen").
- **Offense** — attack damage (base + bonus), attack speed (and attacks/sec), crit chance/mult, cast range, spell amp, lifesteal/spell lifesteal.
- **Defense** — armor (and % phys reduction), magic resist, status resist, evasion, max HP, HP regen (with breakdown).
- **Resources & utility** — max mana, mana regen, move speed, vision (day/night), cooldown reduction.
- **Talents & facet** — the chosen talent pips and facet, already rendered on the card (`hud.ts:859`), restated here with their effects.

Opened from a portrait click or a dedicated key (`§10`; default suggestion **`C`** is taken by an item slot, so bind it to a free key such as **`H`** for "hero," or open via the portrait and a party-frame click). The panel reads live, so it doubles as a "what did that buff just change" inspector.

---

## 4. STATUS EFFECTS — BUFFS & DEBUFFS (new)

The single largest information gap. The sim already tracks status (`worldStatusLabels`, `hud.ts:593` proves the data is reachable); the work is presenting it consistently in three places, all driven by one status view-model derived per unit:

- **On the command card** (`§2.3`) — the active hero's full modifier strip.
- **On party frames** (`§5`) — a condensed row (the few that matter: hard CC, big buffs).
- **Over a unit's head** in the world — small pips above the health bar for the selected/hovered unit and any unit under hard CC, so you can read a teamfight without selecting.

Each status renders **icon + shape + color** (never color alone), a **radial duration drain**, a **stack count**, and a hover tooltip with name and effect. Categorize for instant reading: **debuffs** (stun/silence/root/slow/disarm/break — red family, the "I can't act" tells), **buffs** (haste/shield/regen/damage — green/gold family), and **toggles/auras** (a steady, non-draining frame). A short list of "must-never-miss" statuses (stun, silence, hex, a death-relevant DoT) gets a brighter, larger treatment per the critical tier in `§1`.

This is where most of the **status-icon assets** are needed — see `§13`.

---

## 5. PARTY FRAMES

`renderParty()` (`hud.ts:718`) is bars-only today. Bring it to `PRESENTATION_SPEC §5.3` parity:

- **Attribute-colored portrait ring** (the palette is already on the def).
- **Tweened HP/mana bars** with the damage ghost, and a small numeric on hover.
- **Condensed status row** (`§4`) per frame.
- **Respawn sweep** — the dead state shows a radial countdown over a desaturated portrait instead of a bare `Ns` (`hud.ts:737`).
- **Clear active emphasis** and the existing click-to-swap, with the swap key glyph from the live keymap (`§10`).
- **Entourage** (fielded creeps) gets the same condensed treatment.

---

## 6. TOP BAR

`renderTopBar()` (`hud.ts:636`) is functional but dense. Per `PRESENTATION_SPEC §5.4`:

- **Day/night clock** → the existing sun/moon dial, refined into a small arc that reads day vs night at a glance and tints toward the time of day.
- **Region crest** beside the name, and an **earned-badge row** (badges are tracked progression already surfaced in the journal).
- **Collapse the key-hint string** (`hud.ts:666`) into a **toggleable help overlay** (`§10` renders it from the live keymap), leaving the top bar clean. A small `?`/`F1` opens it.
- Gold, stamina, moonflow, exploration keep their `PRESENTATION_SPEC §5.1` treatment.

---

## 7. QUEST TRACKER (new)

The Journal (`QUEST.md §6`) is the right *full* view, but the depth of the quest system earns a **persistent on-screen tracker** so the player always knows the next step without opening a modal.

- A compact, **pinnable** widget (right edge, `§1`) showing 1–3 tracked quests from `questBoard()`: name, the current objective with `progress / count`, and a "ready to claim" highlight when complete (mirrors the existing toast, `QUEST.md §6`).
- **Auto-track** the most relevant by the board's existing ordering (ready-to-claim, then local-region), with manual **pin/unpin** from the Journal so a player can lock onto a chosen chapter.
- **Minimap markers** (`§8`) driven by the tracked quest's objective target (a region's camps for a cull bounty, a gate for a `reach-region`, a gym/boss/dungeon for a clear), so "go here next" is spatial, not just textual. This reads the same `QuestObjective.regionId`/`targetId`/`tier` filters the core already defines (`QUEST.md §1`) — no new core primitive.
- Fully presentational: the tracker reads `questBoard()`, all gating stays in `Game`/core.

---

## 8. MINIMAP OVERHAUL

`renderMinimap()` (`hud.ts:670`) becomes interactive and informative. All additions are render/input-side; the POI data is what the region already exposes.

**Interaction** (the missing half):

- **Click-to-move** — left-click (or the move binding) on the minimap issues a move order to the projected world point (`scale = canvasSize / region.size` already maps both ways).
- **Click-to-look** — a modifier or middle-click recenters the camera there without moving (pairs with the map camera mode on `M`).
- **Ping** — Alt-click (`§10`) drops a timed ping at that point, the same ping system `PRESENTATION_SPEC §4.4` calls for in the world; shared code path.
- Honor `pointer` affordance and the UI-modal guard already used elsewhere.

**Readability:**

- **Camera-viewport rectangle** showing the current view bounds on the map.
- **Day/night tint** matching the world (the scene already computes day value).
- **Glowing, shaped POI dots** (icon/shape per type, not just color — accessibility), with a small **legend/filter** to toggle dense categories (shards, element sources) so the map does not clutter.
- **Quest markers** (`§7`) for tracked objectives, and ping/teammate markers.
- **Zoom/level-of-detail** if the region is large.

**Settings:** read `GameSave.settings.minimap` (it exists, `game.ts`), expose the toggle in options (`§12`), and add a size/opacity option per the layout-customization research.

---

## 9. NOTIFICATIONS & FEED

Extend the existing toast/floater system (`renderToasts`, `hud.ts:933`; floaters per `PRESENTATION_SPEC §4.3`):

- **Per-type iconography and styling** on toasts (info / good / bad / bark), with celebratory treatment for level-ups, badges, and loot (`PRESENTATION_SPEC §5.4`).
- **A compact killfeed lane** for notable kills (heroes, echoes, bosses) and multi-kill banners (`PRESENTATION_SPEC §4.5`), kept in its own lane so it does not crowd toasts.
- **Objective-update flashes** — a tracked quest advancing flashes the tracker (`§7`) and drops a quiet toast, per the "flash on update, then hide" pattern.
- A hard cap on simultaneous notifications (the existing 6-stack limit is the right instinct; keep it).

---

## 10. INPUT & CONFIGURABLE KEY BINDINGS (new)

Today every binding is a hardcoded literal in `input.ts` and a *duplicate* set of glyphs in `hud.ts`. Replace both with one configurable keymap.

### 10.1 Data model (in settings, read by input and HUD)

A closed vocabulary of actions, each with a default key, stored in `GameSave['settings']` so it round-trips through save/load and never touches the core:

```ts
type InputAction =
  | 'move' | 'attack-move' | 'stop' | 'dash' | 'sprint'        // movement
  | 'ability-1' | 'ability-2' | 'ability-3' | 'ability-4' | 'ability-5' | 'ability-6'
  | 'item-1' | 'item-2' | 'item-3' | 'item-4'                  // active item slots
  | 'swap-1' | 'swap-2' | 'swap-3' | 'swap-4' | 'swap-5'       // hero swap
  | 'capture' | 'interact' | 'shop' | 'services' | 'neutral'
  | 'party' | 'journal' | 'codex' | 'character-sheet'
  | 'menu' | 'camera-mode' | 'help' | 'ping' | 'quicksave';

interface KeyBindings {
  bindings: Partial<Record<InputAction, string>>;  // sparse: missing = default
  mouseMoveButton: 'right' | 'left';               // RMB-move (default) vs LMB-move schemes
  quickcast: boolean;                              // global default (exists today)
  quickcastPerAbility?: Partial<Record<string, boolean>>;  // optional per-slot override
}
```

A `DEFAULT_BINDINGS` table holds today's layout (the file header in `input.ts:5` documents it), so an empty/old save plays identically — the same additive-default pattern quests used (`QUEST.md §4`).

### 10.2 Input reads the keymap

`InputController` resolves the action for a pressed key through the merged `DEFAULT_BINDINGS` + overrides instead of comparing string literals (`input.ts:267`, `312`). The cinematic/modal guards and the `e.repeat` quickcast guard (`input.ts:264`) stay. Reserved/unrebindable keys (Esc, the cinematic controls) are flagged so the UI cannot strand the player.

### 10.3 The HUD reads the same keymap

Every hotkey glyph on the command card, party frames, and help overlay comes from the resolved keymap, killing the `hud.ts:27` duplicate and the drift it invites.

### 10.4 Rebinding UI (in settings, `§12`)

A controls tab listing every action grouped (movement / abilities / items / interface), each row showing its current key with a "press a key to rebind" capture. **Conflict detection** flags a key already in use and offers swap-or-cancel. A **reset-to-defaults** button per group and globally. Mouse scheme (RMB vs LMB move) and the global/per-ability quickcast toggles live here too. A **rebind plays the UI confirm cue** (`§11`).

---

## 11. UI & INTERACTION AUDIO (new)

`audio.ts` is sim-event-driven and excellent (`SOUND_MAP.md`), but the *interface* is silent. Add a UI audio layer on the existing bus graph — procedural-first per the project's policy, with optional CC0 samples layered on medium+ tiers exactly like casts.

- **A UI sub-bus** off the master (alongside sfx/music/stinger, `PRESENTATION_SPEC §2.1`) with its own volume so UI clicks never fight combat audio; routed through the same limiter.
- **The core UI cues**, each a short procedural envelope (and an optional sample):
  - **Hover** — a soft, quiet tick on buttons, slots, and party frames.
  - **Click / confirm** — a crisp, brighter click on any actionable press, including **mouse clicks that issue orders** (move/attack confirm) so the world responds audibly to the cursor.
  - **Open / close** — distinct whooshes for opening vs closing a modal/menu, so the menu state is audible.
  - **Error / invalid** — a low buzz for a blocked action (no mana, no target, illegal rebind), pairing with the existing `g.msg('…','bad')`.
  - **Ability-ready blip** — fires when a cooldown completes (`§2.2`).
  - **Low-HP heartbeat** — a slow pulse that fades in under ~25% HP (named in `PRESENTATION_SPEC §2.4`), respecting reduced-motion/photosensitivity by capping intensity.
  - **Tab / toggle** — a light cue for swapping heroes, tabs, and pins.
- **Order feedback in the world**: a move/attack order plays the click cue and pings the ground (pairs with `PRESENTATION_SPEC §4.4` target-ping), so issuing orders feels tactile.
- **Settings**: the UI bus gets a slider (`§12`); mute-on-blur already planned (`PRESENTATION_SPEC §2.1`) covers it.

Cues are generated by extending `scripts/assets/generate_audio.mjs` (it already emits the cast and stinger beds) with a small set of UI one-shots, and `engine/audio.ts` gains a `playUi(kind)` entry the HUD calls. The synth path stays the guaranteed floor; samples are the enhancement.

---

## 12. SETTINGS & OPTIONS SURFACE

Extend `renderMenuModal()` (`hud.ts:2879`) — which already pauses and exposes deep graphics/audio (`GraphicsSettings`, `types.ts:326`) — with the control and layout surface it lacks. This is the home of `PRESENTATION_SPEC §7` for the HUD side.

- **Controls tab** — the full rebinding UI (`§10.4`), mouse scheme, quickcast.
- **Interface tab** —
  - **UI scale** slider (0.75×–1.5×, `§1`), applied via `--ui-scale`.
  - **Minimap** toggle (finally honoring `settings.minimap`), plus minimap size/opacity.
  - **HUD opacity** for non-critical panels, and a **help-overlay** toggle.
  - **Quest tracker** on/off and max tracked count.
- **Audio tab** — add the **UI bus** slider (`§11`) beside the existing master/sfx/voice/stinger/music.
- **Accessibility** — surface the existing `reducedMotion` and `colorblind` here prominently (they exist in `GraphicsSettings`), add a **text-size** step if UI scale alone is insufficient, and keep every new UI animation behind the reduced-motion check.

Destructive actions (reset binds, quit, overwrite save) get the confirm step from `PRESENTATION_SPEC §6.2`.

---

## 13. ASSETS — CREATE, GENERATE, OR DOWNLOAD

Per `ASSETS.md`: **the build boots and looks intentional with `public/assets/` empty** — every asset here is an enhancement with a procedural floor, generated in-repo or downloaded CC0 (CC-BY only with attribution). The existing UI pipeline is the template: `scripts/assets/generate_ui_assets.mjs` already generates the carved frames, and `generate_item_icons.mjs` curates item glyphs from game-icons.net. Each new asset gets a generator or a vendored-row in `ASSETS.md` and lands in `public/assets/manifest.json`.

Research note: the strong CC0 sources for this kind of work are **Kenney** (`kenney.nl` — UI packs, RPG icons, click/hover SFX, all CC0), **game-icons.net** (1-color SVG, CC BY 3.0 — already in use under `CREDITS.md`), and **Foozle** RPG UI sets (`foozlecc.itch.io`, CC0). All are license-compatible; never Valve/Blizzard files (`ASSETS.md` policy).

| Asset | Need | Approach (generate-first) | Source / license |
|---|---|---|---|
| **Status icons** (buff/debuff/aura — stun, silence, root, slow, disarm, break, haste, shield, regen, damage-up, toggles) | `§4`, the biggest gap | Curate single-path SVGs the way `generate_item_icons.mjs` already does, tinted by category; procedural shape fallback as the floor | game-icons.net (CC BY 3.0) → `CREDITS.md`; or generate originals |
| **Cursors** (default, move, attack-move/crosshair, cast/target, invalid) | `input.ts:82` sets only CSS cursors today | Generate small SVG/PNG cursors via `generate_ui_assets.mjs`; CSS `cursor:` fallbacks stay | Generate in-repo (Original) |
| **Minimap POI glyphs & ping markers** | `§8` shaped dots + pings | Generate a tiny glyph atlas (camp, gate, gym, dungeon, shrine, town, chest, shard, quest, ping) | Generate in-repo (Original) |
| **UI SFX** (hover, click/confirm, open, close, error, ability-ready, low-HP heartbeat, tab) | `§11` | Extend `generate_audio.mjs` with UI one-shots; optional curated variants | Generate (Original); Kenney UI/interface SFX (CC0) as layered variants |
| **Quest tracker & character-sheet frames** | `§3`, `§7` panels | Extend `generate_ui_assets.mjs` (it already makes parchment/carved/gem/portrait frames) | Generate in-repo (Original) |
| **Region crests / badge glyphs** | `§6` top bar | Generate per-region/per-badge SVG crests | Generate in-repo (Original) |
| **Attribute/element status tints** | `§4`, `§5` rings | CSS/palette only, no new file | n/a |

Wiring for any download stays the same: raw pack → `tmp/asset_src/` (gitignored) → optimized into `public/assets/ui/` by `build_assets.mjs` → a spec JSON under `scripts/assets/specs/` → a row in `ASSETS.md` → `assets:check` green. CC-BY attribution (game-icons.net) goes in `CREDITS.md`.

---

## 14. PERSISTENCE & THE HEADLESS CONTRACT

- New settings (`KeyBindings`, UI scale, minimap on/off + size/opacity, HUD opacity, UI volume, quest-tracker prefs) live in `GameSave['settings']`, read by input/engine/UI and **never by `src/core/`**.
- Bump `SAVE_VERSION` with a `migrate…Save` that defaults the new fields (sparse keymap = all defaults), matching the additive pattern in `QUEST.md §4`. Old saves load clean and pick everything up live.
- `src/test/boundary.test.ts` stays green; the determinism hashes (`OPTIMIZATION_SPEC.md §D.2`) are byte-identical because none of this is sim state.

---

## 15. PHASING & ACCEPTANCE

Ordered by felt value against blast radius. Each step ships playable on its own.

1. **Information gaps (`§2.1`, `§3`, `§4`).** Pure reads of existing data, highest clarity payoff, no new dependency. XP-to-next on the card, the buff/debuff strip on hero + party + over-head, and the character sheet. **Done when** a stun shows an icon with a draining ring on the affected unit, the XP readout shows `current / needed`, and the sheet lists the hero's full derived build live.
2. **Configurable keybinds (`§10`).** The keymap layer behind input and HUD, plus the rebinding UI. **Done when** rebinding an ability key takes effect in input *and* updates the on-card glyph, conflicts are caught, defaults restore, and the map round-trips through save/load.
3. **UI audio (`§11`).** The UI bus and the core cues, including mouse-order clicks and menu open/close. **Done when** hovering, clicking, opening/closing menus, an illegal action, and an ability coming off cooldown each sound distinct, all scale with the UI volume slider, and reduced-motion/photosensitivity cap the heartbeat.
4. **Minimap overhaul (`§8`).** Click-to-move, click-to-look, ping, viewport rect, day/night tint, shaped POIs, and honoring `settings.minimap`. **Done when** a minimap click moves the hero, the viewport rectangle tracks the camera, and the minimap toggle in options hides/shows it.
5. **Quest tracker (`§7`) + notifications/feed (`§9`).** The pinned tracker, quest-driven minimap markers, and the killfeed lane. **Done when** a tracked objective shows progress on-screen, its target marks the minimap, completing it flashes the tracker, and notable kills feed a lane without crowding toasts.
6. **Top bar, command-card polish, party frames (`§2.2`, `§5`, `§6`).** Cooldown sweeps, rarity borders, respawn sweeps, the clock arc, badge row, and the collapsed help overlay. **Done when** `PRESENTATION_SPEC §5.5` passes for these surfaces.
7. **Settings surface + accessibility (`§12`).** The controls/interface/audio/accessibility tabs, UI scale, HUD opacity. **Done when** every new toggle applies live, persists, and the whole HUD respects UI scale and reduced motion.
8. **Assets (`§13`), folded into each phase as it needs them** (status icons land with `§4`/phase 1, cursors and UI SFX with phases 3–4, frames/crests with phase 6).

**The whole spec is done when:** a player can read a fight's status at a glance, see exactly how far to the next level and what their build does, rebind every control and have the HUD agree, hear the interface respond to clicks and menus, command and ping from an interactive minimap that they can also turn off, always know the next quest step on-screen, and scale or simplify the whole HUD for their setup — and `npm test`, `npm run build`, the browser smoke, the boundary test, and the determinism hashes all stay green.

---

## 16. PRINCIPLES

- **The core is sacred.** The HUD reads view-models and settings; it never writes sim state. Boundary and determinism tests are the contract (`SPEC.md §1.1`).
- **Show the depth, don't bury it.** The game already computes regen breakdowns, full derived stats, and status timers. The job is to surface them legibly, not to invent data.
- **One source of truth for controls.** Input and HUD read the same keymap. A glyph on a button is the key that actually fires.
- **Read at a glance, disclose the rest.** Critical info is large, contextual info fades in, everything else is a toggle. Never color alone.
- **The interface should respond.** A click clicks, a menu opens with sound, an illegal action buzzes, an ability ready blips. Silence is a missing feature.
- **Scale and simplify gracefully.** UI scale, HUD opacity, minimap toggle, reduced motion, colorblind-safe — every surface has a knob, and the game stays fully playable at every setting.
- **Generate first, download CC0 second, fake nothing.** Every asset has a procedural floor and a license row. The build looks intentional with `public/assets/` empty.
