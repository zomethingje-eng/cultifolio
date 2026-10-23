/**
 * Round eighty-one, agent B: the owner's queued item, "no index rebuild after a fill run that changed nothing" (and
 * review B's step 12, whose --index repeats the index the fill's last run had just written: about 12 to 15 minutes each
 * at 48,361 pages). An index the same code would write from the same files is not written again; any change writes it.
 * FAILED on r81base: there every --index and every fill's end writes the index, the products and the manifest again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, statSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-ignore a plain .mjs module
import { classify } from '../../scripts/corpus-step.mjs';

const stampMod = await import('$dossier/index-stamp').catch(() => null);
const root = resolve('.');
const builder = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });

describe('the index is not written again when nothing it is made from has changed', () => {
  it('--index twice, a fill that changed nothing, then a dossier changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r81b-stamp-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const k of ['k2735933', 'k339841', 'k457911']) cpSync(`fixtures/dossiers/s/v3/${k}.json`, join(v3, `${k}.json`));
    const first = builder(dir, '--index');
    expect(first.stdout).toMatch(/^ {2}index: 3 species$/m);
    const manifestAt = statSync(join(v3, 'manifest.json')).mtimeMs;
    const second = builder(dir, '--index');
    // r81base: written again.
    expect(second.stdout).toMatch(/^ {2}index: 3 species$/m);
    expect(second.stdout).toMatch(/the index, its products and the manifest are as written .* UTC: no dossier and none of the builder's code has changed since, so they are not written again \(delete cache\/index-stamp\.json to write them anyway\)/);
    expect(statSync(join(v3, 'manifest.json')).mtimeMs).toBe(manifestAt);
    // The corpus step reads that run as done, and the index's count as it was.
    expect(classify({ code: second.status ?? 1, output: second.stdout, dropsWritten: false, speciesBefore: 3 })).toEqual({ status: 'done' });
    // A fill whose run asked nothing and changed nothing (iNaturalist's open data holding none of these taxa): its index is not written again.
    writeFileSync(join(dir, 'inat-wild.jsonl'), JSON.stringify({ inatOpenWild: 1, day: '2026-09-27', read: '2026-10-20T00:00:00.000Z', files: {}, keep: 24, rule: 'x', counts: {} }) + '\n');
    const fill = builder(dir, '--fill', 'inat', '--wild', '--inat-open', 'inat-wild.jsonl');
    expect(fill.stdout).toMatch(/; 0 with an iNaturalist taxon whose wild photographs the open data/);
    expect(fill.stdout).toMatch(/so they are not written again/);
    expect(statSync(join(v3, 'manifest.json')).mtimeMs).toBe(manifestAt);
    // A dossier written: the index is written again.
    const d = JSON.parse(readFileSync(join(v3, 'k339841.json'), 'utf8'));
    d.summary = { ...(d.summary ?? {}), extract: `${d.summary?.extract ?? ''} ` };
    writeFileSync(join(v3, 'k339841.json'), JSON.stringify(d));
    const third = builder(dir, '--index');
    expect(third.stdout).not.toMatch(/not written again/);
    expect(statSync(join(v3, 'manifest.json')).mtimeMs).toBeGreaterThan(manifestAt);
    rmSync(dir, { recursive: true, force: true });
  }, 240_000);

  it("the builder's code is in the fingerprint, by content: a delivery that changes it writes the index again", () => {
    const { indexFingerprint } = stampMod!;
    const dir = mkdtempSync(join(tmpdir(), 'r81b-print-'));
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    mkdirSync(join(dir, 'code/src/lib/dossier'), { recursive: true });
    mkdirSync(join(dir, 'code/scripts'), { recursive: true });
    writeFileSync(join(dir, 'static/s/v3/k1.json'), '{}');
    writeFileSync(join(dir, 'code/src/lib/dossier/index-entry.ts'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'code/scripts/merged-pages.txt'), '# none\n');
    const a = indexFingerprint(dir, 'static/s/v3', join(dir, 'code'));
    expect(indexFingerprint(dir, 'static/s/v3', join(dir, 'code'))).toBe(a);
    writeFileSync(join(dir, 'code/src/lib/dossier/index-entry.ts'), 'export const a = 2;\n');
    const b = indexFingerprint(dir, 'static/s/v3', join(dir, 'code'));
    expect(b).not.toBe(a);
    writeFileSync(join(dir, 'code/scripts/merged-pages.txt'), '# one\n');
    expect(indexFingerprint(dir, 'static/s/v3', join(dir, 'code'))).not.toBe(b);
    rmSync(dir, { recursive: true, force: true });
  });
});
