/**
 * Round ninety-five: `stop <what to read>`, a review that always stops (docs/PLAN-95.md, 1). Round ninety-four's plan meant
 * its dry run's review to stop every time and gave it three `expect` checks; corpus-step carries on past a review whose
 * checks all hold (round eighty-nine), so it carried on, and the figures were read only afterwards
 * (docs/REVIEW-ROUND-94.md). A `stop` checks its `expect` lines and says them first, as a review does, and stops even when
 * they hold; `--go-on` passes it as it passes a review. A `review` is as it was.
 *
 * On 7b73054: parsePlan threw on "stop Read it." ("is not a step this script knows"): FAILED.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parsePlan, EXIT } from '../../scripts/corpus-step.mjs';

describe('r95a 1: the plan line', () => {
  it('stop is a review that always stops; expect lines go under it; it is not conditional', () => {
    const p = parsePlan('dossier --fill a\nstop Read it.\nexpect let A /(\\d+) read/\nexpect A > 0\nreview Read again.\nupload');
    expect(p.map((s) => [s.kind, s.always ?? false])).toEqual([['dossier', false], ['review', true], ['review', false], ['upload', false]]);
    expect(p[1].args).toEqual(['Read it.']);
    expect(p[1].expects).toHaveLength(2);
    expect(p[1].line).toBe('stop Read it.');
    expect(() => parsePlan('if-exists x.txt stop Read it.')).toThrow(/a stop is not conditional/);
  });
});

describe('r95a 2: the runner', () => {
  let root = '', out = '';
  const setup = (plan: string) => {
    root = mkdtempSync(join(tmpdir(), 'r95a-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
    out = '';
  };
  const go = (argv: string[] = []) => run({
    root, argv,
    exec: async (_cmd: string, _args: string[], onOutput: (s: string) => void) => { onOutput('  13 pages derived, nothing written\n'); return 0; },
    fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1024, why: 'test' }
  });
  const state = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8'));
  const checks = 'expect let P /(\\d+) pages derived/\nexpect P = 13\n';

  it('a stop whose checks hold stops all the same, saying them first; --go-on carries on', async () => {
    setup(`dossier --dry-run\nstop Read each page.\n${checks}dossier --index\n`);
    expect(await go()).toBe(EXIT.review);
    expect(out).toContain('Review before going on: Its 2 checks hold (a stop all the same: the plan says stop):\n    P = 13\n  ✓ P = 13, expected = 13\nRead each page.');
    expect(state().steps.map((s: { status: string }) => s.status)).toEqual(['done', 'review', 'to do']);
    expect(await go(['--go-on'])).toBe(EXIT.done);
  });

  it('a stop whose checks fail stops with the failed check first, as a review does', async () => {
    setup(`dossier --dry-run\nstop Read each page.\nexpect let P /(\\d+) pages derived/\nexpect P = 12\ndossier --index\n`);
    expect(await go()).toBe(EXIT.review);
    expect(out).toContain('Review before going on: Its checks do not all hold:\n    P = 13\n  ✗ P = 13, expected = 12\nRead each page.');
  });

  it('a review with the same checks carries on, as round eighty-nine made it', async () => {
    setup(`dossier --dry-run\nreview Read each page.\n${checks}dossier --index\n`);
    expect(await go()).toBe(EXIT.done);
    expect(out).toContain("the review's 2 checks hold:");
  });
});
