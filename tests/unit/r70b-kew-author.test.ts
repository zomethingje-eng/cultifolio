/**
 * Round seventy, triage-69 B4 (S-B4, S-B5): Kew's rows of the species' own name are read by author and by spelling.
 * Ceropegia macrocarpa (Sprenger) Bruyns (9263110) took Kew's "Ceropegia macrocarpa J.N.Haage & E.Schmidt", another
 * name, and its lack of a range: the page said Kew holds the name with no native range and withheld the climate.
 * Cyphostemma congoensis (Hort.) Desc. (4052649) found no Kew row, though Kew holds it as "Cyphostemma congoense (Anon.)
 * Desc.", with DR Congo. The rows are those of GBIF's copy of WCVP on 2026-10-12, with their WCVP ids (taxonID); GBIF's
 * answers are of the same day. Each case FAILED on the base (526ecaf) unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, bulkFetcher, parseWcvpName, parseWcvpDist } from '$dossier/bulk';
import { distributions } from '$dossier/sources/gbif';
import { buildDossier } from '$dossier/build';
import { kewRebuildList } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';
import { readFileSync } from 'node:fs';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const DIST_H = 'plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
/** One WCVP names line: id, IPNI, status, name, authors, accepted id. */
const row = (id: string, ipni: string, status: string, name: string, authors: string, acc: string) =>
  [id, ipni, 'Species', status, '', '', name.split(' ')[0], '', name.split(' ')[1], '', '', '', '', '', '', '', '', '', '', '', '', name, authors, acc, '', '', '', '', `urn:lsid:ipni.org:names:${ipni}`, '', 'Y'].join('|');

function kew(): WcvpIndex {
  const w = new WcvpIndex();
  for (const l of [
    row('502821', '77238679-1', 'Unplaced', 'Ceropegia macrocarpa', 'J.N.Haage & E.Schmidt', ''),
    row('507396', '98799-1', 'Synonym', 'Huernia penzigii', 'N.E.Br.', '507380'),
    row('507380', '98787-1', 'Accepted', 'Huernia macrocarpa', '(A.Rich.) Schweinf. ex K.Schum.', '507380'),
    row('2752686', '68089-1', 'Accepted', 'Cyphostemma congoense', '(Anon.) Desc.', '2752686'),
    row('2361173', '151043-2', 'Accepted', 'Mammillaria grusonii', 'Runge', '2361173'),
    row('2445067', '1020203-1', 'Accepted', 'Graptopetalum paraguayense', '(N.E.Br.) E.Walther', '2445067')
  ]) w.addName(parseWcvpName(NAMES_H, l), () => true);
  for (const d of ['507380|2|AFRICA|24|Northeast Tropical Africa|ETH|Ethiopia|0|0|0', '2752686|2|AFRICA|23|West-Central Tropical Africa|ZAI|Zaïre|0|0|0', '2361173|7|NORTHERN AMERICA|79|Mexico|MXE|Mexico Northeast|0|0|0']) w.addDist(parseWcvpDist(DIST_H, d));
  return w;
}

/** The backbone's records and synonyms of the three species, and GBIF's own distribution answers (2026-10-12). */
const BACKBONE: Record<number, { canonicalName: string; authorship: string; synonyms: unknown[]; distributions: unknown[] }> = {
  9263110: { canonicalName: 'Ceropegia macrocarpa', authorship: '(Sprenger) Bruyns', synonyms: [{ key: 8596233, canonicalName: 'Huernia penzigii', authorship: 'Baker', rank: 'SPECIES', taxonomicStatus: 'HOMOTYPIC_SYNONYM' }, { key: 3571041, canonicalName: 'Huernia penzigii', authorship: 'Baker ex Penz.', rank: 'SPECIES', taxonomicStatus: 'SYNONYM' }], distributions: [{ locationId: 'TDWG:ETH', locality: 'Ethiopia', source: 'World Checklist of Vascular Plants' }] },
  4052649: { canonicalName: 'Cyphostemma congoensis', authorship: '(Hort.) Desc.', synonyms: [{ key: 4052655, canonicalName: 'Cyphostemma congoense', authorship: '(Hort.) Desc.', rank: 'SPECIES', taxonomicStatus: 'SYNONYM' }, { key: 5658447, canonicalName: 'Vitis congoensis', authorship: 'Hort.', rank: 'SPECIES', taxonomicStatus: 'SYNONYM' }], distributions: [{ locality: 'Congo [Brazzaville]', source: 'Catalogue of Life' }] },
  8429321: { canonicalName: 'Mammillaria grusonii', authorship: 'Ruenge', synonyms: [], distributions: [] }
};
const api: JsonFetcher = (async (url: string) => {
  let m: RegExpExecArray | null;
  if ((m = /\/species\/(\d+)\/synonyms/.exec(url))) return { status: 'ok', data: { results: BACKBONE[Number(m[1])].synonyms, endOfRecords: true } };
  // GBIF's own answer, for a name the files do not settle; the WCVP row in Ceropegia's stands in for one GBIF attaches by name.
  if ((m = /\/species\/(\d+)\/distributions/.exec(url))) return { status: 'ok', data: { results: BACKBONE[Number(m[1])].distributions } };
  if ((m = /\/species\/(\d+)$/.exec(url))) { const b = BACKBONE[Number(m[1])]; return { status: 'ok', data: { key: Number(m[1]), canonicalName: b.canonicalName, scientificName: `${b.canonicalName} ${b.authorship}`, authorship: b.authorship } }; }
  return { status: 'none' };
}) as unknown as JsonFetcher;
const range = (key: number) => distributions(bulkFetcher(api, { wcvp: kew() }) as JsonFetcher, key);

