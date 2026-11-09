/**
 * The browse engine on the server (round eighty-seven, C1 and C2): the table of the corpus a request holds, a query's
 * answer as the page shows it, with every link worked out here, and the entries of the species a page shows tiles for.
 * One function, `browseView`, is every browse page's answer: /browse and each entrance page, which fixes part of the
 * query (`fixed`) and sends every other choice to /browse.
 */
import { error, redirect, isHttpError } from '@sveltejs/kit';
import { limited } from '$lib/server/sync';
import { corpusNow, fromFiles, searchedFromFiles, indexOf, product, stored, UNREADABLE, type Loaded, type Platform, type Fetch, type IndexEntry } from '$lib/server/dossiers';
import type { Blocks } from '$core/search-files';
import { SHOW_BLOCK } from '$core/search-files';
import { tileCredit } from '$lib/ui/ref/head';
import { browseTableOf, browseCountsOf, isBrowseTable, keyAt, slugAt, BROWSE_FILE, BROWSE_COUNTS_FILE, BROWSE_UNBUILT, type BrowseTable, type BrowseCounts } from './table';
import { prepared, runQuery, parseQuery, queryString, titleOf, pillsOf, whereOf, filtered, wholeCounts, onlyHere, allRows, regionCounts, lowAt, PAGE, EMPTY, GENUS_PAGE_MIN, type Prepared, type BrowseQuery, type BrowseAnswer } from './engine';
import { regionOf, REGIONS, level3Of } from './tdwg';
import { slugify, withoutSign } from '$core/names';
import { builtWords } from './sources';
import { nameOrder } from './order';
import mapPoints from './map-points.json';
import { lastmodOf } from '$lib/server/sitemap';
import { climateWord, climateWordOf } from './climate-words';
import { entranceCountsOf, entranceCountsIn, type EntranceCounts } from './counts';
import type { BrowseView, ViewItem } from './view';
export type { BrowseView, ViewItem, Link } from './view';

/* ---------- the table ---------- */

const fromIndex = new WeakMap<object, BrowseTable>();
/**
 * The prepared table of the corpus `c`: the build's `browse.json` under a manifest that names it, else made from the
 * index the server holds or may read (the fixture's, a static corpus's, a manifest's built before the key files). A
 * corpus searched from its key files, whose index nothing on the Worker reads, and whose manifest names no table, is a
 * 503 that says so (`BROWSE_UNBUILT`), never a page of no species (rule 2).
 */
export async function browseOf(c: Loaded, platform: Platform, fetch: Fetch): Promise<Prepared> {
  if (fromFiles(c) && c.manifest!.files[BROWSE_FILE]) {
    const t = await product<unknown>(c, platform, fetch, BROWSE_FILE);
    if (!isBrowseTable(t, c.manifest!.species)) {
      console.error(`${BROWSE_FILE} of corpus ${c.corpus} could not be read, or is not a table of its ${c.manifest!.species} species`);
      error(503, { message: UNREADABLE, unreadable: true });
    }
    return prepared(t);
  }
  if (searchedFromFiles(c)) error(503, { message: BROWSE_UNBUILT, unreadable: true });
  const idx = c.idx ?? (await indexOf(c, platform, fetch));
  let t = fromIndex.get(idx);
  if (!t) fromIndex.set(idx, (t = browseTableOf(idx)));
  return prepared(t);
}

/**
 * The browse counts the front page shows (round eighty-seven, the integration): the build's `browse-counts.json` under a
 * manifest that names it, else counted from the table the server makes of an index it holds; null where neither is (a
 * manifest built before the file), or the file cannot be read, so the page shows no count rather than one it did not read.
 *
 * With them, the counts of the index pages (`entranceCountsOf`; the review of stage 1, B1): the regions, families and
 * genera /region, /family and /genus list, and the species whose cultivated observations are not counted. A file that
 * holds them gives them; one written before has only `grown`, and the front page then shows no count for the others
 * rather than another grouping's (the old catalogue's origin groups were "3 regions" where /region lists 14).
 */
export type FrontCounts = BrowseCounts & Partial<EntranceCounts>;
export async function browseCounts(c: Loaded, platform: Platform, fetch: Fetch): Promise<FrontCounts | null> {
  if (fromFiles(c)) {
    if (!c.manifest!.files[BROWSE_COUNTS_FILE]) return null;
    const x = await product<BrowseCounts>(c, platform, fetch, BROWSE_COUNTS_FILE).catch(() => null);
    return x && (x.grown === null || (Number.isInteger(x.grown) && x.grown >= 0)) ? { grown: x.grown, ...entranceCountsIn(x) } : null;
  }
  return browseOf(c, platform, fetch).then((p) => ({ ...browseCountsOf(p.t), ...entranceCountsOf(p) }), () => null);
}

