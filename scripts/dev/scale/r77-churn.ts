/**
 * Round seventy-seven: what a refresh uploads (docs/SCALE-STUDY.md section 4, "content-hash naming keeps refreshes small").
 * Builds the products of an index, then of the same index with species changed as a daily `--fill inat` changes them
 * (a photograph more, another thumbnail and credit), and counts the files the second build has that the first has not:
 * what rclone would upload. Every product, the search's key files included, by hash.
 *
 *   node --max-old-space-size=6000 --import tsx scripts/dev/scale/r77-churn.ts <index.json> <label>
 */
import { readFileSync } from 'node:fs';
import { buildProducts } from '../../../src/lib/dossier/products';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

const [file, label = file] = process.argv.slice(2);
const text = readFileSync(file, 'utf8');
const base = JSON.parse(text) as IndexEntry[];

/** Every file of a build, by hash, with its size: what the bucket holds. */
const search = new Set<string>();
function build(idx: IndexEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  const p = buildProducts(idx, JSON.stringify(idx, null, 1), () => new Map(), '2026-10-18T00:00:00.000Z', [], undefined, (h, body) => { out.set(h, body.length); search.add(h); });
  for (const [name, body] of p.files) { out.set(p.manifest.files[name], body.length); if (name.startsWith('search/')) search.add(p.manifest.files[name]); }
  return out;
}
/** The species a photograph fill changes: deterministic, spread over the index. */
const changed = (idx: IndexEntry[], n: number): IndexEntry[] => {
  const step = Math.max(1, Math.floor(idx.length / n));
  const at = new Set(Array.from({ length: n }, (_, i) => (i * step + 7) % idx.length));
  return idx.map((e, i) => (at.has(i) ? { ...e, photos: e.photos + 1, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${900000000 + i}/medium.jpg`, credit: 'CC BY, a new photographer' } : e));
};
const t0 = Date.now();
const before = build(base);
const all = [...before.values()];
console.error(`${label}: first build ${Math.round((Date.now() - t0) / 1000)} s`);
for (const [what, n] of [['one species', 1], ['1 per cent', Math.round(base.length / 100)]] as const) {
  const after = build(changed(base, n));
  let files = 0, bytes = 0, sFiles = 0, sBytes = 0;
  for (const [h, size] of after) if (!before.has(h)) { files++; bytes += size; if (search.has(h)) { sFiles++; sBytes += size; } }
  console.log(JSON.stringify({ label, species: base.length, change: what, changedSpecies: n, filesInBuild: after.size, MBInBuild: +([...after.values()].reduce((a, b) => a + b, 0) / 1048576).toFixed(1), uploadFiles: files, uploadMB: +(bytes / 1048576).toFixed(2), ofWhichSearchFiles: sFiles, searchMB: +(sBytes / 1048576).toFixed(2) }));
}
void all;
