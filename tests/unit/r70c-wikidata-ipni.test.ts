/**
 * Round seventy, the owner's second run (on 70b): `--fill wikidata` listed 86 species for a rebuild, most to lose a right
 * item: "carries IPNI X, where Kew's for <this name and author> is Y" (Fragaria chiloensis, Daphne odora, Salvia
 * splendens and many more). IPNI holds duplicate records of one name (R47-5: 19 of 40 disagreements). An item's IPNI now
 * refuses it only when it is Kew's for another author's name of these words (the homonym: Agave variegata, Albuca
 * longifolia, Raphionacme linearis); any other is no evidence, and the GBIF keys decide, a GBIF record of another
 * author's name refusing as the IPNI would. And:
 *   - Matucana gigantea's item writes its IPNI as an address, which is Kew's identifier once read;
 *   - Ixora coccinea: GBIF's backbone cites it "Comm. ex Lam.", which Kew holds as a synonym of Embothrium coccineum, a
 *     Proteaceae; the page showed Embothrium's range, in Chile, and the item carrying Kew's Ixora coccinea L. was refused
 *     as another author's. Kew's rows are read in the species' family;
 *   - Fragaria virginiana Duchesne went to no item: its item, Q978247, is labelled "Virginia strawberry" and gives the name
 *     as an alias, and carries Miller's 318974-2; Kew files Duchesne's name under Miller's species. Aliases are read as
 *     labels are, and Kew's entry the own row is filed under, of these very words, is this plant.
 * Kew's rows are GBIF's copy of WCVP on 2026-10-14; Q978247's statements are Wikidata's; an item marked "stand-in" has
 * only the statements the case turns on. Each case FAILED on m70b unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { crossIds, ipniId } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import { WcvpIndex, parseWcvpName, parseWcvpDist } from '$dossier/bulk';
import type { JsonFetcher } from '$dossier/fetch';

const W = 'https://www.wikidata.org/w/api.php';
const KEW = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2';
const IXORA = [
  { key: 207774545, scientificName: 'Ixora coccinea Comm. ex Lam.', canonicalName: 'Ixora coccinea', authorship: 'Comm. ex Lam.', taxonomicStatus: 'SYNONYM', acceptedKey: 207619643, accepted: 'Embothrium coccineum J.R.Forst. & G.Forst.', family: 'Proteaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:753843-1' },
  { key: 207776241, scientificName: 'Ixora coccinea L.', canonicalName: 'Ixora coccinea', authorship: 'L.', taxonomicStatus: 'ACCEPTED', family: 'Rubiaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:753844-1' },
  { key: 207776367, scientificName: 'Ixora coccinea Curtis', canonicalName: 'Ixora coccinea', authorship: 'Curtis', taxonomicStatus: 'SYNONYM', acceptedKey: 207776325, accepted: 'Ixora chinensis Lam.', family: 'Rubiaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77242561-1' }
];
const FRAGARIA = [
  { key: 207684596, scientificName: 'Fragaria virginiana Mill.', canonicalName: 'Fragaria virginiana', authorship: 'Mill.', taxonomicStatus: 'ACCEPTED', family: 'Rosaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:318974-2' },
  { key: 207684608, scientificName: 'Fragaria virginiana Duchesne', canonicalName: 'Fragaria virginiana', authorship: 'Duchesne', taxonomicStatus: 'SYNONYM', acceptedKey: 207684597, accepted: 'Fragaria virginiana subsp. virginiana', family: 'Rosaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:725144-1' }
];
const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
const taxon = [claim({ id: 'Q16521' })];
/** Wikidata and GBIF for one species: no item by its key; `search` answers the name; items by id; GBIF records by key. */
function world(o: { name: string; key: number; kew: unknown[]; search: unknown[]; items: Record<string, unknown>; records?: Record<number, unknown> }): JsonFetcher {
  return (async (url: string) => {
    const ok = (data: unknown) => ({ status: 'ok', data });
    if (url.startsWith(KEW)) return ok({ results: o.kew });
    if (url.includes('haswbstatement%3AP846%3D')) return ok({ query: { search: [] } });
    if (url.includes('haswbstatement%3AP961%3D')) return ok({ query: { search: [] } });
    if (url.includes('action=wbsearchentities')) return ok({ search: o.search });
    const ids = /action=wbgetentities&format=json&ids=([^&]+)/.exec(url)?.[1];
    if (ids) return ok({ entities: Object.fromEntries(ids.split('|').map((q) => [q, o.items[q] ?? {}])) });
    const k = /\/species\/(\d+)$/.exec(url)?.[1];
    if (k && o.records?.[Number(k)]) return ok(o.records[Number(k)]);
    return { status: 'none' };
  }) as unknown as JsonFetcher;
}

