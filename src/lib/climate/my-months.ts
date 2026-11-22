/**
 * The climate chart in the reader's months (round 106; the first hand-off's round 4: "Show in my months" on the chart, in
 * place of the separate year strip). The shift is the season card's rule (`/about/how#shift`): six months, only where the
 * year can be moved (its warmth moves 4 °C or more and the habitat lies 10° or more from the equator, `Year.shiftable`)
 * and the reader's hemisphere is not the habitat's. The reader's hemisphere is their site's, else their first space's with
 * coordinates, else the northern.
 */

/** How many months the reader's calendar is from the habitat's: 6, or 0 where there is nothing to move. */
export function myMonthsShift(habitatSouth: boolean | null | undefined, readerLat: number | null | undefined, shiftable: boolean): 0 | 6 {
  if (!shiftable || habitatSouth == null) return 0;
  const readerSouth = readerLat != null && readerLat < 0;
  return habitatSouth === readerSouth ? 0 : 6;
}

/** Twelve monthly figures as the reader's calendar holds them: the reader's January is the habitat's month `by` later. */
export function inMyMonths<T>(months: T[], by: number): T[] {
  if (!by || months.length !== 12) return months;
  return months.map((_, i) => months[(i + by) % 12]);
}
