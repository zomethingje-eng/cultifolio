/**
 * Round seventy-one, agent F (REVIEW-TRIAGE-70, pages; S-F4 to S-F7, S-F12): the words a first visitor reads. Each test
 * fails on r71base unless marked a guard.
 */
import { describe, it, expect } from 'vitest';
import { photoSourceGaps } from '$lib/ui/ref/photos';
import { tileCreditOf, groupLine, noneInRange, kewCitedNote } from '$lib/ui/ref/head';
import { prepare, search } from '$core/search';

describe('S-F5: iNaturalist is not "not asked" when its photographs answered', () => {
  // Pseudobombax calcicola's live record (2026-10-15): the taxon row carried as skipped by a rederive, the photograph rows
  // answered "nothing to report" by the fill of 2026-09-20. The page said "Photographs not checked: iNaturalist was skipped".
  const up = { 'inat.taxon': { status: 'skipped', detail: 'carried from build of 2026-09-20 (rederive)' }, 'inat.photos.wild': { status: 'none' }, 'inat.photos.cultivated': { status: 'none' }, commons: { status: 'none' }, 'gbif.media': { status: 'none' } };
  it('Pseudobombax calcicola: no gap', () => expect(photoSourceGaps(up, 0)).toBeNull());
  it('guard: photograph rows not asked are still said as that', () => {
    expect(photoSourceGaps({ ...up, 'inat.photos.wild': { status: 'skipped' }, 'inat.photos.cultivated': { status: 'skipped' } }, 0)?.clause).toBe('iNaturalist was skipped (not asked)');
    expect(photoSourceGaps({ ...up, commons: { status: 'refused' } }, 0)?.clause).toBe('Wikimedia Commons refused');
  });
});

describe('S-F6: a tile names the licence of an iNaturalist CC0 photograph', () => {
  it('Geissorhiza aspera\'s lead, "no rights reserved" under CC0, is "CC0"', () => expect(tileCreditOf({ attribution: 'no rights reserved', licence: 'cc0' })).toBe('CC0'));
  it('guard: an author\'s line is cut as before, and a line naming no one under CC BY still names the source', () => {
    expect(tileCreditOf({ attribution: '(c) Sam McCarren, some rights reserved (CC BY)', licence: 'by' })).toBe('CC BY, Sam McCarren');
    expect(tileCreditOf({ attribution: 'no rights reserved', licence: 'by' })).toBeNull();
  });
});

describe('S-F7: the header group is the table\'s listing, not what the plant is', () => {
  it('Euphorbia peplus: "listed by its genus as a cactus or succulent"', () => {
    expect(groupLine({ arch: { lab: 'Cactus or succulent' }, tier: 'genus' })).toBe('listed by its genus as a cactus or succulent');
    expect(groupLine({ arch: { lab: 'Bulb, tuber or caudex' }, tier: 'family' })).toBe('listed by its family as a bulb, tuber or caudex');
  });
});

describe('S-F4: a range every record lies outside', () => {
  it('Ixora coccinea: the 1,749 records outside are counted and the disagreement said', () => {
    const t = noneInRange(1749).text;
    expect(t).toMatch(/all 1749 georeferenced records read lie outside it: the range and the records disagree/);
    expect(noneInRange(1).text).toMatch(/the one georeferenced record read lies outside it/);
  });
  it('guard: no records at all reads as before', () => expect(noneInRange(0).text).toBe('No georeferenced records inside the stated native range.'));
});

describe('S-F12: an older name typed whole, held exactly, before a genus reached by its start', () => {
  const e = (key: number, name: string, syn: string[] = []) => ({ key, name, family: 'X', syn });
  const P = prepare([e(1, 'Tecomanthe speciosa'), e(2, 'Campsis radicans', ['Tecoma radicans', 'Tecoma speciosa']), e(3, 'Nepenthes mirabilis'), e(4, 'Nepenthes alata', ['Nepenthes mira'])]);
  it('"Tecoma speciosa" is Campsis radicans first', () => expect(search(P, 'Tecoma speciosa').map((x) => x.name)).toEqual(['Campsis radicans', 'Tecomanthe speciosa']));
  it('guard: a genus typed whole keeps its place ("Nepenthes mira" is N. mirabilis first)', () => expect(search(P, 'Nepenthes mira')[0].name).toBe('Nepenthes mirabilis'));
  it('guard: words typed in another order keep round seventy\'s answer ("Stramonium datura" is Datura stramonium)', () => {
    const Q = prepare([e(1, 'Datura stramonium'), e(2, 'Datura metel', ['Stramonium datura'])]);
    expect(search(Q, 'Stramonium datura')[0].name).toBe('Datura stramonium');
  });
  it('guard: a name still being typed by the genus\'s start finds it ("tecom spec")', () => expect(search(P, 'tecom spec').map((x) => x.name)).toContain('Tecomanthe speciosa'));
});

describe('agent B\'s need (S-B2): a name cited as Kew accepts it says why under the name', () => {
  it('Rubus parviflorus on GBIF\'s homonym key', () => {
    const d = "GBIF's key 7872219 is Rubus parviflorus Kük.; Kew accepts Rubus parviflorus Nutt., and the name is cited as Kew accepts it";
    expect(kewCitedNote({ 'gbif.species': { detail: d } })).toBe(`${d}.`);
  });
  it('guard: any other record says nothing', () => expect(kewCitedNote({ 'gbif.species': { detail: 'carried from build of 2026-09-30' } })).toBeNull());
});