describe('Kew\'s rows read in the species\' family', () => {
  it('Ixora coccinea "Comm. ex Lam." (Rubiaceae): Kew\'s Ixora coccinea L., not Embothrium coccineum\'s synonym', async () => {
    const f = world({ name: 'Ixora coccinea', key: 8793122, kew: IXORA, search: [], items: {} });
    const k = await gbif.kewIpni(f, 'Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae');
    expect(k.status === 'ok' && k.data.ids).toEqual(['753844-1']); // m70b: 753843-1, Embothrium's synonym
  });
  it('and its label item, carrying Kew\'s 753844-1, is taken (stand-in item)', async () => {
    const f = world({ name: 'Ixora coccinea', key: 8793122, kew: IXORA, search: [{ id: 'Q1', label: 'Ixora coccinea' }], items: { Q1: { claims: { P31: taxon, P225: [claim('Ixora coccinea')], P961: [claim('753844-1')] } } } });
    const r = await crossIds(f, 'Ixora coccinea', 8793122, [], { authorship: 'Comm. ex Lam.', family: 'Rubiaceae' });
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q1', ipni: '753844-1' } }); // m70b: none, "another author's name"
  });
  it('and Kew\'s range is Ixora coccinea L.\'s, not Embothrium coccineum\'s in Chile', () => {
    const H = 'plant_name_id|taxon_status|family|taxon_name|taxon_authors|accepted_plant_name_id|taxon_rank'.split('|');
    const w = new WcvpIndex();
    for (const l of ['207774545|Synonym|Proteaceae|Ixora coccinea|Comm. ex Lam.|207619643|Species', '207619643|Accepted|Proteaceae|Embothrium coccineum|J.R.Forst. & G.Forst.|207619643|Species', '207776241|Accepted|Rubiaceae|Ixora coccinea|L.|207776241|Species', '207776367|Synonym|Rubiaceae|Ixora coccinea|Curtis|207776325|Species']) w.addName(parseWcvpName(H, l), () => true);
    const D = 'plant_name_id|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
    w.addDist(parseWcvpDist(D, '207619643|CLS|Chile South|0|0|0'));
    w.addDist(parseWcvpDist(D, '207776241|IND|India|0|0|0'));
    const got = w.distributions('Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae');
    expect(got && got !== 'ambiguous' && got.rows.map((r) => r.locality)).toEqual(['India']); // m70b: Chile South
  });
  it('with no row of the words in the species\' family, nothing changes (guard: a family named otherwise by the two sources)', async () => {
    const f = world({ name: 'Ixora coccinea', key: 8793122, kew: IXORA, search: [], items: {} });
    const k = await gbif.kewIpni(f, 'Ixora coccinea', 'Comm. ex Lam.', 'Ixoraceae');
    expect(k.status === 'ok' && k.data.ids).toEqual(['753843-1']);
  });
});

