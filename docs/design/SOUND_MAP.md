# Sound Map

This is the finished gameplay audio map for `ANCIENTS`. It covers cast voices,
combat one-shots, positional mix, music beds, and the asset/test contract that
keeps them wired. UI interaction audio is tracked separately in
`docs/design/HUD_UI_OVERHAUL.md`.

The rule is simple: every sound has a procedural floor, and samples only make it
richer. Low tier, headless tests, missing files, decode failures, and an empty
`public/assets/` still produce valid sound through `ProceduralAudio`.

## Runtime Routing

Cast audio flows through one closed vocabulary:

1. A hero ability, creep ability, or item active may author `sound` directly.
2. If it does not, `soundForAbility()` in `src/core/gestures.ts` infers one
   `SoundArchetype` from effects, element, targeting, and VFX archetype.
3. The sim emits a `cast` event with that sound and the caster timbre.
4. `Game` resolves the event position with `eventWorldPos()` and passes it to
   `ProceduralAudio.handleEvent(ev, at)`.
5. `ProceduralAudio.castVoice()` plays the synth voice and, on medium+ tiers,
   layers the sampled cue from `CAST_SFX_BY_SOUND`.

Samples are runtime URLs under `/assets/audio`, decoded by
`SampledAudioBank`. Source files are never imported from `src`, which keeps the
no-asset-import guard meaningful and lets the procedural floor boot first.

## Cast Archetypes

`SoundArchetype` is intentionally small. Add a new archetype only when the mix
needs a distinct family that existing synth and sample layers cannot express.

- `blade`: weapon slashes, attack modifiers, melee spell strikes. Generated
  fallback: `audio/sfx/cast-blade.wav`. Curated variants: Kenney blade draw and
  blade whoosh cues.
- `bow`: arrows, bullets, thrown projectiles, ranged releases. Generated
  fallback: `audio/sfx/cast-bow.wav`. Curated variants: Kenney blade whoosh and
  projectile tick cues.
- `impact`: stone, body, punch, slam, geo, hook, stun-star, and generic physical
  hits. Generated fallback: `audio/sfx/cast-impact.wav`. Curated variants:
  Kenney heavy punch impacts.
- `frost`: cryo casts, ice walls, cold shields, slows, and winter ultimates.
  Generated fallbacks: `audio/sfx/cast-frost.wav`, `cast-frost-2.wav` (brittle
  crack), and `cast-frost-3.wav` (glassy chime). There is no curated CC0 cryo
  source in the current subset.
- `fire`: pyro casts, flame dashes, explosions, and burning ultimates. Generated
  fallbacks: `audio/sfx/cast-fire.wav`, `cast-fire-2.wav` (deep whoomp), and
  `cast-fire-3.wav` (sharp burst). There is no curated CC0 flame source in the
  current subset.
- `storm`: wind, water, anemo, hydro, beam, cyclone, and storm-body spells.
  Generated fallback: `audio/sfx/cast-storm.wav`. Curated variants: Kenney
  phaser and rising zap cues. Use `storm` for air, weather, water, and broad
  energy movement.
- `void`: portals, global marks, domes, channels, swaps, vortices, and dark
  ultimates. Generated fallback: `audio/sfx/cast-void.wav`. Curated variants:
  Kenney phase jumps.
- `heal`: direct heals, restoration spells, and protective recovery. Generated
  fallback: `audio/sfx/cast-heal.wav`. Curated variants: Kenney power-up tones.
- `summon`: wards, familiars, illusions, golems, spiderlings, and spawn effects.
  Generated fallback: `audio/sfx/cast-summon.wav`. Curated variants: Kenney
  power-up tones.
- `item`: shields, tools, mines, utility actives, and neutral item-style casts.
  Generated fallback: `audio/sfx/cast-item.wav`. Curated variants: Kenney
  three-tone item cues.
- `roar`: transformations, primal shouts, stampedes, berserks, and huge strength
  ultimates. Generated fallbacks: `audio/sfx/cast-roar.wav`, `cast-roar-2.wav`
  (guttural growl), and `cast-roar-3.wav` (long bellow). Author this explicitly
  on signature abilities; inference does not guess primal intent from mechanics.
- `lightning`: chain lightning, electro casts, zaps, and bolt ultimates.
  Generated fallback: `audio/sfx/cast-lightning.wav`. Curated variants: Kenney
  zap cues. Use `lightning` for electric signatures; keep `storm` for wind,
  water, and non-electric weather.

