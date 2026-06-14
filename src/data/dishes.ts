import type { DishDef } from '../core/types';

// Cooking (GAMEPLAY_OVERHAUL §3.7, Pillar P7): field consumables cooked at a town or
// shrine. A dish spends a gold/ingredient cost and grants an out-of-combat heal, a
// one-shot revive of a fallen party hero, or a short exploration buff. The buff rides
// the existing statmod path (a bounded `buff` status), so cooking adds no new combat
// mechanic — it is "an item with a timed statmod active," cooked instead of bought.

export const ALL_DISHES: DishDef[] = [
  {
    id: 'hearty-stew',
    name: 'Hearty Stew',
    kind: 'heal',
    cost: 120,
    restorePct: 1,
    lore: 'Vale root vegetables and a long simmer. Fills the whole party before a push.'
  },
  {
    id: 'travelers-rations',
    name: "Traveler's Rations",
    kind: 'buff',
    cost: 90,
    buff: { mods: { moveSpeed: 45, hpRegenPctMax: 1.5 }, durationSec: 180 },
    lore: 'Hard bread, cured meat, and enough salt to keep your feet moving over the next ridge.'
  },
  {
    id: 'phoenix-roast',
    name: 'Phoenix Roast',
    kind: 'revive',
    cost: 260,
    lore: 'They say a fallen hero who tastes it wakes hungry, which is better than not waking at all.'
  }
];
