/**
 * What the offline page needs to open a page from the device's own copy of its data (round eighty-one; the phone review's
 * 3): whether the worker keeps that page's `__data.json` (asked for by a move inside the app), and a guard so the offline
 * page tries it once per address, not in a loop when the page's scripts are not kept and the app falls back to a full load.
 */
const TRIED = 'cultifolio.offline-tried';
const AGAIN_MS = 60_000;

/** The address of a page's data, as the framework asks for it (its query is the framework's own and is not compared). */
export const dataPath = (path: string) => (path === '/' ? '/__data.json' : `${path.replace(/\/+$/, '')}/__data.json`);

/**
 * Whether this build's cache holds the page's data, the one cache the worker answers a page's data from (src/service-worker.ts
 * names it `cultifolio-<version>`): a copy in the previous build's cache would pass here and then fail the page's own request.
 * False where the Cache API is not there or refuses.
 */
export async function keptData(path: string, version: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(`cultifolio-${version}`))) return false;
    return !!(await (await caches.open(`cultifolio-${version}`)).match(dataPath(path), { ignoreSearch: true, ignoreVary: true }));
  } catch {
    return false;
  }
}

/** True the first time for an address, then not again for a minute. Without session storage, never: no guard, no try. */
export function mayTryKept(path: string, now = Date.now(), store: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): boolean {
  try {
    if (!store) return false;
    const was = JSON.parse(store.getItem(TRIED) ?? 'null') as { path?: string; at?: number } | null;
    if (was && was.path === path && typeof was.at === 'number' && now - was.at < AGAIN_MS) return false;
    store.setItem(TRIED, JSON.stringify({ path, at: now }));
    return true;
  } catch {
    return false;
  }
}
