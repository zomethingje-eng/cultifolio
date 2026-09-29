import { error, redirect } from '@sveltejs/kit';
import { getDossier, resolveSlug, getIndex, getGenus } from '$lib/server/dossiers';
import { synonymOf } from '$lib/server/synonyms';
import { genusOf, slugify } from '$core/names';
import { worldSvg, regionSvg } from '$lib/map/still';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, fetch, setHeaders, cookies, request, url }) => {
  const key = await resolveSlug(platform, fetch, params.slug);
  if (!key) {
    // An old name: the backbone is asked whether it is a synonym, and the page moves to the accepted species when the
    // reference holds it, saying so; otherwise the 404 says what the name is now (round thirty, R2-8).
    const syn = await synonymOf(platform, fetch, params.slug);
    if (syn?.slug) redirect(301, `/species/${syn.slug}?was=${encodeURIComponent(syn.matched)}`);
    if (syn) error(404, { message: `${syn.matched} is ${syn.acceptedName} in the GBIF backbone, and that species is not in the reference yet` });
    error(404, { message: `No dossier for “${params.slug}” yet` });
  }
  const loaded = await getDossier(platform, fetch, key);
  if (!loaded) error(404, { message: `No dossier for “${params.slug}” yet` });
  // The page's own slug is the index's: a homonym whose plain slug the index gave to the other species carries that
  // plain slug in its file, and every link, Compare, Follow and note keyed on it would point at the other (round seventeen, 6).
  const d = params.slug !== loaded.slug ? { ...loaded, slug: params.slug } : loaded;
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
  // Only a species with a derived climate can be near anything; the build writes it so, and a stale index is not trusted to.
  const near = (me?.near ?? []).map((k) => byKey.get(k)).filter((e): e is NonNullable<typeof me> => !!e && e.climate === 'ok').map(card);
  // About the genus: its Wikipedia lead, written by `--fill genus`; null when that pass has not run for this genus.
  const genusRecord = await getGenus(platform, fetch, slugify(genus));
  const was = url.searchParams.get('was');
  return {
    /** The old name this page was reached by, when the address was a synonym the backbone resolved (round thirty, R2-8). */
    was: was && /^[\p{L}\p{M} .'\-×]{3,80}$/u.test(was) ? was : null,
    units: unitsFor(cookies, request),
    // The grower's hemisphere, when their site has been saved on this device: seeds the months before the site store loads.
    hemiLat: cookies.get('cultifolio.hemi') === 's' ? -1 : cookies.get('cultifolio.hemi') === 'n' ? 1 : null,
    d,
    genusRecord,
    siblings,
    near,
    worldSvg: worldSvg(d.distribution.boxes, d.centroid, `Native range of ${d.name.scientific}`),
    regionSvg: regionSvg(d.distribution.boxes, pts, d.centroid, `Openly licensed records of ${d.name.scientific}`)
  };
};
