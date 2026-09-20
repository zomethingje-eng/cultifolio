import { getDossier, resolveSlug } from '$lib/server/dossiers';
import type { PageServerLoad } from './$types';

/** /compare?s=slug,slug,slug: up to three dossiers side by side. Unknown slugs are named, not dropped in silence; no slugs is the empty page. */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders }) => {
  const slugs = [...new Set((url.searchParams.get('s') ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 3);
  const found = await Promise.all(
    slugs.map(async (slug) => {
      const key = await resolveSlug(platform, fetch, slug);
      const d = key ? await getDossier(platform, fetch, key) : null;
      return { slug, d };
    })
  );
  setHeaders({ 'cache-control': 'public, max-age=60' });
  return { items: found.filter((x) => x.d).map((x) => x.d!), missing: found.filter((x) => !x.d).map((x) => x.slug) };
};
