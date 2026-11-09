import { error, redirect } from '@sveltejs/kit';
import { getGenus } from '$lib/server/dossiers';
import { browseView, corpusOf, figuresOf, browseOf, countRender, canonicalSearch, toCanonical, BROWSE_HEADERS } from '$lib/browse/load.server';
import { wholeCounts, rowsWhere, regionsOfRows, queryString, EMPTY, GENUS_PAGE_MIN } from '$lib/browse/engine';
import { slugAt } from '$lib/browse/table';
import { slugify } from '$core/names';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/**
 * /genus/<slug> (round eighty-seven, C2): a genus of two species or more here, as the browse engine's view of its
 * species, with Wikipedia's lead for the genus where the reference read one (the genus record the species pages
 * quote), and the regions its species are native to. A genus of one species moves to that species' page.
 */
export const load: PageServerLoad = async ({ cookies, request, params, url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const p = await browseOf(c, platform, fetch);
  const g = p.genusBySlug.get(params.slug);
  if (g === undefined) error(404, { message: 'The reference holds no genus of this name', browse: true });
  const rows = rowsWhere(p, { genus: g });
  if (rows.length < GENUS_PAGE_MIN) redirect(307, `/species/${slugAt(p.t, rows[0])}`);
  toCanonical(url, canonicalSearch(url, 'entrance')); // its own query only (round eighty-seven, S5)
  const [{ view, answer }, record] = await Promise.all([browseView(c, platform, fetch, url, { g: params.slug }, `/genus/${params.slug}`), getGenus(platform, fetch, params.slug, c).catch(() => null)]);
  const family = wholeCounts(p).genusFamily[g];
  setHeaders(BROWSE_HEADERS);
  return {
    units: unitsFor(cookies, request),
    genus: p.genera[g],
    slug: params.slug,
    family: family ? { name: family, slug: slugify(family) } : null,
    figures: figuresOf(answer),
    regions: regionsOfRows(p, rows).slice(0, 12).map((r) => ({ ...r, href: `/browse${queryString({ ...EMPTY, g: params.slug, r: [r.code] })}` })),
    record: record ? { status: record.status, detail: record.detail ?? null, summary: record.summary ?? null } : null,
    view
  };
};
