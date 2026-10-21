/**
 * The heap the build's indexes keep of the text they were read from (round eighty, agent X). A field split from a line
 * that readline cut from a stream's 64 KB chunk is a slice of that chunk and keeps it alive: the full build stopped with
 * "JavaScript heap out of memory" while reading multimedia.txt, its photographs' index keeping the file's text alive. This
 * streams a multimedia.txt of `rows` rows (one in fifteen a photographed record's, as the download's are) and an
 * occurrence.txt of `rows` rows (2,000 datasets) through readline in 64 KB chunks, into `MediaIndex` and `OccIndex` as
 * `scripts/bulk-load.ts` does, and prints the heap each keeps, against the text's size, as one line of JSON.
 *
 *   node --expose-gc --import tsx scripts/dev/r80x-text-heap.ts [rows]
 */
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { MediaIndex, OccIndex, occHeader, parseMediaRow, parseOccRow, OCC_TERMS } from '../../src/lib/dossier/bulk';

const N = Number(process.argv[2] ?? 300_000);
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error('run with node --expose-gc');
const used = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const lines = (head: string, row: (i: number) => string) => {
  let bytes = 0;
  function* gen() {
    let b = head + '\n';
    for (let i = 0; i < N; i++) { b += row(i) + '\n'; if (b.length > 60_000) { bytes += b.length; yield Buffer.from(b); b = ''; } }
    bytes += b.length;
    yield Buffer.from(b);
  }
  const input = Readable.from(gen());
  input.setEncoding('utf8');
  return { rl: createInterface({ input, crlfDelay: Infinity }), bytes: () => bytes };
};

(async () => {
  // Photographs: record i is photographed and marked when i % 15 === 0, of species i % 1000.
  const owner = new Map<number, number>();
  for (let i = 0; i < N; i += 15) owner.set(1_000_000_000 + i, 2_000_000 + (i % 1000));
  let before = used();
  const media = new MediaIndex(owner);
  const m = lines('gbifID\ttype\tformat\tidentifier\treferences\ttitle\tcreated\tcreator\tpublisher\tlicense\trightsHolder', (i) => `${1_000_000_000 + i}\tStillImage\timage/jpeg\thttps://inaturalist-open-data.s3.amazonaws.com/photos/${i}/original.jpg\thttps://www.inaturalist.org/photos/${i}\t\t2021-05-12T10:11:12Z\tŁukasz Wróblewski ${i % 977}\tiNaturalist\thttp://creativecommons.org/licenses/by/4.0/\tŁukasz Wróblewski ${i % 977}`);
  let h: string[] = [], j = 0;
  for await (const line of m.rl) { if (j++ === 0) { h = occHeader(line); continue; } const r = parseMediaRow(h, line); if (r) media.add(r); }
  const mediaHeap = used() - before;
  // Records: 2,000 datasets, each first seen far into the file.
  before = used();
  const occ = new OccIndex(2000);
  const o = lines(OCC_TERMS.join('\t'), (i) => [1_000_000_000 + i, -33.5, 18.5, '', '', 2020, 'ZA', 'HUMAN_OBSERVATION', 'CC_BY_4_0', `${String(Math.floor((i * 2000) / N)).padStart(8, '0')}-22c7-4a22-a47d-8c48425ef4a7`, '', '', '', 2_000_000 + (i % 100), 2_000_000 + (i % 100), 2_000_000 + (i % 100)].join('\t') + `\tŁódź, ${'by the road '.repeat(20)}`);
  j = 0;
  for await (const line of o.rl) { if (j++ === 0) { h = occHeader(line); continue; } const r = parseOccRow(h, line); if (r) occ.add(r); }
  occ.seal();
  const occHeap = used() - before;
  console.log(JSON.stringify({ rows: N, media: { kept: media.species, heapMB: +(mediaHeap / 1048576).toFixed(1), textMB: +(m.bytes() / 1048576).toFixed(1) }, occ: { kept: occ.kept, heapMB: +(occHeap / 1048576).toFixed(1), textMB: +(o.bytes() / 1048576).toFixed(1) } }));
  // Kept alive to the end, so nothing measured above is freed by being unused.
  if (media.species < 0 || occ.species < 0) console.log('');
})();
