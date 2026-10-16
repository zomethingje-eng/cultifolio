/**
 * Round seventy-two, C's fix phase (REVIEW-TRIAGE C1, C4, C5, C8, C10 and F8). Kew's rows are the real ones of
 * `wcvp_names.csv` (4 June 2026); titles, credits and names the live corpus's. Each case FAILED on `r72base` unless it
 * says "guard", which passes on both.
 */
import { describe, it, expect } from 'vitest';
import { safeUrls } from '$dossier/schema';
import * as kind from '$dossier/photo-kind';
import * as inat from '$dossier/sources/inat';
import * as fill from '$dossier/commons-fill';
import * as infra from '$dossier/kew-infra';
import { inatKewFill } from '$dossier/inat-kew-fill';
import type { FetchResult } from '$dossier/fetch';

const C = 'https://upload.wikimedia.org/wikipedia/commons';
type P = Record<string, unknown>;
const commonsFile = (title: string, extra: P = {}) => ({ src: 'commons', id: title, url: `${C}/thumb/a/ab/x.jpg/960px-x.jpg`, thumb: `${C}/thumb/a/ab/x.jpg/500px-x.jpg`, width: 3000, height: 2000, licence: 'by-sa', attribution: 'A. Grower, CC BY-SA 4.0, via Wikimedia Commons', categories: [], sourceRead: true, ...extra });
const inatPhoto = (id: string, extra: P = {}) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpg`, licence: 'by', attribution: '(c) A. Grower, some rights reserved (CC BY)', page: 'https://www.inaturalist.org/observations/1', ...extra });
const dossier = (key: number, scientific: string, photos: unknown[], name: P = {}) => ({ v: 2, key, slug: scientific.toLowerCase().replace(/ /g, '-'), built: '2026-10-15', builtBy: 'node', name: { scientific, synonyms: [], vernacular: [], status: 'accepted', ...name }, ids: { gbif: key }, distribution: { native: [], introduced: [] }, occurrences: {}, climate: { status: 'none' }, photos, literature: [], links: {}, upstream: {} });
const page = (d: ReturnType<typeof dossier>, held: kind.HeldNames | null = null) => safeUrls(d as never, held).photos;

/** Kew's rows for the cases: id, name, status, accepted id, IPNI. */
const KEW: infra.KewInfraRow[] = [
  { id: '2797445', name: 'Eriosyce crispa', status: 'Accepted', acceptedId: '2797445', ipni: '976310-1' },
  { id: '2797465', name: 'Eriosyce eriosyzoides', status: 'Accepted', acceptedId: '2797465', ipni: '70029505-1' },
  { id: '2797449', name: 'Eriosyce crispa var. huascensis', status: 'Synonym', acceptedId: '2797465', ipni: '976313-1' },
  { id: '2736025', name: 'Copiapoa megarhiza', status: 'Accepted', acceptedId: '2736025', ipni: '65038-2' },
  { id: '2735982', name: 'Copiapoa fiedleriana', status: 'Accepted', acceptedId: '2735982', ipni: '65024-2' },
  { id: '2736026', name: 'Copiapoa megarhiza var. echinata', status: 'Synonym', acceptedId: '2735982', ipni: '955681-1' },
  { id: '2417784', name: 'Rhipsalis baccifera', status: 'Accepted', acceptedId: '2417784', ipni: '219250-2' },
  { id: '2417808', name: 'Rhipsalis baccifera subsp. mauritiana', status: 'Accepted', acceptedId: '2417808', ipni: '953512-1' }
];
const kewInfra = () => { const k = new infra.KewInfra(); KEW.forEach((r) => k.add(r)); return k; };
/** Eriosyce crispa as the live dossier names it: GBIF's older names include one below species under E. eriosyzoides. */
const crispa = { scientific: 'Eriosyce crispa', synonyms: ['Eriosyce crispa subsp. totoralensis (F.Ritter) Katt.', 'Eriosyce eriosyzoides var. totoralensis (F.Ritter) A.E.Hoffm. & Helmut Walter', 'Horridocactus crispus (F.Ritter) Backeb.'], ipni: '976310-1' };

describe('C1: an iNaturalist taxon below the species that Kew places under another species, read from Kew\'s file', () => {
  it('"Eriosyce crispa huascensis" is Kew\'s Eriosyce eriosyzoides; "Copiapoa megarhiza echinata" Kew\'s C. fiedleriana', () => {
    const k = kewInfra();
    expect(k.placedElsewhere('Eriosyce crispa huascensis', crispa)).toBe('Eriosyce eriosyzoides');
    expect(k.placedElsewhere('Copiapoa megarhiza echinata', { scientific: 'Copiapoa megarhiza', ipni: '65038-2' })).toBe('Copiapoa fiedleriana');
    expect(k.hasElsewhereUnder(crispa)).toBe(true);
  });
  it('Yucca filamentosa ("concava", Kew\'s Y. flaccida) is found as a page to ask; Crassula exilis too, though GBIF lists "Crassula cooperi Schönl." among its names, which Kew accepts apart', () => {
    const k = new infra.KewInfra();
    [
      { id: '291765', name: 'Yucca filamentosa', status: 'Accepted', acceptedId: '291765', ipni: '325008-2' },
      { id: '291746', name: 'Yucca flaccida', status: 'Accepted', acceptedId: '291746', ipni: '543694-1' },
      { id: '311565', name: 'Yucca filamentosa var. concava', status: 'Synonym', acceptedId: '291746' },
      { id: '291690', name: 'Yucca filamentosa subsp. concava', status: 'Synonym', acceptedId: '291746', ipni: '20003542-1' },
      { id: '2741705', name: 'Crassula exilis', status: 'Accepted', acceptedId: '2741705', ipni: '273135-1' },
      { id: '2741623', name: 'Crassula cooperi', status: 'Accepted', acceptedId: '2741623', ipni: '273059-1' },
      { id: '2741706', name: 'Crassula exilis subsp. cooperi', status: 'Synonym', acceptedId: '2741623', ipni: '878745-1' }
    ].forEach((r) => k.add(r));
    expect(k.hasElsewhereUnder({ scientific: 'Yucca filamentosa', synonyms: ['Yucca filamentosa f. bicolor Trel.'] })).toBe(true);
    const exilis = { scientific: 'Crassula exilis', synonyms: ['Crassula cooperi Schönl.', 'Crassula bolusii Schönl.'], kewEntry: '2741705' };
    // Round seventy-three: with Kew's entry known, GBIF's "Crassula cooperi Schönl." (a later name of the same words as
    // Kew's Crassula cooperi Regel) is not read as the page's own, so the subspecies goes to Kew's Crassula cooperi.
    expect(k.placedElsewhere('Crassula exilis cooperi', exilis)).toBe('Crassula cooperi');
    expect(k.placedElsewhere('Crassula exilis cooperi', { scientific: 'Crassula exilis', synonyms: exilis.synonyms })).toBeNull(); // guard: without Kew's entry, GBIF's older name is read as the page's
    expect(k.placedElsewhere('Crassula exilis cooperi', { ...exilis, acceptedElsewhere: ['Crassula cooperi Schönl.'] })).toBe('Crassula cooperi');
  });
  it('guard: a subspecies Kew accepts under the species, an autonym, a species, a name Kew does not hold', () => {
    const k = kewInfra();
    expect(k.placedElsewhere('Rhipsalis baccifera mauritiana', { scientific: 'Rhipsalis baccifera' })).toBeNull();
    expect(k.placedElsewhere('Eriosyce crispa crispa', crispa)).toBeNull();
    expect(k.placedElsewhere('Eriosyce crispa', crispa)).toBeNull();
    expect(k.placedElsewhere('Eriosyce crispa atroviridis', crispa)).toBeNull();
    expect(k.placedElsewhere('Eriosyce crispa huascensis', { scientific: 'Eriosyce eriosyzoides' })).toBeNull(); // on its own page
    expect(k.hasElsewhereUnder({ scientific: 'Rhipsalis baccifera' })).toBe(false);
  });
  it('photos() leaves out an observation of such a taxon (27 of the crispa page\'s 66 were "huascensis")', async () => {
    const k = kewInfra();
    const obs = (id: number, taxon: string) => ({ id, taxon: { name: taxon }, photos: [{ id, license_code: 'cc-by', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`, attribution: '(c) A. Grower, some rights reserved (CC BY)' }] });
    const f = async <T,>(url: string): Promise<FetchResult<T>> => ({ status: 'ok', data: { results: [obs(1, 'Eriosyce crispa huascensis'), obs(2, 'Eriosyce crispa'), obs(3, 'Eriosyce crispa crispa')] } as T });
    const r = await inat.photos(f, 438687, true, 24, { key: 7280292, kew: (t) => k.placedElsewhere(t, crispa) });
    expect(r.status === 'ok' ? r.data.map((p) => p.id) : r).toEqual(['2', '3']);
  });
});

