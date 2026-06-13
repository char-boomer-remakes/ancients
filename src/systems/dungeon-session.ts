import { generateDungeon } from '../core/dungeon';
import { buildHero } from '../core/hero-setup';
import { heroesAlive } from '../core/macro';
import { v2 } from '../core/math2d';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState, sortInventory } from '../core/items';
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
  hash: string;
}

export class DungeonSession {
  readonly def: DungeonDef;
  readonly tier: DifficultyTier;
  readonly layout: DungeonLayout;
  readonly room: DungeonRoom;
  readonly sim: Sim;
  readonly partyUids: number[] = [];
  readonly enemyUids: number[] = [];
  private readonly maxTicks: number;

  driverIdx = 0;
  done = false;
  result: DungeonSessionResult | null = null;

  constructor(def: DungeonDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number, opts?: { maxSec?: number }) {
    this.def = def;
    this.tier = tier;
    this.layout = generateDungeon(def, tier, seed);
    this.room = this.layout.rooms.find((r) => r.packs.length > 0) ?? this.layout.rooms[1] ?? this.layout.rooms[0];
    this.sim = new Sim({ seed, bounds: ROOM_SIZE });
    this.maxTicks = Math.round((opts?.maxSec ?? 90) / this.sim.dt);
    this.spawnParty(party);
    this.spawnRoomPacks();
    this.sim.playerActiveUid = this.partyUids[0] ?? -1;
    this.checkDone();
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

  private checkDone(): void {
    const partyAlive = heroesAlive(this.sim, 0).length;
    const enemiesAlive = this.enemyUids.some((uid) => this.sim.unit(uid)?.alive);
    if (partyAlive > 0 && enemiesAlive && this.sim.tickCount < this.maxTicks) return;
    this.done = true;
    this.result = {
      cleared: partyAlive > 0 && !enemiesAlive,
      wiped: partyAlive === 0,
      timeSec: this.sim.time,
      roomIndex: this.room.index,
      hash: this.sim.hash()
    };
  }
}
