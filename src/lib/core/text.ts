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
  const ends = sentenceEnds(t, n);
  if (ends.length < n) return { text: t, more: false };
  const cut = ends[n - 1];
  return { text: t.slice(0, cut).trim(), more: cut < t.length };
}

/** Where the sentences of a text end (at most `n`), by `firstSentences`' rule; a stop at the very end of the text counts. */
function sentenceEnds(t: string, n = Infinity): number[] {
  const ends: number[] = [];
  const re = /[.!?]["'\u201D\u2019)\]]*(?=\s+(?:["'\u201C\u2018(\[]?[\p{Lu}0-9])|$)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].length;
    const before = t.slice(0, m.index + 1);
    if (end < t.length && ABBR.test(before)) continue;
    // "Sp. Pl. 1753": a token of at most four letters ending in "." followed by another such token or a digit is a citation, not an end.
    const tail = /(?:^|\s)(\p{L}{1,4})\.$/u.exec(before);
    const next = /^\s+(\p{L}{1,4}\.|\d)/u.exec(t.slice(end));
    if (tail && next) continue;
    ends.push(end);
    if (ends.length >= n) break;
  }
  return ends;
}

/**
 * A quoted text kept to at most `max` characters, cut at the end of its last whole sentence within them (round eighty-two,
 * F; review 1's 36: Wikipedia's extract was sliced at 1,500 characters before the page's four-sentence cut, so a long first
 * paragraph could end mid-word with no sign of the cut). With no sentence end inside, it is cut at a word with an ellipsis
 * (`clip`). A text within `max` is kept whole.
 */
export function upToSentence(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const ends = sentenceEnds(t).filter((e) => e <= max);
  return ends.length ? t.slice(0, ends[ends.length - 1]).trim() : clip(t, max);
}

/**
 * A text cut to at most `max` characters at a word boundary, with an ellipsis when anything was cut: a search result or a
 * link preview that ends "named after the Austrian botanist Friedrich Welwit" reads as broken (round fifty-nine, after
 * the deploy). The ellipsis counts toward `max`. Round sixty (A29): a cut never splits a character written as two
 * UTF-16 units (it left half of one), a word that ends exactly where the room does is kept (it was dropped when the
 * next character was a space), and no full stop is left before the ellipsis.
 */
export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  let room = t.slice(0, max - 1);
  if (/[\uD800-\uDBFF]$/.test(room)) room = room.slice(0, -1);
  const whole = /\s/.test(t[room.length] ?? '');
  const space = room.lastIndexOf(' ');
  const cut = (whole ? room : space > max * 0.6 ? room.slice(0, space) : room).replace(/[\s,;:.(–—-]+$/u, '');
  return `${cut}…`;
}
