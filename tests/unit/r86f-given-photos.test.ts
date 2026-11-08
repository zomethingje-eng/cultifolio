/**
 * Round eighty-six, final review S1 (D6's photographs): a page GBIF files another page's variety under (Echinopsis
 * macrogona, 3952140) left out the variety's records (Trichocereus macrogonus var. pachanoi, 11093098, Echinopsis
 * pachanoi's by Kew's synonymy) but kept their photographs: GBIF's API answer and the download's sample are by the
 * species key, and the reviewer counted 36 of macrogona's 81 open photographs as var. pachanoi's. Now the photographs of
 * records GBIF identifies as a given key are left out as the records are, by the API path, the download path (the media
 * index now carries each photograph's taxonKey) and `--fill gbif-open`, and the record says how many and of which keys.
 * Only left out: the receiving page is a page without a GBIF key, which shows no GBIF photograph (`build-kew.ts`).
 *
 * On r85m: the build and the fill kept every photograph, and `MediaIndex.page` carried no taxonKey.
 */
import { describe, it, expect } from 'vitest';
import { buildDossier, withoutGivenMedia } from '$dossier/build';
import { OccIndex, MediaIndex, bulkFetcher } from '$dossier/bulk';
import { fillOpenGbif, askedOpen, OPEN_NONE } from '$dossier/open-gbif-fill';
import * as gbif from '$dossier/sources/gbif';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const GIVEN = { keys: new Set([11093098]), words: "of GBIF's key 11093098, Trichocereus macrogonus var. pachanoi, left out" };
const rec = (key: number, taxonKey: number | undefined, n = 1) => ({ key, basisOfRecord: 'HUMAN_OBSERVATION', datasetKey: 'd', ...(taxonKey ? { taxonKey } : {}), media: Array.from({ length: n }, (_, i) => ({ type: 'StillImage', identifier: `https://img.example/${key}-${i}.jpg`, license: 'http://creativecommons.org/licenses/by/4.0/', creator: `Observer ${key}` })) });

describe('withoutGivenMedia', () => {
  it("leaves out the photographs of records under a given key, and says how many and of which keys", () => {
    const m = { status: 'ok' as const, data: [{ id: '1:0', url: 'a', licence: 'by' as const, creator: 'x', taxonKey: 3952140 }, { id: '2:0', url: 'b', licence: 'by' as const, creator: 'y', taxonKey: 11093098 }, { id: '2:1', url: 'c', licence: 'by' as const, creator: 'y', taxonKey: 11093098 }, { id: '3:0', url: 'd', licence: 'by' as const, creator: 'z' }], asOf: '2026-10-21' };
    const r = withoutGivenMedia(m, GIVEN);
    expect(r.n).toBe(2);
    expect(r.m.status === 'ok' && r.m.data.map((x) => x.url)).toEqual(['a', 'd']); // a record stating no key is kept
    expect(r.m.asOf).toBe('2026-10-21');
    expect(r.words).toBe("2 photographs of records GBIF identifies as key 11093098 left out, as their records are: Kew's synonymy gives those keys to another page");
  });
  it('every photograph given away: "none", with the download\'s day', () => {
    const r = withoutGivenMedia({ status: 'ok', data: [{ id: '2:0', url: 'b', licence: 'by' as const, taxonKey: 11093098 }], asOf: '2026-10-21' }, GIVEN);
    expect(r.m).toEqual({ status: 'none', asOf: '2026-10-21' });
    expect(r.n).toBe(1);
  });
  it('guard: no given keys, or an answer not ok, is passed through as it is', () => {
    const ok = { status: 'ok' as const, data: [{ id: '2:0', url: 'b', licence: 'by' as const, taxonKey: 11093098 }] };
    expect(withoutGivenMedia(ok).m).toBe(ok);
    const refused = { status: 'refused' as const, detail: 'HTTP 429' };
    expect(withoutGivenMedia(refused, GIVEN)).toEqual({ m: refused, n: 0 });
  });
});

