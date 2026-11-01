// The cache lifetime of the index and the counts, as the live check reads it (round eighty-four; outside review B9; round
// eighty-five, the owner's decision 9 and reviews A18, B5, C5). The routes set `public, max-age=300`, and /about/how says
// the index and the counts are cached five minutes; the reviews' GETs met `public, max-age=14400` with
// `cf-cache-status: HIT`, which is Cloudflare's default "Browser Cache TTL" of four hours overriding the origin's header on
// an answer from its cache. A HEAD did not show it, and neither does a miss: round eighty-four's check read one GET, which
// right after an upload is a miss, and passed. So the check now reads each route until the edge answers it from its
// cache (a HIT), and judges that answer's header, as a browser is sent it.

/** The longest lifetime the pages promise for the index and the counts, in seconds. */
export const INDEX_MAX_AGE = 300;
/** The routes judged on an edge hit. */
export const EDGE_ROUTES = ['/api/index', '/api/counts'];

/** Why a `cache-control` header breaks the five minutes promised, or null when it keeps it. @param {string | null | undefined} cacheControl @param {string} [path] @returns {string | null} */
export function indexCacheFault(cacheControl, path = '/api/index') {
  const h = String(cacheControl ?? '').toLowerCase();
  if (!h) return 'it has no cache-control header';
  if (/no-store/.test(h)) return null; // stricter than promised: an answer of the fallback, or a refusal
  const m = /(?:^|[,\s])max-age=(\d+)/.exec(h);
  if (!m) return `it says "${cacheControl}", with no max-age`;
  const age = Number(m[1]);
  if (age > INDEX_MAX_AGE) return `it says max-age=${age} (${Math.round(age / 60)} minutes), past the ${INDEX_MAX_AGE / 60} minutes the route sets and /about/how states. The route sets ${INDEX_MAX_AGE}, so this is the zone's setting, not the Worker just deployed, and no rollback is needed: in Cloudflare's dashboard set Caching > Configuration > Browser Cache TTL to "Respect Existing Headers", purge ${path}, and run the check again`;
  const sm = /s-maxage=(\d+)/.exec(h);
  if (sm && Number(sm[1]) > INDEX_MAX_AGE) return `it says s-maxage=${sm[1]}, past the ${INDEX_MAX_AGE} seconds promised`;
  return null;
}

/** The answer came from Cloudflare's cache. */
export const isHit = (r) => /^HIT$/i.test(r.h('cf-cache-status'));
/** The answer came through Cloudflare at all (a ray id); a local `wrangler dev` has none, and no edge to hit. */
export const viaEdge = (r) => !!r.h('cf-ray');

/**
 * `get(path)` until the edge answers from its cache, at most `tries` times `waitMs` apart: the first GET after an upload or
 * a purge is a miss, the next a hit, unless another data centre answers it. Returns the hit, or the last answer.
 */
export async function edgeHitGet(get, path, { tries = 5, waitMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let r;
  for (let t = 0; t < tries; t++) {
    if (t) await sleep(waitMs);
    r = await get(path);
    if (r.status !== 200 || isHit(r) || !viaEdge(r)) return { r, hit: isHit(r), tries: t + 1 };
  }
  return { r, hit: false, tries };
}

/**
 * The verdict on one route: a failure's words, or null with what passed. A route that never came from the edge's cache
 * fails, since a miss cannot show what a browser is sent from it (round eighty-four's check passed on a miss); a local
 * server, with no edge, is judged on its own header and says so.
 * @returns {{ fail: string | null, ok: string }}
 */
export function edgeVerdict(path, { r, hit, tries }) {
  if (r.status !== 200) return { fail: `${path} answered ${r.status}`, ok: '' };
  const header = r.h('cache-control');
  if (viaEdge(r) && !hit) return { fail: `${path}: none of ${tries} GETs a second apart was answered from the edge's cache (cf-cache-status "${r.h('cf-cache-status')}"), so what a browser is sent from it was not read. Run the check again; if it fails the same way, the zone no longer caches ${path} at the edge, which the five minutes in /about/how rely on`, ok: '' };
  const fault = indexCacheFault(header, path);
  if (fault) return { fail: `${path}'s cache lifetime${hit ? ' on an edge hit' : ''}: ${fault}`, ok: '' };
  return { fail: null, ok: `${path}: ${hit ? `an edge hit (after ${tries} GET${tries === 1 ? '' : 's'})` : 'no edge here (a local server)'} says "${header}", within the ${INDEX_MAX_AGE / 60} minutes promised` };
}
