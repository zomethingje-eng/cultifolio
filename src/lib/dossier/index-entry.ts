/** One species as the index lists it: what the catalogue, the search and the bucket files are built from, on the PC and in the Worker alike. */
export interface IndexEntry {
  key: number;
  slug: string;
  name: string;
  family?: string;
  common?: string;
  /** Every other English common name the species has (round sixty; the product review, 6), searched as `common` is. Absent in an index built before; none is then searched beyond `common`. */
  commons?: string[];
  origin?: string[];
  thumb?: string;
  photos: number;
  open: number;
  climate: string;
  /** The six species whose habitat climate is nearest (src/lib/core/near.ts), written at index time. */
  near?: number[];
  /** Older names for the species, as binomials, written at index time (round thirty-one, 3). */
  syn?: string[];
}

/** One vernacular name as a dossier holds it (src/lib/dossier/schema.ts `Vernacular`); `preferred`, `sources` and `alsoFrom` are absent in a dossier whose names were fetched before, and read as "not preferred" and "one source". */
export type VernacularName = { name: string; lang?: string; source?: string; preferred?: boolean; sources?: number; alsoFrom?: string[] };

/** What `englishNames` needs to know of the corpus to set a name back for naming another genus: the species' own genus, and every genus of the corpus in lower case (`generaOf`). */
export interface NameScope {
  genus?: string;
  genera?: ReadonlySet<string>;
}

/** Folded for comparing words: accents off, lower case. */
const foldWord = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** The genus of a scientific name (or a genus name itself), in lower case, past a leading hybrid sign ("× Gasteraloe beguinii" is gasteraloe). */
const genusWord = (name: string) => foldWord(name.trim().replace(/^(?:×\s*|x\s+)/i, '').split(/\s+/)[0] ?? '');
/** Every genus of a list of names (scientific names, or genus names), in lower case: the corpus's genera for `NameScope`. */
export function generaOf(names: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const n of names) { const g = genusWord(n); if (g) out.add(g); }
  return out;
}

/**
 * The first letter as a capital, and nothing else changed: a name listed in lower case ("flooded-gum") reads as a name
 * under the species ("Flooded-gum"). Capitals inside a name are the source's and stay: lowering the one after a hyphen
 * (decided in round sixty-one) made "Apple-of-Peru" "Apple-of-peru" and "Black-eyed-Susan" "Black-eyed-susan", so it
 * was taken out before it shipped (round sixty-one, the first deploy's index).
 */
