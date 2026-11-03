/**
 * Kew's names file read for `KewRows` (round seventy-eight; `src/lib/dossier/kew-rows.ts`): one streaming pass, the rows
 * of the genera given and every accepted row. Node-only.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { ownText } from '../src/lib/dossier/bulk';
import { wcvpRow } from '../src/lib/dossier/bulk';
import { KewRows } from '../src/lib/dossier/kew-rows';
import { wcvpFileDay } from './bulk-load';

/** `entries`: the accepted entries whose same-type names are read too (`KewRows.sameTypeOf`; round eighty-five, H). */
export async function loadKewRows(dir: string, genera: Iterable<string>, entries?: Iterable<string>): Promise<KewRows | null> {
  const path = `${dir}/wcvp_names.csv`;
  if (!existsSync(path)) return null;
  const kew = new KewRows(genera, entries);
  kew.fileDay = wcvpFileDay(dir);
  let h: string[] = [];
  let i = 0;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  // Each line its own copy, so a kept field keeps only its line alive, not readline's 64 KB chunk (round eighty, X).
  for await (const raw of rl) {
    const line = ownText(raw);
    if (i++ === 0) { h = line.replace(/^﻿/, '').split('|'); continue; }
    if (!line) continue;
    const r = wcvpRow(h, line);
    kew.add({ id: r.plant_name_id, name: r.taxon_name, authors: r.taxon_authors ?? '', status: r.taxon_status, rank: r.taxon_rank, family: r.family ?? '', acceptedId: r.accepted_plant_name_id ?? '', parentId: r.parent_plant_name_id ?? '', powoId: r.powo_id ?? '', ipniId: r.ipni_id || undefined, basionymId: r.basionym_plant_name_id || undefined, replacedAuthor: r.replaced_synonym_author || undefined, homotypic: !!r.homotypic_synonym });
  }
  return kew;
}
