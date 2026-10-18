/**
 * Round seventy-six (W; docs/SCALE-STUDY.md section 2.4): the photograph judgement that needed every name of the
 * reference (`heldNamesOf` of the whole index) is made by `--index` and stored on each Commons file (`Photo.judged`), so
 * the Worker reads a page with no names and shows what it showed with them. The case is a real one (Adromischus
 * mammillaris, whose Commons file is titled "Adromischus mammilaris"): without the reference's names the slip reads as
 * another species and the file is hidden; with them, and with the stored judgement, it is shown.
 *
 * On the real corpus every dossier is compared (scripts/dev/scale/r76-proof.ts: 8,947 the same, 0 different).
 * FAILS on r76base: there is no `judged` and no `judgePhotos`, and `parseDossier` without names hid the file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import { parseDossier, Dossier, dossierPath } from '$dossier/schema';
import { heldNamesOf, kindNamesOf, judgePhotos } from '$dossier/photo-kind';
import { substanceHash } from '$dossier/changed';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { lookupFileNames } from '$dossier/lookups';
import { corpusNow, getDossier, _forgetIndex, fromFiles, type IndexEntry } from '$lib/server/dossiers';

const template = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8'));
const slip = { src: 'commons', id: 'File:Adromischus mammilaris 0zz.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Adromischus_mammilaris_0zz.jpg/960px-Adromischus_mammilaris_0zz.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Adromischus_mammilaris_0zz.jpg/500px-Adromischus_mammilaris_0zz.jpg', width: 1000, height: 665, licence: 'by-sa', attribution: 'David J. Stang, CC BY-SA 4.0, via Wikimedia Commons', page: 'https://commons.wikimedia.org/wiki/File:Adromischus_mammilaris_0zz.jpg', categories: ['Adromischus mammillaris'], slips: ['adromischus mammilaris'], sourceRead: true };
const own = { src: 'commons', id: 'File:Adromischus mammillaris flowering.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Adromischus_mammillaris_flowering.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Adromischus_mammillaris_flowering.jpg/500px-Adromischus_mammillaris_flowering.jpg', width: 400, height: 300, licence: 'by', attribution: 'Someone, CC BY 4.0, via Wikimedia Commons', categories: ['Adromischus mammillaris'] };
const dossier = () => JSON.parse(JSON.stringify({ ...template, key: 7981215, slug: 'adromischus-mammillaris', name: { ...template.name, scientific: 'Adromischus mammillaris', genus: 'Adromischus', authorship: '(L.f.) Lem.', synonyms: ['Adromischu mammillaris (L.f.) Lem.', 'Cotyledon mammillaris L.fil.'], kew: { entry: '2623288', synonyms: ['Cotyledon mammillaris'], acceptedElsewhere: [], file: '2026-06-04' } }, photos: [slip, own, ...template.photos.slice(0, 2)] }));
const IDX: IndexEntry[] = [
  { key: 7981215, slug: 'adromischus-mammillaris', name: 'Adromischus mammillaris', family: 'Crassulaceae', origin: ['Cape Provinces'], photos: 4, open: 1, climate: 'none', syn: ['Adromischu mammillaris', 'Cotyledon mammillaris'] },
  { key: 7981216, slug: 'adromischus-cristatus', name: 'Adromischus cristatus', family: 'Crassulaceae', origin: ['Cape Provinces'], photos: 4, open: 1, climate: 'none' }
];
const ids = (d: { photos: Array<{ id: string }> }) => d.photos.map((p) => p.id);
const bare = (d: { photos: object[] }) => d.photos.map((p) => { const { judged: _, ...rest } = p as Record<string, unknown>; return rest; });

afterEach(() => vi.restoreAllMocks());

describe('the photograph judgement, stored by --index (round seventy-six)', () => {
  it('without the reference\'s names and with no judgement the slip hides the file; with the names it is shown; with the stored judgement and no names, the same', () => {
    const held = heldNamesOf(IDX);
    expect(ids(parseDossier(dossier(), null))).not.toContain(slip.id); // what the Worker would show with no names and nothing stored
    const withNames = parseDossier(dossier(), held);
    expect(ids(withNames)).toContain(slip.id);
    const d = dossier();
    expect(judgePhotos(d.photos, kindNamesOf(v.parse(Dossier, d), held)!)).toBe(true);
    expect(d.photos[0].judged).toEqual({ rank: 2 });
    expect(d.photos[1].judged).toEqual({ rank: 0 });
    expect(d.photos[2].judged).toBeUndefined(); // only Commons files are judged
    const stored = parseDossier(d, null);
    expect(bare(stored)).toEqual(bare(withNames));
    expect(ids(stored)).toEqual(ids(withNames)); // the order too: the species' own epithet first (`rank`)
    expect(judgePhotos(d.photos, kindNamesOf(v.parse(Dossier, d), held)!)).toBe(false); // a second --index changes nothing
    expect(substanceHash(d)).toBe(substanceHash(dossier())); // derived: it moves no page's day in the sitemap
  });

  it('a stored judgement is read only where no names are given: the build and the fills judge again', () => {
    const d = dossier();
    d.photos[0].judged = { not: 'named as another species', rank: 2 }; // stale, say
    expect(ids(parseDossier(d, null))).not.toContain(slip.id);
    expect(ids(parseDossier(d, heldNamesOf(IDX)))).toContain(slip.id);
  });

  it('the Worker reads a dossier without names under the lookup files, and with the index\'s names under a corpus built before them', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const p = buildProducts(IDX, JSON.stringify(IDX), () => new Map());
    const judged = dossier();
    judgePhotos(judged.photos, kindNamesOf(v.parse(Dossier, judged), heldNamesOf(IDX))!);
    const old = new Set(lookupFileNames(IDX.length));
    for (const [which, manifest, body] of [['files', p.manifest, judged], ['index', { ...p.manifest, files: Object.fromEntries(Object.entries(p.manifest.files).filter(([n]) => !old.has(n))) }, dossier()]] as const) {
      _forgetIndex();
      const m = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)], ...[...p.files].map(([n, b]) => [productPath(p.manifest.files[n]), b] as [string, string]), [dossierPath(7981215), JSON.stringify(body)]]);
      const store = { get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"` } : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) };
      const platform = { env: { STORE: store } } as unknown as App.Platform;
      const c = await corpusNow(platform, noStatic);
      expect(fromFiles(c)).toBe(which === 'files');
      const d = await getDossier(platform, noStatic, 7981215, c);
      expect(ids(d!)).toContain(slip.id);
      expect(ids(d!)).toEqual(ids(parseDossier(dossier(), heldNamesOf(IDX))));
    }
  });
});
