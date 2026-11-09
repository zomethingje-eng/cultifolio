/**
 * The browse pages' own requests from the browser (round eighty-seven, C6 and C7): /browse/data's parts, each under the
 * corpus and the build the page reads (`c`, `v`), as the search box's are, so an answer is kept by the edge for that
 * reference and version only. What goes is a browse view's query and nothing else: never a plant, a name of the
 * collection's, or which pins a device holds beyond the view asked about (/about/how#privacy).
 *
 * Each answer is kept for this page's life by its address, so a pin's species asked for the front page and again on its
 * view are asked once. A failed request is not kept, and the caller says "not reached", never a count of none (rule 2).
 */
import { version } from '$app/environment';
import { corpusInfo } from '$lib/ui/index.svelte';

const held = new Map<string, Promise<unknown>>();

/** The answer of /browse/data?part=<part> for a browse query ("?r=NAM&f=apocynaceae" or ""), or null where none came. */
export async function browseData<T>(part: 'count' | 'regions' | 'keys' | 'names', query: string, extra = ''): Promise<T | null> {
  const info = await corpusInfo().catch(() => ({ id: '' }));
  const q = query.replace(/^\?/, '');
  const url = `/browse/data?part=${part}${q ? `&${q}` : ''}${extra}${info.id ? `&c=${encodeURIComponent(info.id)}` : ''}&v=${encodeURIComponent(version)}`;
  let p = held.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(url, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
    held.set(url, p);
    void p.then((x) => { if (x === null) held.delete(url); });
  }
  return p;
}

/** The species a view gives now, written short, or why not: too many to follow (`wide`), a region gone from the scheme (`gone`, its codes; `n` the rest's), or not reached (null). */
export type ViewKeys = { n: number; keys: string | null; wide?: boolean; gone?: string[] };
export const keysOf = (query: string) => browseData<ViewKeys>('keys', query);
/** Names and addresses of page ids, for the species a pin gained or lost. */
export type Named = { key: string; name: string; slug: string; common?: string };
export const namesOf = (keys: readonly string[]) => (keys.length ? browseData<{ names: Named[] }>('names', '', `&k=${keys.slice(0, 60).join(',')}`) : Promise.resolve({ names: [] as Named[] }));
