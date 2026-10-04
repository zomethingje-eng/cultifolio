/**
 * Round fifty-nine (the corpus review, 2): a manifest the Worker refuses (deployed before the build that wrote it, or
 * half-written) leaves the corpus held before in place, under its own id and with its products, and is not read again
 * every minute; an index whose length is not the manifest's species count is refused the same way.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { corpusNow, _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';

const mk = (names: string[]) => names.map((name, i) => ({ key: 1000 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0 }));
const X = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
const Y = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

function blobsFor(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const blobs = new Map<string, string>();
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  return { manifest, blobs, text };
}

describe('a manifest the Worker refuses (round fifty-nine)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('leaves the corpus held before in place, and is not read again each minute', async () => {
    _forgetIndex();
    const a = blobsFor(X), b = blobsFor(Y);
    const m = new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)], ['s/v2/index.json', a.text]]);
    const store = {
      get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"` } : null),
      head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null)
    };
    const platform = { env: { STORE: store } } as unknown as App.Platform;
    const T0 = Date.UTC(2026, 9, 3, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    const first = await corpusNow(platform, noStatic);
    expect(first.corpus).toBe(a.manifest.id);
    // the refresh's first copy lands (products and the top-level index), then a manifest this Worker rejects (one product missing)
    for (const [k, v] of b.blobs) m.set(k, v);
    m.set('s/v2/index.json', b.text);
    const files = { ...b.manifest.files }; delete files['catalogue/genus-all.json'];
    m.set(manifestPath(), JSON.stringify({ ...b.manifest, files }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockImplementation(() => T0 + 61_000);
    const after = await corpusNow(platform, noStatic);
    process.stderr.write(`\nbefore ${first.corpus} manifest=${!!first.manifest}; after ${after.corpus} manifest=${!!after.manifest} species=${after.idx.length}\n`);
    expect({ corpus: after.corpus, manifest: !!after.manifest, species: after.idx.length }).toEqual({ corpus: a.manifest.id, manifest: true, species: X.length });
    let reads = 0; const g = store.get; store.get = async (k: string) => { reads++; return g(k); };
    for (let i = 2; i <= 6; i++) { vi.spyOn(Date, 'now').mockImplementation(() => T0 + i * 61_000); expect((await corpusNow(platform, noStatic)).corpus).toBe(a.manifest.id); }
    expect(reads).toBe(0); // heads only: the refused manifest is not fetched and parsed again
  });
  it('an index whose length is not the manifest\'s species count is not the corpus', async () => {
    _forgetIndex();
    const a = blobsFor(X), b = blobsFor(Y);
    const m = new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const store = {
      get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"` } : null),
      head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null)
    };
    const platform = { env: { STORE: store } } as unknown as App.Platform;
    const T0 = Date.UTC(2026, 9, 3, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    expect((await corpusNow(platform, noStatic)).corpus).toBe(a.manifest.id);
    // B's manifest, but naming A's index (four species where B has five)
    for (const [k, v] of b.blobs) m.set(k, v);
    m.set(manifestPath(), JSON.stringify({ ...b.manifest, files: { ...b.manifest.files, 'index.json': a.manifest.files['index.json'] } }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockImplementation(() => T0 + 61_000);
    expect((await corpusNow(platform, noStatic)).corpus).toBe(a.manifest.id);
  });
});
