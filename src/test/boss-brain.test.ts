import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupRaidSim } from '../core/macro';
import { bossPhaseOf, pickBossFocus, pickBossMechanic, type BossMechanicCandidate } from '../core/boss-brain';
import type { Unit } from '../core/unit';

// ============================================================
// AI_OVERHAUL A5: the boss phase-FSM picks a posture target each
// phase; the shared scorer turns it into an action. Variety is seeded
// and deterministic. The scripted beats stay authoritative (raids.test).
// ============================================================

beforeAll(() => registerAllContent());

function raid(party: string[]) {
  const sim = setupRaidSim({
    seed: 51,
    party: party.map((heroId) => ({ heroId, level: 20 })),
    boss: { heroId: 'sven', level: 24, hpScale: 4, damageScale: 1 },
    maxSec: 60
  });
  const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
  const get = (heroId: string) => sim.unitsArr.find((u) => u.team === 0 && u.heroId === heroId)!;
  return { sim, boss, get };
}

describe('boss phase-FSM', () => {
  it('reads phases from the enrage timer and boss HP', () => {
    const { sim, boss } = raid(['sniper', 'crystal-maiden']);
    boss.ctrl.boss!.enrageSec = undefined;

    boss.hp = boss.stats.maxHp;
    expect(bossPhaseOf(sim, boss)).toBe('opening');
    boss.hp = boss.stats.maxHp * 0.7;
    expect(bossPhaseOf(sim, boss)).toBe('sustained');
    boss.hp = boss.stats.maxHp * 0.4;
    expect(bossPhaseOf(sim, boss)).toBe('pressure');
    boss.hp = boss.stats.maxHp * 0.1;
    expect(bossPhaseOf(sim, boss)).toBe('desperation');

    // the enrage timer outranks HP
    boss.hp = boss.stats.maxHp;
    boss.ctrl.boss!.enrageSec = 0;
    expect(bossPhaseOf(sim, boss)).toBe('enrage');
  });

  it('honors the chosen posture: healer, cluster, kill, or threat', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden', 'juggernaut']);
    const cm = get('crystal-maiden');
    const sniper = get('sniper');
    const jugg = get('juggernaut');
    const phase = bossPhaseOf(sim, boss);

    // healer posture cuts to the support
    boss.ctrl.boss = { depth: 1, phase, pref: 'healer' };
    expect((pickBossFocus(sim, boss) as Unit).uid).toBe(cm.uid);

    // cluster posture picks a packed body
    sniper.pos = { x: boss.pos.x - 300, y: boss.pos.y };
    jugg.pos = { x: boss.pos.x - 320, y: boss.pos.y + 40 };
    cm.pos = { x: boss.pos.x - 1500, y: boss.pos.y };
    boss.ctrl.boss = { depth: 1, phase, pref: 'cluster' };
    expect([sniper.uid, jugg.uid]).toContain((pickBossFocus(sim, boss) as Unit).uid);

    // kill posture secures the lowest-hp enemy
    jugg.hp = jugg.stats.maxHp * 0.05;
    boss.ctrl.boss = { depth: 1, phase, pref: 'kill' };
    expect((pickBossFocus(sim, boss) as Unit).uid).toBe(jugg.uid);

    // threat posture follows the table
    boss.ctrl.threat = { [sniper.uid]: 900 };
    boss.ctrl.boss = { depth: 1, phase, pref: 'threat' };
    expect((pickBossFocus(sim, boss) as Unit).uid).toBe(sniper.uid);
  });

  it('healer posture prefers wounded low-threat supports over the nearest support', () => {
    const { sim, boss, get } = raid(['crystal-maiden', 'omniknight', 'sniper']);
    const cm = get('crystal-maiden');
    const omni = get('omniknight');
    const phase = bossPhaseOf(sim, boss);

    cm.pos = { x: boss.pos.x - 180, y: boss.pos.y };
    cm.hp = cm.stats.maxHp;
    omni.pos = { x: boss.pos.x - 760, y: boss.pos.y };
    omni.hp = omni.stats.maxHp * 0.25;
    boss.ctrl.threat = { [cm.uid]: 1200, [omni.uid]: 20 };
    boss.ctrl.boss = { depth: 1, phase, pref: 'healer' };

    expect((pickBossFocus(sim, boss) as Unit).uid).toBe(omni.uid);
  });

  it('depth 0 never leaves the threat target', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    const sniper = get('sniper');
    boss.hp = boss.stats.maxHp * 0.4; // pressure: where a deep brain would go for the healer
    boss.ctrl.threat = { [sniper.uid]: 700 };
    boss.ctrl.boss = { depth: 0 }; // force a fresh roll with no opportunism
    expect((pickBossFocus(sim, boss) as Unit).uid).toBe(sniper.uid);
  });

  it('is deterministic: identical seed and state roll the same posture', () => {
    const a = raid(['sniper', 'crystal-maiden', 'juggernaut']);
    const b = raid(['sniper', 'crystal-maiden', 'juggernaut']);
    for (const r of [a, b]) {
      r.boss.hp = r.boss.stats.maxHp * 0.4;
      r.boss.ctrl.threat = { [r.get('sniper').uid]: 600 };
      r.boss.ctrl.boss = { depth: 1, enrageSec: undefined };
    }
    const fa = pickBossFocus(a.sim, a.boss);
    const fb = pickBossFocus(b.sim, b.boss);
    expect(a.boss.ctrl.boss!.pref).toBe(b.boss.ctrl.boss!.pref);
    expect(fa?.heroId).toBe(fb?.heroId);
  });
});

