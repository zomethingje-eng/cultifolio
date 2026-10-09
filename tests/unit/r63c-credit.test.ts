/**
 * Round sixty-three, C3 (REVIEW-TRIAGE-61's deferred list): the index carries its thumbnail's credit, licence first and
 * short, so a tile names the photographer and the licence and not only the host.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tileCredit, tileCreditOf, photoCredit, TILE_AUTHOR_MAX } from '$lib/ui/ref/head';

describe("a tile's credit from the index", () => {
  it('an iNaturalist line is said licence first, without the source\'s own words', () => {
    expect(tileCreditOf({ attribution: '(c) Jane Doe, some rights reserved (CC BY)', licence: 'by' })).toBe('CC BY, Jane Doe');
    expect(tileCreditOf({ attribution: '(c) Jane Doe, some rights reserved (CC BY-SA)', licence: 'by-sa' })).toBe('CC BY-SA, Jane Doe');
    expect(tileCreditOf({ attribution: 'grower1, no rights reserved (CC0)', licence: 'cc0' })).toBe('CC0, grower1');
  });
  it("the build's GBIF and Commons lines too", () => {
    expect(tileCreditOf({ attribution: 'Jane Doe, CC BY, iNaturalist via GBIF', licence: 'by' })).toBe('CC BY, Jane Doe');
    expect(tileCreditOf({ attribution: 'Museum, Herbarium, CC BY, via GBIF', licence: 'by' })).toBe('CC BY, Museum, Herbarium');
    expect(tileCreditOf({ attribution: 'J. Smith, CC BY-SA 4.0, via Wikimedia Commons', licence: 'by-sa' })).toBe('CC BY-SA, J. Smith');
    expect(tileCreditOf({ attribution: 'J. Smith, PD-self, via Wikimedia Commons', licence: 'cc0' })).toBe('CC0, J. Smith');
    expect(tileCreditOf({ attribution: 'author not stated, CC0, via Wikimedia Commons', licence: 'cc0' })).toBe('CC0, author not stated');
  });
  it('never a wrong licence: a line naming another licence, no licence, or a form the build does not write gives none, and the tile names the source', () => {
    expect(tileCreditOf({ attribution: '(c) Jane Doe, some rights reserved (CC BY-SA)', licence: 'by' })).toBeNull();
    expect(tileCreditOf({ attribution: 'Jane Doe, CC BY, via GBIF', licence: 'by-sa' })).toBeNull();
    expect(tileCreditOf({ attribution: 'Jane Doe', licence: null })).toBeNull();
    expect(tileCreditOf({ attribution: 'Jane Doe took this', licence: 'by' })).toBeNull();
    expect(tileCreditOf({ attribution: '(c) Jane Doe, all rights reserved', licence: 'by' })).toBeNull();
    expect(tileCredit({ thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' })).toBe('Photo: iNaturalist');
  });
  it('a long author is cut at a word, the licence kept', () => {
    const long = 'Natural History Museum of Somewhere Rather Far Away Collections Department';
    const c = tileCreditOf({ attribution: `${long}, CC BY, via GBIF`, licence: 'by' })!;
    expect(c.startsWith('CC BY, Natural History Museum')).toBe(true);
    expect(c.endsWith('…')).toBe(true);
    expect(c.length).toBeLessThanOrEqual('CC BY, '.length + TILE_AUTHOR_MAX + 1);
  });
  it('the tile reads "Photo: <licence>, <author>" where the index has the credit', () => {
    expect(tileCredit({ credit: 'CC BY, Jane Doe', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' })).toBe('Photo: CC BY, Jane Doe'); // base: "CC BY, Jane Doe", with no "Photo:"
  });
  it('the words are the species page\'s for that photograph, shortened: the same author and licence', () => {
    const p = { attribution: '(c) Jane Doe, some rights reserved (CC BY)', licence: 'by' as const };
    expect(photoCredit(p)).toContain('Jane Doe');
    expect(photoCredit(p)).toContain('CC BY');
  });
  it('the build writes it into the index entry from the hero photograph', () => {
    const s = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(s).toContain('const credit = hero ? tileCreditOf(');
    expect(s).toContain('...(credit ? { credit } : {})');
  });
});
