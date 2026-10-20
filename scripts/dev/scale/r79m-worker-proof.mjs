// Round seventy-nine (M, the merge): does this round's Worker serve round seventy-eight's live corpus as round seventy-eight's
// Worker does, so that it can be deployed before the full build's upload? Two built Workers (`.svelte-kit/output/server`
// of each project), the base's and this round's, answer the same paths over the same corpus folder; for each path:
//   - the status and any redirect are the same;
//   - a page's HTML, without Kit's hydration script (which carries the page data), is the same once the changes this round
//     makes on purpose to every page (NORMALISE below, each named) are set aside;
//   - a page's data (`__data.json`) is the same, deeply;
//   - an API answer or a file (`/api/…`, the sitemap) is the same byte for byte, but for `/api/corpus`'s new `keyless`.
// After round seventy-eight's r78-page-proof.mjs. With OVERLAY=<dir>, a file there is read before the corpus's own (to put a
// page without a GBIF key beside the corpus and ask the base's Worker for it).
//
//   node scripts/dev/scale/r79m-worker-proof.mjs <base project> <new project> <corpus root> <paths file>
// Prints the counts, each kind of difference with its first paths, and exits 1 on any difference not set aside.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const [baseProject, newProject, root, list] = process.argv.slice(2);
const paths = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const overlay = process.env.OVERLAY ?? null;
const devalue = await import(pathToFileURL(resolve(newProject, 'node_modules/devalue/index.js')).href);

async function serverOf(project) {
  const { Server } = await import(pathToFileURL(resolve(project, '.svelte-kit/output/server/index.js')).href);
  const { manifest } = await import(pathToFileURL(resolve(project, '.svelte-kit/cloudflare-tmp/manifest.js')).href);
  const file = (k) => [overlay && join(overlay, k), join(root, k)].find((f) => f && existsSync(f));
  const store = { get: async (k) => { const f = file(k); if (!f) return null; const t = readFileSync(f, 'utf8'); return { etag: `"${k}"`, text: async () => t, json: async () => JSON.parse(t) }; }, head: async (k) => (file(k) ? { etag: `"${k}"` } : null) };
  const env = { STORE: store, SYNC_OPEN: '0', E2E_OFFLINE: '1' };
  const server = new Server(manifest);
  await server.init({ env, read: async () => { throw new Error('no assets'); } });
  const platform = { env, ctx: { waitUntil() {} }, context: { waitUntil() {} }, caches: undefined, cf: {} };
  let n = 0;
  return async (p) => {
    const ip = `2001:db8:${(++n % 65536).toString(16)}::1`;
    const r = await server.respond(new Request(`https://cultifolio.com${p}`, { headers: { accept: 'text/html' } }), { platform, getClientAddress: () => ip });
    return { status: r.status, location: r.headers.get('location'), text: await r.text() };
  };
}

