import { browseOf, corpusOf, countRender, canonicalSearch, toCanonical, BROWSE_CACHE } from '$lib/browse/load.server';
import { level3With } from '$lib/browse/counts';
import { wholeCounts, queryString, EMPTY } from '$lib/browse/engine';
import { CONTINENTS, COUNTRIES, childrenOf } from '$lib/browse/tdwg';
import { builtWords } from '$lib/browse/sources';
import { nameOrder } from '$lib/browse/order';
import { lastmodOf } from '$lib/server/sitemap';
import type { PageServerLoad } from './$types';

/**
 * /region (round eighty-seven, C2): TDWG's regions, continent by continent, each with its species, and the countries,
 * each a preset of the level-3 regions it holds. The front page's Browse table links here, with this page's count of
 * level-3 regions (`level3With`, the front page's too). Every render counted, the HTML kept a minute by the browser alone,
 * and an address with a query moved to the page's own (round eighty-seven, the review of stage 1, S4 and S5).
 */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  toCanonical(url, canonicalSearch(url, 'index'));
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const p = await browseOf(c, platform, fetch);
  const w = wholeCounts(p);
  const n = (code: string) => w.regions.get(code) ?? 0;
  const node = (code: string, label: string, slug: string) => ({ code, label, slug, n: n(code) });
  setHeaders({ 'cache-control': BROWSE_CACHE });
  return {
    total: p.t.n,
    unplaced: w.unplaced,
    level3: level3With(w),
    continents: CONTINENTS.map((l1) => ({ ...node(l1.code, l1.label, l1.slug), regions: childrenOf(l1.code).map((l2) => ({ ...node(l2.code, l2.label, l2.slug), parts: childrenOf(l2.code).map((l3) => node(l3.code, l3.label, l3.slug)) })) })),
    countries: [...COUNTRIES.values()].map((x) => ({ name: x.name, n: w.countries.get(x.iso) ?? 0, shared: x.shared, regions: x.regions.length, href: `/browse${queryString({ ...EMPTY, r: [...x.regions] })}` })).filter((x) => x.n > 0).sort((a, b) => nameOrder(a.name, b.name)),
    built: builtWords(lastmodOf(c.manifest?.built))
  };
};
