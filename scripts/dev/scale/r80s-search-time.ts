/**
 * Round eighty (S): where a search's time goes, from the key files `r80s-search-size.ts` wrote to a directory. Each query
 * is asked of `searchFromFiles` over a bucket that answers every read after `LAT` milliseconds and at most six reads at
 * once, as a Worker's invocation may hold six connections open (Cloudflare's limit, which R2 reads count towards). Cold:
 * nothing held, every directory, table and block read again; warm: the directories, tables and blocks held from the
 * first query, as an isolate's product cache holds them, the key files never. For each query: the wall time, the CPU
 * time of the process, the reads and bytes, the waves of reads (`wall / LAT`, rounded), and the hits (N of them, 60 when
 * not given). Dev only.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r80s-search-time.ts <dir> <species> <queries file> [cold|warm] [LAT ms]
 */
import { readFileSync } from 'node:fs';
import { searchFromFiles, searchDirsFor, type SearchReader, type Dir, type Answers, type Tables, type Blocks } from '$core/search-files';

const [dir, speciesArg, list, mode = 'cold', latArg = '40'] = process.argv.slice(2);
const LAT = Number(latArg);
const species = Number(speciesArg);
const queries = readFileSync(list, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const named = (n: string) => readFileSync(`${dir}/${n.replace(/\//g, '_')}`, 'utf8');
const hashed = (h: string) => readFileSync(`${dir}/${h}.json`, 'utf8');

let open = 0, reads = 0, bytes = 0, t0 = 0;
const trace: string[] = [];
const TRACE = !!process.env.TRACE;
const waiting: Array<() => void> = [];
/** One read of the bucket: six at once at most, each `LAT` ms. */
async function get(read: () => string, what = ''): Promise<string> {
  if (open >= 6) await new Promise<void>((r) => waiting.push(r));
  open++;
  if (TRACE) trace.push(`${String(Math.round(performance.now() - t0)).padStart(5)} ${what}`);
  try {
    await new Promise((r) => setTimeout(r, LAT));
    const t = read();
    reads++;
    bytes += t.length;
    return t;
  } finally {
    open--;
    waiting.shift()?.();
  }
}
const held = new Map<string, Promise<unknown>>();
const keep = <T,>(k: string, f: () => Promise<T>): Promise<T> => { let p = held.get(k) as Promise<T> | undefined; if (!p) held.set(k, (p = f())); return p; };
let blocksP: Promise<Blocks> | null = null;
const reader: SearchReader<unknown> & { warm?: () => void } = {
  dirs: searchDirsFor(species),
  // As the Worker's reader (round eighty): the tables, the blocks' names and every photograph block, once an isolate. Off with NOWARM=1, as on the base.
  ...(process.env.NOWARM ? {} : { warm: () => { void reader.tables(); void reader.genera(); void (async () => { blocksP ??= keep('blocks', async () => JSON.parse(await get(() => named('search/blocks.json'), 'blocks')) as Blocks); const bl = await blocksP; bl.photos.forEach((_, b) => void reader.photos(b)); })(); } }),
  dir: (name) => keep(`d:${name}`, async () => JSON.parse(await get(() => named(`search/${name}.json`), `dir ${name}`)) as Dir),
  node: (h) => get(() => hashed(h), `node ${h.slice(0, 6)}`),
  answers: (h) => keep(`a:${h}`, async () => JSON.parse(await get(() => hashed(h), 'answers')) as Answers),
  genera: () => keep('genera', async () => new Set(JSON.parse(await get(() => named('search/genera.json'), 'genera')) as string[])),
  tables: () => keep('tables', async () => JSON.parse(await get(() => named('search/tables.json'), 'tables')) as Tables),
  photos: async (b) => { blocksP ??= keep('blocks', async () => JSON.parse(await get(() => named('search/blocks.json'), 'blocks')) as Blocks); const bl = await blocksP; return keep(`p:${b}`, async () => JSON.parse(await get(() => hashed(bl.photos[b]), `photos ${b}`)) as number[]); },
  show: async (b) => { blocksP ??= keep('blocks', async () => JSON.parse(await get(() => named('search/blocks.json'), 'blocks')) as Blocks); const bl = await blocksP; return keep(`s:${b}`, async () => JSON.parse(await get(() => hashed(bl.show[b]), `show ${b}`)) as unknown[]); }
};
const rows: string[] = [];
for (const q of queries) {
  if (mode === 'cold') { held.clear(); blocksP = null; }
  reads = 0; bytes = 0; trace.length = 0;
  const c0 = process.cpuUsage();
  const t = (t0 = performance.now());
  const a = await searchFromFiles(reader, q, Number(process.env.N ?? 60));
  const wall = performance.now() - t;
  const c = process.cpuUsage(c0);
  const hits = 'hits' in a ? a.hits.length : 'narrow' in a ? 'narrow' : 'stop';
  const total = 'total' in a ? a.total : undefined;
  if (TRACE) rows.push(trace.join('\n'));
  rows.push(`${q.padEnd(34)} wall ${String(Math.round(wall)).padStart(5)} ms  cpu ${String(Math.round((c.user + c.system) / 1000)).padStart(4)} ms  reads ${String(reads).padStart(3)}  waves ${String(Math.round(wall / LAT)).padStart(3)}  bytes ${String(bytes).padStart(8)}  hits ${hits}${total !== undefined ? ` of ${total}` : ''}`);
}
console.log(`${mode}, ${LAT} ms a read, six at once\n${rows.join('\n')}`);
