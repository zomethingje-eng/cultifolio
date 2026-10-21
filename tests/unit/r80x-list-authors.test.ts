/**
 * Round eighty, agent X (agent R's finding): a list line's GBIF key is never a homonym's. The list gave "Gymnosporia
 * acuminata Hook.f. ex M.A.Lawson" (Kew 2836016) GBIF's key 3791985, "Gymnosporia acuminata (L.fil.) Szyszyl.", the one
 * accepted usage of the words: Kew's file holds that name as illegitimate, filed under Maytenus acuminata, another plant,
 * whose records the page would have read. `gbifKeyFor` given Kew's file leaves out a usage Kew reads, by GBIF's author, as
 * another species' name (`kewReadsElsewhere`). Across the 37,105 lines whose key the list chose by the name, 20 such keys
 * (`scripts/dev/r80x-list-rules.ts --authors`, on Kew's file of 2026-06-04 and the backbone export): 19 lines read no key
 * now, and Prunus glandulosa Thunb. takes GBIF's usage of Kew's author (3022160, doubtful). The 8,937 reference pages'
 * own keys are not chosen by the name, and are not changed. FAILED on r80base: the key was 3791985, and no
 * `kewReadsElsewhere`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../../scripts/select-species-lib';

const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const row = (id: string, status: string, name: string, authors: string, acc: string) => H.split('|').map((h) => ({ plant_name_id: id, taxon_rank: 'Species', taxon_status: status, family: 'Celastraceae', genus: name.split(' ')[0], species: name.split(' ')[1], taxon_name: name, taxon_authors: authors, accepted_plant_name_id: acc } as Record<string, string>)[h] ?? '').join('|');
// Kew's rows of 2026-06-04 for the two names.
const kew = lib.loadKew([H, row('2836016', 'Accepted', 'Gymnosporia acuminata', 'Hook.f. ex M.A.Lawson', '2836016'), row('2836017', 'Illegitimate', 'Gymnosporia acuminata', '(L.f.) Szyszył.', '2360109'), row('2360109', 'Accepted', 'Maytenus acuminata', '(L.f.) Loes.', '2360109'), row('2959828', 'Accepted', 'Prunus glandulosa', 'Thunb.', '2959828'), row('2959829', 'Unplaced', 'Prunus glandulosa', 'Torr. & A.Gray', '')]);
const b = (key: string, name: string, author: string, status: string) => ({ key, name, author, status });
const byWords = new Map([
  ['gymnosporia acuminata', [b('3791985', 'Gymnosporia acuminata', '(L.fil.) Szyszyl.', 'ACCEPTED'), b('7662985', 'Gymnosporia acuminata', 'Hook.fil. ex M.A.Lawson', 'HETEROTYPIC_SYNONYM')]],
  ['prunus glandulosa', [b('7733613', 'Prunus glandulosa', 'Torr. & A.Gray', 'ACCEPTED'), b('3022160', 'Prunus glandulosa', 'Thunb.', 'DOUBTFUL')]]
]);
const reads = (lib as { kewReadsElsewhere?: typeof lib.kewReadsElsewhere }).kewReadsElsewhere;

describe('round eighty, X: a GBIF key Kew reads as another species\' name is not the list\'s', () => {
  it('a homonym is not taken; a usage of Kew\'s own author is', () => {
    expect(reads).toBeTypeOf('function');
    const g = kew.rows.get('2836016')!, p = kew.rows.get('2959828')!;
    expect(reads!(kew, byWords.get('gymnosporia acuminata')![0], g)).toBe(true);
    expect(lib.gbifKeyFor(g, byWords)).toBe('3791985'); // round seventy-eight's rule, without Kew's file
    expect(lib.gbifKeyFor(g, byWords, kew)).toBeNull(); // no accepted or doubtful usage of Kew's author
    expect(lib.gbifKeyFor(p, byWords, kew)).toBe('3022160'); // the doubtful usage of Kew's author
    // A usage whose author Kew's file reads to no row says nothing, and is taken as before.
    expect(reads!(kew, b('1', 'Prunus glandulosa', 'Hort.', 'ACCEPTED'), p)).toBe(false);
  });
  it('a hybrid\'s author is read from the backbone export (the scientific name carries the sign, the canonical not)', () => {
    const line = ['3935403', '\\N', '\\N', 'f', 'ACCEPTED', 'SPECIES', '{}', '', '', '', '6', '', '', '', '', '', '', '', 'Plagianthus ×cymosus Cockayne & Allan', 'Plagianthus cymosus'].join('\t');
    expect(lib.backboneLine(line)).toMatchObject({ key: '3935403', name: 'Plagianthus cymosus', author: 'Cockayne & Allan' });
  });
  it('the committed list: the 20 lines, 19 with no key and Prunus glandulosa by Kew\'s author', () => {
    const list = lib.parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8'));
    const by = new Map(list.map((e) => [e.kewId, e.gbifKey]));
    for (const id of ['3320793', '500245', '2727610', '2760205', '2800308', '2836016', '3234994', '2841926', '2861129', '2344177', '2534334', '2551191', '2546982', '2953596', '2525426', '2975950', '3032634', '2476687', '2455213']) expect(by.get(id), id).toBeNull();
    expect(by.get('2959828')).toBe(3022160);
    expect(list.filter((e) => e.gbifKey != null).length).toBe(46022);
  });
});
