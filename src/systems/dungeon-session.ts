import { generateDungeon } from '../core/dungeon';
import { buildHero } from '../core/hero-setup';
import { heroesAlive } from '../core/macro';
import { v2 } from '../core/math2d';
import { tierScale } from '../core/phase3';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState, sortInventory } from '../core/items';
import { TUNING } from '../data/tuning';
import type { DifficultyTier, DungeonDef, DungeonLayout, DungeonRoom, MacroHeroSetup } from '../core/types';
import type { Unit } from '../core/unit';

const ROOM_SIZE = { w: 4200, h: 3000 };
const PLAYER_START = v2(720, ROOM_SIZE.h / 2);
const ENEMY_START = v2(3000, ROOM_SIZE.h / 2);

export interface DungeonSessionResult {
  cleared: boolean;
  wiped: boolean;
  timeSec: number;
  roomIndex: number;
  clearedRooms: number[];
  guardianCleared: boolean;
  hash: string;
}

export class DungeonSession {
  readonly def: DungeonDef;
  readonly tier: DifficultyTier;
  readonly layout: DungeonLayout;
  readonly sim: Sim;
  readonly partyUids: number[] = [];
  enemyUids: number[] = [];
  private readonly maxTicks: number;
  private currentRoomIndex = 0;
  private readonly cleared = new Set<number>();
  private guardianUid: number | null = null;

  driverIdx = 0;
  done = false;
  result: DungeonSessionResult | null = null;

  constructor(def: DungeonDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number, opts?: { maxSec?: number }) {
    this.def = def;
    this.tier = tier;
    this.layout = generateDungeon(def, tier, seed);
    this.sim = new Sim({ seed, bounds: ROOM_SIZE });
    this.maxTicks = Math.round((opts?.maxSec ?? this.layout.depth * 75) / this.sim.dt);
    this.spawnParty(party);
    this.sim.playerActiveUid = this.partyUids[0] ?? -1;
    this.enterNextPlayableRoom();
    this.checkDone();
  }

  get room(): DungeonRoom {
    return this.layout.rooms[this.currentRoomIndex] ?? this.layout.rooms[this.layout.rooms.length - 1];
  }

  drivenUnit(): Unit | null {
    const u = this.sim.unit(this.partyUids[this.driverIdx]);
    if (u?.alive) return u;
    return heroesAlive(this.sim, 0)[0] ?? null;
  }

  cameraFollow(): Unit | null {
    return this.drivenUnit() ?? heroesAlive(this.sim, 0)[0] ?? this.sim.unit(this.enemyUids[0]) ?? null;
  }

  selectDriver(idx: number): boolean {
    const uid = this.partyUids[idx];
    const u = uid !== undefined ? this.sim.unit(uid) : undefined;
    if (!u || !u.alive) return false;
    this.driverIdx = idx;
    this.sim.playerActiveUid = u.uid;
    return true;
  }

  step(dt: number): void {
    if (this.done) return;
    const ticks = Math.max(1, Math.round(dt / this.sim.dt));
    for (let i = 0; i < ticks && !this.done; i++) {
      this.sim.tick();
      this.checkDone();
    }
  }

  private spawnParty(party: MacroHeroSetup[]): void {
    party.slice(0, 5).forEach((setup, i) => {
      const base = REG.hero(setup.heroId);
      const build = buildHero(base);
      const pos = { x: PLAYER_START.x, y: PLAYER_START.y + (i - 2) * 180 };
      const u = this.sim.spawnHero(build.def, {
        team: 0,
        pos,
        level: setup.level,
        ctrl: i === 0 ? { kind: 'player' } : { kind: 'gambit', rules: setup.gambits }
      });
      for (const [k, v] of Object.entries(build.externalMods)) u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
      setup.items?.slice(0, 6).forEach((id, slot) => {
        u.items[slot] = makeItemState(REG.item(id));
      });
      u.items = sortInventory(u.items);
      u.markStatsDirty();
      u.refresh(this.sim.time);
      u.hp = u.stats.maxHp;
      u.mana = u.stats.maxMana;
      this.partyUids.push(u.uid);
    });
  }

  private enterNextPlayableRoom(): void {
    while (!this.done) {
      const room = this.room;
      this.repositionParty();
      this.enemyUids = [];
      this.guardianUid = null;

      if (room.type === 'rest') this.healParty();
      if (room.type === 'boss') this.spawnGuardian();
      else this.spawnRoomPacks();

      if (this.enemyUids.length > 0) return;
      this.completeCurrentRoom();
      if (this.done) return;
    }
  }

