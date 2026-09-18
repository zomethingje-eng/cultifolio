/**
 * One fetch layer for every upstream, usable from Node (offline corpus build)
 * and from the Worker (tail builds). It tells the builder the difference
 * between "the source answered with nothing" and "the source would not
 * answer" — the distinction the whole dossier design rests on.
 */

export type FetchResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'none' }
  | { status: 'refused'; detail: string }
  | { status: 'error'; detail: string };

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Treat 404 as "none" (default true). */
  noneOn404?: boolean;
  /** Internal: which retry this is (0 = first try). */
  attempt?: number;
}

export const USER_AGENT = 'Cultifolio/3.0 (https://cultifolio.com; hello@cultifolio.com)';

export type JsonFetcher = <T = unknown>(url: string, opts?: FetchOptions) => Promise<FetchResult<T>>;

/** Per-host pacing so a corpus build is a good citizen (iNat asks for ~1/s). */
const MIN_GAP_MS: Record<string, number> = {
  'api.inaturalist.org': 1100,
  'api.gbif.org': 250,
  'en.wikipedia.org': 250,
  'www.wikidata.org': 250,
  'commons.wikimedia.org': 250,
  'api.openalex.org': 1100,
  'power.larc.nasa.gov': 2100,
  'nominatim.openstreetmap.org': 1100
};
const lastAt = new Map<string, number>();

/**
 * A host that has refused us through every retry, several times running, is
 * rate-limiting for longer than a retry can wait out. Stop asking it for a
 * while and let the builder record an honest refusal; --only-refused picks
 * those species up on the next run.
 */
const STRIKES_TO_TRIP = 3;
const COOLDOWN_MS = 10 * 60_000;
const strikes = new Map<string, number>();
const coolUntil = new Map<string, number>();
/**
 * A host that makes every call wait (429 with Retry-After, then success) is
 * not refusing, so the strikes never trip, and a fill can crawl at a call a
 * minute for hours. That many waits in a row is a quota spent for the day:
 * the host is cooled and the caller gets an honest refusal to stop on.
 */
const THROTTLED_RUN = 8;
const RETRIES = 5;
const throttledRun = new Map<string, number>();
const RECENT_MS = 60 * 60_000;
export function hostCooling(host: string, now = Date.now()): boolean {
  return (coolUntil.get(host) ?? 0) > now;
}
/** Cooled within the last hour: the host is known to be throttling this address, so a 429 goes straight back to cooling rather than through slow retries. */
function hostTouchy(host: string, now = Date.now()): boolean {
  const until = coolUntil.get(host) ?? 0;
  return until > 0 && now - until < RECENT_MS;
}
function strike(host: string): void {
  const n = (strikes.get(host) ?? 0) + 1;
  strikes.set(host, n);
  if (n >= STRIKES_TO_TRIP) {
    coolUntil.set(host, Date.now() + COOLDOWN_MS);
    strikes.set(host, 0);
  }
}
/** For tests. */
export function resetPacing(): void {
  lastAt.clear();
  strikes.clear();
  coolUntil.clear();
  throttledRun.clear();
}
/** For tests: pretend a host finished cooling a moment ago. */
export function markCooledRecently(host: string): void {
  coolUntil.set(host, Date.now() - 1000);
}

async function pace(host: string): Promise<void> {
  const gap = MIN_GAP_MS[host] ?? 100;
  const prev = lastAt.get(host) ?? 0;
  const wait = prev + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.set(host, Date.now());
}

export function makeFetcher(fetchImpl: typeof fetch = fetch): JsonFetcher {
  return async <T>(url: string, opts: FetchOptions = {}): Promise<FetchResult<T>> => {
    const host = new URL(url).host;
    if (hostCooling(host)) return { status: 'refused', detail: `${host} rate-limiting; not asked again for a while` };
    await pace(host);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20000);
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT, ...opts.headers },
        signal: ctl.signal
      });
      if (res.status === 404 && opts.noneOn404 !== false) return { status: 'none' };
      if (res.status === 429 && hostTouchy(host)) {
        // Still throttled after a cooldown: back to cooling at once; --only-refused (or a key) is the way through.
        coolUntil.set(host, Date.now() + COOLDOWN_MS);
        strikes.set(host, 0);
        return { status: 'refused', detail: `${host} 429 again after a cooldown; not asked for a while` };
      }
      // Up to five polite retries: GBIF's occurrence search answers 429 with a Retry-After of 3 s under load, and three
      // tries at that were giving up on a host that was about to answer.
      if ((res.status === 429 || res.status === 503) && (opts.attempt ?? 0) < RETRIES) {
        if (!(opts.attempt ?? 0)) {
          const run = (throttledRun.get(host) ?? 0) + 1;
          throttledRun.set(host, run);
          if (run >= THROTTLED_RUN) {
            coolUntil.set(host, Date.now() + COOLDOWN_MS);
            throttledRun.set(host, 0);
            return { status: 'refused', detail: `${host} made ${run} calls in a row wait; its quota for the day is spent` };
          }
        }
        // Polite retries after the server's own Retry-After (capped), backing off, then give up honestly.
        const attempt = (opts.attempt ?? 0) + 1;
        const ra = Number(res.headers.get('retry-after'));
        const wait = Math.min(30000, res.headers.has('retry-after') && Number.isFinite(ra) && ra >= 0 ? ra * 1000 : 4000 * attempt);
        clearTimeout(timer);
        // Say so on a terminal, so a run that is waiting out a throttle does not look hung.
        if (typeof process !== 'undefined' && process.stdout?.isTTY) process.stdout.write(`\n  ${host} ${res.status}: waiting ${Math.round(wait / 1000)} s (retry ${attempt} of ${RETRIES})…`);
        await new Promise((r) => setTimeout(r, wait));
        return makeFetcher(fetchImpl)<T>(url, { ...opts, attempt });
      }
      if (res.status === 429 || res.status === 403 || res.status === 503) {
        if (res.status === 429) strike(host);
        return { status: 'refused', detail: `${host} ${res.status}` };
      }
      if (!res.ok) return { status: 'error', detail: `${host} ${res.status}` };
      strikes.set(host, 0);
      if (!(opts.attempt ?? 0)) throttledRun.set(host, 0); // answered first time: the host is not throttling
      const data = (await res.json()) as T;
      return { status: 'ok', data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort/i.test(msg)) return { status: 'refused', detail: `${host} timeout` };
      // A dropped connection ("fetch failed") is usually momentary: one more try after a pause.
      if ((opts.attempt ?? 0) < 1) {
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, 3000));
        return makeFetcher(fetchImpl)<T>(url, { ...opts, attempt: (opts.attempt ?? 0) + 1 });
      }
      return { status: 'error', detail: `${host} ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** A fetcher backed by a map of URL → JSON, for tests and fixtures. Unmatched URLs are "refused" so a test can never mistake a missing fixture for an absence. */
export function fixtureFetcher(table: Record<string, unknown>, fallback: FetchResult<never> = { status: 'refused', detail: 'no fixture' }): JsonFetcher {
  const entries = Object.entries(table);
  return async <T>(url: string): Promise<FetchResult<T>> => {
    for (const [pat, data] of entries) {
      if (url === pat || url.startsWith(pat) || (pat.startsWith('re:') && new RegExp(pat.slice(3)).test(url))) {
        if (data === null) return { status: 'none' };
        if (typeof data === 'object' && data && '__status' in (data as Record<string, unknown>)) return data as FetchResult<T>;
        return { status: 'ok', data: data as T };
      }
    }
    return fallback;
  };
}
