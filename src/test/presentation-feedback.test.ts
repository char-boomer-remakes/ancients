import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Game, HeadlessScene, newGameSave } from '../systems/game';
import type { GameSave, SimEvent } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// PRESENTATION / TOAST LIFECYCLE — the "it popped several times"
// and "the quest direction vanished before I could read it" class.
//
// The escaped bugs (overworld §11/HUD):
//   1. A kill's gold/XP floaters replayed multiple times — stale
//      *presentation-only* events that were queued before a pause /
//      cut-scene got dumped all at once when the loop resumed.
//   2. Quest "go here" toasts were pushed off-screen too early, or
//      stopped rendering entirely once Game.msg() capped its history
//      at 60 and the HUD's de-dup used array INDEX instead of a
//      stable id (index reuse made every later toast look "already
//      shown").
//
// The old suite checked that the *value* moved (gold credited, hero
// leveled) but never that the player-facing signal fired EXACTLY
// once, stayed long enough, and survived the history cap. This file
// pins those contracts directly. The mirror DOM-side assertions
// (20s quest TTL, prune-keeps-quest) live in e2e/toast-feedback.
// ============================================================

beforeAll(() => registerAllContent());

// Private seams we assert against (the duplicate-popup root cause lives here).
type PresentationInternals = {
  emitPresentationEvent(ev: SimEvent, routeNow?: boolean): void;
  presentationEventsAreDeferred(): boolean;
  queuedPresentationEvents: SimEvent[];
};
const internals = (g: Game): PresentationInternals => g as unknown as PresentationInternals;

const levelup = (uid: number, level = 5): SimEvent => ({ t: 'levelup', uid, level });
const countType = (evs: SimEvent[], t: SimEvent['t']): number => evs.filter((e) => e.t === t).length;

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

// ------------------------------------------------------------
// 1. TOASTS GET STABLE, MONOTONIC IDS (the HUD de-dup contract)
// ------------------------------------------------------------
describe('Game.msg ids are stable + monotonic so the HUD never stops rendering new toasts', () => {
  it('every toast gets a unique, strictly increasing id', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const base = g.toasts.length;
    for (let i = 0; i < 25; i++) g.msg(`line ${i}`, 'info');
    const ids = g.toasts.map((t) => t.id);
    expect(new Set(ids).size, 'ids are unique').toBe(ids.length);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    expect(g.toasts.length).toBeGreaterThan(base);
  });

  it('past the 60-toast history cap it keeps the NEWEST and the max id still climbs', () => {
    // The regression: after splicing the history to 60 the HUD de-duped on array
    // index, so index reuse made fresh toasts look already-shown and they stopped
    // appearing. A monotonic id past the cap is what makes index-reuse impossible.
    const g = Game.headless(newGameSave('juggernaut'));
    for (let i = 0; i < 80; i++) g.msg(`flood ${i}`, 'info');

    expect(g.toasts.length, 'history is capped').toBeLessThanOrEqual(60);
    // the most-recent line survived the cap (the oldest were dropped, not the newest)
    expect(g.toasts.some((t) => t.text === 'flood 79')).toBe(true);
    expect(g.toasts.some((t) => t.text === 'flood 0')).toBe(false);

    const maxId = Math.max(...g.toasts.map((t) => t.id));
    g.msg('after the flood', 'good');
    const fresh = g.toasts[g.toasts.length - 1];
    expect(fresh.text).toBe('after the flood');
    expect(fresh.id, 'a post-cap toast still gets a higher id than anything before it').toBeGreaterThan(maxId);
  });

  it('the toast kind round-trips, so quest directions can be flagged durable', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    g.msg('Head to the Frostvault gate.', 'quest');
    const t = g.toasts[g.toasts.length - 1];
    expect(t.kind).toBe('quest');
    expect(t.text).toContain('Frostvault');
  });
});

