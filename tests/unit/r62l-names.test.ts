/**
 * Round sixty-two (agent L), the plant page's readings of a name (decision 4, A21; decision 8, the grower review's 11):
 *  - an "sp." plant's notes are kept by its full name, not on the bare genus every such plant shared; the genus's record
 *    is still named, so notes written there before stay readable;
 *  - a "cf." or "aff." plant names the species it is compared with, for its link and its habitat comparison;
 *  - a stranger's label loses format and separator characters, and an "sp." name follows no species slug;
 *  - a restore that changed the number says when the order is not known (A22).
 * Each failed on the base (the helpers did not exist; the page keyed an "sp." plant's notes as `speciesSlug`, the genus).
 */
import { describe, it, expect } from 'vitest';
import { notesTaxon, comparedSpecies } from '$lib/db/species-list';
import { shownLabel } from '$lib/ui/grow/foreign-label';
import { restoredWords } from '$lib/ui/held-words';

describe('which record "My notes on" are kept on', () => {
  it('a species, a cultivar and a compared plant keep them on the species', () => {
    expect(notesTaxon('Copiapoa cinerea')).toEqual({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' });
    expect(notesTaxon('Copiapoa cinerea subsp. columna-alba')).toEqual({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' });
    expect(notesTaxon('Copiapoa cf. cinerea')).toEqual({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' });
  });
  it('an "sp." plant keeps them by its full name, two such plants apart, and names the genus record they shared before', () => {
    const a = notesTaxon('Lithops sp. C 036'), b = notesTaxon('Lithops sp. C 120');
    expect(a.slug).not.toBe(b.slug);
    expect(a.slug).not.toBe('lithops');
    expect(a.name).toBe('Lithops sp. C 036');
    expect(a.shared).toBe('lithops');
  });
});

describe('the species a compared plant is compared with', () => {
  it('cf. and aff. name it; a species, a cultivar and an "sp." plant do not', () => {
    expect(comparedSpecies('Copiapoa cf. cinerea')).toBe('Copiapoa cinerea');
    expect(comparedSpecies('Mammillaria aff. bombycina')).toBe('Mammillaria bombycina');
    expect(comparedSpecies('Copiapoa cinerea')).toBeNull();
    expect(comparedSpecies('Lithops sp. C 036')).toBeNull();
  });
});

describe('a stranger\'s label as the page shows it', () => {
  it('format characters and line and paragraph separators are taken off the name', () => {
    expect(shownLabel({ slug: 'haworthia-retusa', name: 'Haworthia​ retusa­  \'King\' ' })).toEqual({ slug: 'haworthia-retusa', name: 'Haworthia retusa \'King\'' });
  });
  it('an "sp." name follows no species slug, a label printed before this round included', () => {
    expect(shownLabel({ slug: 'conophytum', name: 'Conophytum sp. SH 1234' })).toEqual({ slug: null, name: 'Conophytum sp. SH 1234' });
    expect(shownLabel({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }).slug).toBe('copiapoa-cinerea');
  });
});

describe('what a restore that changed the number says (A22)', () => {
  it('with the order known, and not known', () => {
    expect(restoredWords({ from: '2026-0001', to: '2026-0007' }, 'plant')).toBe("Restored as 2026-0007: 2026-0001 is another plant's now.");
    expect(restoredWords({ from: '2026-0001', to: '2026-0007', unknown: true }, 'batch')).toMatch(/^Restored as 2026-0007: another batch has 2026-0001, and which reached this device first is not known, so the batch that stayed keeps it\.$/);
  });
});
