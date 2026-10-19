// Round seventy-seven (C): every species page shows the same after this round's change as before it, on the real corpus.
// Two built Workers (`.svelte-kit/output/server`), each over its own corpus directory (the base build over round
// seventy-six's products, this round's over its own), answer every page; for each:
//   - the HTML, without Kit's hydration script (which carries the page data), is the same byte for byte;
//   - the page data is the same but for what this round takes out or reshapes: `d.occurrences.open` (now `points`, each
//     record's latitude and longitude, in order), `d.occurrences.datasets` (now `datasets`, their count), and `worldSvg`
//     and `regionSvg`, which the page now draws from `d` and `points`: drawn here by the page's own function from the new
//     data, each is the old string exactly.
//
//   node scripts/dev/scale/r77c-page-proof.mjs <base build> <its corpus root> <new build> <its corpus root> <paths file>
// Prints the counts and the first differences; exits 1 on any.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const [baseProject, baseRoot, newProject, newRoot, list] = process.argv.slice(2);
const paths = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const devalue = await import(pathToFileURL(resolve(newProject, 'node_modules/devalue/index.js')).href);

async function serverOf(project, root) {
  const { Server } = await import(pathToFileURL(resolve(project, '.svelte-kit/output/server/index.js')).href);
  const { manifest } = await import(pathToFileURL(resolve(project, '.svelte-kit/cloudflare-tmp/manifest.js')).href);
  const store = { get: async (k) => { const f = join(root, k); if (!existsSync(f)) return null; const t = readFileSync(f, 'utf8'); return { etag: `"${k}"`, text: async () => t, json: async () => JSON.parse(t) }; }, head: async (k) => (existsSync(join(root, k)) ? { etag: `"${k}"` } : null) };
  const env = { STORE: store, SYNC_OPEN: '0', E2E_OFFLINE: '1' };
  const server = new Server(manifest);
  await server.init({ env, read: async () => { throw new Error('no assets'); } });
  const platform = { env, ctx: { waitUntil() {} }, context: { waitUntil() {} }, caches: undefined, cf: {} };
  // Each request from an address of its own (the documentation range, a /48 each), so no rate limit answers in a page's place.
  let n = 0;
  const get = async (p) => { const ip = `2001:db8:${(++n % 65536).toString(16)}::1`; const r = await server.respond(new Request(`https://cultifolio.com${p}`, { headers: { accept: 'text/html' } }), { platform, getClientAddress: () => ip }); return { status: r.status, location: r.headers.get('location'), text: await r.text() }; };
  return { get };
}
// The world and regional maps as the page draws them ($lib/map/still), bundled into the new build's server output.
const still = await (async () => {
  const { build } = await import(pathToFileURL(resolve(newProject, 'node_modules/esbuild/lib/main.js')).href);
  const out = await build({ entryPoints: [resolve(newProject, 'src/lib/map/still.ts')], bundle: true, write: false, format: 'esm', platform: 'node', alias: { $core: resolve(newProject, 'src/lib/core') } });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
})();

const before = await serverOf(baseProject, baseRoot);
const after = await serverOf(newProject, newRoot);
const withoutData = (html) => html.replace(/<script>\s*\{\s*__sveltekit_[\s\S]*?<\/script>/, '<script>…</script>');
const dataOf = (json) => { const j = JSON.parse(json); const node = j.nodes[j.nodes.length - 1]; return node?.type === 'data' ? devalue.unflatten(node.data) : null; };
const tally = { pages: 0, html: 0, data: 0, maps: 0, statuses: {} };
const diffs = [];
const differ = (what, p, a, b) => { if (diffs.length < 20) diffs.push(`${what} ${p}\n    before: ${String(a).slice(0, 300)}\n    after:  ${String(b).slice(0, 300)}`); };
for (const p of paths) {
  tally.pages++;
  const [a, b] = [await before.get(p), await after.get(p)];
  if (a.status !== b.status || a.location !== b.location) { differ('status', p, `${a.status} ${a.location}`, `${b.status} ${b.location}`); continue; }
  tally.statuses[a.status] = (tally.statuses[a.status] ?? 0) + 1;
  // Every page asked is one the corpus holds: anything but a page is a fault of the run, not a sameness.
  if (a.status !== 200) { differ('not a page', p, a.status, b.status); continue; }
  if (withoutData(a.text) === withoutData(b.text)) tally.html++;
  else { const x = withoutData(a.text), y = withoutData(b.text); let i = 0; while (x[i] === y[i]) i++; differ('html', p, x.slice(i - 80, i + 200), y.slice(i - 80, i + 200)); }
  const [da, db] = [dataOf((await before.get(`${p.split('?')[0]}/__data.json`)).text), dataOf((await after.get(`${p.split('?')[0]}/__data.json`)).text)];
  if (!da || !db) { differ('no data', p, !!da, !!db); continue; }
  if (!p.startsWith('/species/')) { if (isDeepStrictEqual(da, db)) { tally.data++; tally.maps++; } else differ('data', p, JSON.stringify(da), JSON.stringify(db)); continue; }
  // What this round takes out of the page's data, and what it carries instead.
  const { open, datasets, ...occ } = da.d.occurrences;
  const expected = { ...da, d: { ...da.d, occurrences: occ }, points: open.map((x) => [x[0], x[1]]), datasets: datasets.length };
  delete expected.worldSvg; delete expected.regionSvg;
  if (isDeepStrictEqual(expected, db)) tally.data++;
  else differ('data', p, JSON.stringify(expected).slice(0, 2000), JSON.stringify(db).slice(0, 2000));
  const world = still.worldSvg(db.d.distribution.boxes, db.d.centroid, `Native range of ${db.d.name.scientific}`);
  const region = still.regionSvg(db.d.distribution.boxes, db.points, db.d.centroid, `Openly licensed records of ${db.d.name.scientific}`);
  if (typeof da.worldSvg === 'string' && da.worldSvg.startsWith('<svg') && world === da.worldSvg && region === da.regionSvg) tally.maps++;
  else differ('maps', p, da.worldSvg + da.regionSvg, world + region);
}
console.log(JSON.stringify(tally));
for (const d of diffs) console.log(d);
process.exit(diffs.length ? 1 : 0);
