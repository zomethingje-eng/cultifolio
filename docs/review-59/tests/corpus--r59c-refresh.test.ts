/** Round 59 corpus reviewer: the refresh sequence against a fake R2, warm and cold isolates. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { corpusNow, _forgetIndex, searchAnswer, product } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { md5 } from '$dossier/md5';
import { writeFileSync, appendFileSync } from 'node:fs';

const mk = (names: string[]) => names.map((name, i) => ({ key: 1000 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0, photos: 0, climate: 'ok', family: 'Cactaceae' }));
const X = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
const Y = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const LOG = '/tmp/review59/corpus/refresh.log';

function corpusFiles(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const blobs = new Map<string, string>();
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  return { manifest, blobs, text };
}
function r2(initial: Map<string, string>) {
  const m = new Map(initial);
  let down = false;
  const etag = (k: string) => md5(m.get(k)!);
  const store = {
    get: async (k: string) => { if (down) throw new Error('R2 down'); return m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: etag(k) } : null; },
    head: async (k: string) => { if (down) throw new Error('R2 down'); return m.has(k) ? { etag: etag(k) } : null; }
  };
  return { m, store, setDown: (v: boolean) => { down = v; } };
}
let now = Date.UTC(2026, 9, 4, 12);
const tick = (ms: number) => { now += ms; };
afterEach(() => vi.restoreAllMocks());

async function served(platform: App.Platform) {
  const c = await corpusNow(platform, noStatic);
  return `${c.corpus}${c.manifest ? '' : '(no manifest)'}/${c.idx.length}`;
}

describe('refresh sequences', () => {
  it('scenarios', async () => {
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(LOG, '');
    const log = (s: string) => appendFileSync(LOG, s + '\n');
    const a = corpusFiles(X), b = corpusFiles(Y);
    log(`A=${a.manifest.id} B=${b.manifest.id}`);
    const base = () => new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)], ['s/v2/index.json', a.text]]);

    // S1: documented order
    {
      _forgetIndex(); const { m, store } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      const out: string[] = [await served(platform)];
      for (const [k, v] of b.blobs) m.set(k, v); m.set('s/v2/index.json', b.text);
      tick(61_000); out.push(await served(platform));
      m.set(manifestPath(), JSON.stringify(b.manifest));
      out.push(await served(platform)); tick(61_000); out.push(await served(platform));
      _forgetIndex(); out.push('cold:' + await served(platform));
      log(`S1 documented order (warm: before, products landed, manifest landed +0s, +61s; cold after): ${out.join(' -> ')}`);
    }
    // S2: manifest first, then products (index last); warm and cold isolates during the gap
    {
      _forgetIndex(); const { m, store } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      const out: string[] = [await served(platform)];
      m.set(manifestPath(), JSON.stringify(b.manifest));
      tick(61_000); out.push('warm:' + await served(platform));
      _forgetIndex(); out.push('cold:' + await served(platform));
      m.set('s/v2/index.json', b.text); tick(61_000); out.push('cold+topindexB:' + await served(platform));
      for (const [k, v] of b.blobs) m.set(k, v); tick(61_000); out.push('after products:' + await served(platform));
      log(`S2 manifest first: ${out.join(' -> ')}`);
    }
    // S3: manifest and index product present, postings not yet: the search
    {
      _forgetIndex(); const { m, store } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      await served(platform);
      m.set(productPath(b.manifest.files['index.json']), b.blobs.get(productPath(b.manifest.files['index.json']))!);
      m.set(manifestPath(), JSON.stringify(b.manifest));
      tick(61_000);
      const s = await served(platform);
      let charged = 0;
      const ans = await searchAnswer(platform, noStatic, 'aloe', 10, async () => { charged++; return new Response('slow', { status: 429 }); });
      for (const [k, v] of b.blobs) m.set(k, v);
      tick(30_000);
      let charged2 = 0;
      const ans2 = await searchAnswer(platform, noStatic, 'aloe', 10, async () => { charged2++; return new Response('slow', { status: 429 }); });
      tick(31_000);
      let charged3 = 0;
      const ans3 = await searchAnswer(platform, noStatic, 'aloe', 10, async () => { charged3++; return new Response('slow', { status: 429 }); });
      log(`S3 index product before postings: served ${s}; search "aloe" during gap: ${'stop' in ans ? 'refused ' + ans.stop.status : 'hits'} (charged ${charged}); 30 s after the postings land: ${'stop' in ans2 ? 'refused ' + ans2.stop.status : 'hits'} (charged ${charged2}); 61 s after: ${'stop' in ans3 ? 'refused' : 'hits ' + ans3.hits.length} (charged ${charged3})`);
    }
    // S4: a Worker deployed requiring a product the live manifest lacks (cold isolates, as after every deploy)
    {
      _forgetIndex(); const files = { ...a.manifest.files }; delete files['catalogue/genus-all.json'];
      const init = base(); init.set(manifestPath(), JSON.stringify({ ...a.manifest, files }));
      const { store } = r2(init); const platform = { env: { STORE: store } } as unknown as App.Platform;
      const out: string[] = ['cold:' + await served(platform)];
      let gets = 0; const g = store.get; store.get = async (k: string) => { gets++; return g(k); };
      for (let i = 0; i < 5; i++) { tick(61_000); out.push(await served(platform)); }
      log(`S4 deploy needing more products than the live manifest names: ${out.join(' -> ')}; gets over five minutes ${gets}`);
    }
    // S5: R2 fails a head for the minute check (warm isolate), then a get
    {
      _forgetIndex(); const { store, setDown } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      const out: string[] = [await served(platform)];
      setDown(true); tick(61_000);
      try { out.push(await served(platform)); } catch (e) { out.push('THROWS ' + (e as Error).message); }
      try { out.push(await served(platform)); } catch (e) { out.push('THROWS again ' + (e as Error).message); }
      setDown(false); out.push('R2 back: ' + await served(platform));
      log(`S5 R2 blip during the minute check: ${out.join(' -> ')}`);
    }
    // S6: R2 head works but the get after it fails (the old generation is dropped first)
    {
      _forgetIndex(); const { m, store } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      const out: string[] = [await served(platform)];
      m.set(manifestPath(), JSON.stringify(b.manifest)); for (const [k, v] of b.blobs) m.set(k, v);
      let fail = 1; const g = store.get; store.get = async (k: string) => { if (fail-- > 0) throw new Error('R2 get failed'); return g(k); };
      tick(61_000);
      try { out.push(await served(platform)); } catch (e) { out.push('THROWS ' + (e as Error).message); }
      log(`S6 get fails after the head saw a new manifest: ${out.join(' -> ')}`);
    }
    // S7: the manifest's own etag differs but its content is the same (manifest uploaded twice: R2 etag is the md5, so the same body is the same etag)
    {
      _forgetIndex(); const { m, store } = r2(base()); const platform = { env: { STORE: store } } as unknown as App.Platform;
      await served(platform);
      let gets = 0; const g = store.get; store.get = async (k: string) => { gets++; return g(k); };
      m.set(manifestPath(), JSON.stringify(a.manifest, null, 1)); // the same manifest written with the file's indentation (what --index writes and rclone uploads)
      tick(61_000); const s = await served(platform);
      log(`S7 same manifest, other bytes: ${s}; gets ${gets} (a full reparse of the index; ids unchanged)`);
    }
    expect(true).toBe(true);
  });
});
