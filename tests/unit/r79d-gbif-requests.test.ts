/**
 * Round seventy-nine (D): the three requests `scripts/bulk-fetch.ts` sends GBIF, read as the bodies they are, for the
 * list's 46,041 GBIF keys. The DWCA's is the request round seventy-eight sent, inside GBIF's predicate limit (101,000
 * items: the Occurrence API reference, "Occurrence Download Limits"), so it needs no split. The SQL query is one SELECT
 * on `occurrence` whose WHERE is GBIF's own conversion of that predicate (`POST /v1/occurrence/download/request/sql`,
 * 2026-10-20), and whose columns are the reader's. Every case FAILED on r79base: scripts/gbif-request-lib.ts was not there
 * and bulk-fetch knew no gbif-sql, gbif-media, gbif-count, --parts or --dry-run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dwcaRequest, sqlQuery, sqlRequest, mediaRequest, predicateItems, splitKeys, partsNeeded, countUrl, recordsPredicate, PREDICATE_ITEMS_MAX, INAT_DATASET } from '../../scripts/gbif-request-lib';
import { downloadKeysOf, parseSpeciesList } from '../../scripts/select-species-lib';
import { SQL_SELECT } from '$dossier/bulk';

const { keys } = downloadKeysOf(parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8')));

describe('the Darwin Core Archive request at full size', () => {
  it('asks for the list\'s 46,021 keys (round eighty, A: Xanthoceras sorbifolium\'s refused) in one request, inside GBIF\'s 101,000 items', () => {
    // 46,041 until round eighty (X): 19 homonyms' keys no longer the list's.
    expect(keys.length).toBe(46021);
    const body = dwcaRequest(keys, { creator: 'grower', email: 'grower@example.org' });
    expect(predicateItems(body.predicate)).toBe(46021 + 3);
    expect(predicateItems(body.predicate)).toBeLessThanOrEqual(PREDICATE_ITEMS_MAX);
    expect(partsNeeded(keys.length)).toBe(1);
  });
  it('is the body round seventy-eight sent: DWCA, no checklistKey (the backbone\'s keys), the same four filters', () => {
    const body = dwcaRequest([5384013, 3084426], { creator: 'grower', email: 'grower@example.org' });
    expect(body).toEqual({
      creator: 'grower',
      notificationAddresses: ['grower@example.org'],
      sendNotification: false,
      format: 'DWCA',
      predicate: {
        type: 'and',
        predicates: [
          { type: 'in', key: 'TAXON_KEY', values: ['5384013', '3084426'] },
          { type: 'equals', key: 'HAS_COORDINATE', value: 'true' },
          { type: 'equals', key: 'HAS_GEOSPATIAL_ISSUE', value: 'false' },
          { type: 'equals', key: 'OCCURRENCE_STATUS', value: 'PRESENT' }
        ]
      }
    });
    expect(body).not.toHaveProperty('checklistKey');
  });
  it('a list past the limit is split into parts, every key once, in order', () => {
    expect(partsNeeded(250_000)).toBe(3);
    const many = Array.from({ length: 250_000 }, (_, i) => i + 1);
    const parts = splitKeys(many, partsNeeded(many.length));
    expect(parts.length).toBe(3);
    expect(parts.flat()).toEqual(many);
    for (const p of parts) expect(predicateItems(recordsPredicate(p))).toBeLessThanOrEqual(PREDICATE_ITEMS_MAX);
    expect(splitKeys(keys, 4).map((p) => p.length)).toEqual([11506, 11506, 11506, 11503]);
  });
});

describe('the SQL download', () => {
  const q = sqlQuery([5384013, 3084426]);
  it('is one SELECT on occurrence, of the reader\'s columns under the reader\'s names, filtered as the DWCA is', () => {
    expect(q).toBe(
      "SELECT gbifid, occurrence.gbif_classification.specieskey AS specieskey, occurrence.gbif_classification.taxonkey AS taxonkey, occurrence.gbif_classification.acceptedtaxonkey AS acceptedtaxonkey, decimallatitude, decimallongitude, coordinateuncertaintyinmeters, coordinateprecision, \"year\", countrycode, basisofrecord, license, datasetkey, establishmentmeans.concept AS establishmentmeans, degreeofestablishment.concept AS degreeofestablishment FROM occurrence WHERE occurrence.hascoordinate = TRUE AND occurrence.hasgeospatialissues = FALSE AND occurrence.occurrencestatus = 'PRESENT' AND EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('5384013', '3084426'))"
    );
    expect(SQL_SELECT.length).toBe(15);
  });
  it('keeps GBIF\'s rules: no comment, no *, no sub-query, HAVING or QUALIFY, "year" quoted, numbers as GBIF\'s keys in strings', () => {
    const full = sqlQuery(keys);
    expect(full).not.toMatch(/--|\*|\bHAVING\b|\bQUALIFY\b|\bJOIN\b/);
    expect(full.match(/\bSELECT\b/g)).toHaveLength(1);
    expect(full.match(/\bFROM occurrence\b/g)).toHaveLength(1);
    expect(full).toContain('"year"');
    expect(full.match(/'\d+'/g)).toHaveLength(46021);
  });
  it('its WHERE is GBIF\'s own conversion of the DWCA\'s predicate (asked of GBIF on 2026-10-20), the keys asked as GBIF\'s analyst advised (round eighty)', () => {
    // GBIF's answer, from POST /v1/occurrence/download/request/sql with the DWCA body for these two keys:
    const gbifs = "WHERE\n  ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY('5384013', '3084426'))\n  AND occurrence.hascoordinate = TRUE\n  AND occurrence.hasgeospatialissues = FALSE\n  AND occurrence.occurrencestatus = 'PRESENT'";
    // Round eighty: the keys' clause in the pattern of GBIF's data analyst (2026-10-21), for the same records.
    const analysts = (w: string) => w.replace("ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY('5384013', '3084426'))", "EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('5384013', '3084426'))");
    const clauses = (w: string) => w.replace(/^WHERE\s+/, '').split(/\s+AND\s+/).map((c) => c.trim()).sort();
    expect(clauses(q.slice(q.indexOf('WHERE')))).toEqual(clauses(analysts(gbifs)));
  });
  it('the request body: format SQL_TSV_ZIP and the query', () => {
    expect(sqlRequest([1], { creator: 'grower' })).toEqual({ creator: 'grower', sendNotification: false, format: 'SQL_TSV_ZIP', sql: sqlQuery([1]) });
  });
});

describe('the images\' download, for beside an SQL download', () => {
  it('the records\' filter, with a still image, human observations, iNaturalist\'s dataset left out by default in bulk-fetch', () => {
    const without = mediaRequest([7], {}, { inat: false });
    expect(without.format).toBe('DWCA');
    expect(without.predicate.predicates).toEqual([...recordsPredicate([7]).predicates!, { type: 'equals', key: 'MEDIA_TYPE', value: 'StillImage' }, { type: 'equals', key: 'BASIS_OF_RECORD', value: 'HUMAN_OBSERVATION' }, { type: 'not', predicate: { type: 'equals', key: 'DATASET_KEY', value: INAT_DATASET } }]);
    expect(mediaRequest([7]).predicate.predicates).toHaveLength(6);
    expect(predicateItems(mediaRequest(keys, {}, { inat: false }).predicate)).toBeLessThanOrEqual(PREDICATE_ITEMS_MAX);
  });
});

describe('the count API and the commands', () => {
  it('counts a batch under the records\' filter, and its images', () => {
    expect(countUrl([1, 2])).toBe('https://api.gbif.org/v1/occurrence/search?taxonKey=1&taxonKey=2&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=0');
    expect(countUrl([1], { media: true, facet: 'datasetKey', facetLimit: 5 })).toBe('https://api.gbif.org/v1/occurrence/search?taxonKey=1&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&mediaType=StillImage&basisOfRecord=HUMAN_OBSERVATION&limit=0&facet=datasetKey&facetLimit=5');
  });
  it('bulk-fetch sends these bodies, writes each to bulk/request-<route>.json first, and knows the new commands', () => {
    const src = readFileSync('scripts/bulk-fetch.ts', 'utf8');
    for (const c of ["cmd === 'gbif-sql'", "cmd === 'gbif-media'", "cmd === 'gbif-media-status'", "cmd === 'gbif-count'", "'--dry-run'", "'--parts'", "'--with-inat'"]) expect(src).toContain(c);
    expect(src).toMatch(/route === 'dwca' \? dwcaRequest\(ks, who\) : route === 'sql' \? sqlRequest\(ks, who\) : mediaRequest\(ks, who, \{ inat: o\.inat !== false \}\)/);
    expect(src).toMatch(/writeFileSync\(names\[i\], JSON\.stringify\(b, null, 1\)\)[\s\S]*if \(o\.dryRun\)[\s\S]*await submit\(b, route\)/);
  });
});