## Inference Rules

Explicit `sound` data wins. The fallback resolver then follows these broad
rules:

- Summons and `summon-pop` VFX resolve to `summon`.
- Pure recovery resolves to `heal`.
- Attack modifiers resolve to `blade`.
- Elements map to their families: `pyro` -> `fire`, `cryo` -> `frost`,
  `electro` -> `lightning`, `anemo`/`hydro` -> `storm`, `dendro` ->
  `heal` or `summon`, and `geo` -> `impact`.
- VFX archetypes cover the rest: `projectile` -> `bow`, `beam` -> `storm`,
  `chain` -> `lightning`, `hook` -> `impact`, `wall` -> `frost`, `shield` ->
  `heal` or `item`, `channel`/`global-mark`/`vortex`/`dome` -> `void`,
  `mine` -> `item`, and plain `ground-aoe` -> `impact`.

Use explicit `sound` when theme beats mechanics. Examples: a strength ultimate
with ordinary stat mods can still be `roar`; a portal-flavored spell with damage
can still be `void`.

## Sampled SFX Bank

`src/engine/sampled-audio.ts` is the sampled source of truth:

- `MUSIC_BEDS`: `grass`, `forest`, `snow`, `desert`, `wasteland`, `coast`.
- `SFX_KEYS`: `crit`, `impact-heavy`, `fanfare`, `whoosh`, `projectile-hit`,
  `blade-draw`, `coin`, and one `cast-*` key for every `SoundArchetype`.
- `CAST_SFX_BY_SOUND`: the required map from every cast archetype to its sampled
  cast cue.
- `SFX_VARIANTS`: the generated WAV and any curated Kenney CC0 OGG variants for
  each key. `frost`, `fire`, and `roar` use generated rotation variants because
  the curated subset has no matching cryo, flame, or beast source.

`SampledAudioBank.prefetch()` starts decode work after audio unlock. Getters
return `null` until a buffer is ready or when loading fails, so callers can
always keep playing the synth path.

Generated audio comes from `scripts/assets/generate_audio.mjs`:

```sh
npm run generate:audio
npm run assets:manifest
npm run assets:check
```

Curated CC0 variants live under `public/assets/audio/sfx/kenney/` and are
recorded in `ASSETS.md`. Generated WAVs are original in-repo assets.

## Gameplay Event Cues

`ProceduralAudio.handleEvent()` scores the sim events that are not casts:

- `attack-launch`: ranged release, bow/gun/thrown whoosh before the projectile
  arrives.
- `attack-impact`, `projectile-hit`, `damage`: contact and damage-body hits.
  Damage is tinted by damage type and throttled so a large AoE reads as one
  crunch instead of a machine-gun stack.
- `miss` and `projectile-expire`: soft whiffs and fizzles when attacks or shots
  fail to land.
- `crit`: sampled ring plus synth body and a short reverb tail.
- `death`: low sawtooth fall into noise, with reverb for space.
- `revive`: Aegis/Reincarnation rise and shimmer.
- `immune-block`: bright metallic deflect for BKB and magic-immunity blocks.
- `blink`: vacuum out, then snap back in.
- `summon`: soft materialize pop, throttled so waves read as one swell.
- `aoe-burst`: low whoomp scaled by blast radius, throttled and reverbed.
- `status-apply`: hard crowd-control landings only: `stun`, `frozen`, `hex`,
  `sleep`, `fear`, `root`, `taunt`, and `cyclone`. Soft and frequent carriers
  stay silent: buff, slow, invis, break, disarm, blind, silence, magic-immune.
- `zone-spawn` and `zone-expire`: persistent ground zones get a spawn whoomp and
  a quiet looping ambient bed for their lifetime. The bed is capped at five
  concurrent zones and is torn down on expire or by a duration backstop.
- `capture-start`, `capture-complete`, `capture-interrupt`: rising lock-on,
  capture fanfare, and downward fizzle.
- `gold`, `levelup`, `skill-spend`, `item-used`, `heal`, `reaction`, `bark`:
  dedicated short cues on the appropriate channel.

Celebratory stingers (`capture`, `merge`, `levelup`, `badge`, `raid-clear`,
`loot`, `loot-signature`) layer sampled `fanfare` on medium+ and keep their
synth arpeggios as the floor.

## Positional Mix

Gameplay cues are spatialized against the followed hero:

- `Game` calls `setListener()` once per frame.
- `eventWorldPos()` prefers explicit `pos` or `point`, then target/caster unit
  lookup, then no position.
