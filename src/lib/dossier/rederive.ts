/**
 * What a re-derivation carries from the build before it, and the fetcher of an offline one, out of the builder so they
 * are tested (round sixty-seven; triage-66 N4, S-B4, S-B5): an offline run wrote "refused" for sources it never asked,
 * and carried "not asked: N photographs already from the GBIF download" onto dossiers that no longer had them.
 */
import type { JsonFetcher, FetchOptions, FetchResult } from './fetch';

type Upstream = { status: string; at?: string; detail?: string };

/**
 * The fetcher of an offline re-derivation: nothing upstream is asked but NASA POWER (its cache is on disk, and a cell not
 * yet cached is better fetched) and the occurrence search for a species the download left to the API path (a dossier
 * holds only its open records, so there is nothing on disk to derive from). `/species/{key}`, which the bulk fetcher asks
 * on its own for a name's authorship, is answered from the previous dossier. Anything else is `skipped`, not asked, and
 * never `refused`: nothing refused the site.
 */
export function offlineFetcher(net: JsonFetcher, prevName: (key: number) => { key: number; scientific: string; authorship?: string | null } | null): JsonFetcher {
  return async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    const host = new URL(url).host;
    if (host === 'power.larc.nasa.gov') return net<T>(url, opts);
    if (/\/occurrence\/search\?taxonKey=\d+&hasCoordinate=true/.test(url)) return net<T>(url, opts);
    const m = /\/species\/(\d+)$/.exec(url);
    if (m) {
      const prev = prevName(Number(m[1]));
      if (prev) return { status: 'ok', data: { key: prev.key, canonicalName: prev.scientific, scientificName: prev.scientific, authorship: prev.authorship ?? undefined } as unknown as T };
    }
    return { status: 'skipped', detail: `${host} not asked: offline re-derivation` };
  };
}

/** The upstream rows of the one derivation (range, records, climate), never carried row by row. */
export const CORE: ReadonlySet<string> = new Set(['gbif.occurrences', 'wcvp.distribution', 'climate', 'climate.extremes']);
/** A row that says iNaturalist was not asked because the GBIF download already gave wild photographs. */
export const claimsDownloadPhotos = (u?: { status?: string; detail?: string }) => u?.status === 'skipped' && /already from the GBIF download/.test(u.detail ?? '');

/**
 * The rows a re-derivation skipped, carried from the previous build with `carried`'s note: never a row of the one
 * derivation (carried as one snapshot or not at all, so a row of the previous build's never says "ok" over a climate this
 * build did not read), and never "not asked: already from the GBIF download" without wild photographs from the download
 * in the dossier: without them the source is open again, so `--fill inat` asks it.
 */
export function carryRederivedRows(prev: { upstream?: Record<string, Upstream> }, d: { upstream: Record<string, Upstream>; photos: Array<{ src: string; captive?: boolean }> }, carried: (u: Upstream) => string | undefined, now = new Date().toISOString()): void {
  for (const k of Object.keys(prev.upstream ?? {})) {
    const was = prev.upstream![k];
    if (d.upstream[k]?.status !== 'skipped' || !was) continue;
    if (CORE.has(k)) continue;
    if (claimsDownloadPhotos(was) && !d.photos.some((p) => p.src === 'gbif' && !p.captive)) {
      d.upstream[k] = { status: 'skipped', at: now, detail: 'the wild photographs the GBIF download once gave are not in this dossier; iNaturalist is to be asked again (--fill inat)' };
      continue;
    }
    d.upstream[k] = { ...was, detail: carried(was) };
  }
}
