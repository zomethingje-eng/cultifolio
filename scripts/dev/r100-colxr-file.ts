// Round one hundred (docs/PLAN-100.md, 4, step 2): the COL XR trial download's records filed under the trial's pages, as the
// plain occurrence.csv the builder already reads (bulk-load.ts, "the small case"), so the builder is not changed. Each record
// goes to the pages whose COL XR taxon is its accepted taxon or its species (fileUnder, test r100e), its three key columns
// written as that page's backbone key, once a page. Only the columns the builder reads are kept (parseOccRow), so the file is
// about a tenth of occurrence.txt; the photographs (multimedia.txt) are not carried: the trial compares records, regions and
// climate, not photographs. The archive is streamed, never extracted (10 GB unzipped).
//   node --import tsx scripts/dev/r100-colxr-file.ts
//   node --import tsx scripts/dev/r100-colxr-file.ts --parents   first, for the taxa the last run filed under none: each one's
//       parent in COL XR's tree, from ChecklistBank (api.checklistbank.org, dataset 3LXR), into bulk/colxr/trial-parents.txt,
//       which the next run reads (a variety under an infraspecific trial taxon is filed under that taxon's page)
// reads bulk/colxr/trial-keys.txt and bulk/colxr/occurrence-colxr-trial.zip; writes bulk/colxr/trial-bulk/occurrence.csv
// and bulk/colxr/trial-bulk/filed.txt (each page's rows, and the records filed under none, by their taxa)
import { readFileSync, createWriteStream, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileUnder } from './r100-colxr-count-lib.mjs';

const ZIP = 'bulk/colxr/occurrence-colxr-trial.zip', OUT = 'bulk/colxr/trial-bulk';
const KEEP = ['gbifID', 'decimalLatitude', 'decimalLongitude', 'coordinateUncertaintyInMeters', 'coordinatePrecision', 'year', 'countryCode', 'stateProvince', 'basisOfRecord', 'license', 'datasetKey', 'establishmentMeans', 'degreeOfEstablishment', 'mediaType', 'speciesKey', 'taxonKey', 'acceptedTaxonKey'];
const KEYS = new Set(['speciesKey', 'taxonKey', 'acceptedTaxonKey']);

if (process.argv.includes('--parents')) {
  const t = readFileSync(`${OUT}/filed.txt`, 'utf8').split('# records under no trial taxon')[1]?.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split('/')[0]) ?? [];
  const lines = ['# Round one hundred (docs/PLAN-100.md, 4, step 2): the parent in COL XR (ChecklistBank dataset 3LXR) of each taxon the filing left under no trial taxon, by scripts/dev/r100-colxr-file.ts --parents', '# taxon\tparent\tits rank and name'];
  for (const id of [...new Set(t)]) {
    const r = await fetch(`https://api.checklistbank.org/dataset/3LXR/taxon/${id}`);
    if (!r.ok) { console.log(`  ${id}: ChecklistBank answered HTTP ${r.status}; not filed`); continue; }
    const j = (await r.json()) as { parentId?: string; name?: { rank?: string; scientificName?: string } };
    lines.push(`${id}\t${j.parentId ?? ''}\t${j.name?.rank ?? ''} ${j.name?.scientificName ?? ''}`);
    console.log(`  ${id} (${j.name?.rank} ${j.name?.scientificName}) under ${j.parentId}`);
  }
  writeFileSync('bulk/colxr/trial-parents.txt', lines.join('\n') + '\n');
  console.log(`asked ChecklistBank for ${t.length} taxa; wrote bulk/colxr/trial-parents.txt`);
  process.exit(0);
}
const parentOf = new Map<string, string>();
if (existsSync('bulk/colxr/trial-parents.txt')) for (const l of readFileSync('bulk/colxr/trial-parents.txt', 'utf8').split(/\r?\n/)) { if (l && !l.startsWith('#')) { const [c, p] = l.split('\t'); if (p) parentOf.set(c, p); } }
const pagesAt = new Map<string, string[]>();
const nameOf = new Map<string, string>();
let pages = 0;
for (const l of readFileSync('bulk/colxr/trial-keys.txt', 'utf8').split(/\r?\n/)) {
  if (!l || l.startsWith('#')) continue;
  const [, name, key, col] = l.split('\t');
  (pagesAt.get(col) ?? pagesAt.set(col, []).get(col)!).push(key);
  nameOf.set(key, name);
  pages++;
}
console.log(`read bulk/colxr/trial-keys.txt: ${pages} pages, ${pagesAt.size} COL XR taxa; ${parentOf.size} parents from bulk/colxr/trial-parents.txt`);

