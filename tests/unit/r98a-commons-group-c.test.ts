/**
 * Round ninety-eight (docs/PLAN-98.md, 1): the Commons count's group C and the Commons row a build did not write.
 *
 * Group C (docs/PLAN-97.md, 3): 14 pages whose Wikidata item names no Commons category (P373), whose name's category (what
 * the build reads then) holds no files, while the item's Commons sitelink names a category with files. Round 96 read the
 * sitelink only where P373 names an empty category. Now, with no P373, the sitelink's category is read only where every
 * name of species rank Kew's file holds in those words is this plant: a category is named without an author, and "Silene
 * multifida" is Kew's both for Silene macrophylla ((Adams) Rohrb., nom. illeg.) and for another plant (Edgew., a synonym
 * of plant 2487047), so Silene macrophylla's sitelink is not read (rule 3). Marginatocereus marginatus's sitelink,
 * "Lophocereus marginatus" (90 files, read 2026-11-19), is Kew's synonym of this plant alone, and is read.
 *
 * The record: a build that did not ask Commons, since the page shows twelve photographs or more of its own sources, wrote
 * no Commons row (1,425 pages on 19 November 2026). It now writes "skipped" and why; `--fill commons-record` writes the
 * same on a page built before, dated to its build; and the previous build's Commons photographs are not carried for it.
 *
 * On 8335b5e: `KewInfra.notOnlyThisPlant`, `commonsRecordOf` and `commonsEnough` did not exist, and `itemCommonsPhotos`
 * took no name check, so an item with no P373 never read its sitelink: every case below but the guards FAILED.
 */
import { describe, it, expect } from 'vitest';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import { itemCommonsPhotos, withCategoryRead, commonsSitelinkUrl } from '$dossier/sources/commons';
import { KewInfra } from '$dossier/kew-infra';
import { commonsNotAsked, commonsEnough, commonsNameCheck, kewIdOfPageKey, COMMONS_BELOW } from '$dossier/build';
import { commonsRecordOf } from '$dossier/commons-record';
import { aliasOf } from '$dossier/tdwg-shapes';
import { STATE_UNREAD } from '$dossier/state-aliases';

/** Kew's rows as `scripts/kew-infra-load.ts` streams them (accepted id, else the row's own). */
function kew(rows: Array<[id: string, name: string, status: string, accepted?: string]>): KewInfra {
  const k = new KewInfra();
  for (const [id, name, status, accepted] of rows) k.add({ id, name, status, acceptedId: accepted || id });
  return k;
}
const KEW = kew([
  ['2488834', 'Silene macrophylla', 'Accepted'],
  ['2488900', 'Silene multifida', 'Synonym', '2488834'], // (Adams) Rohrb., nom. illeg.
  ['2487047', 'Silene edgeworthii', 'Accepted'],
  ['2488901', 'Silene multifida', 'Synonym', '2487047'], // Edgew.
  ['2359884', 'Marginatocereus marginatus', 'Accepted'],
  ['2359885', 'Lophocereus marginatus', 'Synonym', '2359884'],
  ['64587', 'Drosera silvicola', 'Accepted'],
  ['64000', 'Drosera barbigera', 'Accepted'],
  ['172607', 'Quercus eduardi', 'Accepted']
]);

