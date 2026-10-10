/**
 * Round sixty-seven, names (triage-66 N1, N3, N5, N6, N7, N9): the headline rule, the pooling of spellings, the capitals
 * read across hyphens, the comma inside brackets, the flags the audit reads, and the older names the index searches.
 * Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { englishNames, generaOf, nameKey, namesOf, nameFlags, genericNoun, olderNamesOf, type VernacularName } from '$dossier/index-entry';
import { auditDossiers } from '../../scripts/audit-common-names';

const eng = (name: string, extra: Record<string, unknown> = {}) => ({ name, lang: 'eng', ...extra }) as VernacularName;
const GENERA = generaOf(['Malpighia emarginata', 'Allamanda cathartica', 'Echinocereus pectinatus', 'Podocarpus costalis', 'Copiapoa cinerascens', 'Agave americana', 'Ornithogalum umbellatum', 'Tradescantia zebrina', 'Choisya ternata', 'Opuntia ficus-indica', 'Aloe arborescens', 'Cotyledon orbiculata', 'Ipheion uniflorum', 'Metrosideros robusta']);
const names = (vs: VernacularName[], species: string) => englishNames(vs, { genus: species, genera: GENERA });
const shown = (vs: VernacularName[], species: string) => names(vs, species).common;

describe('N3: the headline rule', () => {
  it('distinct sources rank first, and "preferred" breaks a tie only', () => {
    // Malpighia emarginata as the corpus has it: "Cherry" flagged preferred by one dataset (and its copy), "Barbados cherry" given by six.
    const m = [eng('Cherry', { source: 'Checklist Dutch Caribbean Species Register', alsoFrom: ['Catalogue of Life'], preferred: true }), eng('Barbados cherry', { source: 'GRIN', alsoFrom: ['CoL', 'ITIS', 'TAXREF', 'VASCAN', 'UKSI'] })];
    expect(shown(m, 'Malpighia emarginata')).toBe('Barbados cherry'); // base: "Cherry"
    // Echinocereus pectinatus: a Spanish name tagged English and flagged preferred, against "Rainbow cactus" from three sources.
    expect(shown([eng('Órgano-pequeño Peine', { source: 'a', preferred: true }), eng('Rainbow cactus', { source: 'b', alsoFrom: ['c', 'd'] })], 'Echinocereus pectinatus')).toBe('Rainbow cactus');
    // On a tie the preferred one still goes first.
    expect(shown([eng('Golden trumpet', { source: 'a' }), eng('Yellow bell', { source: 'b', preferred: true })], 'Allamanda cathartica')).toBe('Yellow bell');
  });
  it('a single generic noun is set back after every fuller name, and shown only when there is no other', () => {
    expect(shown([eng('Buttercup', { sources: 4, preferred: true }), eng('Golden trumpet', { sources: 2 })], 'Allamanda cathartica')).toBe('Golden trumpet');
    expect(shown([eng('Cactus')], 'Copiapoa cinerascens')).toBe('Cactus'); // guard: nothing fuller
    expect(genericNoun('Cherry')).toBe(true);
    expect(genericNoun('cacti')).toBe(false);
    expect(genericNoun('Cherries')).toBe(false);
    expect(genericNoun('Poppies')).toBe(false);
    expect(genericNoun('Trees')).toBe(true);
    expect(genericNoun('Barbados cherry')).toBe(false);
  });
  it('the species\' own binomial written as an English name is set back', () => {
    expect(names([eng('Podocarpus costalis', { sources: 3 }), eng('Arius')], 'Podocarpus costalis')).toEqual({ common: 'Arius', commons: ['Podocarpus costalis'] });
  });
});

describe('N5: spellings pool across apostrophes, closed compounds, accents and a trailing full stop', () => {
  it('one key for every spelling of one name', () => {
    expect(nameKey("Pig's ear")).toBe(nameKey('Pigs ear'));
    expect(nameKey('Century plant')).toBe(nameKey('Centuryplant'));
    expect(nameKey('Century-plant')).toBe(nameKey('century plant'));
    expect(nameKey('Northern Rātā')).toBe(nameKey('Northern rata'));
    expect(nameKey('Spring starflower.')).toBe(nameKey('Spring starflower'));
    expect(nameKey('St John’s wort')).toBe(nameKey("St Johns wort"));
    expect(nameKey('Pig ears')).not.toBe(nameKey("Pig's ear")); // guard: a plural is another name
  });
  it('shows one spelling, and counts every spelling\'s sources for the name', () => {
    expect(names([eng("Haworth's aeonium", { source: 'a', alsoFrom: ['b'] }), eng('Haworths Aeonium', { source: 'c' }), eng('Pinwheel', { source: 'd', alsoFrom: ['e'] })], 'Aeonium haworthii'))
      .toEqual({ common: "Haworth's aeonium", commons: ['Pinwheel'] }); // base: three names, "Haworths Aeonium" among them
    expect(names([eng('Spring starflower', { source: 'a' }), eng('Spring star', { source: 'b' }), eng('Spring starflower.', { source: 'c' }), eng('Springstar', { source: 'd' })], 'Ipheion uniflorum'))
      .toEqual({ common: 'Spring starflower', commons: ['Spring star'] });
    expect(names([eng('Northern Rātā', { source: 'a', alsoFrom: ['b'] }), eng('Northern rata', { source: 'c' })], 'Metrosideros robusta').commons).toBeUndefined();
    // Pooled, "Century plant" (two spellings, three sources) outranks "American agave" (two).
    expect(shown([eng('American agave', { source: 'a', alsoFrom: ['b'] }), eng('Century plant', { source: 'c' }), eng('Century-plant', { source: 'd' }), eng('Centuryplant', { source: 'e' })], 'Agave americana')).toBe('Century plant');
  });
  it('a head noun written apart (plant, tree, lily, daisy…) is shown apart over its closed form, however many lists copy the closed one (round sixty-seven)', () => {
    expect(shown([eng('Zebraplant', { source: 'USDA', alsoFrom: ['ITIS', 'CoL'] }), eng('Zebra plant', { source: 'TAXREF' })], 'Aphelandra squarrosa')).toBe('Zebra plant'); // base of the merge: "Zebraplant"
    expect(shown([eng('Lipsticktree', { source: 'USDA', alsoFrom: ['ITIS'] })], 'Bixa orellana')).toBe('Lipsticktree'); // guard: given only closed, shown as given
    // A closed compound that is not a head noun written apart goes by its sources: "Milkweed", "Nannyberry" (after the corpus step).
    expect(shown([eng('Giant milkweed', { source: 'a', alsoFrom: ['b', 'c'] }), eng('Giant Milk Weed', { source: 'd' })], 'Calotropis gigantea')).toBe('Giant milkweed');
    expect(shown([eng('nannyberry', { source: 'a', alsoFrom: ['b', 'c', 'd'] }), eng('nanny-berry', { source: 'e', alsoFrom: ['f'] })], 'Viburnum lentago')).toBe('Nannyberry');
  });
  it('a source giving two spellings of one name counts once for it, and once for the spelling chosen', () => {
    expect(shown([eng('Jade', { source: 'a', alsoFrom: ['b'] }), eng('Money plant', { source: 'c' }), eng('Money-plant', { source: 'c' })], 'Crassula ovata')).toBe('Jade');
    expect(shown([eng('Shrimp plant', { source: 'CoL' }), eng('shrimp plant', { source: 'WoRMS' }), eng('Shrimpplant', { source: 'TAXREF' }), eng('shrimpplant', { source: 'TAXREF' })], 'Justicia brandegeeana')).toBe('Shrimp plant');
  });
});

describe('N6: capitals read across hyphens; small words are not counted as lower case', () => {
  it('a capital one spelling meant is kept, whatever the hyphens', () => {
    // Ornithogalum umbellatum: CoL, GRIN and VT wrote "star-of-Bethlehem".
    expect(shown([eng('Star of bethlehem', { source: 'a', alsoFrom: ['b', 'c', 'd'] }), eng('star-of-Bethlehem', { source: 'e' })], 'Ornithogalum umbellatum')).toBe('Star of Bethlehem'); // base: "Star of bethlehem"
    expect(shown([eng('Wandering jew', { source: 'a', alsoFrom: ['b'] }), eng('wandering-Jew', { source: 'c' })], 'Tradescantia zebrina')).toBe('Wandering Jew');
    expect(shown([eng('Sweet-william Catchfly', { source: 'a', alsoFrom: ['b'] }), eng('sweet William catchfly', { source: 'c', preferred: true })], 'Atocion armeria')).toBe('Sweet-William catchfly');
  });
  it('a Title Case capital no source meant goes where a source writes the word in lower case', () => {
    expect(shown([eng('Mexican Orange', { source: 'a', alsoFrom: ['b'] }), eng('Mexican-orange', { source: 'c' })], 'Choisya ternata')).toBe('Mexican orange'); // base: "Mexican Orange"
    expect(shown([eng('Lady of the Night Cactus', { source: 'a', alsoFrom: ['b'] }), eng('lady-of-the-night cactus', { source: 'c' })], 'Cereus hexagonus')).toBe('Lady of the night cactus');
    expect(shown([eng("Hawai'I Birdnest Fern", { source: 'a' }), eng("Hawai'i birdnest fern", { source: 'b' })], 'Asplenium nidus')).toBe("Hawai'i birdnest fern");
  });
  it('guard: a Title Case name alone keeps its capitals, and one with a small word is not read as meaning them', () => {
    expect(shown([eng('Christmas Cactus')], 'Schlumbergera')).toBe('Christmas Cactus');
    // Small words counted as lower case would have made these "Mother of Thousands" and "Lily-of-The-Valley": on the
    // real corpus that reading changed 16 shown names, every one for the worse, and none for the better (round
    // sixty-seven; the report). Title Case says nothing of a word's capital, as before.
    expect(shown([eng('Mother of Thousands', { source: 'a' }), eng('Mother of thousands', { source: 'b', alsoFrom: ['c'] })], 'Kalanchoe daigremontiana')).toBe('Mother of thousands');
    expect(shown([eng('Lily-of-the-valley', { source: 'a', alsoFrom: ['b'] }), eng('Lily of The Valley', { source: 'c' })], 'Convallaria majalis')).toBe('Lily-of-the-valley');
  });
});

describe('N7: a comma inside brackets does not split, and a one-word part no source gives alone is a bare word', () => {
  it('brackets', () => {
    expect(namesOf('Prickly pear (Indian fig, Barbary fig)')).toEqual(['Prickly pear (Indian fig, Barbary fig)']); // base: two broken halves
    expect(namesOf('Prickly pear (Indian fig, Barbary fig), Tuna cactus')).toEqual(['Prickly pear (Indian fig, Barbary fig)', 'Tuna cactus']);
    expect(namesOf('Sago palm, King sago')).toEqual(['Sago palm', 'King sago']); // guard
  });
  it('"Aloe, Coral" is a list whose one-word part "Coral" is the headline only when nothing fuller is given', () => {
    expect(shown([eng('Aloe, Coral', { sources: 3 }), eng('Coral aloe')], 'Aloe striata')).toBe('Coral aloe'); // base: "Coral"
    expect(shown([eng('Echeveria, blue', { sources: 2 }), eng('Blue echeveria')], 'Echeveria glauca')).toBe('Blue echeveria');
    // A word a source gives on its own is a name like any other (guard).
    expect(shown([eng('Jade', { sources: 3 }), eng('Money plant')], 'Crassula ovata')).toBe('Jade');
  });
});

describe('N9: the audit flags fragments, trailing dots and unmatched brackets, and the spelling is shown as the source wrote it', () => {
  it('flags', () => {
    expect(nameFlags('Lady of the night)')).toEqual(['bracket']);
    expect(nameFlags('Spring starflower.')).toEqual(['trailing-dot']);
    expect(nameFlags('White -fld')).toEqual(['fragment']);
    expect(nameFlags('Bel', false)).toEqual(['fragment']);
    expect(nameFlags('Fig')).toEqual([]); // a short name given alone is a name
    expect(nameFlags('Prickly pear (Indian fig, Barbary fig)')).toEqual([]);
    expect(nameFlags('St. John’s wort')).toEqual([]);
  });
  it('Cestrum nocturnum keeps its source\'s "Lady of the night)", and the audit counts it', () => {
    const v = [eng('Night jessamine', { sources: 3 }), eng('Lady of the night)', { source: 'WoRMS' })];
    expect(names(v, 'Cestrum nocturnum').commons).toContain('Lady of the night)');
    const a = auditDossiers([{ key: 1, name: 'Cestrum nocturnum', common: 'Night jessamine', commons: ['Lady of the night)'] }], () => ({ key: 1, name: { scientific: 'Cestrum nocturnum', vernacular: v } }));
    expect(a.flags.bracket?.n).toBe(1);
    expect(a.changed).toBe(0);
  });
  it('the dossier audit names each changed headline\'s cause', () => {
    const v = [eng('Cherry', { source: 'a', alsoFrom: ['b'], preferred: true }), eng('Barbados cherry', { source: 'c', alsoFrom: ['d', 'e'] })];
    const a = auditDossiers([{ key: 1, name: 'Malpighia emarginata', common: 'Cherry', commons: ['Barbados cherry'] }], () => ({ key: 1, name: { scientific: 'Malpighia emarginata', vernacular: v, synonyms: ['Malpighia punicifolia L.', 'Malpighia glabra var. undulata'] } }));
    expect(a.changed).toBe(1);
    expect(Object.keys(a.causes)).toEqual(['a generic noun set back (N3)']);
    expect(a.sample[0]).toBe('Malpighia emarginata: "Cherry" -> "Barbados cherry" (a generic noun set back (N3))');
  });
});

describe('N1: every older name of species rank is searched; the entry shows six', () => {
  it('olderNamesOf', () => {
    const synonyms = ['Cactus coronatus Lam.', 'Echinocactus aa Link', 'Echinocactus bb Link', 'Echinocactus cc Link', 'Echinocactus dd Link', 'Echinocactus ee Link', 'Ferocactus glaucescens (DC.) Britton & Rose', 'Ferocactus glaucescens var. nuda Lindsay', 'Bisnaga old Lem.', 'Opuntia sect. Tuna'];
    const { syn, older } = olderNamesOf('Bisnaga glaucescens', synonyms);
    expect(syn).toHaveLength(6);
    expect(older).toEqual(['Ferocactus glaucescens', 'Bisnaga old']); // species rank only: the variety is left out past the six
    expect([...syn, ...older]).not.toContain('Bisnaga glaucescens');
  });
});
