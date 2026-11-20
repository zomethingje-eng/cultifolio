// Round one hundred (docs/PLAN-100.md, 2): each page's records under both taxonomies, by GBIF's occurrence count (the search
// with limit=0, a hundred taxa a request faceted by species key, a taxon the facet does not list asked alone): the page's backbone key with the backbone named (checklistKey d7dddbf4-…), and its COL XR taxon by the
// key map with COL XR named (7ddf754f-…). Read-only: it writes bulk/colxr/records-<day>.txt and nothing else. A page with no
// COL XR taxon is asked only its backbone count. It carries on where a run stopped; a page GBIF did not answer after three
// tries is left out, counted, and asked by the next run.
//   node --import tsx scripts/dev/r100-colxr-records.ts [--map bulk/colxr/keymap-2026-11-20.txt] [--limit N] [--gap-ms 300]
import { readFileSync, existsSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs';
import { readMap, readPages } from './r100-colxr-count-lib.mjs';

const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
const COLXR = '7ddf754f-d193-4cc9-b351-99906754a03b';
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const mapFile = arg('--map') ?? `bulk/colxr/${readdirSync('bulk/colxr').filter((f) => /^keymap-\d{4}-\d\d-\d\d\.txt$/.test(f)).sort().pop()}`;
const day = new Date().toISOString().slice(0, 10);
const out = `bulk/colxr/records-${day}.txt`;
const limit = Number(arg('--limit') ?? Infinity);
const gap = Number(arg('--gap-ms') ?? 300);
const UA = { 'User-Agent': 'cultifolio-keymap/1.0 (read-only taxonomy comparison)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function countOf(taxon: string, checklist: string): Promise<{ ok: true; n: number } | { ok: false; why: string }> {
  const url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${encodeURIComponent(taxon)}&checklistKey=${checklist}&limit=0`;
  let why = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) {
        const j = (await r.json()) as { count?: unknown };
        if (typeof j.count === 'number') return { ok: true, n: j.count };
        why = 'no count in the answer';
      } else {
        why = `HTTP ${r.status}`;
        if (r.status === 429) { await sleep(30_000 * (i + 1)); continue; }
        if (r.status < 500) return { ok: false, why };
      }
    } catch (e) { why = (e as Error).message; }
    await sleep(5_000 * (i + 1));
  }
  return { ok: false, why };
}

const map = readMap(readFileSync(mapFile, 'utf8'));
const pages = readPages(readFileSync('scripts/species-list.txt', 'utf8')).filter((p) => p.key && map.has(p.key));
const done = new Set<string>();
if (existsSync(out)) for (const l of readFileSync(out, 'utf8').split(/\r?\n/)) if (l && !l.startsWith('#')) done.add(l.split('\t')[0]);
const todo = pages.filter((p) => !done.has(p.id)).slice(0, limit);
console.log(`read ${mapFile} and scripts/species-list.txt: ${pages.length} pages with a key in the map; ${done.size} in ${out} already, ${todo.length} to ask`);
if (!existsSync(out)) {
  writeFileSync(out, [
    `# Round one hundred (docs/PLAN-100.md, 2): each page's GBIF records under the GBIF Backbone (taxonKey=<the page's key>&checklistKey=${BACKBONE})`,
    `# and under COL XR (taxonKey=<its COL XR taxon by ${mapFile}>&checklistKey=${COLXR}), by api.gbif.org/v1/occurrence/search?limit=0 (faceted by speciesKey, a hundred taxa a request; one the facet does not list asked alone),`,
    `# asked from ${day}. A page with no COL XR taxon: "-". Made by scripts/dev/r100-colxr-records.ts.`,
    `# page\tname\tkey\tbackbone_records\tcol\tcol_records\tasked`
  ].join('\n') + '\n');
}

let written = 0, failed = 0, single = 0;
const failures: string[] = [];
const t0 = Date.now();
/** GBIF's counts for many taxa in one request, faceted by species key (bulk-fetch.ts's countsFor does the same on the
 * backbone): the count of records whose species is the taxon, which is taxonKey's own count for a taxon of species rank.
 * A taxon the facet does not list (no records, or below species rank) is asked alone. */
async function facetOf(taxa: string[], checklist: string): Promise<{ ok: true; n: Map<string, number> } | { ok: false; why: string }> {
  const url = `https://api.gbif.org/v1/occurrence/search?checklistKey=${checklist}&${taxa.map((t) => `taxonKey=${encodeURIComponent(t)}`).join('&')}&limit=0&facet=speciesKey&facetLimit=${taxa.length * 2}`;
  let why = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) {
        const j = (await r.json()) as { facets?: Array<{ field: string; counts: Array<{ name: string; count: number }> }> };
        return { ok: true, n: new Map((j.facets?.find((f) => f.field === 'SPECIES_KEY')?.counts ?? []).map((c) => [c.name, c.count])) };
      }
      why = `HTTP ${r.status}`;
      if (r.status === 429) { await sleep(30_000 * (i + 1)); continue; }
      if (r.status < 500) return { ok: false, why };
    } catch (e) { why = (e as Error).message; }
    await sleep(5_000 * (i + 1));
  }
  return { ok: false, why };
}
async function counts(taxa: string[], checklist: string): Promise<Map<string, number | string>> {
  const out = new Map<string, number | string>();
  if (!taxa.length) return out;
  const f = await facetOf(taxa, checklist);
  for (const t of taxa) {
    if (f.ok && f.n.has(t)) { out.set(t, f.n.get(t)!); continue; }
    const one = await countOf(t, checklist);
    single++;
    out.set(t, one.ok ? one.n : `not answered: ${one.why}`);
  }
  return out;
}
const BATCH = 100;
let next = 1000;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const cols = [...new Set(batch.map((p) => map.get(p.key)!.byid).filter(Boolean))];
  const [a, b] = [await counts(batch.map((p) => p.key), BACKBONE), await counts(cols, COLXR)];
  const asked = new Date().toISOString().slice(0, 10);
  for (const p of batch) {
    const col = map.get(p.key)!.byid;
    const na = a.get(p.key)!, nb = col ? b.get(col)! : '-';
    if (typeof na === 'string' || (col && typeof nb === 'string')) { failed++; failures.push(`${p.id} ${p.key}: ${typeof na === 'string' ? `backbone ${na}` : ''} ${typeof nb === 'string' && col ? `COL XR ${nb}` : ''}`); continue; }
    appendFileSync(out, [p.id, p.name, p.key, na, col || '-', nb, asked].join('\t') + '\n');
    written++;
  }
  if (written + failed >= next) {
    next += 1000;
    const per = (Date.now() - t0) / (written + failed);
    console.log(`  ${written + failed} of ${todo.length} asked (${written} written, ${failed} not answered, ${single} counts asked alone), about ${Math.round((todo.length - written - failed) * per / 60000)} min left`);
  }
  await sleep(gap);
}
console.log(`done: ${written} pages written to ${out}, ${failed} not answered (asked again by the next run); ${single} counts asked alone (not listed by the facet)${failures.length ? ':' : ''}`);
for (const f of failures.slice(0, 50)) console.log(`  ${f}`);
