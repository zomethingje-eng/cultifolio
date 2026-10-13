/**
 * Round sixty-nine, triage-68 M3, M4, M6, M7 and M8: which record of another source is this species'. Live shapes: GBIF's
 * 65 synonyms of Portulaca oleracea (3084719, read 2026-10-11), iNaturalist's answer for "Rebutia pulchra", and the
 * Wikipedia redirects R46-12 found. Each case FAILED on 1609c19 unless it says "guard".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { synonyms, SYNONYM_PAGE } from '$dossier/sources/gbif';
import { summary, crossIds, mwWait, summaryTitleFits } from '$dossier/sources/wikimedia';
import { taxon, taxonByOlderNames, PLANTAE } from '$dossier/sources/inat';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

afterEach(() => { mwWait.tries = 1; });
const GBIF = 'https://api.gbif.org/v1';
const W = 'https://www.wikidata.org/w/api.php';
const WP = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-11T12:00:00Z') });

/** GBIF's synonyms of Portulaca oleracea: key, scientific name, canonical name, rank, status. */
const PORTULACA: Array<[number, string, string, string, string]> = [
  [4022330, "Portulaca aurea DC.", "Portulaca aurea", "SPECIES", "SYNONYM"],
  [4022070, "Portulaca consanguinea Schltdl.", "Portulaca consanguinea", "SPECIES", "SYNONYM"],
  [4021966, "Portulaca cryptopetala var. poellnitziana (D.Legrand) D.Legrand", "Portulaca cryptopetala poellnitziana", "VARIETY", "SYNONYM"],
  [4021878, "Portulaca dichotoma Gueldenst.", "Portulaca dichotoma", "SPECIES", "SYNONYM"],
  [4023423, "Portulaca fosbergii Poelln.", "Portulaca fosbergii", "SPECIES", "SYNONYM"],
  [9473875, "Portulaca fosbergii var. fosbergii", "Portulaca fosbergii fosbergii", "VARIETY", "SYNONYM"],
  [7496395, "Portulaca fosbergii var. major Poelln.", "Portulaca fosbergii major", "VARIETY", "SYNONYM"],
  [4023152, "Portulaca hortensis Rupr.", "Portulaca hortensis", "SPECIES", "SYNONYM"],
  [8494347, "Portulaca intermedia Link", "Portulaca intermedia", "SPECIES", "HOMOTYPIC_SYNONYM"],
  [7647672, "Portulaca intermedia Link ex Schltdl.", "Portulaca intermedia", "SPECIES", "SYNONYM"],
  [4023011, "Portulaca laevis Buch.-Ham.", "Portulaca laevis", "SPECIES", "SYNONYM"],
  [4022960, "Portulaca latifolia Hornem.", "Portulaca latifolia", "SPECIES", "SYNONYM"],
  [4022887, "Portulaca marginata Kunth", "Portulaca marginata", "SPECIES", "SYNONYM"],
  [4022881, "Portulaca maritima S.G.Gmel.", "Portulaca maritima", "SPECIES", "SYNONYM"],
  [3084727, "Portulaca neglecta Mack. & Bush", "Portulaca neglecta", "SPECIES", "SYNONYM"],
  [4022576, "Portulaca officinarum Crantz", "Portulaca officinarum", "SPECIES", "SYNONYM"],
  [7731600, "Portulaca oleracea f. alba Alef.", "Portulaca oleracea alba", "FORM", "SYNONYM"],
  [7720935, "Portulaca oleracea f. aurantia Alef.", "Portulaca oleracea aurantia", "FORM", "SYNONYM"],
  [7686345, "Portulaca oleracea f. aurea Alef.", "Portulaca oleracea aurea", "FORM", "SYNONYM"],
  [8283829, "Portulaca oleracea f. caryophyllina Alef.", "Portulaca oleracea caryophyllina", "FORM", "SYNONYM"],
  [7530455, "Portulaca oleracea f. gillesii Alef.", "Portulaca oleracea gillesii", "FORM", "SYNONYM"],
  [8331854, "Portulaca oleracea f. haageana Alef.", "Portulaca oleracea haageana", "FORM", "SYNONYM"],
  [7502929, "Portulaca oleracea f. parvifolia (Haw.) Alef.", "Portulaca oleracea parvifolia", "FORM", "SYNONYM"],
  [8130634, "Portulaca oleracea f. rosea Alef.", "Portulaca oleracea rosea", "FORM", "SYNONYM"],
  [8295038, "Portulaca oleracea f. sativa (DC.) Alef.", "Portulaca oleracea sativa", "FORM", "SYNONYM"],
  [8236344, "Portulaca oleracea f. striata Alef.", "Portulaca oleracea striata", "FORM", "SYNONYM"],
  [7777206, "Portulaca oleracea f. sulfurea Alef.", "Portulaca oleracea sulfurea", "FORM", "SYNONYM"],
  [7380430, "Portulaca oleracea f. violacea Alef.", "Portulaca oleracea violacea", "FORM", "SYNONYM"],
  [3084724, "Portulaca oleracea subsp. stellata Danin & H.G.Baker", "Portulaca oleracea stellata", "SUBSPECIES", "SYNONYM"],
  [9355921, "Portulaca oleracea subsp. sylvestris (DC.) Celak.", "Portulaca oleracea sylvestris", "SUBSPECIES", "SYNONYM"],
  [8324748, "Portulaca oleracea subsp. sylvestris Thell.", "Portulaca oleracea sylvestris", "SUBSPECIES", "SYNONYM"],
  [9719673, "Portulaca oleracea var. apiculata Goffinet", "Portulaca oleracea apiculata", "VARIETY", "SYNONYM"],
  [4022553, "Portulaca oleracea var. delicatula Fosberg", "Portulaca oleracea delicatula", "VARIETY", "SYNONYM"],
  [9783640, "Portulaca oleracea var. emarginata Goffinet", "Portulaca oleracea emarginata", "VARIETY", "SYNONYM"],
  [9411140, "Portulaca oleracea var. exigua Guill.", "Portulaca oleracea exigua", "VARIETY", "SYNONYM"],
  [4022547, "Portulaca oleracea var. gracilescens Domin", "Portulaca oleracea gracilescens", "VARIETY", "SYNONYM"],
  [4022529, "Portulaca oleracea var. linearifolia Sivar. & Manilal", "Portulaca oleracea linearifolia", "VARIETY", "SYNONYM"],
  [4022526, "Portulaca oleracea var. macrantha Speg.", "Portulaca oleracea macrantha", "VARIETY", "SYNONYM"],
  [7851431, "Portulaca oleracea var. micrantha Eggers", "Portulaca oleracea micrantha", "VARIETY", "SYNONYM"],
  [4022523, "Portulaca oleracea var. micrantha Speg.", "Portulaca oleracea micrantha", "VARIETY", "SYNONYM"],
  [8200020, "Portulaca oleracea var. opposita Poelln.", "Portulaca oleracea opposita", "VARIETY", "SYNONYM"],
  [9707770, "Portulaca oleracea var. parviflora", "Portulaca oleracea parviflora", "VARIETY", "SYNONYM"],
  [7458587, "Portulaca oleracea var. parvifolia (Haw.) Griseb.", "Portulaca oleracea parvifolia", "VARIETY", "SYNONYM"],
  [9700450, "Portulaca oleracea var. sylvestris DC.", "Portulaca oleracea sylvestris", "VARIETY", "SYNONYM"],
  [12344824, "Portulaca oleracea var. violacea Alef.", "Portulaca oleracea violacea", "VARIETY", "SYNONYM"],
  [4022493, "Portulaca olitoria Pall.", "Portulaca olitoria", "SPECIES", "SYNONYM"],
  [4022479, "Portulaca opposita (Poelln.) Poelln.", "Portulaca opposita", "SPECIES", "SYNONYM"],
  [4022459, "Portulaca papillosa Sennen", "Portulaca papillosa", "SPECIES", "SYNONYM"],
  [4022418, "Portulaca parviflora Griseb.", "Portulaca parviflora", "SPECIES", "SYNONYM"],
  [4022411, "Portulaca parvifolia Haw.", "Portulaca parvifolia", "SPECIES", "SYNONYM"],
  [9751362, "Portulaca pilosa f. marginata (Kunth) Hassl.", "Portulaca pilosa marginata", "FORM", "SYNONYM"],
  [4022262, "Portulaca pilosa var. marginata (Kunth) Kuntze", "Portulaca pilosa marginata", "VARIETY", "SYNONYM"],
  [7923495, "Portulaca poellnitziana D.Legrand", "Portulaca poellnitziana", "SPECIES", "HETEROTYPIC_SYNONYM"],
  [4022019, "Portulaca repens Noronha", "Portulaca repens", "SPECIES", "HETEROTYPIC_SYNONYM"],
  [3084723, "Portulaca retusa Engelm.", "Portulaca retusa", "SPECIES", "SYNONYM"],
  [4021993, "Portulaca rostellata Brign.", "Portulaca rostellata", "SPECIES", "SYNONYM"],
  [4023571, "Portulaca stellata (Danin & H.G.Baker) Danin", "Portulaca stellata", "SPECIES", "SYNONYM"],
  [7812372, "Portulaca stellata (Danin & H.G.Baker) Ricceri & Arrigoni", "Portulaca stellata", "SPECIES", "SYNONYM"],
  [7805619, "Portulaca suffruticosa Thwaites", "Portulaca suffruticosa", "SPECIES", "HETEROTYPIC_SYNONYM"],
  [8386720, "Portulaca sylvestris Bubani, 1901", "Portulaca sylvestris", "SPECIES", "SYNONYM"],
  [4023492, "Portulaca sylvestris Garsault", "Portulaca sylvestris", "SPECIES", "SYNONYM"],
  [7766534, "Portulaca sylvestris Montandon", "Portulaca sylvestris", "SPECIES", "SYNONYM"],
  [4023461, "Portulaca terraereginae Poelln.", "Portulaca terraereginae", "SPECIES", "SYNONYM"],
  [4023431, "Portulaca trianthemoides Bremek.", "Portulaca trianthemoides", "SPECIES", "SYNONYM"],
  [4023325, "Portulaca viridis DC.", "Portulaca viridis", "SPECIES", "SYNONYM"]
];
/** GBIF's synonyms endpoint over a list, by its limit and offset, as GBIF pages it. */
function paged(list: unknown[], asked: string[] = []): JsonFetcher {
  return (async (url: string) => {
    asked.push(url);
    const o = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0), l = Number(/limit=(\d+)/.exec(url)?.[1] ?? 20);
    return { status: 'ok', data: { offset: o, limit: l, results: list.slice(o, o + l), endOfRecords: o + l >= list.length } };
  }) as unknown as JsonFetcher;
}
const portulaca = PORTULACA.map(([key, scientificName, canonicalName, rank, taxonomicStatus]) => ({ key, scientificName, canonicalName, rank, taxonomicStatus }));

