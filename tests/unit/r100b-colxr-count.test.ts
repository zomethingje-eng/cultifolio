/**
 * Round one hundred (docs/PLAN-100.md, 2): the dry-run count's pure parts. A page's COL XR taxon is the key map's match by
 * identifier; a page with none is counted as none, never matched by name; a taxon whose name is not the page's is said; two
 * pages reaching one taxon are listed together; an other key is counted onto nothing, onto its own page's taxon, onto
 * another page's (with both named), or onto a taxon of its own; extra-keys.txt names its page by the page's key, the Kew
 * and infra files by k<plant_name_id>, and the infra file's second except column is read.
 *
 * On 4e7d326: scripts/dev/r100-colxr-count-lib.mjs did not exist; every case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readMap, readPages, readOtherKeys, nameWords, count, recordsMoved } from '../../scripts/dev/r100-colxr-count-lib.mjs';

const row = (key: string, col: string, colName: string, note = '') =>
  [key, 'page', 'x', 'ACCEPTED', 'SPECIES', col ? 'EXACT' : 'NONE', col, colName, col ? 'ACCEPTED' : '', '', note, '', '', '', '', '', '', '2026-11-20'].join('\t');
const MAP = ['# header', row('1', 'AAA', 'Aus bus L.'), row('2', 'BBB', 'Cus dus (L.) Mill.'), row('3', 'CCC', 'Eus fus L.'), row('4', 'CCC', 'Eus fus L.'),
  row('5', '', '', 'No name given'), row('10', 'AAA', 'Aus bus L.'), row('11', 'CCC', 'Eus fus L.'), row('12', 'ZZZ', 'Zus zus L.'), row('13', '', '', 'No name given'),
  row('20', 'AAA', 'Aus bus L.'), row('21', 'BBB', 'Cus dus (L.) Mill.'), row('22', 'YYY', 'Yus yus L.')].join('\n');
const PAGES = ['# plant_name_id\tname\tauthor\tfamily\treason\tgbif_key', '101\tAus bus\tL.\tF\tr\t1', '102\tGus hus\tL.\tF\tr\t2', '103\t× Eus fus\tL.\tF\tr\t3',
  '104\tEus gus\tL.\tF\tr\t4', '105\tIus jus\tL.\tF\tr\t5', '106\tKus lus\tL.\tF\tr\t-'].join('\n');

describe('r100b: the dry-run count', () => {
  const map = readMap(MAP);
  const pages = readPages(PAGES);
  it('reads the pages, a "-" key as none', () => {
    expect(pages.map((p) => p.key)).toEqual(['1', '2', '3', '4', '5', '']);
    expect(pages[0].id).toBe('k101');
  });
  it('compares names without author or hybrid sign', () => {
    expect(nameWords('× Eus fus')).toBe('eus fus');
    expect(nameWords('Eus fus (L.) Mill.')).toBe('eus fus');
    expect(nameWords('Mentha × piperita L.')).toBe('mentha piperita');
  });
  it('counts pages: none, own name, another name, shared, one to one', () => {
    // The lib is JavaScript; its result is read here without types (svelte-check reads its empty starting values as never).
    const r = count(map, pages, []) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(r.noKey).toBe(1);
    expect(r.none.map((x: { page: string; note: string }) => [x.page, x.note])).toEqual([['k105', 'No name given']]);
    expect(r.same).toBe(2); // Aus bus, × Eus fus
    expect(r.otherName.map((x: { page: string }) => x.page)).toEqual(['k102', 'k104']);
    expect(r.oneToOne).toBe(2); // AAA, BBB
    expect(r.shared).toHaveLength(1);
    expect(r.shared[0].col).toBe('CCC');
    expect(r.shared[0].pages).toHaveLength(2);
  });
  it('places each other key by its page, in each file\'s form', () => {
    const others = readOtherKeys([
      { file: 'extra-keys.txt', text: '# c\n1\t10,11\tn\ts\tr\tk\th\t-\t12,13\n' },
      { file: 'extra-keys-kew.txt', text: 'k102\t21\tn\ts\tr\tk\th\t-\t-\n' },
      { file: 'extra-keys-infra.txt', text: 'k106\t22\tn\ts\tr\tk\th\t-\t20\t1\t11\n' }
    ], pages);
    expect(others.map((o: { key: string; page: string; kind: string }) => `${o.key}:${o.page}:${o.kind}`)).toEqual(['10:k101:extra', '11:k101:extra', '12:k101:except', '13:k101:except', '21:k102:extra', '22:k106:extra', '20:k106:except', '11:k106:except']);
    const r = count(map, pages, others) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(r.others['extra-keys.txt extra']).toMatchObject({ n: 2, ownPage: 1, otherPage: 1 });
    expect(r.others['extra-keys.txt extra'].conflicts[0]).toContain('k103 × Eus fus, k104 Eus gus');
    expect(r.others['extra-keys.txt except']).toMatchObject({ n: 2, none: 1, ownTaxon: 1 });
    expect(r.others['extra-keys-kew.txt extra']).toMatchObject({ n: 1, ownPage: 1 });
    expect(r.others['extra-keys-infra.txt extra']).toMatchObject({ n: 1, ownTaxon: 1 });
    expect(r.others['extra-keys-infra.txt except']).toMatchObject({ n: 2, otherPage: 2 });
  });
});

describe('r100b: the records against a fifth', () => {
  it('lists falls and rises past a fifth, the rest counted, no taxon apart', () => {
    const r = recordsMoved(['# h', 'k1\tA\t1\t100\tX\t100\t-', 'k2\tB\t2\t100\tY\t85\t-', 'k3\tC\t3\t100\tZ\t79\t-', 'k4\tD\t4\t0\tW\t3\t-', 'k5\tE\t5\t50\t-\t-\t-', 'k6\tF\t6\t100\tV\t121\t-'].join('\n'));
    expect(r).toMatchObject({ pages: 6, noTaxon: 1, same: 1, within: 1, before: 400, after: 388 });
    expect(r.fell.map((x: { page: string }) => x.page)).toEqual(['k3']);
    expect(r.rose.map((x: { page: string }) => x.page)).toEqual(['k4', 'k6']);
  });
});
