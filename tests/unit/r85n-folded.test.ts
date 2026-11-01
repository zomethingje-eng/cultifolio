/**
 * Round eighty-five (N): the rule that gives a page to a species Kew accepts, GBIF folds into another reference species,
 * and growers name (the owner's decision 6; `scripts/folded-species-lib.ts`). Echinopsis pachanoi, San Pedro, is the
 * first: iNaturalist files it as the variety Trichocereus macrogonus pachanoi, with 1,009 observations marked cultivated
 * (31 October 2026). A complex, a taxon of another species' epithet and a count under three are not.
 *
 * FAILS on r85base: the rule's module does not exist. Checked by running this file on a checkout of r85base.
 */
import { describe, it, expect } from 'vitest';
import { ownHit, grownBy, listLine, gbifNamesOf } from '../../scripts/folded-species-lib';

describe("the folded species' rule", () => {
  it('reads San Pedro by the variety iNaturalist files it as', () => {
    const hits = [{ tid: 829212, tname: 'Trichocereus macrogonus pachanoi', rank: 'variety', matched: 'Echinopsis pachanoi', obs: 1458, captive: 1009, common: 'San Pedro Column Cactus' }];
    expect(ownHit('Echinopsis pachanoi', hits[0])).toBe(true);
    const g = grownBy('Echinopsis pachanoi', hits);
    expect(g).toEqual({ count: 1009, taxon: 'Trichocereus macrogonus pachanoi', rank: 'variety', common: 'San Pedro Column Cactus' });
    expect(listLine({ id: '2783547', name: 'Echinopsis pachanoi', authors: '(Britton & Rose) H.Friedrich & G.D.Rowley', family: 'Cactaceae' }, g!, ['Echinopsis macrogona'])).toBe("2783547\tEchinopsis pachanoi\t(Britton & Rose) H.Friedrich & G.D.Rowley\tCactaceae\tfolded by GBIF into Echinopsis macrogona; inat 1009 (iNaturalist's Trichocereus macrogonus pachanoi, variety)\t-");
  });
  it('refuses a complex, another epithet, another species and a count under three', () => {
    expect(ownHit('Ranunculus hispidus', { tname: 'Ranunculus hispidus', rank: 'complex', matched: null })).toBe(false);
    expect(ownHit('Echinopsis pachanoi', { tname: 'Trichocereus macrogonus', rank: 'species', matched: 'Echinopsis pachanoi' })).toBe(false);
    expect(ownHit('Echinopsis pachanoi', { tname: 'Trichocereus macrogonus peruvianus', rank: 'variety', matched: 'Echinopsis pachanoi' })).toBe(false);
    expect(grownBy('Viola x', [{ tid: 1, tname: 'Viola x', rank: 'species', obs: 9, captive: 2 }])).toBeNull();
  });
  it("test 2 reads every GBIF name a page holds", () => {
    expect(gbifNamesOf({ syn: ['A b'], older: ['C d'], kew: ['E f'], hom: ['G h'] })).toEqual(['A b', 'C d', 'G h', 'E f']);
  });
});
