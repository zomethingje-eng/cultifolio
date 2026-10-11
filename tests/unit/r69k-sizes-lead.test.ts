/**
 * Round sixty-nine, triage-68 K4 (Commons sizes; R46-9) and K5 (the lead photograph; S-B2, R46-16), with K1's rule that
 * a Commons file never leads a dossier that has a photograph of its own. Each case FAILED on the base (1609c19) unless
 * it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { photoAt, srcsetOf, shownAt } from '$dossier/photo-size';
import { heroOf } from '$dossier/dedupe';
import { safeUrls } from '$dossier/schema';

const C = 'https://upload.wikimedia.org/wikipedia/commons';
const T500 = `${C}/thumb/f/f6/Nepenthes_dubia.jpg/500px-Nepenthes_dubia.jpg`;
const T960 = `${C}/thumb/f/f6/Nepenthes_dubia.jpg/960px-Nepenthes_dubia.jpg`;
const ORIG = `${C}/f/f6/Nepenthes_dubia.jpg`;

describe('K4: Commons photographs at the size the slot needs', () => {
  it('a 40-pixel row and a 56-pixel genus thumbnail take the 120, a front-page tile the 250', () => {
    expect(photoAt(T500, 'square')).toBe(`${C}/thumb/f/f6/Nepenthes_dubia.jpg/120px-Nepenthes_dubia.jpg`);
    expect(photoAt(T500, 'small')).toBe(`${C}/thumb/f/f6/Nepenthes_dubia.jpg/250px-Nepenthes_dubia.jpg`);
    expect(photoAt(T500, 'medium')).toBe(T500); // guard
  });
  it('never a width wider than the one kept, which Commons may not have (guard), and an original is left as it is (guard)', () => {
    expect(photoAt(T500, 'large')).toBe(T500);
    expect(photoAt(ORIG, 'square')).toBe(ORIG);
    expect(srcsetOf(ORIG, ['medium', 'large'])).toBeUndefined();
  });
  it('the lead gets a 500w/960w srcset, and the phone\'s source the 500', () => {
    expect(srcsetOf(T960, ['medium', 'large'])).toBe(`${T500} 500w, ${T960} 960w`);
    expect(photoAt(T960, 'medium')).toBe(T500);
    expect(photoAt(T960, 'large')).toBe(T960); // guard
  });
  it('a long file name keeps the name Commons gave its thumbnail', () => {
    expect(photoAt(`${C}/thumb/a/ab/${'L'.repeat(200)}.jpg/960px-thumbnail.jpg`, 'small')).toBe(`${C}/thumb/a/ab/${'L'.repeat(200)}.jpg/250px-thumbnail.jpg`);
  });
  it('a file 501 to 960 pixels wide leads at its own width, not stretched from its 500-pixel tile', () => {
    expect(shownAt({ url: ORIG, thumb: T500, width: 555 })).toBe(ORIG);
    expect(shownAt({ url: ORIG, thumb: T500, width: 960 })).toBe(ORIG);
    expect(shownAt({ url: ORIG, thumb: T500, width: 4000 })).toBe(T500); // guard: an original wider than that is never loaded
    expect(shownAt({ url: ORIG, thumb: ORIG, width: 400 })).toBe(ORIG); // guard
  });
  it('iNaturalist and GBIF keep their own sizes (guard)', () => {
    expect(photoAt('https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg', 'square')).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg');
    expect(photoAt('https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/1/media/ab', 'small')).toBe('https://api.gbif.org/v1/image/cache/fit-in/160x/occurrence/1/media/ab');
  });
});

const inat = (id: string, captive: boolean) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: '(c) A, some rights reserved (CC BY)', captive });
const gbif = (id: string) => ({ src: 'gbif', id: `${id}:0`, url: `https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/${id}/media/ab`, thumb: `https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/${id}/media/ab`, licence: 'by', attribution: 'B, CC BY, via GBIF' });
const commons = (title: string) => ({ src: 'commons', id: `File:${title}`, url: `${C}/thumb/a/ab/${encodeURIComponent(title)}/960px-${encodeURIComponent(title)}`, thumb: T500, width: 3000, licence: 'by-sa', attribution: 'C, CC BY-SA 4.0, via Wikimedia Commons' });

describe('K5: the lead is ranked by source: wild iNaturalist, GBIF, cultivated iNaturalist, Commons', () => {
  it('a Commons file never leads a dossier with a photograph of its own, in whatever order the build wrote them', () => {
    const c = commons('Nepenthes dubia 1.jpg');
    expect(heroOf([c, gbif('9')])?.src).toBe('gbif');
    expect(heroOf([gbif('9'), c])?.src).toBe('gbif'); // guard
    expect(heroOf([c, inat('5', true)])?.id).toBe('5');
  });
  it('GBIF before cultivated iNaturalist, wild iNaturalist before both', () => {
    expect(heroOf([inat('5', true), gbif('9')])?.src).toBe('gbif');
    expect(heroOf([commons('Nepenthes dubia 1.jpg'), inat('5', true), gbif('9'), inat('6', false)])?.id).toBe('6');
  });
  it('a dossier of Commons files alone is led by the first (guard), and a still image over a GIF (guard)', () => {
    expect(heroOf([commons('A.jpg'), commons('B.jpg')])?.id).toBe('File:A.jpg');
    expect(heroOf([{ ...inat('7', false), url: 'https://example.org/a.gif' }, gbif('9')])?.src).toBe('gbif');
  });
  it('a page whose dossier has only Commons files leads with one that holds the species\' epithet, and never with a map', () => {
    const d = { name: { scientific: 'Gasteria glomerata', synonyms: [], vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: [commons('1 Gasteria species - Distribution map.jpg'), commons('DSC_0001.JPG'), commons('Gasteria glomerata, Kirstenbosch.jpg')] };
    expect(heroOf(safeUrls(d as never).photos)?.id).toBe('File:Gasteria glomerata, Kirstenbosch.jpg');
  });
  it('the index takes its lead and count by the page\'s rule', async () => {
    const { leadOf, shownPhotos } = await import('$dossier/photo-kind');
    const photos = [commons('Nepenthes tenuis1.jpg'), commons('Nepenthes dubia 1.jpg'), inat('5', true)];
    const names = { scientific: 'Nepenthes dubia', synonyms: [] };
    expect(leadOf(photos, names)?.id).toBe('5');
    expect(shownPhotos(photos, names)).toHaveLength(2);
    const d = { name: { ...names, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos };
    expect(heroOf(safeUrls(d as never).photos)?.id).toBe(leadOf(photos, names)?.id);
  });
});
