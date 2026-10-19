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
 *   - Rule 6: deleting the count changes no page; the next run may then ask up to a day's allowance again that day.
 */
import type { JsonFetcher, FetchResult } from './fetch';

export interface CountStore {
  read(day: string): number;
  write(day: string, n: number): void;
}

/** The day's allowance of iNaturalist requests the corpus script keeps to: under its ten thousand, with room for a person. */
export const INAT_DAY_BUDGET = 9000;

export function dayBudget(inner: JsonFetcher, host: string, budget: number, store: CountStore, today = () => new Date().toISOString().slice(0, 10)): JsonFetcher & { used: () => number } {
  // Read from the store at every request, so two fetchers of one run, or two runs, share one count.
  const f = (async <T>(url: string, opts?: Parameters<JsonFetcher>[1]): Promise<FetchResult<T>> => {
    if (new URL(url).host !== host) return inner<T>(url, opts);
    const day = today();
    const n = store.read(day);
    if (n >= budget) return { status: 'refused', detail: `${host}: today's allowance of ${budget} requests is spent (UTC ${day}); asked again tomorrow` };
    store.write(day, n + 1);
    return inner<T>(url, opts);
  }) as JsonFetcher & { used: () => number };
  f.used = () => store.read(today());
  return f;
}