/* ---------- a browse page's request ---------- */

/** The words of a browse page's 429 (round eighty-seven, S5), as /browse said them. */
export const TOO_MANY_PAGES = 'Too many pages from this address just now; wait a minute and try again';
/**
 * Every render of a browse page is counted under the `render` bucket (round eighty-seven, the review of stage 1, S5):
 * /browse was, and /region, /genus, /family and the pages under them were counted in none, though each reads the table
 * whole. A page past the address's allowance is a 429 in words, as /browse's was.
 */
export async function countRender(platform: Platform, getClientAddress: () => string): Promise<void> {
  const stop = await limited(platform, getClientAddress, 'render').catch(() => null);
  if (stop) error(429, { message: TOO_MANY_PAGES });
}
/** The browse pages' HTML is kept a minute by the reader's browser alone (S4): it names the build's hashed chunks, as every page's does. */
export const BROWSE_CACHE = 'private, max-age=60';
/**
 * And the headers they are sent with: rendered in the reader's units (a record low in °C or °F, as the species page's;
 * the review of stage 2's pages, 4), so the browser keeps one reader's copy apart from another's by the units cookie
 * and the language, as the species page and the front page say.
 */
export const BROWSE_HEADERS = { 'cache-control': BROWSE_CACHE, vary: 'accept-language, cookie' };

/**
 * A browse page's address in its one spelling (round eighty-seven, S5): the query as the page reads it and in its own
 * order (`queryString`), and nothing else. A parameter the page does not read (a tracking tag, a timestamp) or a value
 * spelt another way moved to that spelling, so one view is one address and no spelling of it is a fresh render. On an
 * entrance page the address holds only what the page reads from it (the page, the view, the order, the rail); /browse
 * reads every choice. `own` is an index page's own reading, for /genus's letter; an index page that reads nothing has ''.
 */
export function canonicalSearch(url: URL, kind: 'browse' | 'entrance' | 'index', own = ''): string {
  if (kind === 'index') return own;
  const q = parseQuery(url.searchParams);
  // A region code the scheme does not hold is left out of the view and named in `gone=`, so the page says so (the review
  // of stage 2's pages, 6): a pin of a region a later reference dropped otherwise opened the wider view without a word.
  const gone = kind === 'browse' && q.gone?.length ? `gone=${q.gone.join(',')}` : '';
  const qs = kind === 'browse' ? queryString(q) : queryString({ ...EMPTY, at: q.at, view: q.view, sort: q.sort, in: q.in, more: q.more });
  return gone ? `${qs}${qs ? '&' : '?'}${gone}` : qs;
}
/**
 * Moves a request to its address's one spelling, when it is not that already. Compared as parameters, not as text: the
 * client's router asks for `?r=CPV%2CNAM` where the link says `?r=CPV,NAM`, the same address, and a comparison of the
 * text sent it round in a loop.
 */
export function toCanonical(url: URL, search: string): void {
  if (new URLSearchParams(search).toString() !== url.searchParams.toString()) redirect(301, `${url.pathname}${search}`);
}

/**
 * The index entries at these places, for the tiles' photographs: from the index held, or from the key files' show
 * blocks (sixteen entries a block, read as products are and kept with them). An entry whose id is not the table's at
 * its place (two generations met) is left out, and its tile shows no photograph rather than another plant's.
 */
export async function entriesAt(c: Loaded, platform: Platform, fetch: Fetch, t: BrowseTable, rows: readonly number[]): Promise<Map<number, IndexEntry>> {
  const out = new Map<number, IndexEntry>();
  const keep = (i: number, e: IndexEntry | undefined) => { if (e && e.key === keyAt(t, i)) out.set(i, e); };
  if (c.idx) { for (const i of rows) keep(i, c.idx[i]); return out; }
  if (!searchedFromFiles(c)) { const idx = await indexOf(c, platform, fetch); for (const i of rows) keep(i, idx[i]); return out; }
  const blocks = await product<Blocks>(c, platform, fetch, 'search/blocks.json');
  if (!blocks || !Array.isArray(blocks.show)) return out; // the tiles say no photograph was read; the list stands
  const want = [...new Set(rows.map((i) => Math.floor(i / SHOW_BLOCK)))];
  const got = await Promise.all(want.map(async (b) => [b, await stored<IndexEntry[]>(c, platform, fetch, blocks.show[b] ?? '')] as const));
  const by = new Map(got);
  for (const i of rows) { const b = by.get(Math.floor(i / SHOW_BLOCK)); keep(i, Array.isArray(b) ? b[i % SHOW_BLOCK] : undefined); }
  return out;
}

