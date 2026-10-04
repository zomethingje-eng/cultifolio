/**
 * The catalogue on the server: the pure builder lives in $dossier/catalogue (the corpus build writes its rows to files
 * with it); here it is read from the build's file under the corpus id, else derived from the index and kept.
 */
import { product, corpusNow, type Loaded, type IndexEntry, type Platform, type Fetch } from '$lib/server/dossiers';
import { catalogueOf, catalogueFile, type By, type Chip, type CatalogueRows } from '$dossier/catalogue';
export * from '$dossier/catalogue';

/**
 * A catalogue's rows and the corpus they belong to: the build's file under the corpus id, else derived from the index
 * here and kept (round fifty-three, 2). Of the corpus the caller holds when it passes one, so a page's rows and the
 * index it opens them from are one generation (round fifty-eight).
 */
export async function catalogueRows(platform: Platform, fetch: Fetch, by: By, chip: Chip, held?: Loaded): Promise<{ cat: CatalogueRows; idx: IndexEntry[]; corpus: string; fromFile: boolean }> {
  const c = held ?? (await corpusNow(platform, fetch));
  const { idx, corpus } = c;
  const file = await product<CatalogueRows>(c, platform, fetch, catalogueFile(by, chip));
  if (file && Array.isArray(file.rows)) return { cat: file, idx, corpus, fromFile: true };
  return { cat: catalogueOf(idx, by, chip), idx, corpus, fromFile: false };
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
