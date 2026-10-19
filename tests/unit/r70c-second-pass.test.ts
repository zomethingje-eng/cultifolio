/**
 * Round seventy, second pass: REVIEW-TRIAGE-69 C6 and C7 (the second outside review, R47-2, R47-3, R47-9, R47-10), and
 * the -er/-era spellings in `spellingKey` (agent A's finding). Names, titles and credits are the live site's and
 * Commons' as read on 2026-10-12. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, leadOf, type HeldNames } from '$dossier/photo-kind';
import { heroOf } from '$dossier/dedupe';
import { photoAt } from '$dossier/photo-size';
import * as size from '$dossier/photo-size';
import { commonsAuthor } from '$dossier/photo-credit';
import { spellingKey } from '$dossier/epithet';
import { gbifPage } from '../../src/lib/core/page-id';

const INDEX = [
  { key: gbifPage(3170241), name: 'Asclepias curassavica', syn: ['Asclepias aurantiaca'], older: ['Asclepias margaritacea', 'Asclepias syriaca'] },
  { key: gbifPage(3170247), name: 'Asclepias syriaca', syn: ['Asclepias cornuti'] },
  { key: gbifPage(2777724), name: 'Aloe vera', syn: ['Aloe barbadensis'], older: ['Aloe maculata', 'Aloe vulgaris'] },
  { key: gbifPage(2777430), name: 'Aloe maculata', syn: ['Aloe picta subsp. major'] },
  { key: gbifPage(5829525), name: 'Pachypodium windsorii', syn: ['Pachypodium baronii var. windsorii'] },
  { key: gbifPage(5535507), name: 'Pachypodium baronii', syn: ['Pachypodium baronii var. erythreum'] },
  { key: gbifPage(3702051), name: 'Nepenthes dubia', syn: ['Nepenthes tenuis'] },
  { key: gbifPage(10896199), name: 'Nepenthes sumagaya', syn: ['Nepenthes amabilis'] },
  { key: gbifPage(3702095), name: 'Nepenthes aristolochioides' },
  { key: gbifPage(3702163), name: 'Nepenthes rajah' },
  { key: gbifPage(3943031), name: 'Eriosyce villosa', older: ['Neoporteria villosa'] },
  { key: gbifPage(10705370), name: 'Eriosyce spinosior', syn: ['Chilenia fobeana'] },
  { key: gbifPage(2771040), name: 'Hesperaloe chiangii', syn: ['Hesperaloe funifera subsp. chiangii'] },
  { key: gbifPage(2775604), name: 'Yucca carnerosana', syn: ['Samuela carnerosana'] },
  { key: gbifPage(9485745), name: 'Aloidendron dichotomum', syn: ['Aloe dichotoma'] },
  { key: gbifPage(4054801), name: 'Cyphostemma juttae', syn: ['Cissus juttae'] },
  { key: gbifPage(4198251), name: 'Dudleya pachyphytum' },
  { key: gbifPage(4198252), name: 'Pachyphytum oviferum' },
  { key: gbifPage(2766653), name: 'Agave cocui' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));

type Stored = { title: string; attribution?: string; licence?: string; width?: number; url?: string; thumb?: string; categories?: string[] };
const C = 'https://upload.wikimedia.org/wikipedia/commons';
const photo = (x: Stored) => ({ src: 'commons', id: x.title, url: x.url ?? `${C}/thumb/a/ab/x.jpg/960px-${encodeURIComponent(x.title)}`, thumb: x.thumb ?? `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: x.width ?? 3000, height: 2000, licence: x.licence ?? 'by-sa', attribution: x.attribution ?? 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', ...(x.categories ? { categories: x.categories } : {}) });
const read = (scientific: string, files: Array<string | Stored>, synonyms: string[] = [], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: files.map((f) => photo(typeof f === 'string' ? { title: f } : f)) } as never, held).photos;
const shows = (scientific: string, f: string | Stored, synonyms: string[] = [], held: HeldNames | null = HELD) => read(scientific, [f], synonyms, held).length === 1;

describe('C6: an older name is the species\' own only where no species of the reference holds it as accepted (R47-2)', () => {
  it('Asclepias curassavica does not take "Asclepias syriaca", nor Aloe vera "Aloe maculata"', () => {
    expect(shows('Asclepias curassavica', 'File:Asclepias syriaca 1.jpg', ['Asclepias syriaca L.'])).toBe(false);
    expect(shows('Aloe vera', 'File:Aloe maculata 2.jpg', ['Aloe maculata All.'])).toBe(false);
    expect(shows('Aloe vera', 'File:Aloe barbadensis 3.jpg', ['Aloe barbadensis Mill.'])).toBe(true); // guard: an older name no species holds as accepted
  });
  it('an older name below species counts only with its infraspecific epithet: Pachypodium windsorii', () => {
    const syn = ['Pachypodium baronii var. windsorii (Poiss.) Pichon'];
    expect(read('Pachypodium windsorii', ['File:Pachypodium baronii - Tower Hill Botanic Garden.JPG', 'File:Phylogeny-of-the-plant-genus-Pachypodium-(Apocynaceae)-peerj-01-70-g001.jpg'], syn)).toEqual([]);
    expect(shows('Pachypodium windsorii', 'File:Pachypodium baronii var. windsorii 1.jpg', syn)).toBe(true); // guard
  });
  it('GBIF\'s older names no species of the reference holds are the species\' own: Nepenthes tenuis on N. dubia, N. amabilis on N. sumagaya (guard: C6 with B7, against R47\'s reading)', () => {
    expect(shows('Nepenthes dubia', 'File:Nepenthes tenuis1.jpg', ['Nepenthes tenuis Nerz & Wistuba'])).toBe(true);
    expect(shows('Nepenthes sumagaya', 'File:Nepenthes amabilis upper pitcher.jpg', ['Nepenthes amabilis Wistuba, Gronem., Micheler, Marwinski, Gieray, Coritico & V.B.Amoroso'])).toBe(true);
  });
  it('epithetRank reads a joined name: "Nepenthesdubia1" leads before a file under the older name', () => {
    const ps = ['File:Nepenthes tenuis1.jpg', 'File:Nepenthesdubia1.jpg'].map((t) => photo({ title: t }));
    expect(leadOf(ps, { scientific: 'Nepenthes dubia', synonyms: ['Nepenthes tenuis Nerz & Wistuba'], key: gbifPage(3702051), held: HELD })?.id).toBe('File:Nepenthesdubia1.jpg');
  });
});

describe('C7: more kinds (R47-3)', () => {
  it('a credit naming a lithographer or a draughtsman is a plate, and a post office a stamp, before any category is kept', () => {
    expect(shows('Cyphostemma adenopodum', { title: 'File:Cissus adenopodus 135-8278.jpg', licence: 'pd', attribution: 'M.S. del., J.N.Fitch lith., Public domain, via Wikimedia Commons' }, ['Cissus adenopoda Sprague'])).toBe(false);
    expect(shows('Colchicum macedonicum', { title: 'File:Colchicum macedonicum.jpg', licence: 'pd', width: 189, attribution: 'Македонская почта, Public domain, via Wikimedia Commons' })).toBe(false);
  });
  it('a year before 1900 in a title is a printed work with other print evidence; a camera\'s, a catalogue\'s or a collector\'s number is not', () => {
    // Round 71 (S-C8): a year marks a printed work only with other print evidence: a licence for old works, a category of scans, a plate's words.
    expect(shows('Dasylirion graminifolium', { title: 'File:Dasylirion graminifolium Zuccarini 1843.jpg', attribution: 'Joseph Gerhard Zuccarini, PD-old-100, via Wikimedia Commons', licence: 'pd' }, ['Yucca graminifolia Zucc.'])).toBe(false);
    expect(shows('Nepenthes bongso', { title: 'File:Nepenthes bongso Korthals 1839.JPG', categories: ['Nepenthes bongso', 'Scans of Korthals 1839'] })).toBe(false);
    expect(shows('Nepenthes bongso', 'File:Nepenthes bongso Korthals 1839 pl. 3.JPG')).toBe(false);
    expect(shows('Nepenthes bongso', 'File:Nepenthes bongso Korthals 1839.JPG')).toBe(true); // a year alone: round 71
    for (const t of ['File:Gymnocalycium victorii VG 1815.jpg', 'File:Gymnocalycium victorii VoS1791 30439.JPG', 'File:Gymnocalycium victorii IMG 1834.jpg', 'File:Gymnocalycium victorii (5729340449).jpg']) expect(shows('Gymnocalycium victorii', t), t).toBe(true); // guards
  });
  it('an abbreviated genus with no full stop, "N rajah", where the reference holds the epithet', () => {
    expect(shows('Nepenthes aristolochioides', 'File:2005-12-18 N rajah 034.jpg')).toBe(false);
    expect(shows('Agave cocui', 'File:A pair of Agave cocui.jpg')).toBe(true); // guard
  });
  it('a bracketed genus, "Neoporteria(eriosyce) villosa", on Eriosyce spinosior', () => {
    expect(shows('Eriosyce spinosior', 'File:Neoporteria(eriosyce) villosa 2.JPG', ['Chilenia fobeana (Mieckley) Backeb.'])).toBe(false);
  });
  it('another genus of the reference in a title: Yucca on Hesperaloe chiangii, Aloe on Cyphostemma juttae', () => {
    expect(shows('Hesperaloe chiangii', 'File:Hesperaloe (Agavaceae) Hesperaloe chiangii fh 0641, Yucca carnerosana fh 0682 MEX A.jpg', ['Hesperaloe funifera subsp. chiangii (G.D.Starr) G.D.Starr'])).toBe(false);
    expect(shows('Cyphostemma juttae', 'File:Aloe Dichotoma & Cyphostemma Juttae, Huntington.jpg', ['Cissus juttae Dinter & Gilg'])).toBe(false);
    expect(shows('Dudleya pachyphytum', 'File:Pachyphytum 120221.jpg')).toBe(true); // guard: the species named by its epithet
  });
});

describe('C7: a Commons original is not loaded whole into a smaller slot (R47-9)', () => {
  const ORIG = `${C}/4/45/Ceropegia_stapelliformis.jpg`;
  it('a stored original of 400 pixels gets the 250 as its tile, so a row asks for the 120', () => {
    const [p] = read('Ceropegia stapeliiformis', [{ title: 'File:Ceropegia stapeliiformis.jpg', url: ORIG, thumb: ORIG, width: 400, licence: 'pd', attribution: 'MidgleyDJ, Public domain, via Wikimedia Commons' }]);
    expect(p.thumb).toBe(`${C}/thumb/4/45/Ceropegia_stapelliformis.jpg/250px-Ceropegia_stapelliformis.jpg`);
    expect(photoAt(p.thumb, 'square')).toBe(`${C}/thumb/4/45/Ceropegia_stapelliformis.jpg/120px-Ceropegia_stapelliformis.jpg`);
  });
  it('the lead\'s phone source of a 700-pixel original is Commons\' 500, and the 960 slot takes the original (photoOf)', () => {
    expect(size.photoOf({ url: ORIG, thumb: ORIG, width: 700 }, 'medium')).toBe(`${C}/thumb/4/45/Ceropegia_stapelliformis.jpg/500px-Ceropegia_stapelliformis.jpg`);
    expect(size.photoOf({ url: ORIG, thumb: ORIG, width: 700 }, 'large')).toBe(ORIG);
    expect(size.commonsTileOf(ORIG, 100)).toBe(ORIG); // guard: no larger than any slot
    expect(size.commonsTileOf(ORIG, null)).toBe(ORIG); // guard: Commons refuses a width larger than the file, so none is guessed
  });
});

describe('C7: GBIF media of a preserved specimen ranks below Commons (R47-10)', () => {
  const commons = photo({ title: 'File:Adenia goetzei 42247.JPG' });
  it('Meise\'s and the Smithsonian\'s sheets do not lead over a Commons photograph', () => {
    const sheet = { src: 'gbif', id: '1839471249:0', url: 'https://oxalis.br.fgov.be/images/BR0/000/006/872/991/BR0000006872991.jpg', thumb: 'https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/1839471249/media/ab', licence: 'by', attribution: 'Meise Botanic Garden, CC BY, via GBIF' };
    expect(heroOf([sheet, commons])?.src).toBe('commons');
    expect(heroOf([{ ...sheet, url: 'https://collections.nmnh.si.edu/media/?i=10348276&h=2000' }, commons])?.src).toBe('commons');
    expect(heroOf([{ ...sheet, url: 'https://example.org/a.jpg', specimen: true }, commons])?.src).toBe('commons');
    expect(heroOf([{ ...sheet, url: 'https://bs.plantnet.org/image/o/6b88' }, commons])?.src).toBe('gbif'); // guard: an observation's photograph
  });
});

describe('C7: credits (R47-10)', () => {
  it('"(talk)" before a signature\'s time, and "Photograph by:"', () => {
    expect(commonsAuthor('Marco Wentzel MarcoPedia (talk) 22:07, 3 December 2016')).toBe('Marco Wentzel MarcoPedia');
    expect(commonsAuthor('Photograph by: Noah Elhardt')).toBe('Noah Elhardt');
  });
});

describe('spellingKey: an -er adjective that keeps its e (agent A\'s finding)', () => {
  it('stolonifer, stolonifera and stoloniferum are one name, and niger and nigra stay one', () => {
    expect(spellingKey('stolonifer')).toBe(spellingKey('stolonifera'));
    expect(spellingKey('stoloniferum')).toBe(spellingKey('stolonifera'));
    expect(spellingKey('asper')).toBe(spellingKey('aspera'));
    expect(spellingKey('niger')).toBe(spellingKey('nigra'));
    expect(spellingKey('minimum')).not.toBe(spellingKey('minutum'));
  });
});
