/**
 * The collector genera (round seventy-three; self-F 11, the owner's decision): the genera the species list takes whole,
 * `scripts/specialist-genera.txt`, which the derivation reads and /about/how names as the list's 173 collector genera.
 * It is the one record of them: the index carries no mark of its own. Read on the server only (the front page's load and
 * the species page's 404); the page is sent the ids of the catalogue's rows among them.
 */
import generaList from '../../../../scripts/specialist-genera.txt?raw';
import type { Row } from '$dossier/catalogue';

export const COLLECTOR_GENERA: ReadonlySet<string> = new Set(generaList.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

/** The genus rows of the catalogue that are collector genera: their ids, their letters, and the species they hold. */
export function collectorRows(rows: Row[]): { ids: string[]; letters: string[]; species: number } {
  const mine = rows.filter((r) => COLLECTOR_GENERA.has(r.label));
  return { ids: mine.map((r) => r.id), letters: [...new Set(mine.map((r) => r.letter).filter(Boolean))], species: mine.reduce((n, r) => n + r.count, 0) };
}
