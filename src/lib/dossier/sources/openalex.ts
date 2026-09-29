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
