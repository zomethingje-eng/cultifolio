/**
 * Round sixty-three, after the --index audit on the owner's PC: names that differ only in capitals are one name, and the
 * spelling shown is one a source gave with the fewest capitals after the first letter; an all-lower-case spelling is set
 * aside when another has a capital. The first four cases FAILED before (the most-counted spelling was shown).
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
