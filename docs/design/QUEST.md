# QUEST — bounties, chapters, and the quest loop

How Ancients grows a genre-standard **quest system** on top of what already ships, using the data-driven pattern the rest of the game uses. Companion to `SPEC.md` (especially §1.2 data-driven content, §4 World & Progression, §8 Recruitment), `STORY.md` (the cinematic spine quests can hang beats on), `DECISIONS.md` (calls already made), and `PROGRESS.md` (what shipped).

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays the system of record.** Quest logic — what counts toward an objective, when a quest unlocks, what a claim does — is a set of pure seedless functions in `src/core/quests.ts` that sit beside `rollLoot` and the trial runner. They never import `three`, never touch the DOM, and operate on plain data: a `QuestDef`, a `QuestSave`, and a snapshot `QuestContext`. The systems layer (`Game`) feeds them normalized events and applies the rewards; the renderer and HUD only read view-models. Everything here is additive and reversible: the existing recruitment chain (Find → Trial → Bind, §8) is untouched, and quests are a new content layer beside it, not a rewrite. `boundary.test.ts` stays green.

---

## 0. WHERE WE ARE

The SPEC names quests as first-class data ("Heroes, abilities, items, creeps, regions, trainers, gyms, **and quests** live as plain data files", §1.2; `/src/data/quests/` in the layout). What actually shipped under that name is the **recruitment** chain: `RecruitmentQuestDef` + `TrialDef` drive the per-hero Find → Trial → Bind, and the journal renders their progress. That is a quest *kind*, but it is the only one. There is no general objective/reward quest — no bounty board, no questline that progresses the game and pays out a special drop, level-up, or recruit.

This doc adds that general layer. It deliberately leaves the recruitment chain alone (it has its own type, runner, save fields, and tests) and introduces a parallel, smaller vocabulary for everything else a player would call "a quest."

Two flavors, exactly as the request framed them:

- **Recurring bounties** — repeatable, lower rewards. Kill some creeps, capture some, hunt echoes, take a boss contract. They reset (immediately or after a cooldown) so they stay a steady gold/XP faucet without competing with boss/raid loot.
- **Event chapters** — one-time, story-progression quests that chain. Each clears a milestone (first bind, first badge, a dungeon, a raid) and pays a **special** reward the bounties never do: a guaranteed item, an essence pile, a free recruit, or a title. They form a spine that walks alongside the badge progression.

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
  repeatable?: boolean;      // recurring quests set this; event quests do not
  next?: string;             // questline: auto-unlocks this quest id on claim
  dialogue?: string[];       // in-character lines, original
}

interface QuestPrereq {
  badges?: number;           // ≥ this many badges
  recruited?: number;        // ≥ this many recruited heroes
  raidClears?: number;       // ≥ this many total raid clears
  region?: string;           // must have reached this region
  quests?: string[];         // these quest ids must be claimed first (chain)
  anyOf?: QuestPrereq[];     // OR-gate: at least one branch must also hold
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
}

