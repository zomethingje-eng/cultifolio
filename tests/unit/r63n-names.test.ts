/**
 * Round sixty-three, N1 and N2: a source's list of names is several names, and a bare genus word is the headline only
 * when there is nothing fuller. Each case FAILED on the base unless its describe says guard.
 */
import { describe, it, expect } from 'vitest';
import { englishNames, generaOf, type VernacularName } from '$dossier/index-entry';
import { auditCommonNames } from '../../scripts/audit-common-names';

const eng = (name: string, extra: Record<string, unknown> = {}) => ({ name, lang: 'eng', ...extra }) as VernacularName;
const GENERA = generaOf(['Aloe vera', 'Aristaloe aristata', 'Cycas revoluta', 'Diospyros kaki', 'Calluna vulgaris', 'Pleroma urvilleanum', 'Nelumbo nucifera',
  'Agave americana', 'Curio rowleyanus', 'Senecio vulgaris', 'Crassula ovata', 'Iris germanica', 'Moraea polystachya', 'Dimorphotheca jucunda', 'Osteospermum ecklonis']);
const names = (vs: VernacularName[], species: string) => englishNames(vs, { genus: species, genera: GENERA });
const shown = (vs: VernacularName[], species: string) => names(vs, species).common;

describe('N1: a vernacular value with commas is a list of names, each its own name', () => {
  it('split on commas, with or without a space, trimmed, each a name of the same source', () => {
    expect(names([eng('Sago palm, King sago, Sago cycad, Japanese sago palm', { source: 'Checklist of Vascular Plants in Korea' })], 'Cycas revoluta'))
      .toEqual({ common: 'Sago palm', commons: ['King sago', 'Sago cycad', 'Japanese sago palm'] }); // base: one name, "Sago palm, King sago, ..."
    expect(names([eng('Kaki,Japanese Persimmon, Oriental Persimmon, Sharon Fruit', { source: 'TAXREF' })], 'Diospyros kaki'))
      .toEqual({ common: 'Kaki', commons: ['Japanese Persimmon', 'Oriental Persimmon', 'Sharon Fruit'] });
    expect(names([eng('Lory bush, Lasiandra, Princess flower, Pleroma, Purple glory tree')], 'Pleroma urvilleanum').common).toBe('Lory bush');
  });
  it('empty parts are dropped, and a part given twice in one value is one name', () => {
    expect(names([eng('Heather, , Ling,'), eng(' ,')], 'Calluna vulgaris')).toEqual({ common: 'Heather', commons: ['Ling'] });
    expect(names([eng('Heather, heather, Ling')], 'Calluna vulgaris')).toEqual({ common: 'Heather', commons: ['Ling'] });
  });
  it('a part is one name with the same name given elsewhere, and its source counts once for it, however many parts it gave', () => {
    // "Ling" from TAXREF (in the list) and EUNIS; "Heather" from TAXREF twice: Ling has two distinct sources, Heather one.
    expect(shown([eng('Heather, Ling', { source: 'TAXREF' }), eng('Heather', { source: 'TAXREF' }), eng('Ling', { source: 'EUNIS' })], 'Calluna vulgaris')).toBe('Ling');
    // A row with no named source is one source, once per name: "Heather" twice in one value is still one.
    expect(shown([eng('Ling'), eng('Heather, heather')], 'Calluna vulgaris')).toBe('Ling');
    // A counted row's count goes with each of its names (once each), so "Heather" has three and "Ling" two.
    expect(shown([eng('Ling', { sources: 2 }), eng('Heather, Ling-heather', { sources: 3 })], 'Calluna vulgaris')).toBe('Heather');
  });
  it('the parts keep their place in GBIF\'s order (a part listed before another name goes before it on a tie)', () => {
    expect(names([eng('Bell heather'), eng('Heather, Ling')], 'Calluna vulgaris')).toEqual({ common: 'Bell heather', commons: ['Heather', 'Ling'] });
    expect(names([eng('Heather, Ling'), eng('Bell heather')], 'Calluna vulgaris')).toEqual({ common: 'Heather', commons: ['Ling', 'Bell heather'] });
  });
  it('the parts are read by the rest of the rule: a part naming another genus is set back like any name', () => {
    expect(names([eng('Osteospermum, Cape daisy')], 'Dimorphotheca jucunda')).toEqual({ common: 'Cape daisy', commons: ['Osteospermum'] });
    expect(names([eng('Flatleaf Senecio, Blue chalksticks')], 'Curio rowleyanus').common).toBe('Blue chalksticks');
  });
});

