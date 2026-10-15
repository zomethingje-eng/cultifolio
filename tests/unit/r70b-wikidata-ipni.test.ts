/**
 * Round seventy, triage-69 B2 (S-B2, S-B3, S-B6, IND-3): the label proof took an item when one of its GBIF keys was a
 * record of the same name, whatever its author and wherever GBIF files it, so a homonym's item brought another plant's
 * IPNI to the page; it refused right items whose key GBIF no longer serves or spells another way; and a GBIF refusal
 * was recorded as Wikidata's. Now: IPNI first, a contradicting GBIF record refuses, a dead key is no key, and an item is
 * found by Kew's IPNI identifier when nothing else finds one. The items are Wikidata's, the records GBIF's and the Kew
 * rows those of GBIF's copy of WCVP, all read 2026-10-12. Each case FAILED on the base (526ecaf) unless it says "guard";
 * the failure is noted on the line.
 */
import { describe, it, expect } from 'vitest';
import { crossIds } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const W = 'https://www.wikidata.org/w/api.php';
/** GBIF's copy of WCVP (`gbif.WCVP_DATASET`), written out so the file loads on the base and its guards run there. */
const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const G = 'https://api.gbif.org/v1/species';
const claim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
/** A taxon item: its taxon name, GBIF keys and IPNI identifiers. */
const item = (name: string, keys: string[] = [], ipni: string[] = []) => ({ claims: { P225: claim(name), ...(keys.length ? { P846: keys.flatMap(claim) } : {}), ...(ipni.length ? { P961: ipni.flatMap(claim) } : {}), P31: claim({ id: 'Q16521' }) } });
/** Kew's rows of a name in GBIF's copy of WCVP: [scientific name, its author, Kew's status, IPNI]. */
const kew = (canonical: string, rows: Array<[string, string, string, string]>) => ({ results: rows.map(([scientificName, authorship, taxonomicStatus, ipni], i) => ({ key: 206000000 + i, scientificName, canonicalName: canonical, authorship, taxonomicStatus, rank: 'SPECIES', references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}` })), endOfRecords: true });
/** No item by the species' own key; the items with the label; each item by id; GBIF's records; Kew's rows; anything else. */
function wd(o: { key: number; label: string; hits: string[]; items: Record<string, unknown>; records?: Record<string, unknown>; kew?: unknown; more?: Record<string, unknown> }, asked: string[] = []): JsonFetcher {
  const f = fixtureFetcher({
    ...(o.more ?? {}),
    [`re:srsearch=haswbstatement%3AP846%3D${o.key}&`]: { query: { search: [] } },
    [`${W}?action=wbsearchentities`]: { search: o.hits.map((id) => ({ id, label: o.label })) },
    ...Object.fromEntries(Object.entries(o.items).map(([id, e]) => [`re:wbgetentities&format=json&ids=${id}&`, { entities: { [id]: e } }])),
    ...Object.fromEntries(Object.entries(o.records ?? {}).map(([k, r]) => [`${G}/${k}`, r])),
    [`re:datasetKey=${WCVP_DATASET}`]: o.kew ?? { results: [] },
    're:srsearch=haswbstatement%3AP961': { query: { search: [] } }
  });
  return (async (url: string) => { asked.push(url); return f(url); }) as unknown as JsonFetcher;
}

/** GBIF's records the items carry. */
const AGAVE_STEUD = { key: 2767037, scientificName: 'Agave variegata Steud.', canonicalName: 'Agave variegata', authorship: 'Steud.', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM', kingdom: 'Plantae', acceptedKey: 2767032, accepted: 'Agave americana subsp. americana', speciesKey: 2767031 };
const PEPEROMIA_HOOK = { key: 4183999, scientificName: 'Peperomia monticola Hook.fil.', canonicalName: 'Peperomia monticola', authorship: 'Hook.fil.', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM', kingdom: 'Plantae', acceptedKey: 4188553, accepted: 'Peperomia vulcanica Baker & C.H.Wright', speciesKey: 4188553 };
const OTHONNA_KLATT = { key: 3094382, scientificName: 'Othonna rosea Klatt ex Schinz', canonicalName: 'Othonna rosea', authorship: 'Klatt ex Schinz', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM', kingdom: 'Plantae', acceptedKey: 9243147, accepted: 'Emilia schinzii (O.Hoffm.) Cron', speciesKey: 9243147 };
const SOLANUM_FORSSK = { key: 2932865, scientificName: 'Solanum nigrum Forssk.', canonicalName: 'Solanum nigrum', rank: 'SPECIES', taxonomicStatus: 'DOUBTFUL', kingdom: 'Plantae' };
const OXALIS_VAR = { key: 2891729, scientificName: 'Oxalis corniculata _ novoeguineensis Lourteig', canonicalName: 'Oxalis corniculata', authorship: '', rank: 'SPECIES', taxonomicStatus: 'DOUBTFUL', kingdom: 'Plantae', speciesKey: 2891729 };
const GRUSONI = { key: 5619964, scientificName: 'Mammillaria grusoni Runge', canonicalName: 'Mammillaria grusoni', authorship: 'Runge', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', speciesKey: 5619964 };
const MESEMB_HAW = { key: 3707487, scientificName: 'Mesembryanthemum parviflorum Haw.', canonicalName: 'Mesembryanthemum parviflorum', authorship: 'Haw.', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM', kingdom: 'Plantae', acceptedKey: 5555190, accepted: 'Ruschia parviflora (Haw.) Schwantes', speciesKey: 5555190 };

describe('IPNI first: a homonym\'s item is refused, whatever its GBIF key says', () => {
  it('Agave variegata Jacobi: the label item carries Steudel\'s IPNI; the item is found by the same-type name instead', async () => {
    const f = wd({
      key: 7720070, label: 'Agave variegata', hits: ['Q391952'],
      items: { Q391952: item('Agave variegata', ['2767037'], ['62332-1']), Q15523250: item('Manfreda variegata', ['2771707']) },
      records: { 2767037: AGAVE_STEUD },
      kew: kew('Agave variegata', [['Agave variegata Jacobi', 'Jacobi', 'SYNONYM', '62333-1'], ['Agave variegata Steud.', 'Steud.', 'SYNONYM', '62332-1']]),
      more: { 're:srsearch=haswbstatement%3AP846%3D2771707%7CP846%3D2771708': { query: { search: [{ title: 'Q15523250' }] } } }
    });
    const r = await crossIds(f, 'Agave variegata', 7720070, [{ key: 2771707, name: 'Manfreda variegata' }, { key: 2771708, name: 'Polianthes variegata' }], { authorship: 'Jacobi' });
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q15523250' }, detail: 'found by the GBIF record of Manfreda variegata, an older name with the same type' }); // base: Q391952, IPNI 62332-1 ("hort. ex Steud.")
  });
  it('Peperomia monticola Miq.: the label item is Hooker\'s homonym\'s, and no item carries Kew\'s 679159-1', async () => {
    const f = wd({
      key: 7555524, label: 'Peperomia monticola', hits: ['Q15605262'],
      items: { Q15605262: item('Peperomia monticola', ['4183999'], ['679160-1']) },
      records: { 4183999: PEPEROMIA_HOOK },
      kew: kew('Peperomia monticola', [['Peperomia monticola Hook.f.', 'Hook.f.', 'SYNONYM', '679160-1'], ['Peperomia monticola Miq.', 'Miq.', 'ACCEPTED', '679159-1']])
    });
    expect(await crossIds(f, 'Peperomia monticola', 7555524, [], { authorship: 'Miq.' })).toEqual({ status: 'none', detail: "not taken: the item labelled Peperomia monticola, Q15605262, carries IPNI 679160-1, Kew's for Peperomia monticola Hook.f., another author's name" }); // base: ok, Q15605262
  });
  it('Othonna rosea Harv.: the label item carries Klatt\'s IPNI', async () => {
    const f = wd({
      key: 8056896, label: 'Othonna rosea', hits: ['Q15578453'],
      items: { Q15578453: item('Othonna rosea', ['3094382'], ['236136-1']) },
      records: { 3094382: OTHONNA_KLATT },
      kew: kew('Othonna rosea', [['Othonna rosea Klatt', 'Klatt', 'SYNONYM', '236136-1'], ['Othonna rosea Harv.', 'Harv.', 'ACCEPTED', '236135-1']])
    });
    expect((await crossIds(f, 'Othonna rosea', 8056896, [], { authorship: 'Harv.' })).status).toBe('none'); // base: ok, IPNI 236136-1 (Klatt)
  });
});

describe('IPNI first: right items are taken, and say so', () => {
  it('Solanum nigrum L.: the item carries Kew\'s IPNI; its GBIF key, a doubtful record, is not read', async () => {
    const asked: string[] = [];
    const f = wd({ key: 9150405, label: 'Solanum nigrum', hits: ['Q146400'], items: { Q146400: item('Solanum nigrum', ['2932865'], ['30048260-2']) }, records: { 2932865: SOLANUM_FORSSK }, kew: kew('Solanum nigrum', [['Solanum nigrum L.', 'L.', 'ACCEPTED', '30048260-2']]) }, asked);
    expect(await crossIds(f, 'Solanum nigrum', 9150405, [], { authorship: 'L.' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q146400', ipni: '30048260-2' }, detail: "found by its label; its IPNI identifier 30048260-2 is Kew's for Solanum nigrum L." }); // base: proved by "Solanum nigrum Forssk., the same name"
    expect(asked.some((u) => u.endsWith('/species/2932865'))).toBe(false);
  });
  it('Oxalis corniculata L.: proved by Kew\'s IPNI, not by a variety\'s record that GBIF parses as the species', async () => {
    const f = wd({ key: 8427624, label: 'Oxalis corniculata', hits: ['Q162795', 'Q52515621'], items: { Q162795: item('Oxalis corniculata', ['2891729'], ['177893-2']), Q52515621: { claims: { P31: claim({ id: 'Q11835431' }) } } }, records: { 2891729: OXALIS_VAR }, kew: kew('Oxalis corniculata', [['Oxalis corniculata L.', 'L.', 'ACCEPTED', '177893-2']]) });
    expect(await crossIds(f, 'Oxalis corniculata', 8427624, [], { authorship: 'L.' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q162795' }, detail: "found by its label; its IPNI identifier 177893-2 is Kew's for Oxalis corniculata L." }); // base: "Oxalis corniculata _ novoeguineensis Lourteig, the same name"
  });
  it('Mammillaria grusonii Ruenge: Kew\'s Runge is the same author, and the item is taken', async () => {
    const f = wd({ key: 8429321, label: 'Mammillaria grusonii', hits: ['Q1354228'], items: { Q1354228: item('Mammillaria grusonii', ['5619964'], ['151043-2']) }, records: { 5619964: GRUSONI }, kew: kew('Mammillaria grusonii', [['Mammillaria grusonii Runge', 'Runge', 'ACCEPTED', '151043-2']]) });
    expect(await crossIds(f, 'Mammillaria grusonii', 8429321, [], { authorship: 'Ruenge' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q1354228' } }); // base: none, "GBIF's record of another name"
  });
  it('Mammillaria grusonii without its IPNI: GBIF\'s "grusoni" is the same name in another spelling', async () => {
    const f = wd({ key: 8429321, label: 'Mammillaria grusonii', hits: ['Q1354228'], items: { Q1354228: item('Mammillaria grusonii', ['5619964']) }, records: { 5619964: GRUSONI } });
    expect(await crossIds(f, 'Mammillaria grusonii', 8429321, [], { authorship: 'Ruenge' })).toMatchObject({ status: 'ok', detail: "found by its label; its GBIF key 5619964 is GBIF's record of Mammillaria grusoni Runge, the same name" }); // base: none
  });
  it('Catalpa speciosa: Kew cites the name\'s author otherwise, and its one accepted entry\'s IPNI is the item\'s', async () => {
    const f = wd({ key: 3172612, label: 'Catalpa speciosa', hits: ['Q159204'], items: { Q159204: item('Catalpa speciosa', ['317261'], ['77117561-1']) }, records: { 317261: null }, kew: kew('Catalpa speciosa', [['Catalpa speciosa Warder ex Teas', 'Warder ex Teas', 'ACCEPTED', '77117561-1']]) });
    expect(await crossIds(f, 'Catalpa speciosa', 3172612, [], { authorship: '(Warder ex Barney) Warder ex Engelm.' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q159204' }, detail: "found by its label; its IPNI identifier 77117561-1 is Kew's for Catalpa speciosa Warder ex Teas" }); // base: none, "GBIF's record of another name"
  });
  it('Catalpa speciosa without its IPNI: a GBIF key no longer served is no key, and the taxon name decides', async () => {
    const f = wd({ key: 3172612, label: 'Catalpa speciosa', hits: ['Q159204'], items: { Q159204: item('Catalpa speciosa', ['317261']) }, records: { 317261: null } });
    expect(await crossIds(f, 'Catalpa speciosa', 3172612)).toMatchObject({ status: 'ok', data: { wikidata: 'Q159204' }, detail: 'found by its label; its GBIF key 317261, which GBIF no longer serves, and its taxon name is this name' }); // base: none
  });
  it('Mesembryanthemum parviflorum Jacq.: the item Kew\'s IPNI proves is taken over an item that carries the name alone', async () => {
    const f = wd({ key: 8280004, label: 'Mesembryanthemum parviflorum', hits: ['Q17375709', 'Q108737043'], items: { Q17375709: item('Mesembryanthemum parviflorum', ['3707487'], ['363249-1']), Q108737043: item('Mesembryanthemum parviflorum') }, records: { 3707487: MESEMB_HAW }, kew: kew('Mesembryanthemum parviflorum', [['Mesembryanthemum parviflorum Haw.', 'Haw.', 'SYNONYM', '363250-1'], ['Mesembryanthemum parviflorum Jacq.', 'Jacq.', 'ACCEPTED', '363249-1']]) });
    expect(await crossIds(f, 'Mesembryanthemum parviflorum', 8280004, [], { authorship: 'Jacq.' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q17375709' } }); // base: ambiguous
  });
});

describe('with no IPNI on the item, a contradicting GBIF record refuses', () => {
  it('Agave variegata Jacobi\'s label item without its IPNI: Steudel\'s record is filed under Agave americana', async () => {
    const f = wd({ key: 7720070, label: 'Agave variegata', hits: ['Q391952'], items: { Q391952: item('Agave variegata', ['2767037']) }, records: { 2767037: AGAVE_STEUD } });
    expect(await crossIds(f, 'Agave variegata', 7720070, [], { authorship: 'Jacobi' })).toEqual({ status: 'none', detail: "not taken: the item labelled Agave variegata, Q391952, carries GBIF key 2767037, GBIF's record of Agave variegata Steud., which GBIF files under Agave americana subsp. americana" }); // base: ok, "the same name"
  });
  it('one contradicting key refuses the item, whatever its other keys prove', async () => {
    const f = wd({ key: 7720070, label: 'Agave variegata', hits: ['Q1'], items: { Q1: item('Agave variegata', ['2767037', '7']) }, records: { 2767037: AGAVE_STEUD, 7: { key: 7, canonicalName: 'Agave variegata', scientificName: 'Agave variegata Jacobi', rank: 'SPECIES', kingdom: 'Plantae' } } });
    expect((await crossIds(f, 'Agave variegata', 7720070)).status).toBe('none'); // base: ok
  });
  it('a record that states no kingdom proves nothing (mutation W2)', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q1'], items: { Q1: item('Aus bus', ['9']) }, records: { 9: { key: 9, canonicalName: 'Aus bus', scientificName: 'Aus bus Sm.', rank: 'SPECIES' } } });
    expect(await crossIds(f, 'Aus bus', 1)).toEqual({ status: 'none', detail: "not taken: the item labelled Aus bus, Q1, carries GBIF key 9, GBIF's record of Aus bus Sm., not stated to be a plant" }); // base: ok (no kingdom read as Plantae)
  });
  it('a record at variety rank proves nothing', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q1'], items: { Q1: item('Aus bus', ['9']) }, records: { 9: { key: 9, canonicalName: 'Aus bus', scientificName: 'Aus bus Sm.', rank: 'VARIETY', kingdom: 'Plantae' } } });
    expect((await crossIds(f, 'Aus bus', 1)).status).toBe('none'); // base: ok
  });
  it('every key is read, up to five (LABEL_KEYS), and a key GBIF no longer serves does not end the reading (guard; mutations W4, W5)', async () => {
    const records = { 8: null, 9: { key: 9, canonicalName: 'Aus cus', scientificName: 'Aus cus L.', rank: 'SPECIES', kingdom: 'Plantae' }, 10: { key: 10, canonicalName: 'Aus bus', scientificName: 'Aus bus L.', rank: 'SPECIES', kingdom: 'Plantae' } };
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q1'], items: { Q1: item('Aus bus', ['8', '9', '10']) }, records });
    expect(await crossIds(f, 'Aus bus', 1)).toMatchObject({ status: 'ok', detail: "found by its label; its GBIF key 10 is GBIF's record of Aus bus L., the same name" });
  });
  it('another epithet of the genus is another name (guard; mutation W9)', async () => {
    const f = wd({ key: 1, label: 'Solanum nigrum', hits: ['Q1'], items: { Q1: item('Solanum nigrum', ['9']) }, records: { 9: { key: 9, canonicalName: 'Solanum americanum', scientificName: 'Solanum americanum Mill.', rank: 'SPECIES', kingdom: 'Plantae' } } });
    expect((await crossIds(f, 'Solanum nigrum', 1)).status).toBe('none');
  });
  it('a record of another name that GBIF holds as a synonym of this species proves the item (guard; mutation W3)', async () => {
    const f = wd({ key: 7792065, label: 'Tabernaemontana pandacaqui', hits: ['Q14862280'], items: { Q14862280: item('Tabernaemontana pandacaqui', ['3615270']) }, records: { 3615270: { key: 3615270, scientificName: 'Ervatamia pandacaqui (Poir.) Pichon', canonicalName: 'Ervatamia pandacaqui', rank: 'SPECIES', kingdom: 'Plantae', acceptedKey: 7792065 } } });
    expect((await crossIds(f, 'Tabernaemontana pandacaqui', 7792065)).status).toBe('ok');
  });
  it('a print with the label is passed over, and leaves no note (guard; mutation W6)', async () => {
    const f = wd({ key: 1, label: 'Aus bus', hits: ['Q9'], items: { Q9: { claims: { P31: claim({ id: 'Q11835431' }) } } } });
    expect(await crossIds(f, 'Aus bus', 1)).toEqual({ status: 'none' });
  });
});

describe('found by IPNI', () => {
  // No item carries the label (Wikidata labels it otherwise); one carries Kew's IPNI identifier for the name and author.
  // A constructed case: of the species read for this round, none had such an item (Harpephyllum caffrum has no Kew row at
  // all: Kew holds it as Harpephyllum afrum Bernh.).
  const world = (hits: string[], ipni = '1-1') => wd({ key: 1, label: 'Aus bus', hits: [], items: { Q7: item('Aus bus L.', [], [ipni]), Q8: item('Aus bus L.', [], ['1-1']) }, kew: kew('Aus bus', [['Aus bus L.', 'L.', 'ACCEPTED', '1-1']]), more: { 're:srsearch=haswbstatement%3AP961%3D1-1&': { query: { search: hits.map((title) => ({ title })) } } } });
  it('one item carrying Kew\'s identifier for the name and author is taken', async () => {
    expect(await crossIds(world(['Q7']), 'Aus bus', 1, [], { authorship: 'L.' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q7' }, detail: "found by its IPNI identifier 1-1, Kew's for Aus bus L." }); // base: none
  });
  it('two are no answer, and an item whose identifier is not Kew\'s is not taken', async () => {
    expect((await crossIds(world(['Q7', 'Q8']), 'Aus bus', 1, [], { authorship: 'L.' })).status).toBe('ambiguous'); // base: none
    const two = wd({ key: 1, label: 'Aus bus', hits: ['Q7'], items: { Q7: item('Aus bus', [], ['9-9', '1-1']) }, kew: kew('Aus bus', [['Aus bus L.', 'L.', 'ACCEPTED', '1-1']]) });
    expect(await crossIds(two, 'Aus bus', 1, [], { authorship: 'L.' })).toMatchObject({ status: 'ok', data: { ipni: '1-1' } }); // an item with two IPNI identifiers links the one that proved it; base: 9-9
    expect((await crossIds(world(['Q7'], '2-1'), 'Aus bus', 1, [], { authorship: 'L.' })).status).toBe('none'); // guard
  });
  it("Kew holding the words only as another author's name, which it does not accept, asks Wikidata nothing more (guard)", async () => {
    const asked: string[] = [];
    await crossIds(wd({ key: 1, label: 'Aus bus', hits: [], items: {}, kew: kew('Aus bus', [['Aus bus Mill.', 'Mill.', 'SYNONYM', '1-1']]) }, asked), 'Aus bus', 1, [], { authorship: 'L.' });
    expect(asked.some((u) => u.includes('P961'))).toBe(false);
  });
});

describe('GBIF not answering while it checks an item is recorded as GBIF\'s (S-B6)', () => {
  it('crossIds marks the refusal as GBIF\'s', async () => {
    const f = wd({ key: 9150405, label: 'Solanum nigrum', hits: ['Q146400'], items: { Q146400: item('Solanum nigrum', ['2932865']) }, records: { 2932865: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' } } });
    expect(await crossIds(f, 'Solanum nigrum', 9150405)).toMatchObject({ status: 'refused', detail: 'api.gbif.org 429', by: 'gbif' }); // base: no `by`
  });
  it('so does a refused Kew lookup', async () => {
    const f = wd({ key: 9150405, label: 'Solanum nigrum', hits: ['Q146400'], items: { Q146400: item('Solanum nigrum', ['2932865'], ['30048260-2']) }, kew: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 503' } });
    expect(await crossIds(f, 'Solanum nigrum', 9150405, [], { authorship: 'L.' })).toMatchObject({ status: 'refused', detail: 'api.gbif.org 503', by: 'gbif' }); // base: Kew not asked; its record lookup, unanswered here, unmarked
  });
  it('the build says Wikidata answered, and keeps the previous identifiers', async () => {
    const t = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(t)) if (k.startsWith(W)) delete t[k];
    Object.assign(t, {
      're:srsearch=haswbstatement%3AP846%3D5384013': { query: { search: [] } },
      [`${W}?action=wbsearchentities`]: { search: [{ id: 'Q5168360', label: 'Copiapoa cinerea' }] },
      [`${W}?action=wbgetentities`]: { entities: { Q5168360: item('Copiapoa cinerea', ['3943541']) } },
      [`${G}/3943541`]: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' }
    });
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(t), builtBy: 'node', now: () => new Date('2026-10-12T12:00:00Z'), prevIds: { gbif: 5384013, wikidata: 'Q5168360', inat: 135254 }, prevIdsOn: '2026-10-01' });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream.wikidata).toMatchObject({ status: 'refused', detail: 'Wikidata answered; GBIF, asked to check the item it gave, refused the request (api.gbif.org 429); the identifiers of the build of 2026-10-01 are kept' }); // base: "api.gbif.org 429; the identifiers …"
    expect(r.dossier.ids.wikidata).toBe('Q5168360');
  });
});

describe('Kew\'s identifiers for a name and author', () => {
  it('are asked of GBIF\'s copy of WCVP by the exact name, and read only for the backbone\'s publishing author', async () => {
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: kew('Spiraea japonica', [['Spiraea japonica Raf.', 'Raf.', 'SYNONYM', '742321-1'], ['Spiraea japonica Cambess.', 'Cambess.', 'DOUBTFUL', '2993235-4'], ['Spiraea japonica L.f.', 'L.f.', 'ACCEPTED', '742319-1'], ['Spiraea japonica Siebold ex Blume', 'Siebold ex Blume', 'MISAPPLIED', '742320-1']]) }; }) as unknown as JsonFetcher;
    const { kewIpni } = gbif;
    expect(await kewIpni(f, 'Spiraea japonica', 'L.fil.')).toEqual({ status: 'ok', data: { ids: ['742319-1'], label: 'Spiraea japonica L.f.', others: [{ id: '742321-1', label: 'Spiraea japonica Raf.' }, { id: '2993235-4', label: 'Spiraea japonica Cambess.' }], acceptedId: '742319-1' } }); // r71: acceptedId (S-B5)
    expect(asked).toEqual([`https://api.gbif.org/v1/species?datasetKey=${WCVP_DATASET}&name=Spiraea%20japonica&limit=50`]);
    // A misapplied name is never the species': with no row by the backbone's author, Kew's one accepted entry stands in.
    expect(await kewIpni(f, 'Spiraea japonica', 'Blume')).toMatchObject({ status: 'ok', data: { ids: ['742319-1'], label: 'Spiraea japonica L.f.' } });
    expect(await kewIpni(f, 'Spiraea japonica')).toMatchObject({ status: 'ok', data: { ids: [] } }); // no author: nothing to compare
  });
  it('the publishing author: outside the parentheses, after any "ex", read loosely', async () => {
    const { sameNameAuthor, publishingAuthor } = await import('$dossier/authors'); // base: no such module
    expect(publishingAuthor('(Warder ex Barney) Warder ex Engelm.')).toBe('engelm');
    expect(sameNameAuthor('Ruenge', 'Runge')).toBe(true);
    expect(sameNameAuthor('L.fil.', 'L.f.')).toBe(true);
    expect(sameNameAuthor('(Hort.) Desc.', '(Anon.) Desc.')).toBe(true);
    expect(sameNameAuthor('(Sprenger) Bruyns', 'J.N.Haage & E.Schmidt')).toBe(false);
    expect(sameNameAuthor('Parkinson ex Du Roi', 'Parkinson')).toBe(false); // the ex-author is not the author (round sixty-nine's rule)
    expect(sameNameAuthor('L.', 'L.f.')).toBe(false);
    expect(sameNameAuthor(undefined, 'L.')).toBe(false);
  });
});
