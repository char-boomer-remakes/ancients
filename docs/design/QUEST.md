# QUEST: shipped bounties, chapters, and world quest givers

Finish-line spec for the general **quest system** in Ancients: recurring bounty boards, one-time chapter chains, timed contracts, branch choices, and the walking NPCs that post them. Companion to `SPEC.md` (especially §1.2 data-driven content, §4 World & Progression, §8 Recruitment), `STORY.md` (the cinematic spine quests hang beats on), `DECISIONS.md` (calls already made), and `PROGRESS.md` (what shipped).

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays the system of record.** Quest logic, including objective matching, unlocks, claim transitions, timed resets, branch recording, and giver patrol positions, lives in pure seedless helpers in `src/core/quests.ts`. They never import `three`, never touch the DOM, and operate on plain data: a `QuestDef`, a `QuestSave`, a `QuestGiverDef`, and a snapshot `QuestContext`. The systems layer (`Game`) feeds normalized quest events and applies rewards. The renderer and HUD read view-models. The recruitment chain (Find → Trial → Bind, `SPEC.md` §8) remains its own shipped system; this is the general quest layer beside it.

## STATUS - shipped as of 2026-06-14

- **Core:** `src/core/quests.ts` ships the full lifecycle, timed windows, branch choice recording, `anyOf`/choice prereqs, and deterministic walking giver positions.
- **Content:** `src/data/quests/board.ts` registers **42 general quests**: 25 recurring bounties and 17 event quests. `src/data/quests/givers.ts` registers **13 walking quest givers**: one keeper per region plus the Binder, chapter, and Tower hub givers.
- **Game wiring:** `Game.refreshQuests`, `Game.advanceQuests`, `Game.claimQuest`, `Game.questBoard`, `Game.giverQuests`, `Game.questGiverViews`, and `Game.questTitles` are live.
- **UI and world:** the Journal renders Bounties & Chapters, claim buttons, timed/cooldown labels, fork branch buttons, quest-earned titles, and giver-focused boards. The world shows walking giver markers and minimap dots.
- **Persistence:** `SAVE_VERSION` is 7. v6 saves migrate with an empty quest map, and quest progress/branch choices round-trip.
- **Verification:** `src/test/quests.test.ts`, the quest block in `src/test/data-lint.test.ts`, and `e2e/quests.spec.ts` cover the shipped contract.

---

## 0. SHIPPED SHAPE

The SPEC names quests as first-class data ("Heroes, abilities, items, creeps, regions, trainers, gyms, **and quests** live as plain data files", §1.2; `/src/data/quests/` in the layout). The game now has two quest layers:

- **Recruitment quests** remain the per-hero Find → Trial → Bind chain, backed by `RecruitmentQuestDef`, `TrialDef`, and their own save fields.
- **General quests** are the shipped layer in this document: objective/reward quests built from `QuestDef`, `QuestSave`, and normalized `QuestEvent`s.

The general layer has two main flavors:

- **Recurring bounties**: repeatable, lower rewards. Kill creeps, capture beasts, hunt echoes, take a boss contract, or race a timed ancient-tier contract. They reset immediately, after a cooldown, or after a timed window lapses.
- **Event chapters**: one-time progression quests. They chain through the Mending the Moon spine, branch into side chapters, continue into the Outworld Seal, and end with Zet's Tower choice. They pay special rewards the bounty board does not: guaranteed items, essence, a free recruit, and quest titles.

---

## 1. DATA MODEL (closed vocabularies, like everything else)

A quest is a `QuestDef` (in `src/core/types.ts`, registered in `REG.questDefs`, authored in `src/data/quests/board.ts`). It composes from three closed lists so a new quest is data, not code.

