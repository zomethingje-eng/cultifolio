/**
 * The species picker's reading of the reference's search, apart from the component so that every rule here is tested
 * over real index entries (round eighty-five; review-s S1, review-p P2, outside review A12 and S7).
 *
 * - `localRow`: a reference hit as a row of the list, with why it was offered (the name of a page merged into it, one of
 *   its older names, or its record under another author's name);
 * - `olderLine`: the row the add form's line names when the name typed is not a page's own name but an older name of
 *   one, or the name of a page merged into one. Never for a name the reference heads, and never for a name that is only
 *   the same spelling by another author (`hom`), which is not an older name of the plant typed;
 * - `offeredReading`: whether the server's relaxed reading of what was typed names the species typed, so its rows are
 *   offered;
 * - `byCommonName`: whether the words typed are one of the hit's common names, so a row is not said to be "under
 *   another genus" for a common name's first word.
 */
import { mergedOf, olderNameOf, homonymOf } from '$lib/ui/ref/searched';
import { sameName, cleanTyped } from '$lib/ui/picked-name';
import { words as nameWords } from '$core/postings';
import { speciesOf, nameParts } from '$core/names';
import { isSeasonKey, type SeasonKey } from '$core/season-key';
import type { Searchable } from '$core/search';

/** A row of the list. `key` is the GBIF key a pick files (below 1: none). */
export type PickerRow = {
  key: number;
  name: string;
  family?: string;
  rank?: string;
  status?: string;
  /** From the reference's own search (a page), not GBIF's name service. */
  local?: boolean;
  /** The row's genus is not the one typed, and the row was not found by a common name. */
  far?: boolean;
  /** Found by a similar spelling (the server's near pass). */
  similar?: boolean;
  /** The genus offered for a genus followed by capitalised words, the rest kept as a cultivar. */
  asCultivar?: string;
  /** The name of a page merged into this one that the words typed are. */
  merged?: string;
  /** The older name of this page the row was found by. */
  older?: string;
  /**
   * GBIF's name for this page's own key, where Kew's name heads the page, when the row was found by it (the index's
   * `gname`; round eighty-six, review-w W1): said "GBIF's name for", never "older name".
   */
  gname?: string;
  /** The name of this page's record under another author that the row was found by. */
  hom?: { name: string; text: string };
  /** The page's rain season, as the browse rows say it (round 112; MYPLANTS 25). */
  yr?: SeasonKey;
  /** The row that opens GBIF's other names in place: how many (round 112). */
  more?: number;
};

/** A hit of the reference's search as the check reads it. */
export type Hit = Searchable & { gbif?: number; homBy?: string[][]; gname?: string; yr?: unknown };

/**
 * Whether the words typed take the hit by one of its common names (its headline, its other English names or their
 * pooled spellings), each word the start of a word of one name: "jade plant" is Crassula ovata's (round eighty-five;
 * review-s S7: the row said "has a species page, under another genus").
 */
export function byCommonName(typed: string, hit: Searchable): boolean {
  const qs = nameWords(typed);
  if (!qs.length) return false;
  return [hit.common, ...(hit.commons ?? []), ...(hit.spellings ?? [])].some((c) => { if (!c) return false; const ws = nameWords(c); return qs.every((q) => ws.some((w) => w.startsWith(q))); });
}

/** A reference hit as a row of the list, for the text typed. `similar`: the answer came by a similar spelling. */
export function localRow(text: string, hit: Hit, similar: boolean): PickerRow {
  const merged = similar ? null : mergedOf(text, hit);
  const older = similar || merged ? null : olderNameOf(text, hit);
  const hom = similar || merged || older ? null : homonymOf(text, hit);
  const typedGenus = (nameWords(text)[0] ?? '').slice(0, 4);
  const far = !!typedGenus && !hit.name.toLowerCase().startsWith(typedGenus) && !byCommonName(text, hit);
  const gname = older && hit.gname && sameName(older, hit.gname) ? older : null;
  return { key: hit.gbif ?? -1, name: hit.name, family: hit.family, local: true, similar, far, ...(merged ? { merged } : {}), ...(older ? { older } : {}), ...(gname ? { gname } : {}), ...(hom ? { hom } : {}), ...(isSeasonKey(hit.yr) ? { yr: hit.yr } : {}) };
}

/**
 * The page the add form's line names for the name typed (`typed`, the scientific part as `parseName` reads it), and how:
 * `merged` when it is the name of a page merged into this one, `older` when it is one of this page's older names, said
 * as exactly that name (`olderNameOf` puts the exact one first). Undefined when any reference row is headed by the name
 * typed (Aloe vera, Crassula ovata, Echeveria elegans: each its own page, which another page holds only under another
 * author or as a homonym), and for a name the rows hold only under another author (`hom`): the same spelling by another
 * author names another plant, not an older name of this one (round eighty-five; review-s S1, review-p P2). A merged row
 * comes before an older-name row (Echeveria peacockii is merged into Echeveria desmetiana, and an older name of Dudleya
 * pulverulenta by another author's reading).
 */
export function olderLine<T extends PickerRow>(rows: readonly T[], typed: string): { row: T; why: 'merged' | 'older' } | undefined {
  const want = cleanTyped(typed).trim();
  if (!want) return undefined;
  const local = rows.filter((r) => r.local && !r.similar);
  if (local.some((r) => sameName(r.name, want))) return undefined;
  const merged = local.find((r) => r.merged && sameName(r.merged, want));
  if (merged) return { row: merged, why: 'merged' };
  // Never a page whose own species is the name typed (its variety, its subspecies, its autonym): the species is not an
  // older name of its own subspecies (outside review A9b).
  const older = local.find((r) => r.older && sameName(r.older, want) && !sameName(speciesOf(r.name), speciesOf(want)));
  return older ? { row: older, why: 'older' } : undefined;
}

