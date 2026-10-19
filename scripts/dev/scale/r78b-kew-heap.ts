// Round seventy-eight, agent B: the heap `KewRows` holds for a list of genera (one per line), after a full GC, and the
// time to read Kew's file for it. node --expose-gc, through tsx.
import { readFileSync } from 'node:fs';
import { loadKewRows } from '../../kew-rows-load';
const [bulk, list] = process.argv.slice(2);
const genera = readFileSync(list, 'utf8').split('\n').filter(Boolean);
(globalThis as { gc?: () => void }).gc?.();
const h0 = process.memoryUsage().heapUsed;
const t0 = Date.now();
const k = await loadKewRows(bulk, genera);
const ms = Date.now() - t0;
(globalThis as { gc?: () => void }).gc?.();
console.log(JSON.stringify({ genera: genera.length, rows: k?.size, ms, heapMB: Math.round((process.memoryUsage().heapUsed - h0) / 1048576) }));
