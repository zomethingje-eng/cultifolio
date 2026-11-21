/**
 * The words of a species row in the search panel (round 104; the second hand-off's round 9): figures, never "climate
 * known". Each figure is the index's, read from the dossier as the species page shows it (`low`, `rain`, `yr`).
 *
 * - With a habitat climate: "record low 4.4 °C · 941 mm a year · wet winters", in the reader's units. A figure the
 *   index does not hold (an index built before round 104 has no `rain` or `yr`) is left out, never said as none.
 * - With none: what the page has, its first native region and its photographs ("Cape Provinces and 2 more · 36
 *   photographs"). It does not say "no habitat climate" on every row; a genus with none says so once, on its own row.
 */
import { temp, rain, type Units } from '$core/units';
import { SEASON_HEAD, isSeasonKey } from '$core/season-key';

export interface RowEntry { climate?: string; low?: number; rain?: number; yr?: unknown; origin?: readonly string[]; photos?: number }

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function rowFigures(e: RowEntry, u: Units): string {
  if (e.climate === 'ok') {
    return [
      typeof e.low === 'number' ? `record low ${temp(e.low, u, 1)}` : '',
      typeof e.rain === 'number' ? `${rain(e.rain, u)} a year` : '',
      isSeasonKey(e.yr) ? lower(SEASON_HEAD[e.yr]) : ''
    ].filter(Boolean).join(' · ');
  }
  const o = e.origin ?? [];
  const where = o.length ? `${o[0]}${o.length > 1 ? ` and ${o.length - 1} more` : ''}` : '';
  const ph = typeof e.photos === 'number' ? `${e.photos.toLocaleString('en-GB')} photograph${e.photos === 1 ? '' : 's'}` : '';
  return [where, ph].filter(Boolean).join(' · ');
}
