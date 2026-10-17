/**
 * The most-grown genera (round seventy-five): writes scripts/most-grown-genera.txt, every genus of the reference with
 * iNaturalist's count of observations marked captive or cultivated of that genus and every taxon under it, the genera
 * refused with their reason, the day, the queries and the source's terms. The phone's catalogue opens on the head of it
 * (src/lib/ui/ref/most-grown.ts says the rule).
 *
 *   npx tsx scripts/most-grown-genera.ts --index static/s/v2/index.json [--out scripts/most-grown-genera.txt]
 *
 * Re-runnable: the file is written whole or not at all, and a genus whose request failed is written "not checked", never
 * 0. About 40 requests to api.inaturalist.org, one every two seconds (more when the tree does not answer: then each genus
 * is asked on its own, about 45 minutes for 1,300 genera).
 */
import { readFileSync } from 'node:fs';
import { makeFetcher } from '../src/lib/dossier/fetch';
import { genusOf } from '../src/lib/core/names';
import { writeAtomic } from './write-atomic';
import { mostGrown, formatList, type Fetch } from './most-grown-genera-lib';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const indexPath = arg('--index', 'static/s/v2/index.json');
const out = arg('--out', 'scripts/most-grown-genera.txt');
/** One request every two seconds to api.inaturalist.org, whatever the fetch layer's own pace (round seventy-five's brief). */
const GAP_MS = 2000;

const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Array<{ name: string }>;
const genera = [...new Set(index.map((e) => genusOf(e.name)))];
console.log(`${indexPath}: ${index.length} species in ${genera.length} genera`);

const f = makeFetcher();
let last = 0;
const paced: Fetch = async (url) => {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try { return await f(url, { timeoutMs: 180_000 }); } finally { last = Date.now(); }
};

const r = await mostGrown({ fetchJson: paced, genera, log: (s) => console.log(s) });
const day = new Date().toISOString().slice(0, 10);
writeAtomic(out, formatList(r, { day, species: index.length, genera: genera.length }));
const counted = r.lines.filter((l) => l.kind === 'genus' && l.count !== null).length;
const unchecked = r.lines.filter((l) => l.kind === 'genus' && l.count === null).length;
const refused = r.lines.filter((l) => l.kind === 'refused').length;
console.log(`${out}: ${counted} genera counted, ${unchecked} not checked, ${refused} refused; ${r.asked} requests`);
if (unchecked) process.exitCode = 1; // a run with genera not checked says so; run it again
