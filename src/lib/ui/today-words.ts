/**
 * Today's rows, worded as their rule reads, in a grower's words, with the figure in use. "Past the watering rhythm (21
 * days unless the plant or its place sets another)" was said over a place set to 10 days, and "Outside the cooler six
 * months the species sheet names" asked the grower to know what the sheet names (round sixty; the grower review, 5).
 */
import { ruleRain, type Units } from '$core/units';

/** Where a plant's rhythm comes from: its own figure, a place's (by name), or the app's default. */
export type Rhythm = { days: number; from: 'plant' | 'default' | string };

/** "Past its 10-day rhythm (Greenhouse)"; several plants on one rhythm, "Past their …"; plants on different rhythms, the figures in order. */
export function rhythmWords(rs: Rhythm[]): string {
  if (!rs.length) return '';
  const who = rs.length === 1 ? 'its' : 'their';
  const keys = [...new Map(rs.map((r) => [`${r.days}\0${r.from}`, r])).values()];
  if (keys.length === 1) {
    const r = keys[0];
    const from = r.from === 'plant' ? 'set on the plant' : r.from === 'default' ? 'the default' : r.from;
    return `Past ${who} ${r.days}-day rhythm (${from})`;
  }
  const days = [...new Set(rs.map((r) => r.days))].sort((a, b) => a - b);
  return days.length === 1 ? `Past ${who} ${days[0]}-day rhythm` : `Past ${who} watering rhythm (${days.slice(0, -1).join(', ')} or ${days[days.length - 1]} days)`;
}

/**
 * A resting row's head. The rain rule reads the habitat's rainy months, so outside them is its dry season; under 120 mm
 * of rain a year the temperature rule reads the cooler six months instead, and that is never called a dry season or a
 * rest (round sixty; the words review and the outside review's G).
 */
export function restWords(rule: 'rain' | 'cool', u: Units): string {
  return rule === 'rain'
    ? "Its habitat's dry season now (outside the rainy months); water only if you want to"
    : `Its habitat's warmer six months now (under ${ruleRain(120, u)} of rain a year, its year is read by temperature); water only if you want to`;
}

/** A day count in words: "today", "1 d", "11 d". */
export const dayWords = (n: number): string => (n <= 0 ? 'today' : `${n} d`);

/** A plant with no watering recorded, counted from the day its record was made: "added 11 d ago, no watering yet". */
export const addedWords = (n: number): string => (n <= 0 ? 'added today, no watering yet' : `added ${n} d ago, no watering yet`);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Months as the seasons run, not in calendar order: [1, 2, 12] is "Dec to Feb", not "Jan, Feb, Dec" (round sixty; the
 * grower review, 5). Runs of three or more are a span; a run that crosses the year starts in its own December.
 */
export function monthRuns(months: number[]): string {
  const set = [...new Set(months.filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (!set.length) return '';
  if (set.length === 12) return 'every month';
  // Start just after a month not in the set, so a run across the new year stays whole.
  let start = 1;
  while (set.includes(start)) start++;
  const order = Array.from({ length: 12 }, (_, i) => ((start - 1 + i) % 12) + 1).filter((m) => set.includes(m));
  const runs: number[][] = [];
  for (const m of order) {
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] % 12) + 1 === m) last.push(m);
    else runs.push([m]);
  }
  return runs.map((r) => (r.length >= 3 ? `${MON[r[0] - 1]} to ${MON[r[r.length - 1] - 1]}` : r.map((m) => MON[m - 1]).join(', '))).join(', ');
}
