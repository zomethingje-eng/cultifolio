// Preloaded into a corpus build (`node --import`) for the scaling study: counts every upstream request by host and
// by kind of request, paces them politely for a shared machine (api.inaturalist.org at most one every 2.1 s, any
// other host one a second), and writes the counts to $COUNT_OUT on exit. Changes nothing the build writes.
import { writeFileSync } from 'node:fs';

const real = globalThis.fetch;
const counts = {};
const last = new Map();
const gap = (host) => (host === 'api.inaturalist.org' ? 2100 : 1000);
/** A request's kind: its host and the first path segments that name the endpoint (no keys, no names). */
function kind(u) {
  const url = new URL(u);
  let p = url.pathname.replace(/\/\d[\w.-]*/g, '/:id').split('/').slice(0, 5).join('/');
  if (url.hostname.endsWith('wikidata.org') || url.hostname.endsWith('wikimedia.org') || url.hostname.endsWith('wikipedia.org')) {
    const a = url.searchParams.get('action'), l = url.searchParams.get('list'), pr = url.searchParams.get('prop');
    if (a) p += `?action=${a}${l ? `&list=${l}` : ''}${pr ? `&prop=${pr}` : ''}`;
    if (p.startsWith('/api/rest_v1/page/summary')) p = '/api/rest_v1/page/summary';
    if (p.startsWith('/wiki/')) p = '/wiki/:title';
  }
  if (url.hostname === 'api.gbif.org' && p.startsWith('/v1/occurrence/search')) p = '/v1/occurrence/search' + (url.searchParams.get('mediaType') ? '?mediaType' : '');
  return `${url.hostname} ${p}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chain = Promise.resolve();
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input.url ?? String(input);
  let host = '';
  try { host = new URL(u).hostname; } catch { return real(input, init); }
  // One request at a time across the whole build, each host paced: the build's own pacing is faster than this study may be.
  const mine = chain.then(async () => {
    const wait = (last.get(host) ?? 0) + gap(host) - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(host, Date.now());
  });
  chain = mine.catch(() => {});
  await mine;
  const k = kind(u);
  const t = Date.now();
  const res = await real(input, init);
  const c = (counts[k] ??= { n: 0, ms: 0, status: {} });
  c.n++; c.ms += Date.now() - t; c.status[res.status] = (c.status[res.status] ?? 0) + 1;
  return res;
};
const save = () => { if (process.env.COUNT_OUT) writeFileSync(process.env.COUNT_OUT, JSON.stringify(counts, null, 1)); };
process.on('exit', save);
setInterval(save, 10_000).unref();