/* ---------- a view ---------- */

/** An open licence as a tile's credit states it: a photograph for a share image must carry one, never "licence not stated". */
const OPEN = /^Photo: (?:CC0|CC BY(?:-SA)?(?: [\d.]+)?|public domain)(?:,|$)/i;

/**
 * The view of a query: its answer, with each choice's link. `fixed` is the part an entrance page holds (its region, its
 * genus, its family): kept in every link, which go to /browse once anything else is chosen.
 */
export async function browseView(c: Loaded, platform: Platform, fetch: Fetch, url: URL, fixed: Partial<BrowseQuery> = {}, base = '/browse'): Promise<{ view: BrowseView; p: Prepared; answer: BrowseAnswer }> {
  const p = await browseOf(c, platform, fetch);
  // An entrance page is its fixed part and nothing else: it reads only the page, the view, the order and the rail from
  // its address, so its figures are its own and its address is one page (every other choice is a link to /browse).
  const asked = parseQuery(url.searchParams);
  const entrance = base !== '/browse';
  const q: BrowseQuery = entrance ? { ...EMPTY, at: asked.at, view: asked.view, sort: asked.sort, in: asked.in, more: asked.more, ...fixed } : asked;
  const a = runQuery(p, q);
  const t = p.t;
  // A link from this view: to /browse with the change, or, when only the page, the view or the rail changes on an
  // entrance page, to the entrance itself.
  const own = (o: Partial<BrowseQuery>) => Object.keys(o).every((k) => k === 'at' || k === 'view' || k === 'sort' || k === 'in' || k === 'more');
  const sansFixed = (x: BrowseQuery): BrowseQuery => ({ ...x, r: fixed.r ? x.r.filter((r) => !fixed.r!.includes(r)) : x.r, f: fixed.f ? '' : x.f, g: fixed.g ? '' : x.g });
  const href = (o: Partial<BrowseQuery>) => (base !== '/browse' && own(o) ? `${base}${queryString(sansFixed(a.query), o)}` : `/browse${queryString(a.query, o)}`);

  const rows = a.rows;
  const ents = a.query.view === 'tiles' ? await entriesAt(c, platform, fetch, t, rows) : new Map<number, IndexEntry>();
  const items: ViewItem[] = rows.map((i) => {
    const e = ents.get(i);
    const credit = e?.thumb ? tileCredit(e) ?? undefined : undefined;
    return {
      slug: slugAt(t, i), name: t.name[i], ...(t.common[i] ? { common: t.common[i] } : {}), ...(t.family[i] >= 0 ? { family: t.families[t.family[i]] } : {}),
      where: whereOf(p, i), ...(onlyHere(p, i, a.query.r) ? { only: true } : {}), climate: climateWord(t.climate[i], t.gbif[i]), climateCell: climateWordOf(t.climate[i], t.gbif[i]), climateKnown: t.climate[i] === 'o', grown: t.grown[i] >= 0 ? t.grown[i] : null,
      // The record low where the index holds it (round eighty-seven, stage 2): a number, or null for a species with none.
      ...(p.lows ? { low: lowAt(p.lows, i) } : {}),
      ...(e?.thumb ? { thumb: e.thumb, ...(credit ? { credit } : {}) } : {})
    };
  });
  const shareItem = items.find((x) => x.thumb && x.credit && OPEN.test(x.credit));

  const n = a.total;
  const r = a.rail;
  // The view as a pin keeps it (round eighty-seven, C6): its browse query alone (no page, order, view or rail), and the
  // page it is, an entrance page by its own address.
  const pinQuery = queryString({ ...a.query, at: 0, sort: 'grown', view: 'tiles', in: '', more: '' });
  // The results map (C7): of every result, how many are native to each level-3 region, and a click on one narrows the
  // view to the species native there as well (all of the regions then; one region ticked if none was).
  const ticked3 = new Set(a.query.r.flatMap((c) => level3Of(c)));
  const map = a.query.view !== 'map' ? null : (() => {
    const rc = regionCounts(p, allRows(p, a.query));
    const regions = [...rc.l3].map(([code, k]) => {
      const x = regionOf(code)!;
      const pt = (mapPoints as { at: Record<string, number[]> }).at[code] ?? [0, 0, 1];
      return { code, label: x.label, slug: x.slug, n: k, at: [pt[0], pt[1], pt[2]] as [number, number, number], filtered: ticked3.has(code), ...(ticked3.has(code) ? {} : { href: href({ r: [...a.query.r, code], all: a.query.r.length > 0, view: 'map' }) }) };
    }).sort((x, y) => y.n - x.n || nameOrder(x.label, y.label));
    return { regions, wide: [...rc.wide].map(([code, k]) => ({ label: regionOf(code)!.label, n: k })) };
  })();
  const regionLink = (o: (typeof r.options)[number]) => ({ code: o.code, level: o.level, label: o.label, n: o.n, on: o.on, plus: o.plus, href: href({ r: o.next, ...(o.next.length < 2 ? { all: false } : {}), ...(o.next.length ? {} : { only: false }) }), ...(o.level < 3 ? { open: href({ in: o.code }) } : {}) });
  const view: BrowseView = {
    base,
    query: a.query,
    ...(!entrance && asked.gone?.length ? { gone: asked.gone } : {}),
    // The address's own query: on an entrance page, what it holds beyond its fixed part (none, on the page itself).
    qs: queryString(entrance ? sansFixed(a.query) : a.query),
    title: titleOf(p, a.query),
    total: n,
    filtered: filtered(a.query),
    items,
    photosRead: a.query.view !== 'tiles' || ents.size > 0 || !rows.length,
    rail: {
      line: [{ label: 'All regions', href: href({ in: '' }) }, ...r.line.map((x) => ({ label: x.label, href: href({ in: x.code }) }))],
      options: r.options.map(regionLink),
      ticked: r.ticked.map(regionLink),
      countries: r.countries.map((x) => ({ label: x.name, n: x.n, on: x.on, href: href({ r: [...x.regions], all: false }) })),
      modes: a.query.r.length > 1 ? { any: { label: 'any of these', n: a.modes.any, on: !a.query.all, href: href({ all: false }) }, all: { label: 'all of these', n: a.modes.all, on: a.query.all, href: href({ all: true }) } } : null,
      families: a.families.map((f) => ({ label: f.name, value: f.slug, n: f.n, on: f.on, href: href({ f: f.on ? '' : f.slug }) })),
      familiesWith: a.familiesWith,
      ...(a.query.more !== 'f' && a.familiesWith > a.families.length ? { moreFamilies: href({ more: 'f' }) } : {}),
      genera: a.genera.map((g) => ({ label: g.name, value: g.slug, n: g.n, on: g.on, href: href({ g: g.on ? '' : g.slug }) })),
      generaWith: a.generaWith,
      ...(a.query.more !== 'g' && a.generaWith > a.genera.length ? { moreGenera: href({ more: 'g' }) } : {}),
      flags: [
        { key: 'climate', label: 'Habitat climate known', n: a.flags.climate, on: a.query.climate, href: href({ climate: !a.query.climate }) },
        // Not counted at all: no number and no tick (S1); counted for some: the number, and how many are not counted.
        a.grown.state === 'none'
          ? { key: 'grown', label: 'Grown, per iNaturalist', on: false, href: href({ grown: false }), disabled: true, uncounted: true }
          : { key: 'grown', label: 'Grown, per iNaturalist', n: a.flags.grown, on: a.query.grown, href: href({ grown: !a.query.grown }), ...(a.grown.notCounted ? { notCounted: a.grown.notCounted } : {}) },
        { key: 'only', label: 'Native only to the regions ticked', n: a.flags.only, on: a.query.only, href: href({ only: !a.query.only }), ...(a.query.r.length ? {} : { disabled: true }) }
      ]
    },
    pills: entrance ? [] : pillsOf(p, a.query).map((x) => ({ label: x.label, href: href(x.query) })),
    ...(!entrance && filtered(a.query) ? { clear: '/browse' } : {}),
    fixes: a.fixes.map((f) => ({ label: f.label, n: f.n, href: href(f.query) })),
    wide: a.wide.map((w) => ({ label: `${w.n.toLocaleString('en-GB')} more species, whose range Kew gives only as ${w.label} as a whole,`, n: w.n, href: href({ r: [w.code], all: false, only: false }) })),
    views: { tiles: href({ view: 'tiles', at: a.query.at }), list: href({ view: 'list', at: a.query.at }), map: href({ view: 'map', at: 0 }) },
    // "Most grown" is offered only where something is counted; otherwise the order is A to Z, said so (S1). "Record low"
    // only where the index holds it (round eighty-seven, stage 2): an index of before has none, and the list says so.
    sorts: { ...(a.grown.state === 'none' ? {} : { grown: href({ sort: 'grown', at: 0 }) }), az: href({ sort: 'az', at: 0 }), ...(p.lows ? { low: href({ sort: 'low', at: 0 }) } : {}) },
    lows: !!p.lows,
    map,
    pin: { view: pinQuery, href: entrance ? base : `/browse${pinQuery}`, label: titleOf(p, a.query), n },
    picker: { r: a.query.r, all: a.query.all, rest: queryString({ ...a.query, r: [], all: false, only: false, at: 0, sort: 'grown', view: 'tiles', in: '', more: '' }) },
    grown: a.grown,
    pages: {
      from: n ? a.query.at + 1 : 0,
      to: Math.min(n, a.query.at + PAGE),
      ...(a.query.at > 0 ? { prev: href({ at: a.query.at - PAGE }) } : {}),
      ...(a.query.at + PAGE < n ? { next: href({ at: a.query.at + PAGE }) } : {})
    },
    csv: `/browse/csv${queryString({ ...a.query, at: 0, view: 'tiles', in: '', more: '' })}`,
    sources: '/browse/csv?part=sources',
    built: builtWords(lastmodOf(c.manifest?.built)),
    share: shareItem ? { src: shareItem.thumb!, alt: `${shareItem.name}. ${shareItem.credit}` } : null
  };
  return { view, p, answer: a };
}

