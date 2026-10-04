/**
 * The build's products from an index (round fifty-three, 2; src/lib/dossier/manifest.ts): the index itself, the
 * entries and the sheets of each bucket (the count chosen for the corpus's size), the search's postings (round
 * fifty-six, 1; $core/postings), and the nine catalogues' rows; and the manifest that names them. Everything the
 * Worker used to derive from the index in memory, derived once on the PC. Pure: the script writes each body under its
 * hash, and a file already on disk under that hash is the same file, so a build that changed a little writes only the
 * files that differ, and the copy up carries only those.
 */
import type { IndexEntry } from './index-entry';
import type { Sheet } from './sheet';
import { DOSSIER_V } from './schema';
import { bucketOf, bucketsFor, bucketNames } from '$core/bucket';
import { buildPostings, postingFilesFor } from '$core/postings';
import { prepare, search } from '$core/search';
import { contentHash, SHORT_HITS, type Manifest } from './manifest';
import { md5 } from './md5';
import { catalogueOf, rowsOnly, catalogueFile, BYS, CHIPS } from './catalogue';

export interface Products {
  manifest: Manifest;
  /** Each product's body by its name (stored under its hash, `manifest.files[name]`). */
  files: Map<string, string>;
}

export function buildProducts(index: IndexEntry[], indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>, built = new Date().toISOString()): Products {
  const files = new Map<string, string>();
  const hashes: Record<string, string> = {};
  const put = (name: string, body: string) => { files.set(name, body); hashes[name] = md5(body); };
  put('index.json', indexText);
  const buckets = bucketsFor(index.length);
  const entries = new Map<string, IndexEntry[]>();
  for (const e of index) { const b = bucketOf(e.slug, buckets); (entries.get(b) ?? entries.set(b, []).get(b)!).push(e); }
  for (const b of bucketNames(buckets)) put(`entries/${b}.json`, JSON.stringify(entries.get(b) ?? []));
  const sheets = sheetsOf(buckets);
  for (const b of bucketNames(buckets)) put(`sheets/${b}.json`, JSON.stringify(sheets.get(b) ?? []));
  const postings = postingFilesFor(index.length);
  const posted = buildPostings(index, postings);
  for (const [f, body] of posted) put(`postings/${f}.json`, JSON.stringify(body));
  // The first keystrokes' answers (round fifty-eight): every key of one or two characters that begins a word, with the
  // whole index's best hundred for it as positions in the index. A one-letter query matches most of the index; ranking
  // it per request cost what the whole index costs (the first reviewer's finding 13).
  const whole = prepare(index);
  const place = new Map(index.map((e, i) => [e, i]));
  const short: Record<string, number[]> = {};
  for (const body of posted.values()) for (const k of Object.keys(body)) if (k.length <= 2 && !Object.hasOwn(short, k)) short[k] = search(whole, k, SHORT_HITS).map((e) => place.get(e)!).filter((i) => i !== undefined);
  put('short.json', JSON.stringify(Object.fromEntries(Object.entries(short).sort(([a], [b]) => (a < b ? -1 : 1)))));
  for (const by of BYS) for (const chip of CHIPS) put(catalogueFile(by, chip), JSON.stringify(rowsOnly(catalogueOf(index, by, chip))));
  // The id names everything in the directory, not the index alone: a dossier change that leaves its index entry as it was
  // still changes its sheet, and a sheet rewritten under an unchanged id sat in every cache for a day (round fifty-four, 3; both reviewers).
  const id = contentHash([...files.keys()].sort().map((n) => `${n}=${hashes[n]}`).join('\n')).slice(0, 16);
  const manifest: Manifest = { v: DOSSIER_V, id, built, species: index.length, buckets, postings, files: hashes };
  return { manifest, files };
}
