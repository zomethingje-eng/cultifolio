import { corpusNow, getDossier, resolveSlug } from '$lib/server/dossiers';
import { leadFrom } from '$lib/ui/ref/lead-figure';
import { unitsFor } from '$lib/server/units';
import { catalogueRows, rowItemsOf, featuredOfCorpus, byOf, chipOf, homeWindow, HOME_ITEMS, type Item } from '$lib/server/catalogue';
import { grownChipFrom, grownFrom } from '$lib/ui/ref/most-grown';
import { lookupOf } from '$lib/server/lookup';
import { browseCounts, hasBrowse } from '$lib/browse/load.server';
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
  // "Popular genera" (round seventy-five, the owner's decision; named so since round eighty-two, the second review's 3): a
  // chip like the others, off by default, the same on every device. Its counts always; the genera's names only while it is on, since its search filters the matches by them.
  const genera = await look.genera();
  const g = grownChipFrom(genera);
  const grown = g ? { ...g, names: chip === 'grown' ? [...grownFrom(genera).genera] : undefined } : null;
  // What a stranger sees first: twelve photographed species with a derived climate, one from each of the largest
  // genera, chosen by rule (the most-recorded species of the genus) and rotated by the day so the strip is not editorial.
  // The pool is the build's `featured.json` (round seventy-six), or chosen from the index once per index.
  const pool = await featuredOfCorpus(c, platform, fetch);
  const day = Math.floor(Date.now() / 86_400_000);
  // Of the species without a habitat climate, those whose climate was not checked and those still to be built, counted
  // apart from those with none derived, for the chip (round eighty-two; the independent review's 11: "Without climate
  // 10,573" was 9,653 with none and 920 not checked). The rows partition the species under a chip, so their counts add up;
  // under the other chips, from the "noclimate" chip's rows (a file the build writes, kept as any product is).
  // Of those not checked, the ones whose GBIF records were not asked (no GBIF key) are said apart where the build counted
  // them (`notAsked`, round eighty-five); a file built before has none, and the page then says the two together.
  const sum = (rs: ReadonlyArray<{ notChecked?: number; notAsked?: number; pending?: number }>) => rs.reduce<{ notChecked: number; notAsked: number | null; pending: number }>((a, r) => ({ notChecked: a.notChecked + (r.notChecked ?? 0), notAsked: a.notAsked == null || r.notAsked == null ? (r.notChecked ? null : a.notAsked) : a.notAsked + r.notAsked, pending: a.pending + (r.pending ?? 0) }), { notChecked: 0, notAsked: 0, pending: 0 });
  const without = chip === 'all' || chip === 'noclimate' ? sum(rows) : sum((await catalogueRows(platform, fetch, by, 'noclimate', c)).cat.rows);
  const featured = pool.length ? Array.from({ length: Math.min(12, pool.length) }, (_, i) => pool[(day * 12 + i) % pool.length]) : [];
  // The lead (round eighty-seven; plan D1): one figure from the reference and where it came from, read from the record of
  // the day's first species in the strip that holds it (`leadFrom`). A record that cannot be read leaves the lead out; the
  // page is drawn without it, never with a figure whose source it could not read.
  const lead = await leadFrom(featured, async (slug) => { const k = await resolveSlug(platform, fetch, slug, c); return k ? getDossier(platform, fetch, k, c) : null; }).catch(() => null);
  // The Browse table (round eighty-seven; the review of stage 1, B1 and B2). Where the corpus has a browse table
  // (`hasBrowse`), its rows are the browse pages, each with the count its page lists: the TDWG level-3 regions /region
  // names, the families /family lists, the genera with a page /genus lists, and "Grown by someone", the species with
  // iNaturalist observations in cultivation as /browse?grown=1 counts them. All from the build's few bytes of browse
  // counts, never the table itself (`browseCounts`); a count the file does not hold, or a file that cannot be read, is
  // left out, and the row shows none rather than a number it did not read. An index that counts no cultivated
  // observations has no "grown" count; one that counts some says how many species it does not count.
  // Where the corpus has no table, every browse page is a 503: the rows are the catalogue's own groupings, each with
  // its count of rows, and nothing links a page that cannot answer.
  const browsable = hasBrowse(c);
  const counts = browsable ? await browseCounts(c, platform, fetch).catch(() => null) : null;
  const rowsOf = (b: 'family' | 'origin' | 'genus') => (by === b && chip === 'all' ? Promise.resolve(rows.length) : catalogueRows(platform, fetch, b, 'all', c).then((r) => r.cat.rows.length, () => null));
  const catalogueGroups = browsable ? null : await Promise.all([rowsOf('origin'), rowsOf('family'), rowsOf('genus')]).then(([origins, families, genera]) => ({ origins, families, genera }));
  return {
    units: unitsFor(cookies, request),
    featured,
    lead,
    // `grownUncounted`: the counts were read and the index counts no cultivated observations (said so); with no counts read, not known.
    groups: browsable ? { regions: counts?.regions ?? null, families: counts?.families ?? null, genera: counts?.genera ?? null, grown: counts?.grown ?? null, grownNotCounted: counts?.grown != null ? (counts.grownNotCounted ?? null) : null, grownUncounted: !!counts && counts.grown === null } : null,
    catalogueGroups,
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
    notChecked: without.notChecked,
    notAsked: without.notAsked,
    pending: without.pending,
    grown
  };
};
