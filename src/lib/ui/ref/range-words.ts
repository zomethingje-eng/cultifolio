/**
 * The words a species page puts over its native range (round eighty-two; the independent review's 21 and 22).
 *
 * The world map's caption said "Native range as published by WCVP" on every page, a page with no range at all among them
 * (Albuca longifolia, whose name Kew holds only under another author). It is now worded by what the page holds: Kew's
 * range, a national checklist's unverified one, regions reported present with no native status, or no range, with why.
 */
import { cultigenOf } from '$core/cultigen';
import { notAnswered } from './upstream';

type Dist = {
  native: ReadonlyArray<unknown>;
  introduced?: ReadonlyArray<unknown>;
  extinct?: ReadonlyArray<unknown> | null;
  reported?: ReadonlyArray<unknown> | null;
  verified?: boolean;
  ambiguous?: string | null;
  kew?: { area?: string };
};

/** The world map's caption, without its full stop: what the boxes on it are, or why there are none. */
export function rangeCaption(d: Dist, status: string | null | undefined): string {
  // A plant Kew lists only as a cultigen (round eighty-six; review D's D1): its region is where the crop comes from.
  if (d.native.length && cultigenOf(d.kew?.area)) return 'Region of origin as published by WCVP, which lists the plant only as a cultigen';
  if (d.native.length) return d.verified === false ? 'Native range as a national checklist states it, not verified by WCVP' : 'Native range as published by WCVP';
  if (d.reported?.length) return 'No verified native range: the regions listed below are reported present, with no native status';
  if (status === 'refused' || status === 'error' || !status) return `Native range not checked: the distribution source ${notAnswered(status)} when this page was built`;
  // A source the build did not ask is "not asked", never "no distribution" (round eighty-six; rule 2): Monsonia lheritieri's
  // range row was written `skipped` by an offline re-derivation, and a page with it and no regions read "WCVP publishes no
  // distribution for this name".
  if (status === 'skipped') return `Native range not asked: the distribution source ${notAnswered(status)} when this page was built`;
  if (status === 'ambiguous') return 'No native range taken: Kew holds no entry under this name, and its older names lead to more than one';
  if (d.ambiguous) return 'No native range taken: WCVP holds more than one name spelt this way';
  if (d.introduced?.length || d.extinct?.length) return 'No native range: WCVP lists no region where it is native';
  return 'No native range: WCVP publishes no distribution for this name';
}

/**
 * What the regions are (the independent review's 22: "Czechoslovakia", "Yugoslavia" and "Lebanon-Syria" read as errors on
 * Mentha × piperita's page). The names are Kew's own, for the units of the scheme Kew records ranges in. A clause: no capital, no full stop.
 */
export const UNITS_NOTE = "regions are the level-3 units of the World Geographical Scheme for Recording Plant Distributions, as Kew's World Checklist records ranges, some under historical names such as Yugoslavia or Czechoslovakia";
