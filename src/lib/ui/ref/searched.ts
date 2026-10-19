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
