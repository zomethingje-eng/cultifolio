/**
 * Round eighty-seven (derived agent): the build writes the habitat figures and the index's two fields. `--fixtures` from
 * an empty folder: each page with a habitat climate carries `koppen` and `hardiness` (from its climate, with no yearly
 * lows in the fixtures' extremes, so a band and the words why there is no zone), and the index carries `low` and
 * `first`; a second run keeps `first` as the index before gave it.
 *
 * FAILS on the base: no page carried either field, no entry `low` or `first`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

describe('--fixtures writes the habitat figures and the index’s low and first', () => {
  it('on every page with a habitat climate, and the index carries them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87v-build-'));
    const r = builder(dir, '--fixtures');
    expect(r.status, r.stderr).toBe(0);
    const v3 = join(dir, 'fixtures/dossiers/s/v3');
    const d = JSON.parse(readFileSync(join(v3, 'k2735933.json'), 'utf8'));
    expect(d.climate.status).toBe('ok');
    expect(d.koppen.cls).toMatch(/^B/); // the fixture's Atacama coast: 4 mm a month
    expect(d.hardiness.rhs).toEqual({ lowC: 4, band: 'H2', years: 40 });
    expect(d.hardiness.usdaWhy).toMatch(/not held/);
    const pending = JSON.parse(readFileSync(join(v3, 'k339841.json'), 'utf8'));
    expect(pending.koppen).toBeUndefined();
    expect(pending.hardiness).toBeUndefined();
    const index = JSON.parse(readFileSync(join(dir, 'fixtures/dossiers/index.json'), 'utf8')) as Array<{ key: string; low?: number; first?: number }>;
    const e = index.find((x) => x.key === 'k2735933')!;
    expect(e.low).toBe(4);
    expect(Number.isInteger(e.first)).toBe(true);
    expect(index.find((x) => x.key === 'k339841')!.low).toBeUndefined();
    // An index before that gave an earlier day: kept.
    writeFileSync(join(dir, 'fixtures/dossiers/index.json'), JSON.stringify(index.map((x) => ({ ...x, first: 20000 }))));
    const again = builder(dir, '--fixtures');
    expect(again.status, again.stderr).toBe(0);
    const after = JSON.parse(readFileSync(join(dir, 'fixtures/dossiers/index.json'), 'utf8')) as Array<{ key: string; first?: number }>;
    expect(after.every((x) => x.first === 20000)).toBe(true);
  }, 240_000);
});
