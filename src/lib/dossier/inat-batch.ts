/**
 * iNaturalist's observation searches, several taxa a request (round eighty, agent I). The owner's first cultivated fill
 * (2026-10-22) was throttled after 5,273 requests at 1.1 s apart, and after about 350 pages more at 1.5 s: one search a
 * page for the cultivated set, one for the 24 most-voted wild observations where the open data holds more than 24
 * (agent V), each of iNaturalist's API v1, whose observation carries every identification, taxon and user in full (313 KB
 * for two observations of Rhododendron austrinum, measured 2026-10-22). iNaturalist's practices
 * (https://www.inaturalist.org/pages/api+recommended+practices, read 2026-10-22) ask "to use the highest supported
 * `per_page` value" and to "send a concatenated list of multiple IDs to fetch many records in a single request". So:
 *
 *   - one search asks for several taxa (`taxon_id=<a>,<b>,…`, which takes in each one's descendants, as one taxon's search
 *     does) and 200 observations, the API's most a page, in the same order as a page's own search (`order_by=votes`);
 *   - of iNaturalist's API v2, with `fields` naming only what `inat.photos` reads (`OBS_FIELDS`): 3.5 KB for the same two
 *     observations. The same filters give the same observations (measured on eight taxa, v1 against v2: the same totals,
 *     the same sets);
 *   - a taxon's set is its first `perTaxon` observations of the answer (an observation counts for a taxon when the taxon is
 *     its own or one of its `ancestor_ids`). Those are its first `perTaxon` by the search's order, the set its own search
 *     gives, when the answer is the whole answer (`total_results` no more than the observations returned) or holds at
 *     least `perTaxon` of the taxon (any of its observations not returned comes after them). Any other taxon is asked again,
 *     with the others not yet answered, or, when none was answered, in two halves; a taxon left alone is asked by its page's
 *     own search. Among observations of equal votes (most have none), iNaturalist's order is its own and changes from one
 *     request to another, for a taxon's own search as much as for a batch (agent V measured it): the set is the 24 (or 12)
 *     iNaturalist put first that day, as before.
 *
 * Nothing else changes: the page still asks `wildUrl` or `cultivatedUrl` and reads the answer with `inat.photos` (licence,
 * author, agreement, descendants); this layer answers that request from the batch, or asks it of v2 with the fields alone.
 */
import type { JsonFetcher, FetchResult } from './fetch';
import { INAT, wildUrl, cultivatedUrl } from './sources/inat';

export const INAT2 = 'https://api.inaturalist.org/v2';
/** What `inat.photos` and `agreedCaptive` read of an observation, in v2's `fields` form (RISON), and nothing more. */
export const OBS_FIELDS =
  '(id:!t,uuid:!t,observed_on:!t,place_guess:!t,captive:!t,quality_grade:!t,community_taxon_id:!t,num_identification_disagreements:!t,' +
  'taxon:(id:!t,name:!t,rank:!t,ancestor_ids:!t),identifications:(current:!t,taxon:(id:!t,ancestor_ids:!t)),' +
  'photos:(id:!t,license_code:!t,url:!t,attribution:!t,original_dimensions:(width:!t,height:!t)),user:(login:!t,name:!t))';
/** Observations a batch asks for: the API's most a page. */
export const BATCH_PER_PAGE = 200;
/** Taxa a cultivated batch asks at first: most hold few cultivated observations (418 to 856 for 50 taxa, measured). */
export const CULTIVATED_BATCH = 50;
/**
 * Taxa a wild batch asks at first, each of more than 24 qualifying observations, put together by the open data's counts
 * (`wildGroups`): six of like size share 200 observations well enough for each to have its 24 (29 of 30 in one request,
 * measured 2026-10-22 on five groups from 26 to 784 observations).
 */
export const WILD_BATCH = 6;

export type ObsKind = 'wild' | 'cultivated';
const urlOf = (kind: ObsKind) => (kind === 'wild' ? wildUrl : cultivatedUrl);

/** A page's own search (`wildUrl`, `cultivatedUrl`) read back: which set, of which taxon, how many; null for any other request. */
export function obsAsk(url: string): { kind: ObsKind; taxon: number; perPage: number } | null {
  if (!url.startsWith(`${INAT}/observations?`)) return null;
  const t = /[?&]taxon_id=(\d+)(?:&|$)/.exec(url), n = /[?&]per_page=(\d+)(?:&|$)/.exec(url);
  if (!t || !n) return null;
  const taxon = Number(t[1]), perPage = Number(n[1]);
  for (const kind of ['wild', 'cultivated'] as const) if (urlOf(kind)(taxon, perPage) === url) return { kind, taxon, perPage };
  return null;
}