describe('Kew\'s rows of the species\' own name, by author and by spelling', () => {
  it('Ceropegia macrocarpa (Sprenger) Bruyns is not Kew\'s "Ceropegia macrocarpa J.N.Haage & E.Schmidt", and that row\'s lack of a range is not its answer', async () => {
    const r = await range(9263110);
    expect(r).toEqual({ status: 'none', detail: 'Kew holds Ceropegia macrocarpa only under another author (Ceropegia macrocarpa J.N.Haage & E.Schmidt), which is another name' }); // base: ok, held "Ceropegia macrocarpa J.N.Haage & E.Schmidt", no range
  });
  it('Cyphostemma congoensis (Hort.) Desc. is Kew\'s Cyphostemma congoense (Anon.) Desc., with DR Congo', async () => {
    const r = await range(4052649);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.wcvp).toBe(true); // base: false, Congo [Brazzaville] from the national checklists
    expect(r.data.rows.map((d) => d.locationId)).toEqual(['TDWG:ZAI']);
  });
  it('Mammillaria grusonii Ruenge is Kew\'s Mammillaria grusonii Runge (guard)', async () => {
    const r = await range(8429321);
    expect(r.status === 'ok' && r.data.rows.map((d) => d.locationId)).toEqual(['TDWG:MXE']);
  });
  it('Kew\'s one accepted entry under the words stands in when Kew cites the author otherwise (guard: 7 of 150 species sampled)', () => {
    expect(kew().accepted('Graptopetalum paraguayense', '(N.E.Br.) Walther')).toMatchObject({ id: '2445067' });
  });
  it('the index: rows by another author are not the species\' own, and a misapplied name never is', () => {
    const w = kew();
    expect(w.holds('Ceropegia macrocarpa', '(Sprenger) Bruyns')).toBe(false); // base: true
    expect(w.ownRows('Ceropegia macrocarpa', '(Sprenger) Bruyns').others.map((r) => r.authors)).toEqual(['J.N.Haage & E.Schmidt']);
    expect(w.holds('Ceropegia macrocarpa')).toBe(true); // no author from the backbone: every row under the words, as before (guard)
    w.addName(parseWcvpName(NAMES_H, row('9', '9-1', 'Misapplied', 'Aus bus', 'L.', '9')), () => true);
    expect(w.accepted('Aus bus', 'L.')).toBeUndefined();
  });
  it('older names that reach one entry with no range give no range (guard; mutation K8)', () => {
    const w = kew();
    w.addName(parseWcvpName(NAMES_H, row('8', '8-1', 'Accepted', 'Aus bus', 'L.', '8')), () => true);
    w.addName(parseWcvpName(NAMES_H, row('7', '7-1', 'Synonym', 'Bus aus', 'Mill.', '8')), () => true);
    expect(w.viaOlderNames([{ name: 'Bus aus', authorship: 'Mill.' }])).toBeNull();
  });
  it('the build records why Kew\'s row was not taken', async () => {
    const f = (async (url: string) => (/\/distributions/.test(url) ? { status: 'ok', data: { results: [], otherAuthor: 'Kew holds Aus bus only under another author (Aus bus Mill.), which is another name' } } : /\/species\/1$/.test(url) ? { status: 'ok', data: { key: 1, canonicalName: 'Aus bus', scientificName: 'Aus bus L.', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED' } } : { status: 'none' })) as unknown as JsonFetcher;
    const r = await buildDossier(1, { fetcher: f, builtBy: 'node', skip: ['wikidata', 'wikipedia', 'inat', 'commons', 'openalex', 'gbif.media'] });
    expect(r.ok && r.dossier.upstream['wcvp.distribution']).toMatchObject({ status: 'none', detail: 'Kew holds Aus bus only under another author (Aus bus Mill.), which is another name' }); // base: none, no reason
  });
});

describe('the corpus step: the species whose Kew entry the rule reads differently are listed for a rebuild', () => {
  it('Ceropegia macrocarpa and Cyphostemma congoensis are, Mammillaria grusonii is not', () => {
    const docs: Record<string, unknown> = {
      '9263110.json': { key: 9263110, name: { scientific: 'Ceropegia macrocarpa', authorship: '(Sprenger) Bruyns' } },
      '4052649.json': { key: 4052649, name: { scientific: 'Cyphostemma congoensis', authorship: '(Hort.) Desc.' } },
      '8429321.json': { key: 8429321, name: { scientific: 'Mammillaria grusonii', authorship: 'Ruenge' } }
    };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => docs[k] as T, write: () => {} };
    expect(kewRebuildList(store, kew())).toEqual([
      "9263110 Ceropegia macrocarpa\tKew's entry for Ceropegia macrocarpa (Sprenger) Bruyns was Ceropegia macrocarpa J.N.Haage & E.Schmidt, is now none",
      "4052649 Cyphostemma congoensis\tKew's entry for Cyphostemma congoensis (Hort.) Desc. was none, is now Cyphostemma congoense (Anon.) Desc."
    ]); // base: no kewRebuildList
  });
  it('the script lists them with --list-rebuild --bulk', () => {
    const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(script).toMatch(/const kew = kewRebuildList\(store, wcvp\);/);
    expect(script).toMatch(/if \(args\.includes\('--list-rebuild'\)\) return listRebuild\(\);/);
  });
});
