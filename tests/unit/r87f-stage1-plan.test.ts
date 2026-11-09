/**
 * Round eighty-seven, the review of the pipeline's changes, the data fix: the stage-1 plan (scripts/corpus-plan-r87s1.txt),
 * which the owner runs before deploying stage 1. `--index` writes the browse pages' two files with this round's code and
 * says so in the line the plan's review stop reads; the upload's first check (`--index-ready`) passes on what it wrote,
 * reading the two files whole among every product the manifest names; and the upload copies and checks them (they are
 * products under `p/`, which no exclusion of the copy names).
 *
 * New in round eighty-seven: on r87s1 (381aea9) there was no such plan, and --index said nothing of the two files.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsePlan, uploadCommands } from '../../scripts/corpus-step.mjs';
import { checkProducts } from '../../scripts/product-files';
import { BROWSE_FILE, BROWSE_COUNTS_FILE, browseWords } from '$lib/browse/table';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

describe('the stage-1 plan', () => {
  it('is --index, a review of its browse lines, the upload and the live check', () => {
    const steps = parsePlan(readFileSync('scripts/corpus-plan-r87s1.txt', 'utf8'));
    expect(steps.map((s: { kind: string }) => s.kind)).toEqual(['dossier', 'review', 'upload', 'live-check']);
    expect(steps[0].args).toEqual(['--index']);
    expect(steps[1].args[0]).toContain('"browse.json written with N species, browse-counts.json written (grown by someone: M species)"');
    expect(steps[1].args[0]).toContain('"index: N species"');
  });
  it('the words the review reads, and NOT where a file is missing or is not one', () => {
    expect(browseWords(JSON.stringify({ v: 1, n: 0, name: [], key: [], gbif: [], slug: {}, common: [], families: [], family: [], origins: [], origin: [], climate: '', grown: [], changed: [] }), '{"grown":null}')).toBe('browse.json written with 0 species, browse-counts.json written (grown: not counted)');
    expect(browseWords(undefined, '{"grown":3}')).toBe('browse.json NOT written: the manifest names none, browse-counts.json written (grown by someone: 3 species)');
    expect(browseWords('{"v":2}', 'nope')).toBe('browse.json NOT written: it is not a browse table, browse-counts.json NOT written: it is not a count');
  });
});

describe('--index then the upload\'s first check, on the real builder', () => {
  it('writes the two files, says so, and --index-ready passes reading them whole; the copy does not exclude them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87f-stage1-'));
    const v = join(dir, 'static/s/v3');
    mkdirSync(v, { recursive: true });
    const files = readdirSync(join(ROOT, 'fixtures/dossiers/s/v3')).filter((f) => /^[kg]\d+\.json$/.test(f));
    for (const f of files) copyFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), join(v, f));
    const ix = builder(dir, '--index');
    expect(ix.status, ix.stderr).toBe(0);
    expect(ix.stdout).toContain(`  index: ${files.length} species`);
    expect(ix.stdout).toMatch(new RegExp(`^  browse\\.json written with ${files.length} species, browse-counts\\.json written \\((grown by someone: \\d+ species|grown: not counted)\\)$`, 'm'));
    const m = JSON.parse(readFileSync(join(v, 'manifest.json'), 'utf8')) as { files: Record<string, string> };
    const named = [m.files[BROWSE_FILE], m.files[BROWSE_COUNTS_FILE]];
    expect(named.every((h) => /^[0-9a-f]{16,64}$/.test(h))).toBe(true);
    expect(JSON.parse(readFileSync(join(v, 'p', `${named[0]}.json`), 'utf8')).n).toBe(files.length);
    // The upload's first check: the index is the one the code and files on disk would write, every product read whole.
    const ready = builder(dir, '--index-ready');
    expect(ready.status, ready.stderr + ready.stdout).toBe(0);
    expect(ready.stdout).toContain('ready to upload');
    const c = checkProducts(v);
    expect(c.badCount).toBe(0);
    expect(c.whole).toBeGreaterThanOrEqual(new Set(Object.values(m.files)).size); // every file the manifest names, the two among them, read whole
    // The copy and the check take the corpus folder whole but for these; the two files live under p/ by their hash.
    const [copy, check] = uploadCommands();
    for (const args of [copy[1], check[1]] as string[][]) {
      const ex = args.flatMap((a, i) => (args[i - 1] === '--exclude' ? [a] : []));
      expect(ex).toEqual(['report.txt', 'manifest.json', 'manifest.prev.json', '*.tmp']);
    }
    // Run again, the index is not written again, and the line says the two files as written then.
    const again = builder(dir, '--index');
    expect(again.stdout).toMatch(new RegExp(`^  browse\\.json as written \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} UTC with ${files.length} species, browse-counts\\.json as written`, 'm'));
  }, 180_000);
});
