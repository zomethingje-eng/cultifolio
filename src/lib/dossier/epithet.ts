/**
 * One rule for when two spellings of an epithet are one name (round seventy, before the round; REVIEW-TRIAGE-69). Round
 * sixty-nine had three: `sameEpithet` for Wikipedia titles (two edits at six letters), `stem` and `misspelt` for Commons
 * titles, and none for Kew. The reviews found each reading distinct species as one (Conophytum minimum and minutum,
 * Drosera macrophylla and microphylla, Echinocereus scheeri and schereri).
 *
 * `spellingKey` is the epithet with what the Code treats as the same name taken out: case, hyphens and spaces, "ae" and
 * "oe" written "e" inside the word, a genitive's "ii" written "i", and the gender of one adjective. It never reads an
 * edit distance: a letter changed inside the word is another name until a rule that knows the reference's names says
 * otherwise.
 *
 * Round seventy-one (the self-review of round seventy, A9): read against the species Kew accepts in 534 of the
 * reference's genera, the round-seventy key joined eleven pairs of distinct species. It now keeps apart what the Latin
 * keeps apart:
 *   - Gender is read within one declension. The endings -us, -a, -um (and the Greek -os, -on) are one adjective; -is, -e
 *     another. Across the two they are two words, as Kew's Euphorbia peplus and E. peplis are two species; a source that
 *     holds one as the other (GBIF, Kew, a Wikidata sitelink) proves it where the key cannot. So nudicaulis and
 *     nudicaule, congoensis and congoense, rosea and roseum are one name, and peplus and peplis, scaphirostrus and
 *     scaphirostris are not.
 *   - An adjective in -er is read with its r: niger, nigra and nigrum are "nigr"; stolonifer, stolonifera, stoloniferum
 *     "stolonifr"; asper and aspera "aspr"; afer and afra "afr". Round seventy's second pass dropped the e of any -era or
 *     -erum, and so read Allium chrysantherum as chrysanthum and Erica leucanthera as leucantha.
 *   - A genitive in -ae (of a woman; of a place in -a) is its own ending, never a gender: Asplenium formosae is not
 *     formosum, Begonia chambersiae is not chambersii. A genitive in -ai after a consonant is that -ae (kanehirai,
 *     shimadai; Rec. 60C.1); a vowel or "h" before -ai is no such genitive (Heliconia bihai). "caffr-" is the "afr-" the
 *     2024 Madrid congress put in its place (Erythrina caffra, afra).
 *   - "oe" is read as "e" only as a diphthong: before a consonant, and not in -oensis. Foetida is fetida and coerulea
 *     cerulea; Schinus aroeira is not Schinus areira, nor congoensis congensis.
 *   - A comparative's genitive (-ioris) is another word than the comparative (-ior): Ceropegia ciliatior and Ceropegia
 *     ciliatioris are two species of the reference (round seventy-b).
 * A key is a reading, not a spelling: a key of the -is, -e declension ends in "is", whichever ending was written.
 */
export function spellingKey(epithet: string): string {
  let e = epithet.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '');
  e = e.replace(/^caffr/, 'afr').replace(/([^aeiouyh])ai$/, '$1ae');
  const inside = (s: string) => s.replace(/ae/g, 'e').replace(/oe(?![aeiouy]|ns)/g, 'e');
  // A genitive in -ae: its own ending, the rest read as any other word.
  if (/ae$/.test(e) && e.length >= 5) return `${inside(e.slice(0, -2))}ae`;
  e = inside(e).replace(/ii$/, 'i');
  if (/oris$/.test(e)) return e;
  const r = (s: string) => (s.endsWith('er') ? `${s.slice(0, -2)}r` : s);
  const third = /(?:is|e)$/.exec(e);
  if (third) {
    const bare = r(e.slice(0, -third[0].length));
    return bare.length >= 3 ? `${bare}is` : e;
  }
  const first = /(?:us|um|os|on|a)$/.exec(e);
  const bare = r(first ? e.slice(0, -first[0].length) : e);
  return bare.length >= 3 ? bare : e;
}

export const sameSpelling = (a: string, b: string): boolean => spellingKey(a) === spellingKey(b);
