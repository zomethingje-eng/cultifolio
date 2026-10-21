/**
 * The heap a kept occurrence row costs in the build's sample (`OccIndex`), measured (round eighty, agent X). Run with
 * `node --expose-gc --import tsx scripts/dev/r80x-occ-memory.ts [species] [rows a species]`; prints one line of JSON.
 *
 * Why it matters: the full list's download is about 146 million records of 47,116 keys, and the sample keeps up to 2,000
 * a key (2,500 while it streams). On a random 500 of the list's keys (GBIF's count API, 2026-10-21), a key keeps 726 on
 * average, so about 34 million rows are held at once for the whole build. At round seventy-nine's 242 bytes a row that is
 * about 8.3 GB, more than the 8 GB of heap the corpus step gives the builder.
 */
import { OccIndex, occHeader, parseOccRow, SQL_SELECT } from '../../src/lib/dossier/bulk';

const S = Number(process.argv[2] ?? 400), R = Number(process.argv[3] ?? 500);
const h = occHeader(SQL_SELECT.map(([, a]) => a).join('\t'));
const ds = ['50c9509d-22c7-4a22-a47d-8c48425ef4a7', '7a3679ef-5582-4aaa-81f0-8c2545cafc81', 'd415c253-4d61-4459-9d25-4015b9084fb0'];
const lic = ['CC0_1_0', 'CC_BY_4_0', 'CC_BY_NC_4_0'];
const cc = ['ZA', 'US', 'MX', 'AU', 'BR'];
// The rows' lines first, so only the index is measured.
const lines: string[] = [];
let id = 3_000_000_000;
for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
  id += 7919;
  const lat = (-34 + ((id % 6000) / 100)).toFixed(6), lon = (18 + ((id % 4000) / 100)).toFixed(6);
  lines.push([id, 2_000_000 + s, 2_000_000 + s, 2_000_000 + s, lat, lon, r % 3 ? '' : '30.0', '', 2000 + (r % 25), cc[r % 5], 'HUMAN_OBSERVATION', lic[r % 3], ds[r % 3], r % 7 ? '' : 'Introduced', ''].join('\t'));
}
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('run with node --expose-gc');
gc();
// The heap and the typed arrays' buffers, which V8 counts apart from the heap.
const used = () => { const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
const before = used();
const idx = new OccIndex(2000, new Set(Array.from({ length: S }, (_, i) => 2_000_000 + i)));
for (const line of lines) { const o = parseOccRow(h, line); if (o) idx.add(o); }
idx.seal();
// Twice: what the first collection leaves of the stream's garbage is not the index's.
gc(); gc();
const bytes = used() - before;
// `lines` is read again here, so it stays alive through the second measure and is not counted as freed.
console.log(JSON.stringify({ species: S, lines: lines.length, kept: idx.kept, bytes, bytesPerRow: Math.round(bytes / idx.kept) }));
