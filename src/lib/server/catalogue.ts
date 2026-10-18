/**
 * The catalogue on the server: the pure builder lives in $dossier/catalogue (the corpus build writes its rows to files
 * with it); here it is read from the build's file under the corpus id, else derived from the index and kept.
 */
import { product, corpusNow, fromFiles, indexOf, UNREADABLE, type Loaded, type Platform, type Fetch } from '$lib/server/dossiers';
import { catalogueOf, catalogueFile, catalogueFrom, catalogueItems, featuredPoolOf, featuredOf, rowItems, type By, type Chip, type CatalogueRows, type Catalogue, type Item, type Featured } from '$dossier/catalogue';
import { grownGenera, grownFrom } from '$lib/ui/ref/most-grown';
import { lookupOf } from '$lib/server/lookup';
import { genusOf, slugify } from '$core/names';
import { error } from '@sveltejs/kit';
import type { Manifest } from '$dossier/manifest';
import type { IndexEntry } from '$dossier/index-entry';
export * from '$dossier/catalogue';

/**
 * A catalogue's rows and the corpus they belong to: the build's file under the corpus id, else derived from the index
 * here and kept (round fifty-three, 2). Of the corpus the caller holds when it passes one, so a page's rows and the
 * index it opens them from are one generation (round fifty-eight).
 */
export async function catalogueRows(platform: Platform, fetch: Fetch, by: By, chip: Chip, held?: Loaded): Promise<{ cat: CatalogueRows; corpus: string; fromFile: boolean }> {
  const c = held ?? (await corpusNow(platform, fetch));
  const { corpus } = c;
  // "Most grown" (round seventy-five): no build writes it, since its genera are the deploy's file; derived from the index
  // and the ranking's file, or since round seventy-six from the build's genus rows of those genera, and kept.
  if (chip === 'grown') return { cat: fromFiles(c) ? await grownFromFiles(c, platform, fetch, by) : catalogueOf(c.idx!, by, chip, grownGenera(c.idx!)), corpus, fromFile: false };
  const file = await product<CatalogueRows>(c, platform, fetch, catalogueFile(by, chip));
  if (file && Array.isArray(file.rows)) return { cat: withPending(file), corpus, fromFile: true };
  if (fromFiles(c)) error(503, { message: UNREADABLE }); // the manifest names the file: one not read is a refusal
  return { cat: catalogueOf(await indexOf(c, platform, fetch), by, chip), corpus, fromFile: false };
}

/**
 * The "Most grown" chip's catalogue from the build's files (round seventy-six): the species of the most-grown genera
 * from their genus rows, put back in the index's order (`RowRecord.at`), so the rows, their order and their counts are
 * the ones the index gave; the whole reference's counts from the grouping's file under "all". Kept per manifest.
 */
const grownKept = new WeakMap<Manifest, Map<By, Promise<Catalogue>>>();
function grownFromFiles(c: Loaded, platform: Platform, fetch: Fetch, by: By): Promise<Catalogue> {
  const m = c.manifest!;
  let per = grownKept.get(m);
  if (!per) grownKept.set(m, (per = new Map()));
  let p = per.get(by);
  if (!p) {
    p = (async () => {
      const look = lookupOf(c, platform, fetch);
      const grown = grownFrom(await look.genera()).genera;
      const picked: Array<{ at: number; item: Item }> = [];
      for (const r of await Promise.all([...grown].map(async (g) => ({ g, r: await look.row('genus', slugify(g)) })))) r.r?.items.forEach((item, i) => { if (genusOf(item.name) === r.g) picked.push({ at: r.r!.at[i], item }); });
      picked.sort((a, b) => a.at - b.at);
      const all = await product<CatalogueRows>(c, platform, fetch, catalogueFile(by, 'all'));
      if (!all || typeof all.total !== 'number') error(503, { message: UNREADABLE });
      return catalogueFrom(picked.map((x) => x.item), by, all.total, all.withClimate);
    })();
    per.set(by, p);
    p.catch(() => { if (per!.get(by) === p) per!.delete(by); });
  }
  return p;
}

/** One row's species under a chip, the most-grown genera given for "grown". */
export const rowItemsUnder = (index: IndexEntry[], by: By, chip: Chip, id: string): Item[] | undefined => rowItems(index, by, chip, id, chip === 'grown' ? grownGenera(index) : undefined);
/**
 * One row's species under a chip, of the corpus a request holds: from the build's row file (round seventy-six), filtered
 * by the chip as the index's grouping was, or from the index.
 */
