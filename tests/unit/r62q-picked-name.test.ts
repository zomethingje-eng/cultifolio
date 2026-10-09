/**
 * Round sixty-two, decision 3: what a pick in the species picker writes and files. Adopted from
 * docs/review-61/tests/corpus--picked-name.test.ts (the self-review's corpus 3), with B3's and A7's cases. Each case
 * FAILED on the base (shown before the fix) unless its describe says guard.
 */
import { describe, it, expect } from 'vitest';
import * as picked from '$lib/ui/picked-name';

const { pickedName } = picked;
const filesKey = (t: string, s: { name: string; rank?: string }) => (picked as unknown as { filesKey: typeof picked.pickedName extends never ? never : (t: string, s: { name: string; rank?: string }) => boolean }).filesKey(t, s);
const requestName = (t: string) => (picked as unknown as { requestName: (t: string) => string }).requestName(t);
const sp = { name: 'Copiapoa cinerea', rank: 'SPECIES' };

describe('pickedName keeps the typed rest only for a rank with a complete epithet on the species typed (corpus 3)', () => {
  it.each(['Copiapoa cinerea var', 'Copiapoa cinerea var.', 'Copiapoa cinerea f', 'Copiapoa cinerea ssp'])('a rank with no epithet yet is not kept: %s', (t) => {
    expect(pickedName(t, sp)).toBe('Copiapoa cinerea'); // base: the typed text, dangling rank and all
  });
  it.each(['Copiapoa cinerea Phil.', 'Copiapoa cinerea (Phil.) Britton & Rose', 'Copiapoa cinerea KK 1234'])('an author or a field number is not written into the name: %s', (t) => {
    expect(pickedName(t, sp)).toBe('Copiapoa cinerea');
  });
  it('a variety is not carried to another species', () => {
    expect(pickedName('Copiapoa cinerea var. columna-alba', { name: 'Lithops lesliei' })).toBe('Lithops lesliei'); // base: "Lithops lesliei var. columna-alba"
  });
  it('a qualifier stays in the name (B3)', () => {
    expect(pickedName('Copiapoa cf. cinerea', sp)).toBe('Copiapoa cf. cinerea'); // base: "Copiapoa cinerea"
    expect(pickedName('Lithops sp. C 036', { name: 'Lithops', rank: 'GENUS' })).toBe('Lithops sp. C 036');
  });
  it('the genus picked for a genus followed by capitalised words keeps them as a cultivar (A7)', () => {
    expect(pickedName('Echeveria Lola', { name: 'Echeveria', rank: 'GENUS' })).toBe("Echeveria 'Lola'"); // base: "Echeveria"
    expect(pickedName('Echeveria Perle von Nurnberg', { name: 'Echeveria', rank: 'GENUS' })).toBe("Echeveria 'Perle von Nurnberg'");
  });
});

describe('a key is filed only when the name filed is the picked taxon\'s (B3, A7)', () => {
  it('a kept qualifier, an unmatched variety or a variety through a synonym files no key', () => {
    expect(filesKey('Copiapoa cf. cinerea', sp)).toBe(false);
    expect(filesKey('Copiapoa cinerea var. invented', sp)).toBe(false); // base: the species' key, 5384013
    expect(filesKey('Copiapoa cinerea var. columna-alba', sp)).toBe(false);
  });
  it('the species itself, a synonym binomial, a variety picked as itself, a cross\'s genus and a cultivar\'s genus file their key', () => {
    expect(filesKey('Copiapoa cinerea', sp)).toBe(true);
    expect(filesKey('copiapoa cinerea var', sp)).toBe(true);
    expect(filesKey('Copiapoa columna-alba', sp)).toBe(true); // the reference's species for an older binomial
    expect(filesKey('Copiapoa cinerea var. col', { name: 'Copiapoa cinerea columna-alba', rank: 'VARIETY' })).toBe(true);
    expect(filesKey('Aloe vera x Gasteria', { name: 'Aloe', rank: 'GENUS' })).toBe(true);
    expect(filesKey("Echeveria 'Lola'", { name: 'Echeveria', rank: 'GENUS' })).toBe(true);
    expect(filesKey('Aloe x nobilis', { name: 'Aloe nobilis', rank: 'SPECIES' })).toBe(true);
  });
});

describe('the picker asks about the species part, as typed (corpus 2, server 1, B3)', () => {
  it.each([
    ['Copiapoa cinerea Britton & Rose', 'Copiapoa cinerea'],
    ['Copiapoa cf. cinerea', 'Copiapoa cinerea'],
    ['Copiapoa cinerea KK 1234', 'Copiapoa cinerea'],
    ['Lithops lesliei C036', 'Lithops lesliei'],
    ['Gymnocalycium sp. LB 2091', 'Gymnocalycium'],
    ['Copiapoa cinerea var. columna-alba', 'Copiapoa cinerea'],
    ["Aloe ’Blue Elf’", 'Aloe'],
    ["Haworthia truncata 'Lime Green'", 'Haworthia truncata'],
    ['copiapoa CINEREA', 'copiapoa cinerea'], // the epithet in lower case since round sixty-two's second pass (the verification review's search 4)
    ['Aloe x nobilis', 'Aloe × nobilis'],
    ['Aloe vera x Gasteria', 'Aloe']
  ])('%s asks about %s', (typed, asked) => expect(requestName(typed)).toBe(asked));
});

describe('guard', () => {
  it('a typed rank with its epithet is kept (round sixty-one, corpus 5)', () => {
    expect(pickedName('Copiapoa cinerea var. columna-alba', sp)).toBe('Copiapoa cinerea var. columna-alba');
    expect(pickedName("Haworthia truncata 'Lime Green'", { name: 'Haworthia truncata' })).toBe("Haworthia truncata 'Lime Green'");
    expect(pickedName('Ariocarpus retusus x trigonus', { name: 'Ariocarpus', rank: 'GENUS' })).toBe('Ariocarpus retusus × Ariocarpus trigonus');
  });
});
