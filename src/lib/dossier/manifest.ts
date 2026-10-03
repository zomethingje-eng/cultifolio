/**
 * The corpus manifest and the products the build writes beside the dossiers (round fifty-three, 2). The Worker used to
 * derive everything it served from the index in memory: the search's prepared structure, the entries of each bucket,
 * nine catalogues of rows. At nine thousand species that is tens of megabytes an isolate; at fifty thousand it is past
 * the isolate. The build derives them once, on the PC, under a directory named by the corpus id, and the manifest says
 * which id is current. Everything under `b/<id>/` is immutable: a refresh writes a new directory and then a new
 * manifest, so no cache ever holds a file of one corpus under the id of another, whatever order an upload lands in.
 *
 *   s/v2/manifest.json                 { v, id, built, species, buckets, search, files }
 *   s/v2/b/<id>/index.json             the index, as the Worker reads it under this id
 *   s/v2/b/<id>/entries/<bucket>.json  the index entries of a bucket (/api/entries)
 *   s/v2/b/<id>/sheets/<bucket>.json   the sheets of a bucket (/api/sheets)
 *   s/v2/b/<id>/search/<c>.json        the prepared search entries with a word beginning with c (/api/search)
 *   s/v2/b/<id>/catalogue/<by>-<chip>.json  a catalogue's rows (/, /api/rows)
 *
 * A Worker that finds no manifest (a corpus uploaded before this round, the fixture corpus) derives as it did.
 */
import { DOSSIER_V } from './schema';
import type { Prepared, Searchable } from '$core/search';

export interface Manifest {
  v: number;
  /** The corpus id: a hash of the index's content, so the same index is the same id on every build. */
  id: string;
  built: string;
  species: number;
  buckets: number;
  /** The search shards present (first characters), so a shard the corpus has no words for is known absent without a read. */
  search: string[];
  /** Every product file under `b/<id>/`, relative to it, with a hash of its content: the next build rewrites only what changed. */
  files: Record<string, string>;
}

export const manifestPath = () => `s/v${DOSSIER_V}/manifest.json`;
export const productPath = (id: string, name: string) => `s/v${DOSSIER_V}/b/${id}/${name}`;

/** FNV-1a, 64 bits as two 32-bit halves, hex: the corpus id and the file hashes. Not a security hash; a name. */
export function contentHash(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** The first characters of a prepared entry's words: the shards it belongs in. */
export function shardsOf<T extends Searchable>(p: Prepared<T>): Set<string> {
  const out = new Set<string>();
  for (const w of p.nameWords) if (w) out.add(w[0]);
  for (const w of p.otherWords) if (w) out.add(w[0]);
  for (const g of p.synWords) for (const w of g) if (w) out.add(w[0]);
  return out;
}

/** The prepared entries split into shards by first character: an entry is in every shard one of its words begins. */
export function shardSearch<T extends Searchable>(prepared: Prepared<T>[]): Map<string, Prepared<T>[]> {
  const out = new Map<string, Prepared<T>[]>();
  for (const p of prepared) for (const c of shardsOf(p)) (out.get(c) ?? out.set(c, []).get(c)!).push(p);
  return out;
}

export const isManifest = (x: unknown): x is Manifest => {
  const m = x as Manifest;
  return !!m && typeof m === 'object' && typeof m.id === 'string' && /^[A-Za-z0-9._-]{4,40}$/.test(m.id) && typeof m.buckets === 'number' && m.buckets >= 1 && Array.isArray(m.search) && !!m.files && typeof m.files === 'object' && typeof m.files['index.json'] === 'string' && m.v === DOSSIER_V;
};
