/**
 * Which id each page of a corpus has (round seventy-eight; `$core/page-id`; docs/SCALE-STUDY.md section 5, the owner's
 * decision 4). One rule, applied in one place, `--index` (and at the end of a build, which writes the index too):
 *
 *   - `k<plant_name_id>`: the page's Kew entry (`name.kew.entry`, the plant_name_id of the taxon Kew accepts for the page,
 *     read from Kew's file by `--fill kew-names`) is one that no other page of the corpus holds;
 *   - `g<GBIF key>` otherwise (rule 3, no guessing): Kew's file not read for the page, Kew's rows not deciding (the entry
 *     is ''), two pages or more holding one entry (which of them is Kew's is not guessed: a merge decides it), or a page
 *     merged into another (`scripts/merged-pages.txt`), which is not a holder, so the page it joins takes the Kew id.
 *
 * A page with neither (no unshared entry and no GBIF key) has no id, and is refused. A page built from Kew's file without
 * a GBIF key (round seventy-nine; `build-kew.ts`) has Kew's entry as its own, so it is `k<plant_name_id>` unless another
 * page holds that entry too, when it is refused and said (`ids-gbif.txt`), never given a GBIF key.
 *
 * Pure: the build and `--rekey` give it the pages, and write what it answers.
 */
import { gbifPage, kewPage, type PageId } from '../core/page-id';

/** A page as the rule reads it: its GBIF key (`ids.gbif`) and its Kew entry, `undefined` when Kew's file was not read for it. */
export interface IdPage {
  gbif?: number;
  entry?: string;
}
export type IdWhy = 'kew' | 'kew-not-read' | 'kew-undecided' | 'kew-shared' | 'merged-away';
export interface IdAnswer {
  /** Null: no id the rule can give (no unshared Kew entry and no GBIF key); the page is refused. */
  id: PageId | null;
  why: IdWhy;
  /** For `kew-shared`: the GBIF keys of the other pages that hold the entry; for `merged-away`, the page it joins. */
  with?: number[];
}

/** The words of a reason, for `ids-gbif.txt` and the log. */
export function idWords(a: IdAnswer, entry?: string): string {
  switch (a.why) {
    case 'kew': return `Kew's plant_name_id ${entry}`;
    case 'kew-not-read': return "Kew's file not read for this page (--fill kew-names)";
    case 'kew-undecided': return "Kew's rows do not decide which taxon this page is";
    case 'kew-shared': return `Kew's entry ${entry} is also the entry of GBIF's ${a.with!.join(', ')}: a merge decides which page is Kew's`;
    case 'merged-away': return `merged into GBIF's ${a.with!.join(', ')} (scripts/merged-pages.txt), which takes the Kew id`;
  }
}

/** A Kew entry as an id can carry it: Kew's plant_name_id is digits, no leading zero. */
const kewish = (entry: string | undefined): entry is string => !!entry && /^[1-9][0-9]{0,9}$/.test(entry);

/**
 * The id of every page, in the order given. `merges` are the owner's merges by GBIF key (`from` joins `into`): a merge
 * counts only while the page it joins is among `pages`.
 */
export function pageIds(pages: readonly IdPage[], merges: ReadonlyArray<{ from: number; into: number }> = []): IdAnswer[] {
  const present = new Set(pages.flatMap((p) => (p.gbif != null ? [p.gbif] : [])));
  const away = new Map<number, number>();
  for (const m of merges) if (present.has(m.into) && m.from !== m.into) away.set(m.from, m.into);
  const holders = new Map<string, number[]>();
  pages.forEach((p, i) => {
    if (!kewish(p.entry) || (p.gbif != null && away.has(p.gbif))) return;
    (holders.get(p.entry) ?? holders.set(p.entry, []).get(p.entry)!).push(i);
  });
  return pages.map((p, i) => {
    const g = p.gbif != null ? gbifPage(p.gbif) : null;
    if (p.gbif != null && away.has(p.gbif)) return { id: g, why: 'merged-away', with: [away.get(p.gbif)!] };
    if (p.entry === undefined) return { id: g, why: 'kew-not-read' };
    if (!kewish(p.entry)) return { id: g, why: 'kew-undecided' };
    const hs = holders.get(p.entry)!;
    if (hs.length === 1) return { id: kewPage(p.entry), why: 'kew' };
    return { id: g, why: 'kew-shared', with: hs.filter((j) => j !== i).map((j) => pages[j].gbif ?? 0) };
  });
}
