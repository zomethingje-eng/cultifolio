/**
 * Round seventy-two, reviewer C: photographs read over the whole live corpus (4c784c5dc7ca2448). The titles, categories
 * and names are the corpus's own; GBIF's answers are its own of 15 October 2026. Each case FAILED on `r72base` unless it
 * says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, slipStanding, askSlip, type HeldNames } from '$dossier/photo-kind';
import { dropsBetween } from '$dossier/drops';
import * as fill from '$dossier/commons-fill';
import * as inat from '$dossier/sources/inat';
import type { FetchResult } from '$dossier/fetch';
import { gbifPage } from '../../src/lib/core/page-id';

/** The live index's names these cases read: "Cactus", "Bahia" and "Croton" are genera of older names only; Crocus, Aloe, Yucca and Dinteranthus of accepted names. */
const INDEX = [
  { key: gbifPage(3084579), name: 'Sclerocactus brevispinus' },
  { key: gbifPage(7282091), name: 'Mammillaria vetula' },
  { key: gbifPage(7283149), name: 'Mammillaria mammillaris', syn: ['Cactus mammillaris'] },
  { key: gbifPage(5620541), name: 'Melocactus paucispinus' },
  { key: gbifPage(9000001), name: 'Verbesina bahiensis', syn: ['Bahia ambrosioides'] },
  { key: gbifPage(3071716), name: 'Excoecaria cochinchinensis' },
  { key: gbifPage(9000002), name: 'Acalypha integrifolia', syn: ['Croton integrifolius'] },
  { key: gbifPage(2739938), name: 'Colchicum neapolitanum' },
  { key: gbifPage(9000003), name: 'Crocus sativus' },
  { key: gbifPage(2771040), name: 'Hesperaloe chiangii' },
  { key: gbifPage(2775604), name: 'Yucca carnerosana' },
  { key: gbifPage(4054801), name: 'Cyphostemma juttae' },
  { key: gbifPage(2777537), name: 'Aloe arborescens' },
  { key: gbifPage(3706668), name: 'Pleiospilos nelii' },
  { key: gbifPage(9000004), name: 'Dinteranthus vanzylii' },
  { key: gbifPage(3705430), name: 'Mesembryanthemum eurystigmatum', syn: ['Cryophytum clavatum', 'Eurystigma clavatum'] },
  { key: gbifPage(7219396), name: 'Nepenthes monticola' },
  { key: gbifPage(3702163), name: 'Nepenthes lamii' },
  { key: gbifPage(10953066), name: 'Parodia lenninghausii', syn: ['Notocactus lenninghausii'] },
  { key: gbifPage(9467410), name: 'Ceropegia barberae', syn: ['Brachystelma barberae'] }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));
