/**
 * Round seventy, REVIEW-TRIAGE-69 C1, C4 and C5: which Commons files a species page shows, what the index counts, and
 * which leads. The titles, names and keys are the live site's and Commons' as read on 2026-10-12 (`/api/dossier/<key>`,
 * `/api/index`); the reference's names are a stand-in index holding the species each case needs. Each case FAILED on the
 * base (526ecaf plus the pre-round moves) unless it says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { commonsPhotos } from '$dossier/sources/commons';
import { fixtureFetcher } from '$dossier/fetch';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, shownPhotos, leadOf, commonsKind, slip, type HeldNames } from '$dossier/photo-kind';
import { gbifPage } from '../../src/lib/core/page-id';

/** The live index's names for the species these cases read (2026-10-12): accepted names and older names as the index carries them. */
const INDEX = [
  { key: gbifPage(9251599), name: 'Othonna daucifolia', syn: ['Doria abrotanifolia', 'Othonna abrotanifolia'] },
  { key: gbifPage(5394999), name: 'Euryops pectinatus', syn: ['Euryops pectinatus var. pectinatus'] },
  { key: gbifPage(3702141), name: 'Nepenthes lamii' },
  { key: gbifPage(7219396), name: 'Nepenthes monticola' },
  { key: gbifPage(3702130), name: 'Nepenthes spectabilis' },
  { key: gbifPage(7283175), name: 'Echinocereus scheeri' },
  { key: gbifPage(3954494), name: 'Echinocereus schereri' },
  { key: gbifPage(3190753), name: 'Drosera macrophylla', syn: ['Sondera macrophylla', 'Drosera monantha'] },
  { key: gbifPage(3190837), name: 'Drosera microphylla', syn: ['Sondera microphylla', 'Drosera calycina'] },
  { key: gbifPage(5592748), name: 'Stephania suberosa' },
  { key: gbifPage(5592727), name: 'Stephania tuberosa' },
  { key: gbifPage(2773803), name: 'Ledebouria ovalifolia', syn: ['Scilla ovalifolia'] },
  { key: gbifPage(2773678), name: 'Ledebouria ovatifolia', syn: ['Scilla lanceifolia var. ovatifolia', 'Scilla ovatifolia'] },
  { key: gbifPage(7284127), name: 'Mammillaria matudae', syn: ['Mammillaria compacticaulis', 'Mammillaria matudae f. duocentralis', 'Mammillaria matudae var. serpentiformis'] },
  { key: gbifPage(4054801), name: 'Cyphostemma juttae', syn: ['Cissus juttae'] },
  { key: gbifPage(4198269), name: 'Aeonium dodrantale', syn: ['Sempervivum dodrantale'] },
  { key: gbifPage(3128990), name: 'Plectocephalus americanus', syn: ['Centaurea americana', 'Centaurea caroliniana', 'Centaurea grandiflora', 'Centaurea mexicana', 'Centaurea nuttallii'] },
  { key: gbifPage(3947849), name: 'Parodia ritteri', syn: ['Parodia camargensis', 'Parodia camargensis var. camblayana'] },
  { key: gbifPage(7281971), name: 'Parodia comarapana', syn: ['Bolivicactus comarapanus'] },
  { key: gbifPage(3949766), name: 'Parodia hausteiniana', syn: ['Bolivicactus hausteinianus', 'Parodia laui'] },
  { key: gbifPage(7281638), name: 'Parodia maassii', syn: ['Bolivicactus maassii'] },
  { key: gbifPage(2779965), name: 'Haworthia chloracantha' },
  { key: gbifPage(2779752), name: 'Haworthia monticola', syn: ['Haworthia chloracantha var. monticola'] },
  { key: gbifPage(2766653), name: 'Agave cocui', syn: ['Agave cocui var. cucutensis', 'Agave cocui var. laguayrensis'] },
  { key: gbifPage(7172987), name: 'Crassula perfoliata' },
  { key: gbifPage(7642067), name: 'Crassula perforata', syn: ['Crassula anthurus'] },
  { key: gbifPage(10871976), name: 'Agave pax' },
  { key: gbifPage(3067157), name: 'Euphorbia milii' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));

