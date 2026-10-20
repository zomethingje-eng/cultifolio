// Round seventy-nine (Z): what the built Worker reads from the bucket to answer each path, in node (`.svelte-kit/output/server`,
// as r78-page-proof.mjs runs it), over a corpus directory; one fresh server for all the paths, as one copy answers them.
// Writes the bucket keys read (one a line, relative to the corpus root) for workerd-heap.mjs and page-cpu-workerd.mjs to
// seed (ONLY=<that file>), so a local R2 holds what the measured requests read and not a 2 GB corpus twice; and prints,
// for each path, its status, its size and the files and bytes it read.
//
//   node scripts/dev/scale/r79-reads.mjs <built project> <dir holding s/v3> <paths file> <keys out>
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [project, root, list, keysOut] = process.argv.slice(2);
const paths = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const read = new Set();
let step = [];
const store = {
  get: async (k) => { step.push(k); read.add(k); const f = join(root, k); if (!existsSync(f)) return null; const t = readFileSync(f, 'utf8'); return { etag: `"${k}"`, text: async () => t, json: async () => JSON.parse(t) }; },
  head: async (k) => { read.add(k); return existsSync(join(root, k)) ? { etag: `"${k}"` } : null; }
};
const { Server } = await import(pathToFileURL(resolve(project, '.svelte-kit/output/server/index.js')).href);
const { manifest } = await import(pathToFileURL(resolve(project, '.svelte-kit/cloudflare-tmp/manifest.js')).href);
const env = { STORE: store, SYNC_OPEN: '0', E2E_OFFLINE: '1' };
const server = new Server(manifest);
await server.init({ env, read: async () => { throw new Error('no assets'); } });
const platform = { env, ctx: { waitUntil() {} }, context: { waitUntil() {} }, caches: undefined, cf: {} };
let n = 0;
for (const p of paths) {
  step = [];
  const ip = `2001:db8:${(++n % 65536).toString(16)}::1`;
  const r = await server.respond(new Request(`https://cultifolio.com${p}`, { headers: { accept: p.startsWith('/api/') ? 'application/json' : 'text/html' } }), { platform, getClientAddress: () => ip });
  const body = await r.text();
  const bytes = step.reduce((s, k) => { try { return s + statSync(join(root, k)).size; } catch { return s; } }, 0);
  console.log(JSON.stringify({ path: p, status: r.status, bytes: body.length, reads: step.length, readBytes: bytes }));
}
writeFileSync(keysOut, [...read].filter((k) => existsSync(join(root, k))).sort().join('\n') + '\n');
console.error(`${read.size} keys read → ${keysOut}`);
