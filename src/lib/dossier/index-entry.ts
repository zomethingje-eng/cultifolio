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

/** One vernacular name as a dossier holds it (src/lib/dossier/schema.ts `Vernacular`); `preferred` and `sources` are absent in a dossier built before round sixty-one, and read as "not preferred" and "one source". */
export type VernacularName = { name: string; lang?: string; source?: string; preferred?: boolean; sources?: number };

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
const firstUp = (s: string) => { const c = [...s][0] ?? ''; return /\p{Ll}/u.test(c) ? c.toLocaleUpperCase('en') + s.slice(c.length) : s; };
/** One name whatever its case, hyphens, spacing or apostrophe: "String-of-Pearls" and "String of pearls" are one name given twice. */
const nameKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'").replace(/[-\s]+/g, ' ').trim();
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A species' English common names as the index and the species page show them (round sixty-one, decision 7; the
 * corpus review, 9, and review B). Before, the first name GBIF listed was shown as it was written, so Curio rowleyanus
 * was "String-Of-Beads Senecio" on its tile, its row and its page title, while "String-of-Pearls" sat in `commons`.
 *
 * The rule, with no name picked by hand:
 *   1. English names only (`lang` "eng"). Spellings of one name (case, hyphens, spaces, apostrophes) are one name, and
 *      their sources add up.
 *   2. Set back, after every name that is not: a name containing another genus of the corpus (any but the species' own,
 *      so a former genus counts), a comma list of several names, and a string shaped like a binomial (a genus of the
 *      corpus and one lower-case word). These need `scope`; without it, only comma lists are set back.
 *   3. Then a name GBIF marks preferred.
 *   4. Then the name more sources give.
 *   5. Then GBIF's order, then the shorter name, then alphabetical order. Of a name's spellings, the one more sources
 *      give is shown, then the one GBIF lists first. (Fewest capitals chose "japanese-privet" over GBIF's own "Japanese
 *      Privet" on the first build, so it was dropped.)
 * The first letter is shown as a capital; nothing else of a source's spelling is changed. No source string is split into new names, and every name stays in the
 * answer, so every alternative stays searchable: `common` is the rule's choice, `commons` every other English name in
 * the rule's order, one spelling each.
 */
export function englishNames(vernacular: VernacularName[], scope: NameScope = {}): { common?: string; commons?: string[] } {
  const groups = new Map<string, { at: number; spellings: Map<string, { n: number; at: number }>; sources: number; preferred: boolean }>();
  vernacular.forEach((v, i) => {
    if (v.lang !== 'eng' || typeof v.name !== 'string') return;
    const name = v.name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const k = nameKey(name);
    const g = groups.get(k) ?? { at: i, spellings: new Map(), sources: 0, preferred: false };
    const n = Number.isInteger(v.sources) && v.sources! > 0 ? v.sources! : 1;
    const sp = g.spellings.get(name) ?? { n: 0, at: i };
    sp.n += n;
    g.spellings.set(name, sp);
    g.sources += n;
    g.preferred ||= v.preferred === true;
    groups.set(k, g);
  });
  if (!groups.size) return {};
  const own = scope.genus ? genusWord(scope.genus) : '';
  const genera = scope.genera;
  const setBack = (spelling: string, k: string): boolean => {
    if (/[,;]/.test(spelling)) return true;
    if (!genera) return false;
    const ws = foldWord(k).split(/[^a-z]+/).filter(Boolean);
    if (ws.some((w) => w !== own && genera.has(w))) return true;
    return /^\p{L}+ (?:× ?)?\p{Ll}[\p{Ll}-]*$/u.test(spelling) && (ws[0] === own || genera.has(ws[0]));
  };
  const named = [...groups.entries()].map(([k, g]) => {
    const spelling = [...g.spellings.entries()].sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at)[0][0];
    return { spelling, back: setBack(spelling, k), ...g };
  });
  named.sort((a, b) => Number(a.back) - Number(b.back) || Number(b.preferred) - Number(a.preferred) || b.sources - a.sources || a.at - b.at || a.spelling.length - b.spelling.length || byCode(a.spelling, b.spelling));
  const names = named.map((n) => firstUp(n.spelling));
  return names.length > 1 ? { common: names[0], commons: names.slice(1) } : { common: names[0] };
}
