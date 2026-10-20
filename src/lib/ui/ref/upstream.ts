/**
 * How a species page says what each source did when the page was built (rule 2): a refusal as a refusal, a failure as
 * "did not answer", a source the build skipped as "not asked", and only "none" as an absence. Before round sixty-two a
 * refusal was said as "did not answer" in five places on one page while the photographs' line beside them said
 * "refused" (round sixty-two; the grower review's 2).
 */

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
