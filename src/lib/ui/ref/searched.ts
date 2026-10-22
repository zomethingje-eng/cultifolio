/**
 * What the front page says above a catalogue search's rows when the server answered other words than those typed, or
 * answered by a similar spelling. A pure function over the answer, so the words are tested apart from the page.
 *
 * Two kinds of relaxing reach the page under one `relaxed`: the retry on the first two words when nothing matched as
 * written, and a reading that set aside an author, a field number or a quoted cultivar while the name itself matched
 * ("Copiapoa cinerea Phil."). Only the first is "nothing matched": said of the second it was untrue, since the name
 * matched (round sixty-two; the search review's 3). An answer that names the words its reading left out
 * (`relaxed.left`, from the second pass of round sixty-two) is that reading, never a retry; one that marks the retry
 * itself (`relaxed.retry`) is taken at its word; otherwise the page tells the two apart by the server's own rule,
 * `droppedLabel` over the same hits: the reading that set words aside names exactly the words the answer names, and the
 * retry is anything else. `near` is said as a similar spelling,
 * which the front page did not say (round sixty-two; the search review's 18).
 */
import { droppedLabel, type Searchable } from '$core/search';

export interface SearchedAnswer {
  relaxed?: { query?: unknown; left?: unknown; retry?: unknown } | null;
  near?: unknown;
  /** Every word is too common to list what matches them all (round seventy-seven): `narrowSentence` says so. */
  narrow?: unknown;
}

/**
 * What the front page says when the server could not list a query's matches because every word of it is too common
 * ("cape provinces", "a e"; round seventy-seven, `$core/search-files`): never "nothing matches", which would be untrue.
 */
export function narrowSentence(typed: string): string {
  return `Too many species match “${typed.trim()}” to list them all. Type another letter or another word to narrow it.`;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const fold = (w: string) => w.normalize('NFKC').toLowerCase().replace(/^[^\p{L}\p{N}×]+|[^\p{L}\p{N}×]+$/gu, '');

/** The typed words the searched words do not hold, in the order typed, joined as typed. */
export function leftOut(typed: string, searched: string): string {
  const kept = new Set(words(searched).map(fold));
  return words(typed).filter((w) => !kept.has(fold(w))).join(' ');
}

/** The sentence, or null when the answer is to the words as typed, spelt as typed. */
export function searchedSentence(typed: string, a: SearchedAnswer | null | undefined, hits: Searchable[] = []): string | null {
  const t = typed.trim();
  const q = typeof a?.relaxed?.query === 'string' ? a.relaxed.query.trim() : '';
  const near = a?.near === true;
  if (!t || (!q && !near) || a?.narrow === true) return null; // too common to list: `narrowSentence` says it
  if (!q) return `No name in the reference is spelt “${t}”; these are similar spellings.`;
  const named = typeof a?.relaxed?.left === 'string' && a.relaxed.left.trim() ? a.relaxed.left.trim() : null;
  const left = named ?? leftOut(t, q);
  const retry = named ? false : typeof a?.relaxed?.retry === 'boolean' ? a.relaxed.retry : droppedLabel(t, hits) !== q;
  const lead = retry
    ? `Nothing matched “${t}” as written. Showing results for “${q}”`
    : `Searched for “${q}”${left ? `, leaving out “${left}”` : ''}`;
  return near ? `${lead}; no name is spelt that way, so these are similar spellings.` : `${lead}.`;
}

const fmt = (n: number) => n.toLocaleString('en-GB');
/**
 * How many hits the front page's search asks for first, and how many each "Show more" asks for (round eighty). Each hit
 * shown is one more read of the bucket for the server, six at a time (the Worker's limit on connections waiting at once),
 * and a common word's hits lie all over the index: 60 hits were ten waves of reads, most of a cold search's two seconds.
 * Thirty fill a desktop's screen twice and a phone's five times.
 */
export const SEARCH_PAGE = 30;
export const SEARCH_MORE = 60;
/**
 * The count above a catalogue search's rows (round eighty; review-w 2, review-p 3): "60 matches of 48,361" was said
 * where 60 was the server's cap and Echeveria alone has 220. `loaded` hits are on the page; `total` is how many species
 * answer (undefined where the server did not say); `kept`, how many of them the server can list (undefined when all
 * can); `shown`, the loaded hits a chip leaves (the chip filters what is loaded); `of`, the reference's size.
 */
export function countSentence(o: { loaded: number; shown: number; total?: number; kept?: number; of: number; chip: boolean }): string {
  const { loaded, shown, total, of, chip } = o;
  const word = (n: number) => (n === 1 ? 'match' : 'matches');
  if (chip) {
    const all = total !== undefined && total > loaded ? `, of the first ${fmt(loaded)} of ${fmt(total)} matches` : `, of ${fmt(loaded)} ${word(loaded)}`;
    return `${fmt(shown)} with the chip on${shown === loaded ? '' : all}`;
  }
  if (total === undefined) return loaded >= SEARCH_PAGE ? `The first ${fmt(loaded)} matches of ${fmt(of)}` : `${fmt(loaded)} ${word(loaded)} of ${fmt(of)}`;
  if (total <= loaded) return `${fmt(total)} ${word(total)} of ${fmt(of)}`;
  return `${fmt(loaded)} of ${fmt(total)} matches`;
}
/**
 * What follows the rows when more answer than are loaded: how many "Show more" brings (null when none can be listed),
 * and what to say when the rest cannot be listed (`narrow`: the server keeps the first `kept` of a word too common to
 * list all of; or the count is not known).
 */
export function moreOf(o: { loaded: number; total?: number; kept?: number }): { more: number | null; narrow: string | null } {
  const { loaded, total, kept } = o;
  const listable = kept ?? total;
  const more = listable !== undefined && listable > loaded ? Math.min(SEARCH_MORE, listable - loaded) : null;
  if (more) return { more, narrow: null };
  if (total !== undefined && total <= loaded) return { more: null, narrow: null };
  if (total !== undefined) return { more: null, narrow: `The first ${fmt(loaded)} of ${fmt(total)} are listed: type more of the name, or another word, to narrow it.` };
  return loaded >= SEARCH_PAGE ? { more: null, narrow: 'More match: type more of the name, or another word, to narrow it.' } : { more: null, narrow: null };
}
/**
 * A region of origin a query names (round eighty; review-w 6: "cape provinces" gave no list and no way forward), said
 * before the link to the Origin grouping's row of the broad region it is part of. A species is grouped there by where
 * most of its native regions fall, so the row is the way to the region's neighbours, not a list of the region alone.
 */
export function regionSentence(r: { name: string }): string {
  return `“${r.name}” is a region of origin; in the Origin grouping it is part of`;
}
