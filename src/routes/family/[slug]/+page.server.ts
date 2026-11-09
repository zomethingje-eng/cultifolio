import { error } from '@sveltejs/kit';
import { browseView, corpusOf, figuresOf, browseOf, countRender, canonicalSearch, toCanonical, BROWSE_HEADERS } from '$lib/browse/load.server';
import { rowsWhere, regionsOfRows, queryString, EMPTY } from '$lib/browse/engine';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/** /family/<slug> (round eighty-seven, C2): a family as the browse engine's view of its species, with its genera and the regions it is native to. */
export const load: PageServerLoad = async ({ cookies, request, params, url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const p = await browseOf(c, platform, fetch);
  const f = p.familyBySlug.get(params.slug);
  if (f === undefined) error(404, { message: 'The reference holds no family of this name', browse: true });
  toCanonical(url, canonicalSearch(url, 'entrance')); // its own query only (round eighty-seven, S5)
  const { view, answer } = await browseView(c, platform, fetch, url, { f: params.slug }, `/family/${params.slug}`);
  setHeaders(BROWSE_HEADERS);
  return {
    units: unitsFor(cookies, request),
    family: p.t.families[f],
    slug: params.slug,
    figures: figuresOf(answer),
    regions: regionsOfRows(p, rowsWhere(p, { family: f })).slice(0, 12).map((r) => ({ ...r, href: `/browse${queryString({ ...EMPTY, f: params.slug, r: [r.code] })}` })),
    view
  };
};