// ------------------------------------------------------------
// 2. PRESENTATION EVENTS FIRE ONCE — never a deferred dump
// ------------------------------------------------------------
describe('presentation-only events flush exactly once and never replay', () => {
  it('an overworld presentation event queues, flushes on the next tick, and does NOT repeat', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const api = internals(g);
    expect(api.presentationEventsAreDeferred(), 'fresh overworld is not deferred').toBe(false);

    api.emitPresentationEvent(levelup(g.activeUnit()!.uid));
    expect(api.queuedPresentationEvents.length).toBe(1);

    g.update(0.016);
    expect(countType(g.frameEvents, 'levelup'), 'flushed exactly once').toBe(1);
    expect(api.queuedPresentationEvents.length, 'queue drained').toBe(0);

    // The duplicate-popup guard: a second frame with no new emit must NOT replay it.
    g.update(0.016);
    expect(countType(g.frameEvents, 'levelup'), 'no stale replay on the next frame').toBe(0);
  });

  it('events emitted while PAUSED are dropped, not banked for a post-pause dump', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const api = internals(g);
    g.paused = true;
    expect(api.presentationEventsAreDeferred()).toBe(true);

    api.emitPresentationEvent(levelup(g.activeUnit()!.uid));
    expect(api.queuedPresentationEvents.length, 'a deferred emit is discarded, never queued').toBe(0);
  });

  it('a paused tick clears any in-flight buffers so nothing dumps when the loop resumes', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const api = internals(g);

    // queue one in the live overworld...
    api.emitPresentationEvent(levelup(g.activeUnit()!.uid));
    expect(api.queuedPresentationEvents.length).toBe(1);

    // ...then a pause hits before it could flush.
    g.paused = true;
    g.update(0.016);
    expect(g.frameEvents.length, 'paused frame emits nothing to the HUD').toBe(0);
    expect(api.queuedPresentationEvents.length, 'the stale queue was cleared by the pause').toBe(0);

    // resuming must not surface the dropped event.
    g.paused = false;
    g.update(0.016);
    expect(countType(g.frameEvents, 'levelup'), 'no resurrection after un-pause').toBe(0);
  });

  it('a live raid defers presentation events (they belong to the raid sim, not the overworld HUD)', () => {
    const g = new Game(null, fullPartySave('tranquil-vale'), { scene: new HeadlessScene() });
    expect(g.startLiveRaid('roshan-pit', 'normal', { maxSec: 5 })).toBe(true);
    const api = internals(g);
    expect(api.presentationEventsAreDeferred(), 'a live raid is a deferred context').toBe(true);

    api.emitPresentationEvent(levelup(g.activeUnit()?.uid ?? 0));
    expect(api.queuedPresentationEvents.length, 'overworld presentation events do not pile up during the raid').toBe(0);
  });
});

// ------------------------------------------------------------
// 3. THE SWAP ARRIVAL FLOURISH FIRES ONCE PER SWAP
// ------------------------------------------------------------
describe('the swap "tag-in" arrival flourish is a single, non-repeating beat', () => {
  function bench(active: string, ...benched: string[]): GameSave {
    const save = newGameSave(active);
    for (const id of benched) {
      save.recruited.push(id);
      save.party.push(id);
      save.roster.push(newGameSave(id).roster[0]);
    }
    return save;
  }
  function spawnDummy(game: Game, dx = 120): Unit {
    const a = game.activeUnit()!;
    const e = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: a.pos.x + dx, y: a.pos.y } });
    e.ctrl = { kind: 'none' };
    return e;
  }

  it('one overworld swap emits exactly one hero-tag, and it is gone the next frame (no double-pop)', () => {
    const g = Game.headless(bench('juggernaut', 'crystal-maiden'));
    g.activeUnit()!.lastEnemyDamageAt = g.sim.time; // combat-eligible so the swap is "real"
    spawnDummy(g);

    expect(g.trySwap(1)).toBe(true);
    g.update(0);
    expect(countType(g.frameEvents, 'hero-tag'), 'the arrival flourish fires once').toBe(1);

    g.update(0.016);
    expect(countType(g.frameEvents, 'hero-tag'), 'it does not replay on subsequent frames').toBe(0);
  });
});
