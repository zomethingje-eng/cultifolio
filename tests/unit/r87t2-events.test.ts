/**
 * Round eighty-seven, stage 3 (t2: F5 and F8): the readings of a plant's and a batch's own lines.
 *
 * 1. "Flowered this week in past years" (Today): a flower line within three days of today's date in an earlier year,
 *    across the turn of the year, a 29 February in a year without one; this year's lines and a month alone left out;
 *    a plant that did so in two years is one entry, first.
 * 2. The flowering calendar (My plants): each plant's months with the years, ordered by its first month; a line dated
 *    past today left out; the foot row counts plants, not lines.
 * 3. A batch's checkpoints: each count with what had been potted and lost by its day and what was alive then, the share
 *    of what went in; losses by cause, case and spacing aside, an empty cause said as not stated.
 *
 * Fails on the base (r87s2 head): neither module exists.
 */
import { describe, it, expect } from 'vitest';
import { floweredThisWeekBefore, floweringCalendar, monthTotals, dayParts, WEEK_SPAN } from '$lib/ui/grow/flowered';
import { checkpointsOf, lossesByCause, LOSS_CAUSES } from '$lib/ui/grow/checkpoints';
import type { PlantEvent } from '$lib/db/types';

let n = 0;
const ev = (acc: string, d: string, t: PlantEvent['t'], more: Partial<PlantEvent> = {}): PlantEvent => ({ id: `e${String(++n).padStart(4, '0')}`, acc, d, t, ...more });
const byAcc = (lines: PlantEvent[]) => (id: string) => lines.filter((e) => e.acc === id);

describe('r87t2 events 1: flowered this week in past years', () => {
  it('takes the seven days around today in earlier years, by each plant\'s own flower lines', () => {
    const lines = [
      ev('a', '2025-11-06', 'flower'), // three days before, last year: in
      ev('a', '2024-11-12', 'flower'), // three days after, two years back: in
      ev('b', '2025-11-13', 'flower'), // four days after: out
      ev('c', '2026-11-08', 'flower'), // this year: out (on its own log already)
      ev('d', '2025-11', 'flower'), // a month alone: no day to compare
      ev('e', '2025-11-09', 'water'), // not a flowering
      ev('f', '2023-11-09', 'flower'), ev('f', '2023-11-10', 'flower') // two lines one year: one year
    ];
    const got = floweredThisWeekBefore(['a', 'b', 'c', 'd', 'e', 'f'], byAcc(lines), '2026-11-09');
    expect(got.map((g) => g.id)).toEqual(['a', 'f']);
    expect(got[0].years).toEqual([{ y: 2025, d: '2025-11-06' }, { y: 2024, d: '2024-11-12' }]);
    expect(got[1].years).toEqual([{ y: 2023, d: '2023-11-09' }]);
    expect(WEEK_SPAN).toBe(3);
  });
  it('across the turn of the year, and a 29 February moved to the 28th', () => {
    expect(floweredThisWeekBefore(['a'], byAcc([ev('a', '2024-12-30', 'flower')]), '2026-01-01').map((g) => g.id)).toEqual(['a']);
    expect(floweredThisWeekBefore(['a'], byAcc([ev('a', '2024-01-03', 'flower')]), '2025-12-31').map((g) => g.id)).toEqual(['a']);
    expect(floweredThisWeekBefore(['a'], byAcc([ev('a', '2024-02-29', 'flower')]), '2025-03-03').map((g) => g.id)).toEqual(['a']); // the 28th is three days before
    expect(floweredThisWeekBefore(['a'], byAcc([ev('a', '2024-02-29', 'flower')]), '2025-03-04')).toEqual([]);
  });
  it('a damaged today reads nothing, rather than throwing', () => {
    expect(floweredThisWeekBefore(['a'], byAcc([ev('a', '2025-11-09', 'flower')]), 'today')).toEqual([]);
    expect(dayParts('2025-13-01')).toBeNull();
    expect(dayParts(20251101)).toBeNull();
  });
});

describe('r87t2 events 2: the flowering calendar', () => {
  const lines = [
    ev('x', '2024-03-02', 'flower'), ev('x', '2025-03-20', 'flower'), ev('x', '2025-04-01', 'flower'),
    ev('y', '2025-01-15', 'flower'), ev('y', '2025-01-16', 'flower'),
    ev('z', '2025-06-01', 'fruit'), // fruit set is not a flowering
    ev('w', '2026-12-01', 'flower') // past today: not yet a flowering
  ];
  const rows = floweringCalendar(['x', 'y', 'z', 'w'], byAcc(lines), '2026-11-09');
  it('one row a plant that flowered, by its first month', () => {
    expect(rows.map((r) => r.id)).toEqual(['y', 'x']);
    expect(rows[1].months[2]).toEqual([2024, 2025]);
    expect(rows[1].months[3]).toEqual([2025]);
    expect(rows[0].months[0]).toEqual([2025]); // two lines in one January are one year
    expect(rows[0].lines).toBe(2);
    expect([rows[1].first, rows[1].last]).toEqual(['2024-03-02', '2025-04-01']);
  });
  it('the foot row counts the plants each month', () => {
    expect(monthTotals(rows)).toEqual([1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('r87t2 events 3: a batch\'s checkpoints and losses', () => {
  const s = 'sB';
  const lines = [
    ev(s, '2026-03-10', 'germinate', { n: 4 }),
    ev(s, '2026-03-20', 'germinate', { n: 12 }),
    ev(s, '2026-03-25', 'loss', { n: 2, cause: 'Damping-off' }),
    ev(s, '2026-04-01', 'loss', { n: 1, cause: ' damping-off ' }),
    ev(s, '2026-04-02', 'loss', { n: 1 }),
    ev(s, '2026-04-10', 'potup', { n: 3 }),
    ev(s, '2026-04-12', 'germinate', { n: 14 })
  ];
  it('each count with what was alive in the pot that day and its share of what went in', () => {
    expect(checkpointsOf(lines, 20).map((c) => [c.d, c.up, c.potted, c.lost, c.alive, c.pct])).toEqual([
      ['2026-03-10', 4, 0, 0, 4, 20],
      ['2026-03-20', 12, 0, 0, 12, 60],
      ['2026-04-12', 14, 3, 4, 7, 70]
    ]);
    expect(checkpointsOf(lines, 0)[0].pct).toBeNull(); // no count of what went in: no share, not 0%
  });
  it('losses by cause, as the grower wrote it, an empty cause not stated', () => {
    expect(lossesByCause(lines)).toEqual([
      { cause: 'Damping-off', n: 3, lines: 2, last: '2026-04-01' },
      { cause: null, n: 1, lines: 1, last: '2026-04-02' }
    ]);
    expect(lossesByCause([...lines].reverse())).toEqual(lossesByCause(lines)); // a record's lines come newest first: the words are still the first line's
    expect(LOSS_CAUSES).toContain('damping-off');
  });
});
