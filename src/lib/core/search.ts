/**
 * Species search over the index. A query is words; each word must begin some
 * word of the entry (its name, common names, family, origins), in any order,
 * so "cop cin", "cinerea copiapoa" and "silver cactus" all find Copiapoa
 * cinerea. When nothing matches at all, each query word of four letters or
 * more is allowed one typing error (a swapped, missing, extra or wrong
 * letter) against the start of a word of a name (never of a family or a
 * place: round sixty-three, N3), so "Conophitum" still finds
 * Conophytum; the relaxed pass is only ever a fallback, so a correct spelling
 * never sees near misses beside its hits. Ranking (`group`, `closeness`):
 * a name typed as a name, the genus first; an older name typed as one; one
 * common name holding every word; then the other matches; within each, the
 * nearest, an exact name, whole words and the headline before the alphabet.
 */
export interface Searchable {
  name: string;
  common?: string;
  /** Every other English common name (round sixty): searched as `common` is. */
  commons?: string[];
  family?: string;
  origin?: string[];
  /** Older names for the same species, as binomials: a label's "Haworthia attenuata" finds Haworthiopsis attenuata (round thirty-one, 3). */
  syn?: string[];
  /** Every other older name of species rank, past the six of `syn`, searched as they are (round sixty-seven; triage-66 N1). */
  older?: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Damerau–Levenshtein distance capped at 2, on a prefix of `w` the length of `q` (plus or minus one). */
function nearPrefix(q: string, w: string): boolean {
  if (w.startsWith(q)) return true;
  if (q.length < 4) return false;
  for (const len of [q.length - 1, q.length, q.length + 1]) {
    if (len < 1 || len > w.length) continue;
    if (edit1(q, w.slice(0, len))) return true;
  }
  return false;
}
/** True when a and b are within one edit (insert, delete, replace, or adjacent swap). */
function edit1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // one replacement, or one adjacent swap
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  // one insertion or deletion
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

export interface Prepared<T> {
  item: T;
  nameWords: string[];
  /**
   * The family's and the places' words: matched only as typed, in either pass, never by a similar spelling (round
   * sixty-three, N3: "aloe" was one letter from the start of "Algeria", and "Aloe Verra" answered Drimia noctiflora).
   */
  placeWords: string[];
  /** The family's own words, matched only whole: "plant" is no start of Plantaginaceae (round sixty-eight). */
  familyWords: string[];
  /** The common names' words alone. */
  commonWords: string[];
  /**
   * Each common name's words, kept apart, the headline's first when there is one: a query's words that fall to the common
   * names must all sit in one of them (round sixty-seven; triage-66 N2: "snake plant" answered Yarrow first, by its
   * "Snake's grass" and its "Nosebleed plant").
   */
  commonNames: string[][];
  /** Whether `commonNames[0]` is the headline (`common`). */
  headed: boolean;
  /** Every word of the entry (name, common names, places, older names), for the order's whole-word test. */
  wordSet: ReadonlySet<string>;
  /** Each older name's words (`syn`, then `older`), kept apart: the words of a query that fall to the synonyms must all sit in one of them. */
  synWords: string[][];
  sortKey: string;
}

/**
 * Words a grower writes between the parts of a name that are not themselves words of it: the rank markers in every
 * spelling growers use (var., v., subsp., ssp., subspecies, variety, f., fo., forma, cv.), and the hybrid sign written
 * "x" (the "×" is not a letter, so the tokeniser drops it already). "Aloe x nobilis" found nothing while "Aloe × nobilis"
 * found the species (round sixty; the corpus review, 3). Like the older ones, a marker is a word while it is the last
 * thing typed ("aloe v" is Aloe variegata on its way). The label qualifiers "cf." and "aff." are skipped as "x" is:
 * "Copiapoa cf. cinerea" found nothing, since "cf" begins no word of any name (round sixty-two; the corpus review, 6).
 */
export const RANK_MARKERS: ReadonlySet<string> = new Set(['var', 'v', 'variety', 'subsp', 'ssp', 'subspecies', 'f', 'fo', 'forma', 'cv', 'x', 'cf', 'aff', 'nr', 'cfr']);
/**
 * The label qualifiers, skipped as "x" is: "cf.", "aff.", and the spellings the name reader knows (`names.ts`), "nr." and
 * "cfr." (round sixty-two; the verification review's search 7: "Copiapoa nr. cinerea" found nothing while "Copiapoa cf.
 * cinerea" found the species). "near" and "vel" ("vel aff.") are English words too, so they are skipped only where they
 * are a qualifier (`looseQualifier`).
 */
const QUALIFIERS: ReadonlySet<string> = new Set(['cf', 'aff', 'nr', 'cfr']);
/** The markers skipped between the words of a name, never ending its species part: the hybrid sign and the qualifiers. */
const SKIPPED: ReadonlySet<string> = new Set(['x', ...QUALIFIERS]);
/** The markers that end a name's species part (all but the skipped ones): what follows one is a variety, a form or a cultivar. */
const RANKS: ReadonlySet<string> = new Set([...RANK_MARKERS].filter((m) => !SKIPPED.has(m)));
/**
 * "sp.", "spp." and "nov." end a name as a rank does, and are no word of it (round sixty-two; the corpus review, 6): "Aloe
 * sp." answered Aloe speciosa, Aloe spicata and Aloe × spinosissima, unlabelled. Dropped once a word precedes them,
 * unless one is the last thing typed with no full stop ("aloe sp" is a speciosa on its way).
 */
const OPEN: ReadonlySet<string> = new Set(['sp', 'spp', 'nov']);

/**
 * A quoted text, single or double, straight or curly ("Echeveria 'Perle von Nurnberg'", "Echeveria elegans ‘Rainbow’",
 * or still being typed with no closing quote): a cultivar, not words of any species' name, so dropped by the retry
 * (round sixty). Not by the first search: a phone writes "Copiapoa ’cinerea’" with curly quotes for no cultivar at all,
 * and found the species that way before. An apostrophe inside a word ("law's") is not a quote: an opening quote follows
 * a space or starts the text.
 */
const QUOTED = /(^|\s)['"‘’“”][^'"‘’“”]*(?:['"‘’“”](?=[\s.,;:)]|$)|$)/gu;
/**
 * A quoted text that begins with a capital is a cultivar in the first search too ("Echeveria 'Lola'"): searched as words,
 * its spelling picked a species ("lola" is one edit from "lila", the start of lilacina) and the retry never fired. A
 * phone's quotes around an epithet are lower case ("Copiapoa ’cinerea’"), so that still finds the species (round
 * sixty-one; the corpus review, 3).
 */
