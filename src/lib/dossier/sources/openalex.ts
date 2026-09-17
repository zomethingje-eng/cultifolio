import type { JsonFetcher, FetchResult } from '../fetch';

interface Work {
  title?: string;
  display_name?: string;
  publication_year?: number;
  doi?: string;
  id?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
}

/**
 * OpenAlex is CC0. Not load-bearing: a species page reads fine without it.
 * Anonymous requests share a per-IP pool that shuts after about a hundred
 * calls; an API key (free, from openalex.org) gets its own allowance. Set
 * OPENALEX_KEY in the environment; the key goes in the query string as
 * OpenAlex asks, never in the dossier.
 */
export async function literature(f: JsonFetcher, scientificName: string, max = 12, apiKey = typeof process !== 'undefined' ? process.env?.OPENALEX_KEY?.trim() : undefined) {
  const r = await f<{ results: Work[] }>(
    `https://api.openalex.org/works?search=${encodeURIComponent(`"${scientificName}"`)}&per-page=${max}&sort=cited_by_count:desc&mailto=hello@cultifolio.com${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`
  );
  if (r.status !== 'ok') return r as FetchResult<never>;
  const out = r.data.results
    .filter((w) => w.title || w.display_name)
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
