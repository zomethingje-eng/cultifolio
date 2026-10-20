/**
 * Round seventy-nine (K): the builder of a page without a GBIF key (`build-kew.ts`), on recorded answers. The page is
 * built from Kew's file, its Wikidata item by Kew's IPNI or POWO identifier, its iNaturalist taxon by Kew's names, and
 * GBIF is never asked, not even to match its name; every GBIF row says why it was not asked. FAILED on r79base: there was
 * no such builder (`build-kew.ts` did not exist, and `kewItemUrl` neither).
 */
import { describe, it, expect } from 'vitest';
import type { FetchResult, JsonFetcher } from '../../src/lib/dossier/fetch';
import { buildKewDossier, kewInatTaxon, kewOwnNames, kewItem, type KewSpecies } from '../../src/lib/dossier/build-kew';
import { kewItemUrl, entityUrl, summaryUrl, kewItemsQuery, batchSources } from '../../src/lib/dossier/batch';
import { NO_GBIF_WHY, NO_GBIF_CLIMATE } from '../../src/lib/core/no-gbif';
import { INAT } from '../../src/lib/dossier/sources/inat';

/** Mexican cypress as Kew's file of 2026-06-04 holds it (two of its range rows, two of its synonyms). */
const cypress: KewSpecies = {
  id: '457911',
  name: 'Hesperocyparis lusitanica',
  authors: '(Mill.) Bartel',
  family: 'Cupressaceae',
  genus: 'Hesperocyparis',
  ipni: '60451554-2',
  powo: '60451554-2',
  synonyms: [
    { name: 'Cupressus lusitanica', authors: 'Mill.', status: 'Synonym', rank: 'Species', homotypic: true },
    { name: 'Cupressus lindleyi', authors: 'Klotzsch ex Endl.', status: 'Synonym', rank: 'Species' },
    { name: 'Cupressus lusitanica var. tristis', authors: '(Endl.) Carrière', status: 'Synonym', rank: 'Variety' }
  ],
  range: [
    { locationId: 'TDWG:MXC', locality: 'Mexico Central', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' },
    { locationId: 'TDWG:KEN', locality: 'Kenya', establishmentMeans: 'INTRODUCED', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }
  ] as KewSpecies['range'],
  file: '2026-06-04'
};

const sparql = (pairs: Array<[string, string]>) => ({ head: { vars: ['v', 'u', 'item'] }, results: { bindings: pairs.map(([v, q]) => ({ v: { type: 'literal', value: v }, u: { type: 'literal', value: `urn:lsid:ipni.org:names:${v}` }, item: { type: 'uri', value: `http://www.wikidata.org/entity/${q}` } })) } });
const entity = (q: string, claims: Record<string, unknown[]>, title?: string) => ({ entities: { [q]: { id: q, claims: Object.fromEntries(Object.entries(claims).map(([p, vs]) => [p, vs.map((v) => ({ mainsnak: { datavalue: { value: v } } }))])), ...(title ? { sitelinks: { enwiki: { title } } } : {}) } } });

/** A fetcher of recorded answers that records every address asked; an address not recorded is refused. */
function recorded(table: Record<string, unknown>): JsonFetcher & { asked: string[] } {
  const asked: string[] = [];
  const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    for (const [k, v] of Object.entries(table)) if (url === k || (k.startsWith('re:') && new RegExp(k.slice(3)).test(url))) return v === null ? { status: 'none' } : { status: 'ok', data: v as T };
    return { status: 'refused', detail: `not recorded: ${url}` };
  }) as JsonFetcher & { asked: string[] };
  f.asked = asked;
  return f;
}

const answers = (over: Record<string, unknown> = {}) => ({
  [kewItemUrl({ ipni: cypress.ipni, powo: cypress.powo })]: sparql([['60451554-2', 'Q50843040']]),
  // The item carries a GBIF key, GBIF's synonym Cupressus lusitanica: it is not read.
  [entityUrl('Q50843040')]: entity('Q50843040', { P31: [{ id: 'Q16521' }], P225: ['Hesperocyparis lusitanica'], P3151: ['1515661'], P846: ['2684069'], P7715: ['wfo-0000912972'] }, 'Hesperocyparis lusitanica'),
  [summaryUrl('Hesperocyparis lusitanica')]: { type: 'standard', title: 'Hesperocyparis lusitanica', extract: 'Hesperocyparis lusitanica, the Mexican cypress, is a species of conifer.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Hesperocyparis_lusitanica' } } },
  [`${INAT}/taxa/1515661`]: { results: [{ id: 1515661, name: 'Hesperocyparis lusitanica', rank: 'species', is_active: true }] },
  [`re:^${INAT.replace(/\./g, '\\.')}/observations\\?`]: { results: [] },
  're:^https://commons\\.wikimedia\\.org/': null,
  ...over
});

