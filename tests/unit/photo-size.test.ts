import { describe, it, expect } from 'vitest';
import { shownAt, photoHosts } from '$dossier/photo-size';

describe('the address a photograph is loaded from (round fifty-nine)', () => {
  it('keeps the three named hosts, and shows any other through its GBIF thumbnail', () => {
    const inat = 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg';
    const commons = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg';
    const gbif = 'https://api.gbif.org/v1/image/cache/fit-in/500x/abc';
    expect(shownAt({ url: inat, thumb: 'x' })).toBe(inat);
    expect(shownAt({ url: commons, thumb: 'x' })).toBe(commons);
    expect(shownAt({ url: gbif, thumb: 'x' })).toBe(gbif);
    // A dataset's own server: the page says nothing of it, so the photograph comes from GBIF's cache
    expect(shownAt({ url: 'http://images.some-herbarium.org/1.jpg', thumb: gbif })).toBe(gbif);
    expect(photoHosts([shownAt({ url: 'http://images.some-herbarium.org/1.jpg', thumb: gbif })])).toEqual(['https://api.gbif.org']);
  });
});
