/**
 * Round eighty (N): names a `--fill wikidata-names` run took from Wikidata survive the steps that rewrite a page's names
 * from GBIF: the `--names` step keeps them beside GBIF's fresh rows, and an offline re-derivation carries them with
 * their record, or drops them where it has no record to carry. And the fixture page without a GBIF key carries its
 * names from Wikidata into the index as the index builder writes them. FAILED on r80base: `wikidata-names.ts` did not
 * exist, the names step wrote GBIF's rows alone, and the carried taxon took no record of Wikidata's names.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refetchNames } from '../../scripts/names-step';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { indexNames } from '$dossier/index-entry';
import { WD_NAMES, fromWikidata } from '$dossier/wikidata-names';
import { copiapoa } from '../../fixtures/upstream';

const WD_ROW = { name: 'Copper cactus', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q433276'] };
const WD_REC = { status: 'ok' as const, at: '2026-10-21T00:00:00.000Z', detail: 'Wikidata\'s item Q1; 1 English name taken: "Copper cactus"' };

describe('the --names step', () => {
  it('keeps the rows taken from Wikidata beside GBIF\'s fresh ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r80n-names-'));
    cpSync('fixtures/dossiers/s/v3', dir, { recursive: true });
    const file = readdirSync(dir).find((f) => /^[kg]\d+\.json$/.test(f) && JSON.parse(readFileSync(join(dir, f), 'utf8')).ids.gbif != null)!;
    const d = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    d.name.vernacular = [{ name: 'Old GBIF name', lang: 'eng', source: 'A' }, WD_ROW];
    d.upstream[WD_NAMES] = WD_REC;
    writeFileSync(join(dir, file), JSON.stringify(d));
    const f = (async () => ({ status: 'ok', data: { results: [{ vernacularName: 'Fresh name', language: 'eng', source: 'B' }], endOfRecords: true } })) as never;
    await refetchNames(dir, f, { now: () => new Date('2026-10-21T12:00:00Z') });
    const a = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    expect(a.name.vernacular).toEqual([{ name: 'Fresh name', lang: 'eng', source: 'B' }, WD_ROW]);
    expect(a.upstream[WD_NAMES]).toEqual(WD_REC);
  });
});

describe('an offline re-derivation', () => {
  it('carries the names from Wikidata with their record, and drops them where it has none to carry', async () => {
    const first = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(copiapoa()), builtBy: 'node', quick: true });
    if (!first.ok) throw new Error(first.reason);
    const prev = first.dossier;
    const name = { ...prev.name, vernacular: [...prev.name.vernacular, WD_ROW] };
    const table = copiapoa();
    for (const k of Object.keys(table)) if (/\/species\/\d+$|\/species\/\d+\/(synonyms|vernacularNames)|species\/match/.test(k)) table[k] = { __status: 'refused', status: 'refused', detail: 'offline' };
    const carried = await buildDossier(prev.ids.gbif!, { fetcher: fixtureFetcher(table), builtBy: 'node', quick: true, taxon: { key: prev.ids.gbif!, name, builtOn: prev.built, wdNames: WD_REC } });
    if (!carried.ok) throw new Error(carried.reason);
    expect(carried.dossier.name.vernacular).toContainEqual(WD_ROW);
    expect(carried.dossier.upstream[WD_NAMES]).toMatchObject({ status: 'ok', detail: expect.stringMatching(/Copper cactus.*carried from build of/) });
    const bare = await buildDossier(prev.ids.gbif!, { fetcher: fixtureFetcher(table), builtBy: 'node', quick: true, taxon: { key: prev.ids.gbif!, name, builtOn: prev.built } });
    if (!bare.ok) throw new Error(bare.reason);
    expect(bare.dossier.name.vernacular.some(fromWikidata)).toBe(false);
    expect(bare.dossier.upstream[WD_NAMES]).toBeUndefined();
  });
});

describe('the fixture page without a GBIF key', () => {
  it('holds its names from Wikidata, and its index entry the names the index builder gives them', () => {
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8'));
    expect(d.ids.gbif).toBeUndefined();
    expect(d.name.vernacular.every(fromWikidata)).toBe(true);
    expect(d.upstream[WD_NAMES]).toMatchObject({ status: 'ok', detail: expect.stringContaining('Q50843040') });
    const entry = (JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8')) as Array<{ key: string; common?: string; commons?: string[] }>).find((e) => e.key === 'k457911')!;
    const names = indexNames(d.name.vernacular, { genus: 'Hesperocyparis' });
    expect({ common: entry.common, commons: entry.commons }).toEqual({ common: names.common, commons: names.commons });
    expect(entry.common).toBe('Mexican cypress');
  });
});
