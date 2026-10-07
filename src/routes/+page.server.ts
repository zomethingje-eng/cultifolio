import { corpusNow, getDossier } from '$lib/server/dossiers';
import { genusOf } from '$core/names';
import { unitsFor } from '$lib/server/units';
import { catalogueRows, catalogueItems, rowItems, byOf, chipOf, homeWindow, HOME_ITEMS, type Item } from '$lib/server/catalogue';
import type { PageServerLoad } from './$types';

/** Rows in the first window: a phone shows about ten; the rest come from /api/rows as the reader nears the end (round forty-seven, 1). */
export { HOME_WINDOW as _WINDOW } from '$lib/server/catalogue';

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

export const load: PageServerLoad = async ({ platform, fetch, setHeaders, url, cookies, request, locals }) => {
  // One corpus for the whole page: the rows, the opened row's species and the strip (round fifty-eight).
  const c = locals?.corpus ?? (await corpusNow(platform, fetch)); // the hook's load when it held the page (round fifty-nine)
  const index = c.idx;
  const byParam = url.searchParams.get('by');
  const by = byOf(byParam);
  // The climate chips filter the grouped catalogue on the server (`?chip=`): the client used to fetch the whole index to
  // flatten it by chip, which the index's size would make unusable first (round thirty-nine).
  const chip = chipOf(url.searchParams.get('chip'));
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  // The rows: the build's file under the corpus id, else derived from the index and kept (round fifty-three, 2). The one
  // opened row's species come from the index either way.
  const { cat } = await catalogueRows(platform, fetch, by, chip, c);
  const { rows } = cat;
  const list = catalogueItems(index);
  const itemsOf = (id: string) => rowItems(index, by, chip, id);
  // The window the query asks for, read as the Worker's page cache reads it (hooks.server.ts, `homeQuery`): a value the
  // page would not act on is the same page as none, there and here (round forty-nine, 2).
  const w = homeWindow(cat, url.searchParams);
  const { start, atValid, fromValid } = w;
  type Row = Omit<(typeof rows)[number], 'items'> & { items: Item[] | undefined; itemsAt?: number; itemsCount?: number };
  const window: Row[] = rows.slice(start, w.end).map((r): Row => {
    if (r.id !== w.open) return { ...r, items: undefined };
    const all = itemsOf(r.id) ?? [];
    return { ...r, items: all.slice(w.part, w.part + HOME_ITEMS), itemsAt: w.part, itemsCount: all.length };
  });
  // What a stranger sees first: twelve photographed species with a derived climate, one from each of the largest
  // genera, chosen by rule (the most-recorded species of the genus) and rotated by the day so the strip is not editorial.
  const pool = featuredPool(index, list);
  const day = Math.floor(Date.now() / 86_400_000);
  const featured = pool.length ? Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[(day * 12 + i) % pool.length]).map((c) => ({ slug: c.slug, name: c.name, thumb: c.thumb!, common: c.common, family: c.family })) : [];
  // The first of the day's strip, read whole, for the visitor's "This is what every species page shows" (round sixty;
  // the self-review's experience item 1). One dossier read under the page's corpus; without a derived climate, or when
  // the read fails, the page simply does not draw the block.
  // Only for the plain front page: a genus row's page, a grouping, a chip or a letter is the catalogue, and the feature's
  // dossier read was spent on every one of them (round sixty-one; corpus 10).
  const plain = byParam == null && !w.open && chip === 'all' && !fromValid && !atValid;
  const lead = plain && featured.length ? pool[(day * 12) % pool.length] : null;
  const fd = lead ? await getDossier(platform, fetch, lead.key, c).catch(() => null) : null;
  const feature = fd && lead && fd.climate.status === 'ok'
    ? { slug: lead.slug, name: fd.name.scientific, family: fd.name.family ?? null, lat: fd.centroid?.lat ?? fd.climate.at.lat, climate: { months: fd.climate.months, p10: fd.climate.p10, p90: fd.climate.p90, cells: fd.climate.cells, records: fd.climate.records, extremes: fd.climate.extremes ?? null, extremesStatus: fd.climate.extremesStatus ?? null } }
    : null;
  return {
    units: unitsFor(cookies, request),
    featured,
    feature,
    by,
    open: w.open,
    /** The address asked for the catalogue (a grouping, an opened group, a letter): a grower with plants lands on the catalogue, not on their own list (round thirty-four, 1). */
    browse: byParam != null || !!w.open || chip !== 'all' || fromValid || atValid,
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
