/**
 * Round sixty-eight, third part: the rebuild of the 52 species with no native range. Bisnaga glaucescens gained its range
 * (Kew's, under Ferocactus glaucescens) and lost its 25 photographs. Wikidata's item for it is Q310510, "Ferocactus
 * glaucescens", which carries the GBIF key of that older name (3959669), not the accepted one (11098779); the previous
 * build had kept the item's identifiers only because Wikidata had been lagged. This time Wikidata answered, by name, that
 * it had no "Bisnaga glaucescens"; the iNaturalist taxon id went with it, and iNaturalist's own search has no such name.
 * Each case FAILED on round sixty-eight's second part unless it says "guard".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { sameTypeNames, type SynonymRow } from '$dossier/sources/gbif';
import { crossIds, mwWait } from '$dossier/sources/wikimedia';
import { taxonByOlderNames } from '$dossier/sources/inat';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

afterEach(() => { mwWait.tries = 1; });

// GBIF's synonyms of Bisnaga glaucescens (11098779, basionym 3944752), as the API gave them on 2026-10-11, in part.
const bisnaga: SynonymRow[] = [
  { key: 3944752, name: 'Echinocactus glaucescens', rank: 'SPECIES' },
  { key: 3959669, name: 'Ferocactus glaucescens', rank: 'SPECIES', basionymKey: 3944752 },
  { key: 3946670, name: 'Parrycactus glaucescens', rank: 'SPECIES', basionymKey: 3944752 },
  { key: 5624242, name: 'Neoporteria mammillarioides', rank: 'SPECIES', basionymKey: 3942869 },
  { key: 3942869, name: 'Echinocactus mammillarioides', rank: 'SPECIES' },
  { key: 5623854, name: 'Neoporteria subgibbosa mammillarioides', rank: 'VARIETY', basionymKey: 3942869 }
];

describe('the older names with the same type', () => {
  it('are the basionym and the names published on it', () => {
    expect(sameTypeNames({ key: 11098779, basionymKey: 3944752 }, bisnaga).map((r) => r.name)).toEqual(['Echinocactus glaucescens', 'Ferocactus glaucescens', 'Parrycactus glaucescens']);
  });
  it('a name lumped in on another type, or below species, is not one (guard)', () => {
    const names = sameTypeNames({ key: 11098779, basionymKey: 3944752 }, bisnaga).map((r) => r.name);
    expect(names).not.toContain('Neoporteria mammillarioides');
    expect(names).not.toContain('Neoporteria subgibbosa mammillarioides');
  });
  it('a species that is its own basionym has the names moved from it', () => {
    expect(sameTypeNames({ key: 3944752 }, [{ key: 1, name: 'Ferocactus glaucescens', basionymKey: 3944752 }, { key: 2, name: 'X y' }]).map((r) => r.name)).toEqual(['Ferocactus glaucescens']);
  });
});

const W = 'https://www.wikidata.org/w/api.php';
function wikidata(orHits: string[], p846 = '3959669'): JsonFetcher {
  return fixtureFetcher({
    [`re:srsearch=haswbstatement%3AP846%3D11098779`]: { query: { search: [] } },
    [`re:srsearch=haswbstatement%3AP846%3D3944752%7CP846%3D3959669`]: { query: { search: orHits.map((title) => ({ title })) } },
    [`${W}?action=wbsearchentities`]: { search: [{ id: 'Q999', label: 'Bisnaga hamatacantha' }] },
    [`${W}?action=wbgetentities`]: { entities: { Q310510: { claims: { P846: [{ mainsnak: { datavalue: { value: p846 } } }], P3151: [{ mainsnak: { datavalue: { value: '274273' } } }] }, sitelinks: { enwiki: { title: 'Ferocactus glaucescens' } } } } }
  });
}

describe('Wikidata\'s item filed under an older name with the same type', () => {
  it('is found by that name\'s GBIF record, in one search', async () => {
    const r = await crossIds(wikidata(['Q310510']), 'Bisnaga glaucescens', 11098779, [3944752, 3959669]);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q310510', inat: 274273, enTitle: 'Ferocactus glaucescens' }, detail: 'found by the GBIF record of an older name with the same type' }); // base: none
  });
  it('two items answering is no answer (guard)', async () => {
    expect((await crossIds(wikidata(['Q310510', 'Q5000']), 'Bisnaga glaucescens', 11098779, [3944752, 3959669])).status).toBe('none');
  });
  it('an item carrying some other GBIF key is not taken (guard)', async () => {
    expect((await crossIds(wikidata(['Q310510'], '42'), 'Bisnaga glaucescens', 11098779, [3944752, 3959669])).status).toBe('none');
  });
  it('without older names nothing more is asked (guard)', async () => {
    expect((await crossIds(wikidata(['Q310510']), 'Bisnaga glaucescens', 11098779)).status).toBe('none');
  });
});

describe('iNaturalist\'s taxon under an older name with the same type', () => {
  const inat = (table: Record<string, unknown>) => fixtureFetcher(table, { status: 'ok', data: { results: [] } } as never);
  it('is taken when the names that find a taxon all find the one', async () => {
    const r = await taxonByOlderNames(inat({ 're:q=Ferocactus%20glaucescens': { results: [{ id: 274273, name: 'Ferocactus glaucescens', rank: 'species' }] } }), ['Echinocactus glaucescens', 'Ferocactus glaucescens']);
    expect(r).toMatchObject({ status: 'ok', data: { id: 274273 }, detail: 'found under Ferocactus glaucescens, an older name with the same type' });
  });
  it('two taxa is no answer, and a refusal is the answer (guard)', async () => {
    const two = inat({ 're:q=Ferocactus%20glaucescens': { results: [{ id: 1, name: 'Ferocactus glaucescens', rank: 'species' }] }, 're:q=Echinocactus%20glaucescens': { results: [{ id: 2, name: 'Echinocactus glaucescens', rank: 'species' }] } });
    expect((await taxonByOlderNames(two, ['Echinocactus glaucescens', 'Ferocactus glaucescens'])).status).toBe('none');
    expect(await taxonByOlderNames(fixtureFetcher({}, { status: 'refused', detail: 'api.inaturalist.org 429' }), ['Ferocactus glaucescens'])).toEqual({ status: 'refused', detail: 'api.inaturalist.org 429' });
  });
});

describe('the build: a species Wikidata files under its basionym keeps its photographs', () => {
  it('the item is found, and with it iNaturalist\'s taxon and photographs', async () => {
    const key = 5384013;
    const over: Record<string, unknown> = {
      [`https://api.gbif.org/v1/species/${key}/synonyms`]: { results: [{ key: 111, scientificName: 'Echinocactus cinereus Phil.', canonicalName: 'Echinocactus cinereus', rank: 'SPECIES' }] },
      [`re:srsearch=haswbstatement%3AP846%3D111`]: { query: { search: [{ title: 'Q5168360' }] } },
      [`re:srsearch=haswbstatement%3AP846%3D${key}`]: { query: { search: [] } },
      [`${W}?action=wbsearchentities`]: { search: [] },
      [`${W}?action=wbgetentities`]: { entities: { Q5168360: { claims: { P846: [{ mainsnak: { datavalue: { value: '111' } } }], P3151: [{ mainsnak: { datavalue: { value: '135254' } } }] }, sitelinks: { enwiki: { title: 'Copiapoa cinerea' } } } } }
    };
    const base = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(over)) delete base[k];
    delete base[`${W}?action=query&format=json&list=search`];
    const sp = base[`https://api.gbif.org/v1/species/${key}`] as Record<string, unknown>;
    base[`https://api.gbif.org/v1/species/${key}`] = { ...sp, basionymKey: 111 };
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher({ ...over, ...base }), builtBy: 'node', now: () => new Date('2026-10-11T12:00:00Z') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.ids).toMatchObject({ wikidata: 'Q5168360', inat: 135254 }); // base: no item, no taxon
    expect(r.dossier.photos.length).toBeGreaterThan(0); // base: none
    expect(r.dossier.upstream.wikidata).toMatchObject({ status: 'ok', detail: 'found by the GBIF record of an older name with the same type' });
  });
});
