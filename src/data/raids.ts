import type { RaidDef, SummonSpec, ZoneSpec } from '../core/types';
import { TUNING } from './tuning';

const fallen: SummonSpec = {
  id: 'raid-fallen-pack',
  name: 'Rift Thrall',
  lifetime: 40,
  stats: { maxHp: 520, damage: 32, armor: 1, moveSpeed: 315, attackRange: 120, baseAttackTime: 1.5 },
  silhouette: { build: 'biped', scale: 0.72, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};

const swarm: SummonSpec = {
  id: 'raid-swarmling',
  name: 'Crater Swarmling',
  lifetime: 35,
  stats: { maxHp: 420, damage: 28, armor: 0, moveSpeed: 345, attackRange: 110, baseAttackTime: 1.4 },
  silhouette: { build: 'quad', scale: 0.62, weapon: 'none', head: 'horned' },
  palette: ['#5f2a7a', '#16081f', '#d882ff']
};

const fireZone: ZoneSpec = {
  shape: 'circle',
  radius: 320,
  duration: 8,
  tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 55, target: 'target' }] }
};

const frostZone: ZoneSpec = {
  shape: 'circle',
  radius: 380,
  duration: 9,
  auraMods: { affects: 'enemies', mods: { moveSpeedPct: -35, attackSpeed: -30 } },
  tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 42, target: 'target' }] }
};

export const ALL_RAIDS: RaidDef[] = [
  {
    id: 'roshan-pit',
    name: "Roshan's Pit",
    location: 'Mad Moon Crater',
    unlockQuest: 'recruit-phoenix',
    boss: { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 2.8, damageScale: 1.05 },
    addWaves: [{ atHpPct: 55, summon: fallen, count: 3 }],
    zones: [{ atHpPct: 70, zone: { ...fireZone, radius: 260 } }],
    enrageSec: 120,
    loot: { guaranteed: ['aegis-of-the-immortal'], assembledPool: ['divine-rapier', 'aghanims-scepter'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity },
    signatureExotic: 'roshan-respawn'
  },
  {
    id: 'lord-of-terror',
    name: 'The Lord of Terror',
    location: 'Hell-rift beneath the Vile Reaches',
    unlockQuest: 'recruit-doom',
    boss: { heroId: 'doom', level: 30, items: ['black-king-bar'], hpScale: 2.4, damageScale: 1.05 },
    addWaves: [{ atHpPct: 75, summon: fallen, count: 4 }, { atHpPct: 35, summon: fallen, count: 5 }],
    zones: [{ atHpPct: 80, zone: fireZone }, { atHpPct: 45, zone: { ...fireZone, wall: true } }],
    enrageSec: 135,
    loot: { guaranteed: ['reaver'], assembledPool: ['heart-of-tarrasque'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity },
    signatureExotic: 'terror-fear'
  },
  {
    id: 'lich-king',
    name: 'The Frost-Crowned King',
    location: 'Icewrack glacier summit',
    unlockQuest: 'recruit-lich',
    boss: { heroId: 'lich', level: 30, items: ['glimmer-cape', 'black-king-bar'], hpScale: 2.3, damageScale: 1.0 },
    addWaves: [{ atHpPct: 65, summon: fallen, count: 3 }, { atHpPct: 30, summon: fallen, count: 4 }],
    zones: [{ atHpPct: 90, zone: frostZone }, { atHpPct: 50, zone: { ...frostZone, radius: 480 } }],
    enrageSec: 135,
    loot: { guaranteed: ['ultimate-orb'], assembledPool: ['eye-of-skadi'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity },
    signatureExotic: 'defile-growth'
  },
  {
    id: 'queen-of-blades',
    name: 'The Queen of Blades',
    location: 'Fallen-star crater, Devarshi Desert',
    unlockQuest: 'recruit-phantom-assassin',
    boss: { heroId: 'broodmother', level: 30, items: ['diffusal-blade', 'black-king-bar'], hpScale: 2.3, damageScale: 1.05 },
    addWaves: [{ atHpPct: 85, summon: swarm, count: 4 }, { atHpPct: 55, summon: swarm, count: 5 }, { atHpPct: 25, summon: swarm, count: 6 }],
    zones: [{ atHpPct: 75, zone: { ...fireZone, radius: 300 } }, { atHpPct: 40, zone: { ...fireZone, radius: 420 } }],
    enrageSec: 135,
    loot: { guaranteed: ['mystic-staff'], assembledPool: ['refresher-orb'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity },
    signatureExotic: 'swarm-spread'
  }
];
