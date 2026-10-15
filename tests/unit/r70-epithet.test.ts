/** Round seventy, before the round: the one spelling rule (`dossier/epithet.ts`). Each "one" pair is a case the reviews or the corpus hold; each "two" pair is a pair of accepted species the round sixty-nine rules read as one. */
import { describe, it, expect } from 'vitest';
import { spellingKey, sameSpelling } from '$dossier/epithet';

describe('spellingKey', () => {
  it('one name: gender, genitive, "ae", hyphens', () => {
    for (const [a, b] of [['nudicaulis', 'nudicaule'], ['congoensis', 'congoense'], ['niger', 'nigra'], ['nigrum', 'niger'], ['marlothii', 'marlothi'], ['caerulea', 'cerulea'], ['uva-ursi', 'uvaursi'], ['nana', 'nanus'], ['rosea', 'roseum']]) expect(sameSpelling(a, b), `${a} ${b}`).toBe(true);
  });
  it('two names: a letter changed inside the word', () => {
    for (const [a, b] of [['minimum', 'minutum'], ['macrophylla', 'microphylla'], ['scheeri', 'schereri'], ['saccharinum', 'saccharum'], ['suberosa', 'tuberosa'], ['bifolia', 'unifolia']]) expect(sameSpelling(a, b), `${a} ${b}`).toBe(false);
  });
  it('a short epithet keeps its ending', () => {
    expect(spellingKey('ora')).toBe('ora');
  });
});

describe('round seventy-b, the merge', () => {
  it('a comparative and its genitive are two names (Ceropegia ciliatior, Ceropegia ciliatioris)', () => {
    expect(sameSpelling('ciliatior', 'ciliatioris')).toBe(false);
    expect(sameSpelling('ciliatioris', 'ciliatioris')).toBe(true);
  });
});
