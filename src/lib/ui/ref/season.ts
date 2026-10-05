/**
 * The season card's strip: twelve months in the reader's calendar, the rule's months shaded and the months under 5 mm
 * marked, built only from the rules' outputs (the `Year` the sheet read) and the median year's rain. Nothing is inferred
 * beyond what the rules state: a spread year and a year with no season shade nothing (round sixty; visitor 3, the
 * self-review's experience item 3).
 */
import { forReader, type Year } from '$core/sheet';

export interface SeasonStrip {
  /** January first, in the reader's months. */
  cells: Array<{ m: number; on: boolean; dry: boolean }>;
  /** What the shading is, in the rule's own words; null when nothing is shaded. */
  shadeIs: string | null;
  /** Whose months: the reader's, or the habitat's when the shift rule does not apply. */
  calendar: string;
}

export function seasonStrip(year: Year | null, months: Array<{ precipMm: number }>, readerLat: number | null | undefined): SeasonStrip | null {
  if (!year || months.length !== 12) return null;
  const south = (readerLat ?? 40) < 0;
  // The habitat's months move to the reader's side only where the shift rule applies, as `forReader` decides for the sheet.
  const flip = year.shiftable && south !== year.south;
  const toReader = (m: number) => (flip ? ((m + 5) % 12) + 1 : m);
  const shaded = new Set(!year.none && !year.spread ? forReader(year, readerLat) : []);
  const dry = new Set(months.map((x, i) => (x.precipMm < 5 ? toReader(i + 1) : 0)).filter(Boolean));
  const shadeIs = year.none || year.spread ? null : year.fog ? 'the cooler six months' : year.flat ? 'the rainy season (no growing season read: even temperatures)' : year.grow === 'even' ? 'the rainy season' : `the rainy season, read as a ${year.grow} growing season`;
  return {
    cells: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, on: shaded.has(i + 1), dry: dry.has(i + 1) })),
    shadeIs: shaded.size ? shadeIs : null,
    calendar: !year.shiftable ? "the habitat's months, not shifted" : `your months, ${south ? 'southern' : 'northern'} hemisphere`
  };
}
