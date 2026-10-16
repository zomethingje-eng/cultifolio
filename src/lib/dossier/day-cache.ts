/**
 * The day's upstream answers, kept so a rerun of the corpus step the same day does not ask again (round seventy-two; the
 * owner's process change 5, reviewer D's trial). Measured on the real corpus: a second `--fill kew-links` asked all
 * 8,795 of its GBIF requests again, a second `--fill wikidata` its 167 reads of fifty items, and a `--keys` run started
 * again after drops were read asked every one of its species' sources again.
 *
 *   - What is kept: an answer (`ok`) and a settled absence (`none`, a 404), by the exact URL asked. Never a refusal, a
 *     failure or a timeout, and never a MediaWiki answer that is an error in an HTTP 200 (a lag, a rate limit), so a
 *     source that did not answer is asked again, and is said "not checked" until it answers (rule 2).
 *   - How long: the UTC day it was read, and no longer. An answer is served only to a run of the same day, so every day a
 *     dossier says it read a source is the day the source said it; days before are deleted when a run starts.
 *   - Where: the store the caller gives (the corpus script's is `cache/upstream/<day>/` in the project folder, never under
 *     `static/`, so never uploaded). It is a reading of what the sources said, not part of the corpus: deleting the
 *     folder at any moment changes no result, only what the next run asks (rule 6). `--no-cache` asks everything.
 */
import type { JsonFetcher, FetchResult } from './fetch';

export interface DayStore {
  get(key: string): string | null;
  set(key: string, body: string): void;
}

type Kept = { url: string; at: string; status: 'ok' | 'none'; data?: unknown };

/** A MediaWiki error answered with HTTP 200 ({ error: { code } }): not an answer, so never kept. */
const mwErrorBody = (data: unknown) => !!data && typeof data === 'object' && 'error' in (data as Record<string, unknown>) && typeof (data as { error?: unknown }).error === 'object';

export function dayCached(inner: JsonFetcher, store: DayStore, keyOf: (url: string) => string, now = () => new Date().toISOString()): JsonFetcher & { hits: () => number } {
  let hits = 0;
  const f = (async <T>(url: string, opts?: Parameters<JsonFetcher>[1]): Promise<FetchResult<T>> => {
    const key = keyOf(url);
    const raw = store.get(key);
    if (raw) {
      try {
        const k = JSON.parse(raw) as Kept;
        // The key is a hash: the URL kept with the answer is the one asked, or the answer is not this one.
        if (k.url === url) {
          hits++;
          return k.status === 'none' ? { status: 'none' } : { status: 'ok', data: k.data as T };
        }
      } catch {
        /* a file cut off by a killed run: asked again, and written whole */
      }
    }
    const r = await inner<T>(url, opts);
    if (r.status === 'ok' && !mwErrorBody(r.data)) store.set(key, JSON.stringify({ url, at: now(), status: 'ok', data: r.data } satisfies Kept));
    else if (r.status === 'none') store.set(key, JSON.stringify({ url, at: now(), status: 'none' } satisfies Kept));
    return r;
  }) as JsonFetcher & { hits: () => number };
  f.hits = () => hits;
  return f;
}
