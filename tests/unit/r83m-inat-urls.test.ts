/**
 * Round eighty-three, M (the live check of 29 October): iNaturalist's photograph 1223631 (Aciphylla aurea) is a file with
 * no extension, `photos/1223631/square.`; the builder wrote it as `photos/1223631/square./large.jpg` (404), and the live
 * check failed on the front page's Aciphylla row. The builder now keeps the extension as written (none), the size regex
 * reads an empty extension, and `--fill inat-urls` mends the addresses already on disk. FAILED on r83b: inatBase did not
 * exist; photoAt left `…/medium.` as it was; the builder's address.
 */
import { describe, it, expect } from 'vitest';
import { inatBase, mendInatUrl, mendInatPhotos } from '$dossier/inat-urls';
import { photoAt } from '$dossier/photo-size';

const S3 = 'https://inaturalist-open-data.s3.amazonaws.com/photos';

describe("an iNaturalist photograph whose file has no extension", () => {
  it('the base and the extension as written', () => {
    expect(inatBase(`${S3}/1223631/square.`)).toEqual({ base: `${S3}/1223631`, ext: '' });
    expect(inatBase(`${S3}/248301053/square.jpeg`)).toEqual({ base: `${S3}/248301053`, ext: 'jpeg' });
    expect(inatBase(`https://static.inaturalist.org/photos/77/square.JPG?1380000000`)).toEqual({ base: 'https://static.inaturalist.org/photos/77', ext: 'JPG' });
    expect(inatBase('https://example.org/x.jpg')).toBeNull();
  });
  it('an address written the broken way is mended; a right one is left', () => {
    expect(mendInatUrl(`${S3}/1223631/square./large.jpg`)).toBe(`${S3}/1223631/large.`);
    expect(mendInatUrl(`${S3}/1223631/square./medium.jpg`)).toBe(`${S3}/1223631/medium.`);
    expect(mendInatUrl(`${S3}/248301053/large.jpeg`)).toBe(`${S3}/248301053/large.jpeg`);
    const photos = [{ url: `${S3}/1223631/square./large.jpg`, thumb: `${S3}/1223631/square./medium.jpg` }, { url: `${S3}/1/large.jpg`, thumb: `${S3}/1/medium.jpg` }];
    expect(mendInatPhotos(photos)).toBe(2);
    expect(photos[0]).toEqual({ url: `${S3}/1223631/large.`, thumb: `${S3}/1223631/medium.` });
    expect(mendInatPhotos(photos)).toBe(0); // a second run changes nothing
  });
  it('photoAt sizes an address with no extension', () => {
    expect(photoAt(`${S3}/1223631/medium.`, 'square')).toBe(`${S3}/1223631/square.`);
    expect(photoAt(`${S3}/248301053/medium.jpeg`, 'small')).toBe(`${S3}/248301053/small.jpeg`);
  });
});

import { photos } from '$dossier/sources/inat';
import type { JsonFetcher } from '$dossier/fetch';

describe("the builder writes the sizes as the file is named", () => {
  it('a photograph with no extension: large. and medium., never square./large.jpg', async () => {
    const obs = { id: 1, quality_grade: 'research', captive: false, taxon: { id: 9, name: 'Aciphylla aurea', rank: 'species' }, user: { login: 'cmeurk', name: 'Colin Meurk' }, photos: [{ id: 1223631, license_code: 'cc-by-sa', url: `${S3}/1223631/square.`, attribution: '(c) Colin Meurk, some rights reserved (CC BY-SA)' }] };
    const f = (async () => ({ status: 'ok', data: { total_results: 1, results: [obs] } })) as unknown as JsonFetcher;
    const r = await photos(f, 9, true);
    const got = r.status === 'ok' ? (r.data as { photos?: Array<{ url: string; thumb: string }> }).photos ?? (r.data as unknown as Array<{ url: string; thumb: string }>) : [];
    expect(JSON.stringify(got)).toContain(`${S3}/1223631/large."`);
    expect(JSON.stringify(got)).toContain(`${S3}/1223631/medium."`);
    expect(JSON.stringify(got)).not.toContain('square./');
  });
});
