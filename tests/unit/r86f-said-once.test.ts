import { describe, expect, it } from 'vitest';
import { readerWords } from '../../src/lib/ui/ref/words';

// Round eighty-six, the walk's record: the GBIF photographs' source was written twice on about two pages in three.
describe('r86f a record part said twice is said once', () => {
  it('a repeated part is shown once, in its first place', () => {
    const d = 'from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21; from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21; 11 photographs of records GBIF identifies as key 3580743 left out';
    expect(readerWords(d)).toBe('from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21; 11 photographs of records GBIF identifies as key 3580743 left out');
  });
  it('different parts are all kept, in order', () => {
    expect(readerWords('a; b; c')).toBe('a; b; c');
    expect(readerWords(undefined)).toBeUndefined();
    expect(readerWords('')).toBe('');
  });
});
