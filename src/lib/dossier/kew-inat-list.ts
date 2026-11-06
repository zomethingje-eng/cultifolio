/**
 * `--list-kew-inat` (round eighty-six; the plan's B6): the pages without a GBIF key (built from Kew's file,
 * `build-kew.ts`) whose iNaturalist taxon was refused only because Kew's names were compared with their rank word, so that
 * iNaturalist's name for a variety ("Trichocereus macrogonus pachanoi") matched none of them; Kew holds "Trichocereus
 * macrogonus var. pachanoi" as a homotypic synonym of Echinopsis pachanoi, and the page took no taxon and no photograph.
 *
 * Offline: each page's own record says what iNaturalist answered ("not taken: iNaturalist files X as Y, which is neither
 * this species' name nor one of Kew's names for it"), and its stored names are Kew's names for it; a page is listed when Y
 * is one of them read without the rank word (`kewOwnNames`' rule since round eighty-six), and the line says which. The
 * list is what the rule would change, to rebuild online with `--keys` (which asks iNaturalist its taxon and photographs).
 * Pure: the caller reads the dossiers and writes the list.
 */
import { ownNames, isOwnName, canonicalOf, nameKey } from './own-names';

export type KewInatPage = { key: string; name: { scientific: string; synonyms?: readonly string[] }; ids?: { gbif?: number; inat?: number }; upstream?: Record<string, { status: string; detail?: string } | undefined> };
const NOT_TAKEN = /not taken: iNaturalist files (.+?) as (.+?), which is neither this species' name nor one of Kew's names for it/;

/** The pages the rule would give an iNaturalist taxon to (`lines`: "<page id> <name>" for `--keys`), and a sentence for each (`said`). */
export function kewInatList(pages: Iterable<KewInatPage>): { lines: string[]; said: string[]; read: number; refused: number } {
  const lines: string[] = [], said: string[] = [];
  let read = 0, refused = 0;
  for (const d of pages) {
    if (d.ids?.gbif != null || !/^k\d/.test(d.key)) continue;
    read++;
    const row = d.upstream?.['inat.taxon'];
    const m = row?.status === 'none' ? NOT_TAKEN.exec(row.detail ?? '') : null;
    if (!m) continue;
    refused++;
    const iNat = m[2].trim();
    const synonyms = d.name.synonyms ?? [];
    const own = ownNames({ scientific: canonicalOf(d.name.scientific) ?? d.name.scientific, synonyms });
    if (!isOwnName(own, iNat)) continue;
    const kew = synonyms.find((s) => { const c = canonicalOf(s); return !!c && nameKey(c) === nameKey(iNat); });
    lines.push(`${d.key} ${d.name.scientific}`);
    said.push(`${d.name.scientific} [${d.key}]: iNaturalist's ${iNat} is ${kew ? `Kew's ${kew}` : 'its own name'} without the rank word; rebuild to take its taxon`);
  }
  return { lines, said, read, refused };
}