- Positional cues use `StereoPannerNode` when available and fall back to centered
  audio on older WebAudio.
- Distance attenuation is full inside `ATTEN_NEAR` (`320` world units), reaches
  the floor past `ATTEN_FAR` (`2600`), and keeps off-screen events audible at
  `ATTEN_FLOOR` (`0.34`).
- Horizontal pan uses `PAN_REF` (`1100`) and `PAN_STRENGTH` (`0.85`), so cues can
  read left or right without hard-panning fully into one ear.
- UI/global cues with no resolved position stay centered at full volume.

The mix routes through the existing channel sliders: `master`, `sfx`, `voice`,
`stinger`, and `music`. A master compressor catches stacked peaks. Impactful
one-shots can send a small amount to the shared convolver reverb; headless runs
skip the reverb bus entirely.

`CinematicMixMode` applies on top of the channel mix: `normal`, `duck`, or
`silence`. Cutscenes can quiet music and dialogue blips without changing saved
volume settings.

## Load Control

The audio system has to survive creep waves, summons, and teamfight bursts:

- Cast and bark voices go through a capped voice pool (`TUNING.audioVoiceCap`).
- Damage, projectile hits, projectile fizzles, crowd-control landings, summons,
  AoE bursts, and zone spawns each have short-window throttles.
- Zone ambience is capped by `ZONE_BED_CAP`.
- Global mute bypasses synthesis and never opens an `AudioContext`.
- `dispose()` is idempotent and tears down event listeners, samples, music, and
  zone beds.

## Music Beds

Each biome ships one 44.1 kHz stereo looping bed generated in-repo:

- `audio/music/grass.wav`
- `audio/music/forest.wav`
- `audio/music/snow.wav`
- `audio/music/desert.wav`
- `audio/music/wasteland.wav`
- `audio/music/coast.wav`

On medium+ tiers, `ProceduralAudio.update()` plays the current biome bed,
ramps its gain, ducks it in combat and at night, and swaps it when the biome
changes. The bed uses the `music` volume channel, separate from `sfx`, `voice`,
and `stinger`.

The procedural synth drone is the music floor. It plays when no composed bed is
sounding, such as low tier or before the current bed has decoded. It is mixed
below SFX and ducks in combat and at night like the sampled bed. On medium+ the
composed bed leads and the synth drone stays off unless the dev `musicEnabled`
flag is flipped.

## Maintenance Checklist

When adding or changing cast audio:

1. Prefer existing `SoundArchetype` values.
2. Add explicit `sound` to data when theme needs it.
3. If a new archetype is truly needed, update `SoundArchetype`,
   `CAST_SAMPLE_VOLUME`, `CAST_SFX_BY_SOUND`, `SFX_KEYS`, `SFX_VARIANTS`,
   `scripts/assets/generate_audio.mjs`, and the tests that list valid sounds.
4. Regenerate audio and the asset manifest.
5. Confirm the generated or curated files have rows in `ASSETS.md`.

When adding a new gameplay event cue:

1. Add or reuse a `SimEvent` type in `src/core/types.ts`.
2. Dispatch it from sim/game code with a world position when the cue belongs in
   the scene.
3. Handle it in `ProceduralAudio.dispatchEvent()`.
4. Put frequent events behind a throttle or the voice pool.
5. Route it to the correct channel and decide whether it needs reverb.
6. Add a headless safety assertion in `src/test/audio.test.ts`.

## Coverage

The contract is enforced by tests:

- `src/test/audio.test.ts` checks that every hero ability, creep ability, and
  item active resolves to a valid `SoundArchetype`.
- The same test requires every `SoundArchetype` to map through
  `CAST_SFX_BY_SOUND` to a key in `SFX_KEYS`.
- Sampled URLs are checked against real shipped files and valid WAV/OGG headers.
- Headless construction, mute, dispose, sampled-audio fallback, positional event
  resolution, music routing, and the voice pool cap are covered.
- `src/test/data-lint.test.ts` also verifies resolved sound archetypes across
  authored data.
- Test 21 keeps `src` free of raw audio/image/model imports.

The asset source of truth is split deliberately: generated originals live in
`scripts/assets/generate_audio.mjs`, curated CC0 variants live under
`public/assets/audio/sfx/kenney/`, runtime lookup lives in
`src/engine/sampled-audio.ts`, and provenance lives in `ASSETS.md`.
