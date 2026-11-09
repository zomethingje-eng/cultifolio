/**
 * One fetch layer for every upstream, used by the corpus script (scripts/build-dossiers.ts) and its tests. It tells the
 * builder the difference between "the source answered with nothing" and "the source would not answer": the distinction
 * the whole dossier design rests on. No Worker route builds a dossier: the Worker serves the corpus (round sixty-nine;
 * triage-68 M10, S-A7).
 */

export type FetchResult<T> =
  | { status: 'ok'; data: T; detail?: string }
  | { status: 'none' }
  | { status: 'refused'; detail: string }
  /**
   * `unreached` (round eighty-one, review B2): the request reached no server at all (the connection failed: a network
   * down, a PC asleep, a dropped Wi-Fi), so no host answered and no host counted it; a day's allowance gives it back.
   */
  | { status: 'error'; detail: string; unreached?: true }
  /**
   * Not asked: the builder held the call back (an offline re-derivation), so nothing was refused and nothing is known
   * either way. Recorded as `skipped` and said "not asked"; it was `refused` before, and 44 pages said a source had
   * refused that was never asked (round sixty-seven; triage-66 N4, S-B4).
   */
  | { status: 'skipped'; detail: string };

/**
 * What a source's matching step answers: a fetch's answer, a settled "none" that may say why (a Wikipedia redirect to
 * another title, older names not asked), or `ambiguous`, two records answering where one is required, said on the page as
 * "not taken: two items answered" and never as "none" (round sixty-nine; triage-68 M8, R46-15).
 */
export type SourceResult<T> = Exclude<FetchResult<T>, { status: 'none' }> | { status: 'none'; detail?: string } | { status: 'ambiguous'; detail: string };

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /**
   * Treat a 404 as "none": only for an endpoint whose 404 means "no such record" (a GBIF usage or occurrence by its key, an
   * iNaturalist taxon by its id, an IPNI record by its id, a Wikipedia article by its title). Anywhere else a 404 is an
   * error, said "did not answer" (rule 2): a search, a query or an API whose address answers 404 has moved or failed, and
   * says nothing about the plant (round eighty-six; the default was true, so a 404 from MediaWiki's API, Wikidata's query
   * service or iNaturalist's observation search would have been read as "nothing to report").
   */
  noneOn404?: boolean;
  /** Internal: which retry this is (0 = first try). */
  attempt?: number;
}

/** The options of a request to an endpoint whose 404 means "no such record" (`noneOn404`). */
export const BY_ID: Readonly<FetchOptions> = Object.freeze({ noneOn404: true });

export const USER_AGENT = 'Cultifolio/3.0 (https://cultifolio.com; hello@cultifolio.com)';

export type JsonFetcher = <T = unknown>(url: string, opts?: FetchOptions) => Promise<FetchResult<T>>;