  private repositionParty(): void {
    const alive = this.partyUids
      .map((uid) => this.sim.unit(uid))
      .filter((u): u is Unit => !!u && u.alive);
    alive.forEach((u, i) => {
      u.pos = { x: PLAYER_START.x, y: PLAYER_START.y + (i - 2) * 180 };
      u.prevPos = { ...u.pos };
      u.facing = 0;
      u.order = { kind: 'stop' };
    });
    const driver = this.drivenUnit();
    if (driver) this.sim.playerActiveUid = driver.uid;
  }

  private healParty(): void {
    for (const uid of this.partyUids) {
      const u = this.sim.unit(uid);
      if (!u?.alive) continue;
      u.hp = u.stats.maxHp;
      u.mana = u.stats.maxMana;
    }
  }

  private spawnRoomPacks(): void {
    this.room.packs.forEach((pack, packIdx) => {
      const center = {
        x: ENEMY_START.x + (packIdx % 2) * 360,
        y: ENEMY_START.y + (Math.floor(packIdx / 2) - 1) * 280
      };
      pack.cards.forEach((card, i) => {
        const angle = (i / Math.max(1, pack.cards.length)) * Math.PI * 2;
        const pos = {
          x: center.x + Math.cos(angle) * 115,
          y: center.y + Math.sin(angle) * 115
        };
        const u = this.sim.spawnCreep(REG.creep(card.creepId), { team: 1, pos, star: card.star, wild: true, homePos: { ...center } });
        this.enemyUids.push(u.uid);
      });
    });
  }

  private spawnGuardian(): void {
    const boss = REG.boss(this.def.guardian);
    const level = boss.rank === 'boss' ? 30 : 26;
    const build = buildHero(REG.hero(boss.heroId));
    const scale = tierScale(this.tier);
    const pos = { ...ENEMY_START };
    const u = this.sim.spawnHero(build.def, {
      team: 1,
      pos,
      level,
      ctrl: {
        kind: 'boss',
        threat: {},
        homePos: { ...pos },
        boss: { depth: TUNING.bossTierAiDepth[this.tier], enrageSec: 90 }
      }
    });
    for (const [k, v] of Object.entries(build.externalMods)) u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    u.items[0] = makeItemState(REG.item('black-king-bar'));
    u.items[1] = makeItemState(REG.item('assault-cuirass'));
    u.externalMods.maxHp = (u.externalMods.maxHp ?? 0) + u.stats.maxHp * (TUNING.raidBossHpScale * scale.hp - 1);
    u.externalMods.damagePct = (u.externalMods.damagePct ?? 0) + (TUNING.raidBossDamageScale * scale.damage - 1) * 100;
    u.radius = TUNING.unitRadiusHero * TUNING.raidBossRadiusScale;
    u.markStatsDirty();
    u.refresh(this.sim.time);
    u.hp = u.stats.maxHp;
    u.mana = u.stats.maxMana;
    u.facing = Math.PI;
    this.guardianUid = u.uid;
    this.enemyUids.push(u.uid);
  }

  private completeCurrentRoom(): void {
    this.cleared.add(this.room.index);
    if (this.room.index >= this.layout.depth - 1) {
      this.done = true;
      this.result = this.buildResult(true, false);
      return;
    }

    const next = this.room.exits[0] ?? this.room.index + 1;
    this.currentRoomIndex = Math.min(next, this.layout.depth - 1);
    this.enterNextPlayableRoom();
  }

  private buildResult(cleared: boolean, wiped: boolean): DungeonSessionResult {
    return {
      cleared,
      wiped,
      timeSec: this.sim.time,
      roomIndex: this.room.index,
      clearedRooms: [...this.cleared].sort((a, b) => a - b),
      guardianCleared: cleared && this.cleared.has(this.layout.depth - 1),
      hash: this.sim.hash()
    };
  }

  private checkDone(): void {
    const partyAlive = heroesAlive(this.sim, 0).length;
    const enemiesAlive = this.enemyUids.some((uid) => this.sim.unit(uid)?.alive);
    if (partyAlive > 0 && enemiesAlive && this.sim.tickCount < this.maxTicks) return;
    if (partyAlive > 0 && !enemiesAlive) {
      this.completeCurrentRoom();
      return;
    }
    this.done = true;
    this.result = this.buildResult(false, partyAlive === 0);
  }
}
