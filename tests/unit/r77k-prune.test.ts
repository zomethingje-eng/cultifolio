/**
 * Round seventy-seven (K): the bucket's prune keeps the search's key files. They are named by the live manifest's search
 * directories, not by the manifest, so `--prune` fetches those directories into live-search/ before the keep list is
 * made (`--keep-list` reads them there; `corpusHashes`), and stops, deleting nothing, when it cannot. A manifest built
 * before them fetches nothing, as before (tests/unit/r72d-corpus-step.test.ts). FAILS on r77base: no directory is fetched.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, EXIT } from '../../scripts/corpus-step.mjs';

const H = (n: number) => n.toString(16).padStart(32, '0');
const live = { v: 2, id: 'live0077', built: 'x', species: 3, buckets: 32, postings: 64, files: { 'index.json': H(1), 'search/top.json': H(3), 'search/0.json': H(4) } };
let root: string, out: string, calls: Array<{ cmd: string; args: string[] }>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'r77k-prune-'));
  mkdirSync(join(root, 'static/s/v2'), { recursive: true });
  writeFileSync(join(root, 'static/s/v2/manifest.json'), JSON.stringify({ ...live, id: 'aaaa7777' }));
  out = '';
  calls = [];
});
function bucket(o: { copyFails?: boolean } = {}) {
  return async (cmd: string, args: string[], onOutput: (s: string) => void) => {
    calls.push({ cmd, args });
    if (args[0] === 'copyto') { writeFileSync(join(root, 'live-manifest.json'), JSON.stringify(live)); return 0; }
    if (args[0] === 'copy') {
      if (o.copyFails) return 1;
      const asked = readFileSync(join(root, 'live-search.txt'), 'utf8').split('\n').filter(Boolean);
      mkdirSync(join(root, 'live-search'), { recursive: true });
      for (const f of asked) writeFileSync(join(root, 'live-search', f), '{}');
      return 0;
    }
    if (args.includes('--keep-list')) { writeFileSync(join(root, 'keep.txt'), [H(1), H(3), H(4), H(5)].map((h) => `/${h}.json`).join('\n') + '\n'); return 0; }
    if (args[0] === 'lsf') { onOutput([H(1), H(3), H(4), H(5), H(9)].map((h) => `${h}.json`).join('\n') + '\n'); return 0; }
    if (args[0] === 'delete' && args.includes('--dry-run')) { onOutput(`NOTICE: ${H(9)}.json: Skipped delete as --dry-run is set (size 10)\n`); return 0; }
    return 0;
  };
}
const go = (argv: string[], exec: ReturnType<typeof bucket>) => run({ root, argv, exec: exec as never, fetchCorpus: async () => 'live0077', log: (s: string) => { out += s; }, waitMs: 0 });

describe('the prune keeps the search key files (round seventy-seven)', () => {
  it('fetches the live manifest\'s search directories before the keep list, and says so in the dry run', async () => {
    expect(await go(['--prune'], bucket())).toBe(EXIT.review);
    expect(calls.map((c) => c.args[0])).toEqual(['node_modules/@sveltejs/kit/svelte-kit.js', 'copyto', 'copy', '--import', 'lsf', 'delete']);
    expect(calls[2].args).toEqual(['copy', 'r2:cultifolio/s/v2/p', 'live-search', '--files-from-raw', 'live-search.txt']);
    expect(readFileSync(join(root, 'live-search.txt'), 'utf8').split('\n').filter(Boolean).sort()).toEqual([`${H(3)}.json`, `${H(4)}.json`]);
    expect(existsSync(join(root, 'live-search', `${H(3)}.json`))).toBe(true);
    expect(out).toMatch(/keep\.txt keeps 4 \(every file the live manifest live0077 and this folder's two manifests name, with the search's key files their search directories name\); named by none: 1/);
  });
  it('a search directory the bucket cannot give stops the prune, and nothing is deleted', async () => {
    expect(await go(['--prune', '--go-on'], bucket({ copyFails: true }))).toBe(EXIT.failed);
    expect(out).toMatch(/the live manifest's search directories could not be read from the bucket\. Nothing was deleted\./);
    expect(calls.some((c) => c.args[0] === 'delete' || c.args.includes('--keep-list'))).toBe(false);
  });
});
