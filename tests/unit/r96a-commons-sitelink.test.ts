/**
 * Round ninety-six: a page's Commons photographs where its Wikidata item's Commons category (P373) holds no files
 * (docs/PLAN-96.md). Heberdenia bahamensis's item, Q15304926, names "Heberdenia excelsa" in P373, a Commons category with
 * no files, while its Commons sitelink (commonswiki) is "Category:Heberdenia bahamensis", with 11 files (both read
 * 2026-11-19). The build read P373's category alone, and round 95's walk took the page from 11 photographs to none
 * (docs/REVIEW-ROUND-95.md, "The online build"). Now, where P373's category answers no file at all, the sitelink's
 * category is read, and the record of Commons says which category was read and why (rule 3). A P373 category whose files
 * the rules all leave out is not empty, and the sitelink is not asked; a sitelink that is a gallery is not read; a
 * sitelink Wikidata did not answer is said as not answered, never as no photographs (rule 2).
 *
 * On ee3ee0d: the build read `commonsPhotos(f, "Heberdenia excelsa")` alone (build.ts and build-kew.ts), which answers
 * none for the empty category (the guard below), so the page had no Commons photograph and its record said nothing of
 * the sitelink; `itemCommonsPhotos` did not exist and every case but the guards FAILED.
 */
import { describe, it, expect } from 'vitest';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import { commonsPhotos, itemCommonsPhotos, withCategoryRead, commonsSitelinkUrl } from '$dossier/sources/commons';

const Q = 'Q15304926';
const P373 = 'Heberdenia excelsa';
const LINKED = 'Heberdenia bahamensis';
const names = { scientific: 'Heberdenia bahamensis' };

/** A file in the shape Commons answers `imageinfo` (as in r68d), CC BY-SA 4.0 with its author. */
const file = (n: number, title = `File:Heberdenia bahamensis ${n}.jpg`) => ({
  title,
  imageinfo: [{
    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Heberdenia_bahamensis_${n}.jpg`,
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Heberdenia_bahamensis_${n}.jpg/960px-Heberdenia_bahamensis_${n}.jpg`,
    width: 3000, height: 2000,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:Heberdenia_bahamensis_${n}.jpg`,
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A. Photographer' } }
  }]
});
const members = (files: ReturnType<typeof file>[]) => (files.length ? { query: { pages: Object.fromEntries(files.map((x, i) => [String(i + 1), x])) } } : { batchcomplete: '' });
const sitelink = (title?: string) => ({ entities: { [Q]: { type: 'item', id: Q, sitelinks: title ? { commonswiki: { site: 'commonswiki', title, badges: [] } } : {} } } });

/** A fetcher answering Commons by the category asked and Wikidata by the sitelink address; every address asked is kept. */
function source(cats: Record<string, unknown>, link: FetchResult<unknown> | { ok: unknown }) {
  const asked: string[] = [];
  const f = (async <T>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (url.startsWith('https://commons.wikimedia.org/')) {
      const cat = decodeURIComponent(new URL(url).searchParams.get('gcmtitle') ?? '').replace(/^Category:/, '');
      return cat in cats ? { status: 'ok', data: cats[cat] as T } : { status: 'refused', detail: `not in the fixture: ${cat}` };
    }
    if (url === commonsSitelinkUrl(Q)) return ('ok' in link ? { status: 'ok', data: link.ok as T } : link) as FetchResult<T>;
    return { status: 'refused', detail: `not in the fixture: ${url}` };
  }) as JsonFetcher;
  return { f, asked };
}
const eleven = Array.from({ length: 11 }, (_, i) => file(i + 1));
const item = { wikidata: Q, commonsCategory: P373 };

describe('Heberdenia bahamensis: P373 names an empty category, the sitelink one with files', () => {
  it('guard: P373\'s category alone, as the build read it on ee3ee0d, gives no photograph', async () => {
    const { f } = source({ [P373]: members([]) }, { ok: sitelink(`Category:${LINKED}`) });
    expect((await commonsPhotos(f, P373, 12, names)).status).toBe('none');
  });
  it('the sitelink\'s category is read and its photographs taken', async () => {
    const { f, asked } = source({ [P373]: members([]), [LINKED]: members(eleven) }, { ok: sitelink(`Category:${LINKED}`) });
    const c = await itemCommonsPhotos(f, item, LINKED, 12, names);
    expect(c.r.status).toBe('ok');
    expect(c.r.status === 'ok' && c.r.data.length).toBe(11);
    expect(asked.filter((u) => u.startsWith('https://commons.wikimedia.org/')).map((u) => new URL(u).searchParams.get('gcmtitle'))).toEqual([`Category:${P373}`, `Category:${LINKED}`]);
  });
  it('the record says which category was read and why', async () => {
    const { f } = source({ [P373]: members([]), [LINKED]: members(eleven) }, { ok: sitelink(`Category:${LINKED}`) });
    const rec = withCategoryRead(await itemCommonsPhotos(f, item, LINKED, 12, names));
    expect(rec).toEqual({ status: 'ok', detail: `read Commons category "${LINKED}", the item's (${Q}) Commons sitelink, since its P373 category "${P373}" holds no files` });
  });
});

