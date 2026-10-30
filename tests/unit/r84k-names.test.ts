/**
 * Round eighty-four (K): the names a grower types.
 *
 * - S3 (review-s): a cultivar in any quotes is a cultivar, a phone's ’…’ and “…” included.
 * - S9 (review-s): quotes around the whole name are punctuation, as the catalogue's search reads them.
 * - W5 (review-w) and A9 (outside review A): a cultivar under a genus with no species is "a cultivar, species not stated",
 *   never a hybrid; a cross, a nothogenus, or "Genus × 'Name'" is still a hybrid.
 * - The import files and says the same (`recordOf`, `ownVerdict`, `checkNames`, `parsePaste`), and an older name found by
 *   the search carries its page's address for the plant page's line (W6).
 * - A16 (outside review A): the add form's toast says a watering line that was not saved.
 *
 * FAILS on r84base: every `it` below (base: ’Gollum’ is no cultivar, "Echeveria 'Lola'" is a hybrid, `"Haworthia cooperi"`
 * a cultivar of no genus, `speciesNotStated`, `ownVerdict` and `addedWords` do not exist, `readSearch` gives no slug).
 */
import { describe, it, expect } from 'vitest';
import { parseName, speciesNotStated } from '../../src/lib/core/names';
import { recordOf } from '../../src/lib/import/commit';
import { checkNames, ownVerdict, readSearch, nameVerdict, type Lookup } from '../../src/lib/import/check';
import { parsePaste } from '../../src/lib/import/paste';
import { blankRow } from '../../src/lib/import/plan';
import { addedWords } from '../../src/lib/ui/added-words';

describe('a cultivar in any quotes (S3)', () => {
  for (const [open, close] of [["'", "'"], ['‘', '’'], ['’', '’'], ['“', '”'], ['"', '"'], ['”', '”']]) {
    it(`Crassula ovata ${open}Gollum${close} is a cultivar of Crassula ovata`, () => {
      expect(parseName(`Crassula ovata ${open}Gollum${close}`)).toMatchObject({ scientific: 'Crassula ovata', epithet: 'ovata', cultivar: 'Gollum', kind: 'cultivar' });
    });
  }
  it('a phone\'s quotes after "cv." and around a name with an apostrophe', () => {
    expect(parseName('Echeveria cv. ’Lola’')).toMatchObject({ scientific: 'Echeveria', cultivar: 'Lola', kind: 'cultivar' });
    expect(parseName('Crassula ’Buddha’s Temple’')).toMatchObject({ scientific: 'Crassula', cultivar: 'Buddha’s Temple', kind: 'cultivar' });
  });
  it('an apostrophe inside a word opens no cultivar', () => {
    expect(parseName("St. John’s wort 'Hidcote'").cultivar).toBe('Hidcote');
  });
});

describe('quotes around the whole name (S9)', () => {
  it('are punctuation: the species inside is read', () => {
    for (const q of ['"Haworthia cooperi"', '“Haworthia cooperi”', '’Haworthia cooperi’', "'Haworthia cooperi'"]) {
      expect(parseName(q)).toMatchObject({ scientific: 'Haworthia cooperi', genus: 'Haworthia', epithet: 'cooperi', kind: 'species' });
      expect(parseName(q).cultivar).toBeUndefined();
    }
  });
});

