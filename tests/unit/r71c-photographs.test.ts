/**
 * Round seventy-one, agent C: the confirmed findings of the self-review of round seventy (`review-70/self-C.md`, S-C1 to
 * S-C12) and REVIEW-TRIAGE-70's photograph decisions. The titles, categories, sources and credits are the live site's and
 * Commons' as read on 15 October 2026; Kew's and GBIF's answers to the slip guard are theirs of the same day. Each case
 * FAILED on `r71base` unless it says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, commonsKind, commonsInatCopy, epithetRank, slipStanding, askSlip, slipsToAsk, sourceKind, shownPhotos, leadOf, type HeldNames } from '$dossier/photo-kind';
import { commonsAuthor, readCommonsPhoto } from '$dossier/photo-credit';
import { commonsPhotos, inatSource } from '$dossier/sources/commons';
import * as fill from '$dossier/commons-fill';
import { fixtureFetcher, type FetchResult } from '$dossier/fetch';
import { gbifPage } from '../../src/lib/core/page-id';

/** The live index's names for the species these cases read (2026-10-15). */
const INDEX = [
  { key: gbifPage(5421356), name: 'Boswellia papyrifera' },
  { key: gbifPage(3994082), name: 'Commiphora myrrha', syn: ['Balsamea myrrha'] },
  { key: gbifPage(3832851), name: 'Zanthoxylum beecheyanum', syn: ['Zanthoxylum beecheyanum var. alatum', 'Fagara piperita'] },
  { key: gbifPage(2777724), name: 'Aloe vera' },
  { key: gbifPage(2777537), name: 'Aloe arborescens' },
  { key: gbifPage(2767031), name: 'Agave americana' },
  { key: gbifPage(3067157), name: 'Euphorbia milii' },
  { key: gbifPage(7329207), name: 'Lithops lesliei' },
  { key: gbifPage(7329209), name: 'Lithops karasmontana' },
  { key: gbifPage(7284127), name: 'Mammillaria matudae' },
  { key: gbifPage(4252157), name: 'Othonna cakilefolia' },
  { key: gbifPage(3702156), name: 'Nepenthes hurrelliana' },
  { key: gbifPage(7284176), name: 'Echinocereus adustus' },
  { key: gbifPage(2743932), name: 'Romulea gigantea' },
  { key: gbifPage(2772601), name: 'Dasylirion graminifolium' },
  { key: gbifPage(7693710), name: 'Adenia lobata' },
  { key: gbifPage(7288903), name: 'Talinella grevei' },
  { key: gbifPage(9999001), name: 'Ceropegia maritae' },
  { key: gbifPage(9999002), name: 'Salvia azurea' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));
const C = 'https://upload.wikimedia.org/wikipedia/commons';

