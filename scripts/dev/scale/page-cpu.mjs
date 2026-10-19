// The CPU and heap of a page the Worker's cache does not hold, in node, through the built Worker's own server (round
// seventy-seven; docs/review-77/C.md): SvelteKit's `Server` from `.svelte-kit/output/server`, the hooks, the route's load,
// the render and the page data, over a bucket read from a corpus directory on disk. One process is one isolate: it
// answers the pages given in order, as a crawler's requests reach a warm copy, and prints one line a request.
//
//   node --single-threaded [--expose-gc] scripts/dev/scale/page-cpu.mjs <built project> <dir holding s/v2> <paths file|path ...>
//
// Per request: `cpuMs` (this thread's CPU from the request to the last byte of the body, less the disk reads that stand
// in for R2), `parse` (JSON.parse by what was read: names, rows, dossier, genus, genera, catalogue, other), `htmlBytes`
// and `dataBytes` (the page data Kit inlines). With --expose-gc, also `allocMB` (heap taken by the request, no collection
// forced between) and `heldMB` (the heap held after it, collected, beyond the server's own at start).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [project, root, ...rest] = process.argv.slice(2);
const paths = rest.flatMap((x) => (x.endsWith('.txt') && existsSync(x) ? readFileSync(x, 'utf8').split('\n').filter(Boolean) : [x]));
const gc = globalThis.gc;
const { Server } = await import(pathToFileURL(resolve(project, '.svelte-kit/output/server/index.js')).href);
const { manifest } = await import(pathToFileURL(resolve(project, '.svelte-kit/cloudflare-tmp/manifest.js')).href);

// Which file each text came from, so JSON.parse's time is told by product.
const origin = new Map();
const kindOf = (k) => (k.includes('/p/') ? 'product' : k.includes('/g/') ? 'genus' : /\/\d+\.json$/.test(k) ? 'dossier' : 'other');
let productKind = new Map();
const parse = {};
const parse0 = JSON.parse;
JSON.parse = function (text, reviver) {
  const t = performance.now();
  try { return parse0(text, reviver); } finally {
    const label = (typeof text === 'string' && origin.get(text)) || 'other';
    parse[label] = (parse[label] ?? 0) + performance.now() - t;
  }
};
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
let ioMs = 0;
const decoder = new TextDecoder();
const store = {
  get: async (k) => {
    const t = cpu();
    const f = join(root, k);
    const buf = existsSync(f) ? readFileSync(f) : null;
    ioMs += cpu() - t;
    if (!buf) return null;
    const label = kindOf(k) === 'product' ? (productKind.get(k.split('/p/')[1].replace(/\.json$/, '')) ?? 'product') : kindOf(k);
    const text = () => { const s = decoder.decode(buf); origin.set(s, label); return s; };
    return { etag: `"${k}"`, size: buf.length, text: async () => text(), json: async () => JSON.parse(text()), body: null };
  },
  head: async (k) => (existsSync(join(root, k)) ? { etag: `"${k}"` } : null)
};
// The product hashes the manifest names, by kind.
const m = parse0(readFileSync(join(root, 's/v2/manifest.json'), 'utf8'));
for (const [name, hash] of Object.entries(m.files)) productKind.set(hash, name.split('/')[0].replace(/\.json$/, ''));

const env = { STORE: store, SYNC_OPEN: '0', E2E_OFFLINE: '1', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
const server = new Server(manifest);
await server.init({ env, read: async () => { throw new Error('no assets here'); } });
const platform = { env, ctx: { waitUntil() {}, passThroughOnException() {} }, context: { waitUntil() {} }, caches: undefined, cf: {} };
const held = () => { gc(); gc(); return process.memoryUsage().heapUsed / 1048576; };
const base = gc ? held() : 0;
const r1 = (x) => Math.round(x * 10) / 10;
// PROF_DIR: V8's CPU profile of each of the first PROF_N requests (default all), one file each, through the inspector.
const profDir = process.env.PROF_DIR;
let session = null;
if (profDir) {
  const { Session } = await import('node:inspector/promises');
  session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: Number(process.env.PROF_US ?? 100) });
}
const { writeFileSync, mkdirSync } = await import('node:fs');
let n = 0;
for (const p of paths) {
  for (const k of Object.keys(parse)) delete parse[k];
  origin.clear();
  ioMs = 0;
  const h0 = gc ? process.memoryUsage().heapUsed / 1048576 : 0;
  const profiling = session && n++ < Number(process.env.PROF_N ?? Infinity);
  if (profiling) await session.post('Profiler.start');
  const c0 = cpu();
  const res = await server.respond(new Request(`https://cultifolio.com${p}`, { headers: { 'user-agent': 'cultifolio-review/77', accept: 'text/html' } }), { platform, getClientAddress: () => '192.0.2.9' });
  const html = await res.text();
  const cpuMs = cpu() - c0 - ioMs;
  if (profiling) { const { profile } = await session.post('Profiler.stop'); mkdirSync(profDir, { recursive: true }); writeFileSync(join(profDir, `${process.pid}-${n}.cpuprofile`), JSON.stringify(profile)); }
  const alloc = gc ? process.memoryUsage().heapUsed / 1048576 - h0 : 0;
  // Kit's inline page data: `data: [...]` in the hydration script.
  const at = html.indexOf('data: [');
  const end = at < 0 ? -1 : html.indexOf('form: ', at);
  const out = { path: p, status: res.status, cpuMs: r1(cpuMs), htmlBytes: Buffer.byteLength(html), dataBytes: at < 0 || end < 0 ? 0 : end - at, parse: Object.fromEntries(Object.entries(parse).map(([k, v]) => [k, r1(v)])) };
  if (gc) Object.assign(out, { allocMB: r1(alloc), heldMB: r1(held() - base) });
  console.log(JSON.stringify(out));
}
process.exit(0); // the server's own timers would keep the process
