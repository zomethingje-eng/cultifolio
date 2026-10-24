/**
 * How a species page says what each source did when the page was built (rule 2): a refusal as a refusal, a failure as
 * "did not answer", a source the build skipped as "not asked", and only "none" as an absence. Before round sixty-two a
 * refusal was said as "did not answer" in five places on one page while the photographs' line beside them said
 * "refused" (round sixty-two; the grower review's 2).
 */

import { lapseSetAside } from '$core/lapse';

type Up = Record<string, { status: string; detail?: string } | undefined>;

/** The pill word for each recorded status, as Provenance shows it. */
export const UPSTREAM_WORD: Record<string, string> = {
  ok: 'answered',
  none: 'nothing to report',
  refused: 'refused',
  error: 'failed',
  skipped: 'not asked',
  // Two records answered where the rule takes one (two Wikidata items, two iNaturalist taxa, two Kew entries by older
  // names), so none was taken: said as such, never as "nothing to report" (round sixty-nine; triage-68 M8, R46-15).
  ambiguous: 'not taken: two items answered'
};

/** Each recorded source in plain words, for Provenance's rows (the id stays beside it for anyone checking the file). */
export const UPSTREAM_NAME: Record<string, string> = {
  'gbif.match': 'GBIF name match',
  'gbif.species': 'GBIF species record',
  'gbif.accepted': 'GBIF accepted name',
  'gbif.synonyms': 'GBIF synonyms',
  'gbif.vernacular': 'GBIF common names',
  'gbif.occurrences': 'GBIF occurrence records',
  'gbif.media': 'GBIF media',
  'wcvp.distribution': 'WCVP native range',
  // A page without a GBIF key (round seventy-nine): its name, author, family and synonyms are read from Kew's file.
  'kew.names': "Kew's names (WCVP)",
  wikidata: 'Wikidata',
  // A page's English names from its Wikidata item, for a page without a GBIF key (round eighty).
  'wikidata.names': 'Wikidata common names',
  wikipedia: 'Wikipedia',
  'inat.taxon': 'iNaturalist taxon',
  'inat.photos.wild': 'iNaturalist photographs, wild',
  'inat.photos.cultivated': 'iNaturalist photographs, cultivated',
  commons: 'Wikimedia Commons',
  openalex: 'OpenAlex papers',
  climate: 'Habitat climate',
  'climate.extremes': 'Daily extremes (NASA POWER)'
};

/**
 * What a source that gave nothing did, as a verb phrase after its name: "refused the request", "was not asked", or
 * "did not answer" (a failure, or no record of the source at all).
 */
export function notAnswered(status: string | null | undefined): string {
  return status === 'refused' ? 'refused the request' : status === 'skipped' ? 'was not asked' : 'did not answer';
}

/**
 * The climate's stored reason, said as the source it names did. Dossiers built before round sixty-two wrote "occurrence
 * source did not answer" (and the distribution's like it) for a refusal too; the source's own row says which it was, so
 * the page reads that rather than the old words. A dossier built since writes the right words and passes through.
 */
export function climateDetail(detail: string | undefined, upstream: Up): string | undefined {
  if (!detail) return detail;
  const m = /^(occurrence|distribution) source did not answer\b/.exec(detail);
  if (!m) return detail;
  const st = upstream[m[1] === 'occurrence' ? 'gbif.occurrences' : 'wcvp.distribution']?.status;
  return st === 'refused' ? detail.replace('did not answer', 'refused the request') : detail;
}

/**
 * The register links Wikidata gives a page (POWO, IPNI, World Flora Online, Wikipedia), when Wikidata did not answer or
 * refused: said where the links are, as "not checked", never left as a shorter list that reads as "none" (rule 2; round
 * seventy-two, F: 19 of 8,947 pages, Agave wendtii among them, showed "GBIF iNaturalist" and nothing else). Null when
 * Wikidata answered, had nothing, or was not asked.
 */
export function registersNotChecked(upstream: Up): string | null {
  const st = upstream.wikidata?.status;
  if (st !== 'error' && st !== 'refused') return null;
  return `Wikidata ${notAnswered(st)} when this page was built, so the links it gives (POWO, IPNI, World Flora Online, Wikipedia) were not checked; any shown here are kept from an earlier build.`;
}