const C = 'https://upload.wikimedia.org/wikipedia/commons';
type P = Record<string, unknown>;
const commonsFile = (title: string, extra: P = {}) => ({ src: 'commons', id: title, url: `${C}/thumb/a/ab/x.jpg/960px-x.jpg`, thumb: `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', categories: [], sourceRead: true, ...extra });
const page = (scientific: string, photos: unknown[], synonyms: string[] = [], held: HeldNames | null = HELD) =>
  safeUrls({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos } as never, held).photos;
const shows = (scientific: string, title: string, synonyms: string[] = []) => page(scientific, [commonsFile(title)], synonyms).length === 1;

describe('C-1: a genus of older names only, or the last word of an English name, is not another plant', () => {
  it('"Pariette Cactus - Sclerocactus brevispinus": eleven of the page\'s fourteen files were hidden by "Cactus"', () => {
    expect(shows('Sclerocactus brevispinus', 'File:Pariette Cactus - Sclerocactus brevispinus (53657711717).jpg')).toBe(true);
    expect(shows('Mammillaria vetula', 'File:Cactus (Mammillaria vetula) 2.jpg')).toBe(true);
  });
  it('"Melocactus paucispinus Bahia Brasil": a state of Brazil, and a genus only of an older name', () => {
    expect(shows('Melocactus paucispinus', 'File:Melocactus paucispinus Bahia Brasil.jpg')).toBe(true);
  });
  it('"Chinese Croton (Excoecaria cochinchinensis \'Firestorm\')" and "Autumn Crocus (Meadow Saffron)"', () => {
    expect(shows('Excoecaria cochinchinensis', "File:Chinese Croton (Excoecaria cochinchinensis 'Firestorm').jpg")).toBe(true);
    expect(shows('Colchicum neapolitanum', 'File:Autumn Crocus (Meadow Saffron) (48871317442).jpg')).toBe(true);
  });
  it('guard: another accepted genus named in the picture still hides it', () => {
    expect(shows('Hesperaloe chiangii', 'File:Hesperaloe (Agavaceae) Hesperaloe chiangii fh 0641, Yucca carnerosana fh 0682 MEX A.jpg')).toBe(false);
    expect(shows('Cyphostemma juttae', 'File:Aloe Dichotoma & Cyphostemma Juttae, Huntington.jpg', ['Cissus juttae Dinter & Gilg'])).toBe(false);
    expect(shows('Pleiospilos nelii', 'File:Dinteranthus? Pleiospilos? (3645391194).jpg')).toBe(false);
  });
});

describe('C-2: an epithet already read is not read again as a genus run on into a word', () => {
  it('"Mesembryanthemum eurystigmatum (4086830565)": "eurystigmatum" begins with its older genus Eurystigma', () => {
    expect(shows('Mesembryanthemum eurystigmatum', 'File:Mesembryanthemum eurystigmatum (4086830565).jpg', ['Cryophytum clavatum L.Bolus', 'Eurystigma clavatum (L.Bolus) L.Bolus'])).toBe(true);
  });
  it('guard: a genus run on into another species\' epithet is still another plant', () => {
    expect(shows('Nepenthes monticola', 'File:Nepentheslamiiplant2800.jpg')).toBe(false);
  });
});

describe('C-3: GBIF\'s second spelling of a name, by the same author, is the species\'', () => {
  const parodia = { scientific: 'Parodia lenninghausii', authorship: '(F.Haage) F.H.Brandt ex Eggli & Hofacker', key: 10953066, synonyms: ['Notocactus lenninghausii (F.Haage) A.Berger', 'Echinocactus lenninghausii (F.Haage) K.Schum.'] };
  const leninghausii = { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', usageKey: 8565818, speciesKey: 8565818, canonicalName: 'Parodia leninghausii', scientificName: 'Parodia leninghausii (F.Haage) F.H.Brandt' };
  it('"Parodia leninghausii (F.Haage) F.H.Brandt" is "… F.H.Brandt ex Eggli & Hofacker" cited by its first author', () => {
    expect(slipStanding('parodia leninghausii', parodia, [], leninghausii).own).toBe(true);
  });
  it('"Notocactus leninghausii", GBIF\'s synonym of that record, follows it; askSlip asks for the record once', async () => {
    const noto = { matchType: 'EXACT', status: 'SYNONYM', rank: 'SPECIES', usageKey: 7281902, acceptedUsageKey: 8565818, speciesKey: 8565818, canonicalName: 'Notocactus leninghausii', scientificName: 'Notocactus leninghausii (K.Schum.) Backeb.' };
    const asked: string[] = [];
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      asked.push(url);
      if (url.startsWith('https://api.gbif.org/v1/species?datasetKey=')) return { status: 'ok', data: { results: [] } as T };
      if (url.startsWith('https://api.gbif.org/v1/species/match?')) return { status: 'ok', data: noto as T };
      if (url === 'https://api.gbif.org/v1/species/8565818') return { status: 'ok', data: { key: 8565818, scientificName: 'Parodia leninghausii (F.Haage) F.H.Brandt', canonicalName: 'Parodia leninghausii', authorship: '(F.Haage) F.H.Brandt', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES' } as T };
      return { status: 'error', detail: 'no fixture' };
    };
    expect(await askSlip(f, 'notocactus leninghausii', parodia)).toMatchObject({ status: 'ok', data: { own: true } });
    expect(asked.filter((u) => u.endsWith('/species/8565818'))).toHaveLength(1);
  });
  it('"Brachystelma barberiae Harv." is the species\' older name "Brachystelma barberae Harv." spelt otherwise', () => {
    const b = { matchType: 'EXACT', status: 'SYNONYM', rank: 'SPECIES', usageKey: 8704559, acceptedUsageKey: 3580949, speciesKey: 3580949, canonicalName: 'Brachystelma barberiae', scientificName: 'Brachystelma barberiae Harv.' };
    expect(slipStanding('brachystelma barberiae', { scientific: 'Ceropegia barberae', authorship: '(Harv. ex Hook.fil.) Bruyns', key: 9467410, synonyms: ['Brachystelma barberae Harv.', 'Brachystelma barberae Harv. ex Hook.fil.'] }, [], b).own).toBe(true);
  });
  it('guard: another author\'s name one letter away is another plant (Conophytum auctum Rawé)', () => {
    expect(slipStanding('conophytum auctum', { scientific: 'Conophytum actum', authorship: 'N.E.Br.', key: 1 }, [], { matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', usageKey: 2, speciesKey: 2, canonicalName: 'Conophytum auctum', scientificName: 'Conophytum auctum Rawé' }).own).toBe(false);
  });
  it('--fill commons-kind asks again a slip an earlier fill left out, and the page shows the file', async () => {
    const d = { v: 3, key: gbifPage(10953066), slug: 'parodia-lenninghausii', name: { scientific: 'Parodia lenninghausii', authorship: parodia.authorship, synonyms: parodia.synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: [commonsFile('File:Golden Ball Cactus (Parodia leninghausii) (3104097728).jpg', { categories: ['Parodia lenninghausii'] })] };
    const files = new Map([['10953066.json', JSON.parse(JSON.stringify(d))]]);
    const store = { files: () => [...files.keys()], read: <T,>(k: string) => JSON.parse(JSON.stringify(files.get(k))) as T, write: (k: string, v: unknown) => void files.set(k, JSON.parse(JSON.stringify(v))) };
    expect(page('Parodia lenninghausii', d.photos, parodia.synonyms)).toHaveLength(0);
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      if (url.startsWith('https://commons.wikimedia.org/')) {
        const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
        return { status: 'ok', data: { query: { pages: Object.fromEntries(titles.map((t, i) => [String(i + 1), { title: t, imageinfo: [{ extmetadata: { Categories: { value: 'Parodia lenninghausii' }, Artist: { value: 'A. Grower' } } }] }])) } } as T };
      }
      if (url.startsWith('https://api.gbif.org/v1/species?datasetKey=')) return { status: 'ok', data: { results: [] } as T };
      if (url.startsWith('https://api.gbif.org/v1/species/match?')) return { status: 'ok', data: leninghausii as T };
      return { status: 'error', detail: 'no fixture' };
    };
    const c = await fill.fillCommonsKindAll(store as never, f, HELD);
    expect(c).toMatchObject({ slipsOwn: 1, shownAgain: 1 });
    const after = files.get('10953066.json');
    expect(after.photos[0].slips).toEqual(['parodia leninghausii']);
    expect(page('Parodia lenninghausii', after.photos, parodia.synonyms)).toHaveLength(1);
  });
});

describe('C-4: a rebuild\'s drops count the photographs the page shows, not those it keeps', () => {
  const gbifSheet = (id: string) => ({ src: 'gbif', id, url: `https://coicatalogue.uc.pt/JPG/?image=${id}.jpg`, thumb: `https://api.gbif.org/v1/image/cache/200x/occurrence/1/media/${id}`, licence: 'by', attribution: 'Herbarium COI, CC BY, via GBIF', page: 'https://www.gbif.org/occurrence/1', specimen: true });
  const inat = (id: string) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: '(c) A. Grower, some rights reserved (CC BY)' });
  const name = { scientific: 'Adenia tisserantii', synonyms: [] };
  it('Adenia tisserantii: two Coimbra sheets the page never showed are not "dropped to none (2 before)"', () => {
    expect(dropsBetween({ key: gbifPage(5527897), name, photos: [gbifSheet('COI00005498'), gbifSheet('COI00005510')] }, { key: gbifPage(5527897), name, photos: [] }, HELD)).toEqual([]);
  });
  it('a page whose every shown photograph went, a hidden one staying, is flagged', () => {
    expect(dropsBetween({ key: gbifPage(5527897), name, photos: [inat('1'), inat('2'), gbifSheet('COI1')] }, { key: gbifPage(5527897), name, photos: [gbifSheet('COI1')] }, HELD)).toEqual(['photographs dropped to none (2 before)']);
  });
});

