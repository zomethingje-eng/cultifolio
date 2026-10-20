/**
 * Round seventy-nine (Z): the bucket's prune at the full list's size. At 48,368 species a corpus is about 67,000 files
 * in `p/` (63,791 of them the search's key files), and the bucket holds two corpora after a refresh. `rclone delete
 * --exclude-from keep.txt` tries every line of keep.txt as a rule on every file: on this machine 30,000 files against
 * 15,000 lines took 97 s and 60,000 against 30,000 took 284 s (the same names as a list: 0.8 s), so a full-size prune
 * took about half an hour to an hour a run, twice (the dry run and the delete).
 * The prune now lists the bucket with each file's upload time, and gives rclone the files to delete, those no manifest
 * names that were uploaded more than a day ago, as `--files-from-raw prune.txt` (one lookup a name; rclone takes it with no
 * other filter, so the day is read from the listing). FAILS on r79base: the delete is given keep.txt as --exclude-from,
 * and no prune.txt is written.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, EXIT } from '../../scripts/corpus-step.mjs';

const H = (n: number) => n.toString(16).padStart(32, '0');
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString().replace(/\.\d+Z$/, 'Z');
let root: string, out: string, calls: Array<{ cmd: string; args: string[] }>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'r79z-prune-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  out = '';
  calls = [];
});
/** A bucket of `listed` lines (as rclone lsf prints them) whose manifest names `named`. */
function bucket(named: string[], listed: string[]) {
  const live = { v: 3, id: 'live0079', built: 'x', species: 3, buckets: 32, postings: 64, files: Object.fromEntries(named.map((h, i) => [`entries/${i}.json`, h])) };
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ ...live, id: 'aaaa7979' }));
  return async (cmd: string, args: string[], onOutput: (s: string) => void) => {
    calls.push({ cmd, args });
    if (args[0] === 'copyto') { writeFileSync(join(root, 'live-manifest.json'), JSON.stringify(live)); return 0; }
    if (args.includes('--keep-list')) { writeFileSync(join(root, 'keep.txt'), named.map((h) => `/${h}.json\n`).join('')); return 0; }
    if (args[0] === 'lsf') { onOutput(listed.join('\n') + '\n'); return 0; }
    if (args[0] === 'delete' && args.includes('--dry-run')) { onOutput(readFileSync(join(root, 'prune.txt'), 'utf8').split('\n').filter(Boolean).map((f) => `NOTICE: ${f}: Skipped delete as --dry-run is set (size 10)\n`).join('')); return 0; }
    return 0;
  };
}
const go = (argv: string[], exec: ReturnType<typeof bucket>) => run({ root, argv, exec: exec as never, fetchCorpus: async () => 'live0079', log: (s: string) => { out += s; }, waitMs: 0 });

describe('the prune at full size (round seventy-nine)', () => {
  it('gives rclone the files named by none and uploaded more than a day ago, never keep.txt as rules', async () => {
    const exec = bucket([H(1), H(2)], [`${ago(72)};${H(1)}.json`, `${ago(1)};${H(2)}.json`, `${ago(72)};${H(8)}.json`, `${ago(2)};${H(9)}.json`, `${H(7)}.json`]);
    expect(await go(['--prune'], exec)).toBe(EXIT.review);
    const lsf = calls.find((c) => c.args[0] === 'lsf')!;
    expect(lsf.args).toEqual(['lsf', 'r2:cultifolio/s/v3/p', '--files-only', '--format', 'tp', '--separator', ';', '--time-format', 'RFC3339', '--use-server-modtime']);
    // H(9) was uploaded two hours ago, and H(7)'s age is not known: neither goes.
    expect(readFileSync(join(root, 'prune.txt'), 'utf8')).toBe(`${H(8)}.json\n`);
    expect(out).toMatch(/the bucket's p\/ holds 5 files; keep\.txt keeps 2 .*named by none: 3, of which 1 more than a day old would be deleted now/);
    calls = [];
    expect(await go(['--prune', '--go-on'], exec)).toBe(EXIT.done);
    const del = calls.filter((c) => c.args[0] === 'delete');
    expect(del.map((c) => c.args)).toEqual([['delete', 'r2:cultifolio/s/v3/p', '--files-from-raw', 'prune.txt', '--stats-one-line']]);
    expect(calls.some((c) => c.args.includes('--exclude-from'))).toBe(false);
  });

  it('two full-size corpora in the bucket: the list is made in well under a second', async () => {
    const named = Array.from({ length: 67_650 }, (_, i) => H(i + 1));
    const listed = Array.from({ length: 135_300 }, (_, i) => `${ago(72)};${H(i + 1)}.json`);
    const exec = bucket(named, listed);
    const t0 = performance.now();
    expect(await go(['--prune'], exec)).toBe(EXIT.review);
    expect(performance.now() - t0).toBeLessThan(5_000); // the run, with its fake rclone; the lists alone take about 0.3 s
    expect(readFileSync(join(root, 'prune.txt'), 'utf8').split('\n').filter(Boolean)).toHaveLength(135_300 - 67_650);
  }, 30_000);
});
