/**
 * Round sixty-nine, triage-68 K1, K2 and K5: the index's lead and count, and --prune-uncredited, read photographs by the
 * Worker's rules, and the build asks GBIF before Commons. Seams read from the source, as r63c-credit does. Each FAILED on
 * the base (1609c19). Round seventy's merge (C's need; REVIEW-TRIAGE-69 C1, C4): the lead and count are read with the
 * reference's names, as the Worker reads a page, and the build passes them to Commons with the species' key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('the corpus builder uses the photograph rules of the read', () => {
  const s = readFileSync('scripts/build-dossiers.ts', 'utf8');
  it('the index entry leads and counts with shownPhotos', () => {
    expect(s).toMatch(/const shown = shownPhotos\(d\.photos, \{ scientific: d\.name\.scientific, synonyms: d\.name\.synonyms \?\? \[\], key: d\.key, held \}\);\s*const hero = heroOf\(shown\);/);
    expect(s).toContain('photos: shown.length };');
    expect(s).toContain('const held = heldNamesOf(out);');
  });
  it('--prune-uncredited drops by uncreditedPhoto', () => {
    expect(s).toContain('const uncredited = uncreditedPhoto;');
  });
  it('the build asks GBIF before Commons, and passes Commons the species\' names', () => {
    const b = readFileSync('src/lib/dossier/build.ts', 'utf8');
    expect(b.indexOf('const m = await gbif.media(f, key);')).toBeLessThan(b.indexOf('await commons.commonsPhotos('));
    expect(b).toContain("commons.commonsPhotos(f, cat, 12, { scientific, synonyms: syn.status === 'ok' ? syn.data : [], key, held: o.held })");
  });
});