describe('N1 guard: what is not split', () => {
  it('a semicolon list is still one string, set back; a name in another language is not read', () => {
    expect(names([eng('Heather; Ling'), eng('Bell heather')], 'Calluna vulgaris')).toEqual({ common: 'Bell heather', commons: ['Heather; Ling'] });
    expect(names([{ name: 'haari (fruit), tumu haari (arbre)', lang: 'tah' }], 'Cycas revoluta')).toEqual({});
  });
});

describe('N2: a bare genus word is the headline only when there is nothing fuller', () => {
  // Aloe vera as the live site showed it after round sixty-two: "Aloe" first (most sources), then the others.
  const ALOE_VERA = [
    eng('Aloe', { source: 'a', alsoFrom: ['b', 'c', 'd'], preferred: true }),
    eng('Barbados aloe', { source: 'a', alsoFrom: ['b', 'c'] }),
    eng('True aloe', { source: 'a', alsoFrom: ['b'] }),
    eng('Curaçao aloe', { source: 'b', alsoFrom: ['c'] }),
    eng('West Indian aloe', { source: 'c' }),
    eng('Aloe vera', { source: 'd' }),
    eng('Medicinal aloe', { source: 'e' })
  ];
  it('Aloe vera: "Barbados aloe", the best of the longer names; "Aloe" stays among the names', () => {
    expect(names(ALOE_VERA, 'Aloe vera')).toEqual({ common: 'Barbados aloe', commons: ['True aloe', 'Curaçao aloe', 'West Indian aloe', 'Aloe vera', 'Medicinal aloe', 'Aloe'] }); // base: "Aloe"
    // Without the corpus's genera (a caller with no index), the species' own genus is still known.
    expect(englishNames(ALOE_VERA, { genus: 'Aloe vera' }).common).toBe('Barbados aloe');
  });
  it('in any case and with accents; and a genus English uses as a noun, for another genus, too', () => {
    expect(shown([eng('ALOE', { sources: 5 }), eng('Barbados aloe')], 'Aloe vera')).toBe('Barbados aloe');
    expect(shown([eng('Aloe', { sources: 3 }), eng('Lace aloe')], 'Aristaloe aristata')).toBe('Lace aloe');
    expect(shown([eng('Lotus', { preferred: true }), eng('Sacred lotus')], 'Nelumbo nucifera')).toBe('Sacred lotus');
    expect(shown([eng('Agave'), eng('Century plant')], 'Agave americana')).toBe('Century plant');
  });
  it('a single word that is no genus is a name like any other (the existing ranking decides)', () => {
    expect(shown([eng('Jade', { sources: 3 }), eng('Money plant')], 'Crassula ovata')).toBe('Jade');
  });
});

describe('N2 guard: a bare genus word that is all there is', () => {
  it('the only name is the bare word: it is shown', () => {
    expect(names([eng('Aloe')], 'Aloe vera')).toEqual({ common: 'Aloe' });
    expect(shown([eng('Aloe', { source: 'a' })], 'Aristaloe aristata')).toBe('Aloe');
  });
  it('a bare word comes before a set-back name (another genus\'s, or a list)', () => {
    expect(names([eng('Flatleaf Senecio'), eng('Aloe')], 'Aloe vera')).toEqual({ common: 'Aloe', commons: ['Flatleaf Senecio'] });
    expect(names([eng('Iris; flag'), eng('Iris')], 'Iris germanica')).toEqual({ common: 'Iris', commons: ['Iris; flag'] });
  });
  it('another genus named alone that English does not use as a noun stays set back, after a bare word of the species\' own genus', () => {
    expect(names([eng('Osteospermum', { sources: 3 }), eng('Dimorphotheca')], 'Dimorphotheca jucunda')).toEqual({ common: 'Dimorphotheca', commons: ['Osteospermum'] });
  });
});

describe('the audit sees the split and the bare word', () => {
  it('a list shown whole and a bare genus word shown first are counted as such', () => {
    const a = auditCommonNames([
      { name: 'Cycas revoluta', common: 'Sago palm, King sago', commons: ['Cycad'] },
      { name: 'Aloe vera', common: 'Aloe', commons: ['Barbados aloe'] },
      { name: 'Crassula ovata', common: 'Jade', commons: ['Money plant'] }
    ], 40);
    expect(a).toMatchObject({ species: 3, withCommon: 3, changed: 2, split: 1, bare: 1, setBack: 0 });
    expect(a.sample).toEqual(['Cycas revoluta: "Sago palm, King sago" -> "Sago palm"', 'Aloe vera: "Aloe" -> "Barbados aloe"']);
  });
});
