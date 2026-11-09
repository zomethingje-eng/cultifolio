/**
 * Round eighty-seven, the data agent: item 7, GBIF's derived dataset. The pages cite the download's DOI on each page's
 * record of its sources ("GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21": `build.ts`,
 * `build-kew.ts`, shown by Provenance); the records that came through GBIF's search API instead (a species the download
 * left to the API path, another key the download does not hold) were cited by no DOI, and the dossiers kept no count of
 * them by dataset apart from the download's. The build now counts them (`occurrences.api`), and `--list-derived` adds them
 * up into derived-dataset.csv for the owner to register (https://www.gbif.org/derived-dataset/about).
 *
 * New in round eighty-seven: on r86 a dossier had no `occurrences.api`, and there was no `--list-derived`.
 */
import { describe, it, expect } from 'vitest';
import { readRecords, apiDatasetsOf, buildDossier } from '$dossier/build';
import { derivedTally, derivedCsv, derivedWords } from '$dossier/derived-dataset';
import { Occurrences } from '$dossier/schema';
import { substanceHash } from '$dossier/changed';
import { fixtureFetcher } from '$dossier/fetch';
import * as v from 'valibot';
import type { GbifOccurrence } from '$dossier/sources/gbif';
import { copiapoa } from '../../fixtures/upstream';

const rec = (key: number, lat: number, ds: string, fromDownload: boolean): GbifOccurrence => ({ key, decimalLatitude: lat, decimalLongitude: -70.5, basisOfRecord: 'HUMAN_OBSERVATION', datasetKey: ds, license: 'http://creativecommons.org/licenses/by/4.0/', countryCode: 'CL', ...(fromDownload ? { downloadDoi: '10.15468/dl.hbdw64', downloadDay: '2026-10-21' } : {}) } as GbifOccurrence);

describe('the build counts the in-range records the API gave, by dataset', () => {
  it('a record with the download\'s DOI is the download\'s; one without came through the API', () => {
    const r = readRecords([rec(1, -26.1, 'inat', false), rec(2, -26.2, 'inat', false), rec(3, -26.3, 'herb', false), rec(4, -26.4, 'inat', true)], [], true);
    expect(apiDatasetsOf(r.apiDatasets)).toEqual([{ key: 'inat', n: 2 }, { key: 'herb', n: 1 }]);
  });
  it('a record outside the range is not counted: the page does not use it', () => {
    const box = { s: -26.25, w: -71, n: -26.05, e: -70 };
    const r = readRecords([rec(1, -26.1, 'inat', false), rec(2, -26.3, 'inat', false)], [box], true);
    expect(apiDatasetsOf(r.apiDatasets)).toEqual([{ key: 'inat', n: 1 }]);
  });
  it('the dossier keeps it, empty when every record came from the download, and the schema takes it', async () => {
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(copiapoa()), builtBy: 'node', skip: ['commons', 'inat', 'wikipedia', 'openalex', 'gbif.media'], now: () => new Date('2026-11-08T12:00:00Z') });
    if (!r.ok) throw new Error('no dossier');
    const api = r.dossier.occurrences.api;
    expect(Array.isArray(api)).toBe(true); // r86: undefined
    expect(api!.reduce((n, x) => n + x.n, 0)).toBe(r.dossier.occurrences.nOpenInRange + r.dossier.occurrences.nRestrictedInRange); // the fixture is the API's answer
    expect(v.parse(Occurrences, { ...r.dossier.occurrences, api: [{ key: 'd', n: 3 }] }).api).toEqual([{ key: 'd', n: 3 }]);
  });
});

describe("the count moves no page's day", () => {
  it('a page the same but for occurrences.api has the same substance (the page does not show it)', () => {
    const d = { key: 'k1', built: 'x', occurrences: { open: [], nOpenInRange: 0, datasets: [{ key: 'a', n: 1 }] } };
    expect(substanceHash({ ...d, occurrences: { ...d.occurrences, api: [{ key: 'a', n: 1 }] } })).toBe(substanceHash(d));
    expect(substanceHash({ ...d, occurrences: { ...d.occurrences, nOpenInRange: 1 } })).not.toBe(substanceHash(d)); // guard
  });
});

describe('--list-derived', () => {
  const pages = [
    { key: 'k1' as const, name: { scientific: 'A a' }, occurrences: { api: [{ key: 'inat', n: 5 }, { key: 'herb', n: 1 }] } },
    { key: 'k2' as const, name: { scientific: 'B b' }, occurrences: { api: [{ key: 'herb', n: 4 }] } },
    { key: 'k3' as const, name: { scientific: 'C c' }, occurrences: { api: [] } },
    { key: 'k4' as const, name: { scientific: 'D d' }, occurrences: {} }
  ];
  it('adds the counts up by datasetKey, largest first, as GBIF\'s form takes them', () => {
    const t = derivedTally(pages);
    expect(derivedCsv(t)).toBe('datasetKey,count\nherb,5\ninat,5\n'); // equal counts by key
    expect(t.records).toBe(10);
    expect(t.withApi).toBe(2);
  });
  it('a page derived before the count was kept is not checked, never none (rule 2)', () => {
    const t = derivedTally(pages);
    expect(t.unknown).toBe(1);
    expect(derivedWords(t, 'derived-dataset.csv')).toBe('  10 in-range records (on the map, or counted and read for the climate) on 2 of 4 pages came through GBIF\'s search API, from 2 datasets → derived-dataset.csv; 1 page derived before round eighty-seven holds no count of it, not checked (the walk writes it): k4 D d');
  });
});
