import type { CreepDef } from '../../core/types';

// ============================================================
// Phase 1 wild creeps — the catchable "Pokémon" of the vale,
// with their real Dota neutral abilities (SPEC §5).
// ============================================================

export const KOBOLD: CreepDef = {
  id: 'kobold',
  name: 'Kobold',
  tier: 'small',
  stats: { maxHp: 240, damage: 14, armor: 0, magicResistPct: 0, moveSpeed: 280, attackRange: 100, baseAttackTime: 1.6 },
  abilities: [],
  bounty: { xp: 28, gold: 16 },
  silhouette: { build: 'biped', scale: 0.55, bodyShape: 'slim', head: 'bare', weapon: 'sword' },
  palette: ['#b8743c', '#7a4a22', '#e8d8a0'],
  aggroRadius: 500
};

export const KOBOLD_FOREMAN: CreepDef = {
  id: 'kobold-foreman',
  name: 'Kobold Foreman',
  tier: 'medium',
  stats: { maxHp: 400, damage: 22, armor: 1, magicResistPct: 0, moveSpeed: 290, attackRange: 100, baseAttackTime: 1.5 },
  abilities: [
    {
      id: 'kobold-speed-aura',
      name: 'Speed Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { moveSpeedPct: 12 } },
      vfx: { archetype: 'global-mark', color: '#ffd27f', scale: 0.4 }
    }
  ],
  bounty: { xp: 48, gold: 30 },
  silhouette: { build: 'biped', scale: 0.7, bodyShape: 'slim', head: 'helm', weapon: 'totem', extras: ['belt'] },
  palette: ['#c8843c', '#7a4a22', '#ffd27f'],
  aggroRadius: 550
};

export const HILL_TROLL: CreepDef = {
  id: 'hill-troll',
  name: 'Hill Troll Berserker',
  tier: 'medium',
  stats: { maxHp: 360, damage: 26, armor: 0, magicResistPct: 0, moveSpeed: 290, attackRange: 500, baseAttackTime: 1.55, attackProjectileSpeed: 1200 },
  abilities: [],
  bounty: { xp: 52, gold: 32 },
  silhouette: { build: 'biped', scale: 0.8, bodyShape: 'slim', head: 'bare', weapon: 'rifle', extras: ['quiver'] },
  palette: ['#7a9b5c', '#4a6b3c', '#e8d8a0'],
  aggroRadius: 600
};

export const VHOUL_ASSASSIN: CreepDef = {
  id: 'vhoul-assassin',
  name: 'Vhoul Assassin',
  tier: 'medium',
  stats: { maxHp: 330, damage: 20, armor: 2, magicResistPct: 0, moveSpeed: 310, attackRange: 110, baseAttackTime: 1.4 },
  abilities: [
    {
      id: 'vhoul-envenom',
      name: 'Envenomed Weapon',
      targeting: 'attack-modifier',
      values: { dps: [12, 18, 24] },
      attackMod: {
        procChance: 100,
        procStatus: { status: 'buff', duration: 3, params: { dotDps: 'dps', dotType: 'magical', tag: 'vhoul-poison' } }
      },
      vfx: { archetype: 'projectile', color: '#9fdc5c', scale: 0.4 }
    }
  ],
  bounty: { xp: 56, gold: 34 },
  silhouette: { build: 'biped', scale: 0.65, bodyShape: 'slim', head: 'hood', weapon: 'sword', extras: ['cape'] },
  palette: ['#5c7a3c', '#2c3a1c', '#c8e85c'],
  aggroRadius: 550
};

export const HELLBEAR: CreepDef = {
  id: 'hellbear',
  name: 'Hellbear Smasher',
  tier: 'large',
  stats: { maxHp: 950, damage: 45, armor: 3, magicResistPct: 10, moveSpeed: 280, attackRange: 128, baseAttackTime: 1.75 },
  abilities: [
    {
      id: 'hellbear-clap',
      name: 'Thunder Clap',
      targeting: 'no-target',
      castPoint: 0.3,
      manaCost: [60, 70, 80],
      cooldown: [12, 11, 10],
      values: {
        damage: [90, 130, 170],
        radius: [300, 300, 300],
        slowMs: [25, 30, 35]
      },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slowMs', attackSlowPct: 'slowMs' } }
      ],
      vfx: { archetype: 'ground-aoe', color: '#c87a5c', color2: '#7a3a22', scale: 1 }
    }
  ],
  bounty: { xp: 110, gold: 70 },
  silhouette: { build: 'brute', scale: 1.2, bodyShape: 'bulky', head: 'horned', weapon: 'none' },
  palette: ['#a05c3c', '#5e2f1a', '#e8b15c'],
  aggroRadius: 650
};

