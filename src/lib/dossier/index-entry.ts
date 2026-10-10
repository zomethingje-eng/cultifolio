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
  /** Every other older name of species rank, past the six of `syn`: searched, never shown (round sixty-seven; triage-66 N1). Absent in an index built before, and where there is none. */
  older?: string[];
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

import { canonicalSynonym } from '../core/names';

/**
 * A species' older names as the index carries them (round thirty-one, 3): as binomials (or a variety or subspecies), other-genus
 * ones first (the ones a label most often carries), six in `syn`, which the picker shows; and every other one of species rank
 * in `older`, searched and never shown: past the sixth, 13,352 label names such as "Ferocactus glaucescens" found nothing, and
 * "Neolloydia conoidea" answered another species (round sixty-seven; triage-66 N1, S-B1).
 */
export function olderNamesOf(accepted: string, synonyms: readonly string[] = []): { syn: string[]; older: string[] } {
  const genus = accepted.split(' ')[0];
  const all = [...new Set(synonyms.map(canonicalSynonym).filter((x): x is string => !!x && x !== accepted))].sort((a, b) => Number(a.startsWith(genus + ' ')) - Number(b.startsWith(genus + ' ')));
  return { syn: all.slice(0, 6), older: all.slice(6).filter((x) => x.split(' ').length === 2) };
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
/** Words a Title Case name leaves in lower case, which say nothing of a source's way with capitals. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'de', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
/**
 * One name whatever its case, hyphens, spacing, apostrophes, accents or a trailing full stop, and written open or closed:
 * "String-of-Pearls" and "String of pearls", "Pig's ear" and "Pigs ear", "Century plant" and "Centuryplant", "Northern
 * Rātā" and "Northern rata", "Spring starflower." and "Spring starflower" are one name given twice. Apostrophes, accents,
 * the full stop and closed compounds were kept apart before, and 302 species showed one name twice under their title,
 * while /about/how said apostrophes were pooled (round sixty-seven; triage-66 N5, S-B6, R45-9).
 */
export const nameKey = (s: string) => s.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’‘`ʼ]/g, '').replace(/\.+\s*$/, '').replace(/[-\s]+/g, '').trim();

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
  // A comma inside brackets does not part names: "Prickly pear (Indian fig, Barbary fig)" is one name, where it was
  // "Prickly pear (Indian fig" and "Barbary fig)" (round sixty-seven; triage-66 N7, R45-9).
  const parts: string[] = [];
  let depth = 0, at = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (c === ',' && depth === 0) { parts.push(value.slice(at, i)); at = i + 1; }
  }
  parts.push(value.slice(at));
  return [...new Set(parts.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean))];
}

/**
 * Single words that name a kind of plant, not a species: shown only when no source gives a fuller name, as a bare genus
 * word is. One dataset's "Cherry" for Malpighia emarginata and one row's "Cactus" for two Copiapoa species were headlines
 * (round sixty-seven; triage-66 N3, S-B3, S-B11). A fixed list, written here and on /about/how.
 */
export const GENERIC_NOUNS: ReadonlySet<string> = new Set(['bulb', 'buttercup', 'cactus', 'cherry', 'daisy', 'fern', 'flower', 'grass', 'herb', 'lily', 'orchid', 'palm', 'plant', 'poppy', 'primrose', 'shrub', 'succulent', 'tree', 'vine', 'weed']);
/** Whether a name is one generic noun (`GENERIC_NOUNS`), in any case, hyphens apart, a plural "s" allowed. */
export function genericNoun(spelling: string): boolean {
  const ts = tokensOf(spelling.trim());
  if (ts.length !== 1) return false;
  const w = foldWord(ts[0]).replace(/[^a-z]/g, '');
  return GENERIC_NOUNS.has(w) || (w.endsWith('s') && GENERIC_NOUNS.has(w.slice(0, -1)));
}

/**
 * What the audit flags in a name, never rewritten, since a source spelt it so (round sixty-seven; triage-66 N9, S-B11,
 * IND's "Lady of the night)"): a fragment (a word of one to three letters that a source gives only inside a list, or a word
 * cut by " -", "White -fld"), a
 * trailing full stop, a bracket opened and not closed or closed and not opened.
 */
export function nameFlags(spelling: string, alone = true): Array<'fragment' | 'trailing-dot' | 'bracket'> {
  const out: Array<'fragment' | 'trailing-dot' | 'bracket'> = [];
  const s = spelling.trim();
  const letters = s.replace(/[^\p{L}]/gu, '');
  // A short word is a fragment only as a part of a list ("Pigeo", "Country" from a list cut short): "Fig" and "Tea" given alone are names.
  if ((!alone && tokensOf(s).length === 1 && letters.length > 0 && letters.length < 4) || /\s-\p{L}/u.test(s)) out.push('fragment');
  if (/\.$/.test(s) && !/\b(?:St|Mt|Jr|Sr|Dr)\.$/.test(s)) out.push('trailing-dot');
  let depth = 0, bad = false;
  for (const c of s) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') { depth--; if (depth < 0) bad = true; }
  }
  if (bad || depth !== 0) out.push('bracket');
  return out;
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
 *      that row's sources (`namesOf`; round sixty-three, N1), a comma inside brackets not parting them. Spellings of
 *      one name (case, hyphens, spaces, apostrophes, accents, a trailing full stop, a compound written open or closed:
 *      `nameKey`) are one name, and it is given by as many sources as give any of its spellings, each source counted
 *      once (round sixty-seven; triage-66 N5).
 *   2. Set back, after every name that is not: a semicolon list of several names; the species' own scientific name
 *      written as an English one ("Podocarpus costalis"; round sixty-seven, N3); and, with `scope`, another genus of the
 *      corpus named alone ("Osteospermum" for a Dimorphotheca), or a name of two words or more whose last word is another genus of the corpus ("Flatleaf Senecio" and "String-of-Beads Senecio" for a
 *      Curio), unless that word is one English uses as a noun of its own (`ENGLISH_USE`: "Lace aloe", "Autumn crocus",
 *      "Zebra haworthia", "Peacock iris"); or that is another genus followed by the species' own epithet (an older name
 *      of it, "Senecio rowleyanus" for Curio rowleyanus). Words are compared in any case: the rule read a source's
 *      capitals, and the same name was set back or shown by how one source happened to write it (round sixty-two; the
 *      verification review's search 16; A34). A genus word that is not the last ("Arum lily") is not read.
 *   2a. A single word that names no species goes after every longer name and before the set-back ones, so it is the
 *      headline only when no source gives a fuller name: a bare genus word that is not set back (the species' own genus,
 *      "Aloe" for Aloe vera, or a genus English uses as a noun, "Lotus" for Nelumbo nucifera; `bareGenus`; round
 *      sixty-three, N2), a generic noun ("Cherry", "Cactus": `GENERIC_NOUNS`), and one word that a source gives only as a
 *      part of a list ("Coral" from "Aloe, Coral") (round sixty-seven; triage-66 N3, N7).
 *   3. Then the name more sources give, each source counted once (round sixty-seven; triage-66 N3: one dataset's
 *      preferred flag made Malpighia emarginata "Cherry" over "Barbados cherry", given by six).
 *   4. Then a name GBIF marks preferred, which only breaks a tie.
 *   5. Then GBIF's order (a list's names in their place in it).
 * Of a name's spellings, one without a trailing full stop is shown before one with it, then the one more sources give,
 * then the one GBIF lists first.
 * Its capitals are read word by word across every spelling of the name (`casedSpelling`). Preferred flags and source
 * counts exist only for names fetched since round sixty-two's `--names` step; for the rest, every spelling row counts as
 * one source. The first letter is shown as a capital, and every name stays in the answer, so every alternative stays
 * searchable: `common` is the rule's choice, `commons` every other English name in the rule's order, one spelling each.
 */
export function englishNames(vernacular: VernacularName[], scope: NameScope = {}): { common?: string; commons?: string[] } {
  type Spelling = { from: Set<string>; at: number };
  const groups = new Map<string, { at: number; spellings: Map<string, Spelling>; from: Set<string>; preferred: boolean; alone: boolean }>();
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
    const names = namesOf(v.name);
    for (const name of names) {
      const at = seq++;
      const k = nameKey(name);
      if (!k) continue;
      const g = groups.get(k) ?? { at, spellings: new Map(), from: new Set<string>(), preferred: false, alone: false };
      // A spelling's sources as a set too, so one source giving it in two rows counts once (round sixty-seven; R45-9).
      const sp = g.spellings.get(name) ?? { from: new Set<string>(), at };
      for (const x of own) { sp.from.add(x); g.from.add(x); }
      g.spellings.set(name, sp);
      g.preferred ||= v.preferred === true;
      g.alone ||= names.length === 1;
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
    // The species' own scientific name, written as an English one: no common name (round sixty-seven; triage-66 N3, S-B11).
    if (epithet && nameKey(spelling) === nameKey(`${ownWords[0]} ${epithet}`)) return true;
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
    const spelling = casedSpelling([...g.spellings].map(([s, c]) => ({ spelling: s, from: c.from, at: c.at })));
    const back = setBack(spelling);
    // A single word that names no species: a bare genus word, a generic noun, or a word only ever given inside a list.
    const single = bareGenus(spelling, scope) || genericNoun(spelling) || (!g.alone && tokensOf(spelling).length === 1);
    // 0 a name; 1 a single word that names no species (rule 2a); 2 set back.
    return { spelling, tier: back ? 2 : single ? 1 : 0, at: g.at, sources: g.from.size, preferred: g.preferred };
  });
  // GBIF's order last: each name's place is its first place in GBIF's list, which no two names share, so nothing after it could decide.
  named.sort((a, b) => a.tier - b.tier || b.sources - a.sources || Number(b.preferred) - Number(a.preferred) || a.at - b.at);
  const names = named.map((n) => firstUp(n.spelling));
  return names.length > 1 ? { common: names[0], commons: names.slice(1) } : { common: names[0] };
}

/** A word as the capitals rule compares it: folded, apostrophes off. */
const caseKey = (w: string) => foldWord(w).replace(/['’‘`ʼ]/g, '');
const upperWord = (w: string) => /^[^\p{L}]*\p{Lu}/u.test(w);
/**
 * Which spelling of one name to show, and with which capitals (round sixty-seven; triage-66 N6, S-B7, R45-9). The form
 * (its letters, hyphens and spaces): one without a trailing full stop before one with it, then the one more sources
 * give, then GBIF's order. Then its capitals, word by word past the first, read
 * across every spelling of the name, whatever its hyphens: a capital a source gave on purpose (one in a spelling that
 * leaves another word in lower case, a word such as "of" or "the" apart, as "star-of-Bethlehem" or "herb Robert") is
 * kept or given; a capital no source meant is taken off where some source writes the word in lower case ("Mexican
 * Orange" beside "Mexican-orange" is "Mexican orange"); anything else stays as the chosen spelling has it. Title Case and
 * all-lower-case spellings say nothing of a word's capital. Before, only spellings with the same hyphens were compared,
 * so "Star of bethlehem" lost the capital "star-of-Bethlehem" gave it, and 71 headlines stayed in Title Case where a
 * lower-case spelling existed.
 */
