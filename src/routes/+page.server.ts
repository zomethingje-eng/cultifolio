import { getIndex } from '$lib/server/dossiers';
import { genusOf } from '$core/names';
import { unitsFor } from '$lib/server/units';
import { catalogueOf, byOf, chipOf, type Item } from '$lib/server/catalogue';
import type { PageServerLoad } from './$types';

/** Rows in the first window: a phone shows about ten; the rest come from /api/rows as the reader nears the end (round forty-seven, 1). */
export const _WINDOW = 60;

/** The forty-eight species the strip rotates through, chosen once per index rather than per request (round fifty-one, 6). */
const pools = new WeakMap<object, Item[]>();
function featuredPool(index: object, list: Item[]): Item[] {
  const hit = pools.get(index);
  if (hit) return hit;
  const byGenus = new Map<string, Item[]>();
  // Eight or more photographs: a species photographed that often is photographed alive, not as a pressed sheet.
  for (const c of list) if (c.thumb && c.climate === 'ok' && (c.photos ?? 0) >= 8) { const g = genusOf(c.name); const xs = byGenus.get(g); if (xs) xs.push(c); else byGenus.set(g, [c]); }
  const genera = [...byGenus.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const pool = genera.slice(0, 48).map(([, xs]) => [...xs].sort((a, b) => b.open - a.open)[0]);
  pools.set(index, pool);
  return pool;
}

export const load: PageServerLoad = async ({ platform, fetch, setHeaders, url, cookies, request }) => {
  const index = await getIndex(platform, fetch);
  const byParam = url.searchParams.get('by');
  const by = byOf(byParam);
  const open = url.searchParams.get('open') ?? '';
  // The climate chips filter the grouped catalogue on the server (`?chip=`): the client used to fetch the whole index to
  // flatten it by chip, which the index's size would make unusable first (round thirty-nine).
  const chip = chipOf(url.searchParams.get('chip'));
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  const cat = catalogueOf(index, by, chip);
  const { rows, list } = cat;
  const openIndex = open ? rows.findIndex((r) => r.id === open) : -1;
  // `?from=L`: the server-rendered window starts at that letter, so a reader without JavaScript (and a crawler) can follow
  // the letter index; `?at=N` is "More" without JavaScript. With JavaScript the index jumps in place.
  // Read as the Worker's page cache reads them (hooks.server.ts, `homeQuery`): a value the page would not act on is
  // the same page as none, there and here, so `browse` below is judged on the same reading (round forty-nine, 2).
  const at = Number(url.searchParams.get('at'));
  const atValid = Number.isInteger(at) && at > 0 && at < rows.length;
  const fromLetter = (url.searchParams.get('from') ?? '').toUpperCase();
  const fromValid = /^[A-Z]$/.test(fromLetter) && cat.letterAt[fromLetter] != null;
  // A `?open=` link to a row deep in the catalogue starts the window a little above it, not at A: a link to Welwitschia
  // sent the whole catalogue to reach row 1,300 (round forty-nine, 2; round thirty-five, R1-4). The rows above come
  // through "Earlier" and the upward fill, as after a letter jump.
  const start = atValid ? at : fromValid ? cat.letterAt[fromLetter] : openIndex >= _WINDOW ? Math.max(0, openIndex - 15) : 0;
  // The window: sixty rows from the start, or up to thirty past an opened row that lies beyond them, so a `?open=` link
  // lands on its row. Only the opened row carries its species.
  const end = Math.max(start + _WINDOW, openIndex >= 0 ? openIndex + 30 : 0);
  const window = rows.slice(start, end).map((r) => (r.id === open ? { ...r, items: cat.itemsOf(r.id) } : { ...r, items: undefined as Item[] | undefined }));
  // What a stranger sees first: twelve photographed species with a derived climate, one from each of the largest
  // genera, chosen by rule (the most-recorded species of the genus) and rotated by the day so the strip is not editorial.
  const pool = featuredPool(index, list);
  const day = Math.floor(Date.now() / 86_400_000);
  const featured = pool.length ? Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[(day * 12 + i) % pool.length]).map((c) => ({ slug: c.slug, name: c.name, thumb: c.thumb!, common: c.common, family: c.family })) : [];
  return {
    units: unitsFor(cookies, request),
    featured,
    by,
    open: openIndex >= 0 ? open : '',
    /** The address asked for the catalogue (a grouping, an opened group, a letter): a grower with plants lands on the catalogue, not on their own list (round thirty-four, 1). */
    browse: byParam != null || openIndex >= 0 || chip !== 'all' || fromValid || atValid,
    chip,
    rows: window,
    rowCount: rows.length,
    letters: cat.letters,
    letterAt: cat.letterAt,
    start,
    total: cat.total,
    withClimate: cat.withClimate
  };
};
