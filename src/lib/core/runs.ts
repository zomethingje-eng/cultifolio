/**
 * Months as words, and the reader's months (round eighty-seven, t3): kept apart from the sheet so a light module (a
 * plant's growing season, read by the collection on every page) formats months through the one function the sheet and
 * the label use, without carrying the sheet. `runs` and `forReader` are re-exported by $core/sheet, as before.
 */
import { MON3 } from './months';
import type { Year } from './sheet';

export const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A set of months as its circular runs, in words. One run: "March to May",
 * "November to February" (wrapping the year). Two runs (a bimodal season):
 * "March to April and September to October". Short style for a label:
 * "Mar–May", "Mar–Apr, Sep–Oct". The sheet and the label both format through
 * here, so the two can never disagree about a season.
 */
export function runs(ms: number[], style: 'long' | 'short' = 'long'): string {
  const set = new Set(ms.filter((m) => m >= 1 && m <= 12));
  if (!set.size) return '';
  if (set.size === 12) return 'all year';
  const N = style === 'long' ? MON : MON3;
  const dash = style === 'long' ? ' to ' : '–';
  // Starts: members whose predecessor is not a member. Walk each run to its end.
  const starts = [...set].filter((m) => !set.has(((m - 2 + 12) % 12) + 1));
  const found = starts.map((start) => {
    let end = start;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== start) end = (end % 12) + 1;
    return { start, end, wraps: end < start };
  });
  // Calendar order; a run that wraps the year holds January and so comes first.
  found.sort((a, b) => (a.wraps ? 0 : a.start) - (b.wraps ? 0 : b.start));
  const out = found.map(({ start, end }) => (start === end ? N[start - 1] : `${N[start - 1]}${dash}${N[end - 1]}`));
  if (out.length === 1) return out[0];
  return style === 'long' ? out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1] : out.join(', ');
}

/** The months in the reader's hemisphere: the habitat's own when both lie on the same side of the equator, else shifted. */
export const forReader = (year: Year, readerLat: number | null | undefined) => (!year.shiftable || ((readerLat ?? 40) < 0) === year.south ? year.growMonths : year.shifted);