mkdirSync(OUT, { recursive: true });
const out = createWriteStream(`${OUT}/occurrence.csv`, { encoding: 'utf8' });
const write = (s: string) => (out.write(s) ? Promise.resolve() : new Promise<void>((r) => out.once('drain', () => r())));
// Windows' bsdtar reads zips (Git Bash's GNU tar does not), as bulk-load.ts reads them.
const child = spawn(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'unzip', process.platform === 'win32' ? ['-xOf', ZIP, 'occurrence.txt'] : ['-p', ZIP, 'occurrence.txt'], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.setEncoding('utf8');
const exit = new Promise<number | null>((r) => child.on('close', r));

let idx: number[] = [], at: Record<string, number> = {};
let rows = 0, filed = 0, written = 0, short = 0;
const perPage = new Map<string, number>(), via = { accepted: 0, parent: 0, species: 0, both: 0 }, none = new Map<string, number>();
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!idx.length) {
    const h = line.replace(/^\uFEFF/, '').split('\t');
    const lacking = KEEP.filter((k) => !h.includes(k));
    if (lacking.length) throw new Error(`occurrence.txt has no ${lacking.join(', ')} column`);
    idx = KEEP.map((k) => h.indexOf(k));
    at = Object.fromEntries(KEEP.map((k) => [k, h.indexOf(k)]));
    await write(KEEP.join('\t') + '\n');
    continue;
  }
  if (!line) continue;
  rows++;
  const c = line.split('\t');
  if (c.length < at.acceptedTaxonKey) { short++; continue; }
  const f = fileUnder({ acceptedTaxonKey: c[at.acceptedTaxonKey], speciesKey: c[at.speciesKey], taxonKey: c[at.taxonKey] }, pagesAt, parentOf);
  if (!f.keys.length) { const t = `${c[at.acceptedTaxonKey]}/${c[at.speciesKey]}`; none.set(t, (none.get(t) ?? 0) + 1); continue; }
  filed++;
  via[f.via as keyof typeof via]++;
  for (const k of f.keys) {
    await write(KEEP.map((name, i) => (KEYS.has(name) ? k : (c[idx[i]] ?? ''))).join('\t') + '\n');
    perPage.set(k, (perPage.get(k) ?? 0) + 1);
    written++;
  }
  if (rows % 500_000 === 0) process.stdout.write(`\r  ${(rows / 1e6).toFixed(1)} M records read, ${filed} filed, ${written} rows written…   `);
}
const code = await exit;
await new Promise<void>((r) => out.end(() => r()));
if (code) throw new Error(`reading occurrence.txt of ${ZIP} failed (exit ${code}); is the archive complete?`);
console.log(`\r  ${rows} records read from ${ZIP}: ${filed} filed (by the accepted taxon ${via.accepted}, by its parent ${via.parent}, by the species ${via.species}, by both ${via.both}), ${rows - filed - short} under no trial taxon, ${short} short lines`);
const missing = [...nameOf.keys()].filter((k) => !perPage.has(k));
writeFileSync(`${OUT}/filed.txt`, [
  `# Round one hundred (docs/PLAN-100.md, 4, step 2): ${ZIP} filed by scripts/dev/r100-colxr-file.ts. ${rows} records, ${filed} filed, ${written} rows written (a shared taxon's under each page).`,
  '# page backbone key\tname\trows', ...[...nameOf].map(([k, n]) => `${k}\t${n}\t${perPage.get(k) ?? 0}`),
  '# records under no trial taxon: accepted taxon/species\trecords', ...[...none].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}\t${n}`)
].join('\n') + '\n');
console.log(`wrote ${OUT}/occurrence.csv (${written} rows, ${perPage.size} of ${nameOf.size} trial pages) and ${OUT}/filed.txt; ${missing.length} trial pages with no records${missing.length ? `: ${missing.slice(0, 10).map((k) => nameOf.get(k)).join(', ')}${missing.length > 10 ? ', …' : ''}` : ''}`);
