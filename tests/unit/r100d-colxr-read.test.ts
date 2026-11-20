/**
 * Round one hundred (docs/PLAN-100.md, 3): the reading by rule. GBIF's name route reaches a synonym's accepted taxon and
 * says nothing at a higher rank; Kew's file places COL XR's name as this plant, another, both, or not at all, by the
 * epithet's spelling key; two authors are one where they share a name, an abbreviation of three letters or more allowed
 * ("Fisch." and "Fischer", "W.Bull" and "Bull.", "Rchb." and "Rchb. ex Spreng."), while "L." and "Bourg. ex Lange" are two
 * (Alopecurus pratensis, a homonym); and the verdict follows Kew first, then the family, then the author.
 *
 * On effd066: none of these functions existed; every case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { nameTaxon, routes, kewPlaces, authorOf, sameAuthors, verdict } from '../../scripts/dev/r100-colxr-count-lib.mjs';
import { spellingKey } from '../../src/lib/dossier/epithet';

const r = (o: Record<string, string>) => ({ byidType: 'EXACT', byid: 'A', byidName: '', bynameType: 'EXACT', byname: '', bynameName: '', bynameStatus: '', bynameAccepted: '', ...o });

describe('r100d: the reading by rule', () => {
  it('the name route: accepted, a synonym\'s accepted taxon, nothing at a higher rank', () => {
    expect(nameTaxon(r({ byname: 'A', bynameStatus: 'ACCEPTED' }))).toBe('A');
    expect(nameTaxon(r({ byname: 'S', bynameStatus: 'SYNONYM', bynameAccepted: 'A Aus bus L.' }))).toBe('A');
    expect(nameTaxon(r({ bynameType: 'HIGHERRANK', byname: 'G', bynameStatus: 'ACCEPTED' }))).toBe('');
    expect(routes(r({ byname: 'B', bynameStatus: 'PROVISIONALLY_ACCEPTED' }))).toBe('differ');
    expect(routes(r({ bynameType: 'NONE' }))).toBe('name says nothing');
  });
  it('Kew places a name by its spelling key', () => {
    const kew = new Map([['quercus|' + spellingKey('eduardii'), ['k1']], ['silene|' + spellingKey('multifida'), ['k2', 'k3']]]);
    expect(kewPlaces(kew, 'quercus eduardi', 'k1', spellingKey)).toBe('this plant');
    expect(kewPlaces(kew, 'quercus eduardii', 'k9', spellingKey)).toBe('another plant');
    expect(kewPlaces(kew, 'silene multifida', 'k2', spellingKey)).toBe('both');
    expect(kewPlaces(kew, 'aus bus', 'k1', spellingKey)).toBe('not in Kew');
  });
  it('one author, or two', () => {
    expect(authorOf('Aconitum lamarckii Rchb. ex Spreng.')).toBe('Rchb. ex Spreng.');
    expect(authorOf('Rosa villosa subsp. mollis (Sm.) Crép.')).toBe('(Sm.) Crép.');
    expect(sameAuthors('Rchb.', 'Rchb. ex Spreng.')).toBe(true);
    expect(sameAuthors('Fisch.', 'Fischer')).toBe(true);
    expect(sameAuthors('W.Bull', 'Bull.')).toBe(true);
    expect(sameAuthors('St.Hil.', 'A.St.-Hil.')).toBe(true);
    expect(sameAuthors('L.', 'Bourg. ex Lange')).toBe(false);
    expect(sameAuthors('DC.', 'Dunal')).toBe(false);
    expect(sameAuthors('', 'L.')).toBe(true);
  });
  it('the verdict: Kew, then the family, then the author', () => {
    expect(verdict('this plant', false)).toMatch(/^the same plant/);
    expect(verdict('another plant', true, true)).toMatch(/another family/);
    expect(verdict('another plant', false)).toMatch(/homonym/);
    expect(verdict('another plant', true)).toMatch(/a lump, or an error/);
    expect(verdict('both', true)).toMatch(/read by hand/);
    expect(verdict('not in Kew', true)).toMatch(/not in Kew/);
  });
});
