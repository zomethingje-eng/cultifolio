/**
 * Round eighty-nine: GBIF's occurrence search asked once for a download, not once a pass. The species the download left to
 * the API path (bulk/api-path.txt: more records than its cut) are asked of GBIF's search by every offline pass, about
 * 13,600 requests and GBIF's throttle each time, because a dossier keeps only its open records and the climate is read
 * from all of them. Their answers are now kept with the download (`scripts/api-answers-store.ts`), and a pass that finds an
 * answer kept reads it in place of asking. The answer is the one GBIF gave, whole, so the page derived from it is the page
 * derived when GBIF gave it; each record carries the day GBIF gave it (`answeredDay`), and the record of the page says it,
 * as a download's records say the day GBIF made the download.
 *
 * Only the occurrence search's records (`hasCoordinate=true`), only offline: an online build asks GBIF, as before.
 */
import type { FetchOptions, FetchResult, JsonFetcher } from './fetch';
import type { GbifOccurrence, OccPage } from './sources/gbif';

/** The occurrence search's records of one key, as `gbif.occurrences` asks for them. */
export const KEPT_SEARCH = /\/occurrence\/search\?taxonKey=\d+&hasCoordinate=true/;

/** Where the answers are kept: one GBIF answer an address, with the day GBIF gave it. */
export interface AnswerStore {
  get(url: string): { day: string; data: unknown } | null;
  /** Kept whole or not at all; never throws (an answer not kept is asked again next time). */
  set(url: string, day: string, data: unknown): void;
}

export type AnswerStats = { kept: number; asked: number; days: Set<string> };

/** Each record of a page of answers, with the day GBIF gave it. */
function dated(data: OccPage, day: string): OccPage {
  return { ...data, results: (data.results ?? []).map((r) => ({ ...r, answeredDay: day })) };
}

/**
 * A fetcher that reads the occurrence search's answers from `store` where it holds them, and asks `net` for the rest,
 * keeping each answer it is given when `write` (a dry run keeps none: round eighty-six). Every other address goes to `net`.
 */
export function keptAnswers(net: JsonFetcher, store: AnswerStore, o: { write: boolean; today: () => string; stats?: AnswerStats }): JsonFetcher & { stats: AnswerStats } {
  const stats = o.stats ?? { kept: 0, asked: 0, days: new Set<string>() };
  const f = async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    if (!KEPT_SEARCH.test(url)) return net<T>(url, opts);
    const had = store.get(url);
    if (had) {
      stats.kept++;
      stats.days.add(had.day);
      return { status: 'ok', data: dated(had.data as OccPage, had.day) as unknown as T };
    }
    const r = await net<OccPage>(url, opts);
    if (r.status !== 'ok') return r as unknown as FetchResult<T>;
    const day = o.today();
    stats.asked++;
    stats.days.add(day);
    if (o.write) store.set(url, day, r.data);
    return { status: 'ok', data: dated(r.data, day) as unknown as T };
  };
  return Object.assign(f as JsonFetcher, { stats });
}

/**
 * The words a page's record of its records adds for answers read from GBIF's search on a day (round eighty-nine), and the
 * day it keeps as its `asOf` where every record is of one such answer.
 */
export function answeredWords(rows: readonly GbifOccurrence[]): { words?: string; asOf?: string } {
  const days = [...new Set(rows.flatMap((r) => (r.answeredDay ? [r.answeredDay] : [])))].sort();
  if (!days.length) return {};
  const words = days.length === 1 ? `GBIF's occurrence search as it answered on ${days[0]}` : `GBIF's occurrence search as it answered between ${days[0]} and ${days[days.length - 1]}`;
  const every = rows.every((r) => r.answeredDay === days[0]);
  return { words, ...(days.length === 1 && every ? { asOf: days[0] } : {}) };
}

/** The build's line of them. */
export const answerLine = (s: AnswerStats): string =>
  `GBIF's occurrence search (the API path): ${s.kept} answer${s.kept === 1 ? '' : 's'} read as kept${s.asked ? `, ${s.asked} asked` : ''}${s.days.size ? ` (${[...s.days].sort().join(', ')})` : ''}`;
