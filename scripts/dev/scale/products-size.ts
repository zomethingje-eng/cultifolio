/**
 * The build's products for an index, as `--index` writes them (src/lib/dossier/products.ts), weighed by kind: count,
 * bytes, gzipped bytes and the largest file; and the time the build takes to make them. Sheets are left out (they are
 * made from the dossiers, which a synthetic index has none of); the study scales today's per species.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/products-size.ts <index.json>...
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildProducts } from '../../../src/lib/dossier/products';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, 'utf8');
  const idx = JSON.parse(text) as IndexEntry[];
  const t = performance.now();
  const { files, manifest } = buildProducts(idx, text, () => new Map());
  const ms = Math.round(performance.now() - t);
  const kinds: Record<string, { n: number; bytes: number; gz: number; max: number }> = {};
  for (const [name, body] of files) {
    if (name.startsWith('sheets/')) continue;
    const k = name.split('/')[0];
    const b = Buffer.byteLength(body);
    const x = (kinds[k] ??= { n: 0, bytes: 0, gz: 0, max: 0 });
    x.n++; x.bytes += b; x.gz += gzipSync(body).length; x.max = Math.max(x.max, b);
  }
  console.log(JSON.stringify({ file, species: idx.length, buckets: manifest.buckets, postings: manifest.postings, buildMs: ms, kinds }));
}