interface QuestContext {       // a cheap snapshot Game builds each refresh
  badges: number;
  recruited: number;
  raidClears: number;
  reachedRegions: ReadonlySet<string>;
  claimedQuests: ReadonlySet<string>;
  playtimeSec: number;
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
- `refreshAvailability(def, save, ctx)` → the lifecycle gate. `locked` → `active` once `prereq` is met; a recurring `cooldown` → `active` (progress reset) once `availableAt` elapses. Terminal `claimed` (event) and in-flight `active`/`complete` are left alone.
- `matchesObjective(obj, ev)` → kind match plus optional region/tier/target filters.
- `advance(def, save, ev)` → increment every matching objective (clamped to its `count`), flip to `complete` when all are met. Only `active` quests advance. Returns `{ save, justCompleted }`.
- `claim(def, save, ctx)` → only from `complete`. Bumps `completions`; an **event** quest goes `claimed` (terminal); a **recurring** quest goes `cooldown` with `availableAt = now + cooldownSec` (or straight back to `active` with progress zeroed when no cooldown).

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

`refreshQuests()` also runs on construct, on region change, and whenever the board opens, so availability tracks progression even for quests with no objective event (a pure `prereq` gate like "earn 3 badges").

---

## 4. PERSISTENCE

`GameSave` gains `quests: Record<string, QuestSave>`. `SAVE_VERSION` bumps **6 → 7** with `migratePhase7Save` (wraps `migratePhase6Save`, sets `version: 7`, defaults `quests: {}`), and `migrateSave`/`validateSave` accept v6 and v7. Old saves load clean with an empty quest map and pick the system up live on the next refresh — exactly the additive-default pattern used for v4/v5/v6.

---

## 5. CONTENT (original, in the game's voice)

Shipping set, all authored and original. **Global bounties** (recurring, region-agnostic, available from the first step out of the Vale):

- **Cull the Wilds** — defeat 12 wild creeps. → gold + XP.
- **The Binder's Due** — capture 2 creeps. → gold + an early loot-mark.
- **Echo Hunt** — defeat 3 hero echoes. → gold + XP.
- **Pit Contract** — clear any regional boss once (prereq: 1 badge, 6h cooldown). → gold + a mid loot-mark.

**Per-region bounties** (recurring, one pair per region, built from `REGION_BOUNTY_META` in `board.ts`). Each region posts to its own town board, gates behind `prereq: { region }` so it only appears once you have reached the place, and homes via `regionId` so the journal shows where it was posted. Every region gets a region-scoped **cull** bounty (`kill-creeps`) plus a **themed** bounty matching its character — capture (Tranquil Vale, Icewrack, Hidden Wood), echo hunt (Nightsilver Woods, Vile Reaches, Quoidge, Mad Moon Crater), or a cooldown-paced boss contract (Devarshi Desert, Shadeshore, Mount Joerlak — the regions with anchor bosses). Rewards (gold/XP/loot-mark band) scale with the region's depth in the descent via a shared `scale`/`lootBandFor` helper, so a new region is one authored `RegionBountyMeta` entry, not new code.

**Chapters** (event, chained — the "Mending the Moon" spine):

1. **First Light** — recruit your first hero. → gold, XP, a starting component. Unlocks →
2. **Warden of the Vale** — earn your first badge. → a mid component, an early loot-mark, essence. Unlocks →
3. **Into the Deeper Loop** (prereq 3 badges) — clear a dungeon and a boss. → a strong item, essence. Unlocks →
4. **A Lost Echo** (prereq 5 badges) — defeat 5 echoes and clear a boss. → **a free recruit** (the special-event reward the request called out). Unlocks →
5. **The Mad Moon's Answer** (prereq 8 badges or a raid clear) — clear a raid. → the **Moonmender** title, a large gold purse, a top-tier item.

The chapter spine intentionally lags the badge run by a beat, so it reads as "the story catching up to what you just did" rather than a second to-do list to grind.

Side chapters branch off the spine instead of chaining inside it — each is a **leaf** (no `next`), gated after First Light, paying a one-time reward the recurring board never gives:

- **The Wider Loop** (after First Light) — `reach-region` Nightsilver Woods, the first region past the Vale's north pass. → gold + an early loot-mark. It carries `regionId: tranquil-vale`, so the board shows where it was posted.
- **Hands Enough to Mend** — recruit 4 heroes. → gold, party XP, a mid loot-mark.
- **The Frostbound Vow** (prereq: reached Icewrack) — capture 5 creeps in Icewrack. → essence + a Point Booster.
- **The Pit Ledger** (prereq: 4 badges) — clear 4 regional bosses. → a Demon Edge + essence.
- **The Echo Archive** (prereq: reached Quoidge) — defeat 8 echoes in Quoidge. → a Mystic Staff + a late loot-mark.

---

## 6. UI

The **Quest Journal** (`J`) gains a **Bounties & Chapters** section above Recruitment: each available/active quest shows its giver and home region, a flavor line from its `dialogue`, its objectives with `progress/count`, and its rewards. A completed quest shows a **Claim** button that grants the reward and refreshes the row in place. A `complete` quest also raises a HUD toast ("Quest ready to claim: …") so the player knows to open the board. The board is read straight from `questBoard()`; all gating lives in `Game`/core, the HUD stays presentational.

`questBoard()` orders the rows so the useful ones rise: **ready-to-claim first** (never miss a reward), then the **region you are currently standing in** (its bounties are the ones you can act on now), then chapters before bounties. As you travel, the local board floats to the top without hiding anything you have already unlocked elsewhere.

---

## 7. TESTS

- `src/test/quests.test.ts` — pure: `advance` clamps and completes; `claim` on event → `claimed`, on recurring → `cooldown`/re-arm; `refreshAvailability` honors `prereq` and cooldown elapse; the Mad Moon `anyOf` gate opens on badges **or** a raid clear; the Pit Contract re-arms only after its full 6h cooldown. Integration (headless `Game`): kills complete a bounty and `claimQuest` pays gold; an event chapter unlocks its `next` on claim; each reward faucet lands on claim — gold, XP, a stashed item, an early loot-mark, essence, a codex title, and a `recruit` that adds the hero to `recruited`; a v6→v7 save round-trips with quest state intact.
- `data-lint` — every reward `itemId`/`recruit heroId` and objective/prereq `targetId`/`quests`/`anyOf`/`next`/`regionId` reference real registered content; objective counts are positive; recurring quests are `repeatable`, event quests are not; `next` chains are unique, acyclic, and consistent with each successor's `prereq.quests`.
- `e2e/quests.spec.ts` — drives the board through the live `Game`, plus a full UI loop: open the Journal over the headless scene, click a bounty's **Claim** button, and assert the gold paid out and the row re-armed.

---

## 8. NON-GOALS (this slice)

No timed/expiring quests, no branching choice-quests (the recruitment faction-choice already covers exclusivity), no per-NPC quest givers walking the world (quests list on the board), and no new sim primitives. Those are easy additive follow-ups on the same vocabulary if they earn their keep.
