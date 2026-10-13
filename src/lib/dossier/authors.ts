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

/** A citation as compared: letters only, lower case, accents and "ue"/"oe"/"ae" read as the vowel, "fil." as "f.". */
export function authorKey(a?: string): string {
  return (a ?? '')
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