export async function rowItemsOf(c: Loaded, platform: Platform, fetch: Fetch, by: By, chip: Chip, id: string): Promise<Item[] | undefined> {
  if (!fromFiles(c)) return rowItemsUnder(c.idx!, by, chip, id);
  const look = lookupOf(c, platform, fetch);
  const r = await look.row(by, id);
  if (!r) return undefined;
  const grown = chip === 'grown' ? grownFrom(await look.genera()).genera : null;
  const out = r.items.filter((x) => (chip === 'climate' ? x.climate === 'ok' : chip === 'noclimate' ? x.climate !== 'ok' : grown ? grown.has(genusOf(x.name)) : true));
  return out.length ? out : undefined;
}

/** The front page strip's species: the build's `featured.json`, or chosen from the index once per index (round seventy-six). */
const pools = new WeakMap<object, Featured[]>();
export async function featuredOfCorpus(c: Loaded, platform: Platform, fetch: Fetch): Promise<Featured[]> {
  if (fromFiles(c)) {
    const f = await product<Featured[]>(c, platform, fetch, 'featured.json');
    return Array.isArray(f) ? f : [];
  }
  const idx = c.idx!;
  let pool = pools.get(idx);
  if (!pool) pools.set(idx, (pool = featuredPoolOf(catalogueItems(idx)).map(featuredOf)));
  return pool;
}

/** A file from a corpus built before round sixty has no `pending` on its rows: read as 0, once per file. */
const pendingRead = new WeakMap<CatalogueRows, CatalogueRows>();
function withPending(file: CatalogueRows): CatalogueRows {
  let out = pendingRead.get(file);
  if (!out) pendingRead.set(file, (out = file.rows.every((r) => typeof r.pending === 'number') ? file : { ...file, rows: file.rows.map((r) => ({ ...r, pending: typeof r.pending === 'number' ? r.pending : 0 })) }));
  return out;
}

/** Rows in the home page's first window: a phone shows about ten; the rest come from /api/rows as the reader nears the end (round forty-seven, 1). */
export const HOME_WINDOW = 60;
/** Species an opened row carries per page: an origin such as the Cape holds thousands, and the page carried every one (round fifty-eight; the server review). `?part=N` is a later page, a multiple of this. */
export const HOME_ITEMS = 240;

/**
 * The home page's window as its query asks for it, read one way by the page and by the page cache's key, so a value the
 * page would not act on is the same page as none (round forty-nine, 2). `?at=N` or `?from=L` starts it; a `?open=` row
 * deep in the catalogue starts it a little above that row (round forty-nine, 2). It is never more than two windows,
 * whatever `at` and `open` ask together: `?at=1&open=<the last row>` sent the whole catalogue (round fifty-eight). A row
 * opened outside it is the same page as none opened, and `?part=` names a later page of the opened row's species.
 */
export function homeWindow(cat: CatalogueRows, p: URLSearchParams): { start: number; end: number; atValid: boolean; fromValid: boolean; open: string; part: number } {
  const rows = cat.rows;
  const asked = p.get('open') ?? '';
  const openIndex = asked ? rows.findIndex((r) => r.id === asked) : -1;
  const at = Number(p.get('at'));
  const atValid = Number.isInteger(at) && at > 0 && at < rows.length;
  const from = (p.get('from') ?? '').toUpperCase();
  const fromValid = /^[A-Z]$/.test(from) && cat.letterAt[from] != null;
  const start = atValid ? at : fromValid ? cat.letterAt[from] : openIndex >= HOME_WINDOW ? Math.max(0, openIndex - 15) : 0;
  const end = Math.min(rows.length, start + 2 * HOME_WINDOW, Math.max(start + HOME_WINDOW, openIndex >= 0 ? openIndex + 30 : 0));
  const shown = openIndex >= start && openIndex < end;
  const n = Number(p.get('part'));
  const part = shown && Number.isInteger(n) && n > 0 && n % HOME_ITEMS === 0 && n < rows[openIndex].count ? n : 0;
  return { start, end, atValid, fromValid, open: shown ? asked : '', part };
}