describe('C1: --fill inat --bulk asks again only the pages Kew\'s file names, and only the sets they hold', () => {
  const k = kewInfra();
  const page2 = (photos: unknown[]) => ({ key: 7280292, name: { scientific: 'Eriosyce crispa', synonyms: crispa.synonyms }, ids: { inat: 438687, ipni: '976310-1' }, photos, upstream: { 'inat.photos.wild': { status: 'ok', at: '2026-09-19', detail: 'filled 2026-09-20' } } } as never);
  const obs = (id: number, taxon: string) => ({ id, taxon: { name: taxon }, photos: [{ id, license_code: 'cc-by', url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`, attribution: '(c) A. Grower, some rights reserved (CC BY)' }] });
  const asked: string[] = [];
  const f = async <T,>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (url.includes('/taxa?parent_id=438687')) return { status: 'ok', data: { results: [{ id: 1, name: 'Eriosyce crispa huascensis' }, { id: 2, name: 'Eriosyce crispa crispa' }] } as T };
    if (url.includes('captive=false')) return { status: 'ok', data: { results: [obs(11, 'Eriosyce crispa huascensis'), obs(12, 'Eriosyce crispa')] } as T };
    return { status: 'none' };
  };
  it('Eriosyce crispa: the wild set asked again without "huascensis"; the GBIF photographs and the unheld cultivated set left alone; a rerun passes it by', async () => {
    const d = page2([inatPhoto('11', { captive: false }), inatPhoto('99', { captive: false }), { src: 'gbif', id: '5:0', url: 'https://x.org/a.jpg', thumb: 'https://x.org/a.jpg', licence: 'by', attribution: 'A, CC BY, via GBIF' }]);
    const r = await inatKewFill(d, f, k, '2026-06-04', () => '2026-10-16T00:00:00Z');
    expect(r).toMatchObject({ done: 'asked again', placed: [['Eriosyce crispa huascensis', 'Eriosyce eriosyzoides']], was: 2, now: 1 });
    expect((d as { photos: Array<{ id: string }> }).photos.map((p) => p.id)).toEqual(['12', '5:0']);
    expect(asked.some((u) => u.includes('captive=true'))).toBe(false);
    expect((d as { upstream: Record<string, { detail?: string }> }).upstream['inat.photos.wild'].detail).toContain("descendants read against Kew's file of 2026-06-04");
    const n = asked.length;
    expect(await inatKewFill(d, f, k, '2026-06-04')).toEqual({ done: 'read before' });
    expect(asked.length).toBe(n);
  });
  it('guard: a page Kew\'s file names nothing under is not asked; one with no iNaturalist photograph is only marked', async () => {
    const before = asked.length;
    expect(await inatKewFill({ key: 1, name: { scientific: 'Rhipsalis baccifera' }, ids: { inat: 5 }, photos: [inatPhoto('1')], upstream: {} } as never, f, k, '2026-06-04')).toEqual({ done: 'not a candidate' });
    expect(await inatKewFill(page2([]), f, k, '2026-06-04')).toEqual({ done: 'marked', asked: false });
    expect(asked.length).toBe(before);
  });
});

describe('C4: Kew\'s synonyms of the page\'s entry are its own names; an older name Kew accepts apart is not', () => {
  const held = kind.heldNamesOf([{ key: 11426715, name: 'Pelecyphora missouriensis' }, { key: 2, name: 'Coryphantha macromeris' }]);
  const file = commonsFile('File:Coryphantha missouriensis - Missouri foxtail cactus - 53062305761.jpg');
  it('Pelecyphora missouriensis shows its seven "Coryphantha missouriensis" files once the Kew fill has read the page', () => {
    expect(page(dossier(11426715, 'Pelecyphora missouriensis', [file], { synonyms: ['? missouriensis Sw.'], kew: { entry: '3294950', synonyms: ['Coryphantha missouriensis', 'Cactus missouriensis'], acceptedElsewhere: [], file: '2026-06-04' } }), held)).toHaveLength(1);
  });
  it('guard: absent is not read; the file stays out, as before', () => {
    expect(page(dossier(11426715, 'Pelecyphora missouriensis', [file], { synonyms: ['? missouriensis Sw.'] }), held)).toHaveLength(0);
  });
  it('a file under an older name GBIF lists and Kew accepts as a species of its own is that species\' photograph', () => {
    const d = (kew?: P) => dossier(3, 'Agave americana', [commonsFile('File:Agave expansa in flower.jpg')], { synonyms: ['Agave expansa Jacobi'], ...(kew ? { kew } : {}) });
    expect(page(d())).toHaveLength(1); // guard: as before, without the fill
    expect(page(d({ entry: '1', synonyms: [], acceptedElsewhere: ['Agave expansa'], file: '2026-06-04' }))).toHaveLength(0);
  });
});

describe('C5: a photograph two species\' pages hold is shown on neither', () => {
  const twig = inatPhoto('475391379');
  it('Sassafras albidum\'s lead, cut twigs of several species, is also Cornus amomum\'s: --index marks both, and neither page shows it', () => {
    const marks = kind.sharedPhotos([{ key: 3034002, photos: [twig, inatPhoto('9')] }, { key: 3082227, photos: [{ ...twig, src: 'gbif', id: '1:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/475391379/original.jpg' }] }]);
    const sassafras: Array<ReturnType<typeof inatPhoto> & { shared?: number[] }> = [{ ...twig }, inatPhoto('9')];
    expect(kind.markShared(sassafras, marks.get(3034002))).toBe(true);
    expect(sassafras[0].shared).toEqual([3082227]);
    expect(page(dossier(3034002, 'Sassafras albidum', sassafras)).map((p) => p.id)).toEqual(['9']);
    expect(kind.markShared(sassafras, marks.get(3034002))).toBe(false); // a second --index changes nothing
    expect(kind.markShared(sassafras, undefined)).toBe(true); // a mark no longer true is taken off
    expect(sassafras[0].shared).toBeUndefined();
  });
  it('one page\'s two copies of a photograph are one photograph, not shared', () => {
    expect(kind.sharedPhotos([{ key: 1, photos: [twig, { ...twig, src: 'gbif', id: '1:0' }] }]).size).toBe(0);
  });
});

describe('C8: a specimen "in the … Museum" is a sheet only with a pressed word, "herbarium" or natural history', () => {
  it('Agave titanota\'s Daderot photograph in the Food and Agriculture Museum is a living plant on show', () => {
    expect(kind.sourceKind('Own work', 'Agave titanota specimen in the Food and Agriculture Museum, Tokyo University of Agriculture, Setagaya, Tokyo, Japan.')).toBeNull();
  });
  it('guard: the Smithsonian\'s and a pressed museum specimen are sheets', () => {
    expect(kind.sourceKind('', 'Commiphora myrrha specimen from the Smithsonian National Museum of Natural History')).toBe('a herbarium sheet (by its description)');
    expect(kind.sourceKind('', 'Dried specimen in the Museum of Tokyo')).toBe('a herbarium sheet (by its description)');
  });
  it('--fill commons-kind reads again a file left out only by its description, and the page shows it', async () => {
    const title = 'File:Agave titanota - Food and Agriculture Museum - Setagaya, Tokyo, Japan - DSC09882.jpg';
    const d = dossier(2767118, 'Agave titanota', [commonsFile(title, { categories: ['Agave titanota', 'Plants in the Food and Agriculture Museum'], kind: 'a herbarium sheet (by its description)' })]);
    const files = new Map([['2767118.json', JSON.parse(JSON.stringify(d))]]);
    const store = { files: () => [...files.keys()], read: <T,>(k: string) => JSON.parse(JSON.stringify(files.get(k))) as T, write: (k: string, v: unknown) => void files.set(k, JSON.parse(JSON.stringify(v))) };
    const f = async <T,>(url: string): Promise<FetchResult<T>> => {
      const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
      return { status: 'ok', data: { query: { pages: Object.fromEntries(titles.map((t, i) => [String(i + 1), { title: t, imageinfo: [{ extmetadata: { Categories: { value: 'Agave titanota|Plants in the Food and Agriculture Museum' }, ImageDescription: { value: 'Agave titanota specimen in the Food and Agriculture Museum, Tokyo University of Agriculture, Setagaya, Tokyo, Japan.' }, Artist: { value: 'Daderot' } } }] }])) } } as T };
    };
    expect(page(d as never)).toHaveLength(0);
    const c = await fill.fillCommonsKindAll(store as never, f, kind.heldNamesOf([{ key: 2767118, name: 'Agave titanota' }]));
    expect(c.shownAgain).toBe(1);
    expect(files.get('2767118.json').photos[0].kind).toBeUndefined();
    expect(page(files.get('2767118.json'))).toHaveLength(1);
  });
});

describe('C10: an e-mail address is never published as an author', () => {
  it('Trillium cuneatum and Pinguicula lutea: nothing is left but the address, so under CC BY and CC BY-SA the photograph is not shown', () => {
    const t = inatPhoto('1', { licence: 'by-sa', attribution: '(c) a.grower@example.org, some rights reserved (CC BY-SA)' });
    const g = { src: 'gbif', id: '5:0', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/original.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/medium.jpg', licence: 'by', attribution: 'observer@example.net, CC BY, iNaturalist via GBIF', page: 'https://www.inaturalist.org/photos/2' };
    expect(page(dossier(2742247, 'Trillium cuneatum', [t, inatPhoto('3')])).map((p) => p.id)).toEqual(['3']);
    expect(page(dossier(5415063, 'Pinguicula lutea', [g]))).toEqual([]);
  });
  it('a name beside the address is kept without it; a CC0 credit keeps its photograph', () => {
    expect(kind.creditWithoutMail({ src: 'inat', licence: 'by', attribution: '(c) Jo Bloggs <jo@example.org>, some rights reserved (CC BY)' })).toBe('(c) Jo Bloggs, some rights reserved (CC BY)');
    expect(kind.creditWithoutMail({ src: 'gbif', licence: 'cc0', attribution: 'jo@example.org, CC0, via GBIF' })).toBe('author not stated, CC0, via GBIF');
    expect(kind.creditWithoutMail({ src: 'inat', licence: 'by', attribution: '(c) Jo Bloggs, some rights reserved (CC BY)' })).toBe('(c) Jo Bloggs, some rights reserved (CC BY)'); // guard
  });
  it('the builder takes no such photograph from iNaturalist', async () => {
    const f = async <T,>(): Promise<FetchResult<T>> => ({ status: 'ok', data: { results: [{ id: 9, photos: [{ id: 1, license_code: 'cc-by-sa', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg', attribution: '(c) a.grower@example.org, some rights reserved (CC BY-SA)' }, { id: 2, license_code: 'cc-by', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/square.jpg', attribution: '(c) A. Grower, some rights reserved (CC BY)' }] }] } as T });
    const r = await inat.photos(f, 1, true);
    expect(r.status === 'ok' ? r.data.map((p) => p.id) : r).toEqual(['2']);
  });
});

describe('F8: iNaturalist\'s placeholder for an unprocessed photograph is not a photograph', () => {
  const placeholder = { src: 'inat', id: '63287049', url: 'https://www.inaturalist.org/attachment_defaults/local_photos/large.png', thumb: 'https://www.inaturalist.org/attachment_defaults/local_photos/medium.png', licence: 'by', attribution: '(c) Eric Knight, some rights reserved (CC BY)', page: 'https://www.inaturalist.org/observations/39863853' };
  it('Pseudophoenix sargentii, photograph 8 of 40: not shown, not counted', () => {
    expect(page(dossier(2737019, 'Pseudophoenix sargentii', [inatPhoto('1'), placeholder])).map((p) => p.id)).toEqual(['1']);
  });
  it('and the builder does not store one', async () => {
    const f = async <T,>(): Promise<FetchResult<T>> => ({ status: 'ok', data: { results: [{ id: 39863853, photos: [{ id: 63287049, license_code: 'cc-by', url: 'https://www.inaturalist.org/attachment_defaults/local_photos/square.png', attribution: '(c) Eric Knight, some rights reserved (CC BY)' }] }] } as T });
    expect((await inat.photos(f, 1, true)).status).toBe('none');
  });
});
