/**
 * Round eighty, agent A (review-w 3): Xanthoceras sorbifolium Bunge (Kew, Sapindaceae) was given GBIF's 9479204, "Xanthoceras
 * sorbifolium (A.Braun) Holub", which GBIF files under a doubtful genus Xanthoceras in Poaceae: the page showed Poaceae
 * and three records of that name. Round eighty's homonym check read authors only, and Kew's file holds no "(A.Braun) Holub".
 * Now a usage GBIF files in another order than Kew's family, while GBIF's accepted genus of the name is in Kew's family's
 * order, is not taken (`familyRefuses`). Of the list's 46,022 keyed lines, that one only (the live index's families,
 * GBIF's orders of the 437 families): Bdallophytum americanum, whose genus GBIF too files in Rafflesiaceae, keeps its key,
 * and segregate families of one order (Thesiaceae for Santalaceae) are not refused. FAILED on r80f: no `familyRefuses`,
 * and the committed list gave 9479204.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../../scripts/select-species-lib';

// A line of the backbone export: id, parent, basionym, is_synonym, status, rank, nom_status, constituent, origin, source,
// kingdom, phylum, class, order, family, genus, species, name id, scientific name, canonical name.
const line = (id: string, status: string, rank: string, order: string, family: string, sci: string, canon: string) => [id, '\\N', '\\N', 'f', status, rank, '\\N', '\\N', 'SOURCE', '\\N', '6', '7707728', '220', order, family, '\\N', '\\N', '\\N', sci, canon].join('\t');
const export_ = [
  line('3073', 'ACCEPTED', 'FAMILY', '1369', '3073', 'Poaceae', 'Poaceae'),
  line('6657', 'ACCEPTED', 'FAMILY', '933', '6657', 'Sapindaceae', 'Sapindaceae'),
  line('2507', 'ACCEPTED', 'FAMILY', '1183', '2507', 'Santalaceae', 'Santalaceae'),
  line('9999', 'ACCEPTED', 'FAMILY', '1183', '9999', 'Thesiaceae', 'Thesiaceae'),
  line('7102209', 'DOUBTFUL', 'GENUS', '1369', '3073', 'Xanthoceras', 'Xanthoceras'),
  line('9564431', 'ACCEPTED', 'GENUS', '933', '6657', 'Xanthoceras Bunge', 'Xanthoceras'),
  line('5334500', 'ACCEPTED', 'GENUS', '1183', '9999', 'Buckleya Torr.', 'Buckleya'),
  line('9479204', 'ACCEPTED', 'SPECIES', '1369', '3073', 'Xanthoceras sorbifolium (A.Braun) Holub', 'Xanthoceras sorbifolium'),
  line('5334508', 'ACCEPTED', 'SPECIES', '1183', '9999', 'Buckleya distichophylla (Nutt.) Torr.', 'Buckleya distichophylla')
];
const taxa = lib.backboneTaxa(export_.map(lib.backboneHigher));
const byWords = new Map<string, lib.BackboneName[]>();
for (const l of export_) { const b = lib.backboneLine(l); if (b) byWords.set(lib.words(b.name), [...(byWords.get(lib.words(b.name)) ?? []), b]); }
const row = (id: string, name: string, authors: string, family: string) => ({ id, rank: 'Species', status: 'Accepted', family, genus: name.split(' ')[0], name, authors, acc: id, parent: '', powo: '', hybrid: false });

describe("a GBIF key filed outside Kew's genus's order is not the list's", () => {
  it('reads the order and family keys of each usage, and the families and genera', () => {
    expect(lib.backboneLine(export_[7])).toMatchObject({ key: '9479204', familyKey: '3073', orderKey: '1369' });
    expect(taxa.familyOrders.get('sapindaceae')).toEqual(new Set(['933']));
    expect(taxa.genusOrders.get('xanthoceras')).toEqual(new Set(['933'])); // the doubtful Poaceae genus is not read
  });
  it("Xanthoceras sorbifolium Bunge reads no key: GBIF's accepted genus is in Sapindales, the key in Poales", () => {
    const x = row('2467608', 'Xanthoceras sorbifolium', 'Bunge', 'Sapindaceae');
    expect(lib.gbifKeyFor(x, byWords)).toBe('9479204');
    expect(lib.familyRefuses(x, lib.backboneLine(export_[7])!, taxa)).toBe(true);
    expect(lib.gbifKeyFor(x, byWords, undefined, taxa)).toBeNull();
  });
  it('a segregate family of the same order is not refused, nor a usage with nothing to read', () => {
    const b = row('2685255', 'Buckleya distichophylla', '(Nutt.) Torr.', 'Santalaceae');
    expect(lib.gbifKeyFor(b, byWords, undefined, taxa)).toBe('5334508');
    expect(lib.familyRefuses(row('1', 'Nemo nemo', 'L.', 'Unknownaceae'), { orderKey: '1' }, taxa)).toBe(false);
  });
  it('the committed list gives Xanthoceras sorbifolium no key, and says why', () => {
    const text = readFileSync('scripts/species-list.txt', 'utf8');
    const e = lib.parseSpeciesList(text).find((x) => x.kewId === '2467608')!;
    expect(e.gbifKey).toBeNull();
    expect(text).toContain('familyRefuses');
  });
});
