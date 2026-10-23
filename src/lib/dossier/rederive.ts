/**
 * What a re-derivation carries from the build before it, and the fetcher of an offline one, out of the builder so they
 * are tested (round sixty-seven; triage-66 N4, S-B4, S-B5): an offline run wrote "refused" for sources it never asked,
 * and carried "not asked: N photographs already from the GBIF download" onto dossiers that no longer had them.
 */
import type { JsonFetcher, FetchOptions, FetchResult } from './fetch';
import { fromWikidata, WD_NAMES } from './wikidata-names';

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

/**
 * A set of iNaturalist's photographs a fill or a build read (`ok`), kept by a build that did not ask iNaturalist (round
 * eighty-one, review B3). Its record is kept whole: the rule's words, which `cultivatedSettled` and the fill read, the day
 * it was filled (`filled <day>`, its `at`) and the mark of Kew's file, with the build that kept it said after them. Before,
 * the detail became "carried from build of <the earlier of the read's day and the page's last build>; this build: …": the
 * set was no longer settled, so the next fill asked it again, and the page's Provenance named a build that never read it.
 * A row kept again names the latest build that kept it, once.
 */
export const KEPT_BY = '; kept by the build of ';
export function keptInatSetRow(was: Upstream, thisBuild: string | undefined, day: string): Upstream {
  const base = (was.detail ?? '').replace(/; kept by the build of \d{4}-\d{2}-\d{2} \(this build: .*\)$/s, '');
  return { ...was, detail: `${base}${KEPT_BY}${day} (this build: ${thisBuild ?? 'not asked'})` };
}
/** Whether a carried row is a set to keep whole (`keptInatSetRow`): a photograph set answered, not a row already carried. */
export const keepsInatSet = (src: string, was: Upstream | undefined): boolean => /^inat\.photos\./.test(src) && was?.status === 'ok' && !(was.detail ?? '').startsWith('carried from build of');

type Names = { name?: { vernacular?: Array<{ source?: string }> }; upstream?: Record<string, Upstream> };
/**
 * Wikidata's English names, carried with their record by a re-derivation (round eighty-one, review B1). A page without a
 * GBIF key takes its names from the Wikidata item its build asks (`buildKewDossier`); an offline re-derivation asks none,
 * so it built the page with no names while `carryRederivedRows` carried the record that says they were taken ("1 English
 * name taken: "jade plant""), and the page lost them. Where the page's `wikidata.names` row is the previous build's,
 * carried, and this build has no Wikidata name, the previous build's Wikidata names come with it. True when carried.
 */
export function carryWdNames(prev: Names, d: { name: { vernacular: Array<{ source?: string }> }; upstream: Record<string, Upstream> }): boolean {
  const was = prev.upstream?.[WD_NAMES], row = d.upstream[WD_NAMES];
  if (!was || !row || row.status !== was.status || !(row.detail ?? '').startsWith('carried from build of')) return false;
  const theirs = (prev.name?.vernacular ?? []).filter((v) => fromWikidata(v as { source: string }));
  if (!theirs.length || d.name.vernacular.some((v) => fromWikidata(v as { source: string }))) return false;
  d.name.vernacular = [...d.name.vernacular, ...theirs];
  return true;
}
