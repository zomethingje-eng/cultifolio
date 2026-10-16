/**
 * Round seventy-three, L: the weak Commons leads of self-review 71 (finding 9), read over the live corpus
 * (d60525499b8c8c20). Titles, categories, names and keys are the corpus's own. Each case FAILED on `r73base` unless it
 * says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import { heldNamesOf, commonsKind, leadOf, kindNamesOf, type HeldNames } from '$dossier/photo-kind';
import * as fill from '$dossier/commons-fill';
import * as kind from '$dossier/photo-kind';
import * as infra from '$dossier/kew-infra';
import { inatKewFill } from '$dossier/inat-kew-fill';
import type { FetchResult } from '$dossier/fetch';

const INDEX = [
  { key: 7400459, name: 'Heliamphora purpurascens' },
  { key: 7263157, name: 'Heliamphora heterodoxa', syn: ['Heliamphora heterodoxa var. heterodoxa'] },
  { key: 11145800, name: 'Nepenthes domei' },
  { key: 3702018, name: 'Nepenthes benstonei' },
  { key: 2771037, name: 'Hesperaloe nocturna' },
  { key: 5421356, name: 'Boswellia papyrifera', syn: ['Amyris papyrifera', 'Boswellia odorata'] },
  { key: 3994082, name: 'Commiphora myrrha', syn: ['Balsamea myrrha', 'Commiphora molmol'] },
  { key: 4169836, name: 'Rhododendron mucronatum', syn: ['Azalea alba'] },
  { key: 4936864, name: 'Rhododendron kanehirae' },
  { key: 5620541, name: 'Melocactus paucispinus' },
  { key: 2739938, name: 'Colchicum neapolitanum' }
];
const HELD = heldNamesOf(INDEX);
const KEY = new Map(INDEX.map((e) => [e.name, e.key]));
const C = 'https://upload.wikimedia.org/wikipedia/commons';
const commonsFile = (title: string, categories: string[] = []) => ({ src: 'commons', id: title, url: `${C}/thumb/a/ab/x.jpg/960px-x.jpg`, thumb: `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', categories, sourceRead: true });
const dossier = (scientific: string, photos: unknown[], synonyms: string[] = []) => ({ key: KEY.get(scientific) ?? 1, name: { scientific, synonyms, vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos });
const page = (scientific: string, photos: unknown[], synonyms: string[] = [], held: HeldNames | null = HELD) => safeUrls(dossier(scientific, photos, synonyms) as never, held).photos;
const shows = (scientific: string, title: string, categories: string[] = [], synonyms: string[] = []) => page(scientific, [commonsFile(title, categories)], synonyms).length === 1;

describe('L-1: a bare epithet of another species of the genus, as the only name in a title, reads as that species', () => {
  it('"Heterodoxa pt12" on Heliamphora purpurascens names Heliamphora heterodoxa, another page of the reference', () => {
    const cats = ['Heliamphora purpurascens', 'GFDL', 'Taken with Pentax Optio E30', 'Self-published work', 'Flora of Bolívar (state)'];
    expect(shows('Heliamphora purpurascens', 'File:Heterodoxa pt12.JPG', cats)).toBe(false);
    const names = kindNamesOf(dossier('Heliamphora purpurascens', []), HELD);
    expect(commonsKind('File:Heterodoxa pt12.JPG', names, { categories: cats })).toBe('named as another species');
    // It was the page's only photograph and its lead: the page now has none.
    expect(leadOf([commonsFile('File:Heterodoxa pt12.JPG', cats)] as never, names)).toBeUndefined();
  });
  it('guard: the title holds the species\' own epithet too ("Benstonei domei" on Nepenthes domei)', () => {
    expect(shows('Nepenthes domei', 'File:Benstonei domei.jpg', ['Nepenthes domei', 'Self-published work', 'Nepenthes pitchers'])).toBe(true);
  });
  it('guard: the species\' own epithet run on, and a title naming no plant at all', () => {
    expect(shows('Nepenthes benstonei', 'File:Nbenstonei.jpg')).toBe(true);
    expect(shows('Heliamphora heterodoxa', 'File:Heterodoxa pt12.JPG')).toBe(true);
    expect(shows('Hesperaloe nocturna', 'File:Gardenology.org-IMG 2222 hunt0903.jpg')).toBe(true);
  });
  it('guard: without the reference\'s names nothing is read as a sister species', () => {
    expect(page('Heliamphora purpurascens', [commonsFile('File:Heterodoxa pt12.JPG')], [], null).length).toBe(1);
  });
});

describe('L-2: a title that names no plant, filed by Commons as a place, is a photograph of the place', () => {
  it('"Giba near Gabat outlet" (Rivers of Ethiopia), Boswellia papyrifera\'s only photograph: a river valley', () => {
    expect(shows('Boswellia papyrifera', 'File:Giba near Gabat outlet.jpg', ['Boswellia papyrifera', 'Rivers of Ethiopia', 'Giba River', 'Self-published work'])).toBe(false);
  });
  it('"Mirra nos Olivais de Quelemem" (Plantations in Brazil), Commiphora myrrha\'s only photograph: a shrub of another genus', () => {
    expect(shows('Commiphora myrrha', 'File:Mirra nos Olivais de Quelemem.jpg', ['Commiphora myrrha', 'Pedralva (Minas Gerais)', 'Self-published work', 'Plantations in Brazil'])).toBe(false);
  });
  it('guard: a river named in the categories of a photograph of the flowers, and a habitat photograph whose title names the plant', () => {
    expect(shows('Rhododendron mucronatum', 'File:HK Plants Shatin Shing Mun River White Flowers 1.JPG', ['Rhododendron mucronatum', 'White flowers in Hong Kong', 'Shing Mun River'])).toBe(true);
    expect(shows('Melocactus paucispinus', 'File:Melocactus paucispinus in habitat.jpg', ['Melocactus paucispinus', 'Rivers of Bahia'])).toBe(true);
  });
});

describe('L-3: a map of a place, and an information board, are not photographs of the plant', () => {
  it('"烏來杜鵑分布圖" (a distribution map, filed under "Maps of Shiding District, New Taipei") on Rhododendron kanehirae', () => {
    expect(shows('Rhododendron kanehirae', 'File:烏來杜鵑分布圖.jpg', ['Rhododendron kanehirae', 'CC-Zero', 'Fetsui Reservoir', 'Maps of Shiding District, New Taipei', 'Self-published work'])).toBe(false);
  });
  it('"Information board of Ernest Henry Wilson in Botanists Memorial Garden"', () => {
    expect(shows('Rhododendron kanehirae', 'File:Information board of Ernest Henry Wilson in Botanists Memorial Garden 2024-07-17.jpg', ['Rhododendron kanehirae', 'Taipei Botanical Garden', 'Information boards in Taipei'])).toBe(false);
  });
  it('guard: "Pages with maps", which Commons gives every geotagged photograph, still hides nothing', () => {
    expect(shows('Colchicum neapolitanum', 'File:Colchicum neapolitanum sl1.jpg', ['Colchicum neapolitanum', 'Pages with maps'])).toBe(true);
  });
});

/** Kew's rows (`wcvp_names.csv`, 4 June 2026) for Crassula exilis and C. cooperi: id, name, status, accepted id, IPNI. */
const KEW: infra.KewInfraRow[] = [
  { id: '2741705', name: 'Crassula exilis', status: 'Accepted', acceptedId: '2741705', ipni: '273135-1' },
  { id: '2741623', name: 'Crassula cooperi', status: 'Accepted', acceptedId: '2741623', ipni: '273059-1' },
  { id: '2741706', name: 'Crassula exilis subsp. cooperi', status: 'Synonym', acceptedId: '2741623', ipni: '878745-1' },
  { id: '2741707', name: 'Crassula exilis subsp. picturata', status: 'Accepted', acceptedId: '2741707', ipni: '70027745-1' }
];
const kewInfra = () => { const k = new infra.KewInfra(); KEW.forEach((r) => k.add(r)); return k; };
/** Crassula exilis as the live dossier names it: GBIF's older names hold "Crassula cooperi Schönl.", and the Kew fill lists nothing apart (its author is not Kew's Regel). */
const exilisName = { scientific: 'Crassula exilis', synonyms: ['Cotyledon picturata Boom', 'Crassula alpestris Drège', 'Crassula bolusii Schönl.', 'Crassula cooperi Schönl.', 'Crassula picturata Friedrich'], kew: { entry: '2741705', synonyms: ['Crassula picturata', 'Crassula sedifolia'], acceptedElsewhere: [] as string[] } };
const exilisOwn = { scientific: exilisName.scientific, synonyms: exilisName.synonyms, kewSynonyms: exilisName.kew.synonyms, acceptedElsewhere: [], kewEntry: '2741705', ipni: '273135-1' };
const inatPhoto = (id: string, extra: Record<string, unknown> = {}) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpeg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpeg`, licence: 'by-sa', attribution: '(c) Nicola van Berkel, some rights reserved (CC BY-SA)', page: 'https://www.inaturalist.org/observations/146124330', captive: false, ...extra });
const gbifCopy = (id: string, n: string) => ({ src: 'gbif', id: `4014978273:${n}`, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/original.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by-sa', attribution: 'Nicola van Berkel, CC BY-SA, iNaturalist via GBIF', page: `https://www.inaturalist.org/photos/${id}` });

