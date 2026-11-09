import { browseOf, corpusOf, countRender, canonicalSearch, toCanonical, BROWSE_CACHE } from '$lib/browse/load.server';
import { wholeCounts, GENUS_PAGE_MIN } from '$lib/browse/engine';
import { genusSizes } from '$lib/browse/counts';
import { nameOrder } from '$lib/browse/order';
import { slugify, withoutSign } from '$core/names';
import type { PageServerLoad } from './$types';

/**
 * /genus (round eighty-seven, C2): the genera with a page, by letter (`?from=B`; A first). A genus of one species here
 * is reached by that species' page, and counted apart. The genera with a page are the number the front page's Browse
 * table gives (`entranceCountsOf`, by the same `genusSizes`). Every render counted, the HTML kept a minute by the browser
 * alone, and an address in its one spelling: `?from=` a capital letter, or nothing (round eighty-seven, S4 and S5).
 */
export const load: PageServerLoad = async ({ url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  const from = (url.searchParams.get('from') ?? '').toUpperCase();
  toCanonical(url, /^[A-Z]$/.test(from) ? `?from=${from}` : '');
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const p = await browseOf(c, platform, fetch);
  const w = wholeCounts(p);
  const count = genusSizes(p);
  const letterOf = (g: string) => withoutSign(g).charAt(0).toUpperCase();
  const all = p.genera.map((g, i) => ({ name: g, slug: slugify(g), n: count[i], family: w.genusFamily[i], familySlug: slugify(w.genusFamily[i]), letter: letterOf(g) })).filter((g) => g.n >= GENUS_PAGE_MIN).sort((a, b) => nameOrder(withoutSign(a.name), withoutSign(b.name)));
  const letters = [...new Set(all.map((g) => g.letter))].sort(nameOrder);
  const asked = (url.searchParams.get('from') ?? '').toUpperCase();
  const letter = letters.includes(asked) ? asked : letters[0] ?? 'A';
  setHeaders({ 'cache-control': BROWSE_CACHE });
  return {
    letter,
    letters: letters.map((l) => ({ l, n: all.filter((g) => g.letter === l).length })),
    genera: all.filter((g) => g.letter === letter).map(({ letter: _l, ...g }) => g),
    withPage: all.length,
    single: p.genera.length - all.length,
    total: p.t.n,
    asked: !!url.searchParams.get('from')
  };
};
