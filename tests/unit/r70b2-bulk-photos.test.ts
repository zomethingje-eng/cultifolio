/**
 * Round seventy, the owner's run (2026-10-13): the rebuild of 118 species with `--bulk bulk` lost GBIF's photographs on
 * ten pages (drops.txt: Heliotropium velutinum 24 to none, Sorbaronia arsenii 24 to none, Talinella dauphinensis 9 to
 * none, Tylecodon cacaliodes 24 to 1, Anisocampium niponicum 24 to 8, ...). Two causes, both in the bulk path:
 *   - the download was asked for some of the species ("keeping 33 species" of 118: bulk/keys.json names 33 of them), and
 *     every other species' media request was answered from the files with no photograph, which is no answer at all;
 *   - for the species it holds, the forty records sampled for photographs were drawn whatever their licence, and only
 *     the open ones are served: Anisocampium niponicum has 949 photographed records at GBIF, 177 of them open, and forty
 *     drawn blind give about eight, the eight the rebuild kept; the API asks for open records only and gives 24.
 * Each case FAILED on m70 unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OccIndex, MediaIndex, bulkFetcher } from '$dossier/bulk';
import type { JsonFetcher } from '$dossier/fetch';

const MEDIA = (key: number) => `https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&limit=100`; // r71: human observations only (C4)
const api = (asked: string[]): JsonFetcher => (async (url: string) => {
  asked.push(url);
  return { status: 'ok', data: { results: [{ key: 1, basisOfRecord: 'HUMAN_OBSERVATION', media: [{ type: 'StillImage', identifier: 'https://example.org/1.jpg', license: 'http://creativecommons.org/licenses/by/4.0/' }] }], endOfRecords: true, count: 1 } };
}) as unknown as JsonFetcher;

describe('a species the download was not asked for is asked of GBIF', () => {
  const media = new MediaIndex(new Map([[500, 3785189]]));
  media.add({ gbifID: 500, identifier: 'https://example.org/z.jpg', license: 'http://creativecommons.org/publicdomain/zero/1.0/', type: 'StillImage' });
  it('Heliotropium velutinum, outside the download: its photographs come from the API, not "none" from the files', async () => {
    const asked: string[] = [];
    const f = bulkFetcher(api(asked), { media, covered: new Set([3785189]) });
    const r = await f<{ results: unknown[] }>(MEDIA(11015824));
    expect(r.status === 'ok' && r.data.results).toHaveLength(1); // m70: [], from the files
    expect(asked).toEqual([MEDIA(11015824)]);
  });
  it('a species the download holds is answered from the files, its having no photograph included (guard)', async () => {
    const asked: string[] = [];
    const f = bulkFetcher(api(asked), { media, covered: new Set([3785189, 7]) });
    expect((await f<{ results: unknown[] }>(MEDIA(3785189))).status).toBe('ok');
    const none = await f<{ results: unknown[] }>(MEDIA(7));
    expect(none.status === 'ok' && none.data.results).toEqual([]);
    expect(asked).toEqual([]);
  });
  it('with no keys.json, every species is the download\'s, as before (guard)', async () => {
    const asked: string[] = [];
    const f = bulkFetcher(api(asked), { media });
    await f(MEDIA(11015824));
    expect(asked).toEqual([]);
  });
  it('the script passes the download\'s keys, and loads a species built under a name the download did not use by its key', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    // Round eighty (A): and the page's own Kew entry for a key (`entryOf`).
    expect(src).toMatch(/bulkFetcher\(f, \{ wcvp: wcvp \?\? undefined, occ: loaded\?\.occ, media: loaded\?\.media \?\? undefined, apiPath, covered, entryOf \}\)/);
    expect(src).toMatch(/loadOccurrences\(bulkDir, 2000, wanted\)/);
  });
});

describe('the photograph sample of a species the download holds', () => {
  const still = (key: number, license: string) => ({ key, decimalLatitude: 0, decimalLongitude: 0, speciesKey: 8241853, taxonKey: 8241853, basisOfRecord: 'HUMAN_OBSERVATION', mediaType: 'StillImage', license });
  it('Anisocampium niponicum: records under an open licence are drawn first, as the API asks for them', () => {
    const idx = new OccIndex(10);
    // 949 photographed records, 177 open (GBIF, 2026-10-13), in the file's order.
    for (let i = 0; i < 949; i++) idx.add(still(10_000 + i * 7, i % 949 < 177 ? 'CC_BY_4_0' : 'CC_BY_NC_4_0'));
    expect(idx.withMedia.size).toBe(OccIndex.MEDIA_PER_SPECIES);
    const open = [...idx.withMedia.keys()].filter((k) => (k - 10_000) / 7 < 177);
    expect(open).toHaveLength(OccIndex.MEDIA_PER_SPECIES); // m70: about eight of the forty
  });
  it('with fewer than forty open records, every open one is drawn and the others fill the sample', () => {
    const idx = new OccIndex(10);
    for (let i = 0; i < 60; i++) idx.add(still(10_000 + i * 7, i < 5 ? 'CC_BY_4_0' : 'CC_BY_NC_4_0'));
    idx.add({ ...still(1, ''), license: undefined });
    const keys = [...idx.withMedia.keys()];
    expect(keys).toHaveLength(OccIndex.MEDIA_PER_SPECIES);
    expect(keys.filter((k) => k === 1 || (k - 10_000) / 7 < 5)).toHaveLength(6); // the five open and the one unstated, all in
  });
});
