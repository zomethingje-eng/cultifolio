/**
 * Author citations, read two ways (round seventy; REVIEW-TRIAGE-69 B2, B4). A botanical name is its words and its author:
 * "Agave variegata Jacobi" and "Agave variegata Steud." are two names for two plants (homonyms), and only the author
 * tells them apart. Kew and GBIF write the same author differently ("Hook.f." and "Hook.fil.", "Runge" and "Ruenge"), so
 * citations are compared loosely: letters only, lower case, accents and the German "ue", "oe", "ae" read as the plain
 * vowel, and "fil." as "f.".
 *
 *   - `authorsAgree`, for an older name and the Kew row it may be (round sixty-nine; triage-68 M2): the whole citation,
 *     with or without its ex-authors.
 *   - `sameNameAuthor`, for the species' own name and a Kew row of the same words (round seventy; triage-69 B2, B4, S-B4,
 *     S-B5): the author who published the combination, outside the parentheses and after any "ex", must be the same.
 *     The parenthetical author is the basionym's, which Kew and GBIF cite differently ("(Hort.) Desc." and "(Anon.)
 *     Desc." for Cyphostemma congoense), and the ex-author is not the author (ICN Art. 46.4; round sixty-nine's rule).
 *
 * A citation stated by neither side, or by one only, agrees with nothing.
 */

/**
 * Letters that NFD does not take apart, read as their Latin letters (round seventy, the owner's run: Kew writes
 * "Yıldırım" with the Turkish dotless ı, GBIF "Yildirim", and Chionodoxa salbacus lost its range).
 */
const TRANSLIT: Record<string, string> = { 'ı': 'i', 'İ': 'I', 'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe', 'ß': 'ss', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'þ': 'th' };

/** A citation as compared: letters only, lower case, accents and "ue"/"oe"/"ae" read as the vowel, "fil." as "f.". */
export function authorKey(a?: string): string {
  return (a ?? '')
    .replace(/[ıİłŁøØæÆœŒßđĐðþ]/g, (c) => TRANSLIT[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bfil\./gi, 'f.')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/ue/g, 'u')
    .replace(/oe/g, 'o')
    .replace(/ae/g, 'a');
}

/** A citation without its ex-authors, which a citation may leave out (ICN Art. 46.4): "Lippold ex Otto & Dietr." is "Otto & Dietr.". */
export const withoutEx = (a: string) => a.replace(/\(([^)]*\bex\s+)?([^)]*)\)/, '($2)').replace(/^(\([^)]*\)\s*)?.*?\bex\s+/, '$1');

/**
 * Whether an older name's author and a WCVP row's agree: both stated, and the same once read loosely, with or without
 * ex-authors. A name stated by neither, or by one only, does not agree: "Lantana mutabilis" by Lippold is not Kew's
 * "Lantana mutabilis Salisb.", whatever the number of rows (round sixty-nine; triage-68 M2).
 */
export function authorsAgree(a?: string, b?: string): boolean {
  if (!authorKey(a) || !authorKey(b)) return false;
  return authorKey(a) === authorKey(b) || authorKey(withoutEx(a!)) === authorKey(withoutEx(b!));
}

/** The author who published a combination: outside the parentheses, after any "ex". "(Warder ex Barney) Warder ex Engelm." is "Engelm.". */
export function publishingAuthor(a?: string): string {
  const outside = (a ?? '').replace(/^\s*\([^)]*\)\s*/, '');
  return authorKey(outside.replace(/^.*\bex\s+/, ''));
}

/**
 * Whether a Kew row of the species' own words is the species' own name: the publishing authors are the same (round
 * seventy; triage-69 B4, S-B4). Ceropegia macrocarpa (Sprenger) Bruyns is not Kew's "Ceropegia macrocarpa J.N.Haage &
 * E.Schmidt"; Cyphostemma congoensis (Hort.) Desc. is Kew's "Cyphostemma congoense (Anon.) Desc."; Mammillaria grusonii
 * Ruenge is Kew's "Mammillaria grusonii Runge".
 */
export function sameNameAuthor(a?: string, b?: string): boolean {
  const pa = publishingAuthor(a), pb = publishingAuthor(b);
  return !!pa && pa === pb;
}

/** A citation without a person's initials: "W.Heering" is "Heering", "(N.E.Br.) E.Walther" is "(N.E.Br.) Walther"; "L.f." keeps its L. */
export const withoutInitials = (a: string) => a.replace(/\b(?:[A-Z][a-z]?\.\s*)+(?=[A-Z][a-z])/g, '');
/** The basionym's author, inside the parentheses, without its ex-author: "(Engelm.) Lem." is "engelm". */
export const parentheticalAuthor = (a?: string) => authorKey((/^\s*\(([^)]*)\)/.exec(a ?? '')?.[1] ?? '').replace(/^.*\bex\s+/, ''));
/** The ex-author of the combination, outside the parentheses: "Welw. ex Hiern" is "welw". */
export const exAuthor = (a?: string) => authorKey(/^(?:\s*\([^)]*\)\s*)?(.*?)\s+ex\s+/.exec(a ?? '')?.[1] ?? '');
const same = (x: string, y: string) => !!x && x === y;

