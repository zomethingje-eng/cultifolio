/**
 * The proposed Worker design's products, built from an index and weighed (docs/SCALE-STUDY.md section 2). Nothing here
 * is used by the app; it writes into OUTDIR for `design-cold.mjs` to read as a cold isolate would.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/design-products.ts <index.json> <OUTDIR>
 *
 * 1. Name shards (`names/<h>.json`): every lookup key a request resolves today from the whole index (a slug; an accepted
 *    name in lower case; each older name in lower case and as a slug, as `indexMaps` keys them) → the species' position
 *    in the index (one holder) or every holder (an older name two species hold: `indexMaps`' `ambiguous`). Shards by an
 *    FNV hash of the key, about 100 species a shard.
 * 2. The search core (`core.json`): what the ranking reads of every entry and nothing else (name, common names,
 *    spellings, family and origins as numbers into tables, older names, photographs), as arrays.
 * 3. Display blocks (`show/<n>.json`): what a result tile shows (key, slug, name, common, thumb, credit, photos, climate),
 *    256 entries a block by position, so a page of results reads a few blocks.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { slugify } from '../../../src/lib/core/names';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

const [file, out] = process.argv.slice(2);
const idx = JSON.parse(readFileSync(file, 'utf8')) as IndexEntry[];
mkdirSync(`${out}/names`, { recursive: true });
mkdirSync(`${out}/show`, { recursive: true });
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const report: Record<string, unknown> = { file, species: idx.length };

// 1. Name shards.
const shards = Math.max(64, 2 ** Math.ceil(Math.log2(idx.length / 100)));
const holders = new Map<string, Set<number>>();
const hold = (k: string, i: number) => { if (!k) return; (holders.get(k) ?? holders.set(k, new Set()).get(k)!).add(i); };
idx.forEach((e, i) => {
  hold(e.slug, i);
  hold(e.name.toLowerCase(), i);
  for (const s of [...(e.syn ?? []), ...(e.older ?? [])]) { hold(s.toLowerCase(), i); hold(slugify(s), i); }
});
const files = Array.from({ length: shards }, () => ({} as Record<string, number | number[]>));
for (const [k, s] of holders) files[fnv(k) % shards][k] = s.size === 1 ? [...s][0] : [...s];
let nb = 0, ngz = 0, max = 0;
files.forEach((f, i) => { const body = JSON.stringify(f); writeFileSync(`${out}/names/${i}.json`, body); nb += body.length; ngz += gzipSync(body).length; max = Math.max(max, body.length); });
report.names = { shards, keys: holders.size, bytes: nb, gz: ngz, maxShard: max };

// 2. The search core.
const families: string[] = [], origins: string[] = [];
const fam = new Map<string, number>(), ori = new Map<string, number>();
const id = (m: Map<string, number>, t: string[], s: string) => { let x = m.get(s); if (x === undefined) { x = t.length; t.push(s); m.set(s, x); } return x; };
const rows = idx.map((e) => [e.name, e.common ?? 0, e.commons ?? 0, e.spellings ?? 0, e.family ? id(fam, families, e.family) : -1, (e.origin ?? []).map((o) => id(ori, origins, o)), e.syn ?? 0, e.older ?? 0, e.photos ?? 0]);
const core = JSON.stringify({ families, origins, rows });
writeFileSync(`${out}/core.json`, core);
report.core = { bytes: core.length, gz: gzipSync(core).length };

// 3. Display blocks.
let sb = 0, sgz = 0, smax = 0, blocks = 0;
for (let i = 0; i < idx.length; i += 256) {
  const body = JSON.stringify(idx.slice(i, i + 256).map((e) => [e.key, e.slug, e.name, e.common ?? 0, e.thumb ?? 0, e.credit ?? 0, e.photos, e.climate]));
  writeFileSync(`${out}/show/${i / 256}.json`, body);
  sb += body.length; sgz += gzipSync(body).length; smax = Math.max(smax, body.length); blocks++;
}
report.show = { blocks, bytes: sb, gz: sgz, maxBlock: smax };
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
