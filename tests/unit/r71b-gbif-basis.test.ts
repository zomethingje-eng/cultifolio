/**
 * Round 71, B (self-review 70 C4, triage-70 "Photographs"): GBIF's media search asked for MACHINE_OBSERVATION and
 * OBSERVATION records too, so Meise's herbarium scans led 18 of 100 GBIF-led tiles, an NMNH line drawing led Adenia
 * lobata's and two pollen micrographs were Talinella grevei's only photographs; the download path admitted human
 * observations only. The search now asks for human observations only, a record of any other basis GBIF answers is marked
 * `specimen`, and `--fill gbif-basis` drops stored ones. Each case FAILED on r71base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { media } from '$dossier/sources/gbif';
import { fillGbifBasisAll, BASIS_CHECKED } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';

describe('GBIF media', () => {
  it('are asked of human observations only, and a record of another basis is a specimen', async () => {
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { results: [{ key: 7, basisOfRecord: 'MACHINE_OBSERVATION', media: [{ type: 'StillImage', identifier: 'https://x/1.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A' }] }, { key: 8, basisOfRecord: 'HUMAN_OBSERVATION', media: [{ type: 'StillImage', identifier: 'https://x/2.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'B' }] }], endOfRecords: true } }; }) as unknown as JsonFetcher;
    const r = await media(f, 3092);
    expect(asked[0]).toMatch(/&basisOfRecord=HUMAN_OBSERVATION&limit=100$/); // r71base: …&basisOfRecord=OBSERVATION&basisOfRecord=MACHINE_OBSERVATION
    expect(r.status === 'ok' && r.data.map((m) => !!m.specimen)).toEqual([true, false]); // r71base: [false, false]
  });
});

describe('--fill gbif-basis', () => {
  const rec: Record<string, string> = { '3467319590': 'MACHINE_OBSERVATION', '111': 'HUMAN_OBSERVATION', '222': 'PRESERVED_SPECIMEN' };
  const f = (async (url: string) => {
    const k = /\/occurrence\/(\d+)$/.exec(url)?.[1];
    if (k === '999') return { status: 'none' };
    return k && rec[k] ? { status: 'ok', data: { key: Number(k), basisOfRecord: rec[k] } } : { status: 'refused', detail: url };
  }) as unknown as JsonFetcher;
  const photo = (id: string, url = `https://api.gbif.org/v1/image/${id}.jpg`) => ({ src: 'gbif', id, url, thumb: url, licence: 'by', attribution: 'J. W. Nowicke, CC BY, via GBIF' });
  it('drops photographs of records that are not human observations, says so, and passes by what it read', async () => {
    const docs: Record<string, any> = {
      a: { key: 3092, name: { scientific: 'Talinella grevei' }, photos: [photo('3467319590:0'), photo('3467319590:1')], upstream: { 'gbif.media': { status: 'ok', at: 'x' } } },
      b: { key: 5, name: { scientific: 'Aloe vera' }, photos: [photo('111:0'), photo('222:0'), photo('999:0'), { src: 'gbif', id: '444:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/original.jpg', thumb: '', licence: 'by', attribution: 'x' }], upstream: {} }
    };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    const c = await fillGbifBasisAll(store, f, () => '2026-10-16T00:00:00Z');
    expect(c).toMatchObject({ dossiers: 2, dropped: 3, kept: 2, emptied: 1 });
    expect(docs.a.photos).toEqual([]);
    expect(docs.b.photos.map((p: { id: string }) => p.id)).toEqual(['111:0', '999:0', '444:0']); // a record no longer served is --fill gbif-licence's; iNaturalist's hosts are not asked
    expect(docs.a.upstream['gbif.media'].detail).toBe(`${BASIS_CHECKED} 2026-10-16: 2 from records not human observations (MACHINE_OBSERVATION) dropped`);
    expect(c.lines).toEqual(['Talinella grevei [3092]: 2 dropped (MACHINE_OBSERVATION)', 'Aloe vera [5]: 1 dropped (PRESERVED_SPECIMEN)']);
    expect(await fillGbifBasisAll(store, f)).toMatchObject({ dossiers: 0, before: 1 }); // a dossier left with none has nothing to ask
  });
  it('stops at a refusal, leaving the dossier as it was (guard)', async () => {
    const docs: Record<string, any> = { a: { key: 1, photos: [photo('555:0')], upstream: {} } };
    const c = await fillGbifBasisAll({ files: () => ['a'], read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } }, f);
    expect(c.failed).toBeTruthy();
    expect(docs.a.photos).toHaveLength(1);
  });
});
