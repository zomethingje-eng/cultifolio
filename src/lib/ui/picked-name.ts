import { parseName } from '$core/names';

/**
 * What is typed, read as the server reads a query: NFKC, with no format character (a zero-width space, a soft hyphen).
 * A full-width "Ｃｏｐｉａｐｏａ ｃｉｎｅｒｅａ" asked about "Ｃｏｐｉａｐｏａ", and a pasted zero-width space made Enter miss
 * the reference row (round sixty-two; the verification review's search 12; A7).
 */
export const cleanTyped = (typed: string) => typed.normalize('NFKC').replace(/\p{Cf}/gu, '');

/**
 * A rank marker with its epithet, as `tidyName` writes it ("var. columna-alba", "subsp. furfuraceus", "f. cristata"),
 * or a nothovariety or nothosubspecies; the epithet in any case ("var. Columna-alba"), three letters or more.
 */
const RANK_TAIL = /^((?:notho)?(?:var|subsp)\.|f\.)\s+(\p{L}[\p{L}-]{2,})(?=\s|$)/u;
/** One name whatever its case, spacing and hybrid sign: the backbone writes "Aloe nobilis" for "Aloe × nobilis". */
export const sameName = (a: string, b: string) => {
  const k = (s: string) => cleanTyped(s).toLowerCase().replace(/(^|\s)x(?=\s)/g, ' ').replace(/×/g, ' ').replace(/\s+/g, ' ').trim();
  return k(a) === k(b);
};
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** True when a and b are within one edit (insert, delete, replace, or adjacent swap). */
function edit1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}
/** An epithet's stem, so a genus transfer that changed its ending ("dichotoma", "dichotomum") reads as one epithet. */
const stem = (w: string) => fold(w).replace(/(?:us|um|a|is|e|es|i)$/, '');
/** The picked species' epithet is the one typed: the same, the same but for a gender ending (a transfer), or one typing error away. */
const sameEpithet = (typed: string, picked: string) => fold(typed) === fold(picked) || stem(typed) === stem(picked) || (typed.length >= 4 && edit1(fold(typed), fold(picked)));

/**
 * A genus followed by capitalised words, unquoted: a cultivar ("Echeveria Lola", "Haworthia Big Band", "Echeveria
 * Perle von Nurnberg"), or a species typed with a capital ("Copiapoa Tenuissima"). The genus as typed and the rest as
 * typed; null for any other shape, and for a field number ("Gymnocalycium LB 123"). The picker asks about the species
 * a single capitalised word may be, and offers the genus with the rest kept as a cultivar only when the genus is one
 * (round sixty-two; A7; the verification review's search 4 and 5).
 */
