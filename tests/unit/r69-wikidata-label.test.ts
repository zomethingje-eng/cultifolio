/**
 * Round sixty-nine, the owner's rebuild of 277 species: nine lost their Wikidata item (and with it POWO, IPNI and World
 * Flora Online) to the label rule of triage-68 M7, which took an item found by its label only when it carried this
 * species' GBIF key or a same-type older name's. Wikidata's items for common species often carry another GBIF record of
 * the same name: Q146400, Solanum nigrum, carries 2932865, "Solanum nigrum Forssk.", where the backbone's species is
 * 9150405, Solanum nigrum L. That key now proves the item when GBIF gives its record under the same name, or as a synonym
 * of the species. Oxalis corniculata's label also answered two items that are not taxa (prints of the plant); those are
 * passed over. The items and records are Wikidata's and GBIF's on 2026-10-12, in part. Each "taken" case FAILED on the
 * deployed round sixty-nine; each "not taken" case is a guard.
 */
import { describe, it, expect } from 'vitest';
import { crossIds } from '$dossier/sources/wikimedia';
import { fixtureFetcher } from '$dossier/fetch';

const W = 'https://www.wikidata.org/w/api.php';
const G = 'https://api.gbif.org/v1/species';
const claim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
const taxon = (name: string, keys: string[] = [], extra: Record<string, unknown> = {}) => ({ claims: { P225: claim(name), ...(keys.length ? { P846: keys.flatMap((k) => claim(k)) } : {}), P31: claim({ id: 'Q16521' }), ...extra } });
/** No item by the species' own key, then the label search, then each item read by its id. */
const wd = (label: string, hits: string[], items: Record<string, unknown>, gbif: Record<string, unknown> = {}) => fixtureFetcher({
  're:list=search&srlimit=2&srsearch=haswbstatement': { query: { search: [] } },
  [`${W}?action=wbsearchentities`]: { search: hits.map((id) => ({ id, label })) },
  ...Object.fromEntries(Object.entries(items).map(([id, e]) => [`re:wbgetentities&format=json&ids=${id}&`, { entities: { [id]: e } }])),
  ...gbif
});

describe('an item found by its label, carrying another GBIF record', () => {
  it('taken: the record is GBIF\'s of the same name (Solanum nigrum)', async () => {
    const f = wd('Solanum nigrum', ['Q146400'], { Q146400: taxon('Solanum nigrum', ['2932865']) }, { [`${G}/2932865`]: { key: 2932865, scientificName: 'Solanum nigrum Forssk.', canonicalName: 'Solanum nigrum', kingdom: 'Plantae', taxonomicStatus: 'DOUBTFUL' } });
    expect(await crossIds(f, 'Solanum nigrum', 9150405)).toMatchObject({ status: 'ok', data: { wikidata: 'Q146400' }, detail: "found by its label; its GBIF key 2932865 is GBIF's record of Solanum nigrum Forssk., the same name" }); // base: none
  });
  it('taken: the record is a synonym of this species (Tabernaemontana pandacaqui)', async () => {
    const f = wd('Tabernaemontana pandacaqui', ['Q14862280'], { Q14862280: taxon('Tabernaemontana pandacaqui', ['3615270']) }, { [`${G}/3615270`]: { key: 3615270, scientificName: 'Tabernaemontana pandacaqui Poir.', canonicalName: 'Tabernaemontana pandacaqui', kingdom: 'Plantae', taxonomicStatus: 'SYNONYM', acceptedKey: 7792065 } });
    expect((await crossIds(f, 'Tabernaemontana pandacaqui', 7792065)).status).toBe('ok'); // base: none
  });
  it('taken: the one taxon among items with the label, a print of the plant passed over (Oxalis corniculata)', async () => {
    const f = wd('Oxalis corniculata', ['Q162795', 'Q52515621'], { Q162795: taxon('Oxalis corniculata', ['2891729']), Q52515621: { claims: { P31: claim({ id: 'Q11835431' }) } } }, { [`${G}/2891729`]: { key: 2891729, scientificName: 'Oxalis corniculata L.', canonicalName: 'Oxalis corniculata', kingdom: 'Plantae' } });
    expect(await crossIds(f, 'Oxalis corniculata', 8427624)).toMatchObject({ status: 'ok', data: { wikidata: 'Q162795' } }); // base: ambiguous
  });
  it('not taken (guard): the record is GBIF\'s of another name', async () => {
    const f = wd('Prunus armeniaca', ['Q37453'], { Q37453: taxon('Prunus armeniaca', ['3021880']) }, { [`${G}/3021880`]: { key: 3021880, scientificName: 'Padus rufula Wooton & Standl.', canonicalName: 'Padus rufula', kingdom: 'Plantae', acceptedKey: 10346573 } });
    const r = await crossIds(f, 'Prunus armeniaca', 7818643);
    expect(r).toMatchObject({ status: 'none', detail: "not taken: the item labelled Prunus armeniaca, Q37453, carries GBIF key 3021880, GBIF's record of another name" });
  });
  it('not taken (guard): the same name in another kingdom', async () => {
    const f = wd('Aus bus', ['Q9'], { Q9: taxon('Aus bus', ['9']) }, { [`${G}/9`]: { key: 9, scientificName: 'Aus bus Smith', canonicalName: 'Aus bus', kingdom: 'Animalia' } });
    expect((await crossIds(f, 'Aus bus', 1)).status).toBe('none');
  });
  it('not taken (guard): two taxa that both qualify', async () => {
    const f = wd('Aus bus', ['Q1', 'Q2'], { Q1: taxon('Aus bus', ['1']), Q2: taxon('Aus bus', ['2']) }, { [`${G}/2`]: { key: 2, scientificName: 'Aus bus L.', canonicalName: 'Aus bus', kingdom: 'Plantae' } });
    expect((await crossIds(f, 'Aus bus', 1)).status).toBe('ambiguous');
  });
  it('GBIF not answering is the answer (guard): the step is asked again, the previous identifiers kept', async () => {
    const f = wd('Solanum nigrum', ['Q146400'], { Q146400: taxon('Solanum nigrum', ['2932865']) }, { [`${G}/2932865`]: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' } });
    expect(await crossIds(f, 'Solanum nigrum', 9150405)).toMatchObject({ status: 'refused', detail: 'api.gbif.org 429' });
  });
});
