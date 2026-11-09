/**
 * Flowering read from the grower's own log (round eighty-seven, F8): "flowered this week in past years" on Today, and the
 * flowering calendar on My plants. A plain reading of the `flower` lines; nothing is written, nothing is asked of anyone,
 * and nothing is guessed: a plant with no flower line is not on either, whatever its species does in habitat.
 *
 * "This week" is the seven days around today's date: a line counts when its day, moved into today's year, falls from
 * three days before today to three days after. A line dated 29 February is moved to the 28th in a year without one. Only
 * lines of earlier years count; this year's are on the plant's own log already.
 */
import type { PlantEvent } from '$lib/db/types';

const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** The days either side of today that "this week" takes. */
export const WEEK_SPAN = 3;

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** A YYYY-MM-DD read as its parts, or null for anything else (a month or a year alone, a damaged line). */
export function dayParts(d: unknown): { y: number; m: number; d: number } | null {
  if (typeof d !== 'string') return null;
  const x = DAY.exec(d);
  if (!x) return null;
  const y = +x[1], m = +x[2], dd = +x[3];
  if (m < 1 || m > 12 || dd < 1 || dd > 31) return null;
  return { y, m, d: dd };
}

/** How many days a line's day, moved into `year`, is from that year's `today`: 0 the same day, negative before. */
function offsetIn(line: { m: number; d: number }, today: { y: number; m: number; d: number }): number {
  const d = line.m === 2 && line.d === 29 && !leap(today.y) ? 28 : line.d;
  const a = utc(today.y, line.m, d), b = utc(today.y, today.m, today.d);
  let off = Math.round((a - b) / DAY_MS);
  // Across the turn of the year: 30 December is two days before 1 January, not 363 after.
  const len = leap(today.y) ? 366 : 365;
  if (off > len / 2) off -= len;
  else if (off < -len / 2) off += len;
  return off;
}

export interface FloweredBefore {
  /** The plant's record id. */
  id: string;
  /** The earlier years it flowered this week, newest first, each with the day of its first line that week. */
  years: Array<{ y: number; d: string }>;
}

/**
 * The plants that flowered this week in an earlier year, by their own flower lines. `ids` are the plants to look at,
 * `events` a plant's lines. A plant with a line this week in two earlier years is one entry with both.
 */
export function floweredThisWeekBefore(ids: Iterable<string>, events: (id: string) => PlantEvent[], today: string): FloweredBefore[] {
  const t = dayParts(today);
  if (!t) return [];
  const out: FloweredBefore[] = [];
  for (const id of ids) {
    const byYear = new Map<number, string>();
    for (const e of events(id)) {
      if (e.t !== 'flower') continue;
      const p = dayParts(e.d);
      if (!p || p.y >= t.y) continue;
      if (Math.abs(offsetIn(p, t)) > WEEK_SPAN) continue;
      const was = byYear.get(p.y);
      if (!was || e.d < was) byYear.set(p.y, e.d);
    }
    if (byYear.size) out.push({ id, years: [...byYear].map(([y, d]) => ({ y, d })).sort((a, b) => b.y - a.y) });
  }
  // The plants that have done it most often first, then the latest year, then by id for a steady order.
  return out.sort((a, b) => b.years.length - a.years.length || b.years[0].y - a.years[0].y || a.id.localeCompare(b.id));
}

/** One plant's row of the flowering calendar: for each month (index 0 is January), the years it flowered in that month. */
export interface CalendarRow { id: string; months: number[][]; lines: number; first: string; last: string }

/**
 * The flowering calendar: every plant with a flower line, and the months and years of its lines. The rows are ordered by
 * the first month they flowered in, then by how many lines they hold. A line's year is kept, so a month a plant flowered
 * in twice reads as two years, not as two lines on one day.
 */
export function floweringCalendar(ids: Iterable<string>, events: (id: string) => PlantEvent[], upTo?: string): CalendarRow[] {
  const out: CalendarRow[] = [];
  for (const id of ids) {
    const months: Array<Set<number>> = Array.from({ length: 12 }, () => new Set());
    let lines = 0, first = '', last = '';
    for (const e of events(id)) {
      if (e.t !== 'flower') continue;
      const p = dayParts(e.d);
      if (!p || (upTo && e.d > upTo)) continue; // a line dated ahead of today is not yet a flowering
      months[p.m - 1].add(p.y);
      lines++;
      if (!first || e.d < first) first = e.d;
      if (!last || e.d > last) last = e.d;
    }
    if (lines) out.push({ id, months: months.map((s) => [...s].sort((a, b) => a - b)), lines, first, last });
  }
  const firstMonth = (r: CalendarRow) => r.months.findIndex((m) => m.length);
  return out.sort((a, b) => firstMonth(a) - firstMonth(b) || b.lines - a.lines || a.id.localeCompare(b.id));
}

/** How many plants flowered in each month, over every year: the calendar's foot row. */
export function monthTotals(rows: CalendarRow[]): number[] {
  return Array.from({ length: 12 }, (_, i) => rows.filter((r) => r.months[i].length).length);
}