/** Per-host pacing so a corpus build is a good citizen (iNat asks for ~1/s). */
const MIN_GAP_MS: Record<string, number> = {
  // 2 s (30 a minute; round eighty, agent I): at 1.1 s (about 54 a minute, sustained) iNaturalist answered 429 to every
  // call after 97 minutes and 5,273 requests of the owner's first cultivated fill (2026-10-22), well inside the day's
  // 9,000; at 1.5 s, later that day, again after about 350 pages. Its practices ask for "about 1 per second, and around 10k
  // API requests a day" (https://www.inaturalist.org/pages/api+recommended+practices, read 2026-10-22); the fill now asks
  // at half that pace, under a day of 4,000 (`INAT_DAY_BUDGET`), and batches its observation searches (`inat-batch.ts`).
  'api.inaturalist.org': 2000,
  'api.gbif.org': 250,
  // Wikimedia's hosts share one allowance from 2026: 200 requests a minute for a client named by a User-Agent with an
  // address, across every site and API (https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits, read 2026-10-19).
  // They are paced as one host (`paceKey`), one request every 0.35 s, 171 a minute (round seventy-eight).
  'wikimedia': 350,
  // Wikidata's query service: a SPARQL query a second at most, inside its 60 s of processing a minute for a client.
  'query.wikidata.org': 1100,
  'api.openalex.org': 1100,
  // IPNI's own records, asked by the Wikidata proof (round seventy-c; `ipniNames` in sources/wikimedia.ts): at most once a second.
  'www.ipni.org': 1100,
  'power.larc.nasa.gov': 2100,
  'nominatim.openstreetmap.org': 1100,
  // The Biodiversity Heritage Library's OpenURL resolver (`--fill bhl`, round eighty-seven, stage 2; links agent's
  // `bhl.ts`): once a second at most, whatever the fill's own pace, as /about/how says.
  'www.biodiversitylibrary.org': 1000
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
 * minute for hours. That many waits in a row is persistent throttling, whatever
 * its cause: the host is cooled and the caller gets an honest refusal to stop on.
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

/** Reserve the next slot for a host before waiting for it, so two concurrent callers take two slots, not the same one. */
/** The pacing key of a host: Wikimedia's API hosts are one (their allowance is shared); the query service is its own. */
export const paceKey = (host: string) => (host !== 'query.wikidata.org' && /(^|\.)(wikipedia|wikidata|wikimedia)\.org$/.test(host) ? 'wikimedia' : host);
/**
 * The other allowances a host's request is counted in (round eighty): a query to Wikidata's query service takes a slot of
 * Wikimedia's shared allowance too, so the build's and the fills' queries are paced as one with Wikimedia's other sites
 * (200 requests a minute across every site and API), as well as at the query service's own one a second.
 */
export const alsoPacedAs = (host: string): string[] => (host === 'query.wikidata.org' ? ['wikimedia'] : []);
async function pace(host: string): Promise<void> {
  const keys = [paceKey(host), ...alsoPacedAs(host)];
  const slot = Math.max(Date.now(), ...keys.map((k) => (lastAt.get(k) ?? 0) + (MIN_GAP_MS[k] ?? 100)));
  for (const k of keys) lastAt.set(k, slot);
  const wait = slot - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/**
 * Retry-After as seconds or as an HTTP date; undefined when absent or unreadable. A number of seconds is the host's
 * explicit instruction, honoured as given (0 means now). A date already in the past says nothing about how long to
 * wait, only that the moment passed, so it is floored to the backoff rather than read as "at once, five times".
 */
function retryAfterMs(res: Response, attempt: number): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return n * 1000;
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(4000 * attempt, t - Date.now()) : undefined;
}

/** The longest a single retry will wait in place. A host asking for more is honoured by refusing now and saying when to come back. */
const MAX_WAIT_MS = 120_000;
/** Hosts whose 429 is retried once, slowly, and is then a throttle refusal (round eighty, agent I). */
const SLOW_RETRY = new Set(['api.inaturalist.org']);
/** The wait before that one retry, when the host names none (a minute; a test sets it shorter, or `CULTIFOLIO_SLOW_RETRY_MS`). */
let SLOW_RETRY_MS = (typeof process !== 'undefined' && Number(process.env?.CULTIFOLIO_SLOW_RETRY_MS)) || 60_000;
/** For tests: the slow retry's wait. */
export function setSlowRetryMs(ms: number): void { SLOW_RETRY_MS = ms; }
/** The words of a refusal that is a host's throttle (429), not an allowance of ours: `isThrottle` reads them. */
export const THROTTLED = 'throttled by the host';
/** Whether a refusal is a host's throttle (429, or a host cooled after a run of them), never the day's allowance. */
export const isThrottle = (detail: string | undefined): boolean => !!detail && !/allowance/.test(detail) && (detail.includes(THROTTLED) || /\b429\b|throttled|rate-limiting/.test(detail));

/**
 * Round eighty-seven (docs/COLXR-87.md): the taxonomy each GBIF occurrence search named, by its `checklistKey` ('' when it
 * named none, which GBIF answers by its default), counted as it is sent, a retry not counted again. The build prints it
 * (`taxonomyLine` in sources/gbif.ts; rule 6), so its record says which taxonomy its records' keys are.
 */
const gbifTaxonomy = new Map<string, number>();
/** What the GBIF occurrence searches sent so far named as their taxonomy, by checklistKey ('' for none). */
export function gbifTaxonomyAsked(): ReadonlyMap<string, number> {
  return new Map(gbifTaxonomy);
}
/** For tests, and a run that counts afresh. */
export function resetGbifTaxonomy(): void {
  gbifTaxonomy.clear();
}
function countTaxonomy(url: URL): void {
  if (url.host !== 'api.gbif.org' || !/^\/v1\/occurrence\/search\/?$/.test(url.pathname)) return;
  const k = url.searchParams.get('checklistKey') ?? '';
  gbifTaxonomy.set(k, (gbifTaxonomy.get(k) ?? 0) + 1);
}

export function makeFetcher(fetchImpl: typeof fetch = fetch): JsonFetcher {
  return async <T>(url: string, opts: FetchOptions = {}): Promise<FetchResult<T>> => {
    const u = new URL(url);
    const host = u.host;
    if (hostCooling(host)) return { status: 'refused', detail: `${host} rate-limiting; not asked again for a while` };
    if (!(opts.attempt ?? 0)) countTaxonomy(u);
    await pace(host);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20000);
    // Whether the host answered at all (round eighty-one, review B2): an error before it did is `unreached`.
    let answered = false;
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT, 'api-user-agent': USER_AGENT, ...opts.headers },
        signal: ctl.signal
      });
      answered = true;
      // Round eighty-six (A11): a 404 is "none" only where the caller says it means "no such record" (`BY_ID`).
      if (res.status === 404 && opts.noneOn404 === true) return { status: 'none' };
      if (res.status === 429 && hostTouchy(host)) {
        // Still throttled after a cooldown: back to cooling at once; --only-refused (or a key) is the way through.
        coolUntil.set(host, Date.now() + COOLDOWN_MS);
        strikes.set(host, 0);
        return { status: 'refused', detail: `${host} 429 again after a cooldown; not asked for a while` };
      }
      // iNaturalist's 429 is its throttle (round eighty, agent I): its practices say to add delays "especially if you're
      // getting 429 errors", and five quick retries a call were five more requests to a host that had said stop. One
      // retry, after its Retry-After or a minute, then a refusal that says it is a throttle (`THROTTLED`), which the
      // fill waits out at length (`build-dossiers.ts`, `fillPhotos`) rather than reading it as the day's allowance.
      if (res.status === 429 && SLOW_RETRY.has(host)) {
        const asked = retryAfterMs(res, 1);
        if (!(opts.attempt ?? 0) && !(asked !== undefined && asked > MAX_WAIT_MS)) {
          const wait = asked !== undefined ? Math.min(Math.max(asked, SLOW_RETRY_MS), MAX_WAIT_MS) : SLOW_RETRY_MS;
          clearTimeout(timer);
          if (typeof process !== 'undefined' && (process.stdout?.isTTY || process.env?.CORPUS_STEP)) process.stdout.write(`\n  ${host} 429: waiting ${Math.round(wait / 1000)} s, once…`);
          await new Promise((r) => setTimeout(r, wait));
          return makeFetcher(fetchImpl)<T>(url, { ...opts, attempt: 1 });
        }
        strike(host);
        return { status: 'refused', detail: `${host} 429: ${THROTTLED}${asked !== undefined ? ` (asked to wait ${Math.max(1, Math.round(asked / 60_000))} minutes)` : ''}` };
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
            return { status: 'refused', detail: `${host} throttled ${run} calls in a row (${res.status}); not asked again for ${COOLDOWN_MS / 60_000} minutes` };
          }
        }
        // Polite retries after the server's own Retry-After, backing off, then give up honestly. A wait longer
        // than a retry can sit through is not shortened: the host is refused now with its own time named.
        const attempt = (opts.attempt ?? 0) + 1;
        const asked = retryAfterMs(res, attempt);
        if (asked !== undefined && asked > MAX_WAIT_MS) {
          coolUntil.set(host, Date.now() + asked);
          return { status: 'refused', detail: `${host} ${res.status}: asked to wait ${Math.round(asked / 60_000)} minutes; not asked again until then` };
        }
        const wait = asked ?? 4000 * attempt;
        clearTimeout(timer);
        // Say so on a terminal, so a run that is waiting out a throttle does not look hung.
        if (typeof process !== 'undefined' && (process.stdout?.isTTY || process.env?.CORPUS_STEP)) process.stdout.write(`\n  ${host} ${res.status}: waiting ${Math.round(wait / 1000)} s (retry ${attempt} of ${RETRIES})…`);
        await new Promise((r) => setTimeout(r, wait));
        return makeFetcher(fetchImpl)<T>(url, { ...opts, attempt });
      }
      if (res.status === 429 || res.status === 403 || res.status === 503) {
        // A 403 is a block (a WAF, a key revoked), and a blocked host asked three thousand more times is a ban: it strikes like a 429.
        if (res.status === 429 || res.status === 403) strike(host);
        return { status: 'refused', detail: `${host} ${res.status}` };
      }
      if (!res.ok) return { status: 'error', detail: `${host} ${res.status}` };
      strikes.set(host, 0);
      if (!(opts.attempt ?? 0)) throttledRun.set(host, 0); // answered first time: the host is not throttling
      const data = (await res.json()) as T;
      return { status: 'ok', data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A timeout is the source not answering in time, not a refusal: recorded as an error, so the page says "did not
      // answer" (round sixty-seven; triage-66 S8, R45-11: it was recorded as refused).
      if (/abort|timeout/i.test(msg)) return { status: 'error', detail: `${host} timeout` };
      // A dropped connection ("fetch failed") is usually momentary: one more try after a pause.
      if ((opts.attempt ?? 0) < 1) {
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, 3000));
        return makeFetcher(fetchImpl)<T>(url, { ...opts, attempt: (opts.attempt ?? 0) + 1 });
      }
      return answered ? { status: 'error', detail: `${host} ${msg}` } : { status: 'error', detail: `${host} ${msg}`, unreached: true };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * A fixture recorded for Wikipedia's REST summary (`rest_v1/page/summary/<title>`: `{ type, title, extract, revision }`),
 * as every test and fixture before round eighty-six recorded it, answers the action API's one-title lead request
 * (`leadsUrl`) that the summary asks since then, in that API's shape: the title reached (a redirect when it is not the one
 * asked), the extract as the lead, the revision, a disambiguation page marked, a missing page (`null`, or REST's
 * not-found type) missing. A fixture recorded in the action API's shape is answered as it is.
 */
