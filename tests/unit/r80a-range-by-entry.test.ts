/**
 * Round eighty, agent A: pages without their Kew range (Sixalix atropurpurea, Sechium edule, Soehrensia tarijensis, Talinella
 * grevei, Chamaenerion angustifolium; with Ceropegia angustilobulata and C. juttae, 7 live pages). The WCVP distribution
 * was looked up by GBIF's name, author and family for the key ("Chamaenerion angustifolium (L.) Scop."), which Kew's file
 * does not accept, and the page's own Kew entry by the species list ("Epilobium angustifolium L.", 2790112) was never read:
 * the page showed GBIF's national checklists, "native status not stated", and no habitat climate. Now the bulk fetcher
 * reads the range of the page's own entry by its id where the name reaches another entry or none (`entryOf`,
 * `WcvpIndex.rangeById`), and keeps the name's answer where it reaches the entry or one below it. FAILED on r80f: no
 * `entryOf`, and the answer was GBIF's.
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, parseWcvpName, parseWcvpDist, bulkFetcher } from '../../src/lib/dossier/bulk';
import * as gbif from '../../src/lib/dossier/sources/gbif';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const DIST_H = 'plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
const row = (id: string, rank: string, status: string, name: string, authors: string, acc: string) => NAMES_H.map((h) => ({ plant_name_id: id, taxon_rank: rank, taxon_status: status, family: 'Onagraceae', taxon_name: name, taxon_authors: authors, accepted_plant_name_id: acc } as Record<string, string>)[h] ?? '').join('|');
function index() {
  const w = new WcvpIndex();
  w.addName(parseWcvpName(NAMES_H, row('2790112', 'Species', 'Accepted', 'Epilobium angustifolium', 'L.', '2790112')), () => true);
  w.addName(parseWcvpName(NAMES_H, row('2790113', 'Species', 'Synonym', 'Chamaenerion angustifolium', '(L.) Scop.', '2790112')), () => true);
  w.addName(parseWcvpName(NAMES_H, row('9001', 'Species', 'Accepted', 'Orbea maculata', '(N.E.Br.) L.C.Leach', '9001')), () => true);
  w.addName(parseWcvpName(NAMES_H, row('9002', 'Subspecies', 'Accepted', 'Orbea maculata subsp. rangeana', '(Dinter & A.Berger) Bruyns', '9002')), () => true);
  w.addName(parseWcvpName(NAMES_H, row('9003', 'Species', 'Synonym', 'Ceropegia rangeana', '(Dinter & A.Berger) Bruyns', '9002')), () => true);
  for (const [id, l3] of [['2790112', 'SWE'], ['2790112', 'GRB'], ['9001', 'BOT'], ['9001', 'NAM'], ['9002', 'NAM']]) w.addDist(parseWcvpDist(DIST_H, `${id}|1|EUROPE|10|Northern Europe|${l3}|${l3}|0|0|0`));
  return w;
}
const species = (data: Record<number, Record<string, unknown>>): JsonFetcher => (async (url: string) => {
  const m = /\/species\/(\d+)(\/distributions)?/.exec(url);
  if (m && !m[2] && data[Number(m[1])]) return { status: 'ok', data: data[Number(m[1])] };
  if (m?.[2]) return { status: 'ok', data: { results: [{ country: 'BE', source: 'a national checklist' }] } };
  return { status: 'none' };
}) as unknown as JsonFetcher;
const base = species({ 6428353: { canonicalName: 'Chamaenerion angustifolium', authorship: '(L.) Scop.', family: 'Onagraceae' }, 9430168: { canonicalName: 'Ceropegia rangeana', authorship: '(Dinter & A.Berger) Bruyns', family: 'Apocynaceae' } });

describe("the range of the page's own Kew entry", () => {
  it("Chamaenerion angustifolium reads Epilobium angustifolium L.'s range by its id, and says whose", async () => {
    const f = bulkFetcher(base, { wcvp: index(), entryOf: (k) => (k === 6428353 ? '2790112' : undefined) });
    const d = await gbif.distributions(f, 6428353);
    expect(d.status).toBe('ok');
    if (d.status !== 'ok') return;
    expect(d.data.wcvp).toBe(true);
    expect(d.data.rows.map((r) => r.locationId).sort()).toEqual(['TDWG:GRB', 'TDWG:SWE']);
    expect(d.data.rangeVia).toMatchObject({ kind: 'synonym-of', entry: 'Epilobium angustifolium L.', row: 'Chamaenerion angustifolium (L.) Scop.' });
  });
  it('a name that reaches an entry below the page\'s entry keeps its narrower range (Orbea maculata subsp. rangeana)', async () => {
    const f = bulkFetcher(base, { wcvp: index(), entryOf: () => '9001' });
    const d = await gbif.distributions(f, 9430168);
    expect(d.status === 'ok' && d.data.rows.map((r) => r.locationId)).toEqual(['TDWG:NAM']);
  });
});