/** An entrance page's own figures, from its answer (the page holds no other filter). */
export const figuresOf = (a: BrowseAnswer) => ({ total: a.total, only: a.flags.only, climate: a.flags.climate, grown: a.grown.state === 'none' ? null : a.flags.grown, grownNotCounted: a.grown.state === 'some' ? a.grown.notCounted : 0, genera: a.generaWith, families: a.familiesWith });

/** The corpus a request holds, for a browse route. */
export const corpusOf = (locals: App.Locals | undefined, platform: Platform, fetch: Fetch) => locals?.corpus ?? corpusNow(platform, fetch);
export const regionLabel = (code: string) => regionOf(code)?.label ?? code;

/** Whether the corpus a request holds has a browse table to read (`browseOf` would answer, not refuse). */
export const hasBrowse = (c: Loaded): boolean => (fromFiles(c) ? !!c.manifest!.files[BROWSE_FILE] || !searchedFromFiles(c) : true);
/**
 * A not-found answer marked with whether the browse pages are there (`App.Error.browse`; round eighty-seven, the review
 * of stage 1, B2), so the not-found page links them only where they answer. A corpus that cannot be read is said as
 * none: the page then links no page it does not know to be there.
 */
export async function saysBrowse(e: unknown, locals: App.Locals | undefined, platform: Platform, fetch: Fetch): Promise<void> {
  if (!isHttpError(e) || e.status !== 404 || !e.body || typeof e.body !== 'object' || 'browse' in e.body) return;
  (e.body as App.Error).browse = await Promise.resolve(corpusOf(locals, platform, fetch)).then(hasBrowse, () => false);
}