// What this round changes on every page on purpose, set aside so that anything else shows. Each is one agent's change.
const NORMALISE = [
  // The pages' inlined styles: this round adds the held lines' rules (F's `.notesline.hold`, `.hero.hold`); set aside whole.
  ['inlined styles', /<style[^>]*>[\s\S]*?<\/style>/g, '<style>…</style>'],
  // F: the species page holds "Your notes: none yet"'s line, unseen, while the collection opens (`.notesline.hold`).
  ['F notes line held', /<p class="[^"]*\bnotesline hold\b[^"]*"[^>]*>[\s\S]*?<\/p>/g, ''],
  // Svelte's hydration markers and class hashes move with any change of a component's markup.
  ['svelte class hashes', /\bsvelte-[a-z0-9]+\b/g, 'svelte-x'],
  ['hydration markers', /<!--\[[^\]>]*-->|<!--\]-->|<!---->/g, ''],
  // The built app's asset names are hashes of its code.
  ['asset hashes', /\/_app\/immutable\/[^"' )]+/g, '/_app/immutable/x'],
  // What is left where a block this round adds draws nothing on a page with a GBIF key (K's not-checked lines).
  ['runs of white space', /\s+/g, ' '],
  ['app version', /version:\s*"[^"]*"|"version":"[^"]*"|data-sveltekit-version="[^"]*"/g, 'version']
];
const used = new Map();
const norm = (html) => {
  let s = html.replace(/<script>\s*\{\s*__sveltekit_[\s\S]*?<\/script>/, '<script>…</script>');
  for (const [name, re, to] of NORMALISE) s = s.replace(re, (...m) => { used.set(name, (used.get(name) ?? 0) + 1); return to; });
  return s;
};
const dataOf = (json) => { try { const j = JSON.parse(json); const node = j.nodes?.[j.nodes.length - 1]; return node?.type === 'data' ? devalue.unflatten(node.data) : null; } catch { return null; } };

const before = await serverOf(baseProject);
const after = await serverOf(newProject);
const tally = { paths: 0, same: 0, statuses: {}, kinds: {} };
const kinds = new Map();
const differ = (kind, p, a, b) => {
  const k = kinds.get(kind) ?? { n: 0, first: [] };
  k.n++;
  if (k.first.length < 3) k.first.push(`${p}\n      base: ${String(a).slice(0, 300)}\n      this: ${String(b).slice(0, 300)}`);
  kinds.set(kind, k);
};
const t0 = Date.now();
for (const p of paths) {
  tally.paths++;
  const [a, b] = [await before(p), await after(p)];
  const s = `${a.status}→${b.status}`;
  tally.statuses[s] = (tally.statuses[s] ?? 0) + 1;
  if (a.status !== b.status || a.location !== b.location) { differ(`status ${s}`, p, `${a.status} ${a.location ?? ''} ${a.text.slice(0, 200)}`, `${b.status} ${b.location ?? ''} ${b.text.slice(0, 200)}`); continue; }
  if (a.status !== 200) { tally.same++; continue; }
  const page = !p.startsWith('/api/') && !/\.xml$|\.txt$/.test(p);
  if (!page) {
    let x = a.text, y = b.text;
    if (p === '/api/corpus') { const j = JSON.parse(y); delete j.keyless; y = JSON.stringify(j); }
    if (x === y) tally.same++;
    else { let i = 0; while (x[i] === y[i]) i++; differ(`${p.split('?')[0].replace(/\/[kg]\d+$/, '/<id>')} body`, p, x.slice(Math.max(0, i - 80), i + 160), y.slice(Math.max(0, i - 80), i + 160)); }
    continue;
  }
  const [x, y] = [norm(a.text), norm(b.text)];
  let ok = true;
  if (x !== y) { ok = false; let i = 0; while (x[i] === y[i]) i++; differ(`${p.split('/').slice(0, 2).join('/') || '/'} html`, p, x.slice(Math.max(0, i - 120), i + 200), y.slice(Math.max(0, i - 120), i + 200)); }
  const q = p.includes('?') ? `?${p.split('?')[1]}` : '';
  const base = p.split('?')[0].replace(/\/$/, '');
  const [da, db] = [dataOf((await before(`${base}/__data.json${q}`)).text), dataOf((await after(`${base}/__data.json${q}`)).text)];
  if (!isDeepStrictEqual(da, db)) { ok = false; differ(`${p.split('/').slice(0, 2).join('/') || '/'} data`, p, JSON.stringify(da).slice(0, 600), JSON.stringify(db).slice(0, 600)); }
  if (ok) tally.same++;
}
tally.seconds = Math.round((Date.now() - t0) / 1000);
tally.kinds = Object.fromEntries([...kinds].map(([k, v]) => [k, v.n]));
tally.setAside = Object.fromEntries(used);
console.log(JSON.stringify(tally, null, 1));
for (const [k, v] of kinds) console.log(`\n${k}: ${v.n}\n  ${v.first.join('\n  ')}`);
process.exit(kinds.size ? 1 : 0);
