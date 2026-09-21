import { getDossier, resolveSlug } from '$lib/server/dossiers';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/** /compare?s=slug,slug,slug: up to three dossiers side by side. Unknown slugs are named, not dropped in silence; no slugs is the empty page. */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders, cookies, request }) => {
  const slugs = [...new Set((url.searchParams.get('s') ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 3);
  const found = await Promise.all(
    slugs.map(async (slug) => {
      const key = await resolveSlug(platform, fetch, slug);
      const d = key ? await getDossier(platform, fetch, key) : null;
      return { slug, d };
    })
  );
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  return { units: unitsFor(cookies, request), items: found.filter((x) => x.d).map((x) => x.d!), missing: found.filter((x) => !x.d).map((x) => x.slug) };
};
