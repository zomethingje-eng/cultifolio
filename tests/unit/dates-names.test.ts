import { describe, it, expect } from 'vitest';
import { daysBetween, madeOn, localDate } from '$core/dates';
import { genusOf, speciesOf } from '$core/names';
import { temp, tempN, fixed } from '$core/units';

describe('calendar days (round seven, 3 and 12)', () => {
  it('counts whole calendar days between two local dates, never a day off for the hour or the zone', () => {
    expect(daysBetween('2026-09-25', '2026-09-25')).toBe(0);
    expect(daysBetween('2026-09-24', '2026-09-25')).toBe(1);
    expect(daysBetween('2026-08-25', '2026-09-25')).toBe(31);
    expect(daysBetween('2026-09-25', '2026-09-24')).toBe(-1);
    expect(daysBetween(localDate())).toBe(0);
  });
  it('reads the day a record was made from its id, and refuses an id of another shape', () => {
    const wall = Date.UTC(2026, 8, 25, 12);
    const id = 'r' + wall.toString(36) + '00' + 'abcdefabcdef';
    expect(madeOn(id)).toBe(localDate(new Date(wall)));
    expect(madeOn('legacy-1')).toBeNull();
  });
});

describe('names (round seven, 11)', () => {
  it('strips a hybrid sign but not the X of Xanthosoma', () => {
    expect(genusOf('× Graptoveria')).toBe('Graptoveria');
    expect(genusOf('x Graptoveria')).toBe('Graptoveria');
    expect(genusOf('Xanthosoma sagittifolium')).toBe('Xanthosoma');
    expect(genusOf('Xanthostemon')).toBe('Xanthostemon');
  });
  it('speciesOf drops the rank and the cultivar', () => {
    expect(speciesOf('Ariocarpus retusus subsp. furfuraceus')).toBe('Ariocarpus retusus');
    expect(speciesOf("Haworthia truncata 'Lime Green'")).toBe('Haworthia truncata');
    expect(speciesOf('Lithops')).toBe('Lithops');
  });
});

describe('negative zero (round seven, 6)', () => {
  it('never prints -0', () => {
    expect(fixed(-0.3, 0)).toBe('0');
    expect(fixed(-0.04, 1)).toBe('0.0');
    expect(fixed(-0.6, 0)).toBe('-1');
    expect(temp(-0.2, 'metric')).toBe('0 °C');
    expect(tempN(-0.2, 'metric', 1)).toBe('-0.2');
  });
});

describe('photo sizes (round seven, 17)', () => {
  it('asks iNaturalist and the GBIF cache for the size the place needs, and leaves other hosts alone', async () => {
    const { photoAt } = await import('$dossier/photo-size');
    expect(photoAt('https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpeg', 'small')).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/123/small.jpeg');
    expect(photoAt('https://inaturalist-open-data.s3.amazonaws.com/photos/123/original.jpg', 'large')).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpg');
    expect(photoAt('https://api.gbif.org/v1/image/cache/fit-in/400x/https%3A%2F%2Fx.org%2Fa.jpg', 'small')).toBe('https://api.gbif.org/v1/image/cache/fit-in/160x/https%3A%2F%2Fx.org%2Fa.jpg');
    expect(photoAt('https://upload.wikimedia.org/a.jpg', 'small')).toBe('https://upload.wikimedia.org/a.jpg');
  });
});

describe('index buckets (round nine, 1; round ten, 1)', () => {
  it('is one of 32 buckets by rule, the same for the same slug, all of them used', async () => {
    const { bucketOf, BUCKET, BUCKETS } = await import('$core/bucket');
    expect(BUCKETS).toBe(32);
    expect(bucketOf('copiapoa-cinerea')).toMatch(BUCKET);
    expect(bucketOf('copiapoa-cinerea')).toBe(bucketOf('copiapoa-cinerea'));
    expect(BUCKET.test('20')).toBe(false);
    const seen = new Set(Array.from({ length: 2000 }, (_, i) => bucketOf(`genus-species-${i}`)));
    expect(seen.size).toBe(32);
  });
});
