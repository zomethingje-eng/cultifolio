/**
 * Round ninety-five, 4 (docs/PLAN-95.md): a page says the keys whose records it leaves out. A line of the key lists may
 * name keys GBIF files under the key read whose records are not read (`except`: another plant's names, another type's,
 * pro parte synonyms); `extraOccurrences` dropped those records, and a record GBIF names no taxon for, and no page said
 * so (rule 3: the record says which). 1,085 lines carry such keys; Viola stipularis's 5665280 is one. Now each key read
 * carries `left` (the keys, the records left out by them, those with no name), the record's words and the page's "Other
 * GBIF keys" say it, and the schema keeps it.
 *
 * On 7b73054: `keys[0].left` undefined, and the schema dropped it on parse: FAILED.
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'valibot';
import { extraOccurrences, extraKeyWords } from '$dossier/build';
import { Occurrences } from '$dossier/schema';
import { fixtureFetcher } from '$dossier/fetch';
import { leftWords, leftShort, kewKeysSentence } from '../../src/lib/core/no-gbif';
import type { ExtraKey } from '$dossier/extra-keys';

const rec = (key: number, taxonKey?: number) => ({ key, decimalLatitude: 1, decimalLongitude: 1, basisOfRecord: 'HUMAN_OBSERVATION', license: 'http://creativecommons.org/licenses/by/4.0/legalcode', datasetKey: 'd', coordinateUncertaintyInMeters: 100, year: 2020, countryCode: 'EC', ...(taxonKey != null ? { taxonKey } : {}) });
const extra: ExtraKey = { page: 7, key: 5, label: 'Viola x L.', status: 'ACCEPTED', kew: '1', kewLabel: 'Viola x L. (accepted)', how: 'entry' };

describe('r95c 1: the build counts what a key\'s exceptions left out', () => {
  it('records of an excepted key and records with no name are counted apart; a record seen before is not counted', async () => {
    const own = { status: 'ok' as const, data: [rec(4, 6)] };
    const f = fixtureFetcher({ 're:occurrence/search\\?taxonKey=5&hasCoordinate': { endOfRecords: true, results: [rec(1, 5), rec(2, 6), rec(3), rec(4, 6), rec(8, 9)] } });
    const r = await extraOccurrences(f, own, [{ ...extra, except: [6, 9] }]);
    expect(r.occ.status === 'ok' && r.occ.data.map((x) => x.key)).toEqual([4, 1]);
    expect(r.keys[0]).toMatchObject({ key: 5, n: 1, left: { keys: [6, 9], n: 2, unnamed: 1 } });
  });
  it('a line with exceptions that took nothing out says so; a line without none has no left', async () => {
    const f = fixtureFetcher({ 're:occurrence/search\\?taxonKey=5&hasCoordinate': { endOfRecords: true, results: [rec(1, 5)] } });
    expect((await extraOccurrences(f, { status: 'none' }, [{ ...extra, except: [5665280] }])).keys[0].left).toEqual({ keys: [5665280], n: 0 });
    expect((await extraOccurrences(f, { status: 'none' }, [extra])).keys[0].left).toBeUndefined();
  });
  it('the schema keeps it', () => {
    const k = { key: 5, name: 'Viola x L.', kew: 'k', n: 1, from: 'api' as const, left: { keys: [6], n: 2, unnamed: 1 } };
    const o = parse(Occurrences, { ...minimalOcc(), keys: [k] });
    expect(o.keys?.[0].left).toEqual({ keys: [6], n: 2, unnamed: 1 });
  });
});

describe('r95c 2: the words', () => {
  it('the record and the page say the keys and the count', () => {
    expect(leftWords({ keys: [6], n: 2, unnamed: 1 })).toBe("not read under it: GBIF's key 6, names Kew's World Checklist holds as another plant or of another type, or pro parte synonyms (2 records GBIF gave under it left out as one of them; 1 record GBIF names no taxon for, left out too)");
    expect(leftWords({ keys: [5665280, 5665281], n: 0 })).toBe("not read under it: GBIF's keys 5665280, 5665281, names Kew's World Checklist holds as another plant or of another type, or pro parte synonyms (none of the records GBIF gave under it was one of them)");
    expect(extraKeyWords({ key: 5, name: 'Viola x L.', kew: 'k', n: 1, from: 'api', left: { keys: [6], n: 1 } })).toBe("1 record of GBIF's key 5, Viola x L. (k): GBIF occurrence search API; not read under it: GBIF's key 6, names Kew's World Checklist holds as another plant or of another type, or pro parte synonyms (1 record GBIF gave under it left out as one of them)");
    expect(extraKeyWords({ key: 5, name: 'Viola x L.', kew: 'k', n: 1, from: 'api' })).toBe("1 record of GBIF's key 5, Viola x L. (k): GBIF occurrence search API");
  });
  it('a page without a GBIF key says it inside the key\'s brackets', () => {
    expect(leftShort({ keys: [3577721], n: 3, unnamed: 2 })).toBe("GBIF's key 3577721 under it not read, 3 records left out, and 2 records with no name");
    expect(kewKeysSentence([{ key: 9592399, name: 'Ceropegia nubica', n: 10, slug: 'ceropegia-nubica', left: { keys: [3577721], n: 0 } }])).toContain("9592399 (Ceropegia nubica, 10 records; GBIF's key 3577721 under it not read, no record left out)");
  });
});

function minimalOcc() {
  return { open: [], nOpenInRange: 0, nRestrictedInRange: 0, nOutsideRange: 0, restrictedShiftKm: null, thin: true, datasets: [] };
}