// Past a leading ʻokina, modifier letter or apostrophe: "ʻihi" is "ʻIhi" (round sixty-two; the corpus review, 10a).
const firstUp = (s: string) => { const lead = /^[\p{Lm}'’‘]*/u.exec(s)![0]; const c = [...s.slice(lead.length)][0] ?? ''; return /\p{Ll}/u.test(c) ? lead + c.toLocaleUpperCase('en') + s.slice(lead.length + c.length) : s; };
/** One name whatever its case, hyphens, spacing or apostrophe: "String-of-Pearls" and "String of pearls" are one name given twice. */
const nameKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'").replace(/[-\s]+/g, ' ').trim();

/** The words of a spelling, split on spaces and hyphens, as written. */
const tokensOf = (s: string) => s.split(/[\s-]+/).filter(Boolean);
/**
 * The genus names English uses as nouns of its own, so that a name ending in one is a grower's word and not another
 * genus named as a genus ("Lace aloe" for Aristaloe aristata, "Autumn crocus" for Colchicum, "Zebra haworthia" for
 * Haworthiopsis, "Night-blooming cereus" for Selenicereus, "Peacock iris" for Moraea, "Red yucca" for Hesperaloe). A
 * fixed list, written here and on /about/how; any other genus as a name's last word sets the name back (round sixty-two;
 * the verification review's search 16).
 */
export const ENGLISH_USE: ReadonlySet<string> = new Set(['agave', 'aloe', 'amaryllis', 'cereus', 'crocus', 'haworthia', 'iris', 'lotus', 'mimosa', 'yucca']); // lotus and mimosa: Nelumbo nucifera's and Leucaena's English names in the live index (round sixty-two, after --names)
/** An epithet's stem, so a genus transfer that changed its ending ("dichotoma", "dichotomum") still reads as one epithet. */
const stem = (w: string) => foldWord(w).replace(/(?:us|um|a|is|e|es|i)$/, '');

/**
 * A species' English common names as the index and the species page show them (round sixty-one, decision 7; round
 * sixty-two, decision 3). Before, the first name GBIF listed was shown as it was written, so Curio rowleyanus was
 * "String-Of-Beads Senecio" on its tile, its row and its page title, while "String-of-Pearls" sat in `commons`.
 *
 * The rule, with no name picked by hand:
 *   1. English names only (`lang` "eng"). Spellings of one name (case, hyphens, spaces, apostrophes) are one name, and
 *      it is given by as many sources as give any of its spellings, each source counted once.
 *   2. Set back, after every name that is not: a comma list of several names; and, with `scope`, another genus of the
 *      corpus named alone ("Osteospermum" for a Dimorphotheca), or a name of two words or more whose last word is another genus of the corpus ("Flatleaf Senecio" and "String-of-Beads Senecio" for a
 *      Curio), unless that word is one English uses as a noun of its own (`ENGLISH_USE`: "Lace aloe", "Autumn crocus",
 *      "Zebra haworthia", "Peacock iris"); or that is another genus followed by the species' own epithet (an older name
 *      of it, "Senecio rowleyanus" for Curio rowleyanus). Words are compared in any case: the rule read a source's
 *      capitals, and the same name was set back or shown by how one source happened to write it (round sixty-two; the
 *      verification review's search 16; A34). A genus word that is not the last ("Arum lily") is not read.
 *   3. Then a name GBIF marks preferred.
 *   4. Then the name more sources give.
 *   5. Then GBIF's order. Of a name's spellings, the one more sources give is shown, then the one GBIF lists first.
 * Preferred flags and source counts exist only for names fetched since round sixty-two's `--names` step; for the rest,
 * every spelling row counts as one source. The first letter is shown as a capital; nothing else of a source's spelling
 * is changed. No source string is split into new names, and every name stays in the answer, so every alternative stays
 * searchable: `common` is the rule's choice, `commons` every other English name in the rule's order, one spelling each.
 */
export function englishNames(vernacular: VernacularName[], scope: NameScope = {}): { common?: string; commons?: string[] } {
  const groups = new Map<string, { at: number; spellings: Map<string, { n: number; at: number }>; from: Set<string>; preferred: boolean }>();
  vernacular.forEach((v, i) => {
    if (v.lang !== 'eng' || typeof v.name !== 'string') return;
    const name = v.name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const k = nameKey(name);
    const g = groups.get(k) ?? { at: i, spellings: new Map(), from: new Set<string>(), preferred: false };
    // The row's sources: the named ones by name, so one source giving three spellings is one (the corpus review, 8);
    // the rest (a row with no source, or a count from a dossier fetched before) each its own.
    const named = [v.source, ...(Array.isArray(v.alsoFrom) ? v.alsoFrom : [])].filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => `s:${x.trim()}`);
    const total = Number.isInteger(v.sources) && v.sources! > 0 ? v.sources! : 1;
    const own = new Set(named);
    for (let j = own.size; j < total; j++) own.add(`#${i}:${j}`);
    const sp = g.spellings.get(name) ?? { n: 0, at: i };
    sp.n += own.size;
    g.spellings.set(name, sp);
    for (const x of own) g.from.add(x);
    g.preferred ||= v.preferred === true;
    groups.set(k, g);
  });
  if (!groups.size) return {};
  const ownWords = scope.genus ? scope.genus.trim().replace(/^(?:×\s*|x\s+)/i, '').split(/\s+/) : [];
  const own = ownWords.length ? foldWord(ownWords[0]) : '';
  const epithet = ownWords[1] && /^\p{Ll}/u.test(ownWords[1]) ? ownWords[1] : '';
  const genera = scope.genera;
  const other = (w: string) => { const f = foldWord(w).replace(/[^a-z]/g, ''); return !!f && f !== own && !!genera?.has(f); };
  const setBack = (spelling: string): boolean => {
    if (/[,;]/.test(spelling)) return true;
    if (!genera) return false;
    const ts = tokensOf(spelling);
    // Another genus as the last word of a name of two words or more, in any case, unless English uses it as a noun.
    const last = ts[ts.length - 1] ?? '';
    if (ts.length >= 2 && other(last) && !ENGLISH_USE.has(foldWord(last).replace(/[^a-z]/g, ''))) return true;
    // Another genus's name alone ("Osteospermum" for Dimorphotheca jucunda): a genus, not this species' English name,
    // unless English uses it as a noun (round sixty-two, after the --names step: 1,613 shown names changed, and the
    // audit's sample showed one).
    if (ts.length === 1 && other(last) && !ENGLISH_USE.has(foldWord(last).replace(/[^a-z]/g, ''))) return true;
    // Another genus and the species' own epithet, in any case: an older name of it, written as an English one ("Aloe
    // Variegata" escaped as "Aloe variegata" did not).
    const ws = spelling.split(' ');
    return ws.length === 2 && other(ws[0]) && !!epithet && stem(ws[1]) === stem(epithet);
  };
  const named = [...groups.values()].map((g) => {
    const spelling = [...g.spellings.entries()].sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at)[0][0];
    return { spelling, back: setBack(spelling), at: g.at, sources: g.from.size, preferred: g.preferred };
  });
  // GBIF's order last: each name's place is its first row's, which no two names share, so nothing after it could decide.
  named.sort((a, b) => Number(a.back) - Number(b.back) || Number(b.preferred) - Number(a.preferred) || b.sources - a.sources || a.at - b.at);
  const names = named.map((n) => firstUp(n.spelling));
  return names.length > 1 ? { common: names[0], commons: names.slice(1) } : { common: names[0] };
}
