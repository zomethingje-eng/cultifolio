import { describe, it, expect } from 'vitest';
import { refusedNames, spellingsOf, candidates } from '../../scripts/reconcile-names-lib';

const report = `[1/5] ✓ Abelia chinensis [5599251] 100 photos, 121 open/239 restricted in range, climate ok (1435 ms)
[2/5] ✗ Cotyledon mckayi: name-unresolved
[3/5] ✗ Zephyranthes formosissima: higher-rank-only (backbone offered Zephyranthes (genus))
✗ Anacis verticillata: name-unresolved

9200 built, 0 kept of 9471`;

const wcvp = [
  'plant_name_id|taxon_rank|taxon_status|family|genus|taxon_name|accepted_plant_name_id',
  '1|Species|Accepted|Crassulaceae|Adromischus|Adromischus mckayi|1',
  '2|Species|Synonym|Crassulaceae|Cotyledon|Cotyledon mckayi|1',
  '3|Species|Synonym|Crassulaceae|Adromischus|Adromischus alveolatus|1',
  '4|Variety|Synonym|Crassulaceae|Adromischus|Adromischus mckayi var. minor|1',
  '5|Species|Accepted|Amaryllidaceae|Zephyranthes|Zephyranthes formosissima|5',
  '6|Species|Synonym|Amaryllidaceae|Sprekelia|Sprekelia formosissima|5',
  '7|Species|Synonym|Amaryllidaceae|Amaryllis|Amaryllis formosissima|5',
  '8|Species|Accepted|Asteraceae|Anacis|Anacis other|8'
];

describe('reconcile-names', () => {
  it('reads the refused names and reasons out of a report, with or without progress counters', () => {
    expect(refusedNames(report)).toEqual([
      { name: 'Cotyledon mckayi', reason: 'name-unresolved' },
      { name: 'Zephyranthes formosissima', reason: 'higher-rank-only (backbone offered Zephyranthes (genus))' },
      { name: 'Anacis verticillata', reason: 'name-unresolved' }
    ]);
  });
  it('finds the accepted name and the species-rank synonyms in WCVP', () => {
    const s = spellingsOf(wcvp, ['Cotyledon mckayi', 'Zephyranthes formosissima', 'Anacis verticillata']);
    expect(s.get('Cotyledon mckayi')).toEqual({ accepted: 'Adromischus mckayi', acceptedStatus: 'Accepted', synonyms: ['Adromischus alveolatus'] });
    expect(candidates('Cotyledon mckayi', s.get('Cotyledon mckayi')!)).toEqual(['Adromischus mckayi', 'Adromischus alveolatus']);
    // An accepted name offers only its synonyms, never itself; the variety is left out.
    expect(candidates('Zephyranthes formosissima', s.get('Zephyranthes formosissima')!)).toEqual(['Sprekelia formosissima', 'Amaryllis formosissima']);
    expect(s.get('Anacis verticillata')?.unknown).toBe(true);
    expect(candidates('Anacis verticillata', s.get('Anacis verticillata')!)).toEqual([]);
  });
});