```ts
type QuestKind = 'recurring' | 'event';

type QuestObjectiveKind =
  | 'kill-creeps' | 'kill-echoes' | 'capture-creeps' | 'recruit-heroes'
  | 'clear-boss' | 'clear-raid' | 'clear-dungeon' | 'earn-badge' | 'reach-region';

interface QuestObjective {
  kind: QuestObjectiveKind;
  count: number;
  text: string;          // human label for the board
  regionId?: string;     // restrict counting to one region
  tier?: CreepTier;      // restrict creep kills/captures to a tier
  targetId?: string;     // a specific boss/raid/region/badge id
}

type QuestReward =
  | { kind: 'gold'; amount: number }
  | { kind: 'xp'; amount: number; scope?: 'active' | 'party' }
  | { kind: 'loot-mark'; band: LootBand; amount: number }
  | { kind: 'item'; itemId: string; quality?: ItemQuality }
  | { kind: 'essence'; amount: number }
  | { kind: 'recruit'; heroId: string }
  | { kind: 'title'; id: string; name: string; note: string };

interface QuestDef {
  id: string;
  kind: QuestKind;
  name: string;
  summary: string;
  giver?: string;            // flavor board / NPC name
  regionId?: string;         // home region (board listing + availability flavor)
  objectives: QuestObjective[];
  rewards: QuestReward[];
  prereq?: QuestPrereq;      // gates availability
  cooldownSec?: number;      // recurring: rest this long after a claim (0/absent = re-arm now)
  windowSec?: number;        // timed: complete within this long of going active, or it resets
  repeatable?: boolean;      // recurring quests set this; event quests do not
  next?: string;             // questline: auto-unlocks this quest id on claim
  choices?: QuestChoice[];   // a fork: claiming takes exactly one branch
  dialogue?: string[];       // in-character lines, original
}

interface QuestChoice {      // a branch a fork offers at claim
  id: string;
  label: string;
  rewards: QuestReward[];    // granted on top of the quest's base rewards
  next?: string;             // branch-only successor, gated via prereq.choice
  note?: string;
}

interface QuestGiverDef {    // an NPC that walks a town and posts a board
  id: string;
  name: string;
  title?: string;
  regionId: string;          // the region the NPC stands in
  board: string;             // matches QuestDef.giver → the quests it posts
  home: Vec2;                // patrol anchor near the town board
  patrol?: Vec2[];           // waypoints walked as a closed loop back to home
  loopSec?: number;          // seconds for one full loop (default 60)
  radius?: number;           // interaction radius (default 360)
}

interface QuestPrereq {
  badges?: number;           // ≥ this many badges
  recruited?: number;        // ≥ this many recruited heroes
  raidClears?: number;       // ≥ this many total raid clears
  region?: string;           // must have reached this region
  quests?: string[];         // these quest ids must be claimed first (chain)
  anyOf?: QuestPrereq[];     // OR-gate: at least one branch must also hold
  choice?: { quest: string; choiceId: string };  // a fork must have taken this branch
}
```

The named gates are all **AND** — every one listed must hold. `anyOf` adds an **OR** on top: when present, at least one of its branches must also be satisfied. That is how a chapter can read "after the Lost Echo **and** (eight badges **or** a raid clear)" without a new prereq kind.

The reward and objective lists are intentionally small and **already-supported**: every reward maps to an existing `Game` faucet (`awardGold`, `addXp`/recruit ceiling, `lootMarks`, `inventoryStash`, `essence`, `recruitHero`, a codex title), and every objective maps to a `SimEvent`/`Game` milestone we already fire. Nothing here needs a new sim primitive.

---

## 2. STATE & PURE LOGIC (`src/core/quests.ts`)

Per-quest save state is tiny and sparse — a missing entry means "default" (locked), so a fresh or shallow save carries almost nothing.

