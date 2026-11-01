/**
 * Round eighty-five, agent U: outside review B's operations note. An upload is not one transaction: the dossiers go up in
 * place, the manifest last, and between the two the site serves new dossiers under the old corpus's index and search. A
 * stopped upload said so once, in its stop sentence, and nothing said it again: `--status` the next morning showed the
 * step "failed" and no word of the site's state, and the prune ran over a bucket half new.
 *
 * Now `upload-partial.json` marks the time from the first copy until the manifest is up; `--status` and every run say it,
 * with the command that finishes it, and the prune refuses while it is there.
 *
 * On r85base: no file was written, `--status` said nothing of the site, and the prune went on to read the bucket.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore a plain .mjs module
import { run } from '../../scripts/corpus-step.mjs';

const PLAN = 'upload\nlive-check\n';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'r85u-upload-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'bbbb2222', built: 'x', species: 1, buckets: 32, postings: 64, files: {} }));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'k1', gbif: 1 }]));
  writeFileSync(join(root, 'scripts/corpus-plan-upload.txt'), PLAN);
  const calls: string[] = [];
  let out = '';
  const go = (argv: string[], fail: (args: string[]) => number = () => 0) => run({
    root,
    argv,
    exec: async (c: string, args: string[], onOutput: (s: string) => void) => { calls.push(`${c} ${args.slice(0, 2).join(' ')}`); if (c === 'rclone') return fail(args); onOutput('  done.\n'); return 0; },
    fetchCorpus: async () => 'bbbb2222',
    fetchLive: async () => ({ keyless: true }),
    log: (s: string) => { out += s; },
    now: () => new Date('2026-11-02T09:30:00Z'),
    waitMs: 0,
    heap: { mb: 1, why: 'test' }
  });
  return { root, go, calls, out: () => out };
}

describe('an upload stopped part way is said until it is finished (review B)', () => {
  it('the copy stops: the mark stays, --status and the prune say it; the next upload finishes and takes it away', async () => {
    const t = setup();
    try {
      // The dossiers' copy stops half-way (a dropped connection).
      expect(await t.go(['--plan', 'scripts/corpus-plan-upload.txt'], (a) => (a[0] === 'copy' ? 1 : 0))).toBe(1);
      expect(existsSync(join(t.root, 'upload-partial.json'))).toBe(true); // r85base: nothing written
      expect(JSON.parse(readFileSync(join(t.root, 'upload-partial.json'), 'utf8'))).toEqual({ since: '2026-11-02T09:30:00.000Z', corpus: 'bbbb2222' });
      // The next morning's --status says what the site serves, and what to type.
      const before = t.out().length;
      expect(await t.go(['--plan', 'scripts/corpus-plan-upload.txt', '--status'])).toBe(0);
      const said = t.out().slice(before);
      expect(said).toMatch(/An upload of corpus bbbb2222 began copying at 2026-11-02 09:30 UTC and has not finished: since then the site has served some new dossiers under the old corpus's index and search/);
      expect(said).toMatch(/Run the upload again now to finish it: node scripts\/corpus-step\.mjs --plan scripts\/corpus-plan-upload\.txt/);
      // The prune refuses, and asks nothing of the bucket.
      const asked = t.calls.length;
      expect(await t.go(['--prune'])).toBe(2);
      expect(t.calls.length).toBe(asked);
      expect(t.out()).toMatch(/The prune stopped before reading anything: an upload has not finished\. Nothing was deleted\./);
      // The upload again: it copies, checks, sends the manifest, and the mark goes.
      expect(await t.go(['--plan', 'scripts/corpus-plan-upload.txt'])).toBe(0);
      expect(t.calls.filter((c) => c.startsWith('rclone copy static/s/v3/manifest.json'))).toHaveLength(1);
      expect(existsSync(join(t.root, 'upload-partial.json'))).toBe(false);
      const after = t.out().length;
      await t.go(['--plan', 'scripts/corpus-plan-upload.txt', '--status']);
      expect(t.out().slice(after)).not.toMatch(/has not finished/);
    } finally {
      rmSync(t.root, { recursive: true, force: true });
    }
  });
  it('a check that fails keeps the mark too: the dossiers are up, the manifest is not', async () => {
    const t = setup();
    try {
      expect(await t.go(['--plan', 'scripts/corpus-plan-upload.txt'], (a) => (a[0] === 'check' ? 1 : 0))).toBe(1);
      expect(existsSync(join(t.root, 'upload-partial.json'))).toBe(true);
      expect(t.calls.some((c) => c.startsWith('rclone copy static/s/v3/manifest.json'))).toBe(false);
    } finally {
      rmSync(t.root, { recursive: true, force: true });
    }
  });
  it('an upload refused before it copies (an index older than the dossiers) leaves no mark: the site is as it was', async () => {
    const t = setup();
    try {
      const refused = run({ root: t.root, argv: ['--plan', 'scripts/corpus-plan-upload.txt'], exec: async (c: string, args: string[]) => (args.includes('--index-ready') ? 2 : 0), fetchCorpus: async () => 'bbbb2222', fetchLive: async () => ({ keyless: true }), log: () => {}, waitMs: 0, heap: { mb: 1, why: 'test' } });
      expect(await refused).toBe(2);
      expect(existsSync(join(t.root, 'upload-partial.json'))).toBe(false);
    } finally {
      rmSync(t.root, { recursive: true, force: true });
    }
  });
});
