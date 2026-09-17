import { describe, it, expect } from 'vitest';
import { mergeLists, type Candidate } from '../../scripts/derive-names-lib';

const inat: Candidate[] = [
  { name: 'Epipremnum aureum', accepted: 'Epipremnum aureum', why: 'inat', count: 90000, family: 'Araceae', gbifKey: 1 },
  { name: 'Zea mays', accepted: 'Zea mays', why: 'inat', count: 80000, family: 'Poaceae', gbifKey: 2 },
  { name: 'Lithops aucampiae', accepted: 'Lithops aucampiae', why: 'inat', count: 5000, family: 'Aizoaceae', gbifKey: 3 },
  { name: 'Echeveria × imbricata', accepted: 'Echeveria imbricata', why: 'inat', count: 4000, family: 'Crassulaceae', gbifKey: 4 },
  { name: 'Sedum morganianum', accepted: 'Sedum morganianum', why: 'inat', count: 3000, family: 'Crassulaceae', gbifKey: 5 },
  { name: 'Plantus unresolvedus', why: 'inat', count: 2500 },
  { name: 'Haworthia limifolia var. ubomboensis', accepted: 'Haworthiopsis limifolia', why: 'inat', count: 2000, family: 'Asphodelaceae', gbifKey: 6 },
  { name: 'Crassula ovata', accepted: 'Crassula ovata', why: 'inat', count: 1000, family: 'Crassulaceae', gbifKey: 7 }
];
const genera: Candidate[] = [
  { name: 'Lithops aucampiae', why: 'genus', family: 'Aizoaceae', gbifKey: 3 },
  { name: 'Lithops karasmontana', why: 'genus', family: 'Aizoaceae', gbifKey: 8 },
  { name: 'Pelargonium carnosum', why: 'genus', family: 'Geraniaceae', gbifKey: 9 }
];

describe('deriving the list', () => {
  it('takes every specialist-genus species, then the most-cultivated the budget allows, skipping crops, hybrids and unresolved names', () => {
    const { list, report } = mergeLists(inat, genera, { inat: 3, excludedFamilies: new Set(['poaceae', 'geraniaceae']) });
    expect(list).toEqual(['Epipremnum aureum', 'Haworthiopsis limifolia', 'Lithops aucampiae', 'Lithops karasmontana', 'Pelargonium carnosum', 'Sedum morganianum']);
    // maize is excluded by family; the Echeveria cross is a hybrid; the unresolved name never resolved;
    // the specialist Pelargonium is kept despite its family being excluded for the iNat side;
    // the infraspecific collapsed to its accepted species; Crassula ovata lost out to the budget.
    const why = Object.fromEntries(report.map((r) => [r.name, r.why]));
    expect(why['Lithops aucampiae']).toBe('genus'); // credited to the genus, counted once
    expect(why['Sedum morganianum']).toBe('inat');
    expect(report.find((r) => r.name === 'Epipremnum aureum')?.count).toBe(90000);
    expect(list).not.toContain('Crassula ovata');
  });
  it('the iNat share is on top of the specialist genera, which come whole', () => {
    const { list } = mergeLists(inat, genera, { inat: 0, excludedFamilies: new Set() });
    expect(list).toEqual(['Lithops aucampiae', 'Lithops karasmontana', 'Pelargonium carnosum']);
  });
});

import { indexWcvp } from '../../scripts/derive-names-lib';

describe('indexWcvp', () => {
  const H = 'plant_name_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|taxon_name|accepted_plant_name_id';
  const lines = [
    H,
    '1|Species|Accepted|Cactaceae||Mammillaria||plumosa|Mammillaria plumosa|1',
    '2|Species|Synonym|Cactaceae||Mammillaria||schiedeana|Mammillaria schiedeana|3',
    '3|Species|Accepted|Cactaceae||Mammillaria||magnimamma|Mammillaria magnimamma|3',
    '4|Species|Unplaced|Cactaceae||Mammillaria||dubia|Mammillaria dubia|',
    '5|Species|Accepted|Cactaceae||Mammillaria|×|hybrida|Mammillaria × hybrida|5',
    '6|Variety|Accepted|Cactaceae||Mammillaria||plumosa|Mammillaria plumosa var. minor|6',
    '7|Species|Accepted|Crassulaceae||Aeonium||arboreum|Aeonium arboreum|7',
    '8|Species|Synonym|Crassulaceae||Sempervivum||arboreum|Sempervivum arboreum|7',
    '9|Species|Accepted|Rosaceae||Rosa||canina|Rosa canina|9'
  ];
  const w = indexWcvp(lines, new Set(['Mammillaria', 'Aeonium', 'Nothere']));

  it('keeps only accepted, non-hybrid species of the wanted genera', () => {
    expect(w.genera.map((c) => c.name)).toEqual(['Mammillaria plumosa', 'Mammillaria magnimamma', 'Aeonium arboreum']);
    expect(w.genera[0].family).toBe('Cactaceae');
    expect(w.names).toBe(9);
  });

  it('resolves synonyms and infraspecific names to the accepted species', () => {
    expect(w.resolve('Mammillaria schiedeana')).toEqual({ accepted: 'Mammillaria magnimamma', family: 'Cactaceae' });
    expect(w.resolve('Sempervivum arboreum')).toEqual({ accepted: 'Aeonium arboreum', family: 'Crassulaceae' });
    expect(w.resolve('Mammillaria plumosa var. minor')).toEqual({ accepted: 'Mammillaria plumosa', family: 'Cactaceae' });
    expect(w.resolve('Rosa canina')).toEqual({ accepted: 'Rosa canina', family: 'Rosaceae' });
    expect(w.resolve('Nothing here')).toBeNull();
  });

  it('refuses a file without the WCVP columns', () => {
    expect(() => indexWcvp(['a|b|c', '1|2|3'], new Set())).toThrow(/not a WCVP names file/);
  });
});