/**
 * The readings by which a Kew row of the species' own words is its own name, tried in order until one finds a row (round
 * seventy, the owner's run; REVIEW-TRIAGE-69 B4 as revised). Each is stricter than the next, so where one row matches more
 * closely than another, it alone is taken:
 *   1. the whole citation, with or without ex-authors (`authorsAgree`), the basionym's author in its parentheses: Drimia
 *      nana (Snijman) J.C.Manning & Goldblatt is not Kew's (Oyewole) J.C.Manning & Goldblatt, though Manning and
 *      Goldblatt published both, and "(Peckover)" is not "Peckover";
 *   2. the publishing author (`sameNameAuthor`): "(Hort.) Desc." and "(Anon.) Desc.";
 *   3. the publishing author without initials: "Heering" and "W.Heering", "Walther" and "E.Walther";
 *   4. the basionym's author, when both cite one: one basionym combined twice in one genus is one name ("(Engelm.) Lem."
 *      and "(Engelm.) Britton & Rose" for Coryphantha macromeris), and a backbone author cut off after the parenthesis,
 *      "(Frandsen & Aditya)", still names its basionym.
 * None reads an ex-author alone: "Fisch. ex Steud." is not "Fisch. ex F.Dietr.".
 */
export function ownByAuthor<T>(rows: readonly T[], authorship: string | undefined, authorsOf: (r: T) => string | undefined): T[] {
  if (!authorKey(authorship)) return [];
  const a = authorship!;
  const readings: Array<(b: string) => boolean> = [
    // The parentheses kept apart: a backbone author cut off after them, "(Peckover)", is not Kew's "Peckover", a name
    // Peckover published directly (Ceropegia tanzaniensis; Mesembryanthemum pallens "(Sol.)" and Kew's "Sol.").
    (b) => authorsAgree(a, b) && parentheticalAuthor(a) === parentheticalAuthor(b),
    (b) => sameNameAuthor(a, b),
    (b) => same(publishingAuthor(withoutInitials(a)), publishingAuthor(withoutInitials(b))),
    (b) => same(parentheticalAuthor(a), parentheticalAuthor(b))
  ];
  for (const read of readings) {
    const hit = rows.filter((r) => { const b = authorsOf(r); return !!b && read(b); });
    if (hit.length) return hit;
  }
  return [];
}

/**
 * Whether a Kew row of the species' words is plainly another author's name: no reading of `ownByAuthor` agrees, and it
 * shares no ex-author with the backbone's citation either (round seventy, the owner's run). An item that carries such a
 * row's IPNI is that homonym's (Albuca longifolia's 527398-1, Baker's); one that carries the IPNI of "Hibiscus acetosella
 * Welw. ex Hiern", where GBIF writes "Welw. ex Ficalho", is not refused for it.
 */
export function plainlyAnother(authorship: string | undefined, b: string | undefined): boolean {
  if (!authorKey(authorship) || !authorKey(b)) return false;
  if (ownByAuthor([b], authorship, (x) => x).length || same(exAuthor(authorship), exAuthor(b))) return false;
  // "A ex B" cited by its manuscript author alone, "A", is the one name (Mammillaria pennispinosa Krainz ex Shurly, GBIF's
  // "Krainz"; round seventy, the owner's second run).
  const whole = (x?: string) => publishingAuthor(x?.replace(/^.*\bex\s+/, '') ?? '');
  if (same(exAuthor(authorship), whole(b)) || same(exAuthor(b), whole(authorship))) return false;
  // A person of the one citation outside its brackets is among the other's: one name cited two ways (Castanospermum
  // australe "A.Cunn. ex Mudie" and "A.Cunn. & C.Fraser"). A person does not publish one name twice.
  const people = (x?: string) => new Set((x ?? '').replace(/^\s*\([^)]*\)\s*/, '').split(/\s*(?:&|,|\bex\b|\bet\b)\s*/).map((p) => authorKey(withoutInitials(p.trim()))).filter((p) => p.length > 2 && !/^(?:hort|anon|auct|hortorum)$/.test(p)));
  const pa = people(authorship);
  return ![...people(b)].some((p) => pa.has(p));
}

/**
 * The rows of a species' words that are its own, read in its family too (round seventy, the owner's run): GBIF's backbone
 * cites Ixora coccinea, the Rubiaceae, as "Comm. ex Lam.", a name Kew holds as a synonym of Embothrium coccineum, a
 * Proteaceae, and the page showed Embothrium's range in Chile; Kew's Ixora coccinea L., accepted in the Rubiaceae, is
 * the plant. Where own rows lie in another family and a row of the words lies in the species', the rows in its family
 * are its own, or else the one of them Kew accepts. Read only where both families are known, and only where Kew has a
 * row of the words in the species' family, so a family named otherwise by the two sources changes nothing.
 */
export function inFamily<T extends { family?: string; status?: string; taxonomicStatus?: string }>(own: T[], all: T[], family?: string, familyOf: (r: T) => string | undefined = (r) => r.family): T[] {
  // `familyOf` is the family of the entry a row is filed under: Kew's own file gives a synonym or invalid name the family
  // of its genus (Ixora coccinea Comm. ex Lam., Rubiaceae, filed under Embothrium coccineum), GBIF's copy the entry's.
  if (!family || !own.some((r) => familyOf(r) && familyOf(r) !== family)) return own;
  const here = all.filter((r) => familyOf(r) === family && !/misapplied/i.test(r.status ?? r.taxonomicStatus ?? ''));
  if (!here.length) return own;
  const kept = own.filter((r) => !familyOf(r) || familyOf(r) === family);
  if (kept.length) return kept;
  const acc = here.filter((r) => /^accepted$/i.test(r.status ?? r.taxonomicStatus ?? ''));
  return acc.length === 1 ? acc : [];
}
