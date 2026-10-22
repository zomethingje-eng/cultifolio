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

/**
 * The build a carried row names: the one that asked the source, which is the row's own time, not the day of the build it
 * is carried from when that build was itself a re-derivation (round seventy-one; self-review 70 S-B10: 214 of 214 sampled
 * Wikidata rows read "carried from build of" a day one to three days after the read, and the 90-day limit ran late).
 */
export function carriedOrigin(u: { at?: string }, prevBuilt: string | undefined, note = ''): string {
  const days = [u.at, prevBuilt].map((x) => x?.slice(0, 10)).filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  return `carried from build of ${days[0] ?? '?'}${note}`;
}

/**
 * Whether a build that skipped iNaturalist keeps the previous build's iNaturalist id (round eighty, agent I), and if so
 * sets it on the new dossier: where this build has no id, or the same one, or where the previous was checked (`inat.taxon`
 * "ok") and this build's (an item's, unchecked) is another. Never when iNaturalist was asked: then the build's own check
 * decides.
 */
export function keptInatId(prev: InatPage, d: InatPage, skipped: boolean): boolean {
  const was = prev.ids?.inat;
  if (!skipped || !was) return false;
  if (d.ids.inat && d.ids.inat !== was && prev.upstream?.['inat.taxon']?.status !== 'ok') return false;
  d.ids.inat = was;
  d.links.inat = prev.links?.inat ?? `https://www.inaturalist.org/taxa/${was}`;
  return true;
}


type InatPage = { ids: { inat?: number }; links: Record<string, string | undefined>; upstream: Record<string, Upstream>; built?: string };
/**
 * The rows that go with an id kept (`keptInatId`) and that the photographs' carry does not bring: the taxon row, and a set
 * the previous build answered with none (no photograph to carry). Each says it is carried, from which build, and this
 * build's reason.
 */
export function carryInatRows(prev: InatPage, d: InatPage): void {
  for (const src of ['inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated']) {
    const was = prev.upstream?.[src];
    if (d.upstream[src]?.status !== 'skipped' || !was || !['ok', 'none'].includes(was.status) || (src !== 'inat.taxon' && was.status === 'ok')) continue;
    const chained = was.detail?.startsWith('carried from build of');
    const origin = chained ? was.detail!.replace(/;.*$/, '') : carriedOrigin(was, prev.built);
    d.upstream[src] = { ...was, detail: `${origin}${was.detail && !chained ? ` (that build: ${was.detail})` : ''}; this build: ${d.upstream[src].detail ?? 'skipped'}` };
  }
}
