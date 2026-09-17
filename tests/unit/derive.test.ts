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
    const { list, report } = mergeLists(inat, genera, { target: 6, excludedFamilies: new Set(['poaceae', 'geraniaceae']) });
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
  it('the target bounds the iNat share, not the specialist genera', () => {
    const { list } = mergeLists(inat, genera, { target: 1, excludedFamilies: new Set() });
    expect(list).toEqual(['Lithops aucampiae', 'Lithops karasmontana', 'Pelargonium carnosum']);
  });
});
