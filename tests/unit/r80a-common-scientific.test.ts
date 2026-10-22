/**
 * Round eighty, agent A (review-d 7): three pages showed a scientific name as their only English name: Goeppertia
 * kegeljanii "Calathea musaica" (its own older name, Kew's synonym), Veronica albicans "Veronica recurva" (its own older
 * name) and Leibnitzia anandria "Gerbera anandra" (its older name Gerbera anandria, spelt one letter otherwise). The rule
 * set the own name back but showed it when it was the only one, and read no older name. Now a common name that is the
 * species' own name or one of its older names, or one of them one letter otherwise, is not shown. FAILED on r80f: each
 * was `common`.
 */
import { describe, it, expect } from 'vitest';
import { englishNames, indexNames, oneLetterApart, scientificOfOwn } from '../../src/lib/dossier/index-entry';

const eng = (...names: string[]) => names.map((name) => ({ name, lang: 'eng' }));
const genera = new Set(['calathea', 'goeppertia', 'veronica', 'gerbera', 'leibnitzia', 'aloe']);

describe('a common name that is a scientific name of the species', () => {
  it('Calathea musaica on Goeppertia kegeljanii is not shown', () => {
    expect(englishNames(eng('Calathea musaica'), { genus: 'Goeppertia kegeljanii', genera, older: ['Calathea musaica (Linden) Linden ex Mast.'] })).toEqual({});
  });
  it('Veronica recurva on Veronica albicans is not shown, and a real name still is', () => {
    expect(englishNames(eng('Veronica recurva', 'Hebe'), { genus: 'Veronica albicans', genera, older: ['Veronica recurva'] }).common).toBe('Hebe');
    expect(englishNames(eng('Veronica recurva'), { genus: 'Veronica albicans', genera, older: ['Veronica recurva'] })).toEqual({});
  });
  it('Gerbera anandra, one letter from the older name Gerbera anandria, is not shown', () => {
    expect(oneLetterApart('anandra', 'anandria')).toBe(true);
    expect(oneLetterApart('anandra', 'anandrina')).toBe(false);
    expect(englishNames(eng('Gerbera anandra'), { genus: 'Leibnitzia anandria', genera, older: ['Gerbera anandria (L.) Sch.Bip.'] })).toEqual({});
  });
  it('the species\' own name written as an English one is not shown even alone', () => {
    expect(englishNames(eng('Aloe vera'), { genus: 'Aloe vera', genera })).toEqual({});
    expect(englishNames(eng('Aloe vera', 'Barbados aloe'), { genus: 'Aloe vera', genera }).common).toBe('Barbados aloe');
  });
  it('an English name with a genus word is still shown ("Arum lily", "Aloe vera" on another aloe is another rule)', () => {
    expect(scientificOfOwn('Arum lily', { genus: 'Zantedeschia aethiopica', older: ['Calla aethiopica'] })).toBe(false);
    expect(englishNames(eng('Arum lily'), { genus: 'Zantedeschia aethiopica', genera, older: ['Calla aethiopica'] }).common).toBe('Arum lily');
  });
  it('the index reads the same rule', () => {
    expect(indexNames(eng('Calathea musaica'), { genus: 'Goeppertia', older: ['Calathea musaica'] }).common).toBeUndefined();
  });
});
