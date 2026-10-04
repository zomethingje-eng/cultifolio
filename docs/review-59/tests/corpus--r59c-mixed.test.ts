import { it, expect, vi } from 'vitest';
import { corpusNow, _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { readFileSync, appendFileSync } from 'node:fs';
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
it('a species page held under corpus A renders the dossier the bucket holds now', async () => {
  _forgetIndex();
  const fx = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8'));
  const A = [{ key: 5384013, slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', family: 'Cactaceae', open: 1, photos: 1, climate: 'ok' }];
  const { manifest, files } = buildProducts(A as never, JSON.stringify(A), () => new Map());
  const m = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)], ...[...files].map(([n, b]) => [productPath(manifest.files[n]), b] as [string, string]), ['s/v2/5384013.json', JSON.stringify(fx)]]);
  const store = { get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${m.get(k)!.length}"` } : null), head: async (k: string) => (m.has(k) ? { etag: `"${m.get(k)!.length}"` } : null) };
  const platform = { env: { STORE: store } } as unknown as App.Platform;
  const c = await corpusNow(platform, noStatic);
  // the refresh's first copy lands: the dossier object (a mutable path) before the new manifest
  m.set('s/v2/5384013.json', JSON.stringify({ ...fx, summary: { ...fx.summary, text: 'CORPUS B TEXT' } }));
  const ev = { params: { slug: 'copiapoa-cinerea' }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request('https://x/species/copiapoa-cinerea'), url: new URL('https://x/species/copiapoa-cinerea'), getClientAddress: () => '1.2.3.4', locals: { corpus: c } };
  const data = (await load(ev as never)) as { d: { summary?: { text: string } } };
  appendFileSync('/tmp/review59/corpus/refresh.log', `MIXED: page keyed under corpus ${c.corpus} rendered summary "${data.d.summary?.text}"\n`);
  expect(data.d.summary?.text).toBe('CORPUS B TEXT');
});
