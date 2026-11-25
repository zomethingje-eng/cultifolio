/**
 * Round 120 (MYPLANTS 28): two readings of a plant's watering record, each the grower's own record restated, never advice.
 *
 * - "Looked at, left dry" (an event `dry`) takes a plant off Today for half the rhythm in force, and at least three days
 *   (the owner's decision 2 in the hand-off). It does not reset "since watered".
 * - "You have watered it about every N days": the median gap, in whole days, between its last waterings, up to the last
 *   six gaps, said only with three gaps or more. It never changes what Today decides.
 */
import { daysBetween } from './dates';

/** Days a "left dry" keeps a plant off Today: half the rhythm in force, rounded up, and never fewer than three. */
export const dryHold = (rhythmDays: number): number => Math.max(3, Math.ceil(rhythmDays / 2));

/**
 * The median gap between waterings, from their dates (any order, duplicates of a day counted once), over the last six gaps
 * at most; null under three gaps.
 */
export function wateringGap(dates: readonly string[]): number | null {
  const days = [...new Set(dates)].sort().reverse().slice(0, 7);
  if (days.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < days.length; i++) gaps.push(daysBetween(days[i + 1], days[i]));
  gaps.sort((a, b) => a - b);
  const m = gaps.length >> 1;
  return Math.round(gaps.length % 2 ? gaps[m] : (gaps[m - 1] + gaps[m]) / 2);
}