export const GRANITE_GOLEM: CreepDef = {
  id: 'granite-golem',
  name: 'Granite Golem',
  tier: 'ancient',
  stats: { maxHp: 2200, damage: 80, armor: 6, magicResistPct: 40, moveSpeed: 270, attackRange: 140, baseAttackTime: 2.0 },
  abilities: [
    {
      id: 'golem-granite-aura',
      name: 'Granite Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { maxHp: 200 }, excludeSelf: true },
      vfx: { archetype: 'global-mark', color: '#a9a9c8', scale: 0.5 }
    },
    {
      id: 'golem-bash',
      name: 'Crushing Fists',
      targeting: 'attack-modifier',
      attackMod: {
        procChance: 15,
        procDamage: 40,
        procStatus: { status: 'stun', duration: 0.6 }
      },
      vfx: { archetype: 'stun-stars', color: '#e8e8ff', scale: 0.5 }
    }
  ],
  bounty: { xp: 300, gold: 190 },
  silhouette: { build: 'golem', scale: 1.5, bodyShape: 'bulky', head: 'bare', weapon: 'none' },
  palette: ['#8a8aa9', '#4a4a6b', '#c8c8e8'],
  aggroRadius: 600
};

export const GHOST: CreepDef = {
  id: 'ghost',
  name: 'Ghost',
  tier: 'small',
  stats: { maxHp: 300, damage: 18, armor: 0, magicResistPct: 20, moveSpeed: 300, attackRange: 450, baseAttackTime: 1.6, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'ghost-frost-touch',
      name: 'Frost Touch',
      targeting: 'attack-modifier',
      attackMod: { procChance: 100, procStatus: { status: 'slow', duration: 1.5, params: { moveSlowPct: 18 } } },
      vfx: { archetype: 'projectile', color: '#bfeaff', scale: 0.4 }
    }
  ],
  bounty: { xp: 40, gold: 24 },
  silhouette: { build: 'blob', scale: 0.65, head: 'skull', weapon: 'none' },
  palette: ['#c7eaff', '#7fa8c8', '#ffffff'],
  aggroRadius: 560
};

export const ALPHA_WOLF: CreepDef = {
  id: 'alpha-wolf',
  name: 'Alpha Wolf',
  tier: 'medium',
  stats: { maxHp: 520, damage: 32, armor: 1, magicResistPct: 0, moveSpeed: 330, attackRange: 110, baseAttackTime: 1.45 },
  abilities: [
    {
      id: 'wolf-crit-aura',
      name: 'Packleader Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { damagePct: 12 } },
      vfx: { archetype: 'global-mark', color: '#d8d0aa', scale: 0.45 }
    }
  ],
  bounty: { xp: 70, gold: 44 },
  silhouette: { build: 'quad', scale: 0.85, head: 'bare', weapon: 'none' },
  palette: ['#7c6a54', '#3e352a', '#d8d0aa'],
  aggroRadius: 650
};

export const SATYR_BANISHER: CreepDef = {
  id: 'satyr-banisher',
  name: 'Satyr Banisher',
  tier: 'medium',
  stats: { maxHp: 430, damage: 24, armor: 1, magicResistPct: 15, moveSpeed: 300, attackRange: 550, baseAttackTime: 1.7, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'satyr-purge',
      name: 'Purge',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      manaCost: [75, 75, 75],
      cooldown: [14, 12, 10],
      effects: [
        { kind: 'purge', target: 'target' },
        { kind: 'status', status: 'slow', duration: 2.5, target: 'target', params: { moveSlowPct: 45 } }
      ],
      vfx: { archetype: 'shield', color: '#b880ff', scale: 0.6 }
    }
  ],
  bounty: { xp: 74, gold: 48 },
  silhouette: { build: 'biped', scale: 0.85, head: 'horned', weapon: 'staff' },
  palette: ['#8a5c9f', '#3a244f', '#d8a8ff'],
  aggroRadius: 620
};

