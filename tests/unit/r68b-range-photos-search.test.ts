/**
 * Round sixty-eight, the owner's checks of the live site after round sixty-seven's corpus step: Bisnaga glaucescens and
 * Aeonium tabulaeforme had no native range and no habitat climate (Kew files them as Ferocactus glaucescens and Aeonium
 * tabuliforme); 104 rebuilt species had no photograph (GBIF's records were read whatever their licence, and the first
 * 100 were all non-commercial); and "snake plant" answered Chelone glabra second, "plant" taken from the start of its
 * family, Plantaginaceae. Each case FAILED on round sixty-seven unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, bulkFetcher, type WcvpName, type WcvpDist } from '$dossier/bulk';
import { distributions, media } from '$dossier/sources/gbif';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { prepare, search } from '$core/search';

const GBIF = 'https://api.gbif.org/v1';
const nm = (id: string, name: string, status = 'Accepted', acceptedId = id, authors?: string): WcvpName => ({ id, name, status, acceptedId, rank: 'Species', authors });
const ds = (id: string, l3: string, area: string): WcvpDist => ({ id, l3, area, introduced: false, extinct: false, doubtful: false });
function kew(): WcvpIndex {
  const k = new WcvpIndex();
  const all = () => true;
  k.addName(nm('fg', 'Ferocactus glaucescens'), all);
  k.addName(nm('at', 'Aeonium tabuliforme'), all);
  k.addName(nm('x1', 'Mammillaria twin'), all);
  k.addName(nm('x2', 'Coryphantha twin'), all);
  k.addDist(ds('fg', 'MXE', 'Mexico Northeast'));
  k.addDist(ds('at', 'CNY', 'Canary Is.'));
  k.addDist(ds('x1', 'MXC', 'Mexico Central'));
  k.addDist(ds('x2', 'MXN', 'Mexico Northwest'));
  return k;
}

describe('a range Kew files under one of the species\' older names', () => {
  it('is found, and says the name it came under', () => {
    const got = kew().viaOlderNames([{ name: 'Echinocactus glaucescens' }, { name: 'Ferocactus glaucescens', authorship: '(DC.) Britton & Rose' }]);
    expect(got?.via).toBe('Ferocactus glaucescens');
    expect(got?.rows.map((r) => r.locationId)).toEqual(['TDWG:MXE']);
  });
  it('is not taken when the older names lead to two accepted entries (guard)', () => {
    expect(kew().viaOlderNames([{ name: 'Mammillaria twin' }, { name: 'Coryphantha twin' }])).toBeNull();
  });
  it('reaches the build through the bulk fetcher: the distribution names Kew\'s entry', async () => {
    const base = fixtureFetcher({
      [`${GBIF}/species/9476326/synonyms`]: { results: [{ canonicalName: 'Sempervivum tabulaeforme' }, { canonicalName: 'Aeonium tabuliforme', authorship: '(Haw.) Webb & Berthel.' }] },
      [`${GBIF}/species/9476326`]: { key: 9476326, canonicalName: 'Aeonium tabulaeforme', authorship: '(Haw.) Webb & Berthel.' }
    });
    const f = bulkFetcher(base, { wcvp: kew() });
    const r = await distributions(f as JsonFetcher, 9476326);
    expect(r).toMatchObject({ status: 'ok', data: { wcvp: true, via: 'Aeonium tabuliforme' } }); // base: national checklists, no range
    if (r.status === 'ok') expect(r.data.rows.map((x) => x.locationId)).toEqual(['TDWG:CNY']);
  });
});

describe('GBIF\'s photographs are asked for among its openly licensed records only', () => {
  it('the request names CC0 and CC BY', async () => {
    let asked = '';
    const f = (async (url: string) => { asked = url; return { status: 'ok', data: { results: [], endOfRecords: true, count: 0 } }; }) as unknown as JsonFetcher;
    await media(f, 2860360);
    expect(asked).toContain('&license=CC0_1_0&license=CC_BY_4_0'); // base: every licence, and the first 100 were all CC BY-NC
    expect(asked).toMatch(/\/occurrence\/search\?taxonKey=2860360&mediaType=StillImage/); // guard: the bulk fetcher's pattern still reads it
  });
});

describe('a family is matched only by a whole word', () => {
  const items = prepare([
    { key: 1, slug: 'dracaena-trifasciata', name: 'Dracaena trifasciata', family: 'Asparagaceae', common: 'Snake plant' },
    { key: 2, slug: 'chelone-glabra', name: 'Chelone glabra', family: 'Plantaginaceae', common: 'White turtlehead', commons: ['Snakehead', 'Balmony'] }
  ]);
  it('"snake plant" is the snake plant only', () => {
    expect(search(items, 'snake plant').map((x) => x.name)).toEqual(['Dracaena trifasciata']); // base: Chelone glabra second
  });
  it('a family typed whole still finds its species (guard)', () => {
    expect(search(items, 'plantaginaceae').map((x) => x.name)).toEqual(['Chelone glabra']);
  });
});

describe('--fill gbif-open: a species with no photograph is given GBIF\'s openly licensed ones', () => {
  const page = { results: [{ key: 77, license: 'http://creativecommons.org/licenses/by/4.0/legalcode', datasetKey: 'd', media: [{ type: 'StillImage', identifier: 'https://example.org/sprekelia.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A Grower', references: 'https://example.org/obs/77' }] }], endOfRecords: true, count: 1 };
  it('adds them, and records where they came from', async () => {
    const { fillOpenGbif } = await import('$dossier/open-gbif-fill');
    const d = { key: 2860360, photos: [], upstream: {} as Record<string, { status: string; at: string; detail?: string }> };
    const r = await fillOpenGbif(d as never, fixtureFetcher({ [`re:taxonKey=2860360&mediaType=StillImage&license=CC0_1_0`]: page }), () => '2026-10-11T00:00:00Z');
    expect(r).toEqual({ added: 1 });
    expect(d.photos).toHaveLength(1);
    expect(d.upstream['gbif.media']).toMatchObject({ status: 'ok' });
  });
  it('a dossier told there is none is passed by the next fill, so a stopped fill resumes (round sixty-eight, third part)', async () => {
    const { fillOpenGbif, askedOpen } = await import('$dossier/open-gbif-fill');
    const d = { key: 3, photos: [], upstream: {} as Record<string, { status: string; at: string; detail?: string }> };
    expect(askedOpen(d as never)).toBe(false);
    expect(await fillOpenGbif(d as never, fixtureFetcher({ 're:taxonKey=3&': { results: [], endOfRecords: true, count: 0 } }))).toEqual({ none: true });
    expect(askedOpen(d as never)).toBe(true);
    expect(askedOpen({ upstream: { 'gbif.media': { status: 'none', at: 'x' } } } as never)).toBe(false); // guard: a build's own "none" is asked again
  });
  it('a refusal leaves the dossier as it was (guard)', async () => {
    const { fillOpenGbif } = await import('$dossier/open-gbif-fill');
    const d = { key: 1, photos: [], upstream: { 'gbif.media': { status: 'none', at: 'x' } } };
    const r = await fillOpenGbif(d as never, fixtureFetcher({}, { status: 'refused', detail: 'api.gbif.org 429' }));
    expect(r).toEqual({ failed: 'api.gbif.org 429' });
    expect(d.upstream['gbif.media']).toEqual({ status: 'none', at: 'x' });
  });
});
