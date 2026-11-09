import { browseOf, corpusOf, countRender, canonicalSearch, toCanonical, BROWSE_CACHE } from '$lib/browse/load.server';
import { wholeCounts } from '$lib/browse/engine';
import { nameOrder } from '$lib/browse/order';
import { slugify } from '$core/names';
import type { PageServerLoad } from './$types';

/**
 * /family (round eighty-seven, C2): every family of the reference, A to Z, with its species and genera; as many as the
 * front page's Browse table says. Every render counted, the HTML kept a minute by the browser alone, and an address with
 * a query moved to the page's own (the review of stage 1, S4 and S5).
 */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  toCanonical(url, canonicalSearch(url, 'index'));
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const p = await browseOf(c, platform, fetch);
  const w = wholeCounts(p);
  const species = new Int32Array(p.t.families.length);
  for (let i = 0; i < p.t.n; i++) if (p.t.family[i] >= 0) species[p.t.family[i]]++;
  const genera = new Map<string, number>();
  w.genusFamily.forEach((f) => { if (f) genera.set(f, (genera.get(f) ?? 0) + 1); });
  setHeaders({ 'cache-control': BROWSE_CACHE });
  return {
    families: p.t.families.map((name, i) => ({ name, slug: slugify(name), n: species[i], genera: genera.get(name) ?? 0 })).sort((a, b) => nameOrder(a.name, b.name)),
    total: p.t.n,
    without: p.t.family.filter((f) => f < 0).length
  };
};