describe('r98a 1: KewInfra.notOnlyThisPlant', () => {
  it('a Kew synonym of this plant alone: null (read)', () => {
    expect(KEW.notOnlyThisPlant('Lophocereus marginatus', { scientific: 'Marginatocereus marginatus', kewEntry: '2359884' })).toBeNull();
  });
  it('Silene multifida, Kew\'s for two plants: not read, and why', () => {
    expect(KEW.notOnlyThisPlant('Silene multifida', { scientific: 'Silene macrophylla', kewEntry: '2488834' })).toBe('Kew\'s file holds "Silene multifida" for another plant too (Silene edgeworthii, 2487047)');
  });
  it('another species Kew accepts: not read', () => {
    expect(KEW.notOnlyThisPlant('Drosera barbigera', { scientific: 'Drosera silvicola', kewEntry: '64587' })).toMatch(/for another plant too \(Drosera barbigera, 64000\)/);
  });
  it('a name Kew does not hold: not read', () => {
    expect(KEW.notOnlyThisPlant('Solanum ahanhuiri', { scientific: 'Solanum ajanhuiri', kewEntry: '3032828' })).toBe('Kew\'s file holds no name "Solanum ahanhuiri"');
  });
  it('the same words in another spelling of the epithet are the page\'s own name', () => {
    expect(KEW.notOnlyThisPlant('Quercus eduardii', { scientific: 'Quercus eduardi', kewEntry: '172607' })).toBeNull();
  });
  it('not two words, or the page\'s entry not known: not read', () => {
    expect(KEW.notOnlyThisPlant('Nageia fleuryi (seedlings)', { scientific: 'Nageia fleuryi', kewEntry: '378192' })).toMatch(/not a name of two words/);
    expect(KEW.notOnlyThisPlant('Lophocereus marginatus', { scientific: 'Marginatocereus marginatus' })).toMatch(/entry in Kew's file is not known/);
  });
  it('the page key gives the entry: k pages only', () => {
    expect(kewIdOfPageKey('k2359884')).toBe('2359884');
    expect(kewIdOfPageKey('g5397907')).toBeUndefined();
  });
});

/* ---- itemCommonsPhotos with no P373 ---- */
const Q = 'Q1';
const file = (n: number, title: string) => ({
  title,
  imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/P_${n}.jpg`, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P_${n}.jpg/960px-P_${n}.jpg`, width: 3000, height: 2000, descriptionurl: `https://commons.wikimedia.org/wiki/File:P_${n}.jpg`, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A. Photographer' } } }]
});
const members = (files: ReturnType<typeof file>[]) => (files.length ? { query: { pages: Object.fromEntries(files.map((x, i) => [String(i + 1), x])) } } : { batchcomplete: '' });
const sitelink = (title?: string) => ({ entities: { [Q]: { type: 'item', id: Q, sitelinks: title ? { commonswiki: { site: 'commonswiki', title, badges: [] } } : {} } } });
function source(cats: Record<string, unknown>, link: unknown) {
  const asked: string[] = [];
  const f = (async <T>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (url.startsWith('https://commons.wikimedia.org/')) {
      const cat = decodeURIComponent(new URL(url).searchParams.get('gcmtitle') ?? '').replace(/^Category:/, '');
      return cat in cats ? { status: 'ok', data: cats[cat] as T } : { status: 'refused', detail: `not in the fixture: ${cat}` };
    }
    if (url === commonsSitelinkUrl(Q)) return { status: 'ok', data: link as T };
    return { status: 'refused', detail: `not in the fixture: ${url}` };
  }) as JsonFetcher;
  return { f, asked };
}

describe('r98a 2: an item with no P373 whose name\'s category is empty', () => {
  const marg = { scientific: 'Marginatocereus marginatus', synonyms: ['Lophocereus marginatus'] };
  const lopho = [1, 2, 3].map((n) => file(n, `File:Lophocereus marginatus ${n}.jpg`));
  it('guard: without a name check, as before, the sitelink is not asked', async () => {
    const { f, asked } = source({ 'Marginatocereus marginatus': members([]), 'Lophocereus marginatus': members(lopho) }, sitelink('Category:Lophocereus marginatus'));
    expect(await itemCommonsPhotos(f, { wikidata: Q }, 'Marginatocereus marginatus', 12, marg)).toEqual({ r: { status: 'none' } });
    expect(asked.some((u) => u.includes('wikidata'))).toBe(false);
  });
  it('Kew\'s synonym of this plant alone: the sitelink\'s category is read, and the record says why', async () => {
    const { f } = source({ 'Marginatocereus marginatus': members([]), 'Lophocereus marginatus': members(lopho) }, sitelink('Category:Lophocereus marginatus'));
    const check = commonsNameCheck(KEW, { scientific: 'Marginatocereus marginatus', kewEntry: '2359884' });
    const c = await itemCommonsPhotos(f, { wikidata: Q }, 'Marginatocereus marginatus', 12, marg, check);
    expect(c.r.status === 'ok' && c.r.data.length).toBe(3);
    expect(withCategoryRead(c).detail).toBe('read Commons category "Lophocereus marginatus", the item\'s (Q1) Commons sitelink, since it has no P373 and the name\'s category "Marginatocereus marginatus" holds no files, and every name "Lophocereus marginatus" in Kew\'s file is this plant\'s');
  });
  it('Silene multifida: not read, the record saying why, and Commons asked once', async () => {
    const { f, asked } = source({ 'Silene macrophylla': members([]), 'Silene multifida': members([file(9, 'File:Silene multifida.jpg')]) }, sitelink('Category:Silene multifida'));
    const check = commonsNameCheck(KEW, { scientific: 'Silene macrophylla', kewEntry: '2488834' });
    const rec = withCategoryRead(await itemCommonsPhotos(f, { wikidata: Q }, 'Silene macrophylla', 12, { scientific: 'Silene macrophylla' }, check));
    expect(rec).toEqual({ status: 'none', detail: 'the item (Q1) has no Commons category (P373), and the name\'s, "Silene macrophylla", holds no files; its Commons sitelink "Silene multifida" not read: Kew\'s file holds "Silene multifida" for another plant too (Silene edgeworthii, 2487047)' });
    expect(asked.filter((u) => u.startsWith('https://commons.wikimedia.org/'))).toHaveLength(1);
  });
  it('a name\'s category with files is read alone, as before', async () => {
    const { f, asked } = source({ 'Marginatocereus marginatus': members([file(1, 'File:Marginatocereus marginatus.jpg')]) }, sitelink('Category:Lophocereus marginatus'));
    const c = await itemCommonsPhotos(f, { wikidata: Q }, 'Marginatocereus marginatus', 12, marg, commonsNameCheck(KEW, { scientific: 'Marginatocereus marginatus', kewEntry: '2359884' }));
    expect(c.r.status).toBe('ok');
    expect(asked.some((u) => u.includes('wikidata'))).toBe(false);
  });
});

