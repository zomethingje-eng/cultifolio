/**
 * Round eighty, agent O: GBIF's SQL download asks for the species' keys in the pattern GBIF's data analyst advised on
 * 2026-10-21, `EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN (…))`, where it asked
 * `ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY(…))`: GBIF's run of the list's download in that form
 * took 23 hours and was cancelled. GBIF's validation (POST /v1/occurrence/download/request/validate) accepted the new
 * form for two keys and for the list's keys on 2026-10-22, HTTP 201 (scripts/dev/scale/results/r80o-gbif-validate.txt).
 *
 * On r80f the query holds ARRAYS_OVERLAP and no EXISTS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqlQuery, sqlRequest, taxonFilter } from '../../scripts/gbif-request-lib';
import { downloadKeysOf, parseSpeciesList } from '../../scripts/select-species-lib';

describe("GBIF's SQL request in GBIF's recommended pattern (round eighty)", () => {
  it('filters each record\'s backbone keys with EXISTS and a lambda, the keys as strings, and no ARRAYS_OVERLAP', () => {
    const q = sqlQuery([5384013, 3084426]);
    expect(q.endsWith("AND EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('5384013', '3084426'))")).toBe(true);
    expect(q).not.toContain('ARRAYS_OVERLAP');
    expect(q).not.toContain('ARRAY(');
    expect(taxonFilter([7])).toBe("EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN ('7'))");
    expect(sqlRequest([7]).sql).toContain(taxonFilter([7]));
  });
  it('the whole list in one query, each key once', () => {
    const { keys } = downloadKeysOf(parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8')));
    const full = sqlQuery(keys);
    expect(full.match(/\bEXISTS\(/g)).toHaveLength(1);
    expect(full.match(/'\d+'/g)).toHaveLength(keys.length);
  });
  it('DEPLOY gives the query as it is sent', () => {
    const deploy = readFileSync('docs/DEPLOY.md', 'utf8');
    expect(deploy).toContain("EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN (");
  });
});