type Stored = { title: string; categories?: string[]; struck?: boolean; width?: number; attribution?: string; licence?: string; slips?: string[] };
const photo = (x: Stored) => ({ src: 'commons', id: x.title, url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/960px-${encodeURIComponent(x.title)}`, thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/500px-x.jpg', width: x.width ?? 3000, height: 2000, licence: x.licence ?? 'by-sa', attribution: x.attribution ?? 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', ...(x.categories ? { categories: x.categories } : {}), ...(x.struck ? { struck: true } : {}), ...(x.slips ? { slips: x.slips } : {}) });
/** A dossier as stored, read as the Worker reads it, with the reference's names (`held`) or without. */
const read = (scientific: string, files: Array<string | Stored>, synonyms: string[] = [], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: files.map((f) => photo(typeof f === 'string' ? { title: f } : f)) } as never, held).photos.map((p) => p.id);
const shows = (scientific: string, f: string | Stored, synonyms: string[] = [], held: HeldNames | null = HELD) => read(scientific, [f], synonyms, held).length === 1;

/** A Commons answer of one file, with its categories and description. */
const answer = (title: string, cats = '', description = '') => {
  const name = title.replace(/^File:/, '').replace(/ /g, '_');
  return { query: { pages: { '1': { title, imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(name)}`, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(name)}/960px-${encodeURIComponent(name)}`, width: 3000, height: 2000, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A. Grower' }, Categories: { value: cats }, ImageDescription: { value: description } } }] } } } };
};
const takes = async (scientific: string, title: string, cats = '', description = '', synonyms: string[] = []) => {
  const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': answer(title, cats, description) }), scientific, 12, { scientific, synonyms, key: KEY.get(scientific), held: HELD });
  return r.status === 'ok' && r.data.length === 1;
};

describe('C1, names as pairs: every binomial of a title, of any genus the reference holds', () => {
  it('"Euryops abrotanifolius" on Othonna daucifolia is another plant: the older names share only the epithet (S-C1)', () => {
    const syn = ['Doria abrotanifolia Harv.', 'Othonna abrotanifolia (Harv.) Druce'];
    expect(read('Othonna daucifolia', ['File:Euryops abrotanifolius 160732946.jpg', 'File:Euryops abrotanifolius 161040712.jpg'], syn)).toEqual([]);
    expect(shows('Othonna daucifolia', 'File:Othonna abrotanifolia 1.jpg', syn)).toBe(true); // guard: an older name with its own genus
  });
  it('a run-together name is read as two words: Nepenthes lamii on N. monticola (S-C7)', () => {
    expect(read('Nepenthes monticola', ['File:Nepentheslamiiupperpitcher2800.jpg', 'File:Nepentheslamiiplant2800.jpg', 'File:Nlamiiupper2800.jpg', 'File:Nlamii2rosette2600.jpg', 'File:Nlamii2pitcher2600.jpg'])).toEqual([]);
    expect(read('Nepenthes monticola', ['File:Nepentheslamiiplant2800.jpg'], [], null)).toEqual([]); // the genus run on is read without the reference's names
  });
  it('the species\' own name run together, an initial, and a family are the species (guards)', () => {
    expect(shows('Agave cocui', 'File:Agavecocui.jpg', ['Agave cocui var. cucutensis Hummel'])).toBe(true);
    expect(shows('Nepenthes rhombicaulis', 'File:Neprhombicaulis2.jpg')).toBe(true);
    expect(shows('Plectocephalus americanus', 'File:C.americana-7.jpg', ['Centaurea americana Nutt.'])).toBe(true);
    expect(shows('Mammillaria laui', 'File:Mamillaria laui (M. lauii) (3779412974).jpg')).toBe(true);
    expect(shows('Crassula ovata', 'File:Crassula ovata Crassulaceae.jpg')).toBe(true);
    expect(shows('Nepenthes monticola', 'File:Nmonticola2 2600.jpg')).toBe(true);
    // An initial run on is read only into an epithet of four letters or more: Apaxtla, Guerrero, is not "A. pax".
    expect(shows('Agave cocui', 'File:Agave cocui en Apaxtla.jpg')).toBe(true);
  });
  it('an older name the index holds for this species is its own, though the dossier does not list it (guard: kills a mutant; the base read no genus but the species\' own)', () => {
    expect(shows('Parodia hausteiniana', 'File:Bolivicactus hausteinianus 1.jpg')).toBe(true);
  });
});

describe('C1, misspellings: a slip is the species\' only where the reference holds no such name (S-C5, S-C11, IND-4)', () => {
  it('shows the uploaders\' slips the reference holds no name for, once Kew and GBIF were asked (round 71: S-C9)', () => {
    expect(shows('Mammillaria matudae', { title: 'File:Mammillaria mabudae, ve zkumavce (001).jpg', slips: ['mammillaria mabudae'] })).toBe(true);
    expect(shows('Mammillaria matudae', { title: 'File:Mammillaria matuadae, ve zkumavce (002).jpg', slips: ['mammillaria matuadae'] })).toBe(true);
    expect(shows('Aeonium dodrantale', { title: 'File:Aeonium dodantrale (Sukkulentensammlung).jpg', slips: ['aeonium dodantrale'] }, ['Sempervivum dodrantale Willd.'])).toBe(true);
    expect(shows('Cyphostemma juttae', { title: 'File:Cyphostemma jutae fruit.jpg', slips: ['cyphostemma jutae'] }, ['Cissus juttae Dinter & Gilg'])).toBe(true);
    // Not asked yet: the read cannot ask Kew or GBIF, so it waits for the fill (round 71).
    expect(shows('Mammillaria matudae', 'File:Mammillaria mabudae, ve zkumavce (001).jpg')).toBe(false);
  });
  it('another species the reference holds one letter away is another species', () => {
    expect(shows('Echinocereus scheeri', 'File:Echinocereus schereri.jpg')).toBe(false);
    expect(shows('Drosera macrophylla', 'File:Drosera microphylla 1.jpg')).toBe(false);
    expect(shows('Stephania suberosa', 'File:Stephania tuberosa.jpg')).toBe(false);
    expect(shows('Ledebouria ovalifolia', 'File:Ledebouria ovatifolia 2.jpg')).toBe(false);
  });
  it('without the reference\'s names no slip is the species\'', () => {
    expect(shows('Mammillaria matudae', 'File:Mammillaria mabudae, ve zkumavce (001).jpg', [], null)).toBe(false);
    expect(shows('Echinocereus scheeri', 'File:Echinocereus schereri.jpg', [], null)).toBe(false);
  });
  it('another spelling of the species\' own name needs no reference: gender, "ii", "oe", hyphens (S-C13: hyphens read)', () => {
    expect(shows('Lachenalia purpureocaerulea', 'File:Lachenalia purpureo-coerulea 3.jpg', [], null)).toBe(true);
    expect(shows('Titanopsis hugo-schlechteri', 'File:Titanopsis hugo schlechterii 6.jpg', [], null)).toBe(true);
    expect(shows('Lachenalia purpureocaerulea', { title: 'File:Lachenalia purpureo-caeruela.jpg', slips: ['lachenalia purpureo-caeruela'] })).toBe(true); // a hyphen and a slip, asked
  });
  it('the floor is five letters, and two letters apart is another name (S-C13: the floor, the gap, a shared start)', () => {
    expect(slip('jutae', 'juttae')).toBe(true);
    expect(slip('vira', 'vera')).toBe(false);
    expect(shows('Aloe vera', 'File:Aloe vira.jpg')).toBe(false);
    expect(slip('glomeratula', 'glomerata')).toBe(false);
    expect(shows('Gasteria glomerata', 'File:Gasteria glomeratula.jpg')).toBe(false);
    expect(slip('perfoliata', 'perforata')).toBe(false);
    expect(shows('Crassula perforata', 'File:Crassula perfoliata 4.jpg')).toBe(false);
    expect(slip('dodantrale', 'dodrantale')).toBe(true);
    expect(slip('abcdefghij', 'acdefbghij')).toBe(false); // a letter moved more than three places is not a slip
  });
});

describe('C1, older names below species: only the whole name is the species\' (S-C6)', () => {
  it('"Babiana stricta" on Babiana purpurea is another species; "Babiana stricta var. purpurea" is the species', () => {
    const syn = ['Gladiolus purpureus Jacq.', 'Ixia purpurea (Jacq.) Redouté', 'Babiana stricta var. purpurea (Jacq.) Ker Gawl.'];
    expect(shows('Babiana purpurea', 'File:Babiana stricta 1.jpg', syn)).toBe(false);
    expect(shows('Babiana purpurea', 'File:Babiana stricta var. purpurea.jpg', syn)).toBe(true); // guard
    expect(shows('Babiana purpurea', 'File:Babiana stricta v. purpurea 2.jpg', syn)).toBe(true);
    expect(shows('Haworthia monticola', 'File:Haworthia chloracantha 2.jpg', ['Haworthia chloracantha var. monticola (Fourc.) Halda'])).toBe(false);
  });
});

describe('C1, kinds: by title as well as by category', () => {
  it('"hybrid" in a title hides the file, as /about/how says (S-C4)', () => {
    expect(shows('Nepenthes rhombicaulis', 'File:Nepenthes rhombicaulis hybrid.jpg')).toBe(false);
  });
  it('a printed illustration, by its title and by its category (IND-1)', async () => {
    expect(shows('Agave polyacantha', 'File:PSM V43 D812 Agave engelmanni.jpg', ['Agave engelmannii Trel.'])).toBe(false);
    expect(await takes('Agave polyacantha', 'File:Agave polyacantha 7.jpg', 'Popular Science Monthly illustrations/Volume 43')).toBe(false);
  });
  it('the Smithsonian\'s sheets, by title and by category (S-C3)', async () => {
    expect(shows('Cyphostemma camerounense', 'File:Cyphostemma camerounense-NMNH-01150553.jpg')).toBe(false);
    expect(shows('Zanha golungensis', 'File:Zanha golungensis-NMNH-14824184.jpg')).toBe(false);
    expect(await takes('Zanha golungensis', 'File:Zanha golungensis 2.jpg', 'Plants in the National Museum of Natural History, USA')).toBe(false);
  });
  it('a stored file\'s kept categories are read as a new answer\'s: the stamp, the plate and the unidentified plants (S-C2)', () => {
    expect(shows('Colchicum macedonicum', { title: 'File:Colchicum macedonicum.jpg', width: 189, categories: ['Plants on stamps of North Macedonia', 'Stamps of North Macedonia, 2003'] }, ['Colchicum pieperanum Markgr.'])).toBe(false);
    expect(shows('Cyphostemma adenopodum', { title: 'File:Cissus adenopodus 135-8278.jpg', categories: ["Curtis's Botanical Magazine, Volume 135"] }, ['Cissus adenopoda Sprague'])).toBe(false);
    expect(shows('Colchicum raddeanum', { title: 'File:Plants of Artavaz 016.jpg', categories: ['Unidentified Liliales in Armenia'] })).toBe(false);
    expect(shows('Adenia subsessilifolia', { title: 'File:Adenia subsessilifolia - Palmengarten Frankfurt - DSC01662.JPG', categories: ['Unidentified Euphorbia'] })).toBe(false);
    expect(shows('Cyphostemma adenopodum', { title: 'File:Cyphostemma adenopodum kz1.jpg', categories: ['Cyphostemma adenopodum', 'Pages with maps'] })).toBe(true); // guard
  });
  it('the kinds a mutation of round sixty-nine\'s rules left untested (S-C13; guard: each kills a mutant, and passes on the base)', async () => {
    for (const t of ['File:Agave americana plate 12.jpg', 'File:Crassula sp. Kew.jpg', 'File:Manfreda aff jaliscana.jpg', 'File:Aloe vera map.jpg', 'File:Aloe vera label.jpg', 'File:Gymnocalycium basiatrum 1.png']) expect(commonsKind(t, { scientific: 'Aloe vera' }), t).not.toBeNull();
    for (const c of ['Preserved specimens of Aloe', 'Type specimens of Aloe', 'Hybrids of Aloe', 'Illustrations of Aloe']) expect(await takes('Aloe vera', 'File:Aloe vera 9.jpg', c), c).toBe(false);
  });
});

describe('C1, group and non-plant files', () => {
  // Commons' categories of the file (2026-10-12).
  const LIBEREC = 'Parodia microsperma|Parodia maassii|Parodia comarapana|Parodia ritteri|Parodia hausteiniana|Taken with Canon EOS 400D|Botanical Garden Liberec|Self-published work|PD-self|Files with coordinates missing SDC location of creation|Parodia lecoriensis';
  it('a file Commons files under two or more species is shown on neither ("Parodia Liberec 1"; S-C3)', async () => {
    const cats = LIBEREC.split('|');
    expect(shows('Parodia ritteri', { title: 'File:Parodia Liberec 1.jpg', categories: cats }, ['Parodia camargensis Buining & F.Ritter'])).toBe(false);
    expect(shows('Parodia comarapana', { title: 'File:Parodia Liberec 1.jpg', categories: cats })).toBe(false);
    expect(await takes('Parodia hausteiniana', 'File:Parodia Liberec 1.jpg', LIBEREC)).toBe(false);
    expect(shows('Parodia ritteri', { title: 'File:Parodia 3.jpg', categories: ['Parodia ritteri', 'Parodia maassii'] })).toBe(false); // the species and one other: two
  });
  it('one species under two of its own names, or two names the reference files under one species, is no group (guard)', () => {
    expect(shows('Parodia ritteri', { title: 'File:Parodia ritteri pm.JPG', categories: ['Parodia ritteri', 'Parodia camargensis', 'Cacti in Liberec'] }, ['Parodia camargensis Buining & F.Ritter'])).toBe(true);
    expect(shows('Parodia ritteri', { title: 'File:Parodia ritteri pm.JPG', categories: ['Parodia ritteri', 'Parodia camargensis'] }, ['Parodia camargensis Buining & F.Ritter'], null)).toBe(true);
    expect(shows('Parodia hausteiniana', { title: 'File:Parodia hausteiniana 2.jpg', categories: ['Parodia hausteiniana', 'Bolivicactus hausteinianus', 'Flowering plants'] })).toBe(true);
  });
  it('an animal on the plant, by title and by category (S-C3)', async () => {
    const syn = ['Centaurea americana Nutt.'];
    expect(shows('Plectocephalus americanus', 'File:Leaf-footed Bug nymphs (Coreidae, Leptoglossus) on Centaurea americana (27334442305).jpg', syn)).toBe(false);
    expect(await takes('Plectocephalus americanus', 'File:Leptoglossus 5.jpg', 'Leptoglossus|Insects on flowers', '', syn)).toBe(false);
    // Round 70b: a flower with an insect on it is the plant where the title names the species.
    expect(await takes('Plectocephalus americanus', 'File:Centaurea americana 5.jpg', 'Leptoglossus|Insects on flowers', '', syn)).toBe(true);
  });
  it('a file whose description strikes out the name, on a new answer and stored (S-C3)', async () => {
    const syn = ['Centaurea nuttallii Spreng.'];
    expect(await takes('Plectocephalus americanus', 'File:Centaurea nutallii.jpg', '', '<i>Centaurea</i> sp. <s><i>C. nuttallii</i></s>', syn)).toBe(false);
    expect(shows('Plectocephalus americanus', { title: 'File:Centaurea nutallii.jpg', struck: true }, syn)).toBe(false);
    expect(shows('Plectocephalus americanus', { title: 'File:Centaurea nutallii.jpg', slips: ['centaurea nutallii'] }, syn)).toBe(true); // guard: a slip of an older name, the reference holding no such name, asked
  });
});

describe('C1, what a museum file shows decides', () => {
  it('a garden\'s "Specimens in …" category is living plants (S-C10)', async () => {
    expect(await takes('Cyphostemma juttae', 'File:Cyphostemma juttae - Lyman Plant House, Smith College - DSC04321.JPG', 'Specimens in the Lyman Plant House|Cyphostemma juttae')).toBe(true);
    expect(await takes('Crassula streyi', 'File:Crassula streyi 1.jpg', 'Plant specimens at Lotusland')).toBe(true);
    expect(await takes('Gasteria glomerata', 'File:Gasteria glomerata 2.jpg', 'Herbarium specimens of Gasteria')).toBe(false); // guard
  });
  it('the Auckland Museum\'s photographs of fresh cut stems on card are shown: a fresh plant, not a mounted sheet (guard; IND, S-C3)', () => {
    expect(read('Ceropegia radicans', ['File:Ceropegia radicans smithii Schltr. (AM AK289462-1).jpg', 'File:Ceropegia radicans radicans Schltr. (AM AK289461-2).jpg'])).toHaveLength(2);
  });
});

describe('C1, the misreadings queued from round sixty-nine', () => {
  const SHOWN: Array<[string, string, string[]?]> = [
    ['Wollemia nobilis', 'File:Wollemia cones.JPG'],
    ['Lithops aucampiae', 'File:Lithops before Repotting - Dec. 2008 - (7).jpg'],
    ['Lithops aucampiae', 'File:Lithops germination 2.jpg'], // an English word with a Latin ending is no epithet
    ['Drosera acaulis', 'File:Drosera growing in Cedarberg, South Africa.jpg'],
    ['Ceropegia intermedia', 'File:Ceropegia trap2.jpg'],
    ['Hibiscus acetosella', 'File:Cranberry hibiscus budding.jpg'],
    ['Hibiscus acetosella', 'File:Cranberry hibiscus full bloom.jpg'],
    ['Sinningia leucotricha', 'File:Sinningia leucotricha-caudex 02.JPG'],
    ['Aeonium gomerense', 'File:Aeonium gomerense-anna park-yercaud-salem-India.JPG'],
    ['Colchicum serpentinum', 'File:Colchicum serpentinum-ku.jpg'],
    ['Titanopsis hugo-schlechteri', 'File:Titanopsis hugo schlechterii 6.jpg'],
    ['Nepenthes argentii', 'File:Nepenthes argentii cultivated specimen.jpg'],
    ['Lithops pseudotruncatella', 'File:Lithops specimens - University of California Botanical Garden - DSC08858.JPG'],
    ['Plectocephalus americanus', 'File:Centaurea americanabud.jpg', ['Centaurea americana Nutt.']],
    ['Tecomanthe speciosa', 'File:Tecomanthe Speciosa Seed Pod.jpg']
  ];
  for (const [sp, title, syn] of SHOWN) it(`shows ${title} under ${sp}`, () => expect(shows(sp, title, syn ?? [])).toBe(true));
  const LEFT: Array<[string, string, string[]?]> = [
    // "branca" is Galician for white, and reads as an epithet of Azalea, an older name's genus: the title does not name the species (rule 3).
    ['Rhododendron mucronatum', 'File:Azalea branca en Oleiros.jpg', ['Azalea alba Sweet', 'Azalea mucronata Blume']],
    ['Crassula alcicornis', 'File:Crassula alcicornis specimen.jpg'],
    ['Ceropegia discoidea', 'File:Ceropegia discoidea specimen.jpg'],
    ['Tecomanthe speciosa', 'File:Tecomanthe speciosa seeds.jpg'],
    ['Crassula socialis', 'File:Crassula socialis pressed specimen, Kew Gardens.jpg']
  ];
  for (const [sp, title, syn] of LEFT) it(`leaves out ${title} under ${sp} (guard)`, () => expect(shows(sp, title, syn ?? [])).toBe(false));
});

describe('C4: shownPhotos itself drops what the page drops, so the index counts what the page shows (S-C9, S-F4)', () => {
  const inat = (id: string) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: '(c) A, some rights reserved (CC BY)' });
  const viaGbif = (id: string) => ({ src: 'gbif', id: `4522657370:${id}`, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/original.jpg`, thumb: `https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/4522657370/media/${id}`, licence: 'by', attribution: 'A, CC BY, via GBIF' });
  it('Pachyphytum viride\'s three iNaturalist photographs, stored again from GBIF\'s media, count three, not six', () => {
    const photos = ['350433688', '350433558', '350433768'].flatMap((id) => [inat(id), viaGbif(id)]);
    expect(shownPhotos(photos, { scientific: 'Pachyphytum viride' })).toHaveLength(3);
  });
  it('a photograph whose address is not a web address is not counted', () => {
    expect(shownPhotos([inat('1'), { ...inat('2'), url: 'data:image/png;base64,AAAA' }, { ...inat('3'), thumb: '/x.jpg' }], { scientific: 'Aloe vera' })).toHaveLength(1);
  });
  it('the index\'s count of a stored dossier is the page\'s (Albuca paradoxa: 8 shown, 16 in the index)', () => {
    const photos = ['1', '2', '3', '4', '5', '6', '7', '8'].flatMap((id) => [inat(id), viaGbif(id)]);
    const d = { key: gbifPage(2772506), name: { scientific: 'Albuca paradoxa', synonyms: ['Ornithogalum dividens'], vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos };
    expect(shownPhotos(d.photos, { scientific: d.name.scientific, synonyms: d.name.synonyms })).toHaveLength(safeUrls(d as never).photos.length);
    expect(safeUrls(d as never).photos).toHaveLength(8);
  });
});

