import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../data';
import { ALL_ITEMS } from '../data/items';
import { ALL_CREEPS } from '../data/creeps';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { soundForAbility } from '../core/gestures';
import { ProceduralAudio } from '../engine/audio';
import { eventWorldPos, Game, HeadlessScene, newGameSave, type AudioLike } from '../systems/game';
import { CAST_SFX_BY_SOUND, SampledAudioBank, MUSIC_BEDS, SFX_KEYS, musicAssetUrl, sfxAssetUrls } from '../engine/sampled-audio';
import { TUNING } from '../data/tuning';
import type { GameSave, SimEvent, SoundArchetype, Vec2 } from '../core/types';

beforeAll(() => registerAllContent());

const VALID_SOUNDS: SoundArchetype[] = [
  'blade', 'bow', 'impact', 'frost', 'fire', 'storm', 'void', 'heal', 'summon', 'item', 'roar', 'lightning'
];

function settings(muted = false): GameSave['settings'] {
  return { quickcast: false, audio: { master: 0.8, sfx: 0.8, voice: 0.7, stinger: 0.7, music: 0.6, muted } };
}

function castEvent(uid: number): SimEvent {
  return { t: 'cast', uid, abilityId: `a${uid}`, vfx: { archetype: 'projectile', color: '#fff' }, sound: 'blade', timbre: 'sharp' };
}