describe('the rule\'s edges (guards: each read as before, or said)', () => {
  it('a P373 category with files is read alone, and Wikidata is not asked', async () => {
    const { f, asked } = source({ [P373]: members([file(1)]) }, { ok: sitelink(`Category:${LINKED}`) });
    const c = await itemCommonsPhotos(f, item, LINKED, 12, names);
    expect(c.r.status).toBe('ok');
    expect(c.detail).toBeUndefined();
    expect(asked.some((u) => u.includes('wikidata'))).toBe(false);
  });
  it('a P373 category whose files the rules all leave out is not empty: the sitelink is not asked', async () => {
    const map = { ...file(1, 'File:Heberdenia bahamensis distribution map.jpg') };
    const { f, asked } = source({ [P373]: members([map]) }, { ok: sitelink(`Category:${LINKED}`) });
    const c = await itemCommonsPhotos(f, item, LINKED, 12, names);
    expect(c.r.status).toBe('none');
    expect(asked.some((u) => u.includes('wikidata'))).toBe(false);
  });
  it('an item with no P373 reads the name\'s category, as before', async () => {
    const { f, asked } = source({ [LINKED]: members([]) }, { ok: sitelink(`Category:${LINKED}`) });
    const c = await itemCommonsPhotos(f, { wikidata: Q }, LINKED, 12, names);
    expect(c).toEqual({ r: { status: 'none' } });
    expect(asked.some((u) => u.includes('wikidata'))).toBe(false);
  });
  it('a sitelink that is a gallery is not read, and the record says so', async () => {
    const { f, asked } = source({ [P373]: members([]) }, { ok: sitelink(LINKED) });
    const c = await itemCommonsPhotos(f, item, LINKED, 12, names);
    expect(c.r.status).toBe('none');
    expect(c.detail).toBe(`the item's (${Q}) Commons category (P373) "${P373}" holds no files; its Commons sitelink "${LINKED}" is a gallery, not a category, and is not read`);
    expect(asked.filter((u) => u.startsWith('https://commons.wikimedia.org/'))).toHaveLength(1);
  });
  it('no sitelink: none, and the record says the category is empty and there is no sitelink', async () => {
    const { f } = source({ [P373]: members([]) }, { ok: sitelink() });
    const rec = withCategoryRead(await itemCommonsPhotos(f, item, LINKED, 12, names));
    expect(rec).toEqual({ status: 'none', detail: `the item's (${Q}) Commons category (P373) "${P373}" holds no files, and it has no Commons sitelink` });
  });
  it('a sitelink naming the same category (written with underscores) is not read twice', async () => {
    const { f, asked } = source({ [P373]: members([]) }, { ok: sitelink('Category:Heberdenia_excelsa') });
    const c = await itemCommonsPhotos(f, item, LINKED, 12, names);
    expect(c.r.status).toBe('none');
    expect(asked.filter((u) => u.startsWith('https://commons.wikimedia.org/'))).toHaveLength(1);
  });
  it('rule 2: a sitelink Wikidata refused is said as refused, never as no photographs', async () => {
    const { f } = source({ [P373]: members([]) }, { status: 'refused', detail: 'HTTP 429' });
    const rec = withCategoryRead(await itemCommonsPhotos(f, item, LINKED, 12, names));
    expect(rec.status).toBe('refused');
    expect(rec.detail).toContain(`"${P373}" holds no files; its Commons sitelink not read: HTTP 429`);
  });
});
