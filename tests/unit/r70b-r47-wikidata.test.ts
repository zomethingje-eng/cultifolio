/**
 * Round seventy, second pass: R47-5, R47-6, R47-10 and R47-19's §14 reverts, decided as triage-69 B6 and B8. Prunus
 * persica and Oenothera fruticosa carry the items of their basionyms; the drops audit read lost identifiers, never changed
 * ones; the taxon test read P31 as a string and never ran; two items on one basionym were "two answers"; an IPNI number
 * that is not the POWO one went unflagged; three more homonyms' IPNI numbers would be taken again; and a range record
 * said the author "matches neither" where it matched both. Items, records and Kew rows are Wikidata's, GBIF's and GBIF's
 * copy of WCVP on 2026-10-12. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { crossIds } from '$dossier/sources/wikimedia';
import { dropsBetween } from '$dossier/drops';
import * as fills from '$dossier/corpus-fills';
import { WcvpIndex, bulkFetcher, parseWcvpName } from '$dossier/bulk';
import { distributions } from '$dossier/sources/gbif';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const W = 'https://www.wikidata.org/w/api.php';
const G = 'https://api.gbif.org/v1/species';
const WCVP = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const claim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
const item = (name: string, o: { keys?: string[]; ipni?: string[]; p31?: string; basionym?: string; inat?: string } = {}) => ({ claims: { P225: claim(name), ...(o.keys ? { P846: o.keys.flatMap(claim) } : {}), ...(o.ipni ? { P961: o.ipni.flatMap(claim) } : {}), P31: claim({ id: o.p31 ?? 'Q16521' }), ...(o.basionym ? { P566: claim({ id: o.basionym }) } : {}), ...(o.inat ? { P3151: claim(o.inat) } : {}) } });
const kew = (canonical: string, rows: Array<[string, string, string, string]>) => ({ results: rows.map(([scientificName, authorship, taxonomicStatus, ipni]) => ({ scientificName, canonicalName: canonical, authorship, taxonomicStatus, references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}` })) });
function wd(o: { key: number; label: string; hits: string[]; items: Record<string, unknown>; records?: Record<string, unknown>; kew?: unknown; more?: Record<string, unknown> }): JsonFetcher {
  return fixtureFetcher({
    ...(o.more ?? {}),
    [`re:srsearch=haswbstatement%3AP846%3D${o.key}(&|$)`]: { query: { search: [] } },
    [`${W}?action=wbsearchentities`]: { search: o.hits.map((id) => ({ id, label: o.label })) },
    ...Object.fromEntries(Object.entries(o.items).map(([id, e]) => [`re:wbgetentities&format=json&ids=${id}&`, { entities: { [id]: e } }])),
    ...Object.fromEntries(Object.entries(o.records ?? {}).map(([k, r]) => [`${G}/${k}`, r])),
    [`re:datasetKey=${WCVP}`]: o.kew ?? { results: [] },
    're:srsearch=haswbstatement%3AP961': { query: { search: [] } }
  });
}
const DOUBTFUL = (key: number, sci: string, canonical: string) => ({ key, scientificName: sci, canonicalName: canonical, rank: 'SPECIES', taxonomicStatus: 'DOUBTFUL', kingdom: 'Plantae', speciesKey: key });

describe('three more homonyms\' IPNI numbers are refused (R47-5)', () => {
  it('Albuca longifolia Fisch. ex Steud.: the item carries 527398-1, Kew\'s for Albuca longifolia Baker', async () => {
    const f = wd({ key: 7570556, label: 'Albuca longifolia', hits: ['Q15516807'], items: { Q15516807: item('Albuca longifolia', { keys: ['2772455'], ipni: ['527398-1'] }) }, records: { 2772455: DOUBTFUL(2772455, 'Albuca longifolia Baker', 'Albuca longifolia') }, kew: kew('Albuca longifolia', [['Albuca longifolia Fisch. ex F.Dietr.', 'Fisch. ex F.Dietr.', 'DOUBTFUL', '77235994-1'], ['Albuca longifolia Baker', 'Baker', 'SYNONYM', '527398-1']]) });
    expect(await crossIds(f, 'Albuca longifolia', 7570556, [], { authorship: 'Fisch. ex Steud., 1840' })).toEqual({ status: 'none', detail: "not taken: the item labelled Albuca longifolia, Q15516807, carries IPNI 527398-1, Kew's for Albuca longifolia Baker, another author's name" }); // base: ok, "the same name"
  });
  it('Convolvulus cneorum L.: the item carries 266048-1 (Spruner ex Nyman), where Kew\'s is 266046-1', async () => {
    const f = wd({ key: 8069501, label: 'Convolvulus cneorum', hits: ['Q149738'], items: { Q149738: item('Convolvulus cneorum', { keys: ['3680772'], ipni: ['266048-1'] }) }, records: { 3680772: DOUBTFUL(3680772, 'Convolvulus cneorum Spruner ex Nyman, 1881', 'Convolvulus cneorum') }, kew: kew('Convolvulus cneorum', [['Convolvulus cneorum Forssk.', 'Forssk.', 'MISAPPLIED', '266047-1'], ['Convolvulus cneorum L.', 'L.', 'ACCEPTED', '266046-1']]) });
    expect((await crossIds(f, 'Convolvulus cneorum', 8069501, [], { authorship: 'L.' })).status).toBe('none'); // base: ok
  });
  it('Raphionacme linearis K.Schum.: the item carries N.E.Brown\'s 100799-1', async () => {
    const f = wd({ key: 7438714, label: 'Raphionacme linearis', hits: ['Q15374020'], items: { Q15374020: item('Raphionacme linearis', { keys: ['3573332'], ipni: ['100799-1'] }) }, records: { 3573332: DOUBTFUL(3573332, 'Raphionacme linearis N.E.Br., 1902', 'Raphionacme linearis') }, kew: kew('Raphionacme linearis', [['Raphionacme linearis K.Schum.', 'K.Schum.', 'ACCEPTED', '100771-1']]) });
    expect((await crossIds(f, 'Raphionacme linearis', 7438714, [], { authorship: 'K.Schum.' })).status).toBe('none'); // base: ok
  });
});

describe('the taxon test reads P31\'s item (R47-5, R47-19 §14)', () => {
  it('a print with the taxon name of the plant is not a taxon', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q9'], items: { Q9: item('Aus bus', { p31: 'Q11835431' }) } });
    expect(await crossIds(f, 'Aus bus', 1)).toEqual({ status: 'none' }); // base: ok, the print taken by its taxon name
  });
  it('nor a "Wikimedia duplicated page"', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q133620833'], items: { Q133620833: item('Aus bus', { p31: 'Q17362920' }) } });
    expect((await crossIds(f, 'Aus bus', 1)).status).toBe('none'); // base: ok
  });
  it('a taxon item stating P31 is a taxon (guard)', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q8'], items: { Q8: item('Aus bus') } });
    expect((await crossIds(f, 'Aus bus', 1)).status).toBe('ok');
  });
});

describe('two items on one basionym are one plant (R47-5)', () => {
  it('Ceropegia sociarum: Larryleachia sociarum and Hoodia sociarum both name Trichocaulon sociarum', async () => {
    const f = wd({
      key: 9273895, label: 'Ceropegia sociarum', hits: [],
      items: { Q18079039: item('Larryleachia sociarum', { keys: ['3580798'], ipni: ['995327-1'], basionym: 'Q38452189', inat: '588717' }) },
      more: {
        're:srsearch=haswbstatement%3AP846%3D8223006%7CP846%3D3580798': { query: { search: [{ title: 'Q18079039' }, { title: 'Q94365634' }] } },
        [`${W}?action=wbgetentities&format=json&ids=Q18079039|Q94365634&props=claims`]: { entities: { Q18079039: item('Larryleachia sociarum', { keys: ['3580798'], basionym: 'Q38452189', inat: '588717' }), Q94365634: item('Hoodia sociarum', { keys: ['8223006'], basionym: 'Q38452189' }) } }
      }
    });
    const r = await crossIds(f, 'Ceropegia sociarum', 9273895, [{ key: 8223006, name: 'Hoodia sociarum' }, { key: 3580798, name: 'Larryleachia sociarum' }]);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q18079039' }, detail: 'found by the GBIF record of Larryleachia sociarum, an older name with the same type' }); // base: ambiguous
  });
});

describe('the drops audit (R47-5)', () => {
  it('lists a changed Wikidata item, not only a lost one', () => {
    expect(dropsBetween({ ids: { wikidata: 'Q21870184' } }, { ids: { wikidata: 'Q13189' } })).toEqual(['identifier wikidata changed (Q21870184 before, Q13189 now)']); // base: []
  });
  it('flags an IPNI number that is not the POWO one, when it newly is', () => {
    const cneorum = { ipni: '266048-1', powo: 'urn:lsid:ipni.org:names:266046-1' };
    expect(dropsBetween({ ids: {} }, { ids: cneorum })).toEqual(["IPNI 266048-1 is not POWO's 266046-1"]); // base: []
    expect(dropsBetween({ ids: cneorum }, { ids: cneorum })).toEqual([]); // guard: the same disagreement is not new
  });
});

describe('--fill wikidata moves Prunus persica and Oenothera fruticosa to their own items (R47-5)', () => {
  const ITEMS: Record<string, unknown> = {
    Q21870184: item('Amygdalus persica', { keys: ['5369552'], ipni: ['324718-2'] }),
    Q13189: item('Prunus persica', { keys: ['3022511'], ipni: ['1212858-2'], basionym: 'Q21870184', inat: '78755' }),
    Q15345195: item('Kneiffia fruticosa', { keys: ['6427963'], ipni: ['133490-2'], basionym: 'Q7078662' }),
    Q7078662: item('Oenothera fruticosa', { keys: ['3188905'], ipni: ['172975-2'], inat: '129556' })
  };
  const LABEL: Record<string, string> = { 'Prunus persica': 'Q13189', 'Oenothera fruticosa': 'Q7078662' };
  const KEW: Record<string, [string, string, string, string]> = { 'Prunus persica': ['Prunus persica (L.) Batsch', '(L.) Batsch', 'ACCEPTED', '1212858-2'], 'Oenothera fruticosa': ['Oenothera fruticosa L.', 'L.', 'ACCEPTED', '172975-2'] };
  const f = (async (url: string) => {
    const ok = (data: unknown) => ({ status: 'ok', data });
    let m: RegExpExecArray | null;
    if ((m = /wbgetentities&format=json&ids=([^&]+)&/.exec(url))) return ok({ entities: Object.fromEntries(m[1].split('|').map((q) => [q, ITEMS[q]])) });
    if ((m = /wbsearchentities.*&search=([^&]+)/.exec(url))) { const n = decodeURIComponent(m[1]); return ok({ search: LABEL[n] ? [{ id: LABEL[n], label: n }] : [] }); }
    if (/srsearch=/.test(url)) return ok({ query: { search: [] } });
    if ((m = new RegExp(`datasetKey=${WCVP}&name=([^&]+)`).exec(url))) return ok(kew(decodeURIComponent(m[1]), [KEW[decodeURIComponent(m[1])]]));
    if (/\/synonyms/.test(url)) return ok({ results: [], endOfRecords: true });
    if (/\/species\/\d+$/.test(url)) return ok({ key: 1 });
    return { status: 'none' };
  }) as unknown as JsonFetcher;
  it('both are listed for the rebuild, and Convolvulus cneorum\'s IPNI is listed against its POWO', async () => {
    const docs: Record<string, unknown> = {
      '8149923.json': { key: 8149923, name: { scientific: 'Prunus persica', authorship: '(L.) Stokes' }, ids: { gbif: 8149923, wikidata: 'Q21870184', ipni: '324718-2', powo: 'urn:lsid:ipni.org:names:324718-2' }, links: {}, upstream: { wikidata: { status: 'ok', detail: 'found by the GBIF record of Amygdalus persica, an older name with the same type' } } },
      '7884360.json': { key: 7884360, name: { scientific: 'Oenothera fruticosa', authorship: 'L.' }, ids: { gbif: 7884360, wikidata: 'Q15345195', ipni: '133490-2', powo: 'urn:lsid:ipni.org:names:133490-2' }, links: {}, upstream: { wikidata: { status: 'ok', detail: 'found by the GBIF record of Kneiffia fruticosa, an older name with the same type' } } },
      '8069501.json': { key: 8069501, name: { scientific: 'Convolvulus cneorum', authorship: 'L.' }, ids: { gbif: 8069501, ipni: '266048-1', powo: 'urn:lsid:ipni.org:names:266046-1' }, links: {}, upstream: {} }
    };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    const c = await fills.fillWikidata(store, f, () => '2026-10-13T00:00:00Z');
    expect(c.rebuild).toEqual(['8149923 Prunus persica\tWikidata item Q21870184 → Q13189', '7884360 Oenothera fruticosa\tWikidata item Q15345195 → Q7078662']); // base: no fillWikidata
    expect(c.disagree).toEqual(["Convolvulus cneorum [8069501]: IPNI 266048-1 is not POWO's 266046-1"]);
  });
});

describe('"matches neither" only when it does (R47-10, B8)', () => {
  const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
  const row = (id: string, status: string, name: string, authors: string, acc: string) => [id, '', 'Species', status, '', '', name.split(' ')[0], '', name.split(' ')[1], '', '', '', '', '', '', '', '', '', '', '', '', name, authors, acc, '', '', '', '', '', '', 'Y'].join('|');
  it('two rows by the backbone\'s author under two entries are said as matching both', async () => {
    const w = new WcvpIndex();
    for (const l of [row('1', 'Synonym', 'Aus bus', 'L.', '3'), row('2', 'Synonym', 'Aus bus', 'L.', '4'), row('3', 'Accepted', 'Aus cus', 'Mill.', '3'), row('4', 'Accepted', 'Aus dus', 'Mill.', '4')]) w.addName(parseWcvpName(H, l), () => true);
    const api = (async (url: string) => (/\/species\/1$/.test(url) ? { status: 'ok', data: { key: 1, canonicalName: 'Aus bus', authorship: 'L.' } } : { status: 'none' })) as unknown as JsonFetcher;
    const r = await distributions(bulkFetcher(api, { wcvp: w }) as JsonFetcher, 1);
    expect(r.status === 'ok' && r.data.ambiguous).toBe("WCVP lists Aus bus more than once, and the backbone's authorship (L.) matches 2 of them, under different entries"); // base: "… matches neither"
  });
});
