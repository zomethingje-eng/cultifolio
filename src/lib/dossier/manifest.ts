/**
 * The corpus manifest and the products the build writes beside the dossiers (round fifty-three, 2). The Worker used to
 * derive everything it served from the index in memory: the search's prepared structure, the entries of each bucket,
 * nine catalogues of rows. The build derives them once, on the PC, and the manifest says which are current.
 *
 * Every product is stored under the hash of its content (round fifty-six, 2): `s/v2/p/<hash>.json`, immutable, so no
 * cache ever holds one file's body under another's name, and a refresh uploads only the files whose content changed
 * (round fifty-three's directory per corpus id carried every file again, 36 MB at nine thousand species, for a change
 * to one sheet). The manifest maps each product's name to its hash:
 *
 *   s/v2/manifest.json                 { v, id, built, species, buckets, postings, files: { name: hash } }
 *   index.json                         the index, as the Worker reads it under this id
 *   entries/<bucket>.json              the index entries of a bucket (/api/entries)
 *   sheets/<bucket>.json               the sheets of a bucket (/api/sheets)
 *   postings/<file>.json               the search's postings: which entries each short key can match (/api/search; $core/postings)
 *   catalogue/<by>-<chip>.json         a catalogue's rows (/, /api/rows)
 *
 * A Worker that finds no manifest (a corpus uploaded before the manifest, the fixture corpus) derives as it did.
 */
import { DOSSIER_V } from './schema';
import { bucketsFor, bucketNames } from '$core/bucket';
import { postingFilesFor, postingFileNames } from '$core/postings';
import { BYS, CHIPS, catalogueFile } from './catalogue';

export interface Manifest {
  v: number;
  /** The corpus id: a hash of the index's content, so the same index is the same id on every build. */
  id: string;
  built: string;
  species: number;
  buckets: number;
  /** How many files the search's postings are split into ($core/postings). */
  postings: number;
  /** Every product by its name, with the hash of its content, which is also where it is stored. */
  files: Record<string, string>;
}

export const manifestPath = () => `s/v${DOSSIER_V}/manifest.json`;
/** Where a product is stored: under the hash of its content. */
export const productPath = (hash: string) => `s/v${DOSSIER_V}/p/${hash}.json`;
/** A product file's hash as the manifest may name it: hex, so it can be nothing but a file name. */
export const isFileHash = (h: unknown): h is string => typeof h === 'string' && /^[0-9a-f]{16,64}$/.test(h);

/** FNV-1a, 64 bits as two 32-bit halves, hex: the corpus id. Not a security hash; a name. A product file is named by its md5 (products.ts). */
export function contentHash(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Whether `x` is a manifest this build can serve from: the shape, integer counts that are the ones the build chooses for
 * the number of species, and a hash for every product the routes read (round fifty-eight; the first reviewer's finding
 * 15: a manifest naming only an index, or a bucket count of 7, was adopted). `short.json` is optional: a manifest from
 * before round fifty-eight has none, and the search reads the postings then.
 */
export const isManifest = (x: unknown): x is Manifest => {
  const m = x as Manifest;
  if (!m || typeof m !== 'object' || m.v !== DOSSIER_V) return false;
  if (typeof m.id !== 'string' || !/^[A-Za-z0-9._-]{4,40}$/.test(m.id)) return false;
  if (!Number.isInteger(m.species) || m.species < 1) return false;
  if (!Number.isInteger(m.buckets) || m.buckets !== bucketsFor(m.species)) return false;
  if (!Number.isInteger(m.postings) || m.postings !== postingFilesFor(m.species)) return false;
  if (!m.files || typeof m.files !== 'object' || !Object.values(m.files).every(isFileHash)) return false;
  const need = ['index.json', ...bucketNames(m.buckets).flatMap((b) => [`entries/${b}.json`, `sheets/${b}.json`]), ...postingFileNames(m.postings).map((f) => `postings/${f}.json`), ...BYS.flatMap((by) => CHIPS.map((chip) => catalogueFile(by, chip)))];
  return need.every((name) => Object.hasOwn(m.files, name));
};

/** How many of the whole index's hits `short.json` keeps for each key of one or two letters: the search route's most. */
export const SHORT_HITS = 100;
