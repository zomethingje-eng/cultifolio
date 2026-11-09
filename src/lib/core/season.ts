/**
 * A plant's growing season (round eighty-seven, t3; plan F7): a winter-grower, a summer-grower, or a plant with no rest,
 * and the months it rests in. Set by the grower on the plant, never by the app: the app suggests one from the habitat's
 * rain by month, by the species page's own reading (`growingYear` and `forReader` in $core/sheet, the rain rule and,
 * under 120 mm a year, the temperature rule), says it is a suggestion and which rule made it, and the grower confirms
 * or changes it.
 *
 * Stored on the accession as three fields (`season`, `restMonths`, `seasonFrom`), which the live code of round
 * eighty-six folds as fields it does not know. Read here, and only here, so a value another version wrote that is not
 * one of these words or months is read as not set, and the plant follows its space as before.
 */
import { forReader, runs } from './runs';
import type { Year } from './sheet';

export const SEASONS = ['winter', 'summer', 'none'] as const;
export type Season = (typeof SEASONS)[number];
/** What made the season the grower confirmed: the rain rule's suggestion, the temperature rule's, or the grower alone. */
export const SEASON_FROM = ['rain', 'cool', 'spread', 'grower'] as const;
export type SeasonFrom = (typeof SEASON_FROM)[number];

/** A plant's growing season as set, read from the record; null when none is set, or what is stored cannot be read. */
export interface PlantSeason {
  season: Season;
  /** Months, 1 to 12, in calendar order: none for a plant with no rest; at most eleven, so a plant is watered in some month. */
  rest: number[];
  from: SeasonFrom;
}

/**
 * Months as stored, read: whole numbers 1 to 12, each once, in calendar order. Null for anything else, and for a list of
 * twelve (a plant resting all year is never due, which no form here writes), so a damaged or foreign value never hides
 * a plant's watering.
 */
export function readMonths(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 12) return null;
  const out = new Set<number>();
  for (const m of v) {
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 12) return null;
    out.add(m);
  }
  if (out.size === 12) return null;
  return [...out].sort((a, b) => a - b);
}

/** The season a record carries, validated on read (round eighty-seven, t3; the tracker contract's "validation on read"). */
export function seasonOf(r: { season?: unknown; restMonths?: unknown; seasonFrom?: unknown } | null | undefined): PlantSeason | null {
  if (!r || typeof r.season !== 'string' || !(SEASONS as readonly string[]).includes(r.season)) return null;
  const season = r.season as Season;
  const from: SeasonFrom = typeof r.seasonFrom === 'string' && (SEASON_FROM as readonly string[]).includes(r.seasonFrom) ? (r.seasonFrom as SeasonFrom) : 'grower';
  if (season === 'none') return { season, rest: [], from };
  const rest = readMonths(r.restMonths);
  // A winter- or summer-grower with no readable rest months rests in none: said as set, never guessed.
  return { season, rest: rest ?? [], from };
}

/** A suggestion from the species sheet: the season, the months it rests in for the reader, and the rule that made it. */
export interface SeasonSuggestion {
  season: Season;
  rest: number[];
  rule: 'rain' | 'cool' | 'spread';
  /** The months it grows in, for the reader, as the species page says them. */
  grow: number[];
}

/**
 * What the habitat's year suggests, by the species page's own reading: a winter or summer growing season by the rain
 * rule (the rest is every month outside it, in the reader's hemisphere, as Today has read a habitat's dry season since
 * round fifty-four); the cooler six months by the temperature rule under 120 mm a year (a winter-grower); rain spread
 * over eight months or more (no rest). Nothing where the sheet reads no growing season: a rainy season at the year's
 * mean temperature, a flat temperature curve, wet months below freezing, or no season at all.
 */
export function suggestSeason(year: Year | null | undefined, readerLat: number | null | undefined): SeasonSuggestion | null {
  if (!year || year.none || year.frozen || year.flat) return null;
  if (year.spread) return { season: 'none', rest: [], rule: 'spread', grow: [] };
  if (year.grow !== 'winter' && year.grow !== 'summer' && year.grow !== 'cool') return null;
  const grow = [...forReader(year, readerLat)].sort((a, b) => a - b);
  if (!grow.length || grow.length >= 12) return null;
  const rest = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !grow.includes(m));
  return { season: year.grow === 'summer' ? 'summer' : 'winter', rest, rule: year.fog ? 'cool' : 'rain', grow };
}

/** "a winter-grower", "a summer-grower", "no rest". */
export const seasonWords = (s: Season): string => (s === 'winter' ? 'a winter-grower' : s === 'summer' ? 'a summer-grower' : 'no rest');

/** The rule behind a suggestion, in the species page's words. */
export function ruleWords(s: SeasonSuggestion): string {
  if (s.rule === 'spread') return "by the rain rule of its species page: 70% of the habitat's rain takes eight months or more, so no dry season is read";
  if (s.rule === 'cool') return `by the temperature rule of its species page (under 120 mm of rain a year): it grows in the habitat's cooler six months, ${runs(s.grow)}, here`;
  return `by the rain rule of its species page: 70% of the habitat's rain falls in ${runs(s.grow)}, here, read as a ${s.season} growing season`;
}

/** Why a plant is resting now, in one line for Today: what was set, and from what. */
export function restReason(p: PlantSeason): string {
  const what = `${p.season === 'winter' ? 'A winter-grower' : 'A summer-grower'} resting ${runs(p.rest)}`;
  const by = p.from === 'rain' ? "as you confirmed from its habitat's rain" : p.from === 'cool' ? "as you confirmed from its habitat's cooler six months" : 'as you set it';
  return `${what}, ${by}`;
}

/** Whether the plant rests in this month (1 to 12) by its own season. */
export const restsIn = (p: PlantSeason | null, month: number): boolean => !!p && p.season !== 'none' && p.rest.includes(month);