export function cultivarRest(typedRaw: string): { genus: string; rest: string } | null {
  const typed = cleanTyped(typedRaw);
  if (/[‘'"“”’()×]/.test(typed)) return null;
  const ts = typed.trim().split(/\s+/);
  if (ts.length < 2 || !/^\p{Lu}\p{Ll}+$/u.test(ts[0]) || !/^\p{Lu}/u.test(ts[1]) || /^\p{Lu}{2,3}$/u.test(ts[1])) return null;
  if (/^(?:cf|cfr|aff|nr|sp|spp|cv|var|v|subsp|ssp|f|fo|forma|x)\.?$/i.test(ts[1]) || ts.slice(1).some((t) => /\d/.test(t))) return null;
  return { genus: ts[0], rest: ts.slice(1).join(' ') };
}

/**
 * What the picker sends to the catalogue's own search (`/api/search`): the text as typed, whole, read as the server
 * reads it (`cleanTyped`), as the catalogue's search box sends it. The server's readings take a common name whole,
 * and leave out an author, a cultivar or a field number; cutting a common name to its first two words here asked about
 * "String of" and "Black eyed" (round sixty-two; the verification review's search 6).
 */
export const searchText = (typed: string) => cleanTyped(typed).replace(/\s+/g, ' ').trim();

/**
 * What the picker asks the name service (`/api/names`, passed on to GBIF) about: the species part of the name, the
 * genus as typed and the epithet in lower case, with no qualifier, rank tail, cultivar, author or field number (round
 * sixty-two; the corpus review, 2; the server review, 1; B3; the verification review's search 4 and 14). A single
 * capitalised word after the genus is asked as the epithet it may be ("Copiapoa Tenuissima" asks about Copiapoa
 * tenuissima, which the backbone has); several are a cultivar and the genus alone is asked ("Haworthia Big Band"). A
 * cross asks about its genus, as before; a field number after the genus ("Gymnocalycium LB 123") asks about the genus.
 */
export function requestName(typedRaw: string): string {
  const typed = cleanTyped(typedRaw);
  const p = parseName(typed);
  if (p.parentage || (!p.epithet && p.kind === 'hybrid')) return p.genus; // a cross's genus, past a nothogenus sign
  const shape = cultivarRest(typed);
  if (shape) return shape.rest.includes(' ') ? shape.genus : `${shape.genus} ${shape.rest.toLowerCase()}`;
  const genus = typed.trim().replace(/^×\s*/, '').split(/\s+/).find((t) => t.toLowerCase() === p.genus.toLowerCase()) ?? p.genus;
  if (!p.epithet) return genus;
  // A named nothospecies keeps its sign ("Aloe × nobilis"); a nothogenus's own sign is not asked ("× Gasteraloe beguinii").
  return p.kind === 'hybrid' && p.scientific.replace(/^× /, '').includes('×') ? `${genus} × ${p.epithet}` : `${genus} ${p.epithet}`;
}

/**
 * The name a pick in the species picker writes into the field (round sixty-one; the corpus review, 5; round sixty-two:
 * the corpus review, 3; A7; B3; the verification review's search 10 and 11).
 *
 * The picked suggestion's name replaces only what it names:
 *   - a cross keeps its parentage as typed;
 *   - a qualifier stays where it was written ("Copiapoa cf. cinerea" picked as Copiapoa cinerea is still "cf."), with
 *     what follows "sp." (a collector's number);
 *   - the genus picked for a genus followed by capitalised words keeps the rest as a cultivar ("Echeveria 'Lola'"), and
 *     the genus picked for a name with no epithet keeps the rest as typed ("Gymnocalycium LB 123", "× Gasteraloe");
 *   - a species keeps a typed rank with a complete epithet, in any of the spellings the search knows ("fo.", "variety",
 *     "subspecies", "nothovar.", an epithet with a capital), when the species picked has the epithet typed: the same,
 *     its older genus's ("Haworthia attenuata var. radula" picked as Haworthiopsis attenuata), or one typing error away.
 *     "Copiapoa cinerea var" wrote a dangling "var", "Copiapoa cinerea Phil." the author into the name, and "Copiapoa
 *     cinerea var. c" picked as Lithops lesliei "Lithops lesliei var. c"; those are not kept (`droppedByPick` says so).
 * A suggestion that is itself below species rank (the backbone's "… var. columna-alba") is its own whole name.
 */
export function pickedName(typedRaw: string, picked: { name: string; rank?: string }): string {
  const typed = cleanTyped(typedRaw);
  const p = parseName(typed);
  const cv = p.cultivar ? ` '${p.cultivar}'` : '';
  if (p.parentage) return `${p.parentage}${cv}`;
  const [pg, pe] = picked.name.trim().split(/\s+/);
  const atSpecies = !picked.rank || picked.rank === 'SPECIES';
  const sign = p.scientific.startsWith('× ') ? '× ' : '';
  const sci = p.scientific.slice(sign.length);
  if (p.qualifier) {
    const parts = sci.split(' ');
    parts[0] = pg;
    if (p.epithet && pe && parts[2] === p.epithet && atSpecies) parts[2] = pe;
    return sign + parts.join(' ') + cv;
  }
  const shape = cultivarRest(typed);
  if (shape && picked.rank === 'GENUS' && sameName(pg, shape.genus)) return `${pg} '${shape.rest}'`;
  if (picked.rank === 'GENUS' && !p.epithet) return sign + [pg, ...sci.split(' ').slice(1)].join(' ') + cv;
  const binomial = picked.name.trim().split(/\s+/).length === 2;
  const head = p.epithet ? `${p.genus} ${p.epithet} ` : '';
  const rest = head && sci.startsWith(head) ? sci.slice(head.length).trim() : '';
  const m = RANK_TAIL.exec(rest);
  const tail = m ? `${m[1]} ${m[2].toLowerCase()}` : '';
  const keep = atSpecies && binomial && !!tail && !!p.epithet && !!pe && sameEpithet(p.epithet, pe);
  return picked.name + (keep ? ` ${tail}` : '') + cv;
}

/**
 * Whether a pick files the suggestion's key: only when the scientific name filed is the picked taxon's own (round
 * sixty-two; B3, A7). A kept qualifier, an unmatched variety, or a variety reached through a synonym listed on the
 * species is filed with no key: the key would say the plant is that species, which the name typed does not.
 */
export function filesKey(typed: string, picked: { name: string; rank?: string }): boolean {
  return sameName(parseName(pickedName(typed, picked)).scientific, picked.name);
}

/** The rank, qualifier and hybrid words a name may carry, which a pick may write in another spelling. */
const MARKS = new Set(['var', 'v', 'variety', 'subsp', 'ssp', 'subspecies', 'f', 'fo', 'fa', 'forma', 'cv', 'x', 'cf', 'cfr', 'aff', 'nr', 'near', 'vel', 'sp', 'spp', 'nov', 'nothovar', 'nothosubsp']);
const wordsOf = (s: string) => fold(cleanTyped(s)).split(/[^a-z0-9]+/).filter(Boolean);
/**
 * The text as typed, when a pick wrote a name that leaves some of its words out (an author, a locality, a field number,
 * a variety not carried to another species, a bracketed aside); null when every typed word is in the name written, or
 * was the genus or epithet the pick corrected. "Copiapoa cinerea Pan de Azucar" picked as the species filed neither a
 * cultivar nor the name as received, and the typed words were gone (round sixty-two; the grower review, 9): the form
 * files this as the name as received.
 */
export function droppedByPick(typedRaw: string, written: string): string | null {
  const typed = cleanTyped(typedRaw).replace(/\s+/g, ' ').trim();
  const p = parseName(typed);
  const have = new Set(wordsOf(written));
  const corrected = new Set([...wordsOf(p.genus), ...wordsOf(p.epithet ?? '')]);
  return wordsOf(typed).some((w) => !have.has(w) && !corrected.has(w) && !MARKS.has(w)) ? typed : null;
}
