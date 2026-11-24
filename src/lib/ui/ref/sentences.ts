/**
 * The quotation's first sentences, cut only at a sentence's end (round 115; SPECIES 18 b, rule 4: the text is quoted,
 * never reworded, and the cut falls at a sentence end). A sentence ends at ".", "!" or "?" followed by a space and a
 * capital letter or an opening quotation mark, where the word before the stop is not an abbreviation: a single letter
 * ("f." of "Hook.f."), a title ("St.", "Dr.", "Mt."), a botanical rank or qualifier ("var.", "subsp.", "cf.", "spp."),
 * or "e.g." and "i.e.". Where no such end is found within the text, the whole text is the head and nothing is held back.
 */
const ABBR = /(?:^|[\s(.])(?:[A-Za-z]|St|Dr|Mt|Mr|Mrs|Ms|Prof|var|subsp|ssp|cf|aff|spp|sp|cv|nr|vs|ca|approx|e\.g|i\.e|etc|al|No|Fig|Jr|Sr)$/;

export function firstSentences(text: string, n: number): { head: string; rest: string } {
  const t = text.trim();
  let at = 0;
  let found = 0;
  const re = /[.!?](?=\s+["“‘'(]?[A-Z])/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const before = t.slice(0, m.index);
    if (ABBR.test(before)) continue;
    found++;
    at = m.index + 1;
    if (found === n) break;
  }
  if (found < n) return { head: t, rest: '' };
  return { head: t.slice(0, at), rest: t.slice(at).trim() };
}