function sampledPublicPath(url: string): string {
  expect(url, `sampled audio URL must stay under /assets/audio: ${url}`).toMatch(/^\/assets\/audio\//);
  return fileURLToPath(new URL(`../../public${url}`, import.meta.url));
}

class RecordingLoopAudio implements AudioLike {
  updates: { biome: string; dayTime: number; inCombat: boolean; dt: number }[] = [];
  setSettings(): void {}
  handleEvent(): void {}
  playStinger(): void {}
  update(env: { biome: string; dayTime: number; inCombat: boolean; dt: number }): void {
    this.updates.push(env);
  }
}

function fullPartySave(regionId = 'tranquil-vale'): GameSave {
  const save = newGameSave('juggernaut');
  const heroes = ['juggernaut', 'sven', 'sniper', 'lich', 'earthshaker'];
  const template = structuredClone(save.roster[0]);
  const region = REG.region(regionId);
  save.regionId = regionId;
  save.worldSeed = region.seed;
  save.playerPos = { ...region.town.pos };
  save.party = heroes;
  save.recruited = heroes;
  save.roster = heroes.map((heroId) => ({ ...structuredClone(template), heroId, level: 30, hpPct: 1, manaPct: 1 }));
  return save;
}

function gameWithAudio(save: GameSave, audio: RecordingLoopAudio): Game {
  return new Game(null, save, { scene: new HeadlessScene(), audio });
}

// ---------- Test 20: audio-coverage + safety ----------

describe('test 20 — audio-coverage + safety', () => {
  it('every ability and item active resolves to a valid sound archetype', () => {
    for (const hero of ALL_HEROES) {
      for (const ab of hero.abilities) {
        expect(VALID_SOUNDS, `${hero.id}/${ab.id}`).toContain(soundForAbility(ab));
      }
    }
    for (const creep of ALL_CREEPS) {
      for (const ab of creep.abilities ?? []) {
        expect(VALID_SOUNDS, `${creep.id}/${ab.id}`).toContain(soundForAbility(ab));
      }
    }
    for (const item of ALL_ITEMS) {
      if (item.active) expect(VALID_SOUNDS, `item:${item.id}`).toContain(soundForAbility(item.active));
    }
  });

  it('maps every spell sound archetype to a sampled cast cue', () => {
    const keys = new Set(SFX_KEYS);
    for (const sound of VALID_SOUNDS) {
      expect(keys, sound).toContain(CAST_SFX_BY_SOUND[sound]);
    }
    for (const hero of ALL_HEROES) {
      for (const ab of hero.abilities) {
        expect(keys, `${hero.id}/${ab.id}`).toContain(CAST_SFX_BY_SOUND[soundForAbility(ab)]);
      }
    }
    for (const creep of ALL_CREEPS) {
      for (const ab of creep.abilities ?? []) {
        expect(keys, `${creep.id}/${ab.id}`).toContain(CAST_SFX_BY_SOUND[soundForAbility(ab)]);
      }
    }
    for (const item of ALL_ITEMS) {
      if (item.active) expect(keys, `item:${item.id}`).toContain(CAST_SFX_BY_SOUND[soundForAbility(item.active)]);
    }
  });

  it('uses the lightning archetype for electric chain signatures', () => {
    const leshrac = REG.hero('leshrac');
    const lightningStorm = leshrac.abilities.find((a) => a.id === 'lesh-lightning-storm');
    expect(lightningStorm).toBeDefined();
    expect(soundForAbility(lightningStorm!)).toBe('lightning');
    expect(REG.item('mjollnir').active?.sound).toBe('lightning');
  });

  it('constructs, drives, and tears down without throwing (headless)', () => {
    expect(() => {
      const audio = new ProceduralAudio(settings());
      audio.unlock();
      audio.setListener({ x: 0, y: 0 });
      audio.handleEvent(castEvent(1));
      audio.handleEvent({ t: 'bark', uid: 1, line: 'For the Isle!' });
      // Every event type that now carries a cue should be safe to drive headless,
      // with and without a resolved world position (positional panning path).
      audio.handleEvent({ t: 'revive', uid: 1, pos: { x: 0, y: 0 } }, { x: 800, y: -400 });
      audio.handleEvent({ t: 'immune-block', uid: 1 }, { x: -3000, y: 0 });
      audio.handleEvent({ t: 'blink', uid: 1, from: { x: 0, y: 0 }, to: { x: 9, y: 9 } });
      audio.handleEvent({ t: 'summon', uid: 1, pos: { x: 0, y: 0 } });
      audio.handleEvent({ t: 'aoe-burst', pos: { x: 0, y: 0 }, radius: 600, vfx: { archetype: 'ground-aoe', color: '#fff' } }, { x: 1200, y: 200 });
      audio.handleEvent({ t: 'projectile-hit', pid: 1, pos: { x: 50, y: 0 } });
      audio.handleEvent({ t: 'projectile-expire', pid: 1, pos: { x: 50, y: 0 } }, { x: 50, y: 0 });
      audio.handleEvent({ t: 'zone-spawn', zid: 1, pos: { x: 0, y: 0 }, spec: { shape: 'circle', radius: 400, length: 0, width: 0, angle: 0, wall: false, duration: 4 }, vfx: { archetype: 'ground-aoe', color: '#fff' } }, { x: 200, y: 0 });
      audio.handleEvent({ t: 'zone-spawn', zid: 2, pos: { x: 0, y: 0 }, spec: { shape: 'line', radius: 0, length: 600, width: 60, angle: 0, wall: true, duration: 3 }, vfx: { archetype: 'wall', color: '#fff' } });
      audio.handleEvent({ t: 'zone-expire', zid: 1 });
      audio.handleEvent({ t: 'zone-expire', zid: 999 }); // unknown zid is a no-op
      audio.handleEvent({ t: 'capture-start', uid: 1, target: 2, duration: 3 });
      audio.handleEvent({ t: 'capture-interrupt', target: 2 });
      for (const status of ['stun', 'frozen', 'hex', 'sleep', 'fear', 'root', 'taunt', 'cyclone', 'slow', 'buff'] as const) {
        audio.handleEvent({ t: 'status-apply', uid: 1, status, duration: 2 });
      }
      audio.playStinger('badge');
      audio.playStinger('raid-clear');
      audio.setListener(null);
      audio.setCinematicMix('duck');
      audio.playDialogueBlip('Narration');
      audio.setCinematicMix('silence');
      audio.setCinematicMix('normal');
      audio.setSettings(settings(true));
      audio.dispose();
      audio.dispose(); // idempotent
    }).not.toThrow();
  });

  it('global mute fully bypasses synthesis (no context, no voices)', () => {
    const audio = new ProceduralAudio(settings(true));
    audio.unlock();
    for (let i = 0; i < 20; i++) audio.handleEvent(castEvent(i));
    audio.handleEvent({ t: 'revive', uid: 1, pos: { x: 0, y: 0 } });
    audio.handleEvent({ t: 'immune-block', uid: 1 });
    audio.handleEvent({ t: 'aoe-burst', pos: { x: 0, y: 0 }, radius: 400, vfx: { archetype: 'ground-aoe', color: '#fff' } });
    audio.handleEvent({ t: 'status-apply', uid: 1, status: 'stun', duration: 2 });
    audio.playStinger('merge');
    expect(audio.activeVoiceCount()).toBe(0);
    // muted never opens an AudioContext
    expect((audio as unknown as { ctx: unknown }).ctx).toBeNull();
  });

  it('the voice pool respects its concurrency cap under burst load', () => {
    const audio = new ProceduralAudio(settings());
    audio.unlock();
    for (let i = 0; i < 64; i++) audio.handleEvent(castEvent(i)); // far exceeds the cap
    expect(audio.peakVoiceCount()).toBeLessThanOrEqual(TUNING.audioVoiceCap);
    expect(audio.peakVoiceCount()).toBe(TUNING.audioVoiceCap); // burst saturates the pool
    expect(audio.activeVoiceCount()).toBeLessThanOrEqual(TUNING.audioVoiceCap);
  });

  it('honors a custom (smaller) cap', () => {
    const audio = new ProceduralAudio(settings(), 3);
    audio.unlock();
    for (let i = 0; i < 30; i++) audio.handleEvent(castEvent(i));
    expect(audio.peakVoiceCount()).toBe(3);
  });
});

// ---------- Test 20b: sampled-audio enhancement layer (synth stays the floor) ----------

describe('test 20b — sampled-audio layer', () => {
  it('the bank resolves null buffers headless (no fetch/decoder) without throwing', async () => {
    const fakeCtx = { decodeAudioData: undefined } as unknown as BaseAudioContext;
    const bank = new SampledAudioBank(fakeCtx);
    expect(() => bank.prefetch('grass')).not.toThrow();
    expect(bank.sfx('crit')).toBeNull();
    expect(bank.music('grass')).toBeNull();
    expect(bank.music('not-a-biome')).toBeNull(); // unknown bed → null, never a request
  });

  it('every shipped bed/sfx key is a distinct, non-empty identifier', () => {
    expect(new Set(MUSIC_BEDS).size).toBe(MUSIC_BEDS.length);
    expect(new Set(SFX_KEYS).size).toBe(SFX_KEYS.length);
    expect(MUSIC_BEDS.every((b) => b.length > 0)).toBe(true);
    expect(SFX_KEYS.every((k) => k.length > 0)).toBe(true);
  });

  it('every sampled audio URL points at a shipped audio file', () => {
    const urls = [
      ...MUSIC_BEDS.map(musicAssetUrl),
      ...SFX_KEYS.flatMap((key) => sfxAssetUrls(key))
    ];

    const missingOrInvalid = urls.filter((url) => {
      const file = sampledPublicPath(url);
      if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size <= 0) return true;
      const magic = readFileSync(file).subarray(0, 4).toString('ascii');
      return url.endsWith('.wav') ? magic !== 'RIFF' : url.endsWith('.ogg') ? magic !== 'OggS' : true;
    });

    expect(missingOrInvalid).toEqual([]);
  });

  it('enabling samples headless never opens a context or throws (synth floor intact)', () => {
    const audio = new ProceduralAudio(settings());
    expect(() => {
      audio.enableSampledAudio(true);
      expect((audio as unknown as { musicFloorEnabled: boolean }).musicFloorEnabled).toBe(true);
      audio.unlock();
      audio.handleEvent({ t: 'damage', uid: 1, from: 2, amount: 600, dtype: 'physical', crit: true });
      audio.handleEvent({ t: 'cast', uid: 1, abilityId: 'a1', vfx: { archetype: 'dome', color: '#fff' }, timbre: 'deep' });
      audio.playStinger('raid-clear');
      audio.update?.({ biome: 'snow', dayTime: 0.7, inCombat: true, dt: 0.05 });
      audio.update?.({ biome: 'desert', dayTime: 0.1, inCombat: false, dt: 0.05 });
      audio.enableSampledAudio(false);
      audio.dispose();
    }).not.toThrow();
    // headless has no AudioContext, so nothing should have been allocated
    expect((audio as unknown as { ctx: unknown }).ctx).toBeNull();
  });
});

