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
  /** The thumbnail's credit, licence first, as a tile shows it after "Photo: " (`tileCreditOf`; round sixty-three). Absent in an index built before, or when the credit cannot be said short and true; the tile then names the source. */
  credit?: string;
  photos: number;
  open: number;
  climate: string;
  /** The six species whose habitat climate is nearest (src/lib/core/near.ts), written at index time. */
  near?: number[];
  /** Older names for the species, as binomials, written at index time (round thirty-one, 3). */
  syn?: string[];
  /** The day the species' dossier last changed in substance, as whole days since 1970-01-01 (src/lib/dossier/changed.ts; round sixty-three): the sitemap's lastmod. Absent in an index built before. */
  changed?: number;
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
/** Words a Title Case name leaves in lower case, which say nothing of a source's way with capitals. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'de', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
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
 * The names one vernacular value gives: a value with commas is a list of names (round sixty-three, N1; the lead's count
 * of the live corpus: 1,843 of 103,256 values held a comma, every one read a list of alternatives, "Sago palm, King
 * sago, Sago cycad, Japanese sago palm", and none an inverted form such as "Cactus, barrel"), split on each comma with
 * or without a space after it, each part trimmed with its spaces closed up, empty parts dropped, and a part given twice
 * in one value given once. A value with no comma is one name, as before.
 */
export function namesOf(value: string): string[] {
  return [...new Set(value.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean))];
}

/**
 * Whether a name is a bare genus word (round sixty-three, N2, the owner's decision): one word, in any case and with any
 * accents, that is the species' own genus ("Aloe" for Aloe vera), another genus of the corpus (`scope.genera`), or a
 * genus English uses as a noun (`ENGLISH_USE`: "Lotus" for Nelumbo nucifera). Such a word names a genus, so it is the
 * headline only when no source gives the species a longer name; it stays among the names.
 */
export function bareGenus(spelling: string, scope: NameScope = {}): boolean {
  const ts = tokensOf(spelling.trim());
  if (ts.length !== 1) return false;
  const w = foldWord(ts[0]).replace(/[^a-z]/g, '');
  return !!w && (ENGLISH_USE.has(w) || (!!scope.genus && w === genusWord(scope.genus)) || !!scope.genera?.has(w));
}

/**
 * A species' English common names as the index and the species page show them (round sixty-one, decision 7; round
 * sixty-two, decision 3). Before, the first name GBIF listed was shown as it was written, so Curio rowleyanus was
 * "String-Of-Beads Senecio" on its tile, its row and its page title, while "String-of-Pearls" sat in `commons`.
 *
 * The rule, with no name picked by hand:
 *   1. English names only (`lang` "eng"). A source's value with commas is a list of names, each its own name, given by
 *      that row's sources (`namesOf`; round sixty-three, N1). Spellings of one name (case, hyphens, spaces, apostrophes)
 *      are one name, and it is given by as many sources as give any of its spellings, each source counted once.
 *   2. Set back, after every name that is not: a semicolon list of several names; and, with `scope`, another genus of the
 *      corpus named alone ("Osteospermum" for a Dimorphotheca), or a name of two words or more whose last word is another genus of the corpus ("Flatleaf Senecio" and "String-of-Beads Senecio" for a
 *      Curio), unless that word is one English uses as a noun of its own (`ENGLISH_USE`: "Lace aloe", "Autumn crocus",
 *      "Zebra haworthia", "Peacock iris"); or that is another genus followed by the species' own epithet (an older name
 *      of it, "Senecio rowleyanus" for Curio rowleyanus). Words are compared in any case: the rule read a source's
 *      capitals, and the same name was set back or shown by how one source happened to write it (round sixty-two; the
 *      verification review's search 16; A34). A genus word that is not the last ("Arum lily") is not read.
 *   2a. A bare genus word that is not set back (the species' own genus, "Aloe" for Aloe vera, or a genus English uses as
 *      a noun, "Lotus" for Nelumbo nucifera) goes after every longer name and before the set-back ones: it is the
 *      headline only when no source gives a fuller name (`bareGenus`; round sixty-three, N2, the owner's decision).
 *   3. Then a name GBIF marks preferred.
 *   4. Then the name more sources give.
 *   5. Then GBIF's order (a list's names in their place in it). Of a name's spellings, the one more sources give is
 *      shown, then the one GBIF lists first.
 * Preferred flags and source counts exist only for names fetched since round sixty-two's `--names` step; for the rest,
 * every spelling row counts as one source. The first letter is shown as a capital; nothing else of a source's spelling
 * is changed, and every name stays in the answer, so every alternative stays searchable: `common` is the rule's choice,
 * `commons` every other English name in the rule's order, one spelling each.
 */
