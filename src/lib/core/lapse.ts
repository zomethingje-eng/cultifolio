/**
 * The guard on the daily extremes' correction for elevation (round eighty, A; review-d 6). Pure, and read by the dossier's
 * parser, the builder and the species page alike.
 */
/**
 * The largest difference of elevation, in metres, between NASA POWER's cell and the typical grid cell that the build
 * corrects for by the lapse rate (round eighty, A; review-d 6). POWER's cell is 0.5° by 0.625°, its elevation the mean of
 * that ground; past this the cell's ground is other terrain than the typical spot's (an Andean slope averaged into Lima's
 * coastal cell: Solanum lycopersicum's correction of -1,129 m warmed every night by 7.3 °C, to a cold floor of 18.9 °C
 * above every month's mean nightly low). Of round seventy-seven's 5,454 pages with extremes, 82 were corrected by more.
 */
export const MAX_LAPSE_M = 1000;

/**
 * Why a page's daily extremes are set aside, or null when they stand (round eighty, A): a lapse correction beyond
 * `MAX_LAPSE_M` either way, or a record low warmer than the coldest month's mean nightly low across the range (an
 * impossible figure: a record low is a night colder than that month's mean night, wherever it is read), or (round
 * eighty-three, C) a 1-in-100 night warmer than it. Never applied:
 * the page then reads its cold figure from the range's coldest mean night, as it does for a sea cell, and says why.
 */
export function lapseSetAside(c: { months: ReadonlyArray<{ tmin: number }>; extremes?: { minAbs: number; minP01?: number; lapseAppliedM?: number } | null }): string | null {
  const e = c.extremes;
  if (!e) return null;
  const m = e.lapseAppliedM;
  if (m != null && Math.abs(m) > MAX_LAPSE_M) return `the correction for elevation, ${m > 0 ? '+' : ''}${m} m, is beyond the ${MAX_LAPSE_M.toLocaleString('en-GB')} m either way that a lapse rate is applied over, so the weather cell's ground is other terrain than the typical spot's`;
  const coldest = c.months.length ? Math.min(...c.months.map((x) => x.tmin)) : NaN;
  if (Number.isFinite(coldest) && e.minAbs > coldest) return `the record low, ${e.minAbs} °C, is warmer than the coldest month's mean nightly low across the range, ${coldest} °C, which no night series of the habitat can give`;
  // Round eighty-three (C; review 1's 40, Eulychnia acida): the 1-in-100 night warmer than that month's mean nightly low.
  // About half the coldest month's nights fall below its mean, some fifteen a year, four in a hundred of the year's
  // nights; a series with fewer than one in a hundred below it runs warmer at night than the grid's months say the
  // habitat is. On 462 pages with a land cell's extremes, from the live site of 29 October 2026, 6 were so.
  if (Number.isFinite(coldest) && e.minP01 != null && e.minP01 > coldest) return `the 1-in-100 night, ${e.minP01} °C, is warmer than the coldest month's mean nightly low across the range, ${coldest} °C, though some four nights in a hundred fall below that month's mean, so the weather cell's nights are warmer than the habitat's`;
  return null;
}