/**
 * Whether the rows of an answer for other words than those typed are offered (`relaxed`, the server's reading; `typed`,
 * the text): when the reading is the genus and epithet typed, whatever it left out after them (a pasted label's authors
 * and ranks), or the genus typed and the start of the epithet typed, three letters or more, which is how the server
 * reads a misspelt epithet ("lithops lesleyi" read as "lithops lesle", which finds Lithops lesliei; round eighty-five,
 * review-s S7). An answer with no reading is to the words typed.
 */
export function offeredReading(relaxed: string | undefined, typed: string): boolean {
  if (genusReading(relaxed, typed)) return true;
  if (!relaxed) return true;
  const two = (s: string) => cleanTyped(s).trim().split(/\s+/).slice(0, 2);
  const r = two(relaxed);
  const t = two(typed);
  if (r.length < 2 || t.length < 2) return false;
  if (!sameName(r[0], t[0])) return false;
  const re = r[1].toLowerCase(), te = t[1].toLowerCase();
  return re === te || (re.length >= 3 && te.startsWith(re));
}

/**
 * Whether the server read the typed genus as another, nearest, genus and kept the rest as typed ("Copiapao cin" read as
 * "Copiapoa cin": N's `nearestGenus`, round eighty-five, review-s S6). Its rows are offered as a similar spelling, as the
 * search offers them (the merge, round eighty-five: the picker offered none, smoke-3's "the picker does the same").
 */
export function genusReading(relaxed: string | undefined, typed: string): boolean {
  if (!relaxed) return false;
  const words = (s: string) => cleanTyped(s).trim().toLowerCase().split(/\s+/);
  const r = words(relaxed), t = words(typed);
  return r.length === t.length && r.length >= 1 && r[0] !== t[0] && r.slice(1).join(' ') === t.slice(1).join(' ');
}

/**
 * The list's groups (round 112; MYPLANTS 25: the list moved under the finger as its two sources answered, and a fossil
 * genus of GBIF's could be its first row). In fixed places, whichever source answers first:
 *
 * - `pages`, the reference's species pages, first, at most six: the exact rows, then those by a similar spelling (left out
 *   when the genus with a cultivar is offered for a genus followed by capitalised words, `dropSimilar`, as round sixty-two
 *   never put a similar spelling first for that shape);
 * - `others`, at most two names with no species page: the genus with the rest kept as a cultivar, and GBIF's name spelt
 *   exactly as typed (`typed`, the name the service was asked), never one a page of the list already holds;
 * - `more`, GBIF's other names, shown only when asked for, behind one row. A row of GBIF's whose key a page holds is
 *   the page's, and not listed again.
 */
export function pickerGroups<T extends PickerRow>(o: { local: readonly T[]; remote: readonly T[]; genus: readonly T[]; typed: string; dropSimilar: boolean }): { pages: T[]; others: T[]; more: T[] } {
  const exact = o.local.filter((l) => !l.similar);
  const pages = [...exact, ...(o.dropSimilar ? [] : o.local.filter((l) => l.similar))].slice(0, 6);
  const held = new Set(pages.filter((p) => p.key > 0).map((p) => p.key));
  const remote = o.remote.filter((x) => !(x.key > 0 && held.has(x.key)));
  const exactRemote = remote.filter((x) => sameName(x.name, o.typed) && !pages.some((p) => sameName(p.name, x.name)));
  const others: T[] = [];
  for (const x of [...o.genus, ...exactRemote]) if (others.length < 2 && !others.some((y) => sameName(y.name, x.name) && y.rank === x.rank)) others.push(x);
  const more = remote.filter((x) => !others.includes(x));
  return { pages, others, more };
}

const foldChar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * A name in its parts (`nameParts`: the Latin italic, a rank word roman), each split where the text typed ends, so the
 * part not typed can be set apart (round 112; MYPLANTS 25, Baymard's advice: emphasise what the suggestion adds). The
 * words typed are read against the name's words in order, each the start of one; a hybrid sign in the name is passed
 * over. When they are not the name's start (a common name, "jade plant", or a similar spelling), nothing is set apart.
 */
export function emphasised(name: string, typed: string): Array<{ text: string; italic: boolean; em: boolean }> {
  const parts = nameParts(name);
  const full = parts.map((p) => p.text).join('');
  const tw = cleanTyped(typed).trim().split(/\s+/).filter(Boolean).map(foldChar);
  const mask = new Array<boolean>(full.length).fill(false);
  let ok = tw.length > 0;
  if (ok) {
    const words: Array<{ at: number; w: string }> = [];
    full.replace(/\S+/g, (w, at: number) => { words.push({ at, w }); return w; });
    let k = 0;
    for (const { at, w } of words) {
      if (k >= tw.length) break;
      const fw = foldChar(w);
      if (fw.startsWith(tw[k])) { for (let c = 0; c < tw[k].length; c++) mask[at + c] = true; k++; continue; }
      if (w === '×' || fw === 'x') { for (let c = 0; c < w.length; c++) mask[at + c] = true; continue; }
      ok = false;
      break;
    }
    if (k < tw.length) ok = false;
  }
  const out: Array<{ text: string; italic: boolean; em: boolean }> = [];
  let at = 0;
  for (const p of parts) {
    for (let c = 0; c < p.text.length; c++) {
      const em = ok && !mask[at + c] && p.text[c] !== ' ';
      const last = out[out.length - 1];
      // A space joins the run before it, so a run is a word or the words between.
      if (last && last.italic === p.italic && (last.em === em || p.text[c] === ' ')) last.text += p.text[c];
      else out.push({ text: p.text[c], italic: p.italic, em });
    }
    at += p.text.length;
  }
  return out;
}
