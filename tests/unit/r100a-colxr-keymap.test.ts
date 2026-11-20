/**
 * Round one hundred (docs/PLAN-100.md, 1): the key map's pure parts. Every key the five files hold, with each role it
 * has (a Kew page id is not a key; "except:" read off); each of GBIF's three answer shapes recorded as answered (the
 * accepted taxon by identifier, a synonym and its accepted taxon by name, nothing with GBIF's note), never a name filled
 * in; a key the backbone's export does not hold said so and not asked by name; a run carrying on past the keys it wrote.
 *
 * On e89438b: scripts/colxr-keymap-lib.mjs did not exist; every case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { gatherKeys, matchOf, rowOf, keysDone, byIdUrl, byNameUrl, COLUMNS, COLXR } from '../../scripts/colxr-keymap-lib.mjs';

const files: Record<string, string> = {
  'a.txt': '# a comment\t1\n2941344\t× Amelasorbus jackii\tRehder\tRosaceae\tinat 0 + gbif 3\t3030124\n3311876\tx\ty\tz\tw\t-\n',
  'b.txt': '8793122\t2905493\tIxora coccinea L.\tDOUBTFUL\t103356\tx\tentry\t-\t2905349,2905601\n',
  'm.txt': '7530398\tk2781125\tEcheveria peacockii\texcept:5690759\n'
};
const read = (f: string) => files[f];

describe('r100a: the key map', () => {
  it('gathers every key with its roles, and no page id', () => {
    const k = gatherKeys([
      { file: 'a.txt', cols: [[5, 'page']] },
      { file: 'b.txt', cols: [[0, 'extra:holder'], [1, 'extra'], [8, 'extra:except']] },
      { file: 'm.txt', cols: [[0, 'merge'], [1, 'merge'], [3, 'merge:except']] }
    ], read);
    expect([...k.keys()].sort()).toEqual(['2905349', '2905493', '2905601', '3030124', '5690759', '7530398', '8793122'].sort());
    expect([...k.get('5690759')!]).toEqual(['merge:except']);
    expect(k.has('2781125')).toBe(false);
  });
  it('the three answer shapes, as answered', () => {
    const byId = matchOf({ usage: { key: '5ZHP3', name: 'Cochemiea grahamii (Engelm.) Doweld', status: 'ACCEPTED', rank: 'SPECIES' }, diagnostics: { matchType: 'EXACT' } });
    expect(byId).toMatchObject({ id: '5ZHP3', status: 'ACCEPTED', type: 'EXACT', acceptedId: '', note: '' });
    const byName = matchOf({ usage: { key: '3XSBX', name: 'Mammillaria grahamii Engelm.', status: 'SYNONYM' }, acceptedUsage: { key: '5ZHP3', name: 'Cochemiea grahamii (Engelm.) Doweld' }, diagnostics: { matchType: 'EXACT' } });
    expect(byName).toMatchObject({ id: '3XSBX', status: 'SYNONYM', acceptedId: '5ZHP3' });
    const none = matchOf({ diagnostics: { matchType: 'NONE', note: 'No name given' } });
    expect(none).toMatchObject({ id: '', name: '', type: 'NONE', note: 'No name given' });
  });
  it('a row: one cell a column; a key not in the export not asked by name', () => {
    const u = { key: 5384013, status: 'SYNONYM', rank: 'SPECIES', canonical: 'Mammillaria grahamii', author: 'Engelm.', label: 'Mammillaria grahamii Engelm.' };
    const r = rowOf('5384013', new Set(['page']), u, matchOf({ usage: { key: '5ZHP3', name: 'C', status: 'ACCEPTED' }, diagnostics: { matchType: 'EXACT' } }), matchOf({ usage: { key: '3XSBX', name: 'M', status: 'SYNONYM' }, acceptedUsage: { key: '5ZHP3', name: 'C' }, diagnostics: { matchType: 'EXACT' } }), '2026-11-20').split('\t');
    expect(r).toHaveLength(COLUMNS.length);
    expect(r[COLUMNS.indexOf('byname_accepted')]).toBe('5ZHP3 C');
    const s = rowOf('1', new Set(['extra']), undefined, matchOf({ diagnostics: { matchType: 'NONE', note: 'No name given' } }), null, '2026-11-20').split('\t');
    expect(s[2]).toBe('not in the backbone export');
    expect(s[COLUMNS.indexOf('byname_type')]).toBe('not asked');
  });
  it('carries on: the keys a map holds, its header passed by', () => {
    expect([...keysDone('# head\n# key\troles\n5\tpage\n7\textra\n')]).toEqual(['5', '7']);
  });
  it('asks under COL XR, the name with its author encoded', () => {
    expect(byIdUrl('5384013')).toBe(`https://api.gbif.org/v2/species/match?scientificNameID=gbif:5384013&checklistKey=${COLXR}`);
    expect(byNameUrl('Mammillaria grahamii Engelm.')).toContain('scientificName=Mammillaria%20grahamii%20Engelm.&kingdom=Plantae');
  });
});