describe('r98a 4: Namibia\'s regions of 2013 read as the places Natural Earth draws (docs/PLAN-98.md, 2)', () => {
  // On 8335b5e: aliasOf('NA', 'Zambezi') and the three codes gave nothing, so a record near the border of the Caprivi
  // Strip and Namibia naming its region by today's name or code was read as naming none; STATE_UNREAD was 238.
  it('Zambezi is the Caprivi Region renamed; Kavango East and West the two halves of Kavango', () => {
    for (const s of ['Zambezi', 'Zambezi Region', 'NA-CA', 'CA']) expect(aliasOf('NA', s), s).toEqual(['caprivi']);
    for (const s of ['Kavango East', 'Kavango West', 'NA-KE', 'NA-KW', 'KE', 'KW']) expect(aliasOf('NA', s), s).toEqual(['kavango']);
    expect(STATE_UNREAD.subdivisions).toBe(235);
  });
});

describe('r98a 3: the Commons row a build did not write', () => {
  const photo = (n: number) => ({ src: 'inat' as const, id: String(n), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${n}/original.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${n}/medium.jpg`, licence: 'by' as const, attribution: 'Jane Doe, CC BY', page: `https://www.inaturalist.org/observations/${n}` });
  const page = (n: number, extra: Record<string, unknown> = {}) => ({ key: 'k1' as never, name: { scientific: 'Aloe vera' }, photos: Array.from({ length: n }, (_, i) => photo(i + 1)), upstream: {}, built: '2026-11-18T10:00:00.000Z', ...extra });
  it('twelve or more of its own: "skipped", dated to its build, and why', () => {
    expect(commonsRecordOf(page(25))).toEqual({ row: { status: 'skipped', at: '2026-11-18T10:00:00.000Z', detail: commonsNotAsked(25) } });
    expect(commonsNotAsked(25)).toBe(`not asked: the page shows 25 photographs of its own sources, and Commons is asked only while a page shows fewer than ${COMMONS_BELOW}`);
  });
  it('each photograph counted once: the same iNaturalist photograph twice is one', () => {
    const p = page(11);
    p.photos.push({ ...photo(1), src: 'gbif' as never });
    expect(commonsRecordOf(p)).toEqual({ unknown: 11 });
  });
  it('fewer than twelve, or no build\'s time: nothing written, the reason not known', () => {
    expect(commonsRecordOf(page(5))).toEqual({ unknown: 5 });
    expect(commonsRecordOf(page(20, { built: undefined }))).toEqual({ unknown: 20 });
  });
  it('a page with a Commons row: nothing', () => {
    expect(commonsRecordOf(page(25, { upstream: { commons: { status: 'none', at: 'x' } } }))).toBeNull();
  });
  it('the row is known as this reason, so the previous build\'s Commons photographs are not carried for it', () => {
    expect(commonsEnough({ status: 'skipped', detail: commonsNotAsked(30) })).toBe(true);
    expect(commonsEnough({ status: 'skipped', detail: 'not asked offline' })).toBe(false);
    expect(commonsEnough({ status: 'refused', detail: commonsNotAsked(30) })).toBe(false);
  });
});
