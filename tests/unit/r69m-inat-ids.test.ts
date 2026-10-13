/**
 * Round sixty-nine, triage-68 M5 (R46-13) and the dated carry of M8 (S-A6): six live dossiers asked iNaturalist for the
 * photographs of a taxon it has made inactive, and the previous build's identifiers were carried with no age. The
 * answers are iNaturalist's own for 133599, 119671 and 276548, read 2026-10-11. Each case FAILED on 1609c19 unless it
 * says "guard".
 */
import { describe, it, expect } from 'vitest';
import { checkIds, IDS_PER_ASK } from '$dossier/sources/inat';
import { buildDossier, CARRY_DAYS } from '$dossier/build';
import { fillInatIds } from '$dossier/corpus-fills';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { mwWait } from '$dossier/sources/wikimedia';
import { copiapoa } from '../../fixtures/upstream';

const INAT = 'https://api.inaturalist.org/v1';
/** iNaturalist's taxa, as /v1/taxa/<ids> gives them. */
const TAXA: Record<number, { id: number; name: string; rank: string; is_active: boolean; current_synonymous_taxon_ids: number[] | null }> = {
  133599: { id: 133599, name: 'Dypsis lutescens', rank: 'species', is_active: false, current_synonymous_taxon_ids: [276548] },
  119671: { id: 119671, name: 'Erythrina caffra', rank: 'species', is_active: false, current_synonymous_taxon_ids: [1588191] },
  276548: { id: 276548, name: 'Chrysalidocarpus lutescens', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  135254: { id: 135254, name: 'Copiapoa cinerea', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  700: { id: 700, name: 'Aus split', rank: 'species', is_active: false, current_synonymous_taxon_ids: [701, 702] },
  // Round seventy (triage-69 B1): a follow is taken only when the current taxon's name is the species' own or a same-type
  // name. These two stand in for an id iNaturalist replaced by another taxon of the same name.
  900: { id: 900, name: 'Copiapoa cinerea', rank: 'species', is_active: false, current_synonymous_taxon_ids: [135254] },
  901: { id: 901, name: 'Copiapoa cinerea', rank: 'species', is_active: false, current_synonymous_taxon_ids: [135254] }
};
function taxa(asked: string[] = []): JsonFetcher {
  return (async (url: string) => {
    asked.push(url);
    const ids = (/\/taxa\/([\d,]+)/.exec(url)?.[1] ?? '').split(',').map(Number);
    return { status: 'ok', data: { results: ids.flatMap((id) => (TAXA[id] ? [TAXA[id]] : [])) } };
  }) as unknown as JsonFetcher;
}
const opts = (fetcher: JsonFetcher, extra: Record<string, unknown> = {}) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-11T12:00:00Z'), ...extra });

describe('iNaturalist\'s word on an id', () => {
  it('an inactive id names its current taxon; an active one is active; an unknown one is inactive with no successor', async () => {
    const r = await checkIds(taxa(), [133599, 119671, 276548, 999999, 700]);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.get(133599)).toEqual({ active: false, name: 'Dypsis lutescens', current: 276548 });
    expect(r.data.get(119671)).toMatchObject({ active: false, current: 1588191 });
    expect(r.data.get(276548)).toMatchObject({ active: true });
    expect(r.data.get(999999)).toEqual({ active: false });
    expect(r.data.get(700)).toEqual({ active: false, name: 'Aus split' }); // two successors: none followed
  });
  it('is asked thirty ids at a time', async () => {
    const asked: string[] = [];
    await checkIds(taxa(asked), Array.from({ length: 61 }, (_, i) => i + 1));
    expect(asked.map((u) => u.split('/taxa/')[1].split(',').length)).toEqual([IDS_PER_ASK, IDS_PER_ASK, 1]);
  });
});

/** Copiapoa cinerea's fixture, with Wikidata giving another iNaturalist id. */
function copiapoaWith(inatId: number): Record<string, unknown> {
  const t = copiapoa() as Record<string, unknown>;
  t['https://www.wikidata.org/w/api.php?action=wbgetentities'] = { entities: { Q5168360: { claims: { P3151: [{ mainsnak: { datavalue: { value: String(inatId) } } }] }, sitelinks: { enwiki: { title: 'Copiapoa cinerea' } } } } };
  return t;
}

describe('the build checks the id Wikidata gives', () => {
  it('an inactive id is followed to its current taxon, whose photographs are asked for', async () => {
    const asked: string[] = [];
    // Round seventy: the follow is taken only to the species' own name; before, 133599 (Dypsis lutescens) to 276548.
    const base = fixtureFetcher(copiapoaWith(900), { status: 'ok', data: { results: [] } } as never);
    const ids = taxa();
    const f = (async (url: string) => { asked.push(url); return /\/taxa\/\d/.test(url) ? ids(url) : base(url); }) as unknown as JsonFetcher;
    const r = await buildDossier('Copiapoa cinerea', opts(f));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(135254); // base: 900, with no photographs
    expect(asked.some((u) => u.includes('observations?taxon_id=135254'))).toBe(true);
    expect(r.dossier.upstream['inat.taxon']).toMatchObject({ status: 'ok', detail: "iNaturalist's taxon 900 (Copiapoa cinerea) is inactive; followed to its current taxon 135254 (Copiapoa cinerea)" });
  });
  it('an inactive id with no single successor is dropped, and the name asked', async () => {
    const asked: string[] = [];
    const base = fixtureFetcher({ ...copiapoaWith(700), [`${INAT}/taxa?q=Copiapoa%20cinerea`]: { results: [{ id: 135254, name: 'Copiapoa cinerea', rank: 'species' }] } });
    const ids = taxa();
    const f = (async (url: string) => { asked.push(url); return /\/taxa\/\d/.test(url) ? ids(url) : base(url); }) as unknown as JsonFetcher;
    const r = await buildDossier('Copiapoa cinerea', opts(f));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(135254); // base: 700
    expect(r.dossier.upstream['inat.taxon'].detail).toMatch(/^iNaturalist's taxon 700 \(Aus split\) is inactive, with no single current taxon; asked by name/);
  });
  it('an active id is used as it is (guard)', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(copiapoa())));
    expect(r.ok && r.dossier.ids.inat).toBe(135254);
  });
});

