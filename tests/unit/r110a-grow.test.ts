/**
 * Round 110 (docs/PLAN-110.md): the species list grows a day at a time from a ranked queue. What this proves:
 *
 * 1. The queue is every accepted species with a cultivated record, by the list's own counts, that the list does not hold
 *    (those that reached the list's bar after it was made first). It is ranked by records, then iNaturalist's observations, then Kew's name, and read back as written.
 * 2. `growList` appends the next species to the days' additions (scripts/species-added.txt, the list's form) with their
 *    counts and the day, never to the list as made, and builds the list's unbuilt first (both files), so a stopped day
 *    is made up within the day's number. It never rebuilds a species listed as already in the reference, and says what
 *    is left in the queue.
 * 3. The list's parser reads the additions' lines.
 *
 * On 32d681f there is no queue and no --grow: every test FAILED. On 54052e6 the day's species were appended to
 * scripts/species-list.txt itself, which moved the figures eighteen tests of rounds 78 to 81 hold of the list as made
 * (the first daily run's gate, 23 November 2026): the tests of the additions' file FAILED.
 */
import { describe, it, expect } from 'vitest';
import { queueOf, formatQueue, parseQueue, growList, formatSpeciesList, parseSpeciesList, QUEUED, LIST_MAGIC, ADDED_FILE, type Kew, type KewRow, type Selected } from '../../scripts/select-species-lib';

const row = (id: string, name: string, o: Partial<KewRow> = {}): KewRow => ({ id, rank: 'Species', status: 'Accepted', family: 'Aizoaceae', genus: name.split(' ')[0], name, authors: 'L.', acc: id, parent: '', powo: '', hybrid: false, ...o });
const kew: Kew = {
  rows: new Map([
    row('1', 'Aloe alpha'), row('2', 'Aloe beta'), row('3', 'Aloe gamma'), row('4', 'Aloe delta'), row('5', 'Aloe epsilon'),
    row('6', 'Aloe zeta', { status: 'Synonym' }), row('7', 'Aloe eta', { rank: 'Variety' }), row('8', 'Aloe theta')
  ].map((r) => [r.id, r])),
  byWords: new Map(),
  byPowo: new Map()
};
const keyOf = (r: KewRow) => (r.id === '5' ? null : String(9000 + Number(r.id)));

const sel = (id: string, name: string, reason: Partial<Selected> = {}): Selected => ({ id, name, author: 'L.', family: 'Aizoaceae', inat: 3, gbif: 0, byCounts: true, byGenus: false, byReference: false, gbifKey: String(9000 + Number(id)), ...reason });
const LIST = formatSpeciesList(['test list'], [sel('8', 'Aloe theta')]);

describe('r110a the queue: the next tier by the same counts', () => {
  // 1: 2 records (inat 1 + gbif 1); 2: 1; 3: 2 (inat 2); 4: 3, the list's bar reached since; 5: 1, no GBIF key; 6 a
  // synonym; 7 a variety; 8 listed already.
  const inat = new Map([['1', 1], ['2', 1], ['3', 2], ['4', 3], ['5', 0], ['6', 1], ['7', 2], ['8', 2]]);
  const gbif = new Map([['1', 1], ['5', 1]]);
  const q = queueOf(kew, inat, gbif, new Set(['8']), keyOf);
  it('a record or more, accepted species not listed, ranked by records, then iNaturalist, then name', () => {
    expect(q.map((x) => x.name)).toEqual(['Aloe delta', 'Aloe gamma', 'Aloe alpha', 'Aloe beta', 'Aloe epsilon']);
    expect(q.find((x) => x.id === '5')?.gbifKey).toBeNull();
  });
  it('written and read back, in rank order, each with its counts', () => {
    const back = parseQueue(formatQueue(['test'], q));
    expect(back.map((x) => [x.rank, x.kewId, x.reason, x.gbifKey])).toEqual([[1, '4', 'inat 3 + gbif 0', 9004], [2, '3', 'inat 2 + gbif 0', 9003], [3, '1', 'inat 1 + gbif 1', 9001], [4, '2', 'inat 1 + gbif 0', 9002], [5, '5', 'inat 0 + gbif 1', null]]);
    expect(() => parseQueue('# not a queue\n')).toThrow(/not a species queue/);
  });

  describe('the day\'s growth', () => {
    const QUEUE = formatQueue(['test'], q);
    it('appends the next N to the additions with their counts and the day, never to the list, and writes the --keys file of them', () => {
      const g = growList(LIST, null, QUEUE, (e) => e.kewId === '8', 2, '2026-11-23');
      expect(g.added.map((x) => x.name)).toEqual(['Aloe delta', 'Aloe gamma']);
      expect(g.left).toBe(3);
      expect(g.addedText.startsWith(LIST_MAGIC)).toBe(true);
      expect(g.addedText).toContain('scripts/species-list.txt is left as made on 19 October 2026');
      const list = parseSpeciesList(g.addedText);
      expect(list.map((e) => e.name)).toEqual(['Aloe delta', 'Aloe gamma']);
      expect(list[0].reason).toBe(`inat 3 + gbif 0; ${QUEUED} 2026-11-23`);
      expect(ADDED_FILE).toBe('scripts/species-added.txt');
      expect(g.growText.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['9004 Aloe delta', '9003 Aloe gamma']);
    });
    it('the list\'s unbuilt come first and count toward N; a species with no GBIF key is built from Kew\'s file by its id', () => {
      const day1 = growList(LIST, null, QUEUE, (e) => e.kewId === '8', 2, '2026-11-23');
      // Day 1 stopped with nothing built: day 2 builds those two again, and takes one more.
      const day2 = growList(LIST, day1.addedText, QUEUE, (e) => e.kewId === '8', 3, '2026-11-24');
      expect(day2.carried).toBe(2);
      expect(day2.added.map((x) => x.name)).toEqual(['Aloe alpha']);
      const day3 = growList(LIST, day2.addedText, QUEUE, (e) => ['8', '4', '3', '1'].includes(e.kewId!), 5, '2026-11-25');
      expect(day3.growText.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['9002 Aloe beta', 'k5 -']);
      expect(day3.left).toBe(0);
      // The queue run out: nothing added, nothing to build.
      const day4 = growList(LIST, day3.addedText, QUEUE, () => true, 5, '2026-11-26');
      expect([day4.added.length, day4.carried, day4.left, day4.toBuild]).toEqual([0, 0, 0, 0]);
    });
    it('a species of the queue that has a page already joins the list and is not built again', () => {
      const g = growList(LIST, null, QUEUE, (e) => e.kewId !== '3', 2, '2026-11-23');
      expect(g.added.map((x) => x.name)).toEqual(['Aloe delta', 'Aloe gamma']);
      expect(g.toBuild).toBe(1);
      expect(g.growText.split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['9003 Aloe gamma']);
    });
    it('a species listed as already in the reference with no page under its id is never built again', () => {
      const ref = formatSpeciesList(['test'], [sel('8', 'Aloe theta', { byCounts: false, byReference: true })]);
      expect(growList(ref, null, QUEUE, () => false, 0, '2026-11-23').carried).toBe(0);
    });
    it('refuses additions that hold a species the list as made holds', () => {
      const twice = formatSpeciesList(['test'], [sel('8', 'Aloe theta')]);
      expect(() => growList(LIST, twice, QUEUE, () => true, 1, '2026-11-23')).toThrow(/holds Aloe theta \(k8\), which scripts\/species-list.txt holds already/);
    });
  });
});
