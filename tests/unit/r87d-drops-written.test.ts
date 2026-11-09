/**
 * Round eighty-seven, the data agent: item 4. At round eighty-six's --keys stop the drops audit said Delphinium × barlowii
 * [k2759463] had lost its IPNI identifier ("identifier ipni lost"), while its written page holds 710426-1: the audit read
 * the page as the build derived it under GBIF's name, before Kew's names were read for it and its heading restored the
 * identifiers. Now a page with a loss is read again as written, after Kew's names and the ids by the rule
 * (`dropsAsWritten`), and only what it lost then is said.
 *
 * On r86 (db5a68d) the builder pushed `dropsBetween(prevFile, d)` as the build derived it: the first case's line was said.
 */
import { describe, it, expect } from 'vitest';
import { dropsBetween, dropsAsWritten, type PendingDrop } from '$dossier/drops';

const before = { key: 'k2759463' as const, name: { scientific: 'Delphinium × barlowii' }, ids: { gbif: 3033131, ipni: '710426-1', powo: 'urn:lsid:ipni.org:names:710426-1' }, photos: [] };
// As the build derived it, under GBIF's name, before Kew's heading: no IPNI.
const derived = { ...before, name: { scientific: 'Delphinium barlowii' }, ids: { gbif: 3033131 } };

describe('the drops audit reads the page as written', () => {
  const lost = dropsBetween(before, derived);
  const pending: PendingDrop = { key: 'k2759463', gbif: 3033131, name: 'Delphinium barlowii', prev: before, lines: lost };
  it("Delphinium × barlowii: lost as derived, not as written (Kew's heading gave the identifiers back)", () => {
    expect(lost).toContain('identifier ipni lost (710426-1 before)'); // what r86 said
    expect(dropsAsWritten([pending], () => before)).toEqual([]);
  });
  it('a loss the written page still has is said, under its name and id as written (guard)', () => {
    const written = { ...before, ids: { gbif: 3033131, powo: before.ids.powo } };
    expect(dropsAsWritten([pending], () => written)).toEqual(['Delphinium × barlowii [k2759463]: identifier ipni lost (710426-1 before)']);
  });
  it("a page that cannot be read as written keeps the build's own lines", () => {
    expect(dropsAsWritten([pending], () => null)).toEqual(lost.map((l) => `Delphinium barlowii [k2759463]: ${l}`));
    expect(lost).toHaveLength(2); // its IPNI and POWO identifiers
  });
});