describe('the download path carries each photograph\'s taxonKey', () => {
  it("a record of the variety, owned by the species key, is answered with the variety's key; the species' own with the species'", async () => {
    const occ = new OccIndex(2000, new Set([3952140]));
    for (const [key, taxonKey] of [[1, 3952140], [2, 11093098], [3, 11093098]] as const) occ.add({ key, speciesKey: 3952140, taxonKey, acceptedTaxonKey: taxonKey, mediaType: 'StillImage', basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0' } as never);
    expect([...occ.withMedia.values()]).toEqual([3952140, 3952140, 3952140]); // the species key owns them all, as before
    const media = new MediaIndex(occ.withMedia, occ.mediaRank, occ.mediaTaxon);
    for (const id of [1, 2, 3]) media.add({ gbifID: id, identifier: `https://img.example/${id}.jpg`, license: 'http://creativecommons.org/licenses/by/4.0/', creator: `Observer ${id}`, type: 'StillImage' } as never);
    const f = bulkFetcher((async () => ({ status: 'refused', detail: 'offline' })) as unknown as JsonFetcher, { occ, media });
    const m = await gbif.media(f, 3952140);
    expect(m.status === 'ok' && m.data.map((x) => [x.page, x.taxonKey]).sort()).toEqual([['https://www.gbif.org/occurrence/1', 3952140], ['https://www.gbif.org/occurrence/2', 11093098], ['https://www.gbif.org/occurrence/3', 11093098]]);
    const kept = withoutGivenMedia(m, GIVEN).m;
    expect(kept.status === 'ok' && kept.data.map((x) => x.page)).toEqual(['https://www.gbif.org/occurrence/1']);
    // guard: an index made without the keys answers as before, with no taxonKey
    const plain = new MediaIndex(occ.withMedia, occ.mediaRank);
    plain.add({ gbifID: 2, identifier: 'https://img.example/2.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'o', type: 'StillImage' } as never);
    expect(plain.page(3952140)?.results[0].taxonKey).toBeUndefined();
  });
});

describe("the build's and the fill's photographs", () => {
  const world = () => {
    const t = copiapoa() as Record<string, unknown>;
    const k = Object.keys(t).find((x) => x.includes('/occurrence/search') && x.includes('mediaType'))!;
    t[k] = { count: 4, endOfRecords: true, results: [rec(10, 5384013), rec(11, 11093098, 2), rec(12, 11093098), rec(13, 5384013)] };
    return t;
  };
  const build = (givenAway?: typeof GIVEN) => buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(world()), builtBy: 'node', mediaFirst: true, skip: ['commons', 'inat', 'wikipedia', 'openalex'], now: () => new Date('2026-11-08T12:00:00Z'), ...(givenAway ? { givenAway } : {}) });
  it("the holder's build leaves out the given key's photographs and says so", async () => {
    const before = await build();
    const after = await build(GIVEN);
    if (!before.ok || !after.ok) throw new Error('no dossier');
    const gb = (d: typeof before.dossier) => d.photos.filter((p) => p.src === 'gbif').map((p) => p.page);
    expect(gb(before.dossier)).toHaveLength(5); // guard: without the rule every photograph
    expect(gb(after.dossier)).toEqual(['https://www.gbif.org/occurrence/10', 'https://www.gbif.org/occurrence/13']); // r85m: 5
    expect(after.dossier.upstream['gbif.media'].detail).toContain('3 photographs of records GBIF identifies as key 11093098 left out');
  });
  it('--fill gbif-open leaves them out too, and a page told none is still passed by', async () => {
    const d = { key: 'k1', ids: { gbif: 5384013 }, photos: [], upstream: {} } as never as Parameters<typeof fillOpenGbif>[0];
    const r = await fillOpenGbif(d, fixtureFetcher(world()), () => '2026-11-08T12:00:00Z', GIVEN);
    expect(r).toEqual({ added: 2 });
    expect(d.photos.map((p) => p.page)).toEqual(['https://www.gbif.org/occurrence/10', 'https://www.gbif.org/occurrence/13']);
    const all = { key: 'k1', ids: { gbif: 5384013 }, photos: [], upstream: {} } as never as Parameters<typeof fillOpenGbif>[0];
    const t = world();
    const k = Object.keys(t).find((x) => x.includes('/occurrence/search') && x.includes('mediaType'))!;
    t[k] = { count: 1, endOfRecords: true, results: [rec(11, 11093098)] };
    expect(await fillOpenGbif(all, fixtureFetcher(t), () => '2026-11-08T12:00:00Z', GIVEN)).toEqual({ none: true });
    expect(all.upstream['gbif.media'].detail).toMatch(new RegExp(`^${OPEN_NONE}; 1 photograph of records`));
    expect(askedOpen(all)).toBe(true);
  });
});