type P = Record<string, unknown> & { id?: string };
const commonsFile = (title: string, extra: P = {}) => ({ src: 'commons', id: title, url: `${C}/thumb/a/ab/x.jpg/960px-${encodeURIComponent(title)}`, thumb: `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', ...extra });
const inatPhoto = (id: string) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: '(c) A. Grower, some rights reserved (CC BY)' });
const page = (scientific: string, photos: unknown[], synonyms: string[] = [], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos } as never, held).photos;
const shows = (scientific: string, title: string, extra: P = {}, synonyms: string[] = []) => page(scientific, [commonsFile(title, extra)], synonyms).length === 1;

describe('S-C1: a map in any language', () => {
  it('"Areale Boswellia papyrifera", the live lead, is a map', () => {
    expect(shows('Boswellia papyrifera', 'File:Areale Boswellia papyrifera.jpg', { categories: ['Boswellia papyrifera', 'Flora of Ethiopia'] })).toBe(false);
    for (const t of ['File:Mapa Boswellia papyrifera.jpg', 'File:Boswellia papyrifera carte.jpg', 'File:Boswellia papyrifera kaart.jpg', 'File:Boswellia papyrifera ареал.jpg', 'File:Boswellia papyrifera verspreiding.jpg']) expect(shows('Boswellia papyrifera', t), t).toBe(false);
    expect(shows('Boswellia papyrifera', 'File:Boswellia papyrifera.jpg')).toBe(true); // guard
    expect(shows('Boswellia papyrifera', 'File:Boswellia papyrifera Carter road.jpg')).toBe(true); // guard: "Carter" is no map
  });
});

describe('S-C2: a herbarium sheet by its source or description', () => {
  const credit = '<a rel="nofollow" class="external free" href="https://collections.nmnh.si.edu/search/botany/?ark=ark:/65665/3f50b9bbe5f524cb681d8bb7deeee4464">https://collections.nmnh.si.edu/search/botany/?ark=ark:/65665/3f50b9bbe5f524cb681d8bb7deeee4464</a>';
  const description = 'Commiphora myrrha specimen from the Smithsonian National Museum of Natural History. Its spiny branches and small leaves can be observed in this specimen.';
  it('"Commiphora myrrha.jpg", the live lead, is the Smithsonian\'s sheet: by its source, and by its description', () => {
    expect(sourceKind(credit, description)).toBe('a herbarium sheet (by its source)');
    expect(sourceKind('', description)).toBe('a herbarium sheet (by its description)');
    expect(shows('Commiphora myrrha', 'File:Commiphora myrrha.jpg', { kind: sourceKind(credit, description), licence: 'cc0', attribution: 'W. C. Burger, CC0, via Wikimedia Commons' })).toBe(false);
  });
  it('a new answer is left out by its source', async () => {
    const answer = { query: { pages: { '1': { title: 'File:Commiphora myrrha.jpg', imageinfo: [{ url: `${C}/a/ab/Commiphora_myrrha.jpg`, thumburl: `${C}/thumb/a/ab/Commiphora_myrrha.jpg/771px-Commiphora_myrrha.jpg`, width: 771, height: 1000, extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'W. C. Burger' }, Categories: { value: 'Commiphora myrrha|CC-Zero' }, ImageDescription: { value: description }, Credit: { value: credit } } }] } } } };
    const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': answer }), 'Commiphora myrrha', 12, { scientific: 'Commiphora myrrha', key: gbifPage(3994082), held: HELD });
    expect(r.status).toBe('none');
  });
  it('a garden\'s living specimen is no sheet (a guard of the new rule; fails on the base only for want of `sourceKind`)', () => {
    expect(sourceKind('Own work', 'Cyphostemma juttae, a specimen in the Lyman Plant House, Smith College')).toBeNull();
  });
});

describe('S-C3: a name with a rank in a genus the reference does not hold is another plant', () => {
  it('the comparison that leads Zanthoxylum beecheyanum', () => {
    expect(shows('Zanthoxylum beecheyanum', 'File:Comparison between Zanthoxylum beecheyanum var. alatum and Osteomeles anthyllidifolia var. subrotunda.jpg', {}, ['Zanthoxylum beecheyanum var. alatum (Nakai) Nakai'])).toBe(false);
    expect(shows('Zanthoxylum beecheyanum', 'File:Zanthoxylum beecheyanum var. alatum.jpg', {}, ['Zanthoxylum beecheyanum var. alatum (Nakai) Nakai'])).toBe(true); // guard
  });
});

describe('S-C4: GBIF media of a herbarium sheet, a drawing or a micrograph are not shown', () => {
  const gbif = (id: string, url: string, extra: P = {}) => ({ src: 'gbif', id, url, thumb: `https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/${id.split(':')[0]}/media/x`, licence: 'cc0', attribution: 'A. Curator, CC0, via GBIF', ...extra });
  it('Adenia lobata\'s lead (Tangerini\'s drawing, NMNH) and its Meise sheets; Talinella grevei\'s pollen micrographs', () => {
    expect(page('Adenia lobata', [gbif('1318456506:1', 'https://collections.nmnh.si.edu/media/?i=10876670&h=2000'), gbif('1839456131:2', 'https://oxalis.br.fgov.be/images/BR0/000/006/600/051/BR0000006600051.jpg')])).toEqual([]);
    expect(page('Talinella grevei', [gbif('3467317927:0', 'https://collections.nmnh.si.edu/media/?i=15264967&h=1367')])).toEqual([]);
  });
  it('a record whose basis is not an observation (`specimen`, set by the build and the fill) is not shown, and leads nothing', () => {
    const sheet = gbif('1:0', 'https://example-herbarium-images.org/1.jpg', { specimen: true });
    const live = gbif('2:0', 'https://inaturalist-open-data.s3.amazonaws.com/photos/301282893/original.jpg', { thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/301282893/medium.jpg' });
    expect(shownPhotos([sheet, live] as never, { scientific: 'Aloe vera' }).map((p) => p.id)).toEqual(['2:0']);
    expect(leadOf([sheet] as never, { scientific: 'Aloe vera' })).toBeUndefined();
    expect(shownPhotos([live] as never, { scientific: 'Aloe vera' })).toHaveLength(1); // guard
  });
});

describe('S-C5: a Commons copy of an iNaturalist photograph the page holds is shown once', () => {
  it('by the source Commons names: Echinocereus adustus\'s "schwarzii 1/2" are iNaturalist\'s 34674713 and 34674723', () => {
    const shown = page('Echinocereus adustus', [inatPhoto('34674713'), inatPhoto('34674723'), commonsFile('File:Echinocereus adustus schwarzii 1.jpg', { inat: '34674713' }), commonsFile('File:Echinocereus adustus schwarzii 2.jpg', { inat: '34674723' })]);
    expect(shown.map((p) => p.id)).toEqual(['34674713', '34674723']);
    expect(page('Echinocereus adustus', [inatPhoto('34674713'), commonsFile('File:Echinocereus adustus schwarzii 1.jpg', { inat: '1' })])).toHaveLength(2); // guard: another photograph
  });
  it('the source is read from Commons\' Credit field', () => {
    expect(inatSource('<a rel="mw:ExtLink nofollow" href="https://www.inaturalist.org/photos/34674713" class="external free">https://www.inaturalist.org/photos/34674713</a>')).toBe('34674713');
    expect(inatSource('https://collections.nmnh.si.edu/search/botany/')).toBeNull(); // guard
  });
  it('a crop keeps its number; a camera\'s time is no number', () => {
    expect(commonsInatCopy('File:Othonna cakilifolia 23242119 (cropped).jpg')).toBe('23242119');
    expect(commonsInatCopy('File:Romulea gigantea Bég.- Bot. Jahrb. Syst. 38- 333 (1907). 20220416_120706.jpg')).toBeNull();
    expect(commonsInatCopy('File:Agave multifilifera 328057104.jpg')).toBe('328057104'); // guard
  });
});

describe('S-C6: the group exemption needs the species named as a name', () => {
  const three = ['Aloe vera', 'Aloe arborescens', 'Agave americana'];
  it('"Vertical garden" and "Verschiedene Sukkulenten" do not name Aloe vera, nor "Milk bottle plants" Euphorbia milii', () => {
    expect(shows('Aloe vera', 'File:Vertical garden.jpg', { categories: three })).toBe(false);
    expect(shows('Aloe vera', 'File:Verschiedene Sukkulenten.jpg', { categories: three })).toBe(false);
    expect(shows('Euphorbia milii', 'File:Milk bottle plants.jpg', { categories: ['Euphorbia milii', 'Aloe vera'] })).toBe(false);
    expect(epithetRank('File:Vertical garden.jpg', { scientific: 'Aloe vera' })).toBe(2);
    expect(epithetRank('File:Milk bottle plants.jpg', { scientific: 'Euphorbia milii' })).toBe(2);
    expect(shows('Aloe vera', 'File:Aloe vera with Aloe arborescens behind.jpg', { categories: ['Aloe vera', 'Aloe arborescens'] })).toBe(false); // guard: names the other
    expect(epithetRank('File:Aloe vera 1.jpg', { scientific: 'Aloe vera' })).toBe(0); // guard
    expect(epithetRank('File:Nepenthesdubia1.jpg', { scientific: 'Nepenthes dubia' })).toBe(0); // guard: run together
  });
  it('an own epithet written with a capital names the species', () => {
    expect(commonsKind('File:Mammillaria Matudae & Mexico (1) (11982771215).jpg', { scientific: 'Mammillaria matudae', key: gbifPage(7284127), held: HELD }, { categories: ['Mammillaria matudae', 'Lithops lesliei'] })).toBeNull();
  });
});

describe('S-C7: Commons\' diffused categories count in the group rule', () => {
  it('"Lithops in a pot", filed under L. lesliei and "Lithops karasmontana in cultivation", is a group', () => {
    for (const other of ['Lithops karasmontana in cultivation', 'Lithops karasmontana (flowers)', 'Flowers of Lithops karasmontana', 'Lithops karasmontana in Namibia']) expect(shows('Lithops lesliei', 'File:Lithops in a pot.jpg', { categories: ['Lithops lesliei', other] }), other).toBe(false);
    expect(shows('Lithops lesliei', 'File:Lithops in a pot.jpg', { categories: ['Lithops lesliei', 'Lithops lesliei in cultivation', 'Plants in Kew Gardens'] })).toBe(true); // guard: one species
  });
});

describe('S-C8: a year hides a file only with other print evidence', () => {
  it('Motohiro Sunouchi\'s living Romulea, its title citing the protologue of 1827, is shown', () => {
    expect(shows('Romulea gigantea', 'File:Romulea gigantea Bég.- Bot. Jahrb. Syst. 38- 333 (1827). 20220416_120706.jpg')).toBe(true);
    expect(shows('Romulea gigantea', 'File:Romulea gigantea Beguinot 1827.jpg')).toBe(true);
  });
  it('a year with a plate\'s words, a category of scans, or a licence for old works is a printed work (guards on the base)', () => {
    expect(shows('Dasylirion graminifolium', 'File:Dasylirion graminifolium Zuccarini 1843 tab. 3.jpg')).toBe(false);
    expect(shows('Dasylirion graminifolium', 'File:Dasylirion graminifolium Zuccarini 1843.jpg', { categories: ['Dasylirion graminifolium', 'Scans of Zuccarini'] })).toBe(false);
    expect(shows('Dasylirion graminifolium', 'File:Dasylirion graminifolium Zuccarini 1843.jpg', { licence: 'pd', attribution: 'Joseph Gerhard Zuccarini, PD-old-100, via Wikimedia Commons' })).toBe(false);
  });
});

describe('S-C9 (with S-B7, S-F13): a name Kew or GBIF accepts as a species is never a slip', () => {
  const kew = (scientificName: string, canonicalName: string, taxonomicStatus: string, accepted?: string) => ({ scientificName, canonicalName, taxonomicStatus, rank: 'SPECIES', ...(accepted ? { accepted } : {}) });
  it('Kew\'s and GBIF\'s answers of 15 October, read by the one rule', () => {
    expect(slipStanding('Ceropegia mariae', { scientific: 'Ceropegia maritae', authorship: '(Bruyns) Bruyns' }, [kew('Ceropegia mariae (Lavranos) Bruyns', 'Ceropegia mariae', 'SYNONYM', 'Echidnopsis scutellata subsp. australis Bruyns')], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Ceropegia mariae', scientificName: 'Ceropegia mariae (Lavranos) Bruyns', speciesKey: 7 }).own).toBe(false);
    expect(slipStanding('Salvia aurea', { scientific: 'Salvia azurea', authorship: 'Michx. ex Lam.' }, [kew('Salvia aurea L.', 'Salvia aurea', 'ACCEPTED')], null).own).toBe(false);
    expect(slipStanding('Conophytum auctum', { scientific: 'Conophytum acutum', authorship: 'L.Bolus' }, [], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Conophytum auctum', scientificName: 'Conophytum auctum Rawé', speciesKey: 8 }).own).toBe(false);
    // GBIF's second spelling by the species' own author is the same name (guards: the 70c cases).
    expect(slipStanding('Othonna cakilifolia', { scientific: 'Othonna cakilefolia', authorship: 'DC.' }, [], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Othonna cakilifolia', scientificName: 'Othonna cakilifolia DC.', speciesKey: 9 }).own).toBe(true);
    expect(slipStanding('Echinocereus chisosensis', { scientific: 'Echinocereus chisoensis', authorship: 'W.T.Marshall' }, [], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Echinocereus chisosensis', scientificName: 'Echinocereus chisosensis W.T.Marshall', speciesKey: 10 }).own).toBe(true);
    expect(slipStanding('Othonna cakilifolia', { scientific: 'Othonna cakilefolia' }, [], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Othonna cakilifolia', scientificName: 'Othonna cakilifolia DC.', speciesKey: 9 }).own).toBe(false); // no author stated: not taken
    expect(slipStanding('Mammillaria mabudae', { scientific: 'Mammillaria matudae', authorship: 'Bravo' }, [], null).own).toBe(true);
  });
  it('the read shows a slip only once the build or the fill asked; without it, another plant', () => {
    expect(shows('Mammillaria matudae', 'File:Mammillaria mabudae, ve zkumavce (001).jpg')).toBe(false);
    expect(shows('Mammillaria matudae', 'File:Mammillaria mabudae, ve zkumavce (001).jpg', { slips: ['mammillaria mabudae'] })).toBe(true); // guard
    expect(slipsToAsk('File:Mammillaria mabudae, ve zkumavce (001).jpg', { scientific: 'Mammillaria matudae', key: gbifPage(7284127), held: HELD })).toEqual(['mammillaria mabudae']);
    expect(slipsToAsk('File:Mammillaria matudae.jpg', { scientific: 'Mammillaria matudae', key: gbifPage(7284127), held: HELD })).toEqual([]); // guard
  });
  it('askSlip asks GBIF\'s copy of Kew, then GBIF\'s backbone strictly; a source that does not answer takes nothing', async () => {
    const f = fixtureFetcher({ 'https://api.gbif.org/v1/species?datasetKey=': { results: [] }, 'https://api.gbif.org/v1/species/match?strict=true': { matchType: 'NONE' } });
    expect(await askSlip(f, 'Mammillaria mabudae', { scientific: 'Mammillaria matudae', authorship: 'Bravo' })).toMatchObject({ status: 'ok', data: { own: true } });
    const refused = (async () => ({ status: 'refused', detail: 'HTTP 503' })) as never;
    expect((await askSlip(refused, 'Mammillaria mabudae', { scientific: 'Mammillaria matudae' })).status).toBe('refused');
  });
  it('the build asks and keeps the slip with the photograph', async () => {
    const answer = { query: { pages: { '1': { title: 'File:Mammillaria mabudae, ve zkumavce (001).jpg', imageinfo: [{ url: `${C}/a/ab/M.jpg`, thumburl: `${C}/thumb/a/ab/M.jpg/960px-M.jpg`, width: 1539, height: 2000, extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: 'Juandev' }, Categories: { value: 'Mammillaria matudae|In vitro' } } }] } } } };
    const f = fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': answer, 'https://api.gbif.org/v1/species?datasetKey=': { results: [] }, 'https://api.gbif.org/v1/species/match?strict=true': { matchType: 'NONE' } });
    const r = await commonsPhotos(f, 'Mammillaria matudae', 12, { scientific: 'Mammillaria matudae', key: gbifPage(7284127), held: HELD, authorship: 'Bravo' });
    expect(r.status === 'ok' && r.data[0].slips).toEqual(['mammillaria mabudae']);
  });
});

describe('S-C11: a derivative work credits both authors, and never a file\'s name', () => {
  const raw = '<ul><li><a href="//commons.wikimedia.org/wiki/File:N._andamana2.jpg" title="File:N. andamana2.jpg">N._andamana2.jpg</a>: Marcello Catalano</li>\n<li>derivative work: <a href="//commons.wikimedia.org/wiki/User:Mgiganteus" title="User:Mgiganteus">Mgiganteus</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Mgiganteus" title="User talk:Mgiganteus"><span class="signature-talk">talk</span></a>)</li></ul>';
  it('Nepenthes andamana\'s "N. andamana2 cropped.jpg", new and stored', () => {
    expect(commonsAuthor(raw)).toBe('Marcello Catalano; derivative work: Mgiganteus');
    expect(readCommonsPhoto({ licence: 'by-sa', attribution: 'N._andamana2.jpg: Marcello Catalano, CC BY-SA 3.0, via Wikimedia Commons' })?.attribution).toBe('Marcello Catalano, CC BY-SA 3.0, via Wikimedia Commons');
    expect(commonsAuthor('Michael Wolf (Webseite)')).toBe('Michael Wolf (Webseite)'); // guard
  });
});

describe('S-C12 and the fill: --fill commons-kind reads the source, the slips and the credit, and counts what the read does', () => {
  const dossier = (key: number, scientific: string, photos: unknown[], authorship?: string) => ({ v: 3, key: gbifPage(key), ids: { gbif: key }, slug: scientific.toLowerCase().replace(/ /g, '-'), name: { scientific, synonyms: [], vernacular: [], status: 'accepted', ...(authorship ? { authorship } : {}) }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos });
  const memory = (ds: unknown[]) => {
    const files = new Map(ds.map((d) => [`${(d as { key: string }).key}.json`, JSON.parse(JSON.stringify(d))]));
    return { files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f: string, d: unknown) => void files.set(f, JSON.parse(JSON.stringify(d))), get: (f: string) => files.get(f) };
  };
  it('keeps the slip, the iNaturalist source and the sheet, and lists what is shown again', async () => {
    const store = memory([
      dossier(7284127, 'Mammillaria matudae', [commonsFile('File:Mammillaria mabudae, ve zkumavce (001).jpg', { categories: ['Mammillaria matudae'] })], 'Bravo'),
      dossier(7284176, 'Echinocereus adustus', [inatPhoto('34674713'), commonsFile('File:Echinocereus adustus schwarzii 1.jpg', { categories: ['Echinocereus adustus'] })]),
      dossier(3994082, 'Commiphora myrrha', [commonsFile('File:Commiphora myrrha.jpg', { categories: ['Commiphora myrrha'], licence: 'cc0', attribution: 'W. C. Burger, CC0, via Wikimedia Commons' })])
    ]);
    const meta: Record<string, Record<string, { value: string }>> = {
      'File:Mammillaria mabudae, ve zkumavce (001).jpg': { Categories: { value: 'Mammillaria matudae|In vitro' } },
      'File:Echinocereus adustus schwarzii 1.jpg': { Categories: { value: 'Echinocereus adustus|Media from iNaturalist' }, Credit: { value: '<a href="https://www.inaturalist.org/photos/34674713">https://www.inaturalist.org/photos/34674713</a>' } },
      'File:Commiphora myrrha.jpg': { Categories: { value: 'Commiphora myrrha|CC-Zero' }, Credit: { value: 'https://collections.nmnh.si.edu/search/botany/?ark=ark:/65665/3f50' }, Artist: { value: 'W. C. Burger' } }
    };
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      if (url.startsWith('https://commons.wikimedia.org/')) {
        const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
        return { status: 'ok', data: { query: { pages: Object.fromEntries(titles.map((t, i) => [String(i + 1), { title: t, imageinfo: [{ extmetadata: meta[t] }] }])) } } as T };
      }
      if (url.startsWith('https://api.gbif.org/v1/species?datasetKey=')) return { status: 'ok', data: { results: [] } as T };
      if (url.startsWith('https://api.gbif.org/v1/species/match?strict=true')) return { status: 'ok', data: { matchType: 'NONE' } as T };
      return { status: 'error', detail: 'no fixture' };
    };
    const c = await fill.fillCommonsKindAll(store as never, f, HELD);
    expect(c).toMatchObject({ slipsAsked: 1, slipsOwn: 1, copies: 1, shownAgain: 1 });
    expect(store.get('g7284127.json').photos[0]).toMatchObject({ slips: ['mammillaria mabudae'], sourceRead: true });
    expect(safeUrls(store.get('g7284127.json') as never, HELD).photos).toHaveLength(1);
    expect(safeUrls(store.get('g7284176.json') as never, HELD).photos.map((p) => p.src)).toEqual(['inat']);
    expect(safeUrls(store.get('g3994082.json') as never, HELD).photos).toEqual([]);
    expect(c.lines.some((l) => l.includes('a herbarium sheet') && l.includes('Commiphora myrrha.jpg'))).toBe(true);
  });
  it('the fill\'s "was" reads the credit, as the read does: a stamp left out by its credit is not counted again', () => {
    expect(commonsKind('File:Colchicum macedonicum.jpg', { scientific: 'Colchicum macedonicum' }, { credit: 'Македонская почта, Public domain, via Wikimedia Commons' })).toBe('not the plant');
  });
});
