/**
 * A cold isolate's first request, through the Worker's own code, in node (round seventy-six; docs/SCALE-STUDY.md section
 * 6): a fresh process loads the corpus from a bucket over a corpus directory on disk and answers one request (a species
 * page, the home page, the dossier API or a search), then reports the wall time, the heap held after a full GC beyond
 * what the modules hold, and what it read from the bucket. Run on this round's code and on r76base's, on the same corpus.
 *
 *   node --expose-gc cold-routes.bundle.mjs <dir holding s/v2> <species|home|dossier|search> <slug, key or query>
 *   (bundled and run three times a case by cold-routes.mjs)
 */
import { readFileSync, existsSync } from 'node:fs';
import { corpusNow } from '$lib/server/dossiers';
import { load as speciesLoad } from '../../../src/routes/species/[slug]/+page.server';
import { load as homeLoad } from '../../../src/routes/+page.server';
import { GET as dossierGet } from '../../../src/routes/api/dossier/[key]/+server';
import { GET as searchGet } from '../../../src/routes/api/search/+server';

const [root, what, arg] = process.argv.slice(2);
const gc = (globalThis as unknown as { gc: () => void }).gc;
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed / 1048576; };
let bytes = 0, reads = 0;
const obj = (k: string) => { const text = readFileSync(`${root}/${k}`, 'utf8'); bytes += text.length; return { text: async () => text, json: async () => JSON.parse(text), etag: `"${k}"`, body: text }; };
const store = { get: async (k: string) => { reads++; return existsSync(`${root}/${k}`) ? obj(k) : null; }, head: async (k: string) => (existsSync(`${root}/${k}`) ? { etag: `"${k}"` } : null) };
const platform = { env: { STORE: store } } as unknown as App.Platform;
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const url = new URL(what === 'species' ? `https://cultifolio.com/species/${arg}` : what === 'home' ? `https://cultifolio.com/${arg ?? ''}` : what === 'dossier' ? `https://cultifolio.com/api/dossier/${arg}` : `https://cultifolio.com/api/search?q=${encodeURIComponent(arg)}`);
const base = heap();
const t = performance.now();
const c = await corpusNow(platform, noStatic);
const ev = { params: { slug: arg, key: arg }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.9', locals: { corpus: c } } as never;
let ok = true;
try {
  if (what === 'species') await speciesLoad(ev);
  else if (what === 'home') await homeLoad(ev);
  else if (what === 'dossier') ok = (await dossierGet(ev)).status === 200;
  else ok = (await searchGet(ev)).status === 200;
} catch (e) { ok = false; console.error(e); }
const ms = performance.now() - t;
console.log(JSON.stringify({ what, arg, ok, ms: Math.round(ms), heapMB: Math.round((heap() - base) * 10) / 10, readMB: Math.round(bytes / 104857.6) / 10, reads, indexHeld: !!c.idx }));
