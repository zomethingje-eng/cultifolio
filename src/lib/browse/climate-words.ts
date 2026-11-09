/**
 * A species' habitat climate in words, from the browse table's letter (round eighty-seven): the catalogue's words on a
 * page, and the CSV's single words. A species with no GBIF key whose climate is pending is "not asked": GBIF's records
 * were never asked for it (rule 2; the glossary's words, as the front page's rows say them).
 */
export function climateWord(letter: string, gbif: number): string {
  return letter === 'o' ? 'climate known' : letter === 'p' && !gbif ? 'climate not asked' : letter === 'p' ? 'climate pending' : letter === 'r' ? 'climate not checked' : letter === 'n' ? 'no habitat climate' : 'climate not stated';
}
export function climateWordOf(letter: string, gbif: number): string {
  return letter === 'o' ? 'known' : letter === 'p' && !gbif ? 'not asked' : letter === 'p' ? 'pending' : letter === 'r' ? 'not checked' : letter === 'n' ? 'none' : 'not stated';
}