export const HARPY_STORMCRAFTER: CreepDef = {
  id: 'harpy-stormcrafter',
  name: 'Harpy Stormcrafter',
  tier: 'medium',
  stats: { maxHp: 380, damage: 22, armor: 0, magicResistPct: 10, moveSpeed: 320, attackRange: 550, baseAttackTime: 1.65, attackProjectileSpeed: 1000 },
  abilities: [
    {
      id: 'harpy-chain-lightning',
      name: 'Chain Lightning',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 650,
      manaCost: [80, 90, 100],
      cooldown: [12, 11, 10],
      values: { damage: [85, 125, 165], bounces: [2, 3, 4], radius: [500, 500, 500], speed: [900, 900, 900] },
      effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', bounces: { count: 'bounces', radius: 'radius' }, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }] } }],
      vfx: { archetype: 'chain', color: '#f0e36f', scale: 0.6 }
    }
  ],
  bounty: { xp: 76, gold: 50 },
  silhouette: { build: 'bird', scale: 0.8, head: 'bare', weapon: 'none', extras: ['wings'] },
  palette: ['#e0d56a', '#6a6f9f', '#ffffff'],
  aggroRadius: 650
};

export const POLAR_FURBOLG: CreepDef = {
  id: 'polar-furbolg',
  name: 'Polar Furbolg',
  tier: 'large',
  stats: { maxHp: 1050, damage: 50, armor: 4, magicResistPct: 10, moveSpeed: 285, attackRange: 130, baseAttackTime: 1.8 },
  abilities: [
    {
      id: 'furbolg-war-club',
      name: 'War Club',
      targeting: 'no-target',
      castPoint: 0.35,
      manaCost: [70, 80, 90],
      cooldown: [13, 12, 11],
      values: { damage: [110, 155, 200], radius: [320, 320, 320] },
      effects: [
        { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'stun', duration: 0.6, target: 'enemies-in-radius', radius: 'radius' }
      ],
      vfx: { archetype: 'ground-aoe', color: '#d8f4ff', scale: 1 }
    }
  ],
  bounty: { xp: 130, gold: 86 },
  silhouette: { build: 'brute', scale: 1.2, bodyShape: 'bulky', head: 'bare', weapon: 'totem' },
  palette: ['#d8f4ff', '#8197a8', '#f8ffff'],
  aggroRadius: 670
};

export const ICE_SHAMAN: CreepDef = {
  id: 'ice-shaman',
  name: 'Ice Shaman',
  tier: 'medium',
  stats: { maxHp: 460, damage: 24, armor: 1, magicResistPct: 20, moveSpeed: 285, attackRange: 550, baseAttackTime: 1.7, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'ice-shaman-nova',
      name: 'Frost Ward',
      targeting: 'ground-aoe',
      castRange: 650,
      manaCost: [90, 95, 100],
      cooldown: [15, 13, 11],
      values: { damage: [70, 110, 150], radius: [300, 320, 340], slow: [25, 30, 35] },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow', attackSlowPct: 'slow' } }
      ],
      vfx: { archetype: 'ground-aoe', color: '#bfeaff', scale: 0.8 }
    }
  ],
  bounty: { xp: 80, gold: 54 },
  silhouette: { build: 'biped', scale: 0.8, bodyShape: 'robed', head: 'hood', weapon: 'staff' },
  palette: ['#bfeaff', '#4f6c88', '#ffffff'],
  aggroRadius: 620
};

export const ALL_CREEPS: CreepDef[] = [
  KOBOLD,
  KOBOLD_FOREMAN,
  HILL_TROLL,
  VHOUL_ASSASSIN,
  HELLBEAR,
  GRANITE_GOLEM,
  GHOST,
  ALPHA_WOLF,
  SATYR_BANISHER,
  HARPY_STORMCRAFTER,
  POLAR_FURBOLG,
  ICE_SHAMAN
];
