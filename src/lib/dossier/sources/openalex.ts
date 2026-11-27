import type { JsonFetcher, FetchResult } from '../fetch';

interface Work {
  title?: string;
  display_name?: string;
  publication_year?: number;
  doi?: string;
  id?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** OpenAlex ships abstracts as word → positions; put the words back in order. */
export function abstractText(idx: Record<string, number[]> | null | undefined): string {
  if (!idx) return '';
  const words: string[] = [];
  for (const [w, ps] of Object.entries(idx)) for (const p of ps) words[p] = w;
  return words.join(' ');
}

/** Does the text name this species (genus and epithet together, or the genus abbreviated as "A. epithet")? */
export function namesSpecies(text: string, scientificName: string): boolean {
  const [genus, epithet] = scientificName.split(' ');
  if (!genus || !epithet) return false;
  const t = text.toLowerCase();
  const g = genus.toLowerCase(), e = epithet.toLowerCase();
  return t.includes(`${g} ${e}`) || new RegExp(`\\b${g[0]}\\.\\s*${e}\\b`).test(t);
}

/**
 * Literature is off from round seventy-eight (the owner's decision 2, 2026-10-19): the build asks OpenAlex nothing, and
 * a page built since records its papers as not asked, with these words, which the page and Provenance show beside "not
 * checked", never "none" (rule 2). A dossier built before
 * keeps the papers it holds until it is built again; an offline re-derivation, which asks no source, carries them.
 */
export const LITERATURE_OFF = 'the reference does not ask OpenAlex for papers';
/** The words a page built from round seventy-eight to eighty-four carries, which promised a fill no round has planned (round eighty-five; outside review A's 9f): read as literature off still, and said as `LITERATURE_OFF` (`readerWords`). */
export const LITERATURE_OFF_BEFORE = "not yet asked for this reference; a later fill takes the papers from OpenAlex's snapshot";
/** Whether a dossier's OpenAlex record is literature switched off (`LITERATURE_OFF`, carried by a re-derivation too), not a source that did not answer. */
export const literatureOff = (u?: { status?: string; detail?: string } | null): boolean => u?.status === 'skipped' && ((u.detail ?? '').includes(LITERATURE_OFF) || (u.detail ?? '').includes(LITERATURE_OFF_BEFORE));

/**
 * OpenAlex is CC0. Not load-bearing: a species page reads fine without it.
 * Anonymous requests share a per-IP pool that shuts after about a hundred
 * calls; an API key (free, from openalex.org) gets its own allowance. Set
 * OPENALEX_KEY in the environment; the key goes in the query string as
 * OpenAlex asks, never in the dossier.
 */
/**
 * DOIs that name a record, not a paper: GBIF's prefix (every occurrence download is minted under it) and DiSSCo's,
 * under which each digitised herbarium specimen has a DOI that names the species in its title (round thirty-one, 6).
 */
export const isDatasetDoi = (doi: string | null | undefined): boolean => /^(https?:\/\/doi\.org\/)?10\.(15468|3535)\//i.test(doi ?? '');
/**
 * A work whose venue says it is a specimen record rather than a paper, or whose title is a specimen's (the species name
 * and "specimen" and nothing that reads as a sentence). A paper about herbarium specimens ("…inferred from herbarium
 * specimens") is a paper, and the title-word test of round thirty-one dropped it (round thirty-three, 13).
 */
const isSpecimenRecord = (w: Work): boolean => /dissco/i.test(w.primary_location?.source?.display_name ?? '') || /^(herbarium|preserved) specimen( of)? [A-Z][a-z]+ [a-z-]+/i.test((w.title ?? '').trim()) || /^[A-Z][a-z]+ [a-z-]+.{0,40}\((herbarium|preserved) specimen\)$/.test((w.title ?? '').trim());

export async function literature(f: JsonFetcher, scientificName: string, max = 12, apiKey = typeof process !== 'undefined' ? process.env?.OPENALEX_KEY?.trim() : undefined) {
  // Title-and-abstract search, not full text: a full-text hit can be a chassis paper that cites a
  // biomimetic study once. Then every hit is checked here for the name in its title or abstract,
  // because a search engine's idea of a match is not a botanist's.
  const r = await f<{ results: Work[] }>(
    `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(`"${scientificName}"`)},type:!dataset&per-page=${max * 2}&sort=cited_by_count:desc&select=id,doi,title,display_name,publication_year,authorships,primary_location,abstract_inverted_index&mailto=hello@cultifolio.com${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`
  );
  if (r.status !== 'ok') return r as FetchResult<never>;
  const out = r.data.results
    .filter((w) => w.title || w.display_name)
    // A GBIF occurrence download (DOI prefix 10.15468, often this very build's own) is a dataset that names the species, not a paper about it.
    .filter((w) => !isDatasetDoi(w.doi) && !isSpecimenRecord(w))
    .filter((w) => namesSpecies(`${w.title ?? w.display_name ?? ''} ${abstractText(w.abstract_inverted_index)}`, scientificName))
    .slice(0, max)
    .map((w) => ({
      title: (w.title ?? w.display_name) as string,
      year: w.publication_year ?? undefined,
      doi: w.doi?.replace(/^https?:\/\/doi\.org\//, '') ?? undefined,
      url: w.doi ?? w.id ?? undefined,
      authors: (w.authorships ?? []).slice(0, 4).map((a) => a.author?.display_name ?? '').filter(Boolean),
      venue: w.primary_location?.source?.display_name ?? undefined
    }));
  return out.length ? ({ status: 'ok', data: out } as const) : ({ status: 'none' } as const);
}

/**
 * Literature brought back (round 133; SPECIES 23 with HANDOFF round 8; docs/PLAN-133.md): the name in the title only, as a
 * phrase; an article, a review, a book chapter or a preprint; with a DOI. Three asks a page: the most cited, the newest,
 * and the count by year (folded into decades). Each work's title must name the species (`namesSpecies`); a dataset's DOI
 * and a specimen record are never listed. Kept: title, authors (four), venue, year, DOI, its kind where it is a book
 * chapter or a preprint, "free to read" where OpenAlex's `open_access.is_oa` says so, and the times it is cited. Nothing
 * is summarised. The key goes in the query string, as OpenAlex asks; the dossier never holds it.
 */
export const LIT_TYPES = ['article', 'review', 'book-chapter', 'preprint'] as const;
export type TitlePaper = { title: string; year?: number; doi: string; url: string; authors: string[]; venue?: string; kind?: 'book chapter' | 'preprint'; free?: boolean; cited?: number; list: 'cited' | 'newest' };
export type TitleLiterature = { papers: TitlePaper[]; total: number; decades: Array<[number, number]> };
type TWork = Work & { type?: string; cited_by_count?: number; open_access?: { is_oa?: boolean } };
const SELECT = 'id,doi,title,display_name,publication_year,authorships,primary_location,type,cited_by_count,open_access';

/** The asks: `all` (up to 200 works, most cited first: one request answers most pages whole), and, only where a page has more works than that, `newest` and `years`. */
export function titleQuery(scientificName: string, part: 'all' | 'newest' | 'years', apiKey?: string): string {
  const filter = `title.search:${encodeURIComponent(`"${scientificName}"`)},type:${LIT_TYPES.join('|')},has_doi:true`;
  const tail = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : '';
  if (part === 'years') return `https://api.openalex.org/works?filter=${filter}&group_by=publication_year${tail}`;
  return `https://api.openalex.org/works?filter=${filter}&sort=${part === 'all' ? 'cited_by_count:desc' : 'publication_date:desc'}&per-page=${part === 'all' ? 200 : 10}&select=${SELECT}${tail}`;
}
export const ALL_PAGE = 200;

/** A work as the page lists it, or null where it is not one to list (no DOI, a dataset, a specimen, the name not in its title). */
export function titlePaper(w: TWork, scientificName: string, list: 'cited' | 'newest'): TitlePaper | null {
  const title = (w.title ?? w.display_name ?? '').trim();
  if (!title || !w.doi || isDatasetDoi(w.doi) || isSpecimenRecord(w) || !namesSpecies(title, scientificName)) return null;
  if (w.type && !(LIT_TYPES as readonly string[]).includes(w.type)) return null;
  return {
    title, year: w.publication_year ?? undefined, doi: w.doi.replace(/^https?:\/\/doi\.org\//, ''), url: w.doi,
    authors: (w.authorships ?? []).slice(0, 4).map((a) => a.author?.display_name ?? '').filter(Boolean),
    venue: w.primary_location?.source?.display_name ?? undefined,
    kind: w.type === 'book-chapter' ? 'book chapter' : w.type === 'preprint' ? 'preprint' : undefined,
    free: w.open_access?.is_oa === true ? true : undefined, cited: w.cited_by_count ?? undefined, list
  };
}

/** The year counts OpenAlex gives (`group_by=publication_year`) folded into decades, oldest first. */
export function decadesOf(groups: Array<{ key: string; count: number }>): Array<[number, number]> {
  const by = new Map<number, number>();
  for (const g of groups) { const y = Number(g.key); if (Number.isFinite(y) && y > 1500) by.set(Math.floor(y / 10) * 10, (by.get(Math.floor(y / 10) * 10) ?? 0) + g.count); }
  return [...by].sort((a, b) => a[0] - b[0]);
}

/**
 * One request a page where it has 200 works or fewer (OpenAlex's searches cost money past a key's free daily allowance:
 * docs/PLAN-133.md): the most cited three, the newest three and the decades are all read from that one answer. A page
 * with more asks for its newest and its years as well.
 */
export async function titleLiterature(f: JsonFetcher, scientificName: string, apiKey = typeof process !== 'undefined' ? process.env?.OPENALEX_KEY?.trim() : undefined): Promise<FetchResult<TitleLiterature> & { asked?: number }> {
  const a = await f<{ meta?: { count?: number }; results: TWork[] }>(titleQuery(scientificName, 'all', apiKey));
  if (a.status !== 'ok') return a as FetchResult<never>;
  const count = a.data.meta?.count ?? 0;
  if (!count) return { status: 'none', asked: 1 };
  const listed = a.data.results.map((w) => titlePaper(w, scientificName, 'cited')).filter((p): p is TitlePaper => !!p);
  let byDate: TitlePaper[]; let decades: Array<[number, number]>; let asked = 1;
  if (count <= ALL_PAGE) {
    byDate = [...listed].sort((x, y) => (y.year ?? 0) - (x.year ?? 0) || (y.cited ?? 0) - (x.cited ?? 0)).map((p) => ({ ...p, list: 'newest' as const }));
    const years = new Map<string, number>();
    for (const w of a.data.results) if (w.publication_year) years.set(String(w.publication_year), (years.get(String(w.publication_year)) ?? 0) + 1);
    decades = decadesOf([...years].map(([key, c]) => ({ key, count: c })));
  } else {
    const b = await f<{ results: TWork[] }>(titleQuery(scientificName, 'newest', apiKey));
    if (b.status !== 'ok') return b as FetchResult<never>;
    const g = await f<{ group_by?: Array<{ key: string; count: number }> }>(titleQuery(scientificName, 'years', apiKey));
    if (g.status !== 'ok') return g as FetchResult<never>;
    byDate = b.data.results.map((w) => titlePaper(w, scientificName, 'newest')).filter((p): p is TitlePaper => !!p);
    decades = decadesOf(g.data.group_by ?? []);
    asked = 3;
  }
  const cited = listed.slice(0, 3);
  const seen = new Set(cited.map((p) => p.doi.toLowerCase()));
  const newest = byDate.filter((p) => !seen.has(p.doi.toLowerCase())).slice(0, 3);
  const papers = [...cited, ...newest];
  if (!papers.length) return { status: 'none', asked };
  return { status: 'ok', data: { papers, total: decades.reduce((t, [, n]) => t + n, 0), decades }, asked };
}
