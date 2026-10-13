/**
 * Round 70b: the owner's `--fill commons-kind` (2026-10-13) left out 140 of 4,446 Commons photographs, many wrongly.
 * Every case is a line of that run, with the file's categories as Commons gave them on 2026-10-13 and the names the live
 * index holds. Each case FAILED on `m70` (the round-seventy merge) unless it says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, shownPhotos, type HeldNames } from '$dossier/photo-kind';
import { spellingKey } from '$dossier/epithet';

const INDEX = [
  { key: 10754356, name: 'Aztekonia hintonii', syn: ['Aztekium hintonii'] },
  { key: 3944658, name: 'Epithelantha spinosior', syn: ['Mammillaria micromeris var. unguispina', 'Epithelantha micromeris subsp. unguispina', 'Epithelantha micromeris var. unguispina', 'Epithelantha unguispina'] },
  { key: 8013485, name: 'Epithelantha micromeris', syn: ['Cactus micromeris'] },
  { key: 7329164, name: 'Lithops schwantesii', syn: ['Lithops dinteri var. marthae'], older: ['Lithops marthae'] },
  { key: 3035891, name: 'Polyscias balfouriana', syn: ['Aralia balfouriana', 'Panax balfourii'] },
  { key: 3035778, name: 'Polyscias scutellaria', syn: ['Aralia cochleata'] },
  { key: 4053092, name: 'Cyphostemma adenopodum', syn: ['Cissus adenopoda'] },
  { key: 2779618, name: 'Haworthia magnifica' },
  { key: 2780316, name: 'Haworthia blackburniae' },
  { key: 2780001, name: 'Haworthia wittebergensis' },
  { key: 2779601, name: 'Haworthia retusa' },
  { key: 2779602, name: 'Haworthia cooperi' },
  { key: 3947849, name: 'Parodia ritteri', syn: ['Parodia camargensis'] },
  { key: 7281971, name: 'Parodia comarapana' },
  { key: 3949766, name: 'Parodia hausteiniana' },
  { key: 7281638, name: 'Parodia maassii' },
  { key: 10911827, name: 'Kroenleinia grusonii', syn: ['Echinocactus grusonii'], older: ['Ferocactus grusonii'] },
  { key: 2777724, name: 'Aloe vera' },
  { key: 5421082, name: 'Franklinia alatamaha', syn: ['Gordonia alatamaha'] },
  { key: 5384245, name: 'Melocactus broadwayi', syn: ['Cactus broadwayi'] },
  { key: 7280974, name: 'Melocactus conoideus' },
  { key: 2768242, name: 'Dipcadi erythraeum' },
  { key: 7658604, name: 'Uncarina grandidieri' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));
const SYN = new Map(INDEX.map((e) => [e.name, [...(e.syn ?? []), ...(e.older ?? [])]]));

const photo = (title: string, categories: string[], extra: Record<string, unknown> = {}) => ({ src: 'commons', id: title, url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/960px-${encodeURIComponent(title)}`, thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/500px-x.jpg', width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', categories, ...extra });
const read = (scientific: string, photos: unknown[], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms: SYN.get(scientific) ?? [], vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos } as never, held).photos.map((p) => p.id);
const shows = (scientific: string, title: string, cats: string) => read(scientific, [photo(title, cats.split('|'))]).length === 1;

describe('"Media from GBIF" says where a file came from, not what it shows', () => {
  it('living plants Commons imported from GBIF are shown', () => {
    expect(shows('Melocactus paucispinus', 'File:Melocactus paucispinus 1.jpg', 'Melocactus paucispinus|Media from GBIF')).toBe(true);
    expect(shows('Haemanthus graniticus', 'File:Granite bloodlily (Haemanthus graniticus) 3.jpg', 'Haemanthus graniticus|Media from GBIF')).toBe(true);
    expect(shows('Strombocactus corregidorae', 'File:Chichimecactus corregidorae 1.jpeg', 'Media from iNaturalist|INaturalist images reviewed by iNaturalistReviewBot|Media from GBIF|Media uploaded with inat2wiki|Chichimecactus corregidorae|Strombocactus corregidorae')).toBe(true);
  });
  it('a Commons copy of an iNaturalist photograph the dossier holds is counted once', () => {
    const inat = { src: 'inat', id: '328057104', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/328057104/large.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/328057104/medium.jpg', licence: 'by', attribution: '(c) A, some rights reserved (CC BY)' };
    const copy = photo('File:Agave multifilifera 328057104.jpg', ['Agave multifilifera', 'Media from iNaturalist', 'Uploaded with iNaturalist2Commons', 'Media from GBIF']);
    expect(shownPhotos([inat, copy] as never[], { scientific: 'Agave multifilifera' })).toHaveLength(1);
    expect(read('Agave multifilifera', [copy])).toEqual(['File:Agave multifilifera 328057104.jpg']); // alone, it is shown
    expect(shownPhotos([inat, photo('File:Haworthia (5511309933).jpg', [])] as never[], { scientific: 'Haworthia magnifica' })).toHaveLength(2); // guard: a Flickr number in brackets is not read
  });
});

describe('the group rule counts species of the reference, through the species\' own names', () => {
  it('two names of one plant, a variety of the species, or a plant beside it where the title names the species, are no group', () => {
    expect(shows('Aztekonia hintonii', 'File:Aztekium hintonii 5.jpg', 'Aztekium hintonii|Media from iNaturalist|Selaginella gypsophila|Uploaded with iNaturalist2Commons')).toBe(true);
    expect(shows('Cyphostemma adenopodum', 'File:Cyphostemma adenopodum bonsai.jpg', 'Taken with Canon PowerShot SX50 HS|CC-Zero|National M. M. Hryshko botanical garden|Self-published work|Cyphostemma adenopodum|Cyphostemma bonsai')).toBe(true);
    expect(shows('Epithelantha spinosior', 'File:Epithelantha micromeris unguispina L1022 (8988733971).jpg', 'Epithelantha micromeris|Taken with Olympus E-PL2|Flickr images reviewed by FlickreviewR|Epithelantha spinosior|Files from Dornenwolf Flickr stream')).toBe(true);
    expect(shows('Lithops schwantesii', 'File:Lithops schwantesii subsp. schwantesii var. marthae S-0291-602.jpg', 'Lithops schwantesii subsp. schwantesii var. marthae|Lithops marthae')).toBe(true);
    expect(shows('Polyscias balfouriana', 'File:Dinnerplate Aralia (Polyscias balfouriana) 1.jpg', 'Polyscias pinnata|Polyscias balfouriana|Self-published work')).toBe(true);
  });
  it('the true groups stay out (guards)', () => {
    const liberec = 'Parodia microsperma|Parodia maassii|Parodia comarapana|Parodia ritteri|Parodia hausteiniana|Botanical Garden Liberec|Parodia lecoriensis';
    expect(shows('Parodia ritteri', 'File:Parodia Liberec 1.jpg', liberec)).toBe(false);
    expect(shows('Haworthia magnifica', 'File:Haworthia (5511309933).jpg', 'Haworthia angustifolia|Haworthia cooperi|Haworthia retusa|Haworthia magnifica|Haworthia sessiliflora|Haworthiopsis coarctata|Groups of Haworthia')).toBe(false);
    expect(shows('Haworthia wittebergensis', 'File:Haworthias blackburniae y wittebergensis.jpg', 'Haworthia blackburniae|Haworthia wittebergensis')).toBe(false);
    expect(shows('Agave parrasana', 'File:Agave20140104 073.jpg', 'Agave parrasana|Agave potatorum|Agave victoriae-reginae|Agave polianthiflora')).toBe(false);
  });
});

describe('an animal\'s category hides a file only when its title does not name the species', () => {
  it('a flower with an insect on it, named, is the plant', () => {
    expect(shows('Ixora casei', 'File:Butterfly on Ixora casei 01.jpg', 'Ixora casei|Self-published work|Unidentified Papilionidae|Papilionidae on Ixora flowers')).toBe(true);
    expect(shows('Franklinia alatamaha', 'File:Franklin Tree Franklinia alatamaha Flower 3008px.JPG', 'Franklinia alatamaha|Unidentified Formicidae|Specimens in Tyler Arboretum|Formicidae on flowers|Hymenoptera on Ericales flowers')).toBe(true);
    expect(shows('Nepenthes inermis', 'File:Nepenthes inermis6.jpg', 'Nepenthes inermis|Unidentified Lepidoptera')).toBe(true);
    expect(shows('Sparaxis pillansii', 'File:Sparaxis pillansii 1DS-II 2-2448.jpg', 'Sparaxis pillansii|Diptera on Asparagales flowers')).toBe(true);
  });
  it('a bird, an ant and a diorama whose titles do not name the species stay out (guards)', () => {
    expect(shows('Melocactus broadwayi', 'File:Brown Booby (Sula leucogaster) with chick, Tobago (4089458289).jpg', 'Sula leucogaster|Melocactus broadwayi|Birds of Tobago')).toBe(false);
    expect(shows('Melocactus conoideus', 'File:Mimercoria.jpg', 'Melocactus conoideus|Unidentified Formicidae')).toBe(false);
    expect(shows('Dipcadi erythraeum', 'File:Arabian beach habitat diorama by Sebastian Brandt (Reco-Brandt) and Zsombor Puenkoesti.jpg', 'Insects|Dipcadi erythraeum|Dioramas')).toBe(false);
  });
});

describe('"Unidentified" is read only of a plant', () => {
  it('"Unidentified year in Donetsk" is not about the plant: Andrew Butko\'s Kroenleinia grusonii is shown', () => {
    expect(shows('Kroenleinia grusonii', 'File:Ab plant 1310.jpg', 'Kroenleinia grusonii|Photos of plants, created by Andrew Butko|Cactaceae in Donetsk|Unidentified year in Donetsk (XXI century)|Potted plants in Donetsk')).toBe(true);
  });
  it('an unidentified plant, a plant genus or a plant group still hides a file (guards)', () => {
    expect(shows('Kroenleinia grusonii', 'File:2010 Cactualdea, La Aldea de San Nicolas, Gran Canaria, Spain (9).jpg', 'Kroenleinia grusonii|Cactualdea|Unidentified Aloe')).toBe(false);
    expect(shows('Uncarina grandidieri', 'File:Gardenology.org-IMG 1259 bbg09.jpg', 'Uncarina grandidieri|Unidentified plants in the Brooklyn Botanic Garden')).toBe(false);
    expect(shows('Colchicum raddeanum', 'File:Plants of Artavaz 016.jpg', 'Colchicum raddeanum|Unidentified Liliales in Armenia')).toBe(false);
  });
});

describe('spellingKey: a genitive in -ai is one name with -ae (agent A\'s case)', () => {
  it('kanehirae and kanehirai', () => {
    expect(spellingKey('kanehirai')).toBe(spellingKey('kanehirae'));
  });
});
