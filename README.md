# Ancients

Ancients is a browser-based 3D open-world RPG prototype built with Vite, Three.js, and vanilla TypeScript. It blends Dota-style heroes, spells, items, and teamfight decisions with a creature-capture overworld structure and a repeatable action-RPG loot loop.

The project uses no external art assets. Units, terrain, icons, VFX, and UI are generated from code and data.

## Current State

Phase 2 is playable and passing. The current build includes:

- A deterministic, renderer-independent combat core that runs at a fixed 30 Hz.
- Three playable regions: Tranquil Vale, Nightsilver Woods, and Icewrack, with towns, shrines, shops, camps, gates, echoes, gyms, and map markers.
- Twenty data-driven heroes with talents, facets, recruitment quests, and Phase 2 echo progression.
- Dota-inspired abilities, statuses, items, cooldowns, projectiles, capture, creep merging, entourage fielding, XP, gold, save/load, badge-gated travel, gambits, and macro gyms.
- A procedural Three.js overworld with gameplay and map camera modes.
- Headless vitest coverage for data linting, combat determinism, capture/merge behavior, boundary checks, item identity, saves, and macro simulation.

See `SPEC.md` for the full design target, `PROGRESS.md` for the current acceptance status, and `DECISIONS.md` for implementation calls made along the way.

## Requirements

- Node.js 20 or newer
- npm
- A WebGL2-capable desktop browser, targeted at current Chrome

## Setup

```sh
npm install
```

## Run

```sh
npm run dev
```

Open the Vite URL in your browser, start a new game, and choose a starter hero.

## Useful Commands

```sh
npm test          # run the vitest suite
npm run build    # typecheck and build the Vite app
npm run typecheck # run TypeScript without emitting
```

## Controls

- Right-click ground: move
- Right-click unit: attack or interact
- `Q/W/E/R`: hero abilities
- `D/F`: extra active ability slots, when available
- `Z/X/C/V`: item actives
- `1-5`: swap active party hero
- `T`: channel Binding Totem on a weakened creep
- `G`: interact with nearby gates and gyms
- `B`: shop while in town
- `Tab`: party, inventory, and caught creep panel
- `M`: toggle map view
- `Esc`: pause, save, and load

Quick-cast is enabled by default.

## 60-Second Demo

1. Run `npm run dev`, open the local Vite URL, click **New Game**, and pick Juggernaut.
2. In Dawnshade, press `B`, open **Components**, buy **Blink Dagger**, close the shop, and press `Z` at the cursor to blink.
3. Right-click a recruitable hero to Find, right-click again to complete their trial, then defeat the Binding Echo to recruit them.
4. Press `Tab` to set gambit presets, inspect echo progress, and swap facets after an echo unlock.
5. Fight a hero echo marker to unlock a talent branch/facet benefit, then travel through gates with `G`.
6. Challenge the Lunar and Frost Gyms with `G`; badges, quests, gambits, echoes, party, inventory, and region persist through save/load.

## Architecture

```text
src/core/     deterministic combat simulation, stats, statuses, items, capture, AI, progression
src/data/     heroes, items, creeps, regions, tuning, and content registration
src/engine/   Three.js scene, camera, procedural models, terrain, animation, VFX, icons
src/systems/  game orchestration, input, debug tools, save/load, overworld state
src/ui/       title screen, HUD, panels, and styles
src/test/     vitest suites for core behavior, data, saves, boundaries, and simulations
```

The core rule is that `src/core/` stays headless: it does not import Three.js or touch the DOM. Rendering and UI consume core state, while tests can run combat and progression logic without a browser.

Content is intended to be data-driven. Adding heroes, items, creeps, or regions should primarily mean adding definitions under `src/data/`, with generic systems interpreting those definitions.

## Project Constraints

- Browser only, single-player only.
- Vite + Three.js + TypeScript + Vitest, with no game engine.
- Procedural visuals and generated icons only.
- Dota-style mechanical identity matters: abilities and items should feel recognizable even when tuned for action-RPG pacing.
- `npm test` should stay green after content and systems changes.
