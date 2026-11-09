/**
 * The reference's sources by name, as /about says them in one sentence (round eighty-seven; plan D5). The same sources
 * as the table on /about/how (#sources) and the footer, in the table's order; tests/unit/r87p-about.test.ts holds each
 * name to a row of that table and every row to a name here, so the two pages never list different sources.
 */
export const SOURCES = [
  'GBIF',
  "Kew's World Checklist of Vascular Plants",
  'CHELSA',
  'ETOPO',
  'NASA POWER',
  'Natural Earth',
  'iNaturalist',
  'Wikimedia Commons',
  'Wikidata',
  'Wikipedia',
  // Round eighty-seven, stage 2: the four files read offline, and BHL's pages, linked for where a name was published.
  "Kew's extinction risk predictions",
  'CITES Appendices',
  'ChromoDB',
  'WFO Plant List',
  'Biodiversity Heritage Library'
] as const;