describe('the previous build\'s identifiers carry the day they were read (M5, M8)', () => {
  const lagged = { error: { code: 'maxlag', info: 'Waiting for wdqs1011: 9.2 seconds lagged.' } };
  const table = () => {
    const t = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(t)) if (k.startsWith('https://www.wikidata.org/')) t[k] = lagged;
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    return t;
  };
  const prevIds = { gbif: 5384013, wikidata: 'Q5168360', inat: 135254, powo: 'urn:x', wikipedia: 'Copiapoa cinerea' };
  it('within the limit they are kept, and the record names their build', async () => {
    mwWait.tries = 1;
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table()), { prevIds, prevIdsOn: '2026-08-01' }));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids).toMatchObject({ wikidata: 'Q5168360', inat: 135254 });
    expect(r.dossier.upstream.wikidata.detail).toMatch(/; the identifiers of the build of 2026-08-01 are kept$/); // base: "the previous build's identifiers are kept"
  });
  it(`past ${CARRY_DAYS} days, or with no day known, they are not`, async () => {
    const old = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table()), { prevIds, prevIdsOn: '2026-07-01' }));
    if (!old.ok) throw new Error('no dossier');
    expect(old.dossier.ids.wikidata).toBeUndefined(); // base: carried
    expect(old.dossier.upstream.wikidata.detail).toMatch(/the previous identifiers are not kept: read by the build of 2026-07-01, more than 90 days ago$/);
    const unknown = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table()), { prevIds }));
    expect(unknown.ok && unknown.dossier.ids.wikidata).toBeUndefined();
  });
  it('a carried iNaturalist id is checked too', async () => {
    const base = fixtureFetcher(table());
    const ids = taxa();
    const f = (async (url: string) => (/\/taxa\/\d/.test(url) ? ids(url) : base(url))) as unknown as JsonFetcher;
    const r = await buildDossier('Copiapoa cinerea', opts(f, { prevIds: { ...prevIds, inat: 901 }, prevIdsOn: '2026-10-01' }));
    expect(r.ok && r.dossier.ids.inat).toBe(135254); // base: 901 (round seventy: 901 stands in for 119671, whose taxon is not Copiapoa's)
  });
});

describe('--fill inat-ids', () => {
  const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
  // Round seventy: the fill reads the species' name, and asks GBIF for its same-type names (none here).
  const dossier = (inat: number, key = 1, scientific = 'Copiapoa cinerea') => ({ key, name: { scientific }, ids: { gbif: key, inat }, links: { inat: `https://www.inaturalist.org/taxa/${inat}` }, photos: [], upstream: { 'inat.photos.wild': { status: 'ok', at: 'x' }, 'inat.photos.cultivated': { status: 'none', at: 'x' } } });
  const withGbif = (f: JsonFetcher): JsonFetcher => (async (url: string) => (url.startsWith('https://api.gbif.org/') ? { status: 'ok', data: /synonyms/.test(url) ? { results: [], endOfRecords: true } : { key: 1 } } : f(url))) as unknown as JsonFetcher;
  it('follows an inactive id, and opens the photograph sets for --fill inat', async () => {
    const docs: Record<string, unknown> = { '1.json': dossier(900), '2.json': dossier(276548, 2, 'Chrysalidocarpus lutescens'), '3.json': dossier(700, 3, 'Aus split') };
    const c = await fillInatIds(store(docs), withGbif(taxa()), () => '2026-10-12T00:00:00Z');
    expect(c).toMatchObject({ checked: 3, followed: 1, dropped: 1 });
    const one = docs['1.json'] as ReturnType<typeof dossier>;
    expect(one.ids.inat).toBe(135254);
    expect(one.links.inat).toBe('https://www.inaturalist.org/taxa/135254');
    expect(one.upstream['inat.photos.wild'].status).toBe('skipped');
    expect((docs['3.json'] as ReturnType<typeof dossier>).ids.inat).toBeUndefined();
    expect((docs['2.json'] as ReturnType<typeof dossier>).upstream['inat.photos.wild'].status).toBe('ok'); // guard: an active id is left alone
  });
});
