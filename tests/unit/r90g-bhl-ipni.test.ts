/**
 * Round ninety (the owner's decision of 14 November 2026; docs/ROUND-90.md, lead 2): where BHL's resolver answers Kew's
 * citation with several citations, the BHL fill asks again within the one BHL title IPNI links the name's publication to,
 * and takes the answer only by every rule of the first ask. Measured on 82 such citations: a page for 22; on 100 the fill
 * had linked, the same page or none, never another.
 *
 * The example is the measurement's own: Homalomena occulta, "Melet. Bot.: 20 (1832)", IPNI 87255-1, whose publication IPNI
 * links to BHL's title 40101 ("Meletemata botanica"), page 28142661.
 *
 * On 3fd09ac: FAILED. The fill took "BHL's resolver gave 2 citations, not one" as the answer and asked nothing more, a page
 * answered so was passed by on every later run, and the page's line had no word of IPNI.
 */
import { describe, it, expect } from 'vitest';
import { fillBhl, bhlAsk, bhlUrl, bhlTitleUrl, ipniNameUrl, ipniBhlTitle, bhlLine, bhlWanted, SEVERAL } from '$dossier/bhl';
import type { BhlPage } from '$dossier/bhl';
import { elsewhereView } from '$lib/ui/ref/links-words';
import { fixtureFetcher } from '$dossier/fetch';

const DAY = '2026-11-15';
const PUB = { place: 'Melet. Bot.', volPage: ': 20', year: '(1832)', row: '87255-1' };
const A = bhlAsk(PUB) as { title: string; volume?: string; page: string; year: string };
const MELET = { Url: 'https://www.biodiversitylibrary.org/page/28142661', Title: 'Meletemata botanica', PublisherPlace: 'Vindobonae', Authors: ['Schott, H. W. (Heinrich Wilhelm),'], Date: '1832', Volume: '', SPage: 'Page 20' };
const OTHER = { ...MELET, Url: 'https://www.biodiversitylibrary.org/page/99', Title: 'Meletemata botanica (another copy)' };
const answer = (...cs: object[]) => ({ Status: 1, Message: '', citations: cs });
const IPNI = { name: 'Homalomena occulta', linkedPublication: { abbreviation: 'Melet. Bot.', bhlTitleLink: 'http://www.biodiversitylibrary.org/openurl?ctx_ver=Z39.88-2004&rft_id=http://www.biodiversitylibrary.org/bibliography/40101&rft_val_fmt=info:ofi/fmt:kev:mtx:book&url_ver=z39.88-2004' } };

// The page as the fill reads it (svelte-check: a looser record was not a BhlPage).
type Published = NonNullable<NonNullable<BhlPage['elsewhere']>['published']>;
type Pg = { key: string; name: { scientific: string }; ids?: { ipni?: string }; elsewhere: { published: Published } };
function storeOf(pages: Record<string, Pg>) {
  const urls: string[] = [];
  return { pages, urls, store: { files: () => Object.keys(pages), read: <T,>(f: string) => structuredClone(pages[f]) as T, write: (f: string, d: unknown) => { pages[f] = d as Pg; } } };
}
const page = (bhl?: Published['bhl'], ipni: string | undefined = '87255-1'): Pg => ({ key: 'k100023', name: { scientific: 'Homalomena occulta' }, ...(ipni ? { ids: { ipni } } : {}), elsewhere: { published: { ...PUB, ...(bhl ? { bhl } : {}) } } });
/** A fetcher answering from `table`, recording each address asked. */
const asking = (table: Record<string, unknown>, urls: string[]) => { const f = fixtureFetcher(table); return (async (u: string, o?: object) => { urls.push(u); return f(u, o as never); }) as typeof f; };

