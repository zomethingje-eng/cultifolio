// Round one hundred (docs/PLAN-100.md, 3): the pages whose COL XR taxon has another name, and the taxa two pages share, read
// by rule, offline: whether GBIF's two routes agree (the identifier's taxon against the taxon the backbone's name reaches),
// and where Kew's file (bulk/wcvp_names.csv) places COL XR's name: as this page's plant, as another, or not at all. Writes
// bulk/colxr/read-<map's day>.txt; nothing else.
//   node --import tsx scripts/dev/r100-colxr-read.ts [--map bulk/colxr/keymap-2026-11-20.txt]
import { readFileSync, writeFileSync, readdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readMapFull, readPages, nameWords, routes, kewPlaces, verdict, authorOf, sameAuthors } from './r100-colxr-count-lib.mjs';
import { spellingKey } from '../../src/lib/dossier/epithet';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const mapFile = arg('--map') ?? `bulk/colxr/${readdirSync('bulk/colxr').filter((f) => /^keymap-\d{4}-\d\d-\d\d\.txt$/.test(f)).sort().pop()}`;
const day = mapFile.match(/(\d{4}-\d\d-\d\d)/)?.[1] ?? 'undated';
const out = `bulk/colxr/read-${day}.txt`;

const map = readMapFull(readFileSync(mapFile, 'utf8'));
const backbone = new Map<string, string>();
for (const l of readFileSync(mapFile, 'utf8').split(/\r?\n/)) if (l && !l.startsWith('#')) { const c = l.split('\t'); backbone.set(c[0], c[2]); }
/** GBIF's name match was of the backbone name's own author (a page's key is matched by its name with its author). */
const sameAuthor = (key: string) => sameAuthors(authorOf(backbone.get(key) ?? ''), authorOf(map.get(key)!.bynameName));
const pages = readPages(readFileSync('scripts/species-list.txt', 'utf8')).filter((p) => p.key && map.get(p.key)?.byid);

// Kew's rows of species rank: genus|spelling key of the epithet -> the plant each row is (its accepted plant, or itself).
const kew = new Map<string, string[]>();
/** Each accepted plant's family, by Kew. */
const familyOf = new Map<string, string>();
let head: string[] = [];
let rowsRead = 0;
for await (const line of createInterface({ input: createReadStream('bulk/wcvp_names.csv'), crlfDelay: Infinity })) {
  const c = line.split('|');
  if (!head.length) { head = c; continue; }
  const v = (n: string) => c[head.indexOf(n)] ?? '';
  if (v('taxon_rank') !== 'Species') continue;
  rowsRead++;
  if (v('taxon_status') === 'Accepted') familyOf.set(`k${v('plant_name_id')}`, v('family'));
  const status = v('taxon_status');
  const plant = status === 'Accepted' ? v('plant_name_id') : v('accepted_plant_name_id');
  if (!plant) continue;
  const k = `${v('genus').toLowerCase()}|${spellingKey(v('species'))}`;
  (kew.get(k) ?? kew.set(k, []).get(k)!).push(`k${plant}`);
}
console.log(`read: ${mapFile}, scripts/species-list.txt (${pages.length} pages with a COL XR taxon), bulk/wcvp_names.csv (${rowsRead} rows of species rank)`);

/** Every plant Kew holds COL XR's name for is of another family than the page's plant (Kew's families on both sides). */
const otherFamily = (colName: string, page: string) => {
  const [g, e] = nameWords(colName).split(' ');
  const ids = kew.get(`${g}|${spellingKey(e ?? '')}`) ?? [];
  const mine = familyOf.get(page);
  return !!mine && ids.length > 0 && ids.every((i) => familyOf.has(i) && familyOf.get(i) !== mine);
};
const tally = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
// Every page: do the routes agree?
const routeOf = new Map(pages.map((p) => [p.key, routes(map.get(p.key))]));
// The pages of another name, and the shared taxa.
const at = new Map<string, typeof pages>();
for (const p of pages) { const c = map.get(p.key)!.byid; (at.get(c) ?? at.set(c, []).get(c)!).push(p); }
const lines: string[] = [];
const other = pages.filter((p) => nameWords(map.get(p.key)!.byidName) !== nameWords(p.name));
const otherVerdicts: string[] = [];
lines.push('## pages whose COL XR taxon has another name (page, name, key, COL XR id, its name, Kew places it, GBIF matched the author, the verdict)');
for (const p of other) {
  const r = map.get(p.key)!;
  const k = kewPlaces(kew, nameWords(r.byidName), p.id, spellingKey);
  const v = verdict(k, sameAuthor(p.key), otherFamily(r.byidName, p.id));
  otherVerdicts.push(v);
  lines.push([p.id, p.name, p.key, r.byid, r.byidName, k, sameAuthor(p.key) ? 'same author' : 'another author', v].join('\t'));
}
const sharedVerdicts: string[] = [];
lines.push('', '## pages sharing a COL XR taxon (COL XR id, its name, page, name, key, Kew places the taxon\'s name, GBIF matched the author, the verdict)');
for (const [c, ps] of at) {
  if (ps.length < 2) continue;
  for (const p of ps) {
    const r = map.get(p.key)!;
    const k = kewPlaces(kew, nameWords(r.byidName), p.id, spellingKey);
    const v = k === 'this plant' ? 'the taxon\'s own page' : verdict(k, sameAuthor(p.key), otherFamily(r.byidName, p.id));
    sharedVerdicts.push(v);
    lines.push([c, r.byidName, p.id, p.name, p.key, k, sameAuthor(p.key) ? 'same author' : 'another author', v].join('\t'));
  }
}
const summary = [
  `# Round one hundred (docs/PLAN-100.md, 3): read by rule from ${mapFile} and bulk/wcvp_names.csv, by scripts/dev/r100-colxr-read.ts.`,
  '',
  `GBIF's two routes, by identifier and by the backbone's name, every page with a COL XR taxon (${pages.length} keys): ${tally([...routeOf.values()]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
  `pages of another name (${other.length}):`, ...tally(otherVerdicts).map(([k, n]) => `  ${n}  ${k}`),
  `pages sharing a taxon (${sharedVerdicts.length}):`, ...tally(sharedVerdicts).map(([k, n]) => `  ${n}  ${k}`)
];
writeFileSync(out, [...summary, '', ...lines].join('\n') + '\n');
console.log(summary.slice(2).join('\n'));
console.log(`wrote ${out}`);
