/**
 * iNaturalist's flowering annotation and the addresses that ask for it (round eighty-seven, stage 2; links agent): kept
 * apart from `sources/inat.ts` so the species page's section (`links-words.ts`) reads them without the source's code.
 */
export const INAT_API = 'https://api.inaturalist.org/v1';

/** iNaturalist's annotation "Plant Phenology" (term 12) and its value "Flowering" (13). */
export const FLOWERING_TERM = { term: 12, value: 13 } as const;

/**
 * iNaturalist's histogram of a taxon's research-grade, wild (not captive) observations annotated "Flowering", by the month
 * of the year they were observed in (`/v1/observations/histogram`, documented at https://api.inaturalist.org/v1/docs/,
 * read 2026-11-09): one request a taxon, its subspecies and varieties included, as iNaturalist counts a taxon. The API's
 * own terms, read the same day: "intended to support application development, not data scraping"; at most 100 requests a
 * minute, "we ask that you try to keep it to 60 requests per minute or lower, and to keep under 10,000 requests per day".
 */
export const floweringUrl = (taxonId: number) =>
  `${INAT_API}/observations/histogram?taxon_id=${taxonId}&term_id=${FLOWERING_TERM.term}&term_value_id=${FLOWERING_TERM.value}&captive=false&quality_grade=research&date_field=observed&interval=month_of_year`;

/** The same observations on iNaturalist's site, for the page's link to what it counted. */
export const floweringSearchUrl = (taxonId: number) =>
  `https://www.inaturalist.org/observations?taxon_id=${taxonId}&term_id=${FLOWERING_TERM.term}&term_value_id=${FLOWERING_TERM.value}&captive=false&quality_grade=research`;
