/**
 * Round eighty-nine: a review stop that checks its own figures (scripts/review-checks.mjs; the owner's decision of
 * 11 November 2026). `expect` lines under a review line check what the builder steps since the review before printed:
 * every check holding, the run says each figure and carries on; any not, or a figure not found, a stop as always, the
 * failed checks first. A review with no `expect` line stops as before. Adding `expect` lines to a plan under way keeps
 * where its run is.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExpect, runChecks } from '../../scripts/review-checks.mjs';
import { run, parsePlan, sameSteps, EXIT } from '../../scripts/corpus-step.mjs';
import { floweringLine } from '../../src/lib/dossier/flowering';
import { bhlLine } from '../../src/lib/dossier/bhl';

const checks = (lines: string[], output: string) => runChecks(lines.map((l) => parseExpect(l)), output);

describe('r89b 1: the checks', () => {
  const out = [
    '  4000 pages asked of iNaturalist on 2026-11-14: 3,950 read (12 with none), 50 not answered; 40,012 read before and passed by; 4,400 with no iNaturalist taxon, not asked; 0 left to ask',
    '  index: 48375 species',
    '  index: 48376 species'
  ].join('\n');
  it('a figure from the last line it matches, commas read; sums, bounds and ±%', () => {
    const r = checks(['let R /: ([\\d,]+) read \\(/', 'let B /; ([\\d,]+) read before/', 'let U /, ([\\d,]+) not answered/', 'let I /index: (\\d+) species/', 'R + B ~ 44000 ±5%', 'U <= 300', 'I >= 48375', 'has /0 left to ask/', 'no /NOT the one its publisher gives/'], out);
    expect(r.pass).toBe(true);
    expect(r.lines).toEqual([
      '    R = 3,950', '    B = 40,012', '    U = 50', '    I = 48,376',
      '  ✓ R + B = 43,962, expected about 44,000 (±5%)', '  ✓ U = 50, expected <= 300', '  ✓ I = 48,376, expected >= 48,375',
      '  ✓ a line matches /0 left to ask/', '  ✓ no line matches /NOT the one its publisher gives/'
    ]);
  });
  it('a figure out of bounds, a figure not found, a line that should not be there: each fails, saying what it found', () => {
    const r = checks(['let U /, ([\\d,]+) not answered/', 'U <= 10', 'let K /(\\d+) given a Köppen/', 'K ~ 37667 ±1%', 'no /not answered/'], out);
    expect(r.pass).toBe(false);
    expect(r.lines).toEqual([
      '    U = 50', '  ✗ U = 50, expected <= 10', '  ✗ K: not found (/(\\d+) given a Köppen/)', '  ✗ K ~ 37667 ±1%: K not found',
      `  ✗ no line matches /not answered/: "${out.split('\n')[0].trim().slice(0, 160)}"`
    ]);
  });
  it('a check it cannot read stops the plan before anything runs', () => {
    expect(() => parseExpect('R + B about 44000')).toThrow(/not a check this script reads/);
    expect(() => parseExpect('R ~ 44000')).toThrow(/~ needs ±N%/);
    expect(() => parseExpect('R = 4 ±5%')).toThrow(/±N% goes with ~ only/);
    expect(() => parseExpect('let R no pattern')).toThrow(/not a check this script reads/);
    expect(() => parsePlan('dossier --index\nexpect let I /index: (\\d+)/')).toThrow(/line 2: .*an expect line goes under a review line/);
    expect(() => parsePlan('review Read it.\nexpect I => 4')).toThrow(/line 2: /);
  });
  it('expect lines belong to the review above them, not steps of their own: a plan given them keeps where its run is', () => {
    const without = parsePlan('dossier --fill a\nreview Read it.\nupload');
    const withChecks = parsePlan('dossier --fill a\nreview Read it.\nexpect let N /(\\d+) read/\nexpect N > 0\nupload');
    expect(withChecks.map((s) => s.line)).toEqual(without.map((s) => s.line));
    expect(withChecks[1].expects).toHaveLength(2);
    expect(sameSteps({ steps: without.map((s) => ({ line: s.line })) }, withChecks)).toBe(true);
  });
});

describe('r89b 2: the plan\'s runner', () => {
  let root = '', out = '';
  const setup = (plan: string) => {
    root = mkdtempSync(join(tmpdir(), 'r89b-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
    out = '';
  };
  const runner = (answers: Record<string, string>) => async (_cmd: string, args: string[], onOutput: (s: string) => void) => {
    const key = args.slice(args.indexOf('scripts/build-dossiers.ts') + 1).join(' ');
    onOutput(answers[key] ?? '  done.\n');
    return 0;
  };
  const go = (answers: Record<string, string>, argv: string[] = []) => run({ root, argv, exec: runner(answers), fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1024, why: 'test' } });
  const state = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8'));
  const PLAN = 'dossier --fill a\ndossier --fill b\nreview Read the two fills.\nexpect let A /(\\d+) read by a/\nexpect let B /(\\d+) read by b/\nexpect A + B ~ 100 ±10%\nexpect no /refused/\ndossier --index\n';

  it('the figures as the plan says: the review passes itself, says each figure, and the run carries on', async () => {
    setup(PLAN);
    const code = await go({ '--fill a': '  60 read by a\n', '--fill b': '  45 read by b\n' });
    expect(code).toBe(EXIT.done);
    expect(out).toContain("the review's 4 checks hold:\n    A = 60\n    B = 45\n  ✓ A + B = 105, expected about 100 (±10%)\n  ✓ no line matches /refused/\n  carrying on (the review: Read the two fills.)");
    expect(state().steps.map((s: { status: string }) => s.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(state().steps[2].note).toMatch(/^passed by its 4 checks /);
    expect(readFileSync(join(root, 'corpus-step.log'), 'utf8')).toContain('✓ A + B = 105');
  });

  it('a figure off: a stop as always, the failed check first; --go-on carries on past it', async () => {
    setup(PLAN);
    const code = await go({ '--fill a': '  60 read by a\n', '--fill b': '  5 read by b; 3 refused\n' });
    expect(code).toBe(EXIT.review);
    expect(out).toContain('Review before going on: Its checks do not all hold:\n    A = 60\n    B = 5\n  ✗ A + B = 65, expected about 100 (±10%)\n  ✗ no line matches /refused/: "5 read by b; 3 refused"\nRead the two fills.');
    expect(state().steps[3].status).toBe('to do');
    expect(await go({}, ['--go-on'])).toBe(EXIT.done);
  });

  it('the steps\' output is kept with the run, so a review after a restart still checks it; without it, a stop', async () => {
    setup('dossier --fill a\nreview Read it.\nexpect let A /(\\d+) read by a/\nexpect A > 0\ndossier --index\n');
    // The run stopped after the fill (as a Ctrl-C or a restart would leave it): the review is read by the next run.
    const first = await run({ root, argv: [], exec: async (_c: string, args: string[], on: (x: string) => void) => { on('  7 read by a\n'); return args.includes('--index') ? 9 : 0; }, fetchCorpus: async () => 'aaaa1111', log: () => {}, waitMs: 0, heap: { mb: 1024, why: 'test' } });
    expect(first).toBe(EXIT.failed); // the index step failed after the review passed
    expect(state().steps[1].status).toBe('done');
    expect(existsSync(join(root, 'corpus-step.out-1.txt'))).toBe(true);
    // Another plan: the fill's record from before round eighty-nine holds no output; the review cannot check, and stops.
    setup('dossier --fill a\nreview Read it.\nexpect let A /(\\d+) read by a/\nexpect A > 0\n');
    await go({ '--fill a': '  7 read by a\n' });
    const st = state();
    st.steps[1].status = 'to do';
    delete st.steps[0].out;
    writeFileSync(join(root, 'corpus-step.json'), JSON.stringify(st));
    unlinkSync(join(root, 'corpus-step.out-1.txt'));
    out = '';
    expect(await go({})).toBe(EXIT.review);
    expect(out).toContain('Its checks were not run: "dossier --fill a" left no output kept by this run');
  });

  it('a review with no expect line stops as it always has', async () => {
    setup('dossier --fill a\nreview Read it.\ndossier --index\n');
    expect(await go({})).toBe(EXIT.review);
    expect(out).toContain('Review before going on: Read it.');
  });
});

describe('r89b 3: the daily plan\'s review, on the fills\' own lines', () => {
  const review = parsePlan(readFileSync('scripts/corpus-plan-r87-daily.txt', 'utf8')).find((x) => x.kind === 'review')!;
  const output = (o: { left?: number; unanswered?: number; held?: string } = {}) => [
    floweringLine({ pages: 48375, asked: 3900, read: 3880, zero: 400, unanswered: o.unanswered ?? 20, noTaxon: 4410, before: 40050, lines: [] } as never, '2026-11-24', o.left ?? 0),
    bhlLine({ pages: 48375, asked: 3800, linked: 3000, none: 790, unanswered: 10, notAskable: 8390, before: 36150, ...(o.held ? { held: o.held } : {}) } as never, '2026-11-24'),
    '  index: 48375 species'
  ].join('\n');
  it('a last day as the plan expects it: every check holds', () => {
    const r = runChecks(review.expects, output());
    expect(r.lines.filter((l: string) => l.startsWith('  ✗'))).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('pages left to ask, a fill stopped, or hundreds not answered: a stop', () => {
    expect(runChecks(review.expects, output({ left: 120 })).pass).toBe(false);
    expect(runChecks(review.expects, output({ unanswered: 900 })).pass).toBe(false);
    expect(runChecks(review.expects, output({ held: "BHL's day of 4,000 requests is spent" })).pass).toBe(false);
  });
});