describe('r90g 1: the second ask, by IPNI\'s title', () => {
  it('reads BHL\'s title id from IPNI\'s record, and asks BHL within it with the citation\'s page and year', () => {
    expect(ipniBhlTitle(IPNI)).toBe(40101);
    expect(ipniBhlTitle({ linkedPublication: {} })).toBeNull();
    expect(ipniBhlTitle(null)).toBeNull();
    expect(ipniNameUrl('87255-1')).toBe('https://www.ipni.org/api/1/n/urn:lsid:ipni.org:names:87255-1');
    expect(bhlTitleUrl(A, 40101)).toBe('https://www.biodiversitylibrary.org/openurl?pid=title%3A40101&spage=20&date=1832&format=json');
    expect(SEVERAL.test("BHL's resolver gave 2 citations, not one")).toBe(true);
  });

  it('a citation Kew\'s title answers with several: IPNI, then BHL in that title; one page by every rule is taken, said as IPNI\'s', async () => {
    const s = storeOf({ 'k.json': page() });
    const c = await fillBhl(s.store as never, asking({ [bhlUrl(A)]: answer(MELET, OTHER), [ipniNameUrl('87255-1')]: IPNI, [bhlTitleUrl(A, 40101)]: answer(MELET) }, s.urls), DAY, { gapMs: 0 });
    expect(s.urls).toEqual([bhlUrl(A), ipniNameUrl('87255-1'), bhlTitleUrl(A, 40101)]);
    expect(s.pages['k.json'].elsewhere.published.bhl).toEqual({ page: 28142661, read: DAY, ipni: { title: 40101, read: DAY } }); // base: { none: "…gave 2 citations, not one" }
    expect(c).toMatchObject({ asked: 1, none: 1, byIpni: { asked: 1, linked: 1, none: 0, unanswered: 0 } });
    expect(bhlLine(c, DAY)).toContain("; 1 that Kew's title gave several citations for asked again by the BHL title IPNI links their publication to: 1 linked, 0 with no page taken (said why), 0 not answered;");
    // The page's line: BHL's page, with IPNI named for the title.
    expect(elsewhereView({ ids: {}, links: {}, elsewhere: s.pages['k.json'].elsewhere as never }).published).toEqual({ text: 'Melet. Bot.: 20 (1832)', bhl: 'https://www.biodiversitylibrary.org/page/28142661', byIpni: 40101 });
  });

  it('a citation answered so on an earlier day is asked the second time only, never the first again', async () => {
    const s = storeOf({ 'k.json': page({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' }) });
    expect(bhlWanted(s.pages['k.json'])).toBe(true); // base: false, passed by for good
    const c = await fillBhl(s.store as never, asking({ [ipniNameUrl('87255-1')]: IPNI, [bhlTitleUrl(A, 40101)]: answer(MELET) }, s.urls), DAY, { gapMs: 0 });
    expect(s.urls).toEqual([ipniNameUrl('87255-1'), bhlTitleUrl(A, 40101)]);
    expect(c).toMatchObject({ asked: 0, before: 0, byIpni: { linked: 1 } });
    expect(s.pages['k.json'].elsewhere.published.bhl).toMatchObject({ page: 28142661, ipni: { title: 40101 } });
  });

  it('BHL\'s answer in IPNI\'s title is judged by every rule: another page number is not taken, and the first answer stands beside why', async () => {
    const s = storeOf({ 'k.json': page({ none: "BHL's resolver gave 3 citations, not one", read: '2026-11-14' }) });
    await fillBhl(s.store as never, asking({ [ipniNameUrl('87255-1')]: IPNI, [bhlTitleUrl(A, 40101)]: answer({ ...MELET, SPage: 'Page 21' }) }, s.urls), DAY, { gapMs: 0 });
    expect(s.pages['k.json'].elsewhere.published.bhl).toEqual({ none: "BHL's resolver gave 3 citations, not one", read: '2026-11-14', ipni: { title: 40101, none: 'BHL\'s page is numbered “Page 21”, not page 20', read: DAY } });
    expect(elsewhereView({ ids: {}, links: {}, elsewhere: s.pages['k.json'].elsewhere as never }).published).toEqual({ text: 'Melet. Bot.: 20 (1832)' });
  });
});

describe('r90g 2: what is not asked, and what is asked again', () => {
  it('guard: a citation Kew\'s title answers with one page asks IPNI nothing', async () => {
    const s = storeOf({ 'k.json': page() });
    const c = await fillBhl(s.store as never, asking({ [bhlUrl(A)]: answer(MELET) }, s.urls), DAY, { gapMs: 0 });
    expect(s.urls).toEqual([bhlUrl(A)]);
    expect(c.byIpni).toBeUndefined();
    expect(s.pages['k.json'].elsewhere.published.bhl).toEqual({ page: 28142661, read: DAY });
  });
  it('guard: no second ask for a none of another kind, nor for a page with no IPNI id', async () => {
    const s = storeOf({ 'a.json': page({ none: "BHL's resolver found no page for the citation", read: '2026-11-14' }), 'b.json': page({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' }, '') });
    const c = await fillBhl(s.store as never, asking({}, s.urls), DAY, { gapMs: 0 });
    expect(s.urls).toEqual([]);
    expect(c).toMatchObject({ before: 2 });
  });
  it('IPNI links no BHL title: said, kept, and not asked again', async () => {
    const s = storeOf({ 'k.json': page({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' }) });
    await fillBhl(s.store as never, asking({ [ipniNameUrl('87255-1')]: { name: 'Homalomena occulta', linkedPublication: { abbreviation: 'Melet. Bot.' } } }, s.urls), DAY, { gapMs: 0 });
    expect(s.pages['k.json'].elsewhere.published.bhl).toMatchObject({ none: "BHL's resolver gave 2 citations, not one", ipni: { none: "IPNI links the name's publication to no BHL title", read: DAY } });
    s.urls.length = 0;
    expect(await fillBhl(s.store as never, asking({}, s.urls), DAY, { gapMs: 0 })).toMatchObject({ before: 1 });
    expect(s.urls).toEqual([]);
  });
  it('IPNI not answered: nothing written of it, and the next run asks again (rule 2: not checked, never none)', async () => {
    const s = storeOf({ 'k.json': page({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' }) });
    const c = await fillBhl(s.store as never, asking({}, s.urls), DAY, { gapMs: 0 });
    expect(c.byIpni).toMatchObject({ asked: 1, unanswered: 1 });
    expect(s.pages['k.json'].elsewhere.published.bhl).toEqual({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' });
    expect(bhlWanted(s.pages['k.json'])).toBe(true);
  });
  it('the day\'s allowance spent before BHL\'s second answer: the run stops there, holding, and the citation waits', async () => {
    const s = storeOf({ 'k.json': page({ none: "BHL's resolver gave 2 citations, not one", read: '2026-11-14' }) });
    const spent = "www.biodiversitylibrary.org: today's allowance of 4000 requests is spent (UTC 2026-11-15); asked again tomorrow";
    const f = fixtureFetcher({ [ipniNameUrl('87255-1')]: IPNI });
    const c = await fillBhl(s.store as never, (async (u: string, o?: object) => (u.includes('biodiversitylibrary') ? { status: 'refused', detail: spent } : f(u, o as never))) as never, DAY, { gapMs: 0 });
    expect(c.held).toBe(spent);
    expect(c.byIpni).toMatchObject({ asked: 0 });
    expect(bhlWanted(s.pages['k.json'])).toBe(true);
  });
});

// The page's line, rendered, is read in the browser suite on the fixture species (tests/e2e/r87s2-species.spec.ts, r87s2 1):
// a component mounted here added a browser to the unit tests, and three predeploys timed out on others' browsers.
