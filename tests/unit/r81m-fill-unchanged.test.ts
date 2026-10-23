/**
 * Round eighty-one, the merge (M), found on the copy made like the owner's PC: a fill day with the network gone left every
 * unanswered page's photograph rows as they were (review B2), but wrote again a page whose wild row is "not asked: N wild
 * photographs already from the GBIF download", with only that row's time changed. Its file was then new to the index's
 * stamp (`index-stamp.ts`, by size and time) and to the sitemap's day, so the day's index was written again for nothing.
 * Now a page left unanswered keeps that row as it was, and is not written when nothing else changed.
 *
 * The page is a real one of round seventy-seven's corpus (Mammillaria bocasana, k2360544, 18 wild photographs from the
 * GBIF download), its cultivated set left to the fill and its iNaturalist id checked, as on the PC at step 11.
 * On r81base and on B's branch the page was rewritten (its wild row's `at` changed; on r81base its cultivated row too).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, statSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.');

describe('a fill day with no network writes no page it could not ask', () => {
  it('leaves a page whose wild set is the download\'s byte for byte and time for time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r81m-fill-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    const page = join(v3, 'k2360544.json');
    const text = readFileSync('tests/unit/fixtures/r81m-k2360544.json', 'utf8');
    expect(JSON.parse(text).upstream['inat.photos.wild']).toMatchObject({ status: 'skipped', detail: 'not asked: 18 wild photographs already from the GBIF download' });
    writeFileSync(page, text);
    const old = new Date('2026-10-23T00:30:00Z');
    utimesSync(page, old, old);
    writeFileSync(join(dir, 'fake.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--fill', 'inat', '--no-cache'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5', CULTIFOLIO_INAT_WAITS: '0' } });
    expect(r.stdout).toMatch(/1 not answered/);
    expect(r.status).toBe(3);
    expect(readFileSync(page, 'utf8')).toBe(text); // B's branch: the wild row's `at` was the run's time
    expect(statSync(page).mtimeMs).toBe(old.getTime()); // not written at all
  }, 120_000);
});