/**
 * The entrance pages' addresses for the sitemap (round eighty-seven, C2): /browse unfiltered, the indexes of regions,
 * genera (one address a letter) and families, every region with a species native to it, every genus with a page (two
 * species or more here), every family. Filtered views of /browse are not listed: they are not for search engines.
 */
export function entranceUrls(p: Prepared): string[] {
  const w = wholeCounts(p);
  const count = new Int32Array(p.genera.length);
  for (let i = 0; i < p.t.n; i++) count[p.genus[i]]++;
  const genera = p.genera.map((g, i) => ({ g, n: count[i] })).filter((x) => x.n >= GENUS_PAGE_MIN).map((x) => x.g).sort((a, b) => nameOrder(withoutSign(a), withoutSign(b)));
  const letters = [...new Set(genera.map((g) => withoutSign(g).charAt(0).toUpperCase()))].sort();
  return [
    '/browse', '/region', '/genus', '/family',
    ...[...REGIONS.values()].filter((r) => (w.regions.get(r.code) ?? 0) > 0).map((r) => `/region/${r.slug}`),
    ...letters.slice(1).map((l) => `/genus?from=${l}`),
    ...genera.map((g) => `/genus/${slugify(g)}`),
    ...[...p.t.families].sort(nameOrder).map((f) => `/family/${slugify(f)}`)
  ];
}