const LEAD_ONE = /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?action=query&format=json&formatversion=2&prop=extracts\|revisions\|pageprops&[^|]*&titles=([^|&]+)$/;
const restKey = (title: string) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
export function restAsLead(asked: string, data: unknown): unknown {
  const r = data as { type?: string; title?: string; extract?: string; revision?: number | string; query?: unknown } | null;
  if (r && typeof r === 'object' && 'query' in r) return r;
  if (!r || (typeof r.type === 'string' && /not_found/.test(r.type))) return { batchcomplete: true, query: { pages: [{ title: asked, missing: true }] } };
  const title = (r.title ?? asked).replace(/_/g, ' ');
  const revid = Number(r.revision);
  return { batchcomplete: true, query: { ...(title !== asked ? { redirects: [{ from: asked, to: title }] } : {}), pages: [{ title, extract: r.extract ?? '', ...(Number.isSafeInteger(revid) && revid > 0 ? { revisions: [{ revid }] } : {}), ...(r.type === 'disambiguation' ? { pageprops: { disambiguation: '' } } : {}) }] } };
}

/** A fetcher backed by a map of URL → JSON, for tests and fixtures. Unmatched URLs are "refused" so a test can never mistake a missing fixture for an absence. */
export function fixtureFetcher(table: Record<string, unknown>, fallback: FetchResult<never> = { status: 'refused', detail: 'no fixture' }): JsonFetcher {
  const entries = Object.entries(table);
  const find = (url: string): [boolean, unknown] => {
    for (const [pat, data] of entries) if (url === pat || url.startsWith(pat) || (pat.startsWith('re:') && new RegExp(pat.slice(3)).test(url))) return [true, data];
    return [false, undefined];
  };
  return async <T>(url: string): Promise<FetchResult<T>> => {
    const one = LEAD_ONE.exec(url);
    if (one) {
      const asked = decodeURIComponent(one[1]);
      const [hit, data] = find(url)[0] ? find(url) : find(restKey(asked));
      if (hit) {
        if (data && typeof data === 'object' && '__status' in (data as Record<string, unknown>)) return data as FetchResult<T>;
        return { status: 'ok', data: restAsLead(asked, data) as T };
      }
      return fallback;
    }
    const [hit, data] = find(url);
    if (hit) {
      if (data === null) return { status: 'none' };
      if (typeof data === 'object' && data && '__status' in (data as Record<string, unknown>)) return data as FetchResult<T>;
      return { status: 'ok', data: data as T };
    }
    return fallback;
  };
}
