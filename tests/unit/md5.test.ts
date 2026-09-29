import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { md5, gbifThumb, mendGbifThumb } from '$dossier/md5';
import { photosFromMedia } from '$dossier/build';
import { parseDossier } from '$dossier/schema';

const URL_ = 'https://bs.plantnet.org/image/o/94763d27d0c70f4643f5bd80b300f06983bbab04';

describe("GBIF's image cache by occurrence and hash (round thirty-two, 1)", () => {
  it('md5 agrees with node across block boundaries and non-ASCII', () => {
    for (const s of ['', 'a', 'abc', 'message digest', URL_, 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'ü'.repeat(100), 'y'.repeat(1000)]) expect(md5(s)).toBe(createHash('md5').update(s).digest('hex'));
  });
  it('a GBIF photograph gets the occurrence form, as checked against the live cache', () => {
    // https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/5110124591/media/85e60ddcfd6be8327188d4c177ccf30b answered image/jpeg on 2026-09-29; the bare form answered 400
    expect(gbifThumb(5110124591, URL_)).toBe('https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/5110124591/media/85e60ddcfd6be8327188d4c177ccf30b');
    const [p] = photosFromMedia([{ id: '5110124591:0', url: URL_, licence: 'by-sa', creator: 'jeanne de klerk', page: 'https://www.gbif.org/occurrence/5110124591' }]);
    expect(p.thumb).toBe(gbifThumb(5110124591, URL_));
    // iNaturalist keeps its own sizes
    const [q] = photosFromMedia([{ id: '7:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/12/original.jpeg', licence: 'cc0', page: undefined }]);
    expect(q.thumb).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/12/medium.jpeg');
  });
  it('a dossier built with the bare form is mended as it is read, so the corpus shows its photographs before the rebuild', async () => {
    const old = `https://api.gbif.org/v1/image/cache/fit-in/400x/${encodeURIComponent(URL_)}`;
    expect(mendGbifThumb(old, '5110124591:0', URL_)).toBe(gbifThumb(5110124591, URL_));
    expect(mendGbifThumb(old, 'inat-1', URL_)).toBe(old); // no occurrence key to go by
    expect(mendGbifThumb('https://inaturalist-open-data.s3.amazonaws.com/photos/12/medium.jpeg', '7:0', URL_)).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/12/medium.jpeg');
    const fixture = JSON.parse(JSON.stringify((await import('../../fixtures/dossiers/s/v2/5384013.json')).default)) as { photos: Array<Record<string, unknown>> };
    fixture.photos = [{ src: 'gbif', id: '5110124591:0', url: URL_, thumb: old, licence: 'by-sa', attribution: 'jeanne de klerk, CC BY-SA, via GBIF' }];
    const d = parseDossier(fixture);
    expect(d?.photos[0].thumb).toBe(gbifThumb(5110124591, URL_));
  });
});