describe('an IPNI identifier Kew does not hold for the name is no evidence', () => {
  const item = (ipni: string, keys: string[] = ['111']) => ({ claims: { P31: taxon, P225: [claim('Fragaria chiloensis')], P961: [claim(ipni)], P846: keys.map(claim) } });
  const kew = [{ key: 1, scientificName: 'Fragaria chiloensis (L.) Mill.', canonicalName: 'Fragaria chiloensis', authorship: '(L.) Mill.', taxonomicStatus: 'ACCEPTED', family: 'Rosaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:731960-1' }];
  const record = { key: 111, scientificName: 'Fragaria chiloensis (L.) Mill.', canonicalName: 'Fragaria chiloensis', authorship: '(L.) Mill.', rank: 'SPECIES', kingdom: 'Plantae', taxonomicStatus: 'ACCEPTED' };
  it('an item carrying a duplicate IPNI record of the name is proved by its GBIF key (stand-in item)', async () => {
    const f = world({ name: 'Fragaria chiloensis', key: 3029779, kew, search: [{ id: 'Q2', label: 'Fragaria chiloensis' }], items: { Q2: item('20009040-1') }, records: { 111: record } });
    const r = await crossIds(f, 'Fragaria chiloensis', 3029779, [], { authorship: '(L.) Mill.', family: 'Rosaceae' });
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q2' } }); // m70b: none, "carries IPNI 20009040-1, where Kew's … is 731960-1"
  });
  it('Matucana gigantea\'s IPNI written as an address is Kew\'s identifier', async () => {
    expect(ipniId('https://www.ipni.org/n/77300504-1')).toBe('77300504-1');
    const kewM = [{ key: 2, scientificName: 'Matucana gigantea Bregman, Meerst., Melis & A.B.Pullen', canonicalName: 'Matucana gigantea', authorship: 'Bregman, Meerst., Melis & A.B.Pullen', taxonomicStatus: 'ACCEPTED', family: 'Cactaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77300504-1' }];
    const f = world({ name: 'Matucana gigantea', key: 11458057, kew: kewM, search: [{ id: 'Q3', label: 'Matucana gigantea' }], items: { Q3: { claims: { P31: taxon, P961: [claim('https://www.ipni.org/n/77300504-1')] } } } });
    const r = await crossIds(f, 'Matucana gigantea', 11458057, [], { authorship: 'Bregman, Meerst., Melis & A.B.Pullen', family: 'Cactaceae' });
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q3', ipni: '77300504-1' } }); // m70b: none
  });
  it('a GBIF record of another author\'s name of these words refuses the item, as the IPNI would (guard: Raphionacme linearis)', async () => {
    const f = world({ name: 'Fragaria chiloensis', key: 3029779, kew, search: [{ id: 'Q2', label: 'Fragaria chiloensis' }], items: { Q2: item('20009040-1') }, records: { 111: { ...record, scientificName: 'Fragaria chiloensis Duchesne', authorship: 'Duchesne' } } });
    expect((await crossIds(f, 'Fragaria chiloensis', 3029779, [], { authorship: '(L.) Mill.', family: 'Rosaceae' })).status).toBe('none');
  });
});

describe('Fragaria virginiana Duchesne: its item, by alias and Miller\'s identifier', () => {
  const Q978247 = { claims: { P31: taxon, P225: [claim('Fragaria virginiana')], P846: [claim('3029801')], P961: [claim('318974-2')], P3151: [claim('77155')] } };
  const f = world({ name: 'Fragaria virginiana', key: 7950792, kew: FRAGARIA, search: [{ id: 'Q978247', label: 'Virginia strawberry', match: { type: 'alias', language: 'en', text: 'Fragaria virginiana' } }], items: { Q978247 } });
  it('Kew files Duchesne\'s name under Miller\'s species: Miller\'s identifier is this plant\'s', async () => {
    const k = await gbif.kewIpni(f, 'Fragaria virginiana', 'Duchesne', 'Rosaceae');
    expect(k.status === 'ok' && k.data.ids).toEqual(['725144-1', '318974-2']); // m70b: 725144-1 alone
  });
  it('the item is found by its alias', async () => {
    const r = await crossIds(f, 'Fragaria virginiana', 7950792, [], { authorship: 'Duchesne', family: 'Rosaceae' });
    expect(r).toMatchObject({ status: 'ok', detail: "found by its alias; its IPNI identifier 318974-2 is Kew's for Fragaria virginiana Duchesne", data: { wikidata: 'Q978247', inat: 77155 } }); // m70b: none, with no reason
  });
});
