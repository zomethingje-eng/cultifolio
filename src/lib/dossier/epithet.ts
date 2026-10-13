/**
 * One rule for when two spellings of an epithet are one name (round seventy, before the round; REVIEW-TRIAGE-69). Round
 * sixty-nine had three: `sameEpithet` for Wikipedia titles (two edits at six letters), `stem` and `misspelt` for Commons
 * titles, and none for Kew. The reviews found each reading distinct species as one (Conophytum minimum and minutum,
 * Drosera macrophylla and microphylla, Echinocereus scheeri and schereri).
 *
 * `spellingKey` is the epithet with what the Code treats as the same name taken out: case, hyphens and spaces, "ae" and
 * "oe" written "e", a genitive's "ii" written "i", and the gender ending (-us, -a, -um; -is, -e; -er, -ra, -rum; and the
 * Greek -os, -on). Two epithets with one key are one name in another spelling or gender: scaphirostrus and scaphirostris,
 * nudicaulis and nudicaule, congoensis and congoense, niger and nigra, caerulea and cerulea. It never reads an edit
 * distance: a letter changed inside the word is another name until a rule that knows the reference's names says
 * otherwise.
 *
 * Round seventy, second pass (agent A's finding): an adjective in -er keeps its e in some words and drops it in others
 * (niger, nigra; but stolonifer, stolonifera, stoloniferum), so "stolonifer" and "stolonifera" had two keys. An e left
 * before a stripped -ra or -rum is dropped too: stolonifer, stolonifera and stoloniferum are "stolonif", asper and aspera
 * "asp", while niger, nigra and nigrum stay "nig".
 */
const GENDER = /(?:rum|ra|er|us|um|os|on|is|a|e)$/;

export function spellingKey(epithet: string): string {
  let e = epithet.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '');
  // Round seventy-b (agent A's need): a genitive of a name ending in -a, written -ai after a consonant (kanehirai,
  // shimadai), is the -ae the Code asks for (Rec. 60C.1); and "caffr-" is the "afr-" the 2024 Madrid congress put in its
  // place (Erythrina caffra, afra). Neither joins two accepted species of the reference. A vowel or "h" before -ai is no
  // such genitive (Heliconia bihai).
  e = e.replace(/^caffr/, 'afr').replace(/([^aeiouyh])ai$/, '$1ae');
  e = e.replace(/ae/g, 'e').replace(/oe/g, 'e');
  e = e.replace(/ii$/, 'i');
  // A comparative's genitive (-ioris) is another word than the comparative (-ior), not its gender: Ceropegia ciliatior and
  // Ceropegia ciliatioris are two species of the reference (round seventy-b, the merge).
  const end = /oris$/.test(e) ? '' : (GENDER.exec(e)?.[0] ?? '');
  let bare = e.slice(0, e.length - end.length);
  if ((end === 'ra' || end === 'rum') && bare.endsWith('e')) bare = bare.slice(0, -1);
  return bare.length >= 3 ? bare : e;
}

export const sameSpelling = (a: string, b: string): boolean => spellingKey(a) === spellingKey(b);
