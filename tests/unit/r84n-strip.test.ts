/**
 * Round eighty-four (N): the front page's photograph strip comes from the "Popular genera" (the owner's decision 4; outside
 * review A: the strip featured wild Rosa mollis and Rubus arcticus, the species with the most wild records of the genera
 * with the most photographed species). Of the popular genera, most grown first, each by its species most observed in
 * cultivation (`scripts/species-list.txt`'s iNaturalist count), then the most photographed, one a genus, 48 in all; still
 * a species photographed eight times or more, with a habitat climate. The build reads the two files (`grownRule` in the
 * build script) and writes `featured.json` with it (`buildProducts`); a corpus read without them keeps the rule before.
 *
 * FAILS on r84base: `featuredPoolOf` reads no rule, and the strip is Rosa mollis first (most wild records), from the genera
 * with the most photographed species.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { featuredPoolOf, type Item } from '$dossier/catalogue';
import { buildProducts } from '$dossier/products';
import { parseMostGrown, openingGenera } from '$lib/ui/ref/most-grown-rule';
import type { IndexEntry } from '$dossier/index-entry';

let n = 0;
const it_ = (name: string, o: Partial<Item> = {}): Item => ({ key: `k${++n}` as Item['key'], slug: name.toLowerCase().replace(/ /g, '-'), name, origin: [], thumb: `https://example.org/${n}.jpg`, photos: 20, open: 10, climate: 'ok', ...o });

describe('the strip from the popular genera (decision 4)', () => {
  const rosaMollis = it_('Rosa mollis', { open: 900, photos: 50 });
  const rosaRugosa = it_('Rosa rugosa', { open: 40, photos: 91, common: 'Japanese rose' });
  const rosaNoClimate = it_('Rosa chinensis', { climate: 'none' });
  const salvia = it_('Salvia rosmarinus', { open: 300, photos: 75, common: 'Rosemary' });
  const salviaWild = it_('Salvia reflexa', { open: 5000, photos: 103 });
  const rubus = it_('Rubus arcticus', { open: 3000, photos: 60 });
  const fewPhotos = it_('Aloe vera', { photos: 7 });
  const list = [rosaMollis, rosaRugosa, rosaNoClimate, salvia, salviaWild, rubus, fewPhotos];
  const species = new Map([[rosaRugosa.key, 8349], [rosaMollis.key, 12], [rosaNoClimate.key, 99999], [salvia.key, 40742], [salviaWild.key, 2], [fewPhotos.key, 40042]]);

  it('most grown genus first, its species most observed in cultivation, one a genus; climate and eight photographs still asked', () => {
    const pool = featuredPoolOf(list, { genera: ['Rosa', 'Salvia', 'Aloe', 'Ficus'], species });
    expect(pool.map((c) => c.name)).toEqual(['Rosa rugosa', 'Salvia rosmarinus']);
  });
  it('a species with no count of its own: the most photographed of the genus', () => {
    expect(featuredPoolOf(list, { genera: ['Salvia'] }).map((c) => c.name)).toEqual(['Salvia reflexa']);
  });
  it('without the rule, as before (guard: a corpus read without the files)', () => {
    expect(featuredPoolOf([rosaMollis, rosaRugosa]).map((c) => c.name)).toEqual(['Rosa mollis']);
  });
  it('the real popular genera begin with the ones growers grow', () => {
    const m = parseMostGrown(readFileSync('scripts/most-grown-genera.txt', 'utf8'));
    const g = openingGenera(m, [...m.counts.keys()]).genera;
    expect(g.slice(0, 4)).toEqual(['Rosa', 'Salvia', 'Prunus', 'Acer']);
  });
  it('buildProducts writes featured.json by the rule it is given', () => {
    const idx = list.map((c, i) => ({ ...c, family: 'Rosaceae', origin: [], photos: c.photos ?? 0, open: c.open, climate: c.climate ?? 'none', key: `k${i + 1}` })) as unknown as IndexEntry[];
    const counts = new Map([...species].map(([k, v]) => [k, v]));
    const p = buildProducts(idx, JSON.stringify(idx), () => new Map(), '2026-10-30T00:00:00Z', [], undefined, undefined, { grown: { genera: ['Rosa', 'Salvia'], species: counts } });
    expect((JSON.parse(p.files.get('featured.json')!) as Array<{ name: string }>).map((f) => f.name)).toEqual(['Rosa rugosa', 'Salvia rosmarinus']);
  });
});
