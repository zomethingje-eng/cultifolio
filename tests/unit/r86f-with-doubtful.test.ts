/**
 * Round eighty-six, final review M1 (D6's `with` keys in the download): a key that comes with a variety a page reads
 * from another page's species (`ExtraKey.with`) and is DOUBTFUL, not a synonym, has its own key as its taxon and accepted
 * key, so the download indexed its records under neither the variety's key nor any key the receiving page reads; the
 * holder left them out (they are in `with`) and its record said the receiving page "reads them", which only the API path
 * did (GBIF's search by the variety's key answers with what it files under it). Salix lucida subsp. lasiandra (7999354,
 * Salix lasiandra's page k2918186) has the DOUBTFUL Salix lasiandra var. lasiandra (7225949, about 2,306 records) under it.
 * Now the download indexes a `with` key's records under the key it comes with too (`OccIndex`'s `under`), so the receiving
 * page reads them as the API path gives them.
 *
 * On r85m: `OccIndex` took no `under`, and 7999354's set held none of 7225949's records.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OccIndex } from '$dossier/bulk';
import { parseExtraKeys, withKeysUnder } from '$dossier/extra-keys';

const rec = (key: number, taxonKey: number, acceptedTaxonKey = taxonKey, speciesKey = 5372604) => ({ key, speciesKey, taxonKey, acceptedTaxonKey, decimalLatitude: 45 + key / 1000, decimalLongitude: -120, coordDecimals: 3, countryCode: 'US', basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', datasetKey: 'd', year: 2020 });

describe("a DOUBTFUL key that comes with a variety read from another page's species", () => {
  const rows = [rec(1, 7999354), rec(2, 7225949), rec(3, 7225949), rec(4, 8549994, 7999354), rec(5, 5372604)];
  it("is read under the variety's key, as GBIF's search by that key gives it", () => {
    const idx = new OccIndex(2000, new Set([5372604, 7999354]), new Map([[7225949, [7999354]], [8549994, [7999354]]]));
    for (const r of rows) idx.add(r as never);
    idx.seal();
    expect(idx.get(7999354)!.map((o) => o.key).sort()).toEqual([1, 2, 3, 4]); // r85m: [1, 4]
    expect(idx.get(7999354)!.find((o) => o.key === 2)?.taxonKey).toBe(7225949); // the record keeps its own key
    expect(idx.get(5372604)!.map((o) => o.key).sort()).toEqual([1, 2, 3, 4, 5]); // the holder's set is as before (it leaves them out by taxonKey)
    expect(idx.get(7225949)).toBeUndefined(); // not wanted itself, so not indexed under its own key
  });
  it('guard: without `under`, or with the variety not wanted, nothing changes', () => {
    const a = new OccIndex(2000, new Set([5372604, 7999354]));
    for (const r of rows) a.add(r as never);
    a.seal();
    expect(a.get(7999354)!.map((o) => o.key).sort()).toEqual([1, 4]);
    const b = new OccIndex(2000, new Set([5372604]), new Map([[7225949, [7999354]]]));
    for (const r of rows) b.add(r as never);
    b.seal();
    expect(b.get(7999354)).toBeUndefined();
  });
  it("the infra list's `with` keys, by the key they come with, as the build gives them to the download", () => {
    const lines = parseExtraKeys(readFileSync('scripts/extra-keys-infra.txt', 'utf8'));
    const under = withKeysUnder(lines);
    expect(under.get(7225949)).toEqual([7999354]); // Salix lasiandra var. lasiandra, DOUBTFUL, under Salix lucida subsp. lasiandra
    expect(under.get(3649470)).toEqual([2810689]); // Dactylorhiza fuchsii var. sacciferoides, DOUBTFUL
    expect(under.get(4206201)).toEqual([8410641]); // Centaurea axillaris var. nana, DOUBTFUL
    expect(under.get(11093098)).toBeUndefined(); // a key read itself is not one that comes with another
    expect(withKeysUnder([{ page: 0, key: 1, label: 'x', status: 'ACCEPTED', kew: '1', kewLabel: 'x', how: 'filed' }]).size).toBe(0); // guard: no `with`
  });
});