const CULTIVAR = /(^|\s)['"‘’“”]\p{Lu}[^'"‘’“”]*(?:['"‘’“”](?=[\s.,;:)]|$)|$)/gu;
/** The first token of a pasted author citation that may follow any complete name: a bracket, "&", "ex", "et" ("et al."). */
const CITES = /^(?:[(&]|ex$|et$|al\.?$)/u;
/** A capitalised abbreviation ("Phil.", "N.E.Br.", "L.", "St."). */
const ABBREVIATION = /^\p{Lu}[\p{L}\p{M}'’-]*\.[\p{L}\p{M}.'’-]*$/u;
/** A word ending in "." ("l.", "mill.", "hort. ex lem." typed on a phone; but also "st." and a sentence's full stop). */
const DOTTED = /^[\p{L}\p{M}.'’-]+\.$/u;
const bare = (t: string) => fold(t).replace(/[^a-z0-9]+/g, '');
/** A token with a letter or digit that is no marker: a word of a name. */
const nameWord = (t: string) => { const b = bare(t); return !!b && !RANK_MARKERS.has(b) && !OPEN.has(b); };
/**
 * "near" after a word of the name and before another ("Copiapoa near cinerea"), and "vel" before "aff." or "cf." ("vel
 * aff."): qualifiers the name reader knows, skipped by the search and never counted as words left out (round sixty-two;
 * the verification review's search 7). Anywhere else they are words.
 */
function looseQualifier(tokens: string[], i: number): boolean {
  const b = bare(tokens[i]);
  if (b === 'vel') return i < tokens.length - 1 && QUALIFIERS.has(bare(tokens[i + 1]));
  return b === 'near' && i < tokens.length - 1 && tokens.slice(0, i).some(nameWord);
}
/** A token with letters of which the search reads none ("вера", "サボテン"): the tokeniser keeps only a to z and digits. */
const unread = (t: string) => /\p{L}/u.test(t) && !words(t).length;

/**
 * A quoted text is a cultivar only after a name word (round sixty-two; the corpus review, 1): `"Aloe vera"`, typed the
 * way a search engine is asked, was dropped whole, and the page said nothing in the reference matches it. Quotes around
 * the whole query are punctuation, and the text inside is searched.
 */
const dropQuoted = (q: string, re: RegExp) => q.replace(re, (m: string, lead: string, at: number) => (q.slice(0, at + lead.length).split(/\s+/).some(nameWord) ? `${lead} ` : m));

/**
 * A query as a grower pastes it, with what is not a word of any name taken out (round sixty; the corpus review, 3; the
 * self-review, 15): an author citation after the epithet ("Copiapoa cinerea (Phil.) Britton & Rose", "Lithops lesliei
 * N.E.Br."), up to the next rank marker, whose epithet may carry its own; a quoted cultivar that begins with a capital,
 * after a name word; "sp.", "spp." and "nov."; and, with `quotes` (the retry), any quoted text after a name word. Tokens,
 * as written.
 */
export function cleanQuery(q: string, quotes = false): string[] {
  const tokens = dropQuoted(q, quotes ? QUOTED : CULTIVAR).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  // `lower`: the word that completed the name was written in lower case, as an epithet is, so a capitalised word after
  // it is an author ("Copiapoa cinerea Britton & Rose"), where after "Cape Provinces" or "Aloe Vera" it is not. Only an
  // epithet of four letters or more: "of", "the" and "and" are not epithets, and "String of Pearls" lost "Pearls" as an
  // author (round sixty-one; the corpus review, 1). Its first letter is read past a leading "×" ("Aloe ×nobilis Baker").
  // `ranked`: a rank marker was read in this name, so the word that completed it is an epithet whatever its length.
  let names = 0, need = 2, author = false, lower = false, ranked = false, word = false, cultivar = false;
  tokens.forEach((t, i) => {
    const b = bare(t);
    if (cultivar) return;
    // What follows "cv." is a cultivar, never words of a species: "Echeveria cv. Lola" was read as "Echeveria lola" and
    // answered Echeveria lilacina by a similar spelling (round sixty-two; the verification review's search 8, A7). Left
    // out as a quoted cultivar is, and said; a trailing "cv" is still a word being typed.
    if (b === 'cv' && word && i < tokens.length - 1) { cultivar = true; return; }
    if (RANKS.has(b)) { author = false; names = 0; need = 1; ranked = true; out.push(t); return; }
    if (OPEN.has(b) && word && (t.endsWith('.') || i < tokens.length - 1)) { author = false; names = 0; need = 1; ranked = true; return; }
    if (author) return;
    if (QUALIFIERS.has(b)) { out.push(t); return; } // skipped as "x" is, and no part of the name's count (round sixty-two; the corpus review, 6)
    if (looseQualifier(tokens, i)) return;
    // A dotted word, or a capitalised abbreviation of four characters or fewer ("St.", "Mt.", "L."), starts a citation
    // only after an epithet or a rank: "Lily of St. James" was searched as "lily of", and "String of pearls." (a
    // phone's double space) as "string of" (round sixty-two; the corpus review, 5; A7). A longer abbreviation ("Phil.",
    // "N.E.Br.") is an author after any complete name, as before.
    const epithet = lower || ranked;
    if (names >= need && (CITES.test(t) || (ABBREVIATION.test(t) && ([...t].length > 4 || epithet)) || (DOTTED.test(t) && epithet) || (lower && /^\p{Lu}/u.test(t)))) { author = true; return; }
    out.push(t);
    // After a hybrid sign ("x", "×") the name starts again: the token after it is the other parent's genus, or its
    // abbreviation ("G."), never an author, and "Aloe vera x G. batesiana" was answered as plain Aloe vera, with no
    // "Showing results for" (round sixty-one; the corpus review, 2; round sixty-two: corpus 4, A7).
    if (!b || b === 'x') { names = 0; need = 1; lower = false; ranked = false; return; }
    names++;
    word = true;
    lower = b.length >= 4 && /^\p{Ll}/u.test(t.replace(/^[^\p{L}]+/u, ''));
  });
  return out;
}

/**
 * A hybrid formula: a hybrid sign with a name word before it and, after it, another parent: a capitalised word or an
 * abbreviation ("Gasteria x Aloe", "Aloe vera x G. batesiana"), or two words ("aloe vera x gasteria batesiana"). It names
 * no one species: "Gasteria x Aloe" matched a Gasteria through its older name Aloe disticha, unlabelled (round sixty-two;
 * the corpus review, 4). The search answers it with the retry on the first parent, labelled. A sign followed by one
 * word in lower case is a named nothospecies ("Aloe x nobilis") and is searched.
 */
function isFormula(tokens: string[]): boolean {
  for (let i = 1; i < tokens.length - 1; i++) {
    const b = bare(tokens[i]);
    if (b && b !== 'x') continue;
    if (!tokens.slice(0, i).some(nameWord)) continue;
    const after = tokens.slice(i + 1).filter(nameWord);
    if (!after.length) continue;
    if (/^\p{Lu}/u.test(after[0].replace(/^[^\p{L}]+/u, '')) || after.length >= 2) return true;
  }
  return false;
}

/** The query's tokens as typed, but a qualifier written "near" or "vel" (`looseQualifier`). */
const typedTokens = (q: string) => { const ts = q.split(/\s+/).filter(Boolean); return ts.filter((_, i) => !looseQualifier(ts, i)); };
/** The query's words as typed, every one (a marker apart): what a reading may have dropped. */
const typedWords = (q: string) => typedTokens(q).flatMap(words).filter((w) => !RANK_MARKERS.has(w));

/** The query's words as the search reads them: cleaned (`cleanQuery`), folded, split on anything but a letter or digit. Shared by the search and its postings, so the two read one query. */
export const queryTokens = (q: string): string[] => {
  const tokens = cleanQuery(q);
  if (isFormula(tokens)) return [];
  const ws = tokens.flatMap(words);
  // A reading that dropped words and left a single letter is no name ("E. 'Perle von Nürnberg'" answered every genus
  // beginning with E, where "E. cv. Perle von Nürnberg" answered nothing): the retry's rule (round sixty-two; corpus 10d).
  if (ws.filter((w) => !RANK_MARKERS.has(w)).join('').length < 2 && droppedWords(q, ws)) return [];
  return ws;
};
// A word in a script the search cannot read is a word left out too, and said (round sixty-two; the verification review's
// search 9: "Aloe вера" answered every Aloe with no "Showing results for").
const droppedWords = (q: string, used: string[]) => { const u = new Set(used); return typedWords(q).some((w) => !u.has(w)) || typedTokens(q).some(unread); };
/** A token shaped like a citation: an abbreviation ("L.", "Haw."), a word ending in a full stop, or a single letter. */
const citationShaped = (t: string) => ABBREVIATION.test(t) || DOTTED.test(t) || bare(t).length === 1;

/**
 * The whole query, when the botanical reading drops some of its words: its words but the markers and "sp.", tried first
 * against the common names alone (round sixty-two; B2). "Black eyed Susan" was read as "Black eyed" with an author, and
 * answered a Black-eyed pea beside the black-eyed Susans, while "black eyed susan" did not. Null when nothing is dropped.
 */
export function wholeReading(q: string): string[] | null {
  const used = new Set(queryTokens(q));
  // Not a citation-shaped token the botanical reading left out: "Aloe vera L." was matched whole by an English name with
  // a word beginning with "l" ("Lily of the desert"), and lost its "Showing results for" (round sixty-two; the
  // verification review's search 18). "sp.", "spp." and "nov." only where the botanical reading kept them as words, so
  // the whole reading's words always include the botanical one's and the postings' candidates hold every hit ("sp.
  // Black eyed Susan" answered nothing through the postings and the Rudbeckia from the whole index; search 15).
  const kept = typedTokens(q).filter((t) => !(citationShaped(t) && words(t).some((w) => !used.has(w))));
  const all = [...new Set(kept.flatMap(words).filter((w) => !RANK_MARKERS.has(w) && (!OPEN.has(w) || used.has(w))))];
  return all.length && all.some((w) => !used.has(w)) ? all : null;
}
/** Whether one common name holds every word, each beginning a word of it (round sixty-seven; triage-66 N2: never words of two names). */
const inCommon = (p: Prepared<unknown>, ws: string[], match: (q: string, w: string) => boolean = (x, w) => w.startsWith(x)) => p.commonNames.some((cn) => ws.every((x) => cn.some((w) => match(x, w))));

/**
 * The shape of a genus followed by capitalised words: an unquoted cultivar ("Haworthia Big Band", "Crassula Gollum",
 * "Echeveria Lola"), but also a capitalised epithet ("Aloe Vera", "Aloe Verra") and a common name in title case ("St
 * Johns Wort"). The shape alone decides nothing (round sixty-two; the verification review's search 1 and 2: read as a
 * cultivar, it switched off typo tolerance and answered "St Johns Wort" as "St"). It only makes the similar-spelling pass
 * stricter for the capitalised words (`capitalWords`), and, when nothing answers at all, lets the search route try the
 * first word as a genus (`genusReading`). The first word is written in full, with a capital and no full stop.
 */
export function cultivarShape(q: string): boolean {
  const ts = cleanQuery(q).filter((t) => bare(t));
  return ts.length >= 2 && /^\p{Lu}\p{Ll}+$/u.test(ts[0]) && nameWord(ts[1]) && /^\p{Lu}/u.test(ts[1]) && !RANK_MARKERS.has(bare(ts[1]));
}
/**
 * The words of the capitalised tokens after the first, for a query of `cultivarShape`: in the similar-spelling pass each
 * is matched as a whole word, within one edit, never against the start of a longer one. "Aloe Verra" is Aloe vera and
 * "Crassula Ovatta" Crassula ovata (one edit from the whole epithet), while "Echeveria Lola" is no Echeveria lilacina:
 * "lola" is one edit from "lila", the start of lilacina, not from any whole word (round sixty-two; the verification
 * review's search 1; A7).
 */
function capitalWords(q: string): Set<string> | null {
  if (!cultivarShape(q)) return null;
  const ts = cleanQuery(q).filter((t) => bare(t));
  return new Set(ts.slice(1).filter((t) => /^\p{Lu}/u.test(t.replace(/^[^\p{L}]+/u, ''))).flatMap(words));
}
/**
 * The genus a query of `cultivarShape` is answered by when nothing else answers it, neither the query nor its retry: its
 * first word, which the search route keeps only when it is a genus of the reference, by the answer's own names (round
 * sixty-two; the verification review's search 1 and 2; A7). Null for any other shape.
 */
export function genusReading(q: string): string | null {
  if (!cultivarShape(q)) return null;
  return cleanQuery(q).filter((t) => bare(t))[0] ?? null;
}
/** Whether `genus` (a genus of the reference) is the first word of a `genusReading`: the same word, or one typing error away when it has four letters or more ("Echeverai Lola"). */
export function genusOfReading(typed: string, genus: string): boolean {
  const a = bare(typed), b = bare(genus);
  return a === b || (a.length >= 4 && edit1(a, b));
}

/**
 * The words a query was answered by, when the reading that answered it dropped some of what was typed (an author, a
 * quoted cultivar, "sp."), so the page can say "Showing results for …" (round sixty-two; B2: "whenever words were
 * dropped, the answer carries X-Search-Relaxed naming the words used"). Null when nothing was dropped, or when the
 * whole query answered as a common name. `hits` are the answer's; a whole-reading answer is recognised by its first
 * hit, since every hit of that reading has every typed word in its common names and no hit of the botanical one does.
 */
export function droppedLabel(q: string, hits: Searchable[]): string | null {
  const used = queryTokens(q);
  if (!hits.length || !droppedWords(q, used)) return null;
  const whole = wholeReading(q);
  if (whole && inCommon(prepare([hits[0]])[0], whole)) return null;
  const text = labelTokens(q).map((t) => (t === '×' ? t : t.replace(/^[^\p{L}\p{N}×]+|[^\p{L}\p{N}.]+$/gu, ''))).filter(Boolean).join(' ');
  return text || null;
}
/** The tokens a reading searched, as written: the cleaned query without a word the search cannot read. */
const labelTokens = (q: string) => cleanQuery(q).filter((t) => !unread(t));
/**
 * What a reading left out of the query, as typed: the author, the cultivar, "sp.", a word it cannot read. The front page
 * says "Searched for “Copiapoa cinerea”, leaving out “Phil.”" rather than "Nothing matched “Copiapoa cinerea Phil.” as
 * written", which was untrue: the name matched (round sixty-two; the verification review's search 3). For a label from
 * `droppedLabel` only; a retry (`relaxedQuery`) is a query that matched nothing as written.
 */
export function leftOut(q: string): string | null {
  const kept = labelTokens(q);
  const left: string[] = [];
  let k = 0;
  for (const t of q.split(/\s+/).filter(Boolean)) {
    if (k < kept.length && kept[k] === t) k++;
    else left.push(t);
  }
  return left.join(' ').trim() || null;
}

/** Whether an answer's hits came by a similar spelling: the exact pass found none of them (the near pass runs only then). */
export function nearAnswer(q: string, hits: Searchable[]): boolean {
  return hits.length > 0 && !hasExact(prepare(hits), q);
}

/** Small words that never end a name's first two words. */
const RETRY_SMALL: ReadonlySet<string> = new Set(['a', 'an', 'and', 'at', 'by', 'de', 'del', 'des', 'du', 'for', 'in', 'la', 'le', 'of', 'on', 'or', 'the', 'to', 'with']);
/**
 * The query retried when nothing matches it: its first two words before any rank marker, "sp." or quoted cultivar
 * ("Copiapoa cinerea var. columna-alba" is "Copiapoa cinerea", "Echeveria cv. Perle" and "Echeveria 'Perle von Nurnberg'"
 * are "Echeveria"), as written; the genus alone for a genus followed by capitalised words (`cultivarShape`); the first
 * parent of a hybrid formula. Null when that is the query itself (round sixty; the corpus review, 3: the page then says
 * "Showing results for …").
 */
export function relaxedQuery(q: string): string | null {
  const kept: string[] = [];
  const tokens = cleanQuery(q, true);
  const trim = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  // One token is one word: "victoriae-reginae" was counted as two, and the page said "Showing results for “Agave
  // victoriae”", a species that does not exist (round sixty-one; the corpus review, 6). A genus followed by capitalised
  // words is retried on its first two words like any query, so "Mammillaria Spinosissima Un Pico" is the species; the
  // genus alone is the search route's last reading (`genusReading`; round sixty-two, the verification review's search 1).
  tokens.some((t, i) => {
    const b = bare(t);
    if (RANKS.has(b) || OPEN.has(b)) return true;
    // A hybrid sign with a name word on both sides ends the retry, which is then the first parent: skipping it retried
    // "Gasteria x Aloe" as "Gasteria Aloe", a name nobody wrote (round sixty-two; the corpus review, 4).
    if (!b || SKIPPED.has(b)) return !QUALIFIERS.has(b) && kept.length > 0 && tokens.slice(i + 1).some(nameWord);
    kept.push(trim(t));
    return kept.length >= 2;
  });
  if (!kept.length) return null;
  // Not a common name cut after a small word: "Lily of St. James" was retried as "Lily of" and answered every lily, and
  // "Rose of Jericho" as "Rose of" (round sixty-seven; triage-66 N8, S-B10).
  if (kept.length === 2 && RETRY_SMALL.has(bare(kept[1]))) return null;
  const relaxed = kept.join(' ');
  // Not a single letter ("E. cv. Perle" retried as "E" and answered every genus beginning with it): a genus abbreviation
  // is a name only with its epithet (round sixty-one; the corpus review, 8).
  if (bare(relaxed).length < 2) return null;
  const a = rankedWords(q), b = rankedWords(relaxed);
  return a.length === b.length && a.every((w, i) => w === b[i]) ? null : relaxed;
}

export function prepare<T extends Searchable>(items: T[]): Prepared<T>[] {
  return items.map((item) => {
    const commonNames = [...(item.common ? [words(item.common)] : []), ...(item.commons ?? []).map(words)].filter((ws) => ws.length);
    const nameWords = words(item.name);
    const familyWords = words(item.family ?? '');
    const placeWords = (item.origin ?? []).flatMap(words);
    const commonWords = commonNames.flat();
    const synWords = [...(item.syn ?? []), ...(item.older ?? [])].map((x) => words(x).filter((w) => !RANK_MARKERS.has(w)));
    return {
      item,
      nameWords,
      placeWords,
      familyWords,
      commonWords,
      commonNames,
      headed: !!item.common && commonNames.length > 0 && commonNames[0].length > 0,
      synWords,
      wordSet: new Set([...nameWords, ...commonWords, ...familyWords, ...placeWords, ...synWords.flat()]),
      sortKey: fold(item.name)
    };
  });
}

/**
 * Rank: 0 every query word starts a name word, the first one the genus; 1 name words only; 2 mixed; 3 other fields
 * only. A query word not in the name or the other fields may come from an older name, but every such word must come
 * from the same older name: "aloe margaritifera" found Tulista pumila through two of its synonyms, Aloe x and
 * Haworthia margaritifera, which is a name nobody wrote (round thirty-three, 13). So too the words that fall to the
 * common names come from one common name, never two (round sixty-seven; triage-66 N2: "natal plum" was answered by a
 * place's "Natal" and Plumbago, "snake plant" by two of Yarrow's names). A family or a place is matched as typed whatever
 * `match` forgives: a similar spelling is a typing error in a name, and read against names only (round sixty-three, N3:
 * "Aloe Verra" answered Drimia noctiflora, "aloe" one letter from its range's "Algeria" and "verra" one from its older
 * name's "Vera-duthiea").
 */
function rank(p: Prepared<unknown>, qs: string[], match: (q: string, w: string) => boolean): number | null {
  let inName = 0, genus = false;
  let left: string[] | null = null; // the words neither the name nor a place takes
  for (const q of qs) {
    let n = false;
    for (const w of p.nameWords) if (match(q, w)) { n = true; break; }
    if (n) {
      inName++;
      if (match(q, p.nameWords[0])) genus = true;
      continue;
    }
    let place = false;
    // A family is matched whole, a place from its start: "snake plant" put Chelone glabra second, "snake" from its
    // "Snakehead" and "plant" from the start of Plantaginaceae (round sixty-eight; the owner's check of round sixty-seven).
    if (p.familyWords.includes(q)) place = true;
    else for (const w of p.placeWords) if (w.startsWith(q)) { place = true; break; }
    if (place) continue;
    // No word of the entry can take q: stop here (round fifty-eight).
    if (!someWord(p.commonWords, q, match) && !p.synWords.some((g) => someWord(g, q, match))) return null;
    (left ??= []).push(q);
  }
  const found = inName === qs.length ? (genus ? 0 : 1) : inName ? 2 : 3;
  if (!left) return found;
  // The words the common names take, all from one of them; what is left, from one older name.
  if (oneOlder(p, left, match)) return found;
  for (const cn of p.commonNames) {
    const rest = left.filter((q) => !someWord(cn, q, match));
    if (!rest.length || oneOlder(p, rest, match)) return found;
  }
  return null;
}
function someWord(ws: string[], q: string, match: (q: string, w: string) => boolean): boolean {
  for (const w of ws) if (match(q, w)) return true;
  return false;
}
function oneOlder(p: Prepared<unknown>, qs: string[], match: (q: string, w: string) => boolean): boolean {
  for (const g of p.synWords) if (qs.every((q) => someWord(g, q, match))) return true;
  return false;
}

/**
 * The order of a reading's hits (round sixty-seven; triage-66 N2, N8). First the name typed as a name (rank 0: every
 * word in the name, the genus first); then an older name typed as one (every word in one older name, its genus first:
 * "Opuntia longispina" is Airampoa corrugata before the species with a variety of that name); then the common names,
 * each read whole (one name holds every word: "cape aloe" is Aloe ferox, "Cape aloe", before an aloe of the Cape
 * Provinces); then the other ranks. Within a group: a near hit by its distance from what was typed, the nearest first
 * ("Ceropegia pica" is C. picta before C. dicapuae); then a name that is exactly the query, the headline first ("onion"
 * is Allium cepa, "Onion", before Albuca's "Sea-onion"; "fig" is Ficus carica, "Fig"); then a hit whose every word is
 * a whole word typed; then one whose headline holds every word; then the alphabet.
 */
const Group = { Name: 0, Older: 1, Common: 2, NameWords: 3, Mixed: 4, Other: 5 } as const;
function group(p: Prepared<unknown>, qs: string[], r: number, match: (q: string, w: string) => boolean): number {
  if (r === 0) return Group.Name;
  // A binomial at least, every word but the last written in full: "coco plum" is no older name "Cocos plumosa" typed,
  // and Chrysobalanus icaco, "Coco plum", comes first; one word is no older name typed either ("cactus" is not every
  // species once a Linnaean Cactus, nor "mango" Garcinia mangostana, once Mangostana garcinia).
  if (qs.length >= 2) for (const g of p.synWords) {
    if (!g.length || !match(qs[0], g[0])) continue;
    let ok = true;
    for (let i = 0; i < qs.length && ok; i++) ok = i < qs.length - 1 ? g.includes(qs[i]) : someWord(g, qs[i], match);
    if (ok) return Group.Older;
  }
  for (const cn of p.commonNames) if (holds(cn, qs, match)) return Group.Common;
  return r === 1 ? Group.NameWords : r === 2 ? Group.Mixed : Group.Other;
}
/** Whether a name's words hold every query word. */
function holds(ws: string[], qs: string[], match: (q: string, w: string) => boolean): boolean {
  for (const q of qs) if (!someWord(ws, q, match)) return false;
  return true;
}
function same(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const prefix = (q: string, w: string) => w.startsWith(q);
/**
 * The order within a group, smallest first: an exact name, the headline's first; a hit of whole words; and, among the
 * common names' hits, the headline holding every word. A name typed as a name is never put after another for its
 * common name ("c" is Conophytum before Copiapoa, whatever their headlines).
 */
function closeness(p: Prepared<unknown>, qs: string[], g: number): number {
  const common = g === Group.Common;
  if (common && p.headed && same(p.commonNames[0], qs)) return 0;
  if (same(p.nameWords, qs)) return 1;
  for (const cn of p.commonNames) if (same(cn, qs)) return 1;
  for (const s of p.synWords) if (same(s, qs)) return 1;
  let whole = true;
  for (const q of qs) if (!p.wordSet.has(q)) { whole = false; break; }
  if (whole) return 2;
  if (common && p.headed && holds(p.commonNames[0], qs, prefix)) return 3;
  return 4;
}
/** Edit distance, stopped past `cap`. */
function distance(a: string, b: string, cap = 9): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.min(prev[b.length], cap + 1);
}
/** How far a near hit is from what was typed: per query word, its distance from the nearest whole word of a name (round sixty-seven; triage-66 N8, S-B12). */
function farness(p: Prepared<unknown>, qs: string[]): number {
  const all = [...p.nameWords, ...p.commonWords, ...p.synWords.flat()];
  return qs.reduce((n, q) => n + (all.length ? Math.min(...all.map((w) => distance(q, w))) : 0), 0);
}

/**
 * The words a query is ranked by: a rank marker ("var", "ssp", "f") is not a word unless it is the last, and a repeated
 * word counts once (round fifty-eight). Exported so the server's short path asks exactly what the ranking asks: "f a"
 * and "a a" are ranked as "a", and went the long way while "a" took the short one (round fifty-nine; the corpus reviews).
 */
export function rankedWords(q: string): string[] {
  const all = queryTokens(q);
  return [...new Set(all.filter((w, i) => !(RANK_MARKERS.has(w) && i < all.length - 1)))];
}

/** Whether the exact pass alone finds anything for `q` in `prepared`: a search over the exact candidates that finds nothing exactly asks the near candidates before it trusts a near pass (round fifty-six, 1). */
export function hasExact<T extends Searchable>(prepared: Prepared<T>[], q: string): boolean {
  const qs = rankedWords(q);
  if (!qs.length) return false;
  const whole = wholeReading(q);
  if (whole && prepared.some((p) => inCommon(p, whole))) return true;
  const exact = (x: string, w: string) => w.startsWith(x);
  for (const p of prepared) if (rank(p, qs, exact) != null) return true;
  if (qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1])) for (const p of prepared) if (rank(p, qs.slice(0, -1), exact) != null) return true;
  return false;
}

