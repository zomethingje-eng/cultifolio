/**
 * Round eighty-eight (the speed round), 4: an offline build derives several pages at once (`--pages`, 8 by default), and
 * writes exactly what it wrote one page at a time. Twelve pages (tests/unit/helpers/r88-pages.ts) are built offline with
 * --pages 1 and with --pages 8 in two folders, and walked in a dry run both ways: the pages written, the log's page lines in
 * order (the ms aside) and the dry run's list are the same, and the trace shows the pages overlapping.
 *
 * On r87 (7e37f38): --pages is not read, so the two runs agree trivially; the test is of the round's own change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builder, folder, pages, pageLines, mostAtOnce, N } from './helpers/r88-pages';

describe('r88s 4: pages derived at once write what pages derived one at a time write', () => {
  it('an offline --keys build: the same twelve pages, the same lines in the same order', () => {
    const one = folder(), many = join(tmpdir(), `r88s-pages-many-${process.pid}`);
    cpSync(one, many, { recursive: true });
    const a = builder(one, '--keys', 'list.txt', '--offline', '--bulk', 'bulk', '--pages', '1');
    const b = builder(many, '--keys', 'list.txt', '--offline', '--bulk', 'bulk', '--pages', '8');
    expect(a.status, a.stderr + a.stdout).toBe(0);
    expect(b.status, b.stderr + b.stdout).toBe(0);
    expect(a.stdout).not.toContain('pages derived at once');
    expect(b.stdout).toContain('8 pages derived at once');
    expect(a.stdout).toContain(`${N} built`);
    const pa = pages(one), pb = pages(many);
    expect(Object.keys(pa)).toHaveLength(N);
    expect(pb).toEqual(pa);
    expect(pageLines(b.stdout)).toEqual(pageLines(a.stdout));
    expect(pageLines(a.stdout)).toHaveLength(N);
    // And they did overlap: one at a time with --pages 1, several at once with --pages 8.
    expect(mostAtOnce(a.stderr)).toBe(1);
    expect(mostAtOnce(b.stderr)).toBeGreaterThan(1);
  }, 240_000);
  it('a dry run: the same lines, totals and list, and nothing written', () => {
    const one = folder(), many = join(tmpdir(), `r88s-pages-dry-${process.pid}`);
    cpSync(one, many, { recursive: true });
    const a = builder(one, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--pages', '1');
    const b = builder(many, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--pages', '8');
    expect(a.status, a.stderr + a.stdout).toBe(0);
    expect(b.status, b.stderr + b.stdout).toBe(0);
    expect(pageLines(b.stdout)).toEqual(pageLines(a.stdout));
    const totals = (o: string) => o.slice(o.indexOf('Dry run, rule'));
    expect(totals(b.stdout)).toBe(totals(a.stdout));
    expect(readFileSync(join(many, 'dry-run-records.txt'), 'utf8')).toBe(readFileSync(join(one, 'dry-run-records.txt'), 'utf8'));
  }, 240_000);
  it('3. the bulk cache: a build reading it writes what a build reading the files wrote (round eighty-eight, 3)', () => {
    const files = folder(), kept = join(tmpdir(), `r88s-pages-cache-${process.pid}`);
    cpSync(files, kept, { recursive: true });
    const a = builder(files, '--keys', 'list.txt', '--offline', '--bulk', 'bulk', '--no-bulk-cache');
    expect(a.status, a.stderr + a.stdout).toBe(0);
    expect(existsSync(join(files, 'bulk/.cache'))).toBe(false);
    const first = builder(kept, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(first.status, first.stderr + first.stdout).toBe(0);
    expect(first.stdout).toContain('kept in the bulk cache');
    // The pages the first build wrote put back as they were, so the second build starts where the first did.
    cpSync(join(files, 'static'), join(kept, 'static'), { recursive: true });
    for (const f of Object.keys(pages(kept))) cpSync(join(folder(), 'static/s/v3', f), join(kept, 'static/s/v3', f));
    const second = builder(kept, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(second.status, second.stderr + second.stdout).toBe(0);
    expect(second.stdout).toContain('from the bulk cache');
    expect(pages(kept)).toEqual(pages(files));
    expect(pageLines(second.stdout)).toEqual(pageLines(a.stdout));
  }, 300_000);
});
