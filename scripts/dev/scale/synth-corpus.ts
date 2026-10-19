/**
 * A corpus directory from a (synthetic) index, as `--index` writes one, for the cold measurements and the workerd memory
 * test (round seventy-six; docs/SCALE-STUDY.md section 6): the manifest and every product under `s/v<N>/p/`, the top-level
 * index, and the dossiers named, copied from a real corpus (the synthetic index keeps the real entries' keys first).
 * Sheets are written empty. Never the corpus: dev only.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/synth-corpus.ts <index.json> <real s/v3> <out dir> <key>...
 */
import { DOSSIER_V } from '../../../src/lib/dossier/schema';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { buildProducts } from '../../../src/lib/dossier/products';
import { productPath } from '../../../src/lib/dossier/manifest';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

const [file, real, out, ...keys] = process.argv.slice(2);
const text = readFileSync(file, 'utf8');
const idx = JSON.parse(text) as IndexEntry[];
mkdirSync(`${out}/s/v${DOSSIER_V}/p`, { recursive: true });
const t = Date.now();
// Round seventy-seven: the search's key files, written as they are made.
const { manifest, files, storedHashes } = buildProducts(idx, text, () => new Map(), '2026-10-17T00:00:00.000Z', [], undefined, (h, body) => writeFileSync(`${out}/${productPath(h)}`, body));
for (const [name, body] of files) writeFileSync(`${out}/${productPath(manifest.files[name])}`, body);
writeFileSync(`${out}/s/v${DOSSIER_V}/manifest.json`, JSON.stringify(manifest, null, 1));
writeFileSync(`${out}/s/v${DOSSIER_V}/index.json`, text);
for (const k of keys) if (existsSync(`${real}/${k}.json`)) copyFileSync(`${real}/${k}.json`, `${out}/s/v${DOSSIER_V}/${k}.json`);
console.log(`${idx.length} species → ${out}/s/v${DOSSIER_V}: corpus ${manifest.id}, ${files.size} products and ${storedHashes.size} search key files, ${((Date.now() - t) / 1000).toFixed(0)} s`);
