/**
 * Round seventy-seven: what each query's near pass would read, from a corpus directory's key files, with no cap
 * (docs/SCALE-STUDY.md section 6): the near bound as the directories count it, the species ranked, the files and bytes
 * read, the time, and the heap after. One line a query, for choosing `NEAR_CAP` and the worst cases for workerd.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r77-near.ts <s/v2 directory> <queries> <out.jsonl>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { searchFromFiles, searchDirsFor, type SearchReader } from '$core/search-files';

const [dir, queries, out] = process.argv.slice(2);
const m = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { species: number; files: Record<string, string> };
let bytes = 0;
const kinds: Record<string, number> = {};
let kind = 'other';
const text = (h: string): string => { const t = readFileSync(`${dir}/p/${h}.json`, 'utf8'); bytes += t.length; kinds[kind] = (kinds[kind] ?? 0) + t.length; return t; };
const file = <T,>(h: string): T => JSON.parse(text(h)) as T;
const named = <T,>(n: string): T => file<T>(m.files[n]);
const genera = new Set(named<string[]>('search/genera.json'));
const blocks = named<{ photos: string[]; show: string[] }>('search/blocks.json');
const r: SearchReader<unknown> = {
  dirs: searchDirsFor(m.species),
  dir: async (n) => { kind = 'dir'; return named(`search/${n}.json`); },
  node: async (h) => { kind = 'node'; return text(h); }, answers: async (h) => { kind = 'answers'; return file(h); }, genera: async () => genera,
  tables: async () => named('search/tables.json'), photos: async (b) => { kind = 'photos'; return file(blocks.photos[b]); }, show: async (b) => { kind = 'show'; return file(blocks.show[b]); }
};
const rows: string[] = [];
for (const line of readFileSync(queries, 'utf8').split('\n').filter(Boolean)) {
  const [q, kind] = line.split('\t');
  bytes = 0;
  for (const k of Object.keys(kinds)) delete kinds[k];
  const t = performance.now();
  const a = await searchFromFiles(r, q, 100, async () => false, Infinity, Infinity);
  if ('stop' in a) continue;
  rows.push(JSON.stringify({ q, kind, nearCount: a.nearCount, ranked: a.ranked, reads: a.reads, bytes, kinds: { ...kinds }, ms: Math.round(performance.now() - t), narrow: 'narrow' in a }));
}
writeFileSync(out, rows.join('\n') + '\n');
