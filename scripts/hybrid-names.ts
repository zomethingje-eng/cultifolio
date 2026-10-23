/**
 * `src/lib/core/hybrids.json` (round eighty-one, H; review-w 3, review-d 3): Kew's hybrid sign for every page of the species
 * list that is a hybrid, with the IPNI and POWO numbers and the parents Kew's file gives its entry.
 *
 *   npx tsx scripts/hybrid-names.ts --bulk bulk            # writes src/lib/core/hybrids.json
 *   npx tsx scripts/hybrid-names.ts --bulk bulk --check    # says whether the file on disk is the one the list and Kew's file give
 *
 * Why a file: the reference names its pages by GBIF's canonical name and by Kew's name without its sign (the addresses and
 * the matching read names without it, as `/about/how` says), so the 473 nothospecies and 12 nothogenera of the list were
 * shown as wild species ("Mentha piperita", "Astrolista bicarinata"). The list (`scripts/species-list.txt`) writes each
 * name as Kew's file does, with the sign; this file carries those 485 names by Kew's `plant_name_id`, which is each page's
 * id (`k<plant_name_id>`), so the Worker shows the sign on a page whatever its dossier holds, and `--index` writes it into
 * the index without a rebuild. Kew's own IPNI and POWO numbers for the entry are kept beside the name: a hybrid's own row
 * was never found by its name without the sign (`kewIpni`), so some pages linked neither.
 *
 * Read from the list's lines whose name carries "×" and from those lines' rows in Kew's file (`wcvp_names.csv`): a line
 * whose row Kew's file does not give the same name, the sign and Kew's acceptance is refused and named, never guessed.
 * Node only.
 */
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { HYBRIDS_FILE_NOTE, type HybridRow } from '../src/lib/core/hybrids';
import { kewFileDay } from './kew-names-load';

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const bulk = arg('--bulk');
const listPath = arg('--list') ?? 'scripts/species-list.txt';
const outPath = arg('--out') ?? 'src/lib/core/hybrids.json';

/** The list's lines whose name carries Kew's hybrid sign: Kew's plant_name_id → the name as the list writes it. */
export function listHybrids(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    if (c.length < 2 || !/^\d+$/.test(c[0])) continue;
    if (c[1].includes('×')) out.set(c[0], c[1]);
  }
  return out;
}

async function main() {
  if (!bulk || !existsSync(`${bulk}/wcvp_names.csv`)) { console.error('needs --bulk <dir> with wcvp_names.csv'); process.exit(2); }
  const wanted = listHybrids(readFileSync(listPath, 'utf8'));
  const rows = new Map<string, Record<string, string>>();
  const rl = createInterface({ input: createReadStream(`${bulk}/wcvp_names.csv`, { encoding: 'utf8' }), crlfDelay: Infinity });
  let h: string[] | null = null;
  for await (const line of rl) {
    const c = line.split('|');
    if (!h) { h = c; continue; }
    if (!wanted.has(c[0])) continue;
    rows.set(c[0], Object.fromEntries(h.map((k, i) => [k, c[i] ?? ''])));
  }
  const out: Record<string, HybridRow> = {};
  const refused: string[] = [];
  for (const [id, name] of [...wanted].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const r = rows.get(id);
    const signed = !!r && (r.genus_hybrid === '×' || r.species_hybrid === '×');
    if (!r || r.taxon_name !== name || !signed || r.taxon_status !== 'Accepted') { refused.push(`${id} ${name}: ${!r ? 'no row in Kew\'s file' : r.taxon_name !== name ? `Kew's file names it ${r.taxon_name}` : !signed ? 'Kew\'s file marks no hybrid' : `Kew's file holds it as ${r.taxon_status}`}`); continue; }
    out[id] = { name, ...(r.ipni_id ? { ipni: r.ipni_id } : {}), ...(r.powo_id ? { powo: r.powo_id } : {}), ...(r.hybrid_formula ? { parents: r.hybrid_formula } : {}) };
  }
  const body = JSON.stringify({ note: HYBRIDS_FILE_NOTE, list: listPath, kew: kewFileDay(bulk), rows: out }, null, 0).replace(/\},"/g, '},\n"') + '\n';
  if (args.includes('--check')) {
    const had = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).rows : null;
    const same = JSON.stringify(had) === JSON.stringify(out);
    console.log(same ? `  ${outPath} is the list's and Kew's: ${Object.keys(out).length} hybrids` : `  ${outPath} differs from the list and Kew's file: run without --check to write it`);
    process.exit(same ? 0 : 1);
  }
  writeFileSync(outPath, body);
  const genera = Object.values(out).filter((r) => r.name.startsWith('× ')).length;
  console.log(`  ${Object.keys(out).length} hybrids of the list's ${wanted.size} (${Object.keys(out).length - genera} nothospecies, ${genera} nothogenera) → ${outPath}${refused.length ? `; ${refused.length} refused: ${refused.join('; ')}` : ''}`);
}

if (process.argv[1]?.endsWith('hybrid-names.ts')) void main();
