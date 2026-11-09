/**
 * Round eighty-seven, the integration: the build writes the browse pages' table (`browse.json`, the browse agent's C1)
 * in the index's pass, and beside it the few bytes the front page's Browse table reads (`browse-counts.json`): "Grown by
 * someone" with the count of /browse?grown=1. The front page never reads the table, so /about/how's "a species page, the
 * front page … read only the few small files they need" stays true. An index that counts no cultivated observations has
 * no count (null, said as no number), never 0 (rule 2).
 *
 * On the merge of the five branches (984a2af): `browseCountsOf`, `browseCounts` and the two files did not exist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _forgetIndex, corpusNow, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { slugify } from '$core/names';
import { entranceCountsOf } from '../../src/lib/browse/counts';
import { browseTableOf, browseCountsOf, isBrowseTable, BROWSE_FILE, BROWSE_COUNTS_FILE } from '$lib/browse/table';
import { browseCounts } from '$lib/browse/load.server';
import { prepared, runQuery, EMPTY } from '$lib/browse/engine';

const e = (k: number, name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key: `k${k}`, gbif: 9000 + k, slug: slugify(name), name, family: 'Apocynaceae', origin: ['Namibia'], photos: 4, open: 3, climate: 'ok', changed: 20765, ...o });
const IDX: IndexEntry[] = [e(1, 'Hoodia alstonii', { grown: 5 }), e(2, 'Hoodia gordonii', { grown: 37 }), e(3, 'Hoodia juttae', { grown: 0 }), e(4, 'Hoodia pilifera')];

function platformOf(files: Map<string, string>, manifest: Manifest) {
  const m = new Map<string, string>([...[...files].map(([n, body]) => [productPath(manifest.files[n]), body] as [string, string]), [manifestPath(), JSON.stringify(manifest)]]);
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"` });
  return { env: { STORE: { get: async (k: string) => (m.has(k) ? obj(k) : null), head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) } } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
beforeEach(() => _forgetIndex());

describe('the browse table and its counts, written by the build', () => {
  it('the build writes the table of its index, and the count the browse engine gives /browse?grown=1', () => {
    const { files, manifest } = buildProducts(IDX, JSON.stringify(IDX), () => new Map());
    expect(manifest.files[BROWSE_FILE]).toBeTruthy();
    expect(manifest.files[BROWSE_COUNTS_FILE]).toBeTruthy();
    const t = JSON.parse(files.get(BROWSE_FILE)!);
    expect(isBrowseTable(t, IDX.length)).toBe(true);
    expect(t).toEqual(browseTableOf(IDX));
    const counts = JSON.parse(files.get(BROWSE_COUNTS_FILE)!);
    expect(counts).toEqual({ grown: 2, ...entranceCountsOf(prepared(t)) });
    expect(Object.keys(counts).sort()).toEqual(['families', 'genera', 'grown', 'grownNotCounted', 'regions']);
    expect(counts.grown).toBe(runQuery(prepared(t), EMPTY).flags.grown);
    expect(files.get(BROWSE_COUNTS_FILE)!.length).toBeLessThan(120);
  });
  it('an index that counts no cultivated observations has no count, never 0', () => {
    expect(browseCountsOf(browseTableOf(IDX.map(({ grown: _g, ...x }) => x as IndexEntry)))).toEqual({ grown: null });
    expect(browseCountsOf(browseTableOf([e(1, 'Hoodia alstonii', { grown: 0 })]))).toEqual({ grown: 0 });
  });
  it('the front page reads the counts file, not the table; a manifest without it gives no count', async () => {
    const { files, manifest } = buildProducts(IDX, JSON.stringify(IDX), () => new Map());
    const platform = platformOf(files, manifest);
    const c = await corpusNow(platform, noStatic);
    expect(await browseCounts(c, platform, noStatic)).toMatchObject({ grown: 2, regions: expect.any(Number), families: expect.any(Number), genera: expect.any(Number) });
    _forgetIndex();
    const older: Manifest = { ...manifest, files: { ...manifest.files } };
    delete older.files[BROWSE_COUNTS_FILE];
    const p2 = platformOf(files, older);
    expect(await browseCounts(await corpusNow(p2, noStatic), p2, noStatic)).toBeNull();
  });
});
