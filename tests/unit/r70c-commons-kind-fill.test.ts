/**
 * Round seventy, REVIEW-TRIAGE-69 C2 (S-C2): `--fill commons-kind` asks Commons, fifty files a request, for the categories
 * of every stored Commons photograph, and keeps them with the photograph, so the read applies the category rules to it.
 * Driven with dossiers held in memory, as the owner's corpus step is (the CLI wiring in scripts/build-dossiers.ts is
 * agent B's, written as a need). The files and categories are Commons' as the self-review read them (2026-10-12). Every
 * case FAILED on the base, which has no such fill (`fillCommonsKindAll` is not exported).
 */
import { describe, it, expect } from 'vitest';
import * as fill from '$dossier/commons-fill';
import type { FetchResult } from '$dossier/fetch';
import { safeUrls } from '$dossier/schema';
import { gbifPage } from '../../src/lib/core/page-id';

const photo = (title: string, extra: Record<string, unknown> = {}) => ({ src: 'commons', id: title, url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/960px-${encodeURIComponent(title)}`, thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/500px-x.jpg', width: 3000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', ...extra });
const dossier = (key: number, scientific: string, photos: unknown[], synonyms: string[] = []) => ({ v: 3, key: gbifPage(key), ids: { gbif: key }, slug: scientific.toLowerCase().replace(/ /g, '-'), name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos });
const memory = (ds: Array<ReturnType<typeof dossier>>) => {
  const files = new Map(ds.map((d) => [`${d.key}.json`, JSON.parse(JSON.stringify(d))]));
  const writes: string[] = [];
  return { files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f: string, d: unknown) => { writes.push(f); files.set(f, JSON.parse(JSON.stringify(d))); }, get: (f: string) => files.get(f), writes };
};

/** Commons' answer to a titles request, from a table of title → categories (a string), "missing", or a description to strike. */
const commons = (table: Record<string, string | { cats: string; desc: string }>, calls: string[], refuseAfter = Infinity) =>
  async <T,>(url: string): Promise<FetchResult<T>> => {
    calls.push(url);
    if (calls.length > refuseAfter) return { status: 'refused', detail: 'HTTP 429' };
    const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
    const pages = Object.fromEntries(titles.map((t, i) => {
      const a = table[t];
      if (a === 'missing' || a === undefined) return [String(-1 - i), { title: t, missing: '' }];
      const { cats, desc } = typeof a === 'string' ? { cats: a, desc: '' } : a;
      return [String(i + 1), { title: t, imageinfo: [{ extmetadata: { Categories: { value: cats }, ImageDescription: { value: desc } } }] }];
    }));
    return { status: 'ok', data: { query: { pages } } as T };
  };

describe('--fill commons-kind', () => {
  it('keeps each file\'s categories, and the read then leaves out the stamp, the plate and the unidentified plant', async () => {
    const store = memory([
      dossier(2740003, 'Colchicum macedonicum', [photo('File:Colchicum macedonicum.jpg', { width: 189, licence: 'pd', attribution: 'Македонская почта, Public domain, via Wikimedia Commons' })], ['Colchicum pieperanum Markgr.']),
      dossier(4053092, 'Cyphostemma adenopodum', [photo('File:Cissus adenopodus 135-8278.jpg'), photo('File:Cyphostemma adenopodum kz1.jpg')], ['Cissus adenopoda Sprague']),
      dossier(2739906, 'Colchicum raddeanum', [photo('File:Plants of Artavaz 016.jpg')])
    ]);
    const calls: string[] = [];
    const c = await fill.fillCommonsKindAll(store, commons({
      'File:Colchicum macedonicum.jpg': 'Colchicum macedonicum|Plants on stamps of North Macedonia|Stamps of North Macedonia, 2003',
      'File:Cissus adenopodus 135-8278.jpg': "Curtis's Botanical Magazine, Volume 135|Cyphostemma adenopodum",
      'File:Cyphostemma adenopodum kz1.jpg': 'Cyphostemma adenopodum|Pages with maps',
      'File:Plants of Artavaz 016.jpg': 'Unidentified Liliales in Armenia|Artavaz'
    }, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^https:\/\/commons\.wikimedia\.org\/w\/api\.php\?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Categories\|ImageDescription\|Credit\|Artist&maxlag=5&titles=/);
    // Round 71 (S-C12): the stamp was already left out by its credit ("почта"), so the fill no longer counts it as new.
    expect(c).toMatchObject({ files: 4, before: 0, requests: 1, asked: 4, read: 4, missing: 0, unchecked: 0, dossiers: 3, hidden: 2 });
    expect(c.lines).toEqual([
      '4053092\tCyphostemma adenopodum\tfiled under "Curtis\'s Botanical Magazine, Volume 135"\tFile:Cissus adenopodus 135-8278.jpg',
      '2739906\tColchicum raddeanum\tfiled under "Unidentified Liliales in Armenia"\tFile:Plants of Artavaz 016.jpg'
    ]);
    const cy = store.get('g4053092.json');
    expect(cy.photos.map((p: { categories?: string[] }) => p.categories)).toEqual([["Curtis's Botanical Magazine, Volume 135", 'Cyphostemma adenopodum'], ['Cyphostemma adenopodum', 'Pages with maps']]);
    expect(safeUrls(cy as never).photos.map((p) => p.id)).toEqual(['File:Cyphostemma adenopodum kz1.jpg']);
    expect(safeUrls(store.get('g2740003.json') as never).photos).toEqual([]);
  });

  it('asks a file on two pages once, fifty files a request, and keeps a struck description', async () => {
    const many = Array.from({ length: 52 }, (_, i) => `File:Parodia ritteri ${i}.jpg`);
    const store = memory([
      dossier(3947849, 'Parodia ritteri', [...many.map((t) => photo(t)), photo('File:Parodia Liberec 1.jpg')], ['Parodia camargensis Buining & F.Ritter']),
      dossier(7281971, 'Parodia comarapana', [photo('File:Parodia Liberec 1.jpg')]),
      dossier(3128990, 'Plectocephalus americanus', [photo('File:Centaurea nutallii.jpg')], ['Centaurea nuttallii Spreng.'])
    ]);
    const table: Record<string, string | { cats: string; desc: string }> = Object.fromEntries(many.map((t) => [t, 'Parodia ritteri']));
    table['File:Parodia Liberec 1.jpg'] = 'Parodia camargensis|Parodia comarapana|Parodia lecoriensis|Parodia hausteiniana|Parodia purpuroaurea|Parodia maassii';
    table['File:Centaurea nutallii.jpg'] = { cats: 'Centaurea', desc: '<i>Centaurea</i> sp. <s><i>C. nuttallii</i></s>' };
    const calls: string[] = [];
    const c = await fill.fillCommonsKindAll(store, commons(table, calls));
    expect(calls).toHaveLength(2);
    expect(c).toMatchObject({ files: 55, asked: 54, read: 54, requests: 2, dossiers: 3 });
    expect(store.get('g3128990.json').photos[0].struck).toBe(true);
    expect(safeUrls(store.get('g3128990.json') as never).photos).toEqual([]);
    expect(safeUrls(store.get('g7281971.json') as never).photos).toEqual([]);
    expect(c.lines.filter((l) => l.includes('Liberec'))).toHaveLength(2);
  });

  it('a refusal stops the fill and leaves every file not answered as it was; the next fill passes by those it read', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `File:Aloe vera ${i}.jpg`);
    const store = memory([dossier(1, 'Aloe vera', many.map((t) => photo(t)))]);
    const calls: string[] = [];
    const first = await fill.fillCommonsKindAll(store, commons(Object.fromEntries(many.map((t) => [t, 'Aloe vera'])), calls, 1));
    expect(first).toMatchObject({ requests: 2, read: 50, unchecked: 10, refused: 'HTTP 429', dossiers: 1 });
    const kept = store.get('g1.json').photos as Array<{ categories?: string[] }>;
    expect(kept.filter((p) => Array.isArray(p.categories))).toHaveLength(50);
    const again: string[] = [];
    const second = await fill.fillCommonsKindAll(store, commons(Object.fromEntries(many.map((t) => [t, 'Aloe vera'])), again));
    expect(second).toMatchObject({ before: 50, asked: 10, read: 10, unchecked: 0 });
    expect(again).toHaveLength(1);
  });

  it('a file Commons no longer has is left as it is and listed; a dossier with nothing answered is not written', async () => {
    const store = memory([dossier(2, 'Aloe ferox', [photo('File:Aloe ferox gone.jpg')]), dossier(3, 'Aloe vera', [{ ...photo('File:Aloe vera 1.jpg'), categories: ['Aloe vera'], sourceRead: true }])]);
    const c = await fill.fillCommonsKindAll(store, commons({ 'File:Aloe ferox gone.jpg': 'missing' }, []));
    expect(c).toMatchObject({ files: 2, before: 1, read: 1, missing: 1, dossiers: 0 });
    expect(c.lines).toEqual(['2\tAloe ferox\tno longer on Commons (left as it is)\tFile:Aloe ferox gone.jpg']);
    expect(store.writes).toEqual([]);
    expect(store.get('g2.json').photos[0].categories).toBeUndefined();
  });

  it('reads a title Commons normalised back to the title asked', () => {
    const r = fill.readKindReply({ query: { normalized: [{ from: 'File:Aloe_vera_1.jpg', to: 'File:Aloe vera 1.jpg' }], pages: { '5': { title: 'File:Aloe vera 1.jpg', imageinfo: [{ extmetadata: { Categories: { value: 'Aloe vera|Hybrids of Aloe' } } }] } } } }, ['File:Aloe_vera_1.jpg']);
    expect(r.get('File:Aloe_vera_1.jpg')).toEqual({ categories: ['Aloe vera', 'Hybrids of Aloe'], struck: false, inat: null, artist: null, kind: null }); // round 71: the source, the Artist and what the source says
  });
});
