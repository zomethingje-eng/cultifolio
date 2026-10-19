// Round seventy-eight (I): every page shows the same after the change of ids as before it, on the real corpus. Two built
// Workers (`.svelte-kit/output/server`), each over its own corpus (round seventy-seven's build over the corpus of version 2,
// this round's over the same corpus rekeyed as version 3), answer every page; for each:
//   - the HTML, without Kit's hydration script (which carries the page data), is the same byte for byte, but for the
//     species page's `data-key` (its id, where it was its GBIF key);
//   - the page data is the same once every page's id in it is written as that page's GBIF key: the dossier's `key`, `v`
//     and the stamp's fingerprint, the range's `via.page`, and the `key` of each card the page lists (its genus, its
//     nearest climates), which now carry `gbif` beside the id.
//
//   node scripts/dev/scale/r78-page-proof.mjs <base project> <its corpus root> <new project> <its corpus root> <paths file> <new index.json>
// Prints the counts and the first differences; exits 1 on any. (After round seventy-seven's r77c-page-proof.mjs.)
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const [baseProject, baseRoot, newProject, newRoot, list, newIndex] = process.argv.slice(2);
const paths = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const devalue = await import(pathToFileURL(resolve(newProject, 'node_modules/devalue/index.js')).href);
const gbifOf = new Map(JSON.parse(readFileSync(newIndex, 'utf8')).map((e) => [e.key, e.gbif]));

async function serverOf(project, root) {
  const { Server } = await import(pathToFileURL(resolve(project, '.svelte-kit/output/server/index.js')).href);
  const { manifest } = await import(pathToFileURL(resolve(project, '.svelte-kit/cloudflare-tmp/manifest.js')).href);
  const store = { get: async (k) => { const f = join(root, k); if (!existsSync(f)) return null; const t = readFileSync(f, 'utf8'); return { etag: `"${k}"`, text: async () => t, json: async () => JSON.parse(t) }; }, head: async (k) => (existsSync(join(root, k)) ? { etag: `"${k}"` } : null) };
  const env = { STORE: store, SYNC_OPEN: '0', E2E_OFFLINE: '1' };
  const server = new Server(manifest);
  await server.init({ env, read: async () => { throw new Error('no assets'); } });
  const platform = { env, ctx: { waitUntil() {} }, context: { waitUntil() {} }, caches: undefined, cf: {} };
  let n = 0;
  const get = async (p) => { const ip = `2001:db8:${(++n % 65536).toString(16)}::1`; const r = await server.respond(new Request(`https://cultifolio.com${p}`, { headers: { accept: 'text/html' } }), { platform, getClientAddress: () => ip }); return { status: r.status, location: r.headers.get('location'), text: await r.text() }; };
  return { get };
}

const before = await serverOf(baseProject, baseRoot);
const after = await serverOf(newProject, newRoot);
const withoutData = (html) => html.replace(/<script>\s*\{\s*__sveltekit_[\s\S]*?<\/script>/, '<script>…</script>');
const dataOf = (json) => { const j = JSON.parse(json); const node = j.nodes[j.nodes.length - 1]; return node?.type === 'data' ? devalue.unflatten(node.data) : null; };
// A page id, written as its page's GBIF key; anything else as it is.
const g = (k) => (typeof k === 'string' && /^[kg]\d+$/.test(k) ? (gbifOf.get(k) ?? Number(k.slice(1))) : k);
// The page data of this round with every id written as a GBIF key, and the fields that carry only an id's change set aside.
function byGbif(x, path = []) {
  if (Array.isArray(x)) return x.map((y) => byGbif(y, path));
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'gbif' && 'key' in x) continue; // a card's GBIF key, which its `key` now is
    if (k === 'key' && path.length <= 2) { o.key = 'gbif' in x ? x.gbif : g(v); continue; }
    o[k] = byGbif(v, [...path, k]);
  }
  return o;
}
const setAside = (d) => {
  if (!d?.d) return d;
  const x = structuredClone(d);
  delete x.d.v;
  if (x.d.changed) delete x.d.changed.h;
  if (x.d.distribution?.via?.page) x.d.distribution.via.page = String(g(x.d.distribution.via.page));
  return x;
};
const tally = { pages: 0, html: 0, data: 0, statuses: {}, ids: 0 };
const diffs = [];
const differ = (what, p, a, b) => { if (diffs.length < 20) diffs.push(`${what} ${p}\n    before: ${String(a).slice(0, 400)}\n    after:  ${String(b).slice(0, 400)}`); };
for (const p of paths) {
  tally.pages++;
  const [a, b] = [await before.get(p), await after.get(p)];
  if (a.status !== b.status || a.location !== b.location) { differ('status', p, `${a.status} ${a.location}`, `${b.status} ${b.location}`); continue; }
  tally.statuses[a.status] = (tally.statuses[a.status] ?? 0) + 1;
  if (a.status !== 200) { differ('not a page', p, a.status, b.status); continue; }
  // The species page's `data-key` is its id now: written back as its GBIF key, the rest of the HTML must be the same.
  const html = withoutData(b.text).replace(/data-key="([kg]\d+)"/g, (_, id) => { tally.ids++; return `data-key="${g(id)}"`; });
  if (withoutData(a.text) === html) tally.html++;
  else { const x = withoutData(a.text), y = html; let i = 0; while (x[i] === y[i]) i++; differ('html', p, x.slice(i - 80, i + 200), y.slice(i - 80, i + 200)); }
  const [da, db] = [dataOf((await before.get(`${p.split('?')[0]}/__data.json${p.includes('?') ? `?${p.split('?')[1]}` : ''}`)).text), dataOf((await after.get(`${p.split('?')[0]}/__data.json${p.includes('?') ? `?${p.split('?')[1]}` : ''}`)).text)];
  if (!da || !db) { differ('no data', p, !!da, !!db); continue; }
  const x = setAside(da), y = setAside(byGbif(db));
  if (x?.d) delete x.d.v;
  if (isDeepStrictEqual(x, y)) tally.data++;
  else differ('data', p, JSON.stringify(x).slice(0, 3000), JSON.stringify(y).slice(0, 3000));
}
console.log(JSON.stringify(tally));
for (const d of diffs) console.log(d);
process.exit(diffs.length ? 1 : 0);