```ts
type QuestStatus = 'locked' | 'active' | 'complete' | 'claimed' | 'cooldown';

interface QuestSave {
  status: QuestStatus;
  progress: number[];        // one counter per objective
  completions: number;       // lifetime claims (recurring grows this)
  availableAt?: number;      // playtime sec a cooled-down recurring re-arms at
  expiresAt?: number;        // playtime sec a timed (windowSec) run resets at
  choice?: string;           // branch chosen at claim on a fork quest
}

interface QuestContext {       // a cheap snapshot Game builds each refresh
  badges: number;
  recruited: number;
  raidClears: number;
  reachedRegions: ReadonlySet<string>;
  claimedQuests: ReadonlySet<string>;
  playtimeSec: number;
  questChoices?: ReadonlyMap<string, string>;  // fork id → chosen branch (gates prereq.choice)
}

interface QuestEvent {         // a normalized progression beat from Game
  kind: QuestObjectiveKind;
  amount: number;
  regionId?: string;
  tier?: CreepTier;
  targetId?: string;
}
```

Pure functions, all total (never throw), all deterministic:

- `defaultQuestSave()` → a `locked` record sized to the def.
- `prereqMet(def, ctx)` → does the context satisfy `prereq`.
- `refreshAvailability(def, save, ctx)` → the lifecycle gate. `locked` → `active` once `prereq` is met; a recurring `cooldown` → `active` (progress reset) once `availableAt` elapses; an active timed quest whose `expiresAt` has passed re-arms with fresh progress. Terminal `claimed` (event) and earned `complete` states are left alone.
- `matchesObjective(obj, ev)` → kind match plus optional region/tier/target filters.
- `advance(def, save, ev)` → increment every matching objective (clamped to its `count`), flip to `complete` when all are met. Only `active` quests advance. Returns `{ save, justCompleted }`.
- `claim(def, save, ctx, choiceId?)` → only from `complete`. Bumps `completions`; an **event** quest goes `claimed` (terminal); a **recurring** quest goes `cooldown` with `availableAt = now + cooldownSec` (or straight back to `active` with progress zeroed when no cooldown). On a **fork** (`choices`) it records the taken branch on `choice`.
- `questGiverPos(def, playtimeSec)` → a giver's world position, walking its patrol loop at constant speed (`home` with no patrol). Pure, total, deterministic. The renderer and the proximity check read the same function, so the NPC the player sees is the NPC they can talk to.

The state machine, in one line: `locked → active → complete → claimed` (event) and `locked → active → complete → cooldown → active …` (recurring).

`Game` owns `quests: Record<string, QuestSave>` and a thin set of wrappers: `refreshQuests()` (loop all defs through `refreshAvailability`), `advanceQuests(ev)` (refresh, then `advance` every quest, toast on `justCompleted`), `claimQuest(id)` (claim + `grantQuestReward` for each reward), and `questBoard()` (the view-model). Rewards are **claimed explicitly** at the board, never silently granted — a free recruit or a guaranteed item is a moment, and explicit claim keeps it deterministic for headless tests.

`next` is load-bearing, not decoration: `claimQuest` reads the claimed quest's `next`, and once the refresh unlocks that successor it raises a "New chapter available" toast. The chain itself is gated by the successor listing its predecessor in `prereq.quests`, and a data-lint rule keeps the two ends honest — every `next` must point at a real, unique quest whose `prereq.quests` names the predecessor, and the chain must not cycle. So a dropped or mismatched link fails the lint instead of silently breaking the spine.

---

## 3. WIRING (one call site per milestone)

`advanceQuests(ev)` is fed from the milestones `Game` already detects, so quests need no new detection:

| Objective | Fired from |
|---|---|
| `kill-creeps` (+tier, +region) | `handleKillCredit`, on a wild-creep victim |
| `kill-echoes` | echo death handling |
| `capture-creeps` | `handleCaptureComplete` |
| `recruit-heroes` | `recruitHero` |
| `earn-badge` (+badgeId) | `applyGymResult` on a win |
| `clear-boss` (+bossId) | the boss-rerun clear path |
| `clear-raid` (+raidId) | the raid clear path |
| `clear-dungeon` | the dungeon guardian-clear path |
| `reach-region` (+regionId) | region travel / arrival |

