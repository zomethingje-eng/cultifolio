/**
 * The season of a page's habitat year as one word, for the index (round 104; the second hand-off's round 9): what a
 * search row and, from round 10, a browse filter read, so a row and its species page never disagree. The key is read
 * from `growingYear` (`$core/sheet`) in the order `seasonWords` (`$lib/ui/ref/season`) reads it, and `SEASON_HEAD` is
 * that function's own head for each; test r104a holds the two together.
 */
import type { Year } from './sheet';

export type SeasonKey = 'none' | 'fog' | 'spread' | 'flat' | 'even' | 'frozen' | 'winter' | 'summer';

export const SEASON_KEYS: readonly SeasonKey[] = ['summer', 'spread', 'winter', 'flat', 'frozen', 'even', 'fog', 'none'];

export function seasonKey(year: Year): SeasonKey {
  if (year.none) return 'none';
  if (year.fog) return 'fog';
  if (year.spread) return 'spread';
  if (year.flat) return 'flat';
  if (year.grow === 'even') return 'even';
  if (year.frozen) return 'frozen';
  return year.grow === 'winter' ? 'winter' : 'summer';
}

/** The species page's head for each season (`seasonWords(...).head`). */
export const SEASON_HEAD: Record<SeasonKey, string> = {
  none: 'No season to read',
  fog: 'Little rain',
  spread: 'Rain spread',
  flat: 'Rainy season',
  even: 'Rainy season',
  frozen: 'Wet, freezing winters',
  winter: 'Wet winters',
  summer: 'Wet summers'
};

export const isSeasonKey = (x: unknown): x is SeasonKey => typeof x === 'string' && (SEASON_KEYS as readonly string[]).includes(x);