describe('L-4: Kew\'s accepted species outrank GBIF\'s older name of the same words in the iNaturalist filter', () => {
  it('"Crassula exilis cooperi" is Kew\'s Crassula cooperi, though GBIF lists "Crassula cooperi Schönl." among Crassula exilis\'s names', () => {
    const k = kewInfra();
    expect(k.placedElsewhere('Crassula exilis cooperi', exilisOwn)).toBe('Crassula cooperi');
    expect(k.hasElsewhereUnder(exilisOwn)).toBe(true);
    expect(k.widened(exilisOwn)).toBe(true);
    expect(k.widened({ scientific: 'Crassula cooperi', kewEntry: '2741623' })).toBe(false); // nothing new under the other page
  });
  it('guard: a subspecies Kew accepts under the species, and the page without Kew\'s entry', () => {
    const k = kewInfra();
    expect(k.placedElsewhere('Crassula exilis picturata', exilisOwn)).toBeNull();
    expect(k.placedElsewhere('Crassula exilis cooperi', { scientific: 'Crassula exilis', synonyms: exilisName.synonyms })).toBeNull();
  });
  it('--fill inat --bulk asks Crassula exilis again, though marked by round 72, and leaves out the cooperi observation; a rerun passes it by', async () => {
    const k = kewInfra();
    const obs = (id: number, taxon: string) => ({ id, taxon: { name: taxon }, photos: [{ id, license_code: 'cc-by-sa', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpeg`, attribution: '(c) Nicola van Berkel, some rights reserved (CC BY-SA)' }] });
    const asked: string[] = [];
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      asked.push(url);
      if (url.includes('/taxa?parent_id=582911')) return { status: 'ok', data: { results: [{ id: 1, name: 'Crassula exilis cooperi' }, { id: 2, name: 'Crassula exilis picturata' }] } as T };
      if (url.includes('captive=false')) return { status: 'ok', data: { results: [obs(251153181, 'Crassula exilis cooperi'), obs(7, 'Crassula exilis picturata')] } as T };
      return { status: 'none' };
    };
    const d = { key: 7334223, name: exilisName, ids: { inat: 582911, ipni: '273135-1' }, photos: [inatPhoto('251153181'), inatPhoto('8')], upstream: { 'inat.photos.wild': { status: 'ok', at: '2026-09-20', detail: "filled 2026-10-16; descendants read against Kew's file of 2026-06-04" } } };
    const r = await inatKewFill(d as never, f, k, '2026-06-04', () => '2026-10-17T00:00:00Z');
    expect(r).toMatchObject({ done: 'asked again', placed: [['Crassula exilis cooperi', 'Crassula cooperi']] });
    expect(d.photos.map((p) => p.id)).toEqual(['7']);
    expect(d.upstream['inat.photos.wild'].detail).toBe("filled 2026-10-17; descendants read against Kew's file of 2026-06-04; Kew's accepted species read over GBIF's older names");
    const n = asked.length;
    expect(await inatKewFill(d as never, f, k, '2026-06-04')).toEqual({ done: 'read before' });
    expect(asked.length).toBe(n);
  });
});

describe('L-5: an observation GBIF files under an older name Kew accepts as another page\'s species is that page\'s', () => {
  const gummiferaKey = 8357296, cissKey = 5527841;
  const ciss = { scientific: 'Adenia cissampeloides', kew: { acceptedElsewhere: ['Adenia gummifera (Harv.) Harms', 'Adenia gracilis Harms'] } };
  const photo = inatPhoto('247854950', { page: 'https://www.inaturalist.org/observations/144417725', attribution: '(c) Mahomed Desai, some rights reserved (CC BY)' });
  const copy = { ...gbifCopy('247854950', '0'), id: '4006551795:0', attribution: 'Mahomed Desai, CC BY, iNaturalist via GBIF' };
  it('Adenia gummifera keeps its photograph; Adenia cissampeloides, where GBIF filed it, does not show it', () => {
    const marks = kind.sharedPhotos([{ key: gummiferaKey, name: { scientific: 'Adenia gummifera' }, photos: [photo] }, { key: cissKey, name: ciss, photos: [copy] }]);
    expect(marks.get(gummiferaKey)).toBeUndefined();
    expect(marks.get(cissKey)?.get('inat:247854950')).toEqual([gummiferaKey]);
  });
  it('guard: two observations of two plants sharing one photograph, and pages whose names Kew does not set apart, are still shown on neither', () => {
    const twig = inatPhoto('475391379');
    const both = kind.sharedPhotos([{ key: 3034002, name: { scientific: 'Sassafras albidum' }, photos: [twig] }, { key: 3082227, name: { scientific: 'Cornus amomum' }, photos: [{ ...twig, page: 'https://www.inaturalist.org/observations/264729417' }] }]);
    expect(both.size).toBe(2);
    const noKew = kind.sharedPhotos([{ key: gummiferaKey, name: { scientific: 'Adenia gummifera' }, photos: [photo] }, { key: cissKey, name: { scientific: 'Adenia cissampeloides' }, photos: [copy] }]);
    expect(noKew.size).toBe(2);
    const exilis = kind.sharedPhotos([{ key: 7334223, name: { scientific: 'Crassula exilis' }, photos: [inatPhoto('251153181')] }, { key: 7334310, name: { scientific: 'Crassula cooperi', kew: { acceptedElsewhere: [] } }, photos: [gbifCopy('251153181', '2')] }]);
    expect(exilis.size).toBe(2);
  });
});

describe('L-6: a description that names the species outweighs a sister species\' bare epithet in the title', () => {
  const title = 'File:Heterodoxa pt12.JPG';
  const cats = ['Heliamphora purpurascens', 'GFDL', 'Taken with Pentax Optio E30', 'Self-published work', 'Flora of Bolívar (state)'];
  const description = "Heliamphora heterodoxa 'Ptari Tepui' (now known as Heliamphora purpurascens)";
  const names = kindNamesOf(dossier('Heliamphora purpurascens', []), HELD);
  it('Commons\' own description of "Heterodoxa pt12" names Heliamphora purpurascens: the file is shown, and leads its page', () => {
    expect(kind.describesSpecies(description, names)).toBe(true);
    const file = { ...commonsFile(title, cats), described: true };
    expect(page('Heliamphora purpurascens', [file]).length).toBe(1);
    expect(leadOf([file] as never, names)?.id).toBe(title);
  });
  it('guard: a description naming only the sister species, or none read yet, leaves it out', () => {
    expect(kind.describesSpecies('Heliamphora heterodoxa, Ptari-tepui', names)).toBe(false);
    expect(page('Heliamphora purpurascens', [{ ...commonsFile(title, cats), described: false }]).length).toBe(0);
    expect(page('Heliamphora purpurascens', [commonsFile(title, cats)]).length).toBe(0);
  });
  it('--fill commons-kind reads the description of such a file once, though its source was read before, and the page shows it', async () => {
    const files = new Map([['7400459.json', JSON.parse(JSON.stringify(dossier('Heliamphora purpurascens', [commonsFile(title, cats)])))]]);
    const store = { files: () => [...files.keys()], read: <T,>(k: string) => JSON.parse(JSON.stringify(files.get(k))) as T, write: (k: string, v: unknown) => void files.set(k, JSON.parse(JSON.stringify(v))) };
    const asked: string[] = [];
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      asked.push(url);
      const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
      return { status: 'ok', data: { query: { pages: Object.fromEntries(titles.map((t, i) => [String(i + 1), { title: t, imageinfo: [{ extmetadata: { Categories: { value: cats.join('|') }, ImageDescription: { value: description }, Artist: { value: 'Seb38' } } }] }])) } } as T };
    };
    const c = await fill.fillCommonsKindAll(store as never, f, HELD);
    expect(c.shownAgain).toBe(1);
    expect(files.get('7400459.json').photos[0].described).toBe(true);
    expect(page('Heliamphora purpurascens', files.get('7400459.json').photos).length).toBe(1);
    const n = asked.length;
    await fill.fillCommonsKindAll(store as never, f, HELD);
    expect(asked.length).toBe(n); // read once
  });
});