/** The matches for `q`, best first. Empty query: nothing (the caller shows its own default). */
export function search<T extends Searchable>(prepared: Prepared<T>[], q: string, limit = Infinity): T[] {
  // "var." on a label is not a search word either (round thirty-five, R2-3), but only once another word follows it: "f"
  // on its own is Ferocactus being typed, and "aloe var" is a variegata on its way (round thirty-seven, R1-7).
  // A trailing marker is tried as a word first, and dropped when nothing starts with it ("haworthia pumila var" still
  // finds the name the words before it find).
  const qs = rankedWords(q);
  if (!qs.length) return [];
  const exact = (x: string, w: string) => w.startsWith(x);
  // The whole query against each common name, when the botanical reading would drop words (round sixty-two; B2): every
  // entry it finds has every typed word in one of its common names (round sixty-seven; triage-66 N2). Otherwise the
  // common names are read whole within the one reading, after a name typed as a name (`group`).
  const whole = wholeReading(q);
  if (whole) {
    const common = collect(prepared.filter((p) => inCommon(p, whole)), whole, exact);
    if (common.length) return common.slice(0, limit).map((h) => h.p.item);
  }
  let hits = collect(prepared, qs, exact);
  const trailingMarker = qs.length > 1 && RANK_MARKERS.has(qs[qs.length - 1]);
  if (!hits.length && trailingMarker) hits = collect(prepared, qs.slice(0, -1), exact);
  // A capitalised word after the first of a genus-shaped query is a similar spelling only of a whole word (`capitalWords`).
  const strict = capitalWords(q);
  const near = strict ? (x: string, w: string) => (strict.has(x) ? w.startsWith(x) || (x.length >= 4 && edit1(x, w)) : nearPrefix(x, w)) : nearPrefix;
  if (!hits.length && qs.some((x) => x.length >= 4)) hits = collect(prepared, qs, near, true);
  // The near match too without the marker: "copiapoa cinera var" found the species before the marker was a word (round thirty-eight, R1-10).
  if (!hits.length && trailingMarker && qs.slice(0, -1).some((x) => x.length >= 4)) hits = collect(prepared, qs.slice(0, -1), near, true);
  return hits.slice(0, limit).map((h) => h.p.item);
}

function collect<T>(prepared: Prepared<T>[], qs: string[], match: (q: string, w: string) => boolean, near = false) {
  const hits: Array<{ p: Prepared<T>; g: number; d: number; c: number }> = [];
  for (const p of prepared) {
    const r = rank(p, qs, match);
    if (r == null) continue;
    const g = group(p, qs, r, match);
    hits.push({ p, g, d: near ? farness(p, qs) : 0, c: closeness(p, qs, g) });
  }
  return hits.sort((a, b) => a.g - b.g || a.d - b.d || a.c - b.c || (a.p.sortKey < b.p.sortKey ? -1 : a.p.sortKey > b.p.sortKey ? 1 : 0));
}
