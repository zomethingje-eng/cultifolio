/** Text handling for quoted prose. Nothing here writes; it only decides where a quotation stops. */

/** Abbreviations a botanical text ends words with that are not sentence ends: ranks, citation words, titles, initials. */
const ABBR = /(?:\b(?:subsp|ssp|var|f|fa|cv|cf|aff|ca|approx|syn|sp|spp|nov|comb|sect|ser|subg|subsect|no|vol|ed|eds|pp|fig|figs|i\.e|e\.g|et al|St|Mt|Dr|Mr|Mrs|Ms|Prof|Jr|Sr|Sp|Pl|Syst|Nat|Hort|Bot|Gard|Cact|Succ|J|Bull|Ann|Mem|Contr|Fl|Gen|Hist|Veg|Ind|Enum|Prodr|Icon|Rev|Notul|Kew|z|B|u|a|d|usw|bzw|vgl|ca|env|p\.ex|c\.-à-d|[A-Z\u00C0-\u00DE])\.)$/;

/**
 * The first `n` sentences of a text, and whether more followed. A sentence ends
 * at ". ", "! " or "? " followed by a capital letter (any script's), a quote,
 * a digit or a bracket, unless the word before the stop is an abbreviation
 * (subsp., var., an initial, a citation word like Sp. Pl. or Cact. Succ. J.),
 * or a short capitalised token that another short token or a number follows,
 * which is how a citation reads. Better to under-split than to cut
 * "Copiapoa cinerea subsp. haseltoniana" or "Sp. Pl. 1753" in two.
 */
export function firstSentences(text: string, n: number): { text: string; more: boolean } {
  const t = text.trim();
  if (!t) return { text: '', more: false };
  const ends: number[] = [];
  const re = /[.!?]["'\u201D\u2019)\]]*(?=\s+(?:["'\u201C\u2018(\[]?[\p{Lu}0-9]))/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    const before = t.slice(0, m.index + 1);
    if (ABBR.test(before)) continue;
    // "Sp. Pl. 1753": a token of at most four letters ending in "." followed by another such token or a digit is a citation, not an end.
    const tail = /(?:^|\s)(\p{L}{1,4})\.$/u.exec(before);
    const next = /^\s+(\p{L}{1,4}\.|\d)/u.exec(t.slice(end));
    if (tail && next) continue;
    ends.push(end);
    if (ends.length >= n) break;
  }
  if (ends.length < n) return { text: t, more: false };
  const cut = ends[n - 1];
  return { text: t.slice(0, cut).trim(), more: cut < t.length };
}
