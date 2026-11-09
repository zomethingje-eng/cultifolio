/**
 * Round eighty-seven, the backbone agent (docs/COLXR-87.md). GBIF's taxonomy is now the Catalogue of Life eXtended Release
 * (COL XR) and the GBIF Backbone is frozen at its build of 2023-08-28. GBIF's occurrence search still answers by the
 * backbone when an address names no taxonomy, but GBIF names no day it keeps that default. So:
 *
 *   - every occurrence search the build asks (`occurrences`, its regions' boxes, `media`) names the backbone
 *     (`&checklistKey=d7dddbf4-…`), last in the address, and the bulk path and the offline fetcher still answer it;
 *   - an answer whose records carry a key that is not a whole number (COL XR's "5ZHP3") is not read as backbone keys: it is
 *     an error, "did not answer" (rules 2 and 3), never "none"; the backbone match (v1) is guarded the same way, and its
 *     address is unchanged, the one batch.ts holds answers under;
 *   - the fetch layer counts the taxonomy each occurrence search named, a retry once, and `taxonomyLine` says it (rule 6).
 *
 * The fetchers are stubbed: nothing here reaches GBIF. On the base (r87-backbone at db5a68d) every test fails: `ON_BACKBONE`,
 * `otherTaxonomyKey`, `taxonomyLine` and `gbifTaxonomyAsked` do not exist, and the addresses name no taxonomy.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFetcher, resetPacing, gbifTaxonomyAsked, resetGbifTaxonomy, fixtureFetcher, type JsonFetcher, type FetchResult } from '$dossier/fetch';
import * as gbif from '$dossier/sources/gbif';
import { OccIndex, bulkFetcher } from '$lib/dossier/bulk';
import { offlineFetcher } from '$dossier/rederive';
import { matchUrl } from '$dossier/batch';

const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
const PIN = `&checklistKey=${BACKBONE}`;

/** A fetcher that records each address and answers from `answer`. */
function recording(answer: (url: string) => FetchResult<unknown>) {
  const asked: string[] = [];
  const f = (async (url: string) => { asked.push(url); return answer(url); }) as JsonFetcher;
  return { f, asked };
}
const page = (results: unknown[], count = results.length, endOfRecords = true) => ({ status: 'ok' as const, data: { results, count, endOfRecords } });

beforeEach(() => {
  resetPacing();
  resetGbifTaxonomy();
});

describe('every occurrence search names the GBIF Backbone', () => {
  it('the constants are GBIF\'s dataset keys', () => {
    expect(gbif.BACKBONE).toBe(BACKBONE);
    expect(gbif.COL_XR).toBe('7ddf754f-d193-4cc9-b351-99906754a03b');
    expect(gbif.ON_BACKBONE).toBe(PIN);
    expect(gbif.BACKBONE_BUILT).toBe('2023-08-28');
  });

  it('the records\' pages and each region\'s box end with the backbone\'s checklistKey', async () => {
    const rec = (key: number) => ({ key, taxonKey: 5384013, speciesKey: 3945144, acceptedTaxonKey: 3945144, decimalLatitude: 31, decimalLongitude: -111 });
    const { f, asked } = recording((url) => (url.includes('decimalLatitude=') ? page([rec(9)]) : page([rec(1), rec(2)], 5000, false)));
    const r = await gbif.occurrences(f, 5384013, 3, [{ s: 30, w: -112, n: 33, e: -109 }]);
    expect(r.status).toBe('ok');
    expect(asked).toHaveLength(2);
    for (const u of asked) {
      expect(u.endsWith(PIN)).toBe(true);
      expect(new URL(u).searchParams.getAll('checklistKey')).toEqual([BACKBONE]);
    }
    expect(asked[0]).toBe(`https://api.gbif.org/v1/occurrence/search?taxonKey=5384013&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=300&offset=0${PIN}`);
  });

  it('the photographs\' search ends with it too', async () => {
    const { f, asked } = recording(() => page([]));
    await gbif.media(f, 5384013);
    expect(asked).toEqual([`https://api.gbif.org/v1/occurrence/search?taxonKey=5384013&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&limit=100${PIN}`]);
  });

  it('the bulk path still answers the named addresses from the files, and the offline fetcher still asks the records\' search', async () => {
    const occ = new OccIndex();
    occ.add({ key: 10, decimalLatitude: -30, decimalLongitude: 17, speciesKey: 100 });
    occ.seal();
    const base = recording(() => ({ status: 'none' }));
    const bf = bulkFetcher(base.f, { occ });
    const r = await gbif.occurrences(bf, 100);
    expect(r.status === 'ok' && r.data.map((o) => o.key)).toEqual([10]);
    expect(bf.stats.occ).toBe(1);
    expect(base.asked).toEqual([]);
    // Offline: the records' search goes to the network (a species left to the API path); nothing else is asked.
    const net = recording(() => page([]));
    const off = offlineFetcher(net.f, () => null);
    await gbif.occurrences(off, 100);
    expect(net.asked).toHaveLength(1);
    expect(net.asked[0].endsWith(PIN)).toBe(true);
  });

  it('a recorded answer keyed by the address without the parameter is still found by its start (fixtureFetcher)', async () => {
    const f = fixtureFetcher({ 'https://api.gbif.org/v1/occurrence/search?taxonKey=7&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=300&offset=0': { results: [{ key: 1, taxonKey: 7 }], count: 1, endOfRecords: true } });
    const r = await gbif.occurrences(f, 7);
    expect(r.status === 'ok' && r.data.length).toBe(1);
  });
});

