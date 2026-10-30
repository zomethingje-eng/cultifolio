import { temp, METRIC, type Units } from './units';
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
 * Which of the three causes set a page's daily extremes aside (round eighty-four; the three reviews' D1, S1, A3 and B2).
 * The dossier records one status, `'lapse'`, for all three, and every surface worded it as the first: Eulychnia acida's
 * card said "the weather cell's ground is too far off" of a correction of -432 m. Each surface now words the cause that
 * applied, from the figures the dossier keeps (`extremesLapse`), in this order, the order `lapseSetAside` tests them:
 *
 * - `elevation`: the correction for elevation is beyond `MAX_LAPSE_M` either way, so the weather cell stands for other
 *   ground than the typical spot's (`m`, the correction: negative where the cell's ground is higher than the spot's);
 * - `record-low`: the cell's record low is warmer than the coldest month's mean nightly low across the range;
 * - `warm-night`: the cell's 1-in-100 night is warmer than that month's mean nightly low (round eighty-three, C).
 *
 * The last two are a check that two sources disagree (NASA POWER's nights at one cell, CHELSA's monthly lows across the
 * range), not a proof that either is wrong: a skewed month can put its mean low under the year's 1st percentile (outside
 * review B's 2; the owner's decision 7 keeps the rule and words it as this).
 */
export type LapseCause = { kind: 'elevation'; m: number } | { kind: 'record-low'; minAbs: number; coldest: number } | { kind: 'warm-night'; minP01: number; coldest: number };

type LapseIn = { months: ReadonlyArray<{ tmin: number }>; extremes?: { minAbs: number; minP01?: number; lapseAppliedM?: number } | null };

export function lapseCause(c: LapseIn): LapseCause | null {
  const e = c.extremes;
  if (!e) return null;
  const m = e.lapseAppliedM;
  if (m != null && Math.abs(m) > MAX_LAPSE_M) return { kind: 'elevation', m };
  const coldest = c.months.length ? Math.min(...c.months.map((x) => x.tmin)) : NaN;
  if (Number.isFinite(coldest) && e.minAbs > coldest) return { kind: 'record-low', minAbs: e.minAbs, coldest };
  // Round eighty-three (C; review 1's 40, Eulychnia acida). On 462 pages with a land cell's extremes, from the live site
  // of 29 October 2026, 6 were so.
  if (Number.isFinite(coldest) && e.minP01 != null && e.minP01 > coldest) return { kind: 'warm-night', minP01: e.minP01, coldest };
  return null;
}

/** A height in the reader's units, the metric figure kept beside feet so the rule stays checkable: "3,704 ft (1,129 m)". */
const height = (m: number, u: Units) => (u === 'us' ? `${Math.round(Math.abs(m) * 3.28084).toLocaleString('en-US')} ft (${Math.abs(m).toLocaleString('en-US')} m)` : `${Math.abs(m).toLocaleString('en-US')} m`);
/** Where the cell's ground lies against the typical spot's: the correction is the spot's height less the cell's. */
const side = (m: number) => (m < 0 ? 'higher' : 'lower');

/** The cause as a sentence's clause (no capital, no full stop), with its figures, in the reader's units. */
export function causeSentence(c: LapseCause, u: Units = METRIC): string {
  if (c.kind === 'elevation') return `the correction for elevation, ${c.m > 0 ? '+' : ''}${c.m} m, is beyond the ${MAX_LAPSE_M.toLocaleString('en-GB')} m either way that a lapse rate is applied over: the weather cell's ground is ${height(c.m, u)} ${side(c.m)} than the typical spot's, so the cell stands for other terrain`;
  if (c.kind === 'record-low') return `the record low, ${temp(c.minAbs, u, 1)}, is warmer than the coldest month's mean nightly low across the range, ${temp(c.coldest, u, 1)}. At any one spot a record low is colder than any month's mean night, so the weather cell's nights and the habitat's monthly lows disagree`;
  return `the 1-in-100 night, ${temp(c.minP01, u, 1)}, is warmer than the coldest month's mean nightly low across the range, ${temp(c.coldest, u, 1)}. Usually several of that month's nights fall below its mean, more than one in a hundred of the year's, so the weather cell's nights and the habitat's monthly lows disagree. This is a check that two sources disagree, not proof that either is wrong`;
}

/** The cause in a few words, for a card's small print beside the mean nightly low; `null` (a sheet built before) says only that they were set aside. */
export function causeTag(c: LapseCause | null, u: Units = METRIC): string {
  if (!c) return 'extremes set aside';
  if (c.kind === 'elevation') return `extremes set aside: weather cell ${u === 'us' ? `${Math.round(Math.abs(c.m) * 3.28084).toLocaleString('en-US')} ft` : `${Math.abs(c.m).toLocaleString('en-US')} m`} ${side(c.m)}`;
  return 'extremes set aside: two sources disagree';
}

/** The cause as a clause a grower reads at once (no capital, no full stop): the sheet's plain line and a plant's page. */
export function causeShort(c: LapseCause | null, u: Units = METRIC): string {
  if (!c) return 'the daily extremes were set aside (the species page says why)';
  if (c.kind === 'elevation') return `the daily extremes come from a weather cell ${height(c.m, u)} ${side(c.m)} than the typical spot, too far to correct for, so they are set aside`;
  if (c.kind === 'record-low') return "the weather cell's record low is warmer than the habitat's coldest month's nights, so the two sources disagree and its extremes are set aside";
  return "the weather cell's coldest nights run warmer than the habitat's coldest month, so the two sources disagree and its extremes are set aside";
}

/**
 * Why a page's daily extremes are set aside, as a clause, or null when they stand (round eighty, A; round eighty-four's
 * words). Never applied: the page then reads its cold figure from the range's coldest mean night, as it does for a sea
 * cell, and says why.
 */
export function lapseSetAside(c: LapseIn, u: Units = METRIC): string | null {
  const cause = lapseCause(c);
  return cause ? causeSentence(cause, u) : null;
}