describe('C-5: an iNaturalist observation filed below the species, that Kew holds as another species, is not its photograph', () => {
  it('Epithelantha greggii: "Epithelantha greggii polycephala" is Kew\'s Epithelantha polycephala (13 of the page\'s photographs, and its lead)', async () => {
    const held = heldNamesOf([{ key: gbifPage(3944896), name: 'Epithelantha greggii' }, { key: gbifPage(3944682), name: 'Epithelantha polycephala', syn: ['Epithelantha greggii subsp. polycephala'] }]);
    const obs = (id: number, taxon: string) => ({ id, taxon: { name: taxon, rank: taxon.split(' ').length > 2 ? 'subspecies' : 'species' }, photos: [{ id: id * 10, license_code: 'cc-by', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id * 10}/square.jpg`, attribution: '(c) A. Grower, some rights reserved (CC BY)' }] });
    const f = async <T,>(url: string): Promise<FetchResult<T>> => (url.startsWith('https://api.inaturalist.org/v1/observations?') ? { status: 'ok', data: { results: [obs(146197, 'Epithelantha greggii polycephala'), obs(5, 'Epithelantha greggii'), obs(6, 'Epithelantha greggii greggii')] } as T } : { status: 'error', detail: 'no fixture' });
    const r = await inat.photos(f, 129048, true, 24, { key: gbifPage(3944896), held });
    expect(r.status === 'ok' ? r.data.map((p) => p.id) : r).toEqual(['50', '60']);
    const s = await inat.photos(f, 129048, true, 24, { key: gbifPage(3944682), held }); // guard: on its own page, read from its parent's taxon, it stays
    expect(s.status === 'ok' ? s.data.map((p) => p.id) : s).toEqual(['1461970', '50', '60']);
  });
});
