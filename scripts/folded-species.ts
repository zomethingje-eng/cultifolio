/**
 * The species Kew accepts that GBIF folds into another reference species and growers name (round eighty-five, the owner's
 * decision 6; the rule is `folded-species-lib.ts`'s). Writes `folded-species.txt`, the species list's lines for them, and
 * says how many each test kept; `--add` puts the lines into `scripts/species-list.txt` (in the list's order) and writes
 * `scripts/species-new-r85.txt`, the list's header with those lines alone, which the corpus plan builds.
 *
 *   npx tsx scripts/folded-species.ts --bulk bulk --index static/s/v3/index.json [--cache folded-inat.jsonl] [--add]
 *
 * iNaturalist is asked at most one request every 1.1 s (its practices), one taxon search a species, and one count of
 * cultivated observations for each taxon of its own with three observations or more; the answers are kept in the cache,
 * so a run that stops goes on where it stopped. Node only.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { grownBy, worthCounting, gbifNamesOf, listLine, type InatHit } from './folded-species-lib';
import { isAutonymName } from '../src/lib/dossier/kew-names';

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const bulk = arg('--bulk') ?? 'bulk';
const indexPath = arg('--index') ?? 'static/s/v3/index.json';
const cachePath = arg('--cache') ?? 'folded-inat.jsonl';
const UA = 'Cultifolio/3.0 (https://cultifolio.com)';
const words = (s: string) => s.replace(/×/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

type Sp = { id: string; name: string; authors: string; family: string };
async function main() {
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Array<{ key: string; name: string; syn?: string[]; older?: string[]; hom?: string[]; kew?: string[] }>;
  const pages = new Set(index.flatMap((e) => (/^k\d+$/.test(e.key) ? [e.key.slice(1)] : [])));
  // Test 2's names: every GBIF name a `k` page holds, by its words, with the pages' entries (a page with no Kew entry is
  // judged by nothing, rule 3).
  const heldBy = new Map<string, Array<{ entry: string; name: string }>>();
  for (const e of index) {
    if (!/^k\d+$/.test(e.key)) continue;
    for (const n of gbifNamesOf(e)) { const k = words(n); const xs = heldBy.get(k) ?? []; if (!xs.some((x) => x.entry === e.key.slice(1))) xs.push({ entry: e.key.slice(1), name: e.name }); heldBy.set(k, xs); }
  }
  // One pass over Kew's file: the species Kew accepts with no page whose name a page holds; where every row of each held
  // name leads; and the varieties and subspecies Kew accepts under each page's entry (its plant, as `plantOf` reads it).
  const found: Sp[] = [];
  const leads = new Map<string, Set<string>>();
  const children = new Map<string, string[]>();
  const autonymOf = new Set<string>();
  let accepted = 0;
  const rl = createInterface({ input: createReadStream(`${bulk}/wcvp_names.csv`, { encoding: 'utf8' }), crlfDelay: Infinity });
  let h: Record<string, number> | null = null;
  for await (const line of rl) {
    const c = line.split('|');
    if (!h) { h = Object.fromEntries(c.map((k, i) => [k, i])); continue; }
    const id = c[h.plant_name_id], status = c[h.taxon_status], rank = c[h.taxon_rank], parent = c[h.parent_plant_name_id] ?? '';
    if (status === 'Accepted' && rank !== 'Species' && pages.has(parent)) children.set(parent, [...(children.get(parent) ?? []), id]);
    // A page whose entry is an autonym is its species' page (`speciesEntry`): that species has a page.
    if (pages.has(id) && rank !== 'Species' && parent && isAutonymName(c[h.taxon_name])) autonymOf.add(parent);
    if (rank !== 'Species' || status === 'Misapplied') continue;
    const k = words(c[h.taxon_name]);
    if (!heldBy.has(k)) { if (status === 'Accepted') accepted++; continue; }
    const to = status === 'Accepted' ? id : status === 'Unplaced' ? '' : c[h.accepted_plant_name_id] ?? '';
    if (to) (leads.get(k) ?? leads.set(k, new Set()).get(k)!).add(to);
    if (status !== 'Accepted') continue;
    accepted++;
    if (!pages.has(id)) found.push({ id, name: c[h.taxon_name], authors: c[h.taxon_authors] ?? '', family: c[h.family] ?? '' });
  }
  // A page holds the name as GBIF's folding, not as Kew's: no row of the name leads into the page's plant.
  const cands: Array<Sp & { held: string[] }> = [];
  for (const s of found) {
    if (autonymOf.has(s.id)) continue;
    const k = words(s.name);
    const held = (heldBy.get(k) ?? []).filter((p) => { const plant = new Set([p.entry, ...(children.get(p.entry) ?? [])]); return ![...(leads.get(k) ?? [])].some((t) => plant.has(t)); }).map((p) => p.name);
    if (held.length) cands.push({ ...s, held });
  }
  console.log(`Kew accepts ${accepted} species; ${cands.length} have no page here and a page holds the name among GBIF's, where Kew's rows of it lead out of that page's plant (test 2).`);
  // Test 3, from the cache where answered, else asked.
  const cache = new Map<string, InatHit[]>();
  if (existsSync(cachePath)) for (const l of readFileSync(cachePath, 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l) as { id: string; hits: InatHit[] }; cache.set(r.id, r.hits); }
  let last = 0;
  const get = async (url: string): Promise<{ results?: Array<Record<string, unknown>>; total_results?: number } | null> => {
    for (let i = 0; i < 6; i++) {
      const wait = last + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      try {
        const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
        if (r.status === 429 || r.status === 503) { await new Promise((x) => setTimeout(x, 30_000 * (i + 1))); continue; }
        if (!r.ok) return null;
        return (await r.json()) as { results?: Array<Record<string, unknown>> };
      } catch { await new Promise((x) => setTimeout(x, 10_000 * (i + 1))); }
    }
    return null;
  };
  let asked = 0;
  for (const s of cands) {
    if (cache.has(s.id)) continue;
    const a = await get(`https://api.inaturalist.org/v1/taxa?${new URLSearchParams({ q: s.name, per_page: '10', is_active: 'true' })}`);
    if (!a) continue;
    const hits: InatHit[] = (a.results ?? []).map((r) => ({ tid: Number(r.id), tname: String(r.name), rank: String(r.rank), matched: (r.matched_term as string) ?? null, obs: Number(r.observations_count ?? 0), common: (r.preferred_common_name as string) ?? null }));
    for (const x of hits) if (worthCounting(s.name, x)) { const c = await get(`https://api.inaturalist.org/v1/observations?taxon_id=${x.tid}&captive=true&per_page=0`); x.captive = c ? Number(c.total_results ?? 0) : null; }
    cache.set(s.id, hits);
    appendFileSync(cachePath, JSON.stringify({ id: s.id, name: s.name, hits }) + '\n');
    if (++asked % 50 === 0) process.stdout.write(`\r  ${asked} asked of iNaturalist…`);
  }
  const lines: string[] = [];
  let unasked = 0;
  for (const s of cands) {
    const hits = cache.get(s.id);
    if (!hits) { unasked++; continue; }
    const g = grownBy(s.name, hits);
    if (g) lines.push(listLine(s, g, s.held));
  }
  console.log(`\r  ${lines.length} species growers name (test 3: iNaturalist's taxon of the name, three cultivated observations or more)${unasked ? `; ${unasked} not answered by iNaturalist: run again` : ''} → folded-species.txt`);
  writeFileSync('folded-species.txt', lines.join('\n') + (lines.length ? '\n' : ''));
  if (args.includes('--add') && !unasked) addToList(lines);
  if (unasked) process.exitCode = 3;
}

/** The lines into the species list, each before the first line whose name sorts after it, and the plan's file of them. */
function addToList(lines: string[]) {
  const listPath = 'scripts/species-list.txt';
  const text = readFileSync(listPath, 'utf8').split('\n');
  const have = new Set(text.filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]));
  const add = lines.filter((l) => !have.has(l.split('\t')[0]));
  // The list's own order (`select-species-lib.ts`): by name, `localeCompare`.
  const before = (x: string, l: string) => { const a = x.split('\t'), b = l.split('\t'); return a[1].localeCompare(b[1]) > 0 || (a[1] === b[1] && Number(a[0]) > Number(b[0])); };
  const out = [...text];
  // The list's header says the rule and the count, before its column line (once; a later run rewrites it).
  const note = `# Round eighty-five (the owner's decision 6; scripts/folded-species.ts): ${lines.length} species Kew accepts that GBIF folds into another species of the reference (a page holds the species' own name among GBIF's names, and Kew's rows of it lead out of that page's plant) and that growers name (iNaturalist's taxon of the name, the species or below it with its epithet, with at least 3 observations marked captive or cultivated, the list's own threshold), each with "-" for its GBIF key: built from Kew's file. Echinopsis pachanoi, San Pedro, is one.`;
  const old = out.findIndex((x) => x.startsWith('# Round eighty-five (the owner\'s decision 6;'));
  if (old >= 0) out[old] = note;
  else out.splice(out.findIndex((x) => x.startsWith('# plant_name_id')), 0, note);
  for (const l of add) {
    const at = out.findIndex((x) => x && !x.startsWith('#') && before(x, l));
    out.splice(at < 0 ? out.length - (out[out.length - 1] === '' ? 1 : 0) : at, 0, l);
  }
  // The header's count of species and of those without a GBIF key, which `about-how-r79.mjs` reads (round eighty-five).
  const data = out.filter((x) => x && !x.startsWith('#'));
  const sel = out.findIndex((x) => x.startsWith('# Selected: '));
  if (sel >= 0) {
    const fmt = (n: number) => n.toLocaleString('en-GB');
    out[sel] = out[sel].replace(/^# Selected: [\d,]+ species/, `# Selected: ${fmt(data.length)} species`).replace(/[\d,]+ without\.(?: \(round eighty-five: \d+ of them by decision 6's rule, above\))?$/, `${fmt(data.filter((x) => x.split('\t')[5] === '-').length)} without. (round eighty-five: ${lines.length} of them by decision 6's rule, above)`);
  }
  writeFileSync(listPath, out.join('\n'));
  const header = out.filter((l) => l.startsWith('#'));
  writeFileSync('scripts/species-new-r85.txt', [...header, ...lines].join('\n') + '\n');
  console.log(`  ${add.length} lines added to ${listPath}; scripts/species-new-r85.txt holds the ${lines.length} for the plan's build`);
}

if (process.argv[1]?.endsWith('folded-species.ts')) void main();