// ---------- Test 20c: positional-audio event resolution ----------

describe('test 20c — positional event resolution', () => {
  // Minimal sim stub: only unit(uid) → { pos } is needed by eventWorldPos.
  const fakeSim = {
    unit: (uid: number): { pos: Vec2 } | undefined =>
      uid === 5 ? { pos: { x: 10, y: 20 } } : uid === 7 ? { pos: { x: -30, y: 40 } } : undefined
  } as unknown as Parameters<typeof eventWorldPos>[1];

  it('prefers an explicit pos/point, else looks the unit up', () => {
    expect(eventWorldPos({ t: 'aoe-burst', pos: { x: 1, y: 2 }, radius: 300, vfx: { archetype: 'ground-aoe', color: '#fff' } }, fakeSim)).toEqual({ x: 1, y: 2 });
    expect(eventWorldPos({ t: 'zone-spawn', zid: 1, pos: { x: 3, y: 4 }, spec: { shape: 'circle', radius: 200, length: 0, width: 0, angle: 0, wall: false, duration: 4 }, vfx: { archetype: 'ground-aoe', color: '#fff' } }, fakeSim)).toEqual({ x: 3, y: 4 });
    // cast: point wins over target/caster
    expect(eventWorldPos({ t: 'cast', uid: 5, abilityId: 'a', vfx: { archetype: 'projectile', color: '#fff' }, point: { x: 9, y: 9 } }, fakeSim)).toEqual({ x: 9, y: 9 });
    // cast: target unit when no point
    expect(eventWorldPos({ t: 'cast', uid: 5, abilityId: 'a', vfx: { archetype: 'projectile', color: '#fff' }, target: 7 }, fakeSim)).toEqual({ x: -30, y: 40 });
    // cast: caster when neither
    expect(eventWorldPos({ t: 'cast', uid: 5, abilityId: 'a', vfx: { archetype: 'projectile', color: '#fff' } }, fakeSim)).toEqual({ x: 10, y: 20 });
    // unit-keyed events
    expect(eventWorldPos({ t: 'damage', uid: 5, from: 7, amount: 10, dtype: 'physical' }, fakeSim)).toEqual({ x: 10, y: 20 });
    expect(eventWorldPos({ t: 'attack-impact', uid: 5, target: 7 }, fakeSim)).toEqual({ x: -30, y: 40 });
    // UI/global cues stay centered (undefined)
    expect(eventWorldPos({ t: 'gold', amount: 50, reason: 'kill' }, fakeSim)).toBeUndefined();
    expect(eventWorldPos({ t: 'levelup', uid: 5, level: 6 }, fakeSim)).toBeUndefined();
    // missing unit → undefined, never throws
    expect(eventWorldPos({ t: 'damage', uid: 999, from: 1, amount: 10, dtype: 'physical' }, fakeSim)).toBeUndefined();
  });
});

