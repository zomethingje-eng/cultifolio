// Round one hundred (docs/PLAN-100.md, 4): the trial's sample and its GBIF download, under the Catalogue of Life eXtended
// Release (COL XR). The sample: 200 keyed pages drawn at random (a fixed seed, so the same 200 each run), every page whose
// COL XR taxon has another name, every page sharing a taxon; each with its backbone key, its COL XR taxon and why it is
// in. The request: a Darwin Core Archive of the sample's COL XR taxa, filtered and written under COL XR (both checklistKeys
// COL XR's, so the records' taxonKey, speciesKey and acceptedTaxonKey are COL XR's), with the filters every download of
// ours has (a coordinate, no geospatial issue, present). Writes bulk/colxr/trial-keys.txt and bulk/colxr/request-colxr-trial.json.
//   node --import tsx scripts/dev/r100-colxr-trial.ts            the sample and the request, nothing sent
//   node --import tsx scripts/dev/r100-colxr-trial.ts --submit   and the request sent to GBIF with GBIF_USER and
//                                                               GBIF_PASSWORD (a free gbif.org account), as bulk-fetch.ts sends ours
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { readMap, readPages, nameWords } from './r100-colxr-count-lib.mjs';

const COLXR = '7ddf754f-d193-4cc9-b351-99906754a03b';
const mapFile = `bulk/colxr/${readdirSync('bulk/colxr').filter((f) => /^keymap-\d{4}-\d\d-\d\d\.txt$/.test(f)).sort().pop()}`;
const map = readMap(readFileSync(mapFile, 'utf8'));
const pages = readPages(readFileSync('scripts/species-list.txt', 'utf8')).filter((p) => p.key && map.get(p.key)?.byid);

/** A seeded shuffle (mulberry32), so the random 200 are the same on every run. */
function seeded(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = seeded(100);
const order = pages.map((p) => ({ p, r: rnd() })).sort((a, b) => a.r - b.r).map((x) => x.p);
const why = new Map<string, string[]>();
const add = (id: string, w: string) => (why.get(id) ?? why.set(id, []).get(id)!).push(w);
for (const p of order.slice(0, 200)) add(p.id, 'random');
const at = new Map<string, string[]>();
for (const p of pages) { const c = map.get(p.key)!.byid; (at.get(c) ?? at.set(c, []).get(c)!).push(p.id); }
for (const p of pages) {
  const r = map.get(p.key)!;
  if (nameWords(r.byidName) !== nameWords(p.name)) add(p.id, 'another name');
  if (at.get(r.byid)!.length > 1) add(p.id, 'shares a taxon');
}
const byId = new Map(pages.map((p) => [p.id, p]));
const rows = [...why].map(([id, w]) => { const p = byId.get(id)!; const r = map.get(p.key)!; return [id, p.name, p.key, r.byid, r.byidName, w.join(', ')].join('\t'); });
const taxa = [...new Set([...why.keys()].map((id) => map.get(byId.get(id)!.key)!.byid))].sort();
writeFileSync('bulk/colxr/trial-keys.txt', [
  `# Round one hundred (docs/PLAN-100.md, 4): the trial's pages, from ${mapFile} by scripts/dev/r100-colxr-trial.ts: 200 at random`,
  `# (seed 100), every page of another name, every page sharing a taxon. ${why.size} pages, ${taxa.length} COL XR taxa.`,
  '# page\tname\tbackbone key\tCOL XR id\tCOL XR name\twhy', ...rows
].join('\n') + '\n');

const request = {
  format: 'DWCA',
  checklistKey: COLXR,
  sendNotification: false,
  predicate: {
    type: 'and',
    predicates: [
      { type: 'in', key: 'TAXON_KEY', values: taxa, checklistKey: COLXR },
      { type: 'equals', key: 'HAS_COORDINATE', value: 'true' },
      { type: 'equals', key: 'HAS_GEOSPATIAL_ISSUE', value: 'false' },
      { type: 'equals', key: 'OCCURRENCE_STATUS', value: 'PRESENT' }
    ]
  }
};
writeFileSync('bulk/colxr/request-colxr-trial.json', JSON.stringify(request, null, 2) + '\n');
const tally = new Map<string, number>();
for (const w of why.values()) for (const x of w) tally.set(x, (tally.get(x) ?? 0) + 1);
console.log(`read ${mapFile} and scripts/species-list.txt; the trial: ${why.size} pages (${[...tally].map(([k, n]) => `${k} ${n}`).join(', ')}), ${taxa.length} COL XR taxa`);
console.log('wrote bulk/colxr/trial-keys.txt and bulk/colxr/request-colxr-trial.json');

if (process.argv.includes('--submit')) {
  const u = process.env.GBIF_USER?.trim(), pw = process.env.GBIF_PASSWORD?.trim();
  if (!u || !pw) { console.error('Set GBIF_USER and GBIF_PASSWORD (a free gbif.org account) to send the request.'); process.exit(2); }
  const res = await fetch('https://api.gbif.org/v1/occurrence/download/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${u}:${pw}`).toString('base64')}` },
    body: JSON.stringify({ ...request, creator: u })
  });
  const text = await res.text();
  if (!res.ok) { console.error(`GBIF answered HTTP ${res.status}: ${text.slice(0, 300)}`); process.exit(1); }
  writeFileSync('bulk/colxr/download-colxr-trial.json', JSON.stringify({ key: text.trim(), asked: new Date().toISOString() }, null, 2) + '\n');
  console.log(`GBIF took the request: download ${text.trim()} (bulk/colxr/download-colxr-trial.json); https://www.gbif.org/occurrence/download/${text.trim()} shows it`);
}