describe('a page without a GBIF key, built from Kew\'s file', () => {
  it('asks GBIF nothing, takes the item Kew\'s identifier finds, and reads no GBIF key from it', async () => {
    const f = recorded(answers());
    const r = await buildKewDossier(cypress, { fetcher: f, builtBy: 'node', now: () => new Date('2026-10-20T00:00:00Z') });
    expect(r.ok).toBe(true);
    const d = (r as { ok: true; dossier: import('../../src/lib/dossier/schema').Dossier }).dossier;
    expect(f.asked.filter((u) => u.includes('gbif.org'))).toEqual([]);
    expect(d.key).toBe('k457911');
    expect(d.slug).toBe('hesperocyparis-lusitanica');
    expect(d.ids).toEqual({ ipni: '60451554-2', powo: 'urn:lsid:ipni.org:names:60451554-2', wikidata: 'Q50843040', wfo: 'wfo-0000912972', inat: 1515661, wikipedia: 'Hesperocyparis lusitanica' });
    expect(d.links.gbif).toBeUndefined();
    expect(d.links.powo).toBe('https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:60451554-2');
    expect(d.name).toMatchObject({ scientific: 'Hesperocyparis lusitanica', authorship: '(Mill.) Bartel', status: 'accepted', family: 'Cupressaceae', vernacular: [], synonyms: ['Cupressus lusitanica Mill.', 'Cupressus lindleyi Klotzsch ex Endl.', 'Cupressus lusitanica var. tristis (Endl.) Carrière'] });
    expect(d.name.kew).toEqual({ entry: '457911', synonyms: ['Cupressus lindleyi', 'Cupressus lusitanica'], acceptedElsewhere: [], file: '2026-06-04' });
    expect(d.summary?.title).toBe('Hesperocyparis lusitanica');
  });
  it('reads the range by the rule of every page, and says GBIF\'s records and the climate were not checked, with why', async () => {
    const r = await buildKewDossier(cypress, { fetcher: recorded(answers()), builtBy: 'node' });
    const d = (r as { ok: true; dossier: import('../../src/lib/dossier/schema').Dossier }).dossier;
    expect(d.distribution.native.map((x) => x.code)).toEqual(['MXC']);
    expect(d.distribution.introduced.map((x) => x.code)).toEqual(['KEN']);
    expect(d.distribution.verified).toBe(true);
    expect(d.distribution.via).toEqual({ kind: 'own', entry: 'Hesperocyparis lusitanica (Mill.) Bartel', name: 'Hesperocyparis lusitanica', file: '2026-06-04' });
    expect(d.distribution.source).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04");
    expect(d.upstream['wcvp.distribution']).toMatchObject({ status: 'ok', asOf: '2026-06-04' });
    for (const k of ['gbif.species', 'gbif.synonyms', 'gbif.vernacular', 'gbif.occurrences', 'gbif.media']) expect(d.upstream[k]).toMatchObject({ status: 'skipped', detail: NO_GBIF_WHY });
    expect(d.climate).toEqual({ status: 'pending', detail: NO_GBIF_CLIMATE });
    expect(d.upstream.climate).toMatchObject({ status: 'skipped', detail: NO_GBIF_CLIMATE });
    expect(d.occurrences).toMatchObject({ open: [], nOpenInRange: 0, nRestrictedInRange: 0, rangeTested: false, thin: true, datasets: [] });
    expect(d.upstream.openalex.status).toBe('skipped');
  });
  it('takes no item where two carry Kew\'s identifier, and says so', async () => {
    const f = recorded(answers({ [kewItemUrl({ ipni: cypress.ipni, powo: cypress.powo })]: sparql([['60451554-2', 'Q1'], ['60451554-2', 'Q2']]) }));
    const r = await buildKewDossier(cypress, { fetcher: f, builtBy: 'node', skip: ['inat'] });
    const d = (r as { ok: true; dossier: import('../../src/lib/dossier/schema').Dossier }).dossier;
    expect(d.upstream.wikidata).toMatchObject({ status: 'ambiguous', detail: "not taken: two items carry Kew's IPNI identifier 60451554-2, POWO 60451554-2 (Q1, Q2)" });
    expect(d.ids.wikidata).toBeUndefined();
  });
  it('says Wikidata not checked when its query service does not answer, never none', async () => {
    const g = recorded(Object.fromEntries(Object.entries(answers()).filter(([k]) => !k.startsWith('https://query.wikidata.org'))));
    const r = await buildKewDossier(cypress, { fetcher: g, builtBy: 'node', skip: ['inat'] });
    const d = (r as { ok: true; dossier: import('../../src/lib/dossier/schema').Dossier }).dossier;
    expect(d.upstream.wikidata.status).toBe('refused');
    expect(d.ids.wikidata).toBeUndefined();
  });
  it('takes iNaturalist\'s taxon only by one of the species\' own names or Kew\'s, and never one another page holds', async () => {
    const own = kewOwnNames(cypress);
    // Filed by iNaturalist under Kew's synonym: one of Kew's names for it, so taken.
    const bySyn = recorded({ [`re:^${INAT.replace(/\./g, '\\.')}/taxa\\?q=`]: { results: [{ id: 7, name: 'Cupressus lusitanica', rank: 'species', matched_term: 'Hesperocyparis lusitanica' }] } });
    expect(await kewInatTaxon(bySyn, { scientific: 'Hesperocyparis lusitanica', own })).toMatchObject({ status: 'ok', data: { id: 7, name: 'Cupressus lusitanica' } });
    // Filed under a name that is neither: not taken, said, and nothing is asked of GBIF to judge it.
    const other = recorded({ [`re:^${INAT.replace(/\./g, '\\.')}/taxa\\?q=`]: { results: [{ id: 8, name: 'Cupressus benthamii', rank: 'species', matched_term: 'Hesperocyparis lusitanica' }] } });
    expect(await kewInatTaxon(other, { scientific: 'Hesperocyparis lusitanica', own })).toEqual({ status: 'none', detail: "not taken: iNaturalist files Hesperocyparis lusitanica as Cupressus benthamii, which is neither this species' name nor one of Kew's names for it" });
    expect(other.asked.some((u) => u.includes('gbif.org'))).toBe(false);
    // The item's id of another name is followed by the name search, and refused when that finds none of its own.
    const idOther = recorded({ [`${INAT}/taxa/9`]: { results: [{ id: 9, name: 'Cupressus arizonica', rank: 'species', is_active: true }] }, [`re:^${INAT.replace(/\./g, '\\.')}/taxa\\?q=`]: { results: [] } });
    const t = await kewInatTaxon(idOther, { scientific: 'Hesperocyparis lusitanica', own, id: 9 });
    expect(t.status).toBe('none');
    expect(t.detail).toContain("iNaturalist's taxon 9 (Cupressus arizonica) is not one of this species' names; asked by name");
    // A name another page of the reference holds is never taken, even one of Kew's names for it.
    const held = (n: string) => n.toLowerCase() === 'cupressus lusitanica';
    expect((await kewInatTaxon(bySyn, { scientific: 'Hesperocyparis lusitanica', own: kewOwnNames(cypress, held), heldElsewhere: held })).status).toBe('none');
  });
});

