import { error, redirect } from '@sveltejs/kit';
import { getDossier, resolveSlug, getIndex, getGenus, indexMaps } from '$lib/server/dossiers';
import { synonymOf, synonymInIndex, nameFromSlug } from '$lib/server/synonyms';
import generaList from '../../../../scripts/specialist-genera.txt?raw';
/** The genera the species list takes whole (the file the derivation reads), for the 404 to say so. */
const WHOLE_GENERA = new Set(generaList.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
import { limited } from '$lib/server/sync';
import { genusOf, slugify, canonicalSynonym } from '$core/names';
import { worldSvg, regionSvg } from '$lib/map/still';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, fetch, setHeaders, cookies, request, url, getClientAddress }) => {
  const key = await resolveSlug(platform, fetch, params.slug);
  if (!key) {
    // An old name: the index's own synonym lists first (no request), then the backbone is asked whether it is a synonym,
    // and the page moves to the accepted species when the reference holds it, saying so; otherwise the 404 says what the
    // name is now (round thirty, R2-8; round thirty-two, 2). The move is temporary (a 302, cached for the day the
    // answer is), since the backbone changes its mind and a browser keeps a 301 for good; and a lookup upstream is
    // rate-limited per address, since a script can mint binomial-shaped addresses without end (round thirty-three, 12).
    let syn = await synonymInIndex(platform, fetch, params.slug);
    if (!syn) {
      const stop = await limited(platform, getClientAddress, 'match');
      if (stop) error(429, { message: 'Too many unknown species addresses from this address; wait a few minutes and try again.' });
      syn = await synonymOf(platform, fetch, params.slug);
    }
    if (syn?.slug) {
      setHeaders({ 'cache-control': 'public, max-age=86400' });
      redirect(302, `/species/${syn.slug}?was=${encodeURIComponent(syn.matched)}`);
    }
    // A 404 is cached for a few minutes only: the reference grows, and the backbone's answer is cached a day upstream already (round thirty-five, R1-13).
    setHeaders({ 'cache-control': 'public, max-age=300' });
    // What the 404 can say that helps: the name as asked, how many of its genus the reference holds, and whether the
    // genus is taken whole or only by the cultivated count (round forty-one, R15). An aloe grower's most common first
    // visit was a dead end that said nothing.
    const asked = nameFromSlug(params.slug);
    const genus = asked.split(' ')[0] ?? '';
    const index = await getIndex(platform, fetch);
    const species = genus ? { name: asked, genus, inGenus: indexMaps(index).byGenus.get(genus)?.length ?? 0, wholeGenus: WHOLE_GENERA.has(genus), ...(syn ? { accepted: syn.acceptedName } : {}) } : undefined;
    if (syn) error(404, { message: `${syn.matched} is ${syn.acceptedName} in the GBIF backbone, and that species is not in the reference`, species });
    error(404, { message: `No dossier for “${params.slug}”`, species });
  }
  // The dossier and the genus record are two objects in the bucket, read together, since the genus is known from the
  // index before the dossier arrives; read one after the other they were two round trips on every page (round forty-three, 2).
  const index = await getIndex(platform, fetch);
  const { byKey, byGenus } = indexMaps(index); // once per index, not a map of fifty thousand entries per page (round fifty-one, 6)
  const me = byKey.get(key);
  const [loaded, genusRecordEarly] = await Promise.all([getDossier(platform, fetch, key), me ? getGenus(platform, fetch, slugify(genusOf(me.name))) : Promise.resolve(undefined)]);
  if (!loaded) error(404, { message: `No dossier for “${params.slug}”` });
  // The page's own slug is the index's: a homonym whose plain slug the index gave to the other species carries that
  // plain slug in its file, and every link, Compare, Follow and note keyed on it would point at the other (round seventeen, 6).
  const d = params.slug !== loaded.slug ? { ...loaded, slug: params.slug } : loaded;
  const pts = d.occurrences.open.map((p) => [p[0], p[1]] as [number, number]);
  // Short for HTML: a deploy changes the hashed asset names the page references, so a page cached for an hour
  // would point at assets that no longer exist. The assets themselves are immutable and cached for a year.
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  // Related: the rest of the genus, and the species whose habitat climate is nearest (from the index; nothing computed here).
  const card = (e: NonNullable<typeof me>) => ({ key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, thumb: e.thumb, open: e.open, climate: e.climate });
  const genus = genusOf(d.name.scientific);
  // The page shows twelve and a count: the rest of a large genus (six hundred cards, taken whole) is not sent (round forty, own).
  const allSiblings = (byGenus.get(genus) ?? []).filter((e) => e.key !== key);
  const siblings = allSiblings.slice(0, 12).map(card);
  const siblingCount = allSiblings.length;
  // Only a species with a derived climate can be near anything; the build writes it so, and a stale index is not trusted to.
  const near = (me?.near ?? []).map((k) => byKey.get(k)).filter((e): e is NonNullable<typeof me> => !!e && e.climate === 'ok').map(card);
  // About the genus: its Wikipedia lead, written by `--fill genus`; null when that pass has not run for this genus.
  const genusRecord = genusRecordEarly !== undefined ? genusRecordEarly : await getGenus(platform, fetch, slugify(genus));
  // Shown only when the name is one this species' own record lists (the index's binomials, or the dossier's synonyms):
  // `?was=` is a statement anyone can write into a link, and the page printed it as fact (round thirty-three, 12).
  const was = url.searchParams.get('was');
  // Compared without rank markers, since the backbone's canonical form of a variety drops "var." (round thirty-four).
  const plain = (x: string) => x.toLowerCase().replace(/\b(var|subsp|ssp|f)\.? /g, '').replace(/\s+/g, ' ').trim();
  const listed = [...(me?.syn ?? []), ...(d.name.synonyms ?? []).map((x) => canonicalSynonym(x)).filter((x): x is string => !!x)].map(plain);
  const ownNames = new Set(listed);
  // The binomial of a listed variety counts too: the backbone files "Trichocereus pachanoi" under a variety of
  // T. macrogonus, and the address `trichocereus-pachanoi` reached the page with no line saying why (round thirty-five, R1-12).
  const binomialOf = (x: string) => x.split(' ').slice(0, 2).join(' ');
  const wasPlain = was ? plain(was) : '';
  const asVariety = !!wasPlain && !ownNames.has(wasPlain) && listed.some((x) => x.split(' ').length > 2 && binomialOf(x) === wasPlain);
  // And a variety of a listed older name: `haworthia-attenuata-var-radula` reached Haworthiopsis attenuata with no line,
  // because the record lists Haworthia attenuata and not that variety of it (round thirty-seven, R1-8). What the line
  // may say is what the record holds: the binomial is an older name of this species, and the address named a variety of it.
  const ofOlder = !!wasPlain && !ownNames.has(wasPlain) && !asVariety && wasPlain.split(' ').length > 2 && ownNames.has(binomialOf(wasPlain));
  return {
    /** The old name this page was reached by, when the address was a synonym the backbone resolved (round thirty, R2-8). */
    was: was && /^[\p{L}\p{M} .'\-×]{3,80}$/u.test(was) && (ownNames.has(wasPlain) || asVariety || ofOlder) ? was : null,
    /** The old name is the binomial of a variety the backbone places under this species, not of the species itself. */
    wasVariety: asVariety,
    /** The old name is a variety of a binomial the record lists as an older name of this species. */
    wasOfOlder: ofOlder,
    units: unitsFor(cookies, request),
    // The grower's hemisphere, when their site has been saved on this device: seeds the months before the site store loads.
    hemiLat: cookies.get('cultifolio.hemi') === 's' ? -1 : cookies.get('cultifolio.hemi') === 'n' ? 1 : null,
    d,
    genusRecord,
    siblings,
    siblingCount,
    near,
    worldSvg: worldSvg(d.distribution.boxes, d.centroid, `Native range of ${d.name.scientific}`),
    regionSvg: regionSvg(d.distribution.boxes, pts, d.centroid, `Openly licensed records of ${d.name.scientific}`)
  };
};