export function englishNames(vernacular: VernacularName[], scope: NameScope = {}): { common?: string; commons?: string[] } {
  const groups = new Map<string, { at: number; spellings: Map<string, { n: number; at: number }>; from: Set<string>; preferred: boolean }>();
  let seq = 0; // each name's place in GBIF's order, a list's names each in its own (round sixty-three, N1)
  vernacular.forEach((v, i) => {
    if (v.lang !== 'eng' || typeof v.name !== 'string') return;
    // The row's sources: the named ones by name, so one source giving three spellings is one (the corpus review, 8);
    // the rest (a row with no source, or a count from a dossier fetched before) each its own, the same for every name
    // the row lists, so a source counts once per name and never once per list (round sixty-three, N1).
    const named = [v.source, ...(Array.isArray(v.alsoFrom) ? v.alsoFrom : [])].filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => `s:${x.trim()}`);
    const total = Number.isInteger(v.sources) && v.sources! > 0 ? v.sources! : 1;
    const own = new Set(named);
    for (let j = own.size; j < total; j++) own.add(`#${i}:${j}`);
    for (const name of namesOf(v.name)) {
      const at = seq++;
      const k = nameKey(name);
      const g = groups.get(k) ?? { at, spellings: new Map(), from: new Set<string>(), preferred: false };
      const sp = g.spellings.get(name) ?? { n: 0, at };
      sp.n += own.size;
      g.spellings.set(name, sp);
      for (const x of own) g.from.add(x);
      g.preferred ||= v.preferred === true;
      groups.set(k, g);
    }
  });
  if (!groups.size) return {};
  const ownWords = scope.genus ? scope.genus.trim().replace(/^(?:×\s*|x\s+)/i, '').split(/\s+/) : [];
  const own = ownWords.length ? foldWord(ownWords[0]) : '';
  const epithet = ownWords[1] && /^\p{Ll}/u.test(ownWords[1]) ? ownWords[1] : '';
  const genera = scope.genera;
  const other = (w: string) => { const f = foldWord(w).replace(/[^a-z]/g, ''); return !!f && f !== own && !!genera?.has(f); };
  const setBack = (spelling: string): boolean => {
    if (/;/.test(spelling)) return true; // a comma list is split by `namesOf` and never reaches here (round sixty-three, N1)
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
    // Which spelling of a name to show. Spellings that differ only in capitals count together, and of them the one shown
    // keeps the capitals a source gave on purpose and no others (formOf, below): "China aster" over "China Aster",
    // "Butterfly milkweed" over "Butterfly Milkweed", "Herb Robert" where a source wrote "herb Robert". So a list in Title
    // Case cannot flip a headline's case by its count (round sixty-three, after the --index audits: splitting the lists
    // gave Title Case spellings more sources, and a first rule that set lower-case spellings aside flipped 539 the other
    // way). Spellings that differ otherwise are chosen by their sources, then GBIF's order, as before.
    const byCase = new Map<string, { forms: Array<[string, { n: number; at: number }]>; n: number; at: number }>();
    for (const [sp, c] of g.spellings) {
      const k = sp.toLowerCase();
      const e = byCase.get(k) ?? { forms: [], n: 0, at: c.at };
      e.forms.push([sp, c]);
      e.n += c.n;
      e.at = Math.min(e.at, c.at);
      byCase.set(k, e);
    }
    const formOf = (forms: Array<[string, { n: number; at: number }]>) => {
      // A capital a source gave on purpose: one in a spelling that leaves a word in lower case (a word between spaces,
      // so "Red-osier Dogwood" is Title Case, and not a small word such as "of" or "the"), as "herb Robert". Title Case
      // and all-lower-case spellings say nothing either way. Each spelling is scored by the capitals it puts where no
      // source meant one and those it leaves out where one did, word by word past the first (hyphens part words here);
      // the lowest wins, then the most sources, then GBIF's order.
      const words = (sp: string) => sp.split(/[\s-]+/).filter(Boolean);
      const upper = (w: string) => /^\p{Lu}/u.test(w);
      const meant = new Set<string>();
      for (const [sp] of forms) {
        if (sp.split(/\s+/).some((w) => !!w && !upper(w) && !SMALL_WORDS.has(w.toLowerCase()))) for (const w of words(sp).slice(1)) if (upper(w)) meant.add(w.toLowerCase());
      }
      const off = (sp: string) => words(sp).slice(1).reduce((n, w) => n + (upper(w) !== meant.has(w.toLowerCase()) ? 1 : 0), 0);
      return forms.sort((a, b) => off(a[0]) - off(b[0]) || b[1].n - a[1].n || a[1].at - b[1].at)[0][0];
    };
    // Between spellings that differ otherwise (a hyphen, a space), the one more sources give, as round sixty-one decided.
    const spelling = formOf([...byCase.values()].sort((a, b) => b.n - a.n || a.at - b.at)[0].forms);
    const back = setBack(spelling);
    // 0 a name; 1 a bare genus word (rule 2a); 2 set back.
    return { spelling, tier: back ? 2 : bareGenus(spelling, scope) ? 1 : 0, at: g.at, sources: g.from.size, preferred: g.preferred };
  });
  // GBIF's order last: each name's place is its first place in GBIF's list, which no two names share, so nothing after it could decide.
  named.sort((a, b) => a.tier - b.tier || Number(b.preferred) - Number(a.preferred) || b.sources - a.sources || a.at - b.at);
  const names = named.map((n) => firstUp(n.spelling));
  return names.length > 1 ? { common: names[0], commons: names.slice(1) } : { common: names[0] };
}
