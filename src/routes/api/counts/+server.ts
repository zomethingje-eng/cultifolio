import { json } from '@sveltejs/kit';
import { corpusNow } from '$lib/server/dossiers';
import { catalogueRows } from '$lib/server/catalogue';
import type { RequestHandler } from './$types';

/**
 * GET /api/counts — `{ corpus, species, genera, withClimate }`: the counts of the reference this Worker serves, which the
 * about pages show in place of the counts of the day they were built (round eighty-four; the reviews' S4 and A18). Read
 * from the catalogue's genus rows under "all", which the front page reads too, so the two pages say the same numbers:
 * one row per genus, `total` the species, `withClimate` those with a habitat climate. Public for five minutes, as the
 * whole index is: a count is the same for every reader, and a refreshed corpus shows within five minutes.
 */
export const GET: RequestHandler = async ({ platform, fetch }) => {
  const c = await corpusNow(platform, fetch);
  const { cat, corpus } = await catalogueRows(platform, fetch, 'genus', 'all', c);
  return json({ corpus, species: cat.total, genera: cat.rows.length, withClimate: cat.withClimate }, { headers: { 'cache-control': 'public, max-age=300' } });
};
