/**
 * Review of round sixty-two (search): what the species picker asks and what a pick writes. Every `it` FAILS on the
 * merged code. Run from the repository root:
 *   cp /tmp/r62rev/out/tests/search--picked-name.test.ts tests/unit/ && npx vitest run tests/unit/search--picked-name.test.ts
 */
import { describe, it, expect } from 'vitest';
import { pickedName, filesKey, requestName, searchText } from '$lib/ui/picked-name';

// Adopted from the verification review (round sixty-two, second pass, agent Q). Changed from the review's file: the
// catalogue's request is `searchText` (the whole text, as decided), the name service's `requestName` (the species part).
describe('the picker asks the catalogue about a common name whole (base sent the whole name)', () => {
  it.each(['String of pearls', 'Black eyed Susan', 'Mother of thousands', 'Queen of the night', 'Crown of thorns', 'Lily of the Nile'])('%s', (t) => {
    // merged: "String of", "Black eyed" (B2's Black-eyed pea again), "Mother of", "Queen of", "Crown of", "Lily of"
    expect(searchText(t)).toBe(t);
  });
});

describe('a typed rank the search knows is never dropped by a pick (corpus 3; the about page lists fo., forma, variety, subspecies)', () => {
  const sp = { name: 'Copiapoa cinerea' };
  it.each([
    ['Copiapoa cinerea fo. columna-alba'],
    ['Copiapoa cinerea variety columna-alba'],
    ['Copiapoa cinerea subspecies columna-alba'],
    ['Copiapoa cinerea var. Columna-alba']
  ])('%s picked as the species keeps the rank and files no key', (t) => {
    expect(pickedName(t, sp)).not.toBe('Copiapoa cinerea'); // merged: "Copiapoa cinerea", the form or variety gone
    expect(filesKey(t, sp)).toBe(false); // merged: true, the species' key for a form or variety
  });
});

describe('a variety typed under an older name is kept, with no key (triage 3: "a synonym\'s variety is filed with no key")', () => {
  it('Haworthia attenuata var. radula picked as Haworthiopsis attenuata', () => {
    const p = { name: 'Haworthiopsis attenuata' };
    expect(pickedName('Haworthia attenuata var. radula', p)).toContain('var. radula'); // merged: "Haworthiopsis attenuata"
    expect(filesKey('Haworthia attenuata var. radula', p)).toBe(false); // merged: true
  });
});

describe('the picker sends no field number and no cultivar (the about page: "never a qualifier, a rank and what follows it, a cultivar, an author or a field number")', () => {
  it.each([
    ['Gymnocalycium LB 123', 'Gymnocalycium'], // merged: "Gymnocalycium LB"
    ['Mammillaria SB 1234', 'Mammillaria'], // merged: "Mammillaria SB"
    ['Lithops C 036', 'Lithops'], // merged: "Lithops C"
    ['Haworthia Big Band', 'Haworthia'] // merged: "Haworthia Big", sent to /api/search (now the name service's request)
  ])('%s asks about %s', (typed, asked) => expect(requestName(typed)).toBe(asked));
});

describe('the picker reads a pasted name as the server does: NFKC, no format characters (A7)', () => {
  it.each([['Ｃｏｐｉａｐｏａ ｃｉｎｅｒｅａ'], ['Copia​poa cinerea'], ['Copia­poa cinerea']])('%j asks about Copiapoa cinerea', (typed) => {
    expect(requestName(typed)).toBe('Copiapoa cinerea'); // merged: "Ｃｏｐｉａｐｏａ" (the epithet lost; Add files the genus alone), or the invisible character kept
  });
});
