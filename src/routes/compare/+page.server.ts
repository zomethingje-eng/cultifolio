import { getDossier, resolveSlug, corpusNow } from '$lib/server/dossiers';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/**
 * /compare?s=slug,slug,slug: up to three dossiers side by side. Unknown slugs are named, not dropped in silence; no slugs
 * is the empty page. One corpus for the page (round sixty; A27: each slug loaded its own). A name the index does not
 * hold is `missing` ("Not in the reference"); one it holds whose page cannot be read is `unreadable` (round sixty; A6:
 * it was called missing), and the page is then not kept.
 */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders, cookies, request, locals }) => {
  const slugs = [...new Set((url.searchParams.get('s') ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 3);
  const c = locals?.corpus ?? (await corpusNow(platform, fetch));
  const found = await Promise.all(
    slugs.map(async (slug) => {
      const key = await resolveSlug(platform, fetch, slug, c);
      if (!key) return { slug, d: null, listed: false };
      const loaded = await getDossier(platform, fetch, key, c).catch(() => null);
      const d = loaded && loaded.slug !== slug ? { ...loaded, slug } : loaded; // under the slug asked for, which is the index's (round seventeen, 6)
      return { slug, d, listed: true };
    })
  );
  const unreadable = found.filter((x) => !x.d && x.listed).map((x) => x.slug);
  // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  setHeaders({ 'cache-control': unreadable.length ? 'no-store' : 'private, max-age=60', vary: 'accept-language, cookie' });
  return { units: unitsFor(cookies, request), hemiLat: cookies.get('cultifolio.hemi') === 's' ? -1 : cookies.get('cultifolio.hemi') === 'n' ? 1 : null, items: found.filter((x) => x.d).map((x) => x.d!), missing: found.filter((x) => !x.listed).map((x) => x.slug), unreadable };
};
