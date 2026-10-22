/**
 * Round eighty (S): a corpus directory from an index, as synth-corpus.ts writes one, for measuring the Worker at the full
 * list's size in workerd (page-cpu-workerd.mjs), but a product already in `<link dir>` under its hash (the key files
 * r80s-search-size.ts wrote) is hard-linked from there, not written again, so two corpora that share most of their 1.8 GB
 * of key files take the disk once. No dossiers (a search reads none). Never the corpus: dev only.
 *
 *   node --max-old-space-size=3000 --import tsx scripts/dev/scale/r80s-corpus.ts <index.json> <out dir> [<link dir>]
 */
import { DOSSIER_V } from '../../../src/lib/dossier/schema';
import { mkdirSync, readFileSync, writeFileSync, existsSync, linkSync } from 'node:fs';
import { buildProducts } from '../../../src/lib/dossier/products';
import { productPath } from '../../../src/lib/dossier/manifest';

const [file, out, link] = process.argv.slice(2);
const text = readFileSync(file, 'utf8');
const idx = JSON.parse(text);
mkdirSync(`${out}/s/v${DOSSIER_V}/p`, { recursive: true });
let linked = 0, written = 0;
const put = (h: string, body: string) => {
  const to = `${out}/${productPath(h)}`;
  if (existsSync(to)) return;
  if (link && existsSync(`${link}/${h}.json`)) { linkSync(`${link}/${h}.json`, to); linked++; return; }
  writeFileSync(to, body);
  written++;
};
const t = Date.now();
const { manifest, files } = buildProducts(idx, text, () => new Map(), '2026-10-22T00:00:00.000Z', [], undefined, put);
for (const [name, body] of files) put(manifest.files[name], body);
writeFileSync(`${out}/s/v${DOSSIER_V}/manifest.json`, JSON.stringify(manifest, null, 1));
writeFileSync(`${out}/s/v${DOSSIER_V}/index.json`, text);
console.log(`${idx.length} species → ${out}: corpus ${manifest.id}, ${linked} linked, ${written} written, ${Math.round((Date.now() - t) / 1000)} s`);
