/**
 * Round eighty-eight (the speed round), 2: the walk reports what the dry run reports, as it writes, so a round derives its
 * pages once. On twelve pages (tests/unit/helpers/r88-pages.ts): the walk's totals and its list of the pages that change
 * are the dry run's; and a walk that stopped and was resumed reports every page of the walk, not the last part alone.
 *
 * Both runs measure against round eighty-five's rule (`--policy-before r85`), under which these pages' records do change by
 * reason, so the totals agree on more than zeros.
 *
 * On r87 (7e37f38): 1 and 2 FAILED (the walk wrote no report and no walk-ranges.txt).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builder, folder, N, sp } from './helpers/r88-pages';

/** The totals block, the first line aside ("nothing written" in the dry run, "each written" in the walk). */
const totals = (out: string, head: RegExp) => {
  const at = out.search(head);
  expect(at, out.slice(-2000)).toBeGreaterThanOrEqual(0);
  const lines = out.slice(at).split('\n').slice(2);
  return lines.slice(0, lines.findIndex((l) => /one a line/.test(l))).join('\n');
};

describe('r88s 2: the walk reports the dry run\'s totals, every page of the walk', () => {
  it('1. a walk begun and ended in one run: the dry run\'s totals and its list', () => {
    const dry = folder(), walk = join(tmpdir(), `r88s-walk-${process.pid}`);
    cpSync(dry, walk, { recursive: true });
    const a = builder(dry, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--policy-before', 'r85');
    const b = builder(walk, '--walk', '--offline', '--bulk', 'bulk', '--policy-before', 'r85');
    expect(a.status, a.stderr + a.stdout).toBe(0);
    expect(b.status, b.stderr + b.stdout).toBe(0);
    expect(b.stdout).toContain(`${N} pages derived, each written`);
    expect(totals(b.stdout, /The walk, rule r87 against the dossiers before it/)).toBe(totals(a.stdout, /Dry run, rule r87 against the dossiers on disk/));
    expect(readFileSync(join(walk, 'walk-ranges.txt'), 'utf8')).toBe(readFileSync(join(dry, 'dry-run-records.txt'), 'utf8'));
    expect(readFileSync(join(walk, 'walk-ranges.txt'), 'utf8').trim().split('\n').length).toBeGreaterThan(0);
    // Against round eighty-five's rule the pages' records do change by reason, so the totals agree on something.
    expect(b.stdout).toMatch(/records: \+[1-9]\d* admitted on [1-9]/);
  }, 300_000);
  it('2. a walk stopped half-way and resumed: the report at its end counts all twelve pages', () => {
    const dry = folder(), walk = folder((i) => i < N / 2);
    cpSync(dry, walk + '-all', { recursive: true });
    const a = builder(dry, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--policy-before', 'r85');
    // The first part: six pages on disk, walked.
    const first = builder(walk, '--walk', '--offline', '--bulk', 'bulk', '--policy-before', 'r85');
    expect(first.status, first.stderr + first.stdout).toBe(0);
    expect(first.stdout).toContain(`${N / 2} pages derived, each written`);
    // The other six put on disk, as the pages a stopped walk had not reached, and the same line run again.
    for (let i = N / 2; i < N; i++) writeFileSync(join(walk, `static/s/v3/k${sp(i).id}.json`), readFileSync(join(dry, `static/s/v3/k${sp(i).id}.json`)));
    const rest = builder(walk, '--walk', '--offline', '--bulk', 'bulk', '--policy-before', 'r85');
    expect(rest.status, rest.stderr + rest.stdout).toBe(0);
    expect(rest.stdout).toMatch(/the walk began .*: 6 pages derived since, 6 to derive/);
    expect(rest.stdout).toContain(`${N} pages derived, each written`);
    expect(totals(rest.stdout, /The walk, rule r87 against the dossiers before it/)).toBe(totals(a.stdout, /Dry run, rule r87 against the dossiers on disk/));
    expect(readFileSync(join(walk, 'walk-ranges.txt'), 'utf8')).toBe(readFileSync(join(dry, 'dry-run-records.txt'), 'utf8'));
    // Every page of the walk has its line, each with its change and its figures (what the end counts from).
    const kept = readFileSync(join(walk, 'walk-changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { since: string; key: string; c: unknown; f: unknown });
    expect(new Set(kept.map((x) => x.key)).size).toBe(N);
    expect(new Set(kept.map((x) => x.since)).size).toBe(1);
    for (const x of kept) { expect(x.c).toBeTruthy(); expect(x.f).toBeTruthy(); }
  }, 300_000);
});
