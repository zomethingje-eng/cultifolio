/**
 * Round eighty-seven (pages), the deeper fix of round eighty-six's U3: a plant filed under another page's name
 * (`olderOf`) records which kind of name it is (`olderKind`), validated on read, and the words follow from it.
 *
 * 1. `olderKindOf` reads only the two words; anything else is not known.
 * 2. `kindToSay`: the reference's answer where reached, else the record, else none; and the words for each.
 * 3. The import records the kind its row said (`recordOf`); the add form's reading of the copy (`kindOfCopy`).
 * 4. The log takes the field as a string, and its words are listed as the type's: a change of another type is left out
 *    on its own, a newer version's word is kept.
 * 5. A record written before the change (no `olderKind`) still folds, and its tile says only that the reference files the
 *    name under the page; one with the kind says the kind; one with a word this version does not know says neither.
 * 6. The add form's record is read in the browser (tests/e2e/r87p-pages.spec.ts, 8 and 9).
 *
 * On the base (r85m head): no module, no field; every test fails.
 */
import { describe, it, expect } from 'vitest';
import { olderKindOf, kindToSay, olderWords, olderLead, kindOfCheck, kindOfCopy, OLDER_KINDS } from '$lib/ui/ref/older-kind';
import { recordOf } from '$lib/import/commit';
import { FIELD_ENUMS, FIELD_TYPES, readChanges, materialise, live, type Change, type Record_ } from '$core/log';
import { mySpeciesOf } from '$lib/db/species-list';
import { rowsFromPaste } from '$lib/import/rows';
import { parsePaste } from '$lib/import/paste';
import type { Accession } from '$lib/db/types';

describe('r87p older kind 1: read on read', () => {
  it('the two words, and nothing else', () => {
    expect(olderKindOf('gbif')).toBe('gbif');
    expect(olderKindOf('older')).toBe('older');
    for (const x of [undefined, null, '', 'merged', 'GBIF', 'older ', 1, true, {}, ['gbif']]) expect(olderKindOf(x), JSON.stringify(x)).toBeNull();
  });
});

describe('r87p older kind 2: what is said', () => {
  it('the reference\'s answer first, the record where it was not reached, else none', () => {
    expect(kindToSay('older', true)).toBe('gbif');
    expect(kindToSay('gbif', false)).toBe('older');
    expect(kindToSay('gbif', null)).toBe('gbif');
    expect(kindToSay('older', undefined)).toBe('older');
    expect(kindToSay(undefined, null)).toBeNull();
    expect(kindToSay('merged', null)).toBeNull();
  });
  it('the tile\'s words, and the lead words before a link', () => {
    expect(olderWords('Hoodia alstonii', 'gbif')).toBe("GBIF's name for Hoodia alstonii");
    expect(olderWords('Aristaloe aristata', 'older')).toBe('an older name of Aristaloe aristata');
    expect(olderWords('Hoodia alstonii', null)).toBe('the reference files it under Hoodia alstonii');
    expect(olderLead('gbif')).toBe("GBIF's name for");
    expect(olderLead('older')).toBe('An older name of');
    expect(olderLead(null)).toBe('The reference files it under');
    expect(olderLead(null, false)).toBe('the reference files it under');
  });
});

describe('r87p older kind 3: filed with the plant', () => {
  const row = (name: string) => rowsFromPaste(parsePaste(name), { placeId: null, acquired: null, source: null })[0];
  it('an import\'s row of GBIF\'s name records gbif; of an older name, older', () => {
    const g = recordOf(row('Ceropegia alstonii'), { s: 'near', suggestion: 'Hoodia alstonii', key: 9269454, why: 'older name', slug: 'hoodia-alstonii', gbif: true }, null);
    expect(g).toMatchObject({ olderOf: 'Hoodia alstonii', olderKind: 'gbif' });
    const o = recordOf(row('Aloe aristata'), { s: 'near', suggestion: 'Aristaloe aristata', key: 1, why: 'older name', slug: 'aristaloe-aristata' }, null);
    expect(o).toMatchObject({ olderOf: 'Aristaloe aristata', olderKind: 'older' });
  });
  it('no page named, no kind', () => {
    const r = recordOf(row('Aloe nobody'), { s: 'missing' }, null);
    expect(r).not.toHaveProperty('olderOf');
    expect(r).not.toHaveProperty('olderKind');
    expect(recordOf(row('Aloe nobody'), { s: 'near', suggestion: 'Aloe vera', key: 1, why: 'spelling' }, null)).not.toHaveProperty('olderKind');
    expect(kindOfCheck({ s: 'near', why: 'infra' })).toBeNull();
    expect(kindOfCheck(undefined)).toBeNull();
  });
  it('the add form\'s reading of the copy filed under the name', () => {
    const page = { name: 'Hoodia alstonii', slug: 'hoodia-alstonii' };
    expect(kindOfCopy({ slug: 'hoodia-alstonii', name: 'Hoodia alstonii' }, page)).toBe('gbif');
    expect(kindOfCopy(null, page)).toBe('older'); // the group read, no copy
    expect(kindOfCopy('unreached', page)).toBeNull();
    expect(kindOfCopy(undefined, page)).toBeNull();
    expect(kindOfCopy({ slug: 'other', name: 'Other plant' }, page)).toBeNull(); // another page's copy: neither word is known
  });
});

