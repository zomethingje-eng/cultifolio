/** Text handling for quoted prose. Nothing here writes; it only decides where a quotation stops. */

/** Abbreviations a botanical text ends words with that are not sentence ends. */
const ABBR = /(?:\b(?:subsp|ssp|var|f|fa|cv|cf|aff|ca|approx|syn|sp|spp|nov|comb|sect|ser|subg|subsect|no|vol|ed|eds|pp|fig|figs|i\.e|e\.g|et al|St|Mt|Dr|Mr|Mrs|Ms|Prof|Jr|Sr|[A-Z])\.)$/;

/**
 * The first `n` sentences of a text, and whether more followed. A sentence ends
 * at ". ", "! " or "? " followed by a capital, a quote, a digit or a bracket,
 * unless the word before the stop is an abbreviation (subsp., var., an initial).
 * Better to under-split than to cut "Copiapoa cinerea subsp. haseltoniana" in two.
 */
export function firstSentences(text: string, n: number): { text: string; more: boolean } {
  const t = text.trim();
  if (!t) return { text: '', more: false };
  const ends: number[] = [];
  const re = /[.!?]["'”’)\]]*(?=\s+(?:["'“‘(\[]?[A-Z0-9]))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    const before = t.slice(0, m.index + 1);
    if (ABBR.test(before)) continue;
    ends.push(end);
    if (ends.length >= n) break;
  }
  if (ends.length < n) return { text: t, more: false };
  const cut = ends[n - 1];
  return { text: t.slice(0, cut).trim(), more: cut < t.length };
}