/** The same search for these taxa, of iNaturalist's API v2 with only the fields read (`OBS_FIELDS`). */
export function lightUrl(kind: ObsKind, taxa: readonly number[], perPage: number): string {
  const v1 = urlOf(kind)(0, perPage).replace('taxon_id=0&', `taxon_id=${taxa.join(',')}&`);
  return `${v1.replace(`${INAT}/`, `${INAT2}/`)}&fields=${encodeURIComponent(OBS_FIELDS)}`;
}

type Obs = { taxon?: { id?: number; ancestor_ids?: number[] } };
type Answer = { total_results?: number; results?: Obs[] };

/**
 * Asks for the taxa's sets, several a request, as the head of this file says; the sets answered, and the refusal that
 * stopped the asking, if one did (the page's own request then meets the same refusal). An answer that is not "ok" leaves
 * those taxa to their pages' own searches.
 */
export async function askBatch(f: JsonFetcher, kind: ObsKind, taxa: readonly number[], perTaxon: number): Promise<{ sets: Map<number, Obs[]>; asked: number; refused?: string }> {
  const sets = new Map<number, Obs[]>();
  let asked = 0;
  const queue: number[][] = [[...new Set(taxa)]];
  while (queue.length) {
    const part = queue.shift()!;
    if (part.length < 2) continue; // one taxon is its page's own search
    const r = (await f<Answer>(lightUrl(kind, part, BATCH_PER_PAGE))) as FetchResult<Answer>;
    asked++;
    if (r.status === 'refused') return { sets, asked, refused: r.detail };
    if (r.status !== 'ok') continue;
    const res = r.data.results ?? [];
    const whole = typeof r.data.total_results === 'number' && r.data.total_results <= res.length;
    const got = new Map<number, Obs[]>(part.map((t) => [t, []]));
    for (const o of res) {
      const line = new Set([o.taxon?.id, ...(o.taxon?.ancestor_ids ?? [])]);
      for (const t of part) if (line.has(t)) got.get(t)!.push(o);
    }
    const rest: number[] = [];
    for (const t of part) {
      const g = got.get(t)!;
      if (whole || g.length >= perTaxon) sets.set(t, g.slice(0, perTaxon));
      else rest.push(t);
    }
    if (!rest.length) continue;
    if (rest.length < part.length) queue.unshift(rest);
    else { const h = Math.ceil(rest.length / 2); queue.unshift(rest.slice(0, h), rest.slice(h)); }
  }
  return { sets, asked };
}

/** Taxa grouped for the wild batches: by the open data's count of each (unknown counts last), `WILD_BATCH` a group. */
export function wildGroups(taxa: readonly number[], count: (t: number) => number | undefined): number[][] {
  const sorted = [...new Set(taxa)].sort((a, b) => (count(a) ?? Infinity) - (count(b) ?? Infinity) || a - b);
  const out: number[][] = [];
  for (let i = 0; i < sorted.length; i += WILD_BATCH) out.push(sorted.slice(i, i + WILD_BATCH));
  return out;
}

export interface BatchStats { batches: number; served: number; own: number }
export type BatchedFetcher = JsonFetcher & {
  /** Asks the sets of these taxa ahead of their pages; the refusal that stopped it, if one did. */
  prefetch(kind: ObsKind, taxa: readonly number[], perTaxon: number): Promise<string | undefined>;
  stats: BatchStats;
};

/**
 * The fill's iNaturalist fetcher: a page's own search (`obsAsk`) answered from a batch asked ahead (`prefetch`), or asked
 * of v2 with the fields alone (`lightUrl`); every other request passed to `inner` as it is.
 */
export function inatBatched(inner: JsonFetcher): BatchedFetcher {
  const held = new Map<string, Obs[]>();
  const stats: BatchStats = { batches: 0, served: 0, own: 0 };
  const f = (async <T>(url: string, opts?: Parameters<JsonFetcher>[1]): Promise<FetchResult<T>> => {
    const a = obsAsk(url);
    if (!a) return inner<T>(url, opts);
    const k = `${a.kind} ${a.taxon} ${a.perPage}`;
    const set = held.get(k);
    if (set) { held.delete(k); stats.served++; return { status: 'ok', data: { results: set } as T }; }
    stats.own++;
    return inner<T>(lightUrl(a.kind, [a.taxon], a.perPage), opts);
  }) as BatchedFetcher;
  f.stats = stats;
  f.prefetch = async (kind, taxa, perTaxon) => {
    const todo = [...new Set(taxa)].filter((t) => !held.has(`${kind} ${t} ${perTaxon}`));
    if (todo.length < 2) return undefined;
    const r = await askBatch(inner, kind, todo, perTaxon);
    stats.batches += r.asked;
    for (const [t, s] of r.sets) held.set(`${kind} ${t} ${perTaxon}`, s);
    return r.refused;
  };
  return f;
}
