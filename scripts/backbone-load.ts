/**
 * GBIF's backbone, read from its simple export (`simple.txt.gz`, https://hosted-datasets.gbif.org/datasets/backbone/current/,
 * 466 MB; round seventy-three) for `--list-extra-keys`: the plants' usages of the words asked for, and every plant usage's
 * place (its accepted usage or parent, and its rank), so the keys GBIF files a record under can be read without asking
 * GBIF once a key. Streamed through gunzip; never held whole. Node only.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { kewForm, type Usage, type Backbone } from '../src/lib/dossier/extra-keys';

const RANK = ['', 'SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM', 'GENUS', 'OTHER'];
const rankCode = (r: string) => { const i = RANK.indexOf(r); return i > 0 ? i : 6; };
/** The export's columns (no header): id, parent_key, basionym_key, is_synonym, status, rank, ..., kingdom_key at 10, ..., species_key at 16, scientific_name at 18, canonical_name at 19, authorship at 24, bracket_authorship at 26. */
const C = { id: 0, parent: 1, syn: 3, status: 4, rank: 5, kingdom: 10, species: 16, sci: 18, canonical: 19, author: 24, bracket: 26 };
const nul = (s: string | undefined) => (s && s !== '\\N' ? s : '');

/** The usage of one export row. */
export function usageOfRow(c: string[]): Usage {
  const a = nul(c[C.author]), b = nul(c[C.bracket]);
  return { key: Number(c[C.id]), parent: nul(c[C.parent]) ? Number(c[C.parent]) : undefined, status: c[C.status], rank: c[C.rank], canonical: nul(c[C.canonical]), author: `${b ? `(${b})${a ? ' ' : ''}` : ''}${a}`, label: nul(c[C.sci]) };
}

export interface LoadedBackbone extends Backbone {
  /** Plant usages read. */
  size: number;
  /** A second pass: the usages GBIF files under any of these keys (their synonyms, the taxa below them and theirs). */
  readUnder(keys: ReadonlySet<number>): Promise<void>;
}

async function eachRow(file: string, each: (c: string[]) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    const c = line.split('\t');
    if (c[C.kingdom] !== '6') continue; // Plantae
    each(c);
  }
}

/** Read the plants' usages of `wanted` (words as Kew writes them) and every plant usage's place. Null without the file. */
export async function loadBackbone(file: string, wanted: ReadonlySet<string>): Promise<LoadedBackbone | null> {
  if (!existsSync(file)) return null;
  const MAX = 16_000_000;
  const parent = new Int32Array(MAX), rank = new Uint8Array(MAX), syn = new Uint8Array(MAX);
  const byWords = new Map<string, Usage[]>();
  const byKey = new Map<number, Usage>();
  let size = 0;
  await eachRow(file, (c) => {
    const k = Number(c[C.id]);
    if (!(k > 0 && k < MAX)) return;
    size++;
    parent[k] = nul(c[C.parent]) ? Number(c[C.parent]) : 0;
    rank[k] = rankCode(c[C.rank]);
    syn[k] = c[C.syn] === 't' ? 1 : 0;
    const u = usageOfRow(c);
    const w = kewForm(u);
    if (w && wanted.has(w)) { byWords.set(w, [...(byWords.get(w) ?? []), u]); byKey.set(k, u); }
    if (size % 500_000 === 0) process.stdout.write(`\r  GBIF backbone: ${(size / 1e6).toFixed(1)} M plant usages…   `);
  });
  process.stdout.write(`\r  GBIF backbone: ${size} plant usages read; ${byKey.size} of the words asked for      \n`);
  const lineage = (key: number): number[] => {
    const out = [key];
    let k = key;
    if (syn[k] && parent[k]) { k = parent[k]; out.push(k); }
    // Up to the species: a variety's records are its species', and a taxonKey search of the species holds them.
    for (let i = 0; i < 4 && rank[k] > 1 && rank[k] < 5 && parent[k]; i++) { k = parent[k]; out.push(k); }
    return out;
  };
  const under = new Map<number, Usage[]>();
  return {
    size,
    usagesOf: (w) => byWords.get(w) ?? [],
    usage: (k) => byKey.get(k),
    lineage,
    under: (k) => under.get(k) ?? [],
    async readUnder(keys) {
      if (!keys.size) return;
      await eachRow(file, (c) => {
        const k = Number(c[C.id]);
        if (!(k > 0 && k < MAX) || keys.has(k)) return;
        const up = lineage(k).slice(1);
        const at = up.find((x) => keys.has(x));
        if (at === undefined) return;
        under.set(at, [...(under.get(at) ?? []), usageOfRow(c)]);
      });
    }
  };
}
