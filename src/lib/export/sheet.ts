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

export async function plantsSheet(): Promise<string> {
  const { state } = materialise(await collection.exportChanges());
  return plantsCsv(live<Accession & Record_>(state, 'accession'), state);
}

export async function downloadPlantsSheet(): Promise<void> {
  saveFile(new Blob([await plantsSheet()], { type: 'text/csv;charset=utf-8' }), `cultifolio-plants-${localDate()}.csv`);
}
