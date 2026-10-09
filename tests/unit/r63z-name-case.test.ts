/**
 * Round sixty-three, after the --index audits on the owner's PC: names that differ only in capitals are one name, and the
 * spelling shown keeps the capitals a source gave on purpose (a capital in a spelling that leaves another word in lower
 * case) and no others. The first rule (fewest capitals, lower-case spellings set aside) flipped 539 headlines to Title
 * Case where the lower-case spelling had the sources; the last describe's cases FAILED on it.
 */
import { describe, it, expect } from 'vitest';
import { englishNames, type VernacularName } from '$dossier/index-entry';

const eng = (name: string, source: string) => ({ name, lang: 'eng', source }) as VernacularName;
const shown = (vs: VernacularName[]) => englishNames(vs, { genus: 'Onoclea sensibilis' }).common;

describe('a name\'s case is not decided by a Title Case list\'s count', () => {
  it('Sensitive fern, though two checklists list it in Title Case', () => {
    expect(shown([eng('Sensitive fern', 'GBIF Backbone'), eng('Sensitive Fern, Bead fern', "Martha's Vineyard species checklist"), eng('Sensitive Fern', 'TAXREF')])).toBe('Sensitive fern');
  });
  it('China aster keeps the capital a source gave it, and drops the others', () => {
    expect(shown([eng('China aster', 'A'), eng('China Aster', 'B'), eng('China Aster', 'C')])).toBe('China aster');
  });
  it('a lower-case-only list says nothing of a proper noun', () => {
    expect(shown([eng('christmas cactus', 'Belgian Species List'), eng('christmas cactus', 'X'), eng('Christmas cactus', 'Y')])).toBe('Christmas cactus');
  });
  it('the pooled sources still rank the name against other names', () => {
    // Red-osier dogwood (three sources across two spellings) beats American dogwood (two).
    expect(shown([eng('Red-osier Dogwood', 'A'), eng('Red-osier dogwood', 'B'), eng('Red-osier Dogwood', 'C'), eng('American dogwood', 'D'), eng('American dogwood', 'E')])).toBe('Red-osier dogwood');
  });
  it('guard: one spelling, any case, is shown as given (first letter up)', () => {
    expect(shown([eng('Common Christmas Cactus', 'A')])).toBe('Common Christmas Cactus');
    expect(shown([eng('wild cherry', 'A')])).toBe('Wild cherry');
  });
});

describe('a lower-case spelling is a spelling, and a capital counts when a source meant it', () => {
  it('Butterfly milkweed, where the lower-case spelling has the sources and a list gives Title Case', () => {
    expect(shown([eng('butterfly milkweed', 'A'), eng('butterfly milkweed', 'B'), eng('Pleurisy root, Butterfly Milkweed', 'C'), eng('Butterfly Milkweed', 'D'), eng('Butterfly Milkweed', 'E')])).toBe('Butterfly milkweed');
  });
  it('Snow-on-the-mountain, though a source writes every word up', () => {
    expect(shown([eng('Snow-On-The-Mountain', 'A'), eng('Snow-On-The-Mountain', 'B'), eng('snow-on-the-mountain', 'C')])).toBe('Snow-on-the-mountain');
  });
  it('Herb Robert keeps the capital a source gave on purpose', () => {
    expect(shown([eng('herb robert', 'A'), eng('herb robert', 'B'), eng('herb Robert', 'C'), eng('Herb Robert', 'D')])).toBe('Herb Robert');
  });
});
