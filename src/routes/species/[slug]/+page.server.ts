import { error } from '@sveltejs/kit';
import { getDossier, resolveSlug, getIndex, getGenus } from '$lib/server/dossiers';
import { genusOf, slugify } from '$core/names';
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
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  // Related: the rest of the genus, and the species whose habitat climate is nearest (from the index; nothing computed here).
  const index = await getIndex(platform, fetch);
  const byKey = new Map(index.map((e) => [e.key, e]));
  const me = byKey.get(key);
  const card = (e: NonNullable<typeof me>) => ({ key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, thumb: e.thumb, open: e.open, climate: e.climate });
  const genus = genusOf(d.name.scientific);
  const siblings = index.filter((e) => e.key !== key && genusOf(e.name) === genus).sort((a, b) => a.name.localeCompare(b.name)).map(card);
  const near = (me?.near ?? []).map((k) => byKey.get(k)).filter((e): e is NonNullable<typeof me> => !!e).map(card);
  // About the genus: its Wikipedia lead, written by `--fill genus`; null when that pass has not run for this genus.
  const genusRecord = await getGenus(platform, fetch, slugify(genus));
  return {
    d,
    genusRecord,
    siblings,
    near,
    worldSvg: worldSvg(d.distribution.boxes, d.centroid, `Native range of ${d.name.scientific}`),
    regionSvg: regionSvg(d.distribution.boxes, pts, d.centroid, `Openly licensed records of ${d.name.scientific}`)
  };
};
