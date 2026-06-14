import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import {
  ALL_EFFECT_KINDS,
  ALL_MECHANICS,
  COVERED_EFFECT_KINDS,
  COVERED_MECHANICS,
  COVERED_STATUSES,
  censusContent,
  type EffectKind,
  type Mechanic
} from './interactions/coverage';

// ============================================================
// INTERACTION VERIFICATION §3.1 / §5 (V0) — the coverage census.
//
// Walk every ability, item active, creep ability, and tagBoon;
// bucket by effect kind + mechanic + status; print the table
// (the denominator for the whole matrix); and fail closed when a
// registered effect kind, mechanic, or exotic id used in content
// has no behavioral harness tagged in coverage.ts (§7.1).
// ============================================================

beforeAll(() => registerAllContent());

function padCount(n: number): string {
  return String(n).padStart(4, ' ');
}

describe('interaction matrix: coverage census (V0)', () => {
  it('prints the effect-kind / mechanic / status census', () => {
    const c = censusContent();
    const lines: string[] = [];
    lines.push(`interaction census — ${c.abilityCount} castables, ${c.tagBoonCount} tag boons`);
    lines.push('  effect kinds:');
    for (const kind of ALL_EFFECT_KINDS) {
      const n = c.kinds.get(kind) ?? 0;
      const tag = COVERED_EFFECT_KINDS[kind] ? '' : '  <UNCOVERED>';
      lines.push(`    ${padCount(n)}  ${kind}${tag}`);
    }
    lines.push('  mechanics:');
    for (const mech of ALL_MECHANICS) lines.push(`    ${padCount(c.mechanics.get(mech) ?? 0)}  ${mech}`);
    lines.push('  statuses:');
    for (const [status, n] of [...c.statuses.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${padCount(n)}  status:${status}`);
    }
    lines.push(`  displace modes: ${[...c.displaceModes.entries()].map(([m, n]) => `${m}=${n}`).join(', ')}`);
    lines.push(`  exotic ids (${c.exoticIds.size}): ${[...c.exoticIds].sort().join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(c.abilityCount).toBeGreaterThan(200);
  });

  it('every effect kind used in content has a behavioral harness tagged', () => {
    const c = censusContent();
    const uncovered: string[] = [];
    for (const [kind] of c.kinds) {
      if (!COVERED_EFFECT_KINDS[kind as EffectKind]) uncovered.push(kind);
    }
    expect(uncovered, `effect kinds with no harness in coverage.ts: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every mechanic used in content has a behavioral harness tagged', () => {
    const c = censusContent();
    const uncovered: string[] = [];
    for (const [mech] of c.mechanics) {
      if (!COVERED_MECHANICS[mech as Mechanic]) uncovered.push(mech);
    }
    expect(uncovered, `mechanics with no harness in coverage.ts: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every status used in content has a behavioral assertion tagged', () => {
    const c = censusContent();
    const covered = new Set(COVERED_STATUSES);
    const uncovered: string[] = [];
    for (const [status] of c.statuses) if (!covered.has(status)) uncovered.push(status);
    expect(uncovered, `statuses with no assertion in status.test.ts: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every exotic id used in content is registered (fails closed on new exotics)', () => {
    const c = censusContent();
    const unregistered = [...c.exoticIds].filter((id) => !REG.exotics.has(id));
    expect(unregistered, `unregistered exotic ids: ${unregistered.join(', ')}`).toEqual([]);
  });

  it('the harness registry only tags kinds that exist in the vocabulary', () => {
    // Drift guard: a tagged kind that is no longer in the EffectNode union is dead coverage.
    for (const kind of Object.keys(COVERED_EFFECT_KINDS)) {
      expect(ALL_EFFECT_KINDS, `coverage.ts tags removed kind '${kind}'`).toContain(kind);
    }
  });
});
