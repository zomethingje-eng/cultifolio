/**
 * Round sixty-nine, triage-68 N2 (R46-4, S-F2, S-F3): search ties, apostrophes, pooled spellings, a family typed in
 * part, and the genus words English uses as nouns. The species and names are the live index's (11 October). Each case
 * FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { prepare, search, nearAnswer, type Searchable } from '$core/search';
import { buildPostings, entryWords, queryPlan, candidates, postingFileOf, words } from '$core/postings';
import { englishNames, indexNames, generaOf, ENGLISH_USE, type VernacularName } from '$dossier/index-entry';

const idx: Searchable[] = [
  { name: 'Crassula arborescens', common: 'Jade Plant', commons: ['Silver Dollar Plant', 'Tree Crassula'], photos: 18 },
  { name: 'Crassula ovata', common: 'Jade plant', commons: ['Japanese rubberplant', 'Jadetree'], photos: 54 },
  { name: 'Chlorophytum comosum', common: 'Spider plant', commons: ['Spider-ivy', 'Ribbonplant', 'Bracket plant', 'Green Hen And Chickens', 'Hen And Chickens', 'Hen-and-Chicks', 'Walking Anthericum'], photos: 81 },
  { name: 'Sempervivum tectorum', common: 'House-leek', commons: ['Hen-and-chickens', 'Common houseleek', 'Hen-and-chicks'], photos: 55 },
  { name: 'Dicentra formosa', common: 'Bleeding-heart', commons: ['Pacific bleeding-heart'], photos: 60 },
  { name: 'Lamprocapnos spectabilis', common: 'Bleeding heart', commons: ['Asian bleeding-heart'], photos: 52 },
  { name: 'Cissus quadrangularis', common: 'Veldt-grape', commons: ['Winged treebine', "Devil's backbone"], photos: 71 },
  { name: 'Euphorbia tithymaloides', common: 'Redbird flower', commons: ["Devil's-backbone", 'Milkbush'], photos: 52 },
  { name: 'Kalanchoe daigremontiana', common: "Devil's backbone", commons: ['Mother-of-millions'], photos: 58 },
  { name: 'Hypericum calycinum', common: 'Rose-of-Sharon', commons: ["Aaron's beard"], photos: 50 },
  { name: 'Hypericum perforatum', common: "Common St. John's wort", commons: ["St John's wort"], photos: 70 },
  { name: 'Astrophytum capricorne', common: "Bishop's-cap", photos: 47 },
  { name: 'Astrophytum myriostigma', common: "Bishop's-cap", photos: 50 },
  { name: 'Hypericum androsaemum', common: 'Tutsan', commons: ["Shrubby St. John's-wort"], photos: 40 },
  { name: 'Dracaena trifasciata', common: 'Snake plant', commons: ["Mother-in-law's tongue"], photos: 80 },
  { name: 'Ageratum houstonianum', common: 'Bluemink', commons: ['Flossflower'], spellings: ['Blue Mink', 'Floss Flower'], photos: 40 },
  { name: 'Agrostemma githago', common: 'Corncockle', spellings: ['corn cockle'], photos: 40 },
  { name: 'Silene dioica', common: 'Red campion', photos: 60 },
  { name: 'Plantago major', common: 'Common plantain', family: 'Plantaginaceae', photos: 70 },
  { name: 'Chelone glabra', common: 'Snakehead', family: 'Plantaginaceae', photos: 40 },
  { name: 'Aloinopsis luckhoffii', common: 'Calvinia Wartfig', family: 'Aizoaceae', photos: 5 },
  { name: 'Agave americana', common: 'Century plant', family: 'Asparagaceae', photos: 70 },
  { name: 'Copiapoa cinerea', family: 'Cactaceae', photos: 40 },
  { name: 'Conophytum minimum', family: 'Aizoaceae', photos: 3 },
  { name: 'Colchicum triphyllum', syn: ['Colchicum catacuzeni'], photos: 90 }
];
const P = prepare(idx);
const names = (q: string, n = 10) => search(P, q, n).map((x) => x.name);

describe('N2: a tie goes by the name\'s place among the species\' names, then its spelling, then photographs', () => {
  it('"jade plant" is Crassula ovata before C. arborescens: both headlines, more photographs', () => {
    expect(names('jade plant').slice(0, 2)).toEqual(['Crassula ovata', 'Crassula arborescens']);
  });
  it('"hen and chicks" is Sempervivum before Chlorophytum: its fourth name against the other\'s seventh', () => {
    expect(names('hen and chicks')[0]).toBe('Sempervivum tectorum');
  });
  it('"bleeding heart" is Lamprocapnos before Dicentra: both headlines, the first written as typed', () => {
    expect(names('bleeding heart').slice(0, 2)).toEqual(['Lamprocapnos spectabilis', 'Dicentra formosa']);
  });
  it('guard: a name typed as a name keeps the alphabet whatever the photographs ("c" is no photograph count)', () => {
    const q = prepare<Searchable>([{ name: 'Copiapoa a', photos: 90 }, { name: 'Conophytum b', photos: 1 }]);
    expect(search(q, 'c').map((x) => x.name)).toEqual(['Conophytum b', 'Copiapoa a']);
  });
  it('guard: an index without photo counts is ordered as before', () => {
    const q = prepare<Searchable>([{ name: 'Bb bb', common: 'Jade plant' }, { name: 'Aa aa', common: 'Jade plant' }]);
    expect(search(q, 'jade plant').map((x) => x.name)).toEqual(['Aa aa', 'Bb bb']);
  });
});

describe('N2: apostrophes are taken out before the words are split', () => {
  it('"devils backbone" is Kalanchoe daigremontiana first, by its headline, and not by a similar spelling', () => {
    expect(names('devils backbone')[0]).toBe('Kalanchoe daigremontiana');
    expect(nearAnswer('devils backbone', search(P, 'devils backbone'))).toBe(false);
  });
  it('"St Johns wort" and "bishops cap" find their species first, by the name that is the query', () => {
    expect(names('St Johns wort')[0]).toBe('Hypericum perforatum');
    expect(names('bishops cap')[0]).toBe('Astrophytum myriostigma');
  });
  it('guard: "mother in laws tongue" is Dracaena trifasciata', () => {
    expect(names('mother in laws tongue')).toEqual(['Dracaena trifasciata']);
  });
  it("the postings read the same words: \"Devil's backbone\" is posted as devils", () => {
    expect(words("Devil's backbone")).toEqual(['devils', 'backbone']);
    expect(words('O’Brien’s cactus')).toEqual(['obriens', 'cactus']);
    const posted = buildPostings(idx);
    const files = posted.size;
    const got = candidates(queryPlan('devils backbone').exact, (k) => posted.get(postingFileOf(k, files))![k]);
    expect(got.map((i) => idx[i].name)).toContain('Kalanchoe daigremontiana');
  });
});

describe('N2: pooled spellings are searched and never shown', () => {
  it('"blue mink" and "corn cockle" find their species, first', () => {
    expect(names('blue mink')[0]).toBe('Ageratum houstonianum');
    expect(names('corn cockle')[0]).toBe('Agrostemma githago');
  });
  it('the postings carry them', () => {
    expect(entryWords(idx.find((e) => e.name === 'Ageratum houstonianum')!)).toContain('mink');
  });
  it('indexNames gives the spellings the search reads otherwise; englishNames, the page\'s, is as it was', () => {
    const v: VernacularName[] = [
      { name: 'Bluemink', lang: 'eng', sources: 4 },
      { name: 'bluemink', lang: 'eng', source: 'GRIN Taxonomy' },
      { name: 'Blue Mink', lang: 'eng' },
      { name: 'Blue mink', lang: 'eng' },
      { name: 'Flossflower', lang: 'eng', sources: 5 },
      { name: 'Floss-flower', lang: 'eng' },
      { name: 'blue-mink', lang: 'eng' }
    ];
    expect(indexNames(v)).toEqual({ common: 'Bluemink', commons: ['Flossflower'], spellings: ['Blue Mink', 'Floss-flower'] });
    expect(englishNames(v)).toEqual({ common: 'Bluemink', commons: ['Flossflower'] });
  });
  it('guard: no field where every spelling reads as a shown one', () => {
    expect(indexNames([{ name: "Devil's backbone", lang: 'eng' }, { name: 'Devils backbone', lang: 'eng' }, { name: "devil's-backbone", lang: 'eng' }])).toEqual({ common: "Devil's backbone" });
  });
});

describe('N2: the open spelling wins a tie for the headline', () => {
  it('"Swamp-mahogany" over "Swampmahogany", given by as many sources', () => {
    const v: VernacularName[] = [{ name: 'Swampmahogany', lang: 'eng', sources: 3 }, { name: 'swamp-mahogany', lang: 'eng', sources: 3 }];
    expect(englishNames(v).common).toBe('Swamp-mahogany');
  });
  it('guard: more sources still decide ("Milkweed" stays whole)', () => {
    expect(englishNames([{ name: 'Milkweed', lang: 'eng', sources: 3 }, { name: 'Milk weed', lang: 'eng', sources: 2 }]).common).toBe('Milkweed');
  });
});

describe('N2: a family is matched from its start once the typed word has six letters', () => {
  it('"cactace", "aizoac" and "asparagac" find their families', () => {
    expect(names('cactace')).toEqual(['Copiapoa cinerea']);
    expect(names('aizoac')).toEqual(['Aloinopsis luckhoffii', 'Conophytum minimum']);
    expect(names('asparagac')).toEqual(['Agave americana']);
  });
  it('guard: "plant" is still no start of Plantaginaceae, and "snake plant" is Dracaena alone', () => {
    expect(names('plant')).not.toContain('Chelone glabra');
    expect(names('snake plant')).toEqual(['Dracaena trifasciata']);
  });
});

describe('N2: anemone, aralia, geranium, acacia, verbena and petunia are English nouns', () => {
  const genera = generaOf(['Carpenteria californica', 'Anemone nemorosa', 'Pelargonium graveolens', 'Geranium robertianum', 'Polyscias fruticosa', 'Aralia spinosa', 'Vachellia farnesiana', 'Acacia dealbata', 'Verbena officinalis', 'Petunia axillaris', 'Ruellia simplex']);
  it('on the list', () => {
    for (const w of ['anemone', 'aralia', 'geranium', 'acacia', 'verbena', 'petunia']) expect(ENGLISH_USE.has(w)).toBe(true);
  });
  it('Carpenteria californica is "Tree anemone", not GRIN\'s "Tree-anomone"', () => {
    const v: VernacularName[] = [{ name: 'Tree-anomone', lang: 'eng' }, { name: 'tree anemone', lang: 'eng' }, { name: 'Tree-anemone', lang: 'eng' }, { name: 'Bush anemone', lang: 'eng' }];
    expect(englishNames(v, { genus: 'Carpenteria californica', genera }).common).toBe('Tree anemone');
  });
  it('Pelargonium graveolens is "Rose geranium", Polyscias fruticosa "Ming aralia", Vachellia farnesiana "Sweet acacia"', () => {
    expect(englishNames([{ name: 'Rose-scent Storksbill', lang: 'eng', sources: 2 }, { name: 'Rose geranium', lang: 'eng', sources: 3 }], { genus: 'Pelargonium graveolens', genera }).common).toBe('Rose geranium');
    expect(englishNames([{ name: 'Teatree', lang: 'eng', sources: 2 }, { name: 'Ming aralia', lang: 'eng', sources: 4 }], { genus: 'Polyscias fruticosa', genera }).common).toBe('Ming aralia');
    expect(englishNames([{ name: 'Ellington-curse', lang: 'eng' }, { name: 'Sweet acacia', lang: 'eng', sources: 2 }], { genus: 'Vachellia farnesiana', genera }).common).toBe('Sweet acacia');
  });
});
