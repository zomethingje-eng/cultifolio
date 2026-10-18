import { corpusNow } from '$lib/server/dossiers';
import { unitsFor } from '$lib/server/units';
import { catalogueRows, rowItemsOf, featuredOfCorpus, byOf, chipOf, homeWindow, HOME_ITEMS, type Item } from '$lib/server/catalogue';
import { grownChipFrom, grownFrom } from '$lib/ui/ref/most-grown';
import { lookupOf } from '$lib/server/lookup';
import type { PageServerLoad } from './$types';

/** Rows in the first window: a phone shows about ten; the rest come from /api/rows as the reader nears the end (round forty-seven, 1). */
export { HOME_WINDOW as _WINDOW } from '$lib/server/catalogue';

export const load: PageServerLoad = async ({ platform, fetch, setHeaders, url, cookies, request, locals }) => {
  // One corpus for the whole page: the rows, the opened row's species and the strip (round fifty-eight).
  const c = locals?.corpus ?? (await corpusNow(platform, fetch)); // the hook's load when it held the page (round fifty-nine)
  const byParam = url.searchParams.get('by');
  const by = byOf(byParam);
  // The climate chips filter the grouped catalogue on the server (`?chip=`): the client used to fetch the whole index to
  // flatten it by chip, which the index's size would make unusable first (round thirty-nine).
  const chip = chipOf(url.searchParams.get('chip'));
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  // The rows: the build's file under the corpus id, else derived from the index and kept (round fifty-three, 2). The one
  // opened row's species: the build's row file since round seventy-six, else from the index.
  const { cat } = await catalogueRows(platform, fetch, by, chip, c);
  const { rows } = cat;
  const look = lookupOf(c, platform, fetch);
  // The window the query asks for, read as the Worker's page cache reads it (hooks.server.ts, `homeQuery`): a value the
  // page would not act on is the same page as none, there and here (round forty-nine, 2).
  const w = homeWindow(cat, url.searchParams);
  const { start, atValid, fromValid } = w;
  type Row = Omit<(typeof rows)[number], 'items'> & { items: Item[] | undefined; itemsAt?: number; itemsCount?: number };
  const opened = w.open ? ((await rowItemsOf(c, platform, fetch, by, chip, w.open)) ?? []) : [];
  const window: Row[] = rows.slice(start, w.end).map((r): Row => {
    if (r.id !== w.open) return { ...r, items: undefined };
    return { ...r, items: opened.slice(w.part, w.part + HOME_ITEMS), itemsAt: w.part, itemsCount: opened.length };
  });
  // "Most grown" (round seventy-five, the owner's decision): a chip like the others, off by default, the same on every
  // device. Its counts always; the genera's names only while it is on, since its search filters the matches by them.
  const genera = await look.genera();
  const g = grownChipFrom(genera);
  const grown = g ? { ...g, names: chip === 'grown' ? [...grownFrom(genera).genera] : undefined } : null;
  // What a stranger sees first: twelve photographed species with a derived climate, one from each of the largest
  // genera, chosen by rule (the most-recorded species of the genus) and rotated by the day so the strip is not editorial.
  // The pool is the build's `featured.json` (round seventy-six), or chosen from the index once per index.
  const pool = await featuredOfCorpus(c, platform, fetch);
  const day = Math.floor(Date.now() / 86_400_000);
  const featured = pool.length ? Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[(day * 12 + i) % pool.length]) : [];
  return {
    units: unitsFor(cookies, request),
    featured,
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
    withClimate: cat.withClimate,
    grown
  };
};