describe('GBIF\'s synonyms are read to the end of the list (M4)', () => {
  it('Portulaca oleracea\'s 65, with P. retusa and P. terraereginae past the fiftieth', async () => {
    const r = await synonyms(paged(portulaca), 3084719);
    expect(r.status === 'ok' && r.data.length).toBe(65); // base: 50
    expect(r.status === 'ok' && r.rows!.map((x) => x.name)).toEqual(expect.arrayContaining(['Portulaca retusa', 'Portulaca terraereginae']));
    expect(r.truncated).toBeUndefined();
  });
  it('past the pages asked, the rows read are kept and the list is marked truncated', async () => {
    const asked: string[] = [];
    const big = Array.from({ length: SYNONYM_PAGE * 12 }, (_, i) => ({ key: i + 1, scientificName: `Aus b${i} L.`, canonicalName: `Aus b${i}`, rank: 'SPECIES' }));
    const r = await synonyms(paged(big, asked), 1);
    expect(r).toMatchObject({ status: 'ok', truncated: SYNONYM_PAGE * 10 }); // base: 50, unmarked
    expect(asked).toHaveLength(10);
  });
  it('a page refused after the first is a refusal, never a shorter list (guard)', async () => {
    const big = Array.from({ length: 150 }, (_, i) => ({ key: i + 1, scientificName: `Aus b${i}`, canonicalName: `Aus b${i}` }));
    const ok = paged(big);
    const f = (async (url: string) => (/offset=100/.test(url) ? { status: 'refused', detail: 'api.gbif.org 429' } : ok(url))) as unknown as JsonFetcher;
    expect(await synonyms(f, 1)).toEqual({ status: 'refused', detail: 'api.gbif.org 429' });
  });
  it('the build records a truncated list, and says the older names were not asked', async () => {
    const big = Array.from({ length: SYNONYM_PAGE * 12 }, (_, i) => ({ key: i + 1, scientificName: `Echinocactus b${i} Phil.`, canonicalName: `Echinocactus b${i}`, rank: 'SPECIES' }));
    const table = copiapoa() as Record<string, unknown>;
    delete table[`${GBIF}/species/5384013/synonyms`];
    for (const k of Object.keys(table)) if (k.startsWith(W)) delete table[k];
    table[`re:list=search&srlimit=2`] = { query: { search: [] } };
    table[`${W}?action=wbsearchentities`] = { search: [] };
    table['re:datasetKey=f382f0ce'] = { results: [] }; // round seventy: Kew's IPNI asked of GBIF's copy of WCVP when no item is found; none
    const base = fixtureFetcher(table);
    const syn = paged(big);
    const r = await buildDossier('Copiapoa cinerea', opts((async (url: string) => (url.includes('/synonyms') ? syn(url) : base(url))) as unknown as JsonFetcher));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream['gbif.synonyms'].detail).toBe('truncated: the first 1000 rows only');
    expect(r.dossier.upstream.wikidata).toMatchObject({ status: 'none', detail: 'older names not asked: GBIF synonyms truncated at 1000 rows' });
  });
  it('a refused list says the older names were not asked, not "nothing to report" (M8)', async () => {
    const table = copiapoa() as Record<string, unknown>;
    table[`${GBIF}/species/5384013/synonyms`] = { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' };
    for (const k of Object.keys(table)) if (k.startsWith(W)) delete table[k];
    table[`re:list=search&srlimit=2`] = { query: { search: [] } };
    table[`${W}?action=wbsearchentities`] = { search: [] };
    table['re:datasetKey=f382f0ce'] = { results: [] }; // round seventy: Kew's IPNI asked of GBIF's copy of WCVP when no item is found; none
    table['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table)));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream.wikidata).toEqual({ status: 'none', at: '2026-10-11T12:00:00.000Z', detail: 'older names not asked: GBIF synonyms refused' }); // base: none, no reason
    expect(r.dossier.upstream['inat.taxon']).toMatchObject({ status: 'none', detail: 'older names not asked: GBIF synonyms refused' });
  });
});

describe('a Wikipedia redirect to another title is not this species\' summary (M3)', () => {
  const redirect = (asked: string, to: string) => fixtureFetcher({ [`${WP}${asked.replace(/ /g, '_')}`]: { type: 'standard', title: to, extract: `${to} is a species of cactus.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${to.replace(/ /g, '_')}` } } } });
  it('Weingartia pulchra, asked by name, is not given Weingartia canigueralii\'s article', async () => {
    expect(await summary(redirect('Weingartia pulchra', 'Weingartia canigueralii'), 'Weingartia pulchra', ['Weingartia pulchra', 'Rebutia pulchra'])).toEqual({ status: 'none', detail: 'Wikipedia redirects Weingartia pulchra to Weingartia canigueralii' }); // base: ok
  });
  it('Kopsia fruticosa is not given the genus\'s', async () => {
    expect((await summary(redirect('Kopsia fruticosa', 'Kopsia'), 'Kopsia fruticosa', ['Kopsia fruticosa'])).status).toBe('none');
  });
  it('the item\'s sitelink, or an older name, stands (guard)', async () => {
    expect((await summary(redirect('Saguaro', 'Saguaro'), 'Saguaro', ['Saguaro', 'Carnegiea gigantea'])).status).toBe('ok');
    expect((await summary(redirect('Bisnaga glaucescens', 'Ferocactus glaucescens'), 'Bisnaga glaucescens', ['Bisnaga glaucescens', 'Ferocactus glaucescens'])).status).toBe('ok');
  });
  it('the build records the redirect, and keeps no summary', async () => {
    const table = copiapoa() as Record<string, unknown>;
    table[`${W}?action=wbgetentities`] = { entities: { Q5168360: { claims: { P3151: [{ mainsnak: { datavalue: { value: '135254' } } }] } } } };
    table[`${WP}Copiapoa_cinerea`] = { type: 'standard', title: 'Copiapoa', extract: 'Copiapoa is a genus of cacti.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Copiapoa' } } };
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table)));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.summary).toBeUndefined(); // base: the genus's article
    expect(r.dossier.upstream.wikipedia).toMatchObject({ status: 'none', detail: 'Wikipedia redirects Copiapoa cinerea to Copiapoa' });
  });
  it('a stored title is read against the name and the older names, not their varieties', () => {
    expect(summaryTitleFits('Weingartia canigueralii', 'Weingartia pulchra', ['Rebutia pulchra Cárdenas', 'Rebutia canigueralii subsp. pulchra (Cárdenas) Donald'])).toBe(false);
    expect(summaryTitleFits('Rebutia pulchra', 'Weingartia pulchra', ['Rebutia pulchra Cárdenas'])).toBe(true);
    expect(summaryTitleFits('Saguaro', 'Carnegiea gigantea', [], 'Saguaro')).toBe(true);
  });
});