`refreshQuests()` also runs on construct, on region change, and whenever the board opens, so availability tracks progression even for quests with no objective event (a pure `prereq` gate like "earn 3 badges"). The board opens two ways: the **J** Journal button, or walking up to a quest-giver NPC and pressing **G**, which opens the Journal focused on that giver's board.

---

## 4. PERSISTENCE

`GameSave` gains `quests: Record<string, QuestSave>`. `SAVE_VERSION` bumps **6 → 7** with `migratePhase7Save` (wraps `migratePhase6Save`, sets `version: 7`, defaults `quests: {}`), and `migrateSave`/`validateSave` accept v6 and v7. Old saves load clean with an empty quest map and pick the system up live on the next refresh — exactly the additive-default pattern used for v4/v5/v6.

---

## 5. CONTENT (original, in the game's voice)

The shipped board is all authored and original: **42 general quests**, split into **25 recurring bounties** and **17 event quests**.

**Global bounties** are recurring, region-agnostic, and posted by the Binder's Board:

- **Cull the Wilds**: defeat 12 wild creeps. Pays gold + XP.
- **The Binder's Due**: capture 2 creeps. Pays gold + an early loot mark.
- **Echo Hunt**: defeat 3 hero echoes. Pays gold + party XP.
- **Pit Contract**: clear any regional boss once. Requires 1 badge and re-arms after a 6h cooldown. Pays gold + a mid loot mark.
- **Ancient Reckoning**: defeat 3 ancient-tier creeps inside 30 minutes. Requires 4 badges. Pays gold + a late loot mark. This is the shipping timed-contract example and exercises the tier objective filter.

**Per-region bounties** are generated from authored `REGION_BOUNTY_META` entries in `src/data/quests/board.ts`: each of the 10 regions gets one local cull bounty and one themed local bounty. Every local bounty gates on `prereq: { region }`, carries `regionId` for board ordering, and posts to that region's own board. The themed slot matches the region: capture bounties in Tranquil Vale, Icewrack, and Hidden Wood; echo hunts in Nightsilver Woods, Vile Reaches, Quoidge, and Mad Moon Crater; boss contracts in Devarshi Desert, Shadeshore, and Mount Joerlak. Rewards scale by region depth through shared `scale` and `lootBandFor` helpers.

**The Mending the Moon spine** is the five-step main event chain:

1. **First Light**: recruit your first hero. Pays gold, XP, and Magic Wand.
2. **Warden of the Vale**: earn your first badge. Pays Broadsword, an early loot mark, and essence.
3. **Into the Deeper Loop**: clear a dungeon and a boss after 3 badges. Pays Ultimate Orb + essence.
4. **A Lost Echo**: defeat 5 echoes and clear a boss after 5 badges. Pays a free Marci recruit.
5. **The Mad Moon's Answer**: clear a raid after Lost Echo and either 8 badges or a raid clear. Pays the **Moonmender** title, gold, and Sacred Relic.

The spine lags the badge run by a beat, so it reads as the story catching up to what the player already proved.

**Side chapters** are one-time leaves off the main spine:

- **The Wider Loop**: after First Light, reach Nightsilver Woods. Pays gold + an early loot mark.
- **Hands Enough to Mend**: recruit 4 heroes. Pays gold, party XP, and a mid loot mark.
- **The Frostbound Vow**: after reaching Icewrack, capture 5 Icewrack creeps. Pays essence + Point Booster.
- **The Pit Ledger**: after 4 badges, clear 4 regional bosses. Pays Demon Edge + essence.
- **The Echo Archive**: after reaching Quoidge, defeat 8 Quoidge echoes. Pays Mystic Staff + a late loot mark.

**The Outworld Seal** is a second three-step spine after The Mad Moon's Answer:

