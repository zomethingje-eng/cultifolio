/**
 * Round sixty-one self-review, the grower: the sync page's words for held and parked changes.
 *
 * PASSES on f4ab4f8 (a guard worth adopting): no test pins the words the sync page lists a parked record with, which round
 * sixty's grower review (9) found as raw field keys ("acc, sowing, d, dFrom, caption, w, h, bytes, sha").
 * Run: npx vitest run tests/unit/grower--parked-words.test.ts   (lives in tests/unit/)
 */
import { describe, it, expect } from 'vitest';
import { fieldWords, heldWords } from '$lib/ui/held-words';

describe('held and parked changes are said in the grower\'s words', () => {
  it('a photograph\'s fields are "plant, batch, date, caption, the picture", once each', () => {
    const f = ['acc', 'sowing', 'd', 'dFrom', 'caption', 'w', 'h', 'bytes', 'sha'].map((field) => ({ field, value: 'x' }));
    expect(fieldWords('photo', f)).toEqual(['plant', 'batch', 'date', 'caption', 'the picture']);
  });
  it('a plant\'s notes and their base are one word; a removal and a restore are words too', () => {
    expect(fieldWords('accession', [{ field: 'notes', value: 'a' }, { field: 'notesBase', value: 'b' }, { field: 'locationId', value: 'l' }])).toEqual(['notes', 'place']);
    expect(fieldWords('accession', [{ field: '_deleted', value: true }])).toEqual(['removal']);
    expect(fieldWords('accession', [{ field: '_deleted', value: false }])).toEqual(['restore']);
  });
  it('no field key of a known kind is shown raw', () => {
    const keys: Record<string, string[]> = { accession: ['acc', 'taxonName', 'taxonKey', 'cultivar', 'nameKind', 'parentage', 'fieldNumber', 'provenance', 'status', 'locationId', 'acquired', 'sourceFrom', 'sourceRef', 'sourceForm', 'price', 'notes', 'waterDays', 'cover', 'sowingId', 'nameAsReceived'], event: ['acc', 'd', 't', 'note', 'n', 'measures'], location: ['name', 'parentId', 'waterDays', 'dryMonths', 'lat', 'lon'] };
    for (const [kind, fs] of Object.entries(keys)) for (const w of fieldWords(kind, fs.map((field) => ({ field, value: 1 })))) { expect(w).not.toMatch(/[a-z][A-Z]/); expect(['acc', 'd', 't', 'n', 'lat', 'lon']).not.toContain(w); }
  });
  it('held changes are counted in words', () => {
    expect(heldWords(1)).toBe('1 change from a device whose clock runs ahead is waiting. It appears when this device\'s date reaches it.');
    expect(heldWords(0)).toBe('');
  });
});
