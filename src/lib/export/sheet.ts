/**
 * "Download as a spreadsheet" on My plants (round sixty; the grower review's §2 table, the self-review's experience item
 * 10): the very plants.csv a backup carries, built by the backup's own `plantsCsv` from the same log, so the two never
 * differ and the import page reads it back.
 */
import { materialise, live, type Record_ } from '$core/log';
import { plantsCsv } from '$lib/backup/backup';
import { collection } from '$lib/db/collection.svelte';
import { localDate } from '$core/dates';
import type { Accession } from '$lib/db/types';
import { saveFile } from './save';

/** The plants sheet; `only` holds it to those plants (round 121: My plants' table, "CSV of these N"). */
export async function plantsSheet(only?: Set<string>): Promise<string> {
  const { state } = materialise(await collection.exportChanges());
  const accs = live<Accession & Record_>(state, 'accession');
  return plantsCsv(only ? accs.filter((a) => only.has(a.id)) : accs, state);
}

export async function downloadPlantsSheet(): Promise<void> {
  saveFile(new Blob([await plantsSheet()], { type: 'text/csv;charset=utf-8' }), `cultifolio-plants-${localDate()}.csv`);
}
