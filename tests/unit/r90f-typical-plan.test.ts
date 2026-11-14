/**
 * Round ninety: scripts/corpus-plan-r90-typical.txt, the dry run that shows what the typical-spot rule of 14 November 2026
 * (r90c) moves before the next walk moves it. The plan derives and writes nothing to the corpus: one dry run, then a review
 * whose checks hold the climates gained and lost near zero and name the spots moved. No walk, no index, no upload.
 *
 * On 8df264e: FAILED (the plan was not there).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePlan } from '../../scripts/corpus-step.mjs';
import { runChecks } from '../../scripts/review-checks.mjs';
import { DryRunTotals } from '../../src/lib/dossier/range-dry-run';

const plan = parsePlan(readFileSync('scripts/corpus-plan-r90-typical.txt', 'utf8')) as Array<{ line: string; kind: string; expects: Array<{ text: string }> }>;

describe('r90f: the typical-spot dry run', () => {
  it('one dry run of every page, offline, with the climate grid, then a review', () => {
    expect(plan.map((s) => s.line.split(' ').slice(0, 2).join(' '))).toEqual(['dossier --dry-run', 'review Read']);
    expect(plan[0].line).toBe('dossier --dry-run --offline --grid climate --bulk bulk');
  });
  it('writes nothing to the corpus and uploads nothing', () => {
    expect(plan.some((s) => /--walk|--index|--keys|--fill/.test(s.line) || ['upload', 'backup', 'live-check'].includes(s.kind))).toBe(false);
  });
  it('the review checks its own figures: climates gained and lost at most 50, the spots moved read', () => {
    expect(plan[1].expects?.map((e) => e.text)).toEqual(['let G /climates: ([\\d,]+) gained/', 'let L /climates: [\\d,]+ gained, ([\\d,]+) lost/', 'let M /typical spots moved: ([\\d,]+)/', 'G <= 50', 'L <= 50', 'M >= 0', 'no /COULD NOT BE READ/']);
  });
  it("the checks read the dry run's own summary: they pass on a run that moves spots, and stop one that loses climates", () => {
    const run = (gained: number, lost: number, moved: number) => {
      const t = new DryRunTotals();
      Object.assign(t, { pages: 48375, changedPages: moved, climateGained: gained, climateLost: lost, spotsMoved: moved, spotsMoved10: moved });
      return runChecks(plan[1].expects, t.lines(true).join('\n'));
    };
    const ok = run(0, 2, 1234);
    expect(ok.pass, ok.lines.join('\n')).toBe(true);
    expect(ok.lines).toContain('    M = 1,234');
    expect(run(0, 51, 1234).pass).toBe(false);
    expect(run(60, 0, 1234).pass).toBe(false);
  });
});
