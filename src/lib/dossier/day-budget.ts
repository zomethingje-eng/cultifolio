/**
 * A host's daily allowance, kept across runs of one UTC day (round seventy-eight, agent B). iNaturalist asks for "about 1
 * per second, and around 10k API requests a day" (https://www.inaturalist.org/pages/api+recommended+practices): a fill
 * of iNaturalist's cultivated photographs at 54,000 species is about 60,000 requests, so it runs over several days, and
 * each day's run stops at the day's allowance, saying so, and the next day's picks up where it stopped.
 *
 *   - What is counted: the requests that reach the host, not the answers the day cache serves (`day-cache.ts` sits in
 *     front of this layer), across every run of the UTC day, in `store` (the corpus script's is
 *     `cache/day-budget/<day>.json`, beside the day cache, never uploaded).
 *   - What happens at the allowance: the host is not asked, and the answer is a refusal that says so, never "none": the
 *     builder records the source as not checked and keeps what the previous build had, and a fill stops (rule 2).
 *   - What is given back (round eighty-one): a request that reached no server (`unreached`: the connection failed), so a
 *     fill that lost its network has not spent the day on it.
 *   - Rule 6: deleting the count changes no page; the next run may then ask up to a day's allowance again that day.
 */
import type { JsonFetcher, FetchResult } from './fetch';

export interface CountStore {
  read(day: string): number;
  write(day: string, n: number): void;
}

/**
 * The day's allowance of iNaturalist requests the corpus script keeps to (round eighty, agent I): 4,000. Its practices say
 * "around 10k API requests a day", but it throttled the owner's first fill (2026-10-22) after 5,273 requests in 97
 * minutes, and again after about 350 pages more that day, so the tolerance it shows this address is nearer 5,500 a day
 * than 10,000. With the observation searches batched (`inat-batch.ts`), 4,000 is about two and a half hours at 2 s and
 * covers the pages that 9,000 single requests did. A run of 429s is a throttle, waited out, never this allowance.
 */
export const INAT_DAY_BUDGET = 4000;

export function dayBudget(inner: JsonFetcher, host: string, budget: number, store: CountStore, today = () => new Date().toISOString().slice(0, 10)): JsonFetcher & { used: () => number } {
  // Read from the store at every request, so two fetchers of one run, or two runs, share one count.
  const f = (async <T>(url: string, opts?: Parameters<JsonFetcher>[1]): Promise<FetchResult<T>> => {
    if (new URL(url).host !== host) return inner<T>(url, opts);
    const day = today();
    const n = store.read(day);
    if (n >= budget) return { status: 'refused', detail: `${host}: today's allowance of ${budget} requests is spent (UTC ${day}); asked again tomorrow` };
    store.write(day, n + 1);
    const r = await inner<T>(url, opts);
    // A request that reached no server (round eighty-one, review B2: a fill that lost its network was charged 32 of the
    // day for 60 calls that all failed) is given back: no host counted it. A timeout, or any answer, stays counted.
    if (r.status === 'error' && r.unreached) store.write(day, Math.max(0, store.read(day) - 1));
    return r;
  }) as JsonFetcher & { used: () => number };
  f.used = () => store.read(today());
  return f;
}