describe('r87p older kind 4: the log', () => {
  it('a string field, its words the type\'s', () => {
    expect(FIELD_TYPES.accession.olderKind).toBe('string');
    expect(FIELD_ENUMS.accession!.olderKind).toEqual([...OLDER_KINDS]);
  });
  const c = (field: string, value: unknown, t: string): Change => ({ t, kind: 'accession', id: 'r1', field, value } as Change);
  it('a change of another type is left out alone; a newer version\'s word is kept', () => {
    const { changes, dropped } = readChanges([c('taxonName', 'Ceropegia alstonii', '1789520000000-0000-aaaaaaaaaaaa'), c('status', 'growing', '1789520000001-0000-aaaaaaaaaaaa'), c('olderKind', 7, '1789520000002-0000-aaaaaaaaaaaa'), c('olderKind', 'merged', '1789520000003-0000-aaaaaaaaaaaa')]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatch(/olderKind/);
    expect(changes.map((x) => x.value)).toEqual(['Ceropegia alstonii', 'growing', 'merged']);
  });
});

describe('r87p older kind 5: a record written before the change', () => {
  /** A plant's changes as the add form of round eighty-six wrote them: `olderOf` and no `olderKind`. */
  const before = (id: string, name: string, olderOf: string, t0: number): Change[] => [
    { t: `${t0}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'taxonName', value: name },
    { t: `${t0 + 1}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'status', value: 'growing' },
    { t: `${t0 + 2}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'acc', value: `2026-000${id.slice(-1)}` },
    { t: `${t0 + 3}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'olderOf', value: olderOf }
  ] as Change[];
  it('folds, reads no kind, and its tile says only that the reference files it under the page', () => {
    const { changes, dropped } = readChanges(before('r1', 'Ceropegia alstonii', 'Hoodia alstonii', 1789520000000));
    expect(dropped).toEqual([]);
    const plants = live<Accession & Record_>(materialise(changes).state, 'accession');
    expect(plants).toHaveLength(1);
    expect(plants[0].olderOf).toBe('Hoodia alstonii');
    expect(plants[0].olderKind).toBeUndefined();
    const s = mySpeciesOf(plants, []).get('ceropegia-alstonii')!;
    expect(s.olderOf).toBe('Hoodia alstonii');
    expect(s).not.toHaveProperty('olderKind');
    expect(olderWords(s.olderOf!, kindToSay(s.olderKind, null))).toBe('the reference files it under Hoodia alstonii');
  });
  // Since the review of stage 1 (M1) the kind is filed with the `olderOf` it was read for (`olderKindOf`), and read only
  // while `olderOf` is still that name: these records are written as this version writes them, the pair together.
  const k = (id: string, v: unknown, t: number, of: string): Change[] => [{ t: `${t}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'olderKind', value: v } as Change, { t: `${t + 1}-0000-aaaaaaaaaaaa`, kind: 'accession', id, field: 'olderKindOf', value: of } as Change];
  it('one written with the kind says it, offline too; one with an unknown word says neither', () => {
    const all = [...before('r1', 'Ceropegia alstonii', 'Hoodia alstonii', 1789520000000), ...k('r1', 'gbif', 1789520000010, 'Hoodia alstonii'), ...before('r2', 'Aloe aristata', 'Aristaloe aristata', 1789520000100), ...k('r2', 'older', 1789520000110, 'Aristaloe aristata'), ...before('r3', 'Aloe brevifolia', 'Aloe brevifolia', 1789520000200), ...k('r3', 'merged', 1789520000210, 'Aloe brevifolia')];
    const { changes } = readChanges(all);
    const sp = mySpeciesOf(live<Accession & Record_>(materialise(changes).state, 'accession'), []);
    expect(olderWords(sp.get('ceropegia-alstonii')!.olderOf!, kindToSay(sp.get('ceropegia-alstonii')!.olderKind, null))).toBe("GBIF's name for Hoodia alstonii");
    expect(olderWords(sp.get('aloe-aristata')!.olderOf!, kindToSay(sp.get('aloe-aristata')!.olderKind, null))).toBe('an older name of Aristaloe aristata');
    expect(sp.get('aloe-brevifolia')).not.toHaveProperty('olderKind');
  });
  it('two plants of one name: the kind from whichever records it', () => {
    const { changes } = readChanges([...before('r1', 'Ceropegia alstonii', 'Hoodia alstonii', 1789520000000), ...before('r2', 'Ceropegia alstonii', 'Hoodia alstonii', 1789520000100), ...k('r2', 'gbif', 1789520000110, 'Hoodia alstonii')]);
    const s = mySpeciesOf(live<Accession & Record_>(materialise(changes).state, 'accession'), []).get('ceropegia-alstonii')!;
    expect(s.grown).toBe(2);
    expect(s.olderKind).toBe('gbif');
  });
});

// The add form's record of the kind is read in the browser (tests/e2e/r87p-pages.spec.ts, 8 and 9).
