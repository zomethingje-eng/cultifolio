import { error, redirect } from '@sveltejs/kit';
import { browseView, corpusOf, figuresOf, hasBrowse, countRender, canonicalSearch, toCanonical, BROWSE_HEADERS } from '$lib/browse/load.server';
import { wholeCounts, queryString, nativeNamesOf, EMPTY } from '$lib/browse/engine';
import { nextDoor } from '$lib/browse/neighbours';
import { regionBySlug, regionOf, codeOf, lineOf, childrenOf, countriesIn, level3Of } from '$lib/browse/tdwg';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/**
 * /region/<slug> (round eighty-seven, C2): one of TDWG's regions, at any level, as the browse engine's view of the
 * species native to it, with its own figures, the regions beside it and in it, and its countries. A TDWG code
 * ("/region/cpp", "/region/27") moves to the region's address.
 *
 * Stage 2: the regions next door (`nextDoor`, whose outlines touch), and for the collection lens (C8), worked out in the
 * browser, the origin names of the index that are native here and in each region next door: the same for every reader.
 */
export const load: PageServerLoad = async ({ cookies, request, params, url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  const r = regionBySlug(params.slug) ?? (codeOf(params.slug) ? regionOf(codeOf(params.slug)!) : undefined);
  // A 404 says whether the browse pages it links are there (B2): an unknown region of a corpus with no table links none.
  if (!r) error(404, { message: 'No region of TDWG\'s scheme has this address', browse: await Promise.resolve(corpusOf(locals, platform, fetch)).then(hasBrowse, () => false) });
  // The region's address and the page's own query in one move (round eighty-seven, S5).
  const search = canonicalSearch(url, 'entrance');
  if (r.slug !== params.slug) redirect(301, `/region/${r.slug}${search}`);
  toCanonical(url, search);
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const { view, p, answer } = await browseView(c, platform, fetch, url, { r: [r.code] }, `/region/${r.slug}`);
  const w = wholeCounts(p);
  const link = (code: string) => { const x = regionOf(code)!; return { label: x.label, slug: x.slug, code, n: w.regions.get(code) ?? 0 }; };
  setHeaders(BROWSE_HEADERS);
  return {
    units: unitsFor(cookies, request),
    region: { code: r.code, label: r.label, name: r.name, level: r.level, slug: r.slug, parts: level3Of(r.code).length },
    line: lineOf(r.code).slice(0, -1).map((x) => ({ label: x.label, href: `/region/${x.slug}` })),
    up: r.up ? link(r.up) : null,
    siblings: (r.up ? childrenOf(r.up) : []).filter((x) => x.code !== r.code).map((x) => link(x.code)),
    parts: childrenOf(r.code).map((x) => link(x.code)),
    countries: countriesIn(r.code).map((x) => ({ name: x.name, n: w.countries.get(x.iso) ?? 0, href: `/browse${queryString({ ...EMPTY, r: [...x.regions] })}` })).filter((x) => x.n > 0),
    figures: figuresOf(answer),
    lens: nativeNamesOf(p, r.code),
    next: (() => {
      const n = nextDoor(r.code);
      return n === null ? null : n.map((code) => ({ ...link(code), key: code, native: nativeNamesOf(p, code) })).sort((a, b) => b.n - a.n).slice(0, 14);
    })(),
    view
  };
};
