/**
 * Round seventy-nine (M), the owner's decision on K's offer (2026-10-20): the species without a GBIF key take GBIF's records
 * under the keys of the names Kew's file holds as this plant (round seventy-three's extra-keys rule: Kew's synonymy read,
 * never a name matched). The rule runs for a page without a GBIF key; the keys are in every download request; the builder
 * reads their records into the page, which keeps no GBIF key of its own; a page that reads no key stays "not checked"; and
 * the site says which. FAILED on the merge head d47d3e9: `extraKeysFor` needed a page key, `kewDownloadKeysOf`,
 * `byPageId`, `recordsUnchecked`, `kewKeysSentence` and `scripts/extra-keys-kew.txt` did not exist, and `buildKewDossier`
 * read no record.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, formatExtraKeys, parseExtraKeys, byPageId, type Usage, type Backbone } from '$dossier/extra-keys';
import { buildKewDossier, KEW_KEYS_WORDS, type KewSpecies } from '$dossier/build-kew';
import { recordsUnchecked, kewKeysSentence, NO_GBIF_WHY } from '../../src/lib/core/no-gbif';
import { kewDownloadKeysOf, parseSpeciesList, downloadKeysOf } from '../../scripts/select-species-lib';
import type { FetchResult, JsonFetcher } from '../../src/lib/dossier/fetch';
import type { Dossier } from '../../src/lib/dossier/schema';

const K = (id: string, name: string, authors: string, status: string, accepted: string, homotypic = false): KewRow => ({ id, name, authors, status, rank: 'Species', accepted, parent: '', powo: '', ...(homotypic ? { homotypic: true } : {}) });
// Abelia parvifolia Hemsl., as Kew's file of 2026-06-04 holds it, with a homotypic and a heterotypic name filed under it.
const idx = new KewNamesIndex();
for (const r of [K('2609490', 'Abelia parvifolia', 'Hemsl.', 'Accepted', '2609490'), K('9000001', 'Linnaea parvifolia', '(Hemsl.) Christenh.', 'Synonym', '2609490', true), K('9000002', 'Abelia koehneana', 'Graebn.', 'Synonym', '2609490'), K('2609000', 'Abelia uniflora', 'R.Br.', 'Accepted', '2609000')]) idx.add(r);
const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number): Usage => ({ key, parent, status, rank: 'SPECIES', canonical, author, label });
// GBIF holds the species' own name only as a synonym of Abelia uniflora (key 2888001), as it holds 1,758 of the 2,327.
const usages = [U(5599083, 'Abelia parvifolia Hemsl.', 'Abelia parvifolia', 'Hemsl.', 'SYNONYM', 2888001), U(7000001, 'Linnaea parvifolia (Hemsl.) Christenh.', 'Linnaea parvifolia', '(Hemsl.) Christenh.', 'ACCEPTED', 3000), U(7000002, 'Abelia koehneana Graebn.', 'Abelia koehneana', 'Graebn.', 'SYNONYM', 2888001), U(2888001, 'Abelia uniflora R.Br.', 'Abelia uniflora', 'R.Br.', 'ACCEPTED', 3000)];
const bb: Backbone = {
  usagesOf: (w) => usages.filter((u) => u.canonical.toLowerCase() === w),
  usage: (k) => usages.find((u) => u.key === k),
  lineage: (k) => { const u = usages.find((x) => x.key === k); return u && /SYNONYM/.test(u.status) && u.parent ? [k, u.parent] : [k]; },
  under: () => []
};
const page = { key: null, entry: '2609490', id: 'k2609490' };

describe('the rule, for a page without a GBIF key', () => {
  it('takes the keys of the names Kew holds as this plant, of its own type, each with Kew\'s reading; refuses a heterotypic name', () => {
    const r = extraKeysFor(page, idx, bb, new Set([1234]), new Map());
    expect(r.keys.map((k) => [k.pageId, k.page, k.key, k.how])).toEqual([['k2609490', 0, 5599083, 'entry'], ['k2609490', 0, 7000001, 'filed']]);
    expect(r.keys[0].kewLabel).toBe('Abelia parvifolia Hemsl. (accepted)');
    expect(r.refused.find((x) => x.key === 7000002)?.why).toMatch(/^heterotypic: the owner's decision/);
  });
  it('guard: a key GBIF files under another page of the reference is refused, so no record is on two pages', () => {
    const r = extraKeysFor(page, idx, bb, new Set([2888001]), new Map());
    expect(r.keys.map((k) => k.key)).toEqual([7000001]);
    expect(r.refused.find((x) => x.key === 5599083)?.why).toBe('GBIF files it under key 2888001, another page of this reference');
  });
  it('the list file names the page by its id, and reads back', () => {
    const r = extraKeysFor(page, idx, bb, new Set(), new Map());
    const text = formatExtraKeys(r.keys, ['head']);
    expect(text.split('\n')[1].split('\t').slice(0, 3)).toEqual(['k2609490', '5599083', 'Abelia parvifolia Hemsl.']);
    const back = parseExtraKeys(text);
    expect(back).toEqual(r.keys);
    expect([...byPageId(back).keys()]).toEqual(['k2609490']);
  });
});

describe('the download asks for them', () => {
  const list = parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8'));
  const kew = parseExtraKeys(readFileSync('scripts/extra-keys-kew.txt', 'utf8'));
  it('scripts/extra-keys-kew.txt: 1,956 keys on 1,415 of the list\'s 2,335 pages without a GBIF key, none of them a list key', () => {
    const keyless = new Set(list.filter((e) => e.gbifKey == null).map((e) => e.pageId as string));
    // Round eighty (X): 11 that a reference page holds through its range left out of the list, none of which read a key;
    // 19 whose key Kew's file reads as another species' name read none now, and no key of Kew's synonymy yet.
    expect(keyless.size).toBe(2335);
    expect(kew.length).toBe(1956);
    expect(kew.every((k) => k.pageId && keyless.has(k.pageId) && k.page === 0)).toBe(true);
    expect(new Set(kew.map((k) => k.pageId)).size).toBe(1415);
    const listKeys = new Set(downloadKeysOf(list).keys);
    expect(kew.some((k) => listKeys.has(k.key))).toBe(false);
    expect(new Set(kew.map((k) => k.key)).size).toBe(1956); // no key read by two pages
  });
  it('every request\'s keys hold them beside the list\'s, written into keys.json by page id', () => {
    const k = kewDownloadKeysOf(list, kew);
    expect(k.keys.length).toBe(1956);
    expect(k.pages).toBe(1415);
    expect(Object.keys(k.byName)[0]).toMatch(/^k\d+ by /);
    const fetch = readFileSync('scripts/bulk-fetch.ts', 'utf8');
    expect(fetch).toContain("const kewFile = 'scripts/extra-keys-kew.txt';");
    expect(fetch).toContain('const all = [...new Set([...keys, ...kew.keys])];');
    // the build's check of the download counts them, and its wanted keys and its builder take them
    const build = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(build).toMatch(/downloadShortOf\(bulkDir, \[\.\.\.new Set\(\[\.\.\.downloadKeysOf\(parseSpeciesList\(text\)\)\.keys, \.\.\.\[\.\.\.kewExtra\.values\(\)\]/);
    expect(build).toContain('for (const x of kewExtra.get(`k${id}`) ?? []) wanted.add(x.key);');
    expect(build).toContain('extraKeys: kewExtra.get(`k${j.kew}`), climate, places');
  });
});

const parvifolia: KewSpecies = {
  id: '2609490', name: 'Abelia parvifolia', authors: 'Hemsl.', family: 'Caprifoliaceae', genus: 'Abelia', synonyms: [],
  range: [{ locationId: 'TDWG:CHC', locality: 'China South-Central', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }] as KewSpecies['range'], file: '2026-06-04'
};
const rec = (key: number, lat: number, lon: number) => ({ key, taxonKey: 5599083, decimalLatitude: lat, decimalLongitude: lon, year: 2021, countryCode: 'CN', basisOfRecord: 'HUMAN_OBSERVATION', license: 'http://creativecommons.org/licenses/by/4.0/legalcode', datasetKey: 'd1', coordinateUncertaintyInMeters: 30 });
function fetcher(records: unknown[] | 'refused'): JsonFetcher & { asked: string[] } {
  const asked: string[] = [];
  const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (url.includes('/occurrence/search?taxonKey=5599083')) return records === 'refused' ? { status: 'refused', detail: 'HTTP 503' } : { status: 'ok', data: { results: records, endOfRecords: true } as T };
    return { status: 'skipped', detail: 'not asked here' };
  }) as JsonFetcher & { asked: string[] };
  f.asked = asked;
  return f;
}
const keys = parseExtraKeys(formatExtraKeys(extraKeysFor(page, idx, bb, new Set(), new Map()).keys)).filter((k) => k.key === 5599083);
const opts = { builtBy: 'node' as const, now: () => new Date('2026-10-20T00:00:00Z'), skip: ['wikidata', 'wikipedia', 'inat', 'commons'] as never };

describe('the builder reads their records into the page, which keeps no GBIF key', () => {
  it('the map, the record counts and the climate from the key\'s records, the key named, no GBIF key of its own', async () => {
    let asked: Array<[number, number]> = [];
    const climate = { envelope: async (pts: Array<[number, number]>) => { asked = pts; return { status: 'none' as const, detail: 'the test grid holds no cell' }; }, at: async () => ({ status: 'none' as const, detail: 'x' }) };
    const f = fetcher([rec(1, 27.9, 102.3), rec(2, 28.1, 102.9), rec(3, 26.5, 103.1)]);
    const r = await buildKewDossier(parvifolia, { ...opts, fetcher: f, extraKeys: keys, climate: climate as never });
    expect(r.ok).toBe(true);
    const d = (r as { ok: true; dossier: Dossier }).dossier;
    expect(d.key).toBe('k2609490');
    expect(d.ids.gbif).toBeUndefined();
    expect(f.asked.every((u) => u.includes('taxonKey=5599083'))).toBe(true); // never a name asked
    expect(d.occurrences.nOpenInRange).toBe(3);
    expect(d.occurrences.rangeTested).toBe(true);
    expect(d.occurrences.keys).toEqual([{ key: 5599083, name: 'Abelia parvifolia Hemsl.', kew: "Kew's file holds it as Abelia parvifolia Hemsl. (accepted)", n: 3, from: 'api' }]);
    expect(asked).toHaveLength(3);
    expect(d.climate).toEqual({ status: 'none', detail: 'the test grid holds no cell' });
    expect(d.upstream['gbif.occurrences'].status).toBe('ok');
    expect(d.upstream['gbif.occurrences'].detail).toContain(KEW_KEYS_WORDS);
    expect(d.upstream['gbif.occurrences'].detail).toContain("3 records of GBIF's key 5599083, Abelia parvifolia Hemsl.");
    expect(d.upstream['gbif.media'].detail).toBe(NO_GBIF_WHY);
    expect(recordsUnchecked(d)).toBe(false);
    expect(kewKeysSentence(d.occurrences.keys!)).toBe("This species has no GBIF key of its own. Its records are GBIF's under the key of the name Kew's World Checklist holds as this plant: 5599083 (Abelia parvifolia Hemsl., 3 records). No name was matched to GBIF; the keys are read from Kew's synonymy.");
  });
  it('a key not answering is the records not answering, said as such; no key at all is "not checked", as before', async () => {
    const r = await buildKewDossier(parvifolia, { ...opts, fetcher: fetcher('refused'), extraKeys: keys });
    const d = (r as { ok: true; dossier: Dossier }).dossier;
    expect(d.upstream['gbif.occurrences'].status).toBe('refused');
    expect(d.climate.status).toBe('refused');
    const n = (await buildKewDossier(parvifolia, { ...opts, fetcher: fetcher([]) }) as { ok: true; dossier: Dossier }).dossier;
    expect(n.upstream['gbif.occurrences']).toMatchObject({ status: 'skipped', detail: NO_GBIF_WHY });
    expect(n.climate.status).toBe('pending');
    expect(recordsUnchecked(n)).toBe(true);
  });
  it('a sheet or an entry without a GBIF key is unchecked only while its climate is pending', () => {
    expect(recordsUnchecked({ climate: { status: 'pending' } })).toBe(true);
    expect(recordsUnchecked({ climate: { status: 'none' } })).toBe(false);
    expect(recordsUnchecked({ gbif: 5, climate: { status: 'pending' } })).toBe(false);
  });
});

describe('the pages say it', () => {
  it('the species, plant, compare and label pages say "not checked" by the records, not by the key\'s absence', () => {
    const sp = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(sp).toContain('const unchecked = $derived(recordsUnchecked(d));');
    expect(sp).toContain('<div class="mapcap">{unchecked ? `Records not checked: ${NO_GBIF_WHY}.`');
    expect(sp).toContain('<p class="small muted" id="kew-keys-records">{kewKeysSentence(d.occurrences.keys)}');
    expect(sp).not.toMatch(/\{#if gbifless\}<NotChecked what="Climate"/);
    expect(readFileSync('src/routes/plants/[acc]/+page.svelte', 'utf8')).toContain('{#if !habitat && dossier && recordsUnchecked(dossier) && a.locationId}');
    expect(readFileSync('src/routes/compare/+page.svelte', 'utf8')).toContain("climateStatus: recordsUnchecked(d) ? 'unchecked' : cl.status");
    expect(readFileSync('src/routes/labels/+page.svelte', 'utf8')).toContain("climateStatus: d && recordsUnchecked(d) ? 'unchecked' : d?.climate.status");
  });
});

describe('the about page says it', () => {
  it('/about/how names the keys of Kew\'s synonymy and the file that lists them', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("Its GBIF records are read only under GBIF's keys for the names Kew's file holds as this plant");
    expect(how).toContain('<code>scripts/extra-keys-kew.txt</code>');
    expect(how).toContain('A page Kew\'s synonymy gives no such key has its GBIF records not asked');
  });
});
