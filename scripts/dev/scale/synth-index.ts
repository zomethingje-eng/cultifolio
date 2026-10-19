/**
 * A synthetic species index of N entries built from a real one, for the scaling study (docs/SCALE-STUDY.md).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/synth-index.ts <real index.json> <N> <out.json>
 *
 * The first copy is the real index as it is. Each further copy of a real entry keeps its genus, family, origins,
 * figures and field shapes, and gets a new epithet made from the first half of one real epithet and the second half of
 * another, so the names' lengths, letters and prefixes stay those of real names (which the postings and the search's
 * keys depend on). Its older names get the same treatment, one new epithet per old epithet and copy, so a synonym
 * shared by two species stays shared. One word of each common name is swapped for a word of another species' common
 * name. Keys are new and unique; `near` points at other entries of the new index. Deterministic (a fixed seed).
 * Never written to the corpus: dev only.
 */
import { gbifPage } from '../../../src/lib/core/page-id';
import { readFileSync, writeFileSync } from 'node:fs';
import { slugify } from '../../../src/lib/core/names';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

const [src, nArg, out] = process.argv.slice(2);
if (!src || !nArg || !out) throw new Error('usage: synth-index.ts <index.json> <N> <out.json>');
const N = Number(nArg);
const real = JSON.parse(readFileSync(src, 'utf8')) as IndexEntry[];

let seed = 75;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

const epithets = real.map((e) => e.name.split(' ')[1]).filter((x) => x && /^[a-z-]+$/.test(x));
const commonWords = real.flatMap((e) => (e.common ?? '').split(' ')).filter((w) => /^[A-Za-z-]{3,}$/.test(w));
const taken = new Set(real.map((e) => e.name.toLowerCase()));

function newEpithet(): string {
  const a = pick(epithets), b = pick(epithets);
  return a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2));
}
function swapWord(s: string): string {
  const ws = s.split(' ');
  ws[Math.floor(rnd() * ws.length)] = pick(commonWords);
  return ws.join(' ');
}

const outIdx: IndexEntry[] = real.map((e) => ({ ...e }));
let nextKey = 200_000_000;
for (let copy = 1; outIdx.length < N; copy++) {
  const epMap = new Map<string, string>(); // old epithet → new one, for this copy, so shared synonyms stay shared
  const mapEp = (ep: string) => { let x = epMap.get(ep); if (!x) epMap.set(ep, (x = newEpithet())); return x; };
  const alter = (n: string) => { const w = n.split(' '); if (w.length >= 2 && /^[a-z]/.test(w[1])) w[1] = mapEp(w[1]); return w.join(' '); };
  for (const e of real) {
    if (outIdx.length >= N) break;
    const w = e.name.split(' ');
    let name = '';
    for (let tries = 0; tries < 50; tries++) {
      name = [w[0], newEpithet(), ...w.slice(2)].join(' ');
      if (!taken.has(name.toLowerCase())) break;
    }
    taken.add(name.toLowerCase());
    // Keyed by a made-up GBIF key, in GBIF's namespace (round seventy-eight: a page's key is its id).
    const g = nextKey++;
    const x: IndexEntry = { ...e, key: gbifPage(g), gbif: g, name, slug: slugify(name) };
    if (e.common) x.common = swapWord(e.common);
    if (e.commons) x.commons = e.commons.map(swapWord);
    if (e.spellings) x.spellings = e.spellings.map(swapWord);
    if (e.syn) x.syn = e.syn.map(alter);
    if (e.older) x.older = e.older.map(alter);
    if (e.thumb) x.thumb = e.thumb.replace(/\d{5,}/, (d) => String(Number(d) + copy * 7919));
    outIdx.push(x);
  }
}
const keys = outIdx.map((e) => e.key);
for (const e of outIdx.slice(real.length)) if (e.near) e.near = e.near.map(() => pick(keys)); // the real entries keep theirs
writeFileSync(out, JSON.stringify(outIdx, null, 1)); // as the build writes it (build-dossiers.ts: indent 1)
console.log(`${outIdx.length} entries → ${out} (${(readFileSync(out).length / 1048576).toFixed(1)} MB)`);
