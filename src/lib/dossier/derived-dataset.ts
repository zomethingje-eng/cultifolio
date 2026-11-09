/**
 * `--list-derived` (round eighty-seven): the records the pages show that came through GBIF's search API rather than a
 * download, counted by GBIF's datasetKey, written as derived-dataset.csv for the owner to register a GBIF derived dataset
 * (https://www.gbif.org/derived-dataset/about: a DOI for data that were not one download, citing each dataset and how many
 * of its records were used).
 *
 * Which records come through the API (read from the code, round eighty-seven):
 *   - every record of a species the download request left to the API path (more records than the download's cut, listed
 *     in bulk/api-path.txt): the bulk fetcher holds none of theirs and passes the occurrence search on, offline too
 *     (`offlineFetcher` lets that one request through);
 *   - the records of another key a page reads (`extra-keys.ts`, Kew's synonymy, D6's `with` keys) that the download does
 *     not hold, which `occurrences.keys` marks `from: 'api'`;
 *   - online, any key the download was not asked for.
 * A record served from a download carries the download's DOI (`downloadDoi`), already cited on each page's record of its
 * sources ("GBIF occurrence download https://doi.org/10.15468/dl.…, of <day>"); one from the API carries none, and the
 * build counts those in range by dataset (`occurrences.api`, each record one coordinate as `occurrences.datasets` counts
 * it). A page derived before round eighty-seven holds no such count: it is said as not known, never as none.
 *
 * Pure: the script hands it the dossiers and writes the file.
 */
import type { PageId } from '../core/page-id';

type Page = { key: PageId; name?: { scientific?: string }; occurrences?: { api?: ReadonlyArray<{ key: string; n: number }> } };

export interface DerivedTally {
  /** datasetKey → the in-range records of the pages that came through the API. */
  byDataset: Map<string, number>;
  /** Pages read, pages with records through the API, and pages derived before the count was kept. */
  pages: number;
  withApi: number;
  unknown: number;
  unknownPages: string[];
  records: number;
}

export function derivedTally(pages: Iterable<Page>): DerivedTally {
  const t: DerivedTally = { byDataset: new Map(), pages: 0, withApi: 0, unknown: 0, unknownPages: [], records: 0 };
  for (const d of pages) {
    t.pages++;
    const api = d.occurrences?.api;
    if (!api) { t.unknown++; t.unknownPages.push(`${d.key} ${d.name?.scientific ?? ''}`.trim()); continue; }
    if (!api.length) continue;
    t.withApi++;
    for (const x of api) { t.byDataset.set(x.key, (t.byDataset.get(x.key) ?? 0) + x.n); t.records += x.n; }
  }
  return t;
}

/** The file GBIF's derived-dataset form takes: one dataset a line, its key and its count, largest first. */
export function derivedCsv(t: DerivedTally): string {
  const rows = [...t.byDataset].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ['datasetKey,count', ...rows.map(([k, n]) => `${k},${n}`)].join('\n') + '\n';
}

/** The command's line. */
export function derivedWords(t: DerivedTally, file: string): string {
  const unknown = t.unknown ? `; ${t.unknown} page${t.unknown === 1 ? '' : 's'} derived before round eighty-seven hold${t.unknown === 1 ? 's' : ''} no count of it, not checked (the walk writes it): ${t.unknownPages.slice(0, 8).join(', ')}${t.unknown > 8 ? ', …' : ''}` : '';
  return `  ${t.records} in-range records (on the map, or counted and read for the climate) on ${t.withApi} of ${t.pages} pages came through GBIF's search API, from ${t.byDataset.size} datasets → ${file}${unknown}`;
}