describe('boss mechanic selection', () => {
  const cand = (over: Partial<BossMechanicCandidate>): BossMechanicCandidate => ({
    key: 'm', kind: 'zone', atHpPct: 90, armedAt: 0, ...over
  });

  it('starts nothing when no beats are armed', () => {
    const { sim, boss } = raid(['sniper', 'crystal-maiden']);
    expect(pickBossMechanic(sim, boss, [])).toBeNull();
  });

  it('holds a freshly-armed area beat until the party clusters, then fires it', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    const sniper = get('sniper');
    const cm = get('crystal-maiden');
    boss.hp = boss.stats.maxHp; // opening, where a 90% zone arms
    boss.ctrl.boss = { depth: 1 };

    // spread out: no two bodies share a cluster, so the area beat waits
    sniper.pos = { x: boss.pos.x - 1400, y: boss.pos.y };
    cm.pos = { x: boss.pos.x - 2600, y: boss.pos.y + 1400 };
    sim.rebuildSpatial();
    const zone = cand({ key: 'zone-0', kind: 'zone', atHpPct: 90, armedAt: sim.time });
    expect(pickBossMechanic(sim, boss, [zone])).toBeNull();

    // pack the heroes together: now the zone is worth starting
    sniper.pos = { x: boss.pos.x - 300, y: boss.pos.y };
    cm.pos = { x: boss.pos.x - 320, y: boss.pos.y + 40 };
    sim.rebuildSpatial();
    expect(pickBossMechanic(sim, boss, [zone])).toBe('zone-0');
  });

  it('stops holding an area beat once it has waited long enough', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    get('sniper').pos = { x: boss.pos.x - 1400, y: boss.pos.y };
    get('crystal-maiden').pos = { x: boss.pos.x - 2600, y: boss.pos.y + 1400 };
    boss.hp = boss.stats.maxHp;
    boss.ctrl.boss = { depth: 1 };
    sim.rebuildSpatial();

    const stale = cand({ key: 'zone-0', kind: 'zone', atHpPct: 90, armedAt: sim.time - 5 });
    expect(pickBossMechanic(sim, boss, [stale])).toBe('zone-0');
  });

  it('does not start a beat from a deeper phase than the boss is in', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    get('sniper').pos = { x: boss.pos.x - 300, y: boss.pos.y };
    get('crystal-maiden').pos = { x: boss.pos.x - 320, y: boss.pos.y + 40 };
    sim.rebuildSpatial();
    // signature reads as a 'pressure' beat; armed stale so the cluster-hold can't mask the gate
    const sig = cand({ key: 'signature', kind: 'signature', atHpPct: 50, armedAt: sim.time - 5 });

    boss.hp = boss.stats.maxHp; // opening — too early for a pressure beat
    boss.ctrl.boss = { depth: 1 };
    expect(pickBossMechanic(sim, boss, [sig])).toBeNull();

    boss.hp = boss.stats.maxHp * 0.4; // pressure — now it may start
    boss.ctrl.boss = { depth: 1 };
    expect(pickBossMechanic(sim, boss, [sig])).toBe('signature');
  });

  it('prioritizes the enrage beat once the enrage phase begins', () => {
    const { sim, boss } = raid(['sniper', 'crystal-maiden']);
    boss.ctrl.boss = { depth: 1, enrageSec: 0 }; // sim.time >= 0 => enrage phase
    const candidates = [
      cand({ key: 'wave-0', kind: 'add-wave', atHpPct: 90, armedAt: sim.time }),
      cand({ key: 'enrage', kind: 'enrage', atHpPct: 0, armedAt: sim.time })
    ];
    expect(pickBossMechanic(sim, boss, candidates)).toBe('enrage');
  });
});