describe('the batches, for species without a GBIF key', () => {
  it('ask Wikidata by Kew\'s identifiers, hold the builder\'s own question, and never send the name to GBIF\'s match', async () => {
    const net = recorded({
      're:^https://query\\.wikidata\\.org/sparql': sparql([['60451554-2', 'Q50843040'], ['148218-1', 'Q10958064']]),
      're:^https://www\\.wikidata\\.org/w/api\\.php\\?action=wbgetentities': { entities: { Q50843040: entity('Q50843040', { P31: [{ id: 'Q16521' }] }, 'Hesperocyparis lusitanica').entities.Q50843040, Q10958064: entity('Q10958064', { P31: [{ id: 'Q16521' }] }).entities.Q10958064 } },
      're:^https://en\\.wikipedia\\.org/w/api\\.php': { query: { pages: [{ title: 'Hesperocyparis lusitanica', extract: 'A conifer.' }, { title: 'Abelia parvifolia', missing: true }] } }
    });
    const b = batchSources(net, { wikidata: true, wikipedia: true });
    await b.prefetch([{ name: 'Hesperocyparis lusitanica', kew: { ipni: '60451554-2', powo: '60451554-2' } }, { name: 'Abelia parvifolia', kew: { ipni: '148218-1', powo: '148218-1' } }]);
    expect(net.asked.some((u) => u.includes('api.gbif.org'))).toBe(false);
    expect(net.asked.filter((u) => u.startsWith('https://query.wikidata.org/sparql')).length).toBe(1);
    expect(b.stats.kewSparql).toBe(1);
    // Each species' answer is held under the exact address the builder asks, its own bindings only.
    const held = b.heldAt(kewItemUrl({ ipni: '148218-1', powo: '148218-1' })) as { status: string; data: { results: { bindings: unknown[] } } };
    expect(held.status).toBe('ok');
    expect(held.data.results.bindings.length).toBe(1);
    const x = await kewItem(b.fetcher, { ipni: '60451554-2', powo: '60451554-2' });
    expect(x).toMatchObject({ status: 'ok', data: { wikidata: 'Q50843040', enTitle: 'Hesperocyparis lusitanica' } });
    // Read from what the batch held: nothing more was asked of Wikidata.
    expect(net.asked.filter((u) => u.includes('wikidata.org')).length).toBe(2);
  });
  it('quote nothing but Kew\'s identifiers, and leave a side Kew does not give matching no statement', () => {
    const q = kewItemsQuery([{ ipni: '1-1' }, { powo: '2-1' }, { ipni: '3-1"; DROP' }]);
    expect(q).toContain('("1-1" "-")');
    expect(q).toContain('("-" "urn:lsid:ipni.org:names:2-1")');
    expect(q).toContain('("-" "-")');
    expect(q).not.toContain('UNDEF');
    expect(q).not.toContain('DROP');
  });
});