describe('iNaturalist under an older name: only this species\' own taxon (M6)', () => {
  // iNaturalist's answer for "Rebutia pulchra", Weingartia pulchra's basionym, on 2026-10-11.
  const rebutia = { results: [{ id: 1576161, name: 'Weingartia canigueralii', rank: 'species', matched_term: 'Rebutia pulchra', is_active: true }] };
  const inat = (table: Record<string, unknown>) => fixtureFetcher(table, { status: 'ok', data: { results: [] } } as never);
  it('a taxon under another name is refused: Weingartia canigueralii is not Weingartia pulchra', async () => {
    const r = await taxonByOlderNames(inat({ 're:q=Rebutia%20pulchra': rebutia }), ['Rebutia pulchra'], { accepted: 'Weingartia pulchra' });
    expect(r.status).toBe('none'); // base: ok, 1576161
    expect(r.status === 'none' && r.detail).toMatch(/Rebutia pulchra finds Weingartia canigueralii/);
  });
  it('a same-type name the reference holds as another species is refused', async () => {
    const f = inat({ 're:q=Rebutia%20fidana': { results: [{ id: 442942, name: 'Rebutia fidana', rank: 'species' }] } });
    const r = await taxonByOlderNames(f, ['Rebutia fidana'], { accepted: 'Weingartia fidaiana', heldElsewhere: (n) => n === 'Rebutia fidana' });
    expect(r.status).toBe('none'); // base: ok
  });
  it('the answer names the older name and the taxon it is filed as (guard)', async () => {
    const r = await taxonByOlderNames(inat({ 're:q=Ferocactus%20glaucescens': { results: [{ id: 274273, name: 'Ferocactus glaucescens', rank: 'species' }] } }), ['Echinocactus glaucescens', 'Ferocactus glaucescens'], { accepted: 'Bisnaga glaucescens' });
    expect(r).toMatchObject({ status: 'ok', data: { id: 274273 }, detail: 'found under Ferocactus glaucescens, an older name with the same type' });
  });
  it('every search is limited to plants', async () => {
    let asked = '';
    await taxon((async (url: string) => { asked = url; return { status: 'ok', data: { results: [] } }; }) as unknown as JsonFetcher, 'Iris oratoria');
    expect(asked).toContain(`&taxon_id=${PLANTAE}&`); // base: the mantis was a possible answer
  });
  it('a genus that names the name exactly is not taken (R46-31 guard)', async () => {
    const f = (async () => ({ status: 'ok', data: { results: [{ id: 9, name: 'Camphora', rank: 'genus', matched_term: 'Cinnamomum camphora' }] } })) as unknown as JsonFetcher;
    expect((await taxon(f, 'Cinnamomum camphora')).status).toBe('none');
  });
});

