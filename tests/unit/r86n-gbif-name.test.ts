/**
 * Round eighty-six, names: GBIF's name for a renamed page is said one way on every surface (review-w W1, review-p P10,
 * P12; review-w W2's tile reads the record's `olderOf`).
 *
 * 1. A reference row found by GBIF's name for its key (the index's `gname`) says "GBIF's name for this plant", never
 *    "older name"; the add form's line names it so (`gname` on the row).
 * 2. The import's check marks it (`gbif`), and the import's row and the plant's page say "GBIF's name for".
 * 3. The same-type summary line: "its title is GBIF's name for Sabdariffa acetosella", not "one of this species' older
 *    names".
 * 4. A grower's species list carries the page a plant's name was found to belong to (`olderOf`), for the front page's tile.
 *
 * On r86base: FAILED (1: no `gname`, the row said "older name: Ceropegia alstonii"; 2: no mark; 3: "one of this
 * species' older names"; 4: no `olderOf`).
 */
import { describe, it, expect } from 'vitest';
import { localRow, olderLine } from '$lib/ui/picker-rows';
import { gbifNameWords, isGbifName, olderNameOf } from '$lib/ui/ref/searched';
import { readSearch } from '$lib/import/check';
import { summaryOlderName } from '$lib/ui/ref/notes';
import { mySpeciesOf } from '$lib/db/species-list';
import type { Accession } from '$lib/db/types';

// The live index's entry (2026-11-05), with the field the next index writes.
const HOODIA = { key: 'k506502', gbif: 9269454, slug: 'hoodia-alstonii', name: 'Hoodia alstonii', family: 'Apocynaceae', photos: 11, open: 10, climate: 'ok', syn: ['Trichocaulon alstonii', 'Trichocaulon halenbergense', 'Ceropegia alstonii'], gname: 'Ceropegia alstonii' };

describe("1. a row found by GBIF's name for its key (W1, P10)", () => {
  it('the picker row and the catalogue row say "GBIF\'s name for this plant"; the add form\'s line names the page', () => {
    const row = localRow('Ceropegia alstonii', HOODIA as never, false);
    expect(row.gname).toBe('Ceropegia alstonii');
    expect(olderLine([row], 'Ceropegia alstonii')?.row.name).toBe('Hoodia alstonii');
    const older = olderNameOf('Ceropegia alstonii', HOODIA as never);
    expect(isGbifName(older, HOODIA)).toBe(true);
    expect(gbifNameWords(older!)).toBe("GBIF's name for this plant: Ceropegia alstonii");
  });
  it('guard: another older name of the page is an older name, as before; an index built before says "older name"', () => {
    const row = localRow('Trichocaulon alstonii', HOODIA as never, false);
    expect(row.older).toBe('Trichocaulon alstonii');
    expect(row.gname).toBeUndefined();
    expect(isGbifName(olderNameOf('Trichocaulon alstonii', HOODIA as never), HOODIA)).toBe(false);
    const { gname: _g, ...before } = HOODIA;
    expect(localRow('Ceropegia alstonii', before as never, false).gname).toBeUndefined();
  });
});

describe("2. the import's check (W1)", () => {
  it("marks GBIF's name, and an older name not", () => {
    expect(readSearch('Ceropegia alstonii', true, [HOODIA])).toMatchObject({ s: 'near', why: 'older name', suggestion: 'Hoodia alstonii', gbif: true });
    expect(readSearch('Trichocaulon alstonii', true, [HOODIA])).not.toHaveProperty('gbif');
  });
});

describe('3. the same-type summary line (P12)', () => {
  it("Sabdariffa acetosella's \"Hibiscus acetosella\" is GBIF's name for it", () => {
    const name = { scientific: 'Sabdariffa acetosella', synonyms: ['Hibiscus acetosella Welw. ex Hiern', 'Hibiscus eetveldeanus De Wild. & T.Durand'], gbif: { scientific: 'Hibiscus acetosella' } };
    expect(summaryOlderName('Hibiscus acetosella', name)).toBe("its title is GBIF's name for Sabdariffa acetosella (GBIF Backbone), which is the proof that the article is this species'");
    expect(summaryOlderName('Hibiscus eetveldeanus', name)).toMatch(/one of this species' older names/);
    // GBIF's name the record does not hold as a name of the page proves nothing: the line is the route's, as before.
    expect(summaryOlderName('Hibiscus acetosella', { ...name, synonyms: [] })).toBeNull();
  });
});

describe("4. a grower's species carries the page its name was found to belong to (W2)", () => {
  it('olderOf, from a growing plant', () => {
    const a = (id: string, taxonName: string, olderOf?: string) => ({ id, acc: id, taxonName, status: 'growing', ...(olderOf ? { olderOf } : {}) }) as unknown as Accession;
    const m = mySpeciesOf([a('1', 'Aloe aristata'), a('2', 'Aloe aristata', 'Aristaloe aristata'), a('3', 'Copiapoa cinerea')], []);
    expect(m.get('aloe-aristata')?.olderOf).toBe('Aristaloe aristata');
    expect(m.get('copiapoa-cinerea')?.olderOf).toBeUndefined();
  });
});

describe('5. the index writes GBIF\'s name for a renamed page (W1)', () => {
  it('`--index` gives Hoodia alstonii (the live dossier k506502) `gname: Ceropegia alstonii`; a page GBIF\'s own name heads none', async () => {
    const { spawnSync } = await import('node:child_process');
    const { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const ROOT = resolve('.');
    const dir = mkdtempSync(join(tmpdir(), 'r86n-index-'));
    const v3 = join(dir, 'static/s/v3');
    mkdirSync(v3, { recursive: true });
    for (const f of readdirSync(join(ROOT, 'fixtures/dossiers/s/v3')).filter((x) => /^[kg]\d+\.json$/.test(x))) copyFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), join(v3, f));
    copyFileSync(join(ROOT, 'tests/unit/fixtures/r86n/k506502.json'), join(v3, 'k506502.json'));
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), '--index'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
    expect(r.status, r.stderr).toBe(0);
    const idx = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<{ key: string; gname?: string; syn?: string[]; older?: string[] }>;
    const hoodia = idx.find((e) => e.key === 'k506502')!;
    expect(hoodia.gname).toBe('Ceropegia alstonii');
    expect([...(hoodia.syn ?? []), ...(hoodia.older ?? [])]).toContain('Ceropegia alstonii');
    expect(idx.filter((e) => e.key !== 'k506502').every((e) => e.gname === undefined)).toBe(true);
  }, 180_000);
});
