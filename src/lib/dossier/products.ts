/**
 * The build's products from an index (round fifty-three, 2; src/lib/dossier/manifest.ts): the index itself, the
 * entries and the sheets of each bucket (the count chosen for the corpus's size), the search split into shards by
 * first character, and the nine catalogues' rows; and the manifest that names them. Everything the Worker used to
 * derive from the index in memory, derived once on the PC. Pure: the script writes what comes back, skipping a file
 * whose hash the previous manifest already holds, so a build whose index did not change writes nothing and one that
 * changed a little rewrites only the files that differ.
 */
import type { IndexEntry } from './index-entry';
import type { Sheet } from './sheet';
import { DOSSIER_V } from './schema';
import { bucketOf, bucketsFor, bucketNames } from '$core/bucket';
import { prepare } from '$core/search';
import { contentHash, shardSearch, type Manifest } from './manifest';
import { catalogueOf, rowsOnly, catalogueFile, BYS, CHIPS } from './catalogue';

export interface Products {
  manifest: Manifest;
  /** Each product's body by its name under `b/<id>/`. */
  files: Map<string, string>;
}

export function buildProducts(index: IndexEntry[], indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>, built = new Date().toISOString()): Products {
  const files = new Map<string, string>();
  const hashes: Record<string, string> = {};
  const put = (name: string, body: string) => { files.set(name, body); hashes[name] = contentHash(body); };
  put('index.json', indexText);
  const buckets = bucketsFor(index.length);
  const entries = new Map<string, IndexEntry[]>();
  for (const e of index) { const b = bucketOf(e.slug, buckets); (entries.get(b) ?? entries.set(b, []).get(b)!).push(e); }
  for (const b of bucketNames(buckets)) put(`entries/${b}.json`, JSON.stringify(entries.get(b) ?? []));
  const sheets = sheetsOf(buckets);
  for (const b of bucketNames(buckets)) put(`sheets/${b}.json`, JSON.stringify(sheets.get(b) ?? []));
  const shards = shardSearch(prepare(index));
  for (const [c, list] of [...shards].sort(([a], [b]) => a.localeCompare(b))) put(`search/${c}.json`, JSON.stringify(list));
  for (const by of BYS) for (const chip of CHIPS) put(catalogueFile(by, chip), JSON.stringify(rowsOnly(catalogueOf(index, by, chip))));
  // The id names everything in the directory, not the index alone: a dossier change that leaves its index entry as it was
  // still changes its sheet, and a sheet rewritten under an unchanged id sat in every cache for a day (round fifty-four, 3; both reviewers).
  const id = contentHash([...files.keys()].sort().map((n) => `${n}=${hashes[n]}`).join('\n')).slice(0, 16);
  const manifest: Manifest = { v: DOSSIER_V, id, built, species: index.length, buckets, search: [...shards.keys()].sort(), files: hashes };
  return { manifest, files };
}