describe('Wikidata by name: one exact label, and proof it is this plant (M7)', () => {
  const byName = (search: unknown[], entity: Record<string, unknown>) => fixtureFetcher({
    [`re:list=search&srlimit=2`]: { query: { search: [] } },
    're:datasetKey=f382f0ce': { results: [] }, // round seventy: Kew's IPNI asked of GBIF's copy of WCVP when no item is found; none
    [`${W}?action=wbsearchentities`]: { search },
    [`${W}?action=wbgetentities`]: { entities: entity }
  });
  it('two items with the label is two answers, not the first', async () => {
    const taxon = { claims: { P225: [{ mainsnak: { datavalue: { value: 'Aus bus' } } }] } };
    const f = byName([{ id: 'Q1', label: 'Aus bus' }, { id: 'Q2', label: 'Aus bus' }], { Q1: taxon, Q2: taxon });
    expect(await crossIds(f, 'Aus bus', 77)).toMatchObject({ status: 'ambiguous', detail: 'not taken: two items answered to the label Aus bus (Q1, Q2)' }); // base: Q1
  });
  it('an item with no GBIF key is taken only when its taxon name is the name', async () => {
    const none = byName([{ id: 'Q1', label: 'Aus bus' }], { Q1: { claims: { P225: [{ mainsnak: { datavalue: { value: 'Aus bussus' } } }] } } });
    expect((await crossIds(none, 'Aus bus', 77)).status).toBe('none'); // base: ok, unproved
    const named = byName([{ id: 'Q1', label: 'Aus bus' }], { Q1: { claims: { P225: [{ mainsnak: { datavalue: { value: 'Aus bus' } } }] } } });
    expect(await crossIds(named, 'Aus bus', 77)).toMatchObject({ status: 'ok', data: { wikidata: 'Q1' } }); // guard
  });
  it('an item whose GBIF key is a same-type older name\'s is taken (guard)', async () => {
    const f = byName([{ id: 'Q310510', label: 'Bisnaga glaucescens' }], { Q310510: { claims: { P846: [{ mainsnak: { datavalue: { value: '3959669' } } }] } } });
    expect((await crossIds(f, 'Bisnaga glaucescens', 11098779, [{ key: 3959669, name: 'Ferocactus glaucescens' }])).status).toBe('ok');
  });
  it('the older names\' search asks for one more item than there are keys', async () => {
    const asked: string[] = [];
    const base = byName([], {});
    const f = (async (url: string) => { asked.push(url); return base(url); }) as unknown as JsonFetcher;
    await crossIds(f, 'Bisnaga glaucescens', 11098779, [3944752, 3959669, 3946670]);
    expect(asked.find((u) => u.includes('P846%3D3944752'))).toContain('srlimit=4'); // base: srlimit=3
  });
  it('two items left by the older names are recorded as "ambiguous" in the build (M8)', async () => {
    const key = 5384013;
    const table = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(table)) if (k.startsWith(W)) delete table[k];
    Object.assign(table, {
      [`${GBIF}/species/${key}/synonyms`]: { results: [{ key: 111, scientificName: 'Echinocactus cinereus Phil.', canonicalName: 'Echinocactus cinereus', rank: 'SPECIES' }] },
      [`re:srsearch=haswbstatement%3AP846%3D111`]: { query: { search: [{ title: 'Q5' }, { title: 'Q6' }] } },
      [`re:srsearch=haswbstatement%3AP846%3D${key}`]: { query: { search: [] } },
      [`${W}?action=wbsearchentities`]: { search: [] },
      [`${W}?action=wbgetentities`]: { entities: { Q5: { claims: {} }, Q6: { claims: {} } } }
    });
    const sp = table[`${GBIF}/species/${key}`] as Record<string, unknown>;
    table[`${GBIF}/species/${key}`] = { ...sp, basionymKey: 111 };
    table['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table)));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream.wikidata).toMatchObject({ status: 'ambiguous', detail: expect.stringMatching(/^not taken: two items answered/) }); // base: none
  });
});

describe('"ambiguous" is a status of its own, said as such (M8)', () => {
  it('the pill says the answer was not taken, and the schema keeps the status', async () => {
    const { UPSTREAM_WORD } = await import('$lib/ui/ref/upstream');
    const { Upstream } = await import('$dossier/schema');
    const v = await import('valibot');
    expect(UPSTREAM_WORD.ambiguous).toBe('not taken: two items answered'); // base: no word, the bare status shown
    expect(v.safeParse(Upstream, { status: 'ambiguous', at: '2026-10-11T12:00:00Z', detail: 'not taken: two items answered (Q1, Q2)' }).success).toBe(true);
  });
});