describe('a cultivar under a genus alone (W5, A9)', () => {
  it('is a cultivar, species not stated, filed under the genus', () => {
    for (const n of ["Echeveria 'Lola'", 'Echeveria ’Lola’', "Philodendron 'Pink Princess'", "Crassula 'Buddha's Temple'", 'Echeveria “Perle von Nürnberg”']) {
      const p = parseName(n);
      expect(p.kind, n).toBe('cultivar');
      expect(p.scientific, n).toBe(n.split(' ')[0]);
      expect(p.parentage, n).toBeUndefined();
      expect(speciesNotStated(p), n).toBe(true);
    }
  });
  it('a cultivar of a named species states its species', () => {
    expect(speciesNotStated(parseName("Haworthia truncata 'Lime Green'"))).toBe(false);
  });
  it('a cross, a nothogenus and "Genus × \'Name\'" are hybrids, as before', () => {
    expect(parseName("Echeveria gibbiflora × Echeveria potosina 'Perle von Nürnberg'")).toMatchObject({ kind: 'hybrid', parentage: 'Echeveria gibbiflora × Echeveria potosina' });
    expect(parseName("x Graptoveria 'Fred Ives'")).toMatchObject({ kind: 'hybrid', scientific: '× Graptoveria', cultivar: 'Fred Ives' });
    expect(parseName("Echeveria × 'Blue Curls'")).toMatchObject({ kind: 'hybrid', scientific: 'Echeveria', cultivar: 'Blue Curls' });
    expect(parseName("Echeveria × 'Blue Curls'").parentage).toBeUndefined();
  });
});

describe('the import files and says the same', () => {
  it('a line "Philodendron \'Pink Princess\'" is filed as a cultivar, not a hybrid', () => {
    const rec = recordOf(blankRow('k', 1, "Philodendron 'Pink Princess'"), undefined, null);
    expect(rec).toMatchObject({ taxonName: 'Philodendron', cultivar: 'Pink Princess', nameKind: 'cultivar', parentage: null });
    // A kind the sheet states stands.
    expect(recordOf({ ...blankRow('k', 1, "Echeveria 'Lola'"), nameKind: 'hybrid' }, undefined, null).nameKind).toBe('hybrid');
  });
  it('a pasted cultivar cell in a phone\'s quotes is read without them', () => {
    expect(parsePaste('Crassula ovata; ’Gollum’\nEcheveria; “Lola”').map((l) => l.cultivar)).toEqual(['Gollum', 'Lola']);
  });
  it('each line of a genus says what it is, whatever another line of that genus is', async () => {
    expect(ownVerdict("Echeveria 'Lola'")).toEqual({ s: 'genus' });
    expect(ownVerdict('Echeveria gibbiflora × Echeveria potosina')).toEqual({ s: 'hybrid' });
    expect(ownVerdict("Echeveria 'Lola'", 'hybrid')).toEqual({ s: 'hybrid' });
    expect(ownVerdict('Echeveria elegans')).toBeNull();
    expect(nameVerdict({ s: 'genus' }, "Echeveria 'Lola'")).toBe('genus');
    // Nothing is asked of the reference for either.
    const asked: string[] = [];
    const look: Lookup = { entries: async (s) => { asked.push(...s); return new Map(); }, search: async (q) => { asked.push(q); return []; } };
    const got = await checkNames(["Echeveria 'Lola'"], look);
    expect(got.get('Echeveria')).toEqual({ s: 'genus' });
    expect(asked).toEqual([]);
  });
  it('an older name the search finds carries its page\'s address (W6)', () => {
    const r = readSearch('Aloe aristata', true, [{ slug: 'aristaloe-aristata', name: 'Aristaloe aristata', gbif: 2777000, syn: ['Aloe aristata'] }]);
    expect(r).toEqual({ s: 'near', suggestion: 'Aristaloe aristata', key: 2777000, why: 'older name', slug: 'aristaloe-aristata' });
  });
});

describe('the add form\'s toast (A16)', () => {
  it('says "added" alone when every line was written', () => {
    expect(addedWords({ count: 1, firstId: '2026-0004', waterFailed: null })).toBe('2026-0004 added');
    expect(addedWords({ count: 3, firstId: '2026-0004', waterFailed: null })).toBe('3 plants added');
  });
  it('says the watering line that was not written, and why', () => {
    expect(addedWords({ count: 1, firstId: '2026-0004', waterFailed: 'The device is out of space.' })).toBe('2026-0004 added, but its last watering was not saved (The device is out of space). Record it on its page.');
    expect(addedWords({ count: 2, firstId: '2026-0004', waterFailed: '' })).toBe("2 plants added, but their last watering was not saved. Record it on each plant's page.");
  });
});