/**
 * Where a page's English names come from when GBIF's are not asked or gave none (round eighty): Wikidata's item and the
 * day it was read, where names were taken from it; for a page without a GBIF key, why its names were not checked
 * (rule 2: never said as "none"). Null where Wikidata answered and holds none the rule takes, and for any other page.
 * `shown`, the English names the page shows (round eighty-one, review D4): where Wikidata's names are none of them (its only
 * name a word the page does not show as a species' name, "Cactus" for Ferocactus tiburonensis), the line says Wikidata
 * gave those and that they are searched, not shown (`hidden`), never "English names from Wikidata" over no name.
 */
const plainName = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, '');
export function namesSource(d: {
  ids: { gbif?: number | null; wikidata?: string };
  name: { vernacular: ReadonlyArray<{ source?: string; name?: string }> };
  upstream: Record<string, { status: string; at?: string; detail?: string } | undefined>;
}, shown?: readonly string[]): { item: string; day: string; hidden?: string[] } | { unchecked: string } | null {
  const rec = d.upstream['wikidata.names'];
  const item = /\b(Q\d+)\b/.exec(rec?.detail ?? '')?.[1] ?? d.ids.wikidata;
  const wd = d.name.vernacular.filter((v) => v.source === 'Wikidata');
  if (rec?.status === 'ok' && item && wd.length) {
    const day = (rec.at ?? '').slice(0, 10);
    if (!shown) return { item, day };
    const own = new Set(wd.flatMap((v) => String(v.name ?? '').split(/[;,]/)).map(plainName).filter(Boolean));
    return shown.some((n) => own.has(plainName(n))) ? { item, day } : { item, day, hidden: [...new Set(wd.map((v) => String(v.name ?? '')).filter(Boolean))] };
  }
  if (d.ids.gbif != null || rec?.status === 'none' || rec?.status === 'ok') return null;
  if (!rec) return { unchecked: "Wikidata's common names were not read for this page" };
  return { unchecked: (rec.detail ?? `Wikidata ${notAnswered(rec.status)}`).replace(/^not (?:checked|asked): /, '') };
}

/** What of a dossier the page shows, as `foundNotShown` reads it. */
type Shown = {
  photos?: ReadonlyArray<{ src?: string }>;
  climate?: { status?: string; extremesStatus?: string; landFraction?: number; months?: ReadonlyArray<{ tmin: number }>; extremesLapse?: { minAbs: number; lapseAppliedM?: number } };
  distribution?: { native?: readonly unknown[]; introduced?: readonly unknown[] };
};

/**
 * What a source that answered ("ok") found, where the page shows none of it (round eighty-two, F; review 1's 29: GBIF
 * media "answered" on 196 of the reviewers' 9,463 live pages with no photograph credited to GBIF; NASA POWER's daily
 * extremes "answered" on 128 whose cold floor is set aside; Kew's range "answered" on 37 with no native region). Read
 * from the dossier when the page is shown, so a page built before says it too; null where the page shows the answer, or
 * the row's own words say it already.
 */
export function foundNotShown(src: string, u: { status: string; detail?: string } | undefined, d: Shown): string | null {
  if (u?.status !== 'ok') return null;
  if (src === 'gbif.media' && d.photos && !d.photos.some((p) => p.src === 'gbif')) return 'none of the photographs on this page is credited to GBIF: those shown are other sources\', and GBIF\'s were the same photographs or were set aside by the photograph rules';
  if (src === 'climate.extremes' && d.climate?.status === 'ok') {
    if (d.climate.extremesStatus === 'sea') return `read, and set aside: NASA POWER's cell is mostly sea${d.climate.landFraction != null ? ` (${Math.round(d.climate.landFraction * 100)}% land)` : ''}, so no cold floor is shown`;
    if (d.climate.extremesStatus === 'lapse') { const why = d.climate.months && d.climate.extremesLapse ? lapseSetAside({ months: d.climate.months, extremes: d.climate.extremesLapse }) : null; return `read, and set aside${why ? `: ${why}` : ''}, so no cold floor is shown`; }
  }
  if (src === 'wcvp.distribution' && d.distribution && !(d.distribution.native ?? []).length && !/no native range/.test(u.detail ?? '')) {
    const n = (d.distribution.introduced ?? []).length;
    return `Kew's entry lists no native region${n ? `, only ${n} where it is introduced` : ''}`;
  }
  return null;
}
