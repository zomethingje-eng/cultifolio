/**
 * Kew's rows a corpus needs for `--fill kew-names` (round seventy-two, A), streamed from `wcvp_names.csv` in three passes
 * so the whole file is never held: (1) the rows of the pages' names, their older names and their binomial common names,
 * and of the numbers they link; (2) the entries those rows are filed under, their parents, and the varieties and
 * subspecies Kew accepts under them; (3) every row filed under any of those. Node only.
 */
import { wcvpFileDay } from './bulk-load';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { ownText } from '../src/lib/dossier/bulk';
import { KewNamesIndex, words, splitName, BINOMIAL, type KewRow } from '../src/lib/dossier/kew-names';

/** Every row of Kew's names file that `keep` takes, streamed (also read by `--list-extra-keys`, round seventy-three). */
export async function scan(csv: string, keep: (r: KewRow) => boolean, out: (r: KewRow) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(csv, { encoding: 'utf8' }), crlfDelay: Infinity });
  let h: Record<string, number> | null = null;
  // Each line its own copy, so a kept field keeps only its line alive, not readline's 64 KB chunk (round eighty, X).
  for await (const raw of rl) {
    const line = ownText(raw);
    const c = line.split('|');
    if (!h) { h = Object.fromEntries(c.map((k, i) => [k, i])); continue; }
    const r: KewRow = { id: c[h.plant_name_id], name: c[h.taxon_name], authors: c[h.taxon_authors] ?? '', status: c[h.taxon_status], rank: c[h.taxon_rank], accepted: c[h.accepted_plant_name_id] ?? '', parent: c[h.parent_plant_name_id] ?? '', powo: c[h.powo_id] ?? '', ...(c[h.homotypic_synonym] === 'T' ? { homotypic: true } : {}), ...(c[h.ipni_id] ? { ipni: c[h.ipni_id] } : {}) };
    if (keep(r)) out(r);
  }
}

/** The day of Kew's files, one reading for every Kew-reading step: the bulk loader's (README's "Extracted" day, else the file's own). */
export const kewFileDay = (dir: string) => wcvpFileDay(dir) ?? statSync(`${dir}/wcvp_names.csv`).mtime.toISOString().slice(0, 10);

export async function loadKewNames(dir: string, pages: Array<{ key?: unknown; name: { scientific: string; synonyms?: string[]; vernacular?: Array<{ name: string }>; kew?: { entry?: string }; gbif?: { scientific: string } | null }; ids: { powo?: string | null; ipni?: string | null } }>): Promise<KewNamesIndex | null> {
  const csv = `${dir}/wcvp_names.csv`;
  if (!existsSync(csv)) return null;
  const names = new Set<string>();
  const numbers = new Set<string>();
  // A page's own entry (its id `k<plant_name_id>`, its stored entry) is read whatever its names (round eighty-four): Kew's row heads it.
  const entries = new Set<string>();
  for (const p of pages) {
    names.add(words(p.name.scientific));
    // GBIF's name for the key too, where Kew's heads the page: the fill reads Kew's entry by it, as the build did.
    if (p.name.gbif?.scientific) names.add(words(p.name.gbif.scientific));
    if (typeof p.key === 'string' && /^k[1-9]\d*$/.test(p.key)) entries.add(p.key.slice(1));
    if (p.name.kew?.entry) entries.add(p.name.kew.entry);
    for (const s of p.name.synonyms ?? []) { const sp = splitName(s); if (sp) names.add(words(sp.name)); }
    for (const v of p.name.vernacular ?? []) if (BINOMIAL.test(v.name.trim())) names.add(words(v.name));
    const n = p.ids.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? p.ids.ipni;
    if (n) numbers.add(n);
  }
  const idx = new KewNamesIndex();
  const a = new Set<string>();
  await scan(csv, (r) => names.has(words(r.name)) || numbers.has(r.powo) || entries.has(r.id), (r) => { idx.add(r); a.add(r.id); if (r.accepted) a.add(r.accepted); });
  const b = new Set(a);
  await scan(csv, (r) => a.has(r.id) || (r.status === 'Accepted' && a.has(r.parent)), (r) => { idx.add(r); b.add(r.id); if (r.parent) b.add(r.parent); });
  await scan(csv, (r) => b.has(r.accepted) || b.has(r.id), (r) => idx.add(r));
  return idx;
}
