/**
 * What a cold Worker isolate does with the species index before it answers its first page, step by step, timed and
 * weighed in node (docs/SCALE-STUDY.md section 2). Bundled by `cold.mjs` with the app's own modules, so every step is
 * the production code: `loadIndex` → `adopt` (the slug map, `indexMaps`), then what the first species page, search and
 * home page build once per index (`heldNamesOf`, the search's genera, the catalogue items), and last the whole-index
 * search preparation a missing posting file falls back to.
 *
 * Run: node --expose-gc --single-threaded cold.bundle.mjs <index.json>
 * Prints one JSON line: per step the wall time (ms) and the heap held after a full GC (MB).
 */
import { readFileSync } from 'node:fs';
import { indexMaps } from '$lib/server/dossiers';
import { heldNamesOf } from '$dossier/photo-kind';
import { catalogueItems } from '$dossier/catalogue';
import { searchGenera, prepare } from '$core/search';
import type { IndexEntry } from '$dossier/index-entry';

const gc = (globalThis as unknown as { gc: () => void }).gc;
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed / 1048576; };
const steps: Array<{ step: string; ms: number; heapMB: number }> = [];
const hold: unknown[] = [];
const base = heap();
const run = <T>(step: string, f: () => T): T => {
  const t = performance.now();
  const x = f();
  const ms = performance.now() - t;
  hold.push(x);
  steps.push({ step, ms: Math.round(ms), heapMB: Math.round((heap() - base) * 10) / 10 });
  return x;
};
const file = process.argv[2];
const bytes = readFileSync(file);
// The text is garbage once parsed, as in the Worker (a local of `fromStore`): held only through the parse.
const box: { text: string | null } = { text: run('decode UTF-8 (R2 text())', () => new TextDecoder().decode(bytes)) };
hold.length = 0;
const idx = run('JSON.parse (text then let go)', () => { const x = JSON.parse(box.text!) as IndexEntry[]; box.text = null; return x; });
run('bySlug map', () => new Map(idx.map((e) => [e.slug, e.key])));
run('indexMaps (key, name, genus, older names)', () => indexMaps(idx));
run('heldNamesOf (first dossier read)', () => heldNamesOf(idx));
run('search genera (first search)', () => searchGenera(idx));
run('catalogue items (home page)', () => catalogueItems(idx));
const coldMs = steps.reduce((a, s) => a + s.ms, 0);
const coldHeap = steps[steps.length - 1].heapMB;
run('prepare whole index (a missing posting file)', () => prepare(idx));
console.log(JSON.stringify({ file, entries: idx.length, textMB: Math.round(bytes.length / 104857.6) / 10, baseHeapMB: Math.round(base * 10) / 10, coldMs, coldHeapMB: coldHeap, steps }));
