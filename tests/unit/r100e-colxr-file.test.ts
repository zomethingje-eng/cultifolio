/**
 * Round one hundred (docs/PLAN-100.md, 4, step 2): a record of the COL XR trial download is filed under the trial pages whose
 * COL XR taxon is its accepted taxon or its species, as GBIF's search for a taxon under COL XR answers: a subspecies' records
 * are its species' page's too, a taxon two pages share files under both, a taxon below an infraspecific page's under that
 * page by COL XR's parent, and a record of no trial taxon under none.
 *
 * On e9f6d64: fileUnder did not exist; every case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { fileUnder } from '../../scripts/dev/r100-colxr-count-lib.mjs';

const at = new Map<string, string[]>([['SP', ['100']], ['SUB', ['200']], ['SHARED', ['300', '301']]]);
const row = (acceptedTaxonKey: string, speciesKey: string) => ({ acceptedTaxonKey, speciesKey, taxonKey: acceptedTaxonKey });

describe('fileUnder', () => {
  it('files a species record under its page', () => {
    expect(fileUnder(row('SP', 'SP'), at)).toEqual({ keys: ['100'], via: 'accepted' });
  });
  it("files a subspecies' record under its own page and its species' page", () => {
    expect(fileUnder(row('SUB', 'SP'), at)).toEqual({ keys: ['200', '100'], via: 'both' });
  });
  it("files a record of a subspecies no page reaches under its species' page", () => {
    expect(fileUnder(row('OTHER', 'SP'), at)).toEqual({ keys: ['100'], via: 'species' });
  });
  it('files a shared taxon under every page that reaches it', () => {
    expect(fileUnder(row('SHARED', 'SHARED'), at)).toEqual({ keys: ['300', '301'], via: 'accepted' });
  });
  it("files a variety under an infraspecific page by COL XR's parent (Syncarpia glomulifera subsp. glomulifera, CYCJ8 under 7KSHD)", () => {
    const parents = new Map([['CYCJ8', 'SUB']]);
    expect(fileUnder(row('CYCJ8', '7B7G3'), at, parents)).toEqual({ keys: ['200'], via: 'parent' });
    expect(fileUnder(row('CYCJ8', '7B7G3'), at)).toEqual({ keys: [], via: '' }); // without the tree: the 11,462 records lost
  });
  it('files a record of no trial taxon under none', () => {
    expect(fileUnder(row('X', 'Y'), at)).toEqual({ keys: [], via: '' });
  });
});
