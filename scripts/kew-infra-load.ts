/**
 * Kew's names file streamed into a `KewInfra` (round seventy-two, C1): which names below species Kew places under another
 * species, for the build's and `--fill inat`'s iNaturalist filter. Node-only; one pass over `wcvp_names.csv`, about half
 * a minute, nothing asked of any source.
 */
import { createReadStream, existsSync } from 'node:fs';
import { kewFileDay } from './kew-names-load';
import { createInterface } from 'node:readline';
import { ownText } from '../src/lib/dossier/bulk';
import { wcvpRow } from '../src/lib/dossier/bulk';
import { KewInfra } from '../src/lib/dossier/kew-infra';

export async function loadKewInfra(dir: string): Promise<{ kew: KewInfra; day: string } | null> {
  const path = `${dir}/wcvp_names.csv`;
  if (!existsSync(path)) return null;
  const kew = new KewInfra();
  let h: string[] = [];
  let i = 0;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  // Each line its own copy, so a kept field keeps only its line alive, not readline's 64 KB chunk (round eighty, X).
  for await (const raw of rl) {
    const line = ownText(raw);
    if (i++ === 0) { h = line.replace(/^﻿/, '').split('|'); continue; }
    if (!line) continue;
    const r = wcvpRow(h, line);
    kew.add({ id: r.plant_name_id, name: r.taxon_name, status: r.taxon_status, acceptedId: r.accepted_plant_name_id || r.plant_name_id, ipni: r.ipni_id || undefined });
  }
  // The day of Kew's file, read as every Kew-reading step reads it (kewFileDay).
  return { kew, day: kewFileDay(dir) };
}
