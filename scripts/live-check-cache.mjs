// The species index's cache lifetime, as the live check reads it (round eighty-four; outside review B9). The route sets
// `public, max-age=300`, and /about/how says the index is cached five minutes; review B's GET met `public, max-age=14400`
// with `cf-cache-status: HIT`, which is Cloudflare's default "Browser Cache TTL" of four hours overriding the origin's
// header on an answer from its cache. A HEAD did not show it. The check reads the header of a GET, as a browser would.

/** The index's longest lifetime the pages promise, in seconds. */
export const INDEX_MAX_AGE = 300;

/** Why a `cache-control` header breaks the index's promise, or null when it keeps it. @param {string | null | undefined} cacheControl @returns {string | null} */
export function indexCacheFault(cacheControl) {
  const h = String(cacheControl ?? '').toLowerCase();
  if (!h) return 'it has no cache-control header';
  if (/no-store/.test(h)) return null; // stricter than promised: an answer of the fallback, or a refusal
  const m = /(?:^|[,\s])max-age=(\d+)/.exec(h);
  if (!m) return `it says "${cacheControl}", with no max-age`;
  const age = Number(m[1]);
  if (age > INDEX_MAX_AGE) return `it says max-age=${age} (${Math.round(age / 60)} minutes), past the ${INDEX_MAX_AGE / 60} minutes the route sets and /about/how states. The route sets ${INDEX_MAX_AGE}, so this is the zone's setting, not the Worker just deployed, and no rollback is needed: in Cloudflare's dashboard set Caching > Configuration > Browser Cache TTL to "Respect Existing Headers", purge /api/index, and run the check again`;
  const sm = /s-maxage=(\d+)/.exec(h);
  if (sm && Number(sm[1]) > INDEX_MAX_AGE) return `it says s-maxage=${sm[1]}, past the ${INDEX_MAX_AGE} seconds promised`;
  return null;
}