describe('C5: among files of one rank, a lead at least 500 pixels wide (S-C12)', () => {
  it('Nepenthes spectabilis leads with its 512-pixel file, not the 256', () => {
    const ps = [['File:Nepenthes spectabilis1.jpg', 256], ['File:Nepenthes spectabilis2.jpg', 480], ['File:Nepenthes spectabilis3.jpg', 512], ['File:Nepenthes spectabilis 1.JPG', 1200]].map(([t, w]) => photo({ title: t as string, width: w as number }));
    expect(leadOf(ps, { scientific: 'Nepenthes spectabilis' })?.id).toBe('File:Nepenthes spectabilis3.jpg');
  });
  it('Mammillaria laui leads with a 4,000-pixel file, not the 480', () => {
    const ps = [['File:Mamillaria laui (M. lauii) (3779412974).jpg', 480], ['File:Mammillaria laui 01.JPG', 4000], ['File:Mammillaria laui.jpg', 3367]].map(([t, w]) => photo({ title: t as string, width: w as number }));
    expect(leadOf(ps, { scientific: 'Mammillaria laui' })?.id).toBe('File:Mammillaria laui 01.JPG');
  });
  it('a file whose width was not kept is not set back, and the title\'s epithet still ranks first (guards)', () => {
    const a = { ...photo({ title: 'File:Aloe vera 1.jpg' }), width: undefined };
    expect(leadOf([a, photo({ title: 'File:Aloe vera 2.jpg' })], { scientific: 'Aloe vera' })?.id).toBe('File:Aloe vera 1.jpg');
    // A landscape 300-pixel file (round eighty-two passes over an upright lead where one that is not is there; this
    // fixture's 2,000-pixel height had made it upright).
    // Round eighty-four (E; the merge): a lead is never under 640 pixels on its long side where a larger one exists
    // (`HERO_MIN_PX`), so the titled file leads at 900 by 600, and a 300 by 200 one yields to the larger file.
    expect(leadOf([photo({ title: 'File:DSC_0001.jpg', width: 4000 }), { ...photo({ title: 'File:Aloe vera 3.jpg', width: 900 }), height: 600 }], { scientific: 'Aloe vera' })?.id).toBe('File:Aloe vera 3.jpg');
    expect(leadOf([photo({ title: 'File:DSC_0001.jpg', width: 4000 }), { ...photo({ title: 'File:Aloe vera 3.jpg', width: 300 }), height: 200 }], { scientific: 'Aloe vera' })?.id).toBe('File:DSC_0001.jpg');
  });
});
