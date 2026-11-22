/**
 * Round 109 (the first hand-off's round 6; docs/PLAN-109.md): the photographs copied to the site's own bucket. What this
 * proves:
 *
 * 1. The copy's path (`imgKey`) for real addresses of each host the reference's photographs are on, ending in an image's
 *    extension (Cloudflare caches by extension), with characters a Windows file name holds, and the same address always
 *    giving the same path.
 * 2. The list of copies (`pageWanted`, `rowWanted`) holds every address the species page and an index row ask, at each
 *    size each place asks: the gallery's thumbnail, the strip's small, the lead's medium and large and its srcset.
 * 3. A new place in src/ that calls the photograph functions fails here until img-wanted.ts is read for it.
 *
 * On 32d681f there is no src/lib/core/img.ts nor src/lib/dossier/img-wanted.ts: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { imgKey, imgUrl, fnv64, IMG_ORIGIN } from '$core/img';
import { pageWanted, rowWanted } from '$dossier/img-wanted';
import { parseDossier } from '$dossier/schema';
import { photoAt, photoOf, srcsetOf, shownAt } from '$dossier/photo-size';
import { heroOf } from '$dossier/dedupe';

const INAT = 'https://inaturalist-open-data.s3.amazonaws.com/photos/32514567/medium.jpeg';
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Homalomena_occulta_-_Saigon_Zoo_and_Botanical_Gardens_-_Ho_Chi_Minh_City%2C_Vietnam_-_DSC01251.JPG/500px-Homalomena_occulta_-_Saigon_Zoo_and_Botanical_Gardens_-_Ho_Chi_Minh_City%2C_Vietnam_-_DSC01251.JPG';
const GBIF = 'https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/5109709263/media/b549f7f9b18ca604a2acb3098b248fef';

describe('r109a the copy of a photograph, by its address', () => {
  it('iNaturalist: by photo id and size, both its hosts, the extension lower-cased, jpg where none is given', () => {
    expect(imgKey(INAT)).toBe('inat/32514567/medium.jpeg');
    expect(imgKey('https://static.inaturalist.org/photos/635516/medium.JPG')).toBe('inat/635516/medium.jpg');
    expect(imgKey('https://inaturalist-open-data.s3.amazonaws.com/photos/12/small.')).toBe('inat/12/small.jpg');
  });
  it("GBIF's cache: by width, occurrence and media hash; another cached address by a hash", () => {
    expect(imgKey(GBIF)).toBe('gbif/400/5109709263/b549f7f9b18ca604a2acb3098b248fef.jpg');
    expect(imgKey('https://api.gbif.org/v1/image/cache/fit-in/160x/https%3A%2F%2Fexample.org%2Fa.jpg')).toMatch(/^gbif\/160\/h\/[0-9a-f]{16}\.jpg$/);
  });
  it('Commons: a hash of the whole address, its extension kept, safe as a Windows file name and short', () => {
    const k = imgKey(COMMONS)!;
    expect(k).toMatch(/^commons\/[0-9a-f]{2}\/[0-9a-f]{16}\.jpg$/);
    expect(k.slice(8, 10)).toBe(k.slice(11, 13));
    expect(imgKey(COMMONS.replace('/500px-', '/960px-'))).not.toBe(k); // each width its own copy
    expect(imgKey('https://upload.wikimedia.org/wikipedia/commons/a/ab/Plant.png')).toMatch(/\.png$/);
    expect(imgKey('https://upload.wikimedia.org/wikipedia/commons/a/ab/Plant.tif')).toBeNull();
  });
  it('the hash is FNV-1a 64 of the UTF-8 bytes: its published test values', () => {
    expect(fnv64('')).toBe('cbf29ce484222325');
    expect(fnv64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv64('foobar')).toBe('85944171f73967e8');
  });
  it('any other host has no copy, and a page keeps its address', () => {
    expect(imgKey('https://example.org/x.jpg')).toBeNull();
    expect(imgUrl('https://example.org/x.jpg')).toBe('https://example.org/x.jpg');
    expect(imgUrl(INAT)).toBe(`${IMG_ORIGIN}/inat/32514567/medium.jpeg`);
  });
});

describe('r109a the copies a page and a row need', () => {
  const fixture = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
  fixture.photos.push(
    { src: 'commons', id: 'File:A.jpg', url: COMMONS.replace('/500px-', '/960px-'), thumb: COMMONS, width: 4000, height: 3000, licence: 'by-sa', attribution: 'Someone, CC BY-SA 4.0, via Wikimedia Commons' },
    { src: 'gbif', id: '5109709263:0', url: 'https://example.org/original.jpg', thumb: GBIF, licence: 'by', attribution: 'Someone, CC BY, via GBIF' }
  );
  const d = parseDossier(fixture);
  const want = new Set(pageWanted(d));
  it('every photograph shown, at the gallery thumbnail and the strip small', () => {
    expect(d.photos.length).toBeGreaterThan(10);
    for (const p of d.photos) {
      expect(want.has(p.thumb)).toBe(true);
      expect(want.has(photoAt(p.thumb, 'small'))).toBe(true);
    }
  });
  it("the lead at the phone's medium and the desktop's large, and its srcset", () => {
    const hero = heroOf(d.photos)!;
    expect(want.has(photoOf(hero, 'medium'))).toBe(true);
    expect(want.has(photoOf(hero, 'large'))).toBe(true);
    for (const part of srcsetOf(shownAt(hero), ['medium', 'large'])!.split(', ')) expect(want.has(part.replace(/ \d+w$/, ''))).toBe(true);
  });
  it('every address wanted has a copy, and none twice', () => {
    expect([...want].every((u) => imgKey(u))).toBe(true);
    expect(new Set([...want].map(imgKey)).size).toBe(want.size);
  });
  it("an index row: its thumb, and the square, small and medium the catalogue's places ask", () => {
    expect(rowWanted({ thumb: INAT }).sort()).toEqual([INAT, INAT.replace('medium', 'square'), INAT.replace('medium', 'small')].sort());
    expect(rowWanted({})).toEqual([]);
  });
});

describe('r109a a new place that shows a photograph is read for the copy', () => {
  it('the calls of photoAt, photoOf, srcsetOf and shownAt in src/ are the ones img-wanted.ts was written against', () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|svelte)$/.test(f) && !/photo-size\.ts$|img-wanted\.ts$/.test(f)) files.push(p); } };
    walk('src');
    const n: Record<string, number> = {};
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\b(photoAt|photoOf|srcsetOf|shownAt)\(/g)) n[m[1]] = (n[m[1]] ?? 0) + 1;
    // A change here is a place that asks a photograph at a size: add it to pageWanted or rowWanted, then the count.
    expect(n).toEqual({ photoAt: 14, photoOf: 5, srcsetOf: 2, shownAt: 1 });
  });
});