// ---------- Test 20d: live-session music routing ----------

describe('test 20d — live-session music routing', () => {
  it('keeps the combat music bed updated during live raids', () => {
    const audio = new RecordingLoopAudio();
    const game = gameWithAudio(fullPartySave('tranquil-vale'), audio);

    expect(game.startLiveRaid('roshan-pit', 'normal', { maxSec: 5 })).toBe(true);
    game.update(0.05);

    expect(audio.updates.at(-1)).toMatchObject({
      biome: REG.region('tranquil-vale').biome,
      dayTime: 0.5,
      inCombat: true
    });
  });

  it('keeps the combat music bed updated during live dungeons', () => {
    const audio = new RecordingLoopAudio();
    const game = gameWithAudio(fullPartySave('icewrack'), audio);

    expect(game.startDungeon('frost-hollow', 'normal', { seed: 1001 })).toBe(true);
    game.update(0.05);

    expect(audio.updates.at(-1)).toMatchObject({
      biome: REG.region('icewrack').biome,
      dayTime: 0.5,
      inCombat: true
    });
  });
});

// ---------- Test 21: no-asset guard ----------

describe('test 21 — no-asset guard', () => {
  const SRC = fileURLToPath(new URL('..', import.meta.url));
  const ASSET_IMPORT = /\b(?:import|from|require)\b[^;\n]*['"][^'"]+\.(?:png|jpe?g|gif|svg|webp|bmp|mp3|wav|ogg|flac|aac|m4a|glb|gltf|fbx|obj|dae|mp4|webm)['"]/i;
  const ASSET_URL = /new\s+URL\(\s*['"][^'"]+\.(?:png|jpe?g|gif|svg|webp|bmp|mp3|wav|ogg|flac|aac|m4a|glb|gltf|fbx|obj|dae|mp4|webm)['"]/i;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('imports no audio/image/model asset files anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (ASSET_IMPORT.test(line) || ASSET_URL.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, `unexpected asset imports:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the glTF asset manifest keeps a procedural fallback and only imports render loaders', () => {
    const text = readFileSync(`${SRC}/engine/assets.ts`, 'utf8');
    expect(text).toContain("fallback: 'procedural'");
    const importLines = text.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line, line).toMatch(/from\s+['"](three|\.\/asset-loaders)/);
    }
  });
});

// ---------- Test 22: bark-trigger ----------

describe('test 22 — bark-trigger (from the sim core)', () => {
  it('emits a bark when a hero casts its signature (ult) ability', () => {
    const hero = REG.hero('juggernaut');
    const sim = new Sim({ seed: 4242, bounds: { w: 6000, h: 4000 } });
    sim.events.captureAll = true;

    const caster = sim.spawnHero(hero, { team: 0, pos: { x: 1000, y: 2000 }, level: 25, ctrl: { kind: 'player' } });
    const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1120, y: 2000 }, level: 20, ctrl: { kind: 'none' } });
    caster.mana = 99999;
    caster.abilities.forEach((a) => { a.level = Math.max(1, a.level); a.cooldownUntil = 0; });

    const ultSlot = caster.abilities.findIndex((a) => a.def.ult);
    expect(ultSlot).toBeGreaterThanOrEqual(0);
    const ult = caster.abilities[ultSlot].def;
    const args = ult.targeting === 'unit-target' ? { uid: enemy.uid } : ult.targeting === 'no-target' ? {} : { point: enemy.pos };

    sim.order(caster.uid, { kind: 'cast', slot: ultSlot, ...args });
    sim.run(0.6);

    const barks = sim.events.history.filter((e): e is Extract<SimEvent, { t: 'bark' }> => e.t === 'bark');
    expect(barks.length).toBeGreaterThanOrEqual(1);
    expect(barks[0].uid).toBe(caster.uid);
    expect(hero.barks).toContain(barks[0].line);
  });
});