export function casedSpelling(spellings: Array<{ spelling: string; from: ReadonlySet<string>; at: number }>): string {
  // The form: written open or closed, then its hyphens, each chosen by its sources (each counted once across the form's
  // spellings), a form without a trailing full stop first, then GBIF's order.
  type S = { spelling: string; from: ReadonlySet<string>; at: number };
  const pick = (key: (s: string) => string, of: S[]) => {
    const forms = new Map<string, { spellings: S[]; from: Set<string>; at: number }>();
    for (const s of of) {
      const k = key(s.spelling);
      const f = forms.get(k) ?? { spellings: [], from: new Set<string>(), at: s.at };
      f.spellings.push(s);
      for (const x of s.from) f.from.add(x);
      f.at = Math.min(f.at, s.at);
      forms.set(k, f);
    }
    const dotted = (f: { spellings: S[] }) => Number(f.spellings.every((s) => /\.\s*$/.test(s.spelling)));
    // A compound written open before closed, whatever the count: "Zebra plant", not "Zebraplant", where both are given
    // (round sixty-seven, at the merge). The closed forms are one checklist's house style, copied by the lists that take
    // from it, so their count outran the open form's and 40 headlines read as one word; a name given only closed stays so.
    const words = (f: { spellings: S[] }) => f.spellings[0].spelling.trim().split(/[-\s]+/).length;
    return [...forms.values()].sort((a, b) => dotted(a) - dotted(b) || words(b) - words(a) || b.from.size - a.from.size || a.at - b.at)[0].spellings;
  };
  const open = pick((s) => s.toLowerCase().replace(/[-\s]+/g, ' ').trim(), spellings);
  const hyphens = pick((s) => s.toLowerCase(), open);
  const meant = new Set<string>();
  const lower = new Set<string>();
  for (const { spelling } of spellings) {
    const ws = tokensOf(spelling);
    // A word between spaces, so "Red-osier Dogwood" is Title Case and says nothing of "Dogwood".
    const leaves = spelling.split(/\s+/).some((w) => !upperWord(w) && /\p{L}/u.test(w) && !SMALL_WORDS.has(caseKey(w)));
    ws.forEach((w, i) => {
      if (i > 0 && upperWord(w) && leaves) meant.add(caseKey(w));
      if (i > 0 && !upperWord(w)) lower.add(caseKey(w));
    });
  }
  // Of the form's case variants, the one with the fewest capitals no source meant (and none inside a word, "Hawai'I"),
  // then the most sources, then GBIF's order.
  const faults = (s: string) => tokensOf(s).reduce((n, w, i) => n + (i > 0 && upperWord(w) !== meant.has(caseKey(w)) ? 1 : 0) + (/\p{L}[^\s-]*\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, '')) ? 1 : 0), 0);
  const chosen = [...hyphens].sort((a, b) => faults(a.spelling) - faults(b.spelling) || b.from.size - a.from.size || a.at - b.at)[0].spelling;
  let i = 0;
  return chosen.replace(/[^\s-]+/g, (w) => {
    if (i++ === 0) return w;
    const k = caseKey(w);
    if (meant.has(k) && !upperWord(w)) return w.replace(/\p{Ll}/u, (c) => c.toLocaleUpperCase('en'));
    if (!meant.has(k) && lower.has(k) && /^[^\p{L}]*\p{Lu}(?:[\p{Ll}\p{M}'’]|$)/u.test(w)) return w.replace(/\p{Lu}/u, (c) => c.toLocaleLowerCase('en'));
    return w;
  });
}
