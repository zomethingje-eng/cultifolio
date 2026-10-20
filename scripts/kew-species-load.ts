/**
 * The species of a list that have no GBIF key, read from Kew's files (round seventy-nine; `src/lib/dossier/build-kew.ts`):
 * each one's accepted row, the rows Kew files under it (its synonyms, misapplied rows left out) and its range. One
 * streaming pass over each file, keeping only the ids asked for, so the 300 MB names file is never held. The range is
 * read by B's `WcvpIndex.rangeOf`, so it is the shape and the rule of a page with a GBIF key.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { WcvpIndex, parseWcvpName, parseWcvpDist, wcvpRow } from '../src/lib/dossier/bulk';
import type { KewSpecies } from '../src/lib/dossier/build-kew';
import { wcvpFileDay } from './bulk-load';

async function eachLine(path: string, each: (line: string, i: number) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let i = 0;
  for await (const line of rl) each(line, i++);
}

/** What the loader found: each species asked for that Kew accepts, and the ids Kew's file does not hold as an accepted species. */
export interface KewSpeciesLoad {
  species: Map<string, KewSpecies>;
  missing: string[];
  file?: string;
}

/**
 * Kew's species for the given plant_name_ids. An id Kew's file does not hold as an accepted species (a list older than the
 * file) is `missing`, and built by nobody: never guessed by its name.
 */
export async function loadKewSpecies(dir: string, ids: Iterable<string>): Promise<KewSpeciesLoad | null> {
  const namesCsv = `${dir}/wcvp_names.csv`, distCsv = `${dir}/wcvp_distribution.csv`;
  if (!existsSync(namesCsv) || !existsSync(distCsv)) return null;
  const want = new Set(ids);
  const idx = new WcvpIndex();
  idx.fileDay = wcvpFileDay(dir);
  const rows = new Map<string, KewSpecies>();
  const under = new Map<string, KewSpecies['synonyms'][number][]>();
  let h: string[] = [];
  await eachLine(namesCsv, (line, i) => {
    if (i === 0) { h = line.replace(/^﻿/, '').split('|'); return; }
    if (!line) return;
    const r = wcvpRow(h, line);
    const id = r.plant_name_id, acc = r.accepted_plant_name_id;
    if (want.has(id) && r.taxon_status === 'Accepted' && r.taxon_rank === 'Species') {
      const n = parseWcvpName(h, line);
      idx.addName(n, () => true);
      rows.set(id, { id, name: r.taxon_name, authors: r.taxon_authors, family: r.family || undefined, genus: r.genus || undefined, ipni: r.ipni_id || undefined, powo: r.powo_id || undefined, lifeform: r.lifeform_description || undefined, climate: r.climate_description || undefined, synonyms: [], range: [], file: idx.fileDay });
    } else if (acc && acc !== id && want.has(acc) && r.taxon_status !== 'Misapplied') {
      (under.get(acc) ?? under.set(acc, []).get(acc)!).push({ name: r.taxon_name, authors: r.taxon_authors, status: r.taxon_status, rank: r.taxon_rank, ...(r.homotypic_synonym ? { homotypic: true } : {}) });
    }
  });
  await eachLine(distCsv, (line, i) => {
    if (i === 0) { h = line.replace(/^﻿/, '').split('|'); return; }
    if (!line) return;
    const d = parseWcvpDist(h, line);
    if (rows.has(d.id)) idx.addDist(d);
  });
  for (const [id, k] of rows) {
    const entry = { id, name: k.name, status: 'Accepted', acceptedId: id, rank: 'Species', authors: k.authors || undefined, family: k.family, lifeform: k.lifeform, climate: k.climate };
    rows.set(id, { ...k, synonyms: under.get(id) ?? [], range: idx.rangeOf(entry)?.rows ?? [] });
  }
  return { species: rows, missing: [...want].filter((id) => !rows.has(id)), file: idx.fileDay };
}
