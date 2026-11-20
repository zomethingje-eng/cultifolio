// Round one hundred (docs/PLAN-100.md, 2): the dry-run count, offline. Reads the key map and the files that hold our keys,
// writes nothing but the count (bulk/colxr/count-<map's day>.txt: the figures, then every page with no COL XR taxon, of
// another name, sharing one, and every other key reaching another page's taxon). No page is built and nothing is asked.
//   node --import tsx scripts/dev/r100-colxr-count.ts [--map bulk/colxr/keymap-2026-11-20.txt]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { readMap, readPages, readOtherKeys, count, recordsMoved } from './r100-colxr-count-lib.mjs';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const mapFile = arg('--map') ?? `bulk/colxr/${readdirSync('bulk/colxr').filter((f) => /^keymap-\d{4}-\d\d-\d\d\.txt$/.test(f)).sort().pop()}`;
const day = mapFile.match(/(\d{4}-\d\d-\d\d)/)?.[1] ?? 'undated';
const out = `bulk/colxr/count-${day}.txt`;
const read = (f: string) => readFileSync(f, 'utf8');

const mapText = read(mapFile);
const map = readMap(mapText);
const pages = readPages(read('scripts/species-list.txt'));
const otherFiles = ['extra-keys.txt', 'extra-keys-kew.txt', 'extra-keys-infra.txt'].map((file) => ({ file, text: read(`scripts/${file}`) }));
const others = readOtherKeys(otherFiles, pages);
console.log(`read: ${mapFile} (${map.size} keys), scripts/species-list.txt (${pages.length} pages), ${otherFiles.map((f) => `scripts/${f.file}`).join(', ')} (${others.length} other keys)`);
const r = count(map, pages, others);

const pct = (n: number, d: number) => `${(100 * n / d).toFixed(1)}%`;
const keyed = r.pages - r.noKey;
const lines: string[] = [
  `# Round one hundred (docs/PLAN-100.md, 2): the dry-run count from ${mapFile}, made by scripts/dev/r100-colxr-count.ts.`,
  `# ${mapText.split('\n').slice(1, 2).join('').replace(/^# /, '')}`,
  `# A key's COL XR taxon is GBIF's match by identifier (scientificNameID=gbif:<key>), the taxon its records would be filed under.`,
  '',
  `pages: ${r.pages}; with a GBIF key ${keyed}; with none ${r.noKey} (not in the map: a page with no backbone key has no key to map)`,
  `  key not in the map: ${r.notInMap.length}`,
  `  no COL XR taxon: ${r.none.length} (${pct(r.none.length, keyed)})`,
  `  a COL XR taxon: ${keyed - r.notInMap.length - r.none.length}, of the page's own name ${r.same}, of another name ${r.otherName.length}`,
  `  COL XR taxa reached by one page alone: ${r.oneToOne}; reached by two pages or more: ${r.shared.length} taxa, ${r.shared.reduce((s, x) => s + x.pages.length, 0)} pages`,
  '',
  'other keys (file, kind: n; not in the map, no COL XR taxon, onto its own page\'s taxon, onto another page\'s, a taxon of its own):'
];
for (const [k, t] of Object.entries(r.others)) lines.push(`  ${k}: ${t.n}; ${t.notInMap}, ${t.none}, ${t.ownPage}, ${t.otherPage}, ${t.ownTaxon}`);
const recFile = `bulk/colxr/records-${day}.txt`;
const rec = existsSync(recFile) ? recordsMoved(read(recFile)) : null;
if (rec) {
  lines.push('', `records (${recFile}): ${rec.pages} pages counted; no COL XR taxon ${rec.noTaxon}; the same ${rec.same}; within a fifth ${rec.within}; fell by more than a fifth ${rec.fell.length}; rose by more than a fifth ${rec.rose.length}`);
  lines.push(`  in all: ${rec.before} records under the backbone, ${rec.after} under COL XR (pages with a COL XR taxon; a taxon two pages share counted on each)`);
} else lines.push('', `records: ${recFile} not there; run scripts/dev/r100-colxr-records.ts`);
const summary = lines.slice(4);
lines.push('', '## pages with no COL XR taxon (page, name, key, GBIF\'s note)');
for (const x of r.none) lines.push(`${x.page}\t${x.name}\t${x.key}\t${x.note}`);
lines.push('', '## pages whose COL XR taxon has another name (page, name, key, COL XR id, its name)');
for (const x of r.otherName) lines.push(`${x.page}\t${x.name}\t${x.key}\t${x.col}\t${x.colName}`);
lines.push('', '## COL XR taxa reached by two pages or more (COL XR id, its name: the pages)');
for (const x of r.shared) lines.push(`${x.col}\t${x.name}:\t${x.pages.join('; ')}`);
lines.push('', '## other keys reaching another page\'s taxon');
for (const [k, t] of Object.entries(r.others)) for (const c of t.conflicts) lines.push(`${k}\t${c}`);
if (rec) {
  for (const [h, list] of [['fell', rec.fell], ['rose', rec.rose]] as const) {
    lines.push('', `## pages whose records ${h} by more than a fifth (page, name, key, backbone records, COL XR id, COL XR records)`);
    for (const x of list) lines.push([x.page, x.name, x.key, x.backbone, x.col, x.col_records].join('\t'));
  }
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(summary.join('\n'));
console.log(`wrote ${out}`);
