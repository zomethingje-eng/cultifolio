/**
 * Keys in the Worker's own cache (the Cache API), on a private host so no key is also a real address of the site, which
 * the adapter's cache could hand back to a request for it (round twenty-one, 5).
 *
 * Every key names the build (round sixty-nine; triage-68 W3, S-E3, R46-8, S-F6), the same `version` the client names in
 * its requests' `v=` and the page cache's key already carries (`forBuild`, hooks.server.ts). The search, sheets, names,
 * forecast and old-name answers were kept for a day (the forecast an hour) under the corpus or the query alone. A deploy
 * that kept the corpus served the old build's search order, sheet rules and frost wording for up to a day, and handed them
 * out as public under the new build's `v=`, so the adapter kept them a day more; and an old isolate still running during
 * a deploy wrote its answers under the keys the new build reads. A prefix bumped by hand (`search6`) was missed once.
 */
import { version } from '$app/environment';

/** The private host of the Worker's own cache keys. */
export const CACHE_HOST = 'https://cache.cultifolio';

/** A key for `name`, with the build first and then `params` in the order given (each URI-encoded). */
export function workerKey(name: string, params: Record<string, string | number>): Request {
  const q = Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`).join('');
  return new Request(`${CACHE_HOST}/${name}?v=${encodeURIComponent(version)}${q}`);
}