describe('an answer keyed by another taxonomy is not read', () => {
  it('isBackboneKey: a whole number, as a number or as digits; COL XR\'s keys are not', () => {
    expect(gbif.isBackboneKey(5384013)).toBe(true);
    expect(gbif.isBackboneKey('5384013')).toBe(true);
    for (const k of ['5ZHP3', 'Q2M4', '', '0', '05384013', 1.5, 0, -3, Number.NaN, null]) expect(gbif.isBackboneKey(k)).toBe(false);
    expect(gbif.otherTaxonomyKey([{ key: 1, taxonKey: 5384013 }, { key: 2 }])).toBeUndefined();
    expect(gbif.otherTaxonomyKey([{ key: 1, taxonKey: 5384013 }, { key: 2, taxonKey: 5384013, speciesKey: '5ZHP3' }])).toBe('5ZHP3');
  });

  it('the records\' search: an error that says why, never none, and nothing partial kept', async () => {
    const { f } = recording(() => page([{ key: 1, taxonKey: '3XSBX', speciesKey: '5ZHP3', decimalLatitude: 31, decimalLongitude: -111 }]));
    const r = await gbif.occurrences(f, 5384013);
    expect(r.status).toBe('error');
    expect(r.status === 'error' && r.detail).toBe(`api.gbif.org answered with a taxon key that is not the GBIF Backbone's ("3XSBX") to a search that named the backbone (checklistKey ${BACKBONE}): not read`);
    // A second page keyed otherwise, after a first read: the first page is not kept either.
    let n = 0;
    const two = recording(() => (n++ ? page([{ key: 2, taxonKey: 'Q2M4' }]) : page([{ key: 1, taxonKey: 5384013 }], 900, false)));
    const r2 = await gbif.occurrences(two.f, 5384013);
    expect(r2.status === 'error' && r2.detail).toMatch(/\("Q2M4"\).*\(after 1 records: partial, not used\)$/);
  });

  it('a region\'s box keyed otherwise is not read either', async () => {
    const { f } = recording((url) => (url.includes('decimalLatitude=') ? page([{ key: 9, taxonKey: '5ZHP3' }]) : page([{ key: 1, taxonKey: 5384013 }], 5000, false)));
    const r = await gbif.occurrences(f, 5384013, 3, [{ s: 30, w: -112, n: 33, e: -109 }]);
    expect(r.status === 'error' && r.detail).toMatch(/\("5ZHP3"\).*partial, not used/);
  });

  it('the photographs\' search: an error, and no photograph taken', async () => {
    const { f } = recording(() => page([{ key: 1, taxonKey: '5ZHP3', media: [{ type: 'StillImage', identifier: 'https://example.org/a.jpg', license: 'http://creativecommons.org/licenses/by/4.0/' }] }]));
    const r = await gbif.media(f, 5384013);
    expect(r.status).toBe('error');
  });

  it('the backbone match keeps its address (batch.ts holds answers under it) and refuses a key of another taxonomy', async () => {
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { usageKey: 'Q2M4', scientificName: 'Calopteryx splendens', matchType: 'EXACT' } }; }) as JsonFetcher;
    const r = await gbif.matchName(f, 'Mammillaria grahamii');
    expect(asked).toEqual([matchUrl('Mammillaria grahamii')]);
    expect(r.status).toBe('error');
    const ok = (async () => ({ status: 'ok', data: { usageKey: 5384013, acceptedUsageKey: 3945144, scientificName: 'Mammillaria grahamii Engelm.', matchType: 'EXACT' } })) as JsonFetcher;
    expect((await gbif.matchName(ok, 'Mammillaria grahamii')).status).toBe('ok');
  });
});

describe('the build can say which taxonomy its searches named (rule 6)', () => {
  it('counts each occurrence search sent by its checklistKey, a retry once, and nothing else', async () => {
    let calls = 0;
    const impl = (async (url: string | URL | Request) => {
      calls++;
      // The first named search is answered 503 once (Retry-After 0), then answers: one search, two calls.
      if (calls === 1) return new Response('busy', { status: 503, headers: { 'retry-after': '0' } });
      void url;
      return new Response('{"results":[],"count":0,"endOfRecords":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const f = makeFetcher(impl);
    await gbif.occurrences(f, 5384013);
    await f('https://api.gbif.org/v1/occurrence/search?taxonKey=1&hasCoordinate=true&limit=0');
    await f('https://api.gbif.org/v1/species/5384013');
    await f(`https://api.gbif.org/v1/occurrence/search?taxonKey=Q2M4&checklistKey=${gbif.COL_XR}`);
    expect(calls).toBe(5);
    expect(Object.fromEntries(gbifTaxonomyAsked())).toEqual({ [BACKBONE]: 1, '': 1, [gbif.COL_XR]: 1 });
    expect(gbif.taxonomyLine(gbifTaxonomyAsked())).toBe(`GBIF's taxonomy: 3 occurrence searches, 1 on the GBIF Backbone (checklistKey ${BACKBONE}, its build of 2023-08-28), 1 naming no taxonomy (GBIF's default), 1 naming another (${gbif.COL_XR})`);
  }, 20_000);

  it('all on the backbone, said as that; none asked, no line', () => {
    expect(gbif.taxonomyLine(new Map())).toBeNull();
    expect(gbif.taxonomyLine(new Map([[BACKBONE, 1204]]))).toBe(`GBIF's taxonomy: 1204 occurrence searches, all on the GBIF Backbone (checklistKey ${BACKBONE}, its build of 2023-08-28)`);
  });
});