1. **Cracks in the Seal**: clear 2 raids. Pays Octarine Core + essence.
2. **The Renegade's Wake**: clear a raid and 2 bosses. Pays Eye of Skadi.
3. **Mend the Seal**: clear 3 raids. Pays the **Sealwarden** title + Aghanim's Blessing.

**Zet's Question** is the endgame fork at the Tower. Claiming it takes exactly one branch, grants that branch's reward, records `QuestSave.choice`, and opens only that branch's epilogue:

- **Reunite the Ancients**: pays the **Worldmender** title + gold, then opens **The Silence After**.
- **Keep the eternal game**: pays the **Eternal Warden** title + essence, then opens **The Game Goes On**.
- **Break the Loop**: pays the **Looser of the Loop** title + Divine Rapier, then opens **The World Let Out**.

---

## 6. UI

The **Quest Journal** (`J`) has a **Bounties & Chapters** section above Recruitment: each available/active quest shows its giver and home region, a flavor line from its `dialogue`, its objectives with `progress/count`, and its rewards. A completed quest shows a **Claim** button that grants the reward and refreshes the row in place. A `complete` quest also raises a HUD toast ("Quest ready to claim: …") so the player knows to open the board. The board is read straight from `questBoard()`; all gating lives in `Game`/core, the HUD stays presentational.

`questBoard()` orders the rows so the useful ones rise: **ready-to-claim first** (never miss a reward), then the **region you are currently standing in** (its bounties are the ones you can act on now), then chapters before bounties. As you travel, the local board floats to the top without hiding anything you have already unlocked elsewhere. A timed quest shows its remaining window (`expiresIn`); a fork shows one **Claim** button per branch (label + that branch's rewards) instead of a single one.

Quest givers are the same Journal seen from the world. Walking near a giver shows a `<Name> — press G for bounties` hint; pressing **G** opens the Journal with that NPC's board floated to the top under a "Speaking with …" line. The giver itself is a moving marker in the scene that pulses a beacon when it has something to claim, so a ready reward is visible from across the town without opening anything.

---

## 7. TESTS

- `src/test/quests.test.ts` covers the pure state machine: prereqs, `anyOf`, cooldowns, timed windows, objective filters, clamping, completion, claims, branch choice recording, and deterministic giver patrols. It also covers headless `Game` integration: quest events advance rows, claims pay every reward kind, event chains unlock, the Outworld spine advances, fork choices survive save/load, v6 saves migrate to v7, and giver view-models flag active/claimable boards.
- The quest block in `src/test/data-lint.test.ts` validates data integrity: reward item/recruit ids, objective targets, prereq quest/region/choice ids, branch rewards, branch `next` links, positive counts/windows, recurring/event invariants, unique acyclic chains, successor prereq consistency, and giver boards/regions/patrols.
- `e2e/quests.spec.ts` drives the live board through the browser harness: fresh-game unlocks, bounty progress, recurring claim/re-arm, event successor unlock, v7 save round-trip, timed ancient-only counting with a visible deadline, fork branch exclusivity, Journal claim buttons, and branch buttons.

---

## 8. ACCEPTANCE AND BOUNDARIES

The quest system is done when the player can take repeatable bounties from the first region, see local boards as they travel, follow the Mending the Moon chapter spine, collect special chapter rewards, race a timed contract, choose one endgame branch, talk to walking givers in towns, save and reload quest state, and complete all of that without adding a sim primitive or breaking the core boundary. That is the shipped state.

Kept out of scope on purpose:

- No new sim event primitive. Quests count the milestones `Game` already observes.
- No timed quest that permanently fails a chain. A lapsed window resets progress and re-arms; it never bricks the story.
- No roaming giver that leaves its home region. Giver position is pure playtime math inside one region, so it needs no save state.
- No rewrite of recruitment quests. Find → Trial → Bind remains a separate system with separate tests.
