import { error } from '@sveltejs/kit';
import { getDossier, resolveSlug } from '$lib/server/dossiers';
import { worldSvg, regionSvg } from '$lib/map/still';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, fetch, setHeaders }) => {
  const key = await resolveSlug(platform, fetch, params.slug);
  if (!key) error(404, { message: `No dossier for “${params.slug}” yet` });
  const d = await getDossier(platform, fetch, key);
  if (!d) error(404, { message: `No dossier for “${params.slug}” yet` });
  const pts = d.occurrences.open.map((p) => [p[0], p[1]] as [number, number]);
  // Short for HTML: a deploy changes the hashed asset names the page references, so a page cached for an hour
  // would point at assets that no longer exist. The assets themselves are immutable and cached for a year.
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'public, max-age=60' });
  return {
    d,
    worldSvg: worldSvg(d.distribution.boxes, d.centroid, `Native range of ${d.name.scientific}`),
    regionSvg: regionSvg(d.distribution.boxes, pts, d.centroid, `Openly licensed records of ${d.name.scientific}`)
  };
};
