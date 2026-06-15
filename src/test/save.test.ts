import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { Game, newGameSave, SAVE_VERSION } from '../systems/game';
import { glyphForAction } from '../systems/keybindings';

describe('save game validation', () => {
  beforeAll(() => registerAllContent());

  it('creates a valid starter save with the Phase 1 demo stipend', () => {
    const save = newGameSave('juggernaut');

    expect(save.version).toBe(SAVE_VERSION);
    expect(save.gold).toBe(TUNING.startingGold);
    expect(save.roster[0].echo).toEqual({
      kills: 0,
      facetSwapUnlocked: false,
      talentTierUnlocks: [false, false, false, false]
    });
    expect(save.badges).toEqual([]);
    expect(save.questProgress).toEqual({});
    expect(save.defeatedGyms).toEqual([]);
    expect(save.echoRespawn).toEqual({});
    expect(save.settings.interface).toEqual({
      uiScale: 1,
      textScale: 1,
      hudOpacity: 1,
      minimapSize: 160,
      minimapOpacity: 1,
      minimapLegend: true,
      helpOverlay: true,
      partyPanel: true,
      questTracker: true,
      questTrackerMax: 3,
      toasts: true,
      killfeed: true,
      floatingHints: true,
      combatReadout: true
    });
    expect(glyphForAction(save.settings, 'help')).toBe('F1');
    expect(Game.validateSave(save)).toBe(true);
  });

  it('rejects wrong-version or unresolved saves before load/import', () => {
    const save = newGameSave('crystal-maiden');

    expect(Game.validateSave({ ...save, version: 0 })).toBe(false);
    expect(Game.validateSave({ ...save, regionId: 'missing-region' })).toBe(false);
    expect(Game.validateSave({ ...save, party: ['rubick'], recruited: ['rubick'] })).toBe(false);
    expect(Game.validateSave({ ...save, roster: [{ ...save.roster[0], echo: { kills: -1, facetSwapUnlocked: false, talentTierUnlocks: [false, false, false, false] } }] })).toBe(false);
    expect(Game.validateSave({ ...save, defeatedGyms: ['missing-gym'] })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, keyBindings: { bindings: { 'missing-action': 'q' } } } })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, keyBindings: { bindings: { sprint: 'space' } } } })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, audio: { ...save.settings.audio, ui: 2 } } })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, interface: { ...save.settings.interface!, uiScale: 2 } } })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, interface: { ...save.settings.interface!, questTrackerMax: 4 } } })).toBe(false);
    expect(Game.validateSave({ ...save, settings: { ...save.settings, interface: { ...save.settings.interface!, toasts: 'yes' as unknown as boolean } } })).toBe(false);
  });
});
