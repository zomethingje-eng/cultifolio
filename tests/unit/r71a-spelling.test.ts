/**
 * Round seventy-one, agent A: `spellingKey` read against the species Kew accepts (self-review of round seventy, A9). Kew's
 * WCVP through GBIF holds each "two" pair as two accepted species (2026-10-15), or the two are different words; each
 * "one" pair is one name. Each case fails on `r71base` unless marked a guard.
 */
import { describe, it, expect } from 'vitest';
import { spellingKey, sameSpelling } from '$dossier/epithet';

const two = (a: string, b: string) => expect(sameSpelling(a, b), `${a} ${b}`).toBe(false);
const one = (a: string, b: string) => expect(sameSpelling(a, b), `${a} ${b}`).toBe(true);

describe('two names the round-seventy key joined', () => {
  it('another declension: Euphorbia peplus and E. peplis (Kew: two species)', () => {
    two('peplus', 'peplis');
    two('scaphirostrus', 'scaphirostris'); // GBIF's two spellings of one plant: a source proves it, the key does not
  });
  it("an -era or -erum that is not an -er adjective: Allium chrysantherum, Erica leucanthera, Bauhinia macranthera, Dioscorea trichanthera", () => {
    two('chrysanthum', 'chrysantherum');
    two('melananthum', 'melanantherum');
    two('leucantha', 'leucanthera');
    two('macrantha', 'macranthera');
    two('trichantha', 'trichanthera');
  });
  it('a genitive in -ae: Asplenium formosum and formosae; Begonia chambersii and chambersiae', () => {
    two('formosum', 'formosae');
    two('chambersii', 'chambersiae');
    two('theresae', 'theresis'); // the rule: a genitive -ae is no -is, -e adjective either
  });
  it('"oe" before a vowel or in -oensis is no diphthong: Schinus aroeira and areira; congoensis and congensis', () => {
    two('aroeira', 'areira');
    two('congoensis', 'congensis');
  });
});

describe('one name, as before (guards) and newly (an -er adjective read with its r)', () => {
  it('guards', () => {
    for (const [a, b] of [['nudicaulis', 'nudicaule'], ['congoensis', 'congoense'], ['niger', 'nigra'], ['nigrum', 'niger'], ['stolonifer', 'stolonifera'], ['asper', 'aspera'], ['marlothii', 'marlothi'], ['caerulea', 'cerulea'], ['foetida', 'fetida'], ['uva-ursi', 'uvaursi'], ['nana', 'nanus'], ['rosea', 'roseum'], ['kanehirai', 'kanehirae'], ['caffra', 'afra'], ['caffrum', 'afrum'], ['macranthos', 'macranthus'], ['macranthon', 'macrantha'], ['vulgaris', 'vulgare']]) one(a, b);
    two('ciliatior', 'ciliatioris');
    two('bihai', 'bihae');
    expect(spellingKey('ora')).toBe('ora');
  });
  it('an -er adjective in every gender and spelling', () => {
    one('stoloniferus', 'stolonifera'); // base: two
    one('afer', 'afra'); // base: two (a stem of two letters kept its ending)
    one('multiflora', 'multiflorus'); // base: two ("-ra" read as an -er ending)
    one('grandiflorum', 'grandiflorus'); // base: two
    one('obscura', 'obscurus'); // base: two
  });
});
