/**
 * Round seventy-eight, agent B: Kew's names from Kew's file (`src/lib/dossier/kew-rows.ts`) against GBIF's copy of them,
 * live, on real names. For each name, GBIF's answer to `/species?datasetKey=<WCVP>&name=` and the file's are compared row
 * by row in order (the fields every reader of them reads), and for each species `gbif.kewIpni` (the IPNI and POWO
 * numbers a page links, and the name it cites) and the accepted entries' numbers `crossIds` reads (`kewEntryIpni`) are
 * compared as the build reads them. GBIF paced at one request a second.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r78b-kew-proof.ts <index.json> <dossier dir> <bulk dir> <n> <out.json>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeFetcher, type JsonFetcher } from '../../../src/lib/dossier/fetch';
import * as gbif from '../../../src/lib/dossier/sources/gbif';
import { kewRowsFetcher, KEW_KEY } from '../../../src/lib/dossier/kew-rows';
import { loadKewRows } from '../../kew-rows-load';

const [indexPath, dossierDir, bulkDir, nArg, outPath] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const paced = (async (input: RequestInfo | URL, init?: RequestInit) => { const w = last + 1000 - Date.now(); if (w > 0) await sleep(w); last = Date.now(); return fetch(input, init); }) as typeof fetch;
const net = makeFetcher(paced);
const WCVP = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const byNameUrl = (n: string) => `https://api.gbif.org/v1/species?datasetKey=${WCVP}&name=${encodeURIComponent(n)}&limit=50`;

type Entry = { key: number; name: string };
// An index of version 3 (round seventy-eight) names each page by its id, its file's name, and carries its GBIF key as
// `gbif`; one of version 2 by its GBIF key. Either way the proof builds by GBIF key and reads the page's file by its name.
const fileOf = new Map<number, string>();
const index = (JSON.parse(readFileSync(indexPath, 'utf8')) as Array<{ key: number | string; gbif?: number; name: string }>).map((e): Entry => {
  const key = typeof e.key === 'number' ? e.key : e.gbif!;
  fileOf.set(key, String(e.key));
  return { key, name: e.name };
});
let seed = 78;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const named = ['Aloe vera', 'Welwitschia mirabilis', 'Kroenleinia grusonii', 'Crassula ovata', 'Haworthia decipiens', 'Ixora coccinea', 'Rubus parviflorus', 'Agave variegata'];
const pick = [...index.filter((e) => named.includes(e.name)), ...index.filter((e) => !named.includes(e.name)).map((e) => [rand(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e)].slice(0, Number(nArg));
const prev = (k: number) => { const p = `${dossierDir}/${fileOf.get(k) ?? k}.json`; return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

const FIELDS = ['taxonID', 'scientificName', 'canonicalName', 'authorship', 'taxonomicStatus', 'accepted', 'references', 'rank', 'family'] as const;
const proj = (rows: Array<Record<string, unknown>>) => rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f, r[f] == null || r[f] === '' ? null : String(r[f])])));

async function main() {
  const species = pick.map((e) => ({ e, d: prev(e.key) })).filter((x) => x.d);
  const names = new Set<string>();
  for (const { d } of species) {
    names.add(d.name.scientific);
    names.add(d.name.scientific.split(' ')[0]);
    for (const s of (d.name.synonyms ?? []).slice(0, 2)) { const b = s.replace(/×\s*/g, '').split(/\s+/).slice(0, 2).join(' '); if (/^[A-Z][a-z-]+ [a-z-]+$/.test(b)) names.add(b); }
  }
  const genera = new Set([...names].map((n) => n.split(' ')[0]));
  const t0 = Date.now();
  const kew = await loadKewRows(bulkDir, genera);
  if (!kew) throw new Error('no wcvp_names.csv');
  const loadMs = Date.now() - t0;
  const offline = kewRowsFetcher(net, kew);
  const rowDiffs: Array<Record<string, unknown>> = [];
  let rowsEqual = 0, n = 0;
  for (const name of names) {
    n++;
    const g = await net<{ results?: Array<Record<string, unknown>> }>(byNameUrl(name));
    const k = await offline<{ results?: Array<Record<string, unknown>> }>(byNameUrl(name));
    if (g.status !== 'ok' || k.status !== 'ok') { rowDiffs.push({ name, gbif: g.status, kew: k.status }); continue; }
    const a = proj(g.data.results ?? []), b = proj(k.data.results ?? []);
    if (JSON.stringify(a) === JSON.stringify(b)) rowsEqual++;
    else rowDiffs.push({ name, gbif: a, kew: b });
  }
  // As the build reads them: kewIpni for each species, with its authorship and family as stored, and the accepted entries' numbers.
  const ipniDiffs: Array<Record<string, unknown>> = [];
  let ipniEqual = 0;
  const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (key, v) => (key === 'acceptedKeys' ? undefined : v)));
  for (const { d } of species) {
    const args = [d.name.scientific, d.name.authorship ?? undefined, d.name.family ?? undefined] as const;
    const a = await gbif.kewIpni(net as JsonFetcher, ...args);
    const b = await gbif.kewIpni(offline as JsonFetcher, ...args);
    let same = JSON.stringify(strip(a)) === JSON.stringify(strip(b));
    let entries: unknown = undefined;
    if (a.status === 'ok' && b.status === 'ok' && (a.data.acceptedKeys?.length || b.data.acceptedKeys?.length)) {
      const ea = await gbif.kewEntryIpni(net, a.data.acceptedKeys ?? []);
      const eb = await gbif.kewEntryIpni(offline, b.data.acceptedKeys ?? []);
      entries = { gbif: ea, kew: eb, keysKew: (b.data.acceptedKeys ?? []).map((x) => x - KEW_KEY) };
      if (JSON.stringify(ea) !== JSON.stringify(eb)) same = false;
    }
    if (same) ipniEqual++;
    else ipniDiffs.push({ name: d.name.scientific, gbif: a, kew: b, entries });
  }
  const out = { at: new Date().toISOString(), kewFile: kew.fileDay, loadMs, kewRowsHeld: kew.size, genera: genera.size, names: n, rowsEqual, species: species.length, ipniEqual, stats: offline.stats, rowDiffs, ipniDiffs };
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ names: n, rowsEqual, species: species.length, ipniEqual, loadMs, stats: offline.stats }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
