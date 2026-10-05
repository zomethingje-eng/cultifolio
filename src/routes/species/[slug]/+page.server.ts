import { error, redirect } from '@sveltejs/kit';
import { getDossier, resolveSlug, corpusNow, getGenus, indexMaps, searchAnswer } from '$lib/server/dossiers';
import { synonymOf, synonymInIndex, nameFromSlug } from '$lib/server/synonyms';
import generaList from '../../../../scripts/specialist-genera.txt?raw';
/** The genera the species list takes whole (the file the derivation reads), for the 404 to say so. */
const WHOLE_GENERA = new Set(generaList.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
import { limited } from '$lib/server/sync';
import { genusOf, slugify, canonicalSynonym } from '$core/names';
import { worldSvg, regionSvg } from '$lib/map/still';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/** The 503's sentence when the index lists a species whose page cannot be read (round sixty). */
const SPECIES_UNREADABLE = 'This species page could not be read just now';

export const load: PageServerLoad = async ({ params, platform, fetch, setHeaders, cookies, request, url, getClientAddress, locals }) => {
  // One corpus for the page, the hook's when it held the page: its key, its slug and every index read (round fifty-nine).
  // A corpus that cannot be read is a 503 that says so (`UNREADABLE`), never the fixture's species (round sixty).
  const c = locals?.corpus ?? (await corpusNow(platform, fetch));
  // An address in capitals, or with a space, an underscore or any other character a slug does not have, is the same
  // species: moved for good to the slug, written as a slug, so no decoded character (a space, a `?`, a line break) is
  // ever put in the Location header or changes which page answers (round sixty; the corpus review, 9: `Copiapoa%20cinerea`
  // moved to an address with a raw space, `%3F` to another page, and `%0D%0A` was a 500). `/species/Copiapoa-cinerea`
  // said Kew did not accept the name (round fifty-eight).
  if (!c.bySlug.has(params.slug)) {
    const slug = slugify(params.slug);
    if (slug !== params.slug) {
      if (!slug) error(404, { message: 'No species page at this address' });
      redirect(301, `/species/${encodeURIComponent(slug)}${url.search}`);
    }
  }
  const key = await resolveSlug(platform, fetch, params.slug, c);
  if (!key) {
    // A genus alone is its row in the catalogue, opened (round fifty-eight): `/species/copiapoa` was a dead end.
    if (/^[a-z]+$/.test(params.slug)) {
      const g = params.slug[0].toUpperCase() + params.slug.slice(1);
      if (indexMaps(c.idx).byGenus.get(g)?.length) redirect(302, `/?by=genus&open=${slugify(g)}`);
    }
    // An old name: the index's own synonym lists first (no request), then the backbone is asked whether it is a synonym,
    // and the page moves to the accepted species when the reference holds it, saying so; otherwise the 404 says what the
    // name is now (round thirty, R2-8; round thirty-two, 2). The move is temporary (a 302, cached for the day the
    // answer is), since the backbone changes its mind and a browser keeps a 301 for good; and a lookup upstream is
    // rate-limited per address, since a script can mint binomial-shaped addresses without end (round thirty-three, 12).
    let syn = await synonymInIndex(platform, fetch, params.slug, c); // the page's corpus (round sixty; A27)
    let unchecked = false;
    if (!syn) {
      const stop = await limited(platform, getClientAddress, 'match');
      if (stop) error(429, { message: 'Too many unknown species addresses from this address; wait a few minutes and try again.' });
      const asked = await synonymOf(platform, fetch, params.slug, c);
      unchecked = asked === 'unchecked';
      syn = asked === 'unchecked' ? null : asked;
    }
    if (syn?.slug) {
      setHeaders({ 'cache-control': 'public, max-age=86400' });
      redirect(302, `/species/${syn.slug}?was=${encodeURIComponent(syn.matched)}`);
    }
    // A 404 is cached for a few minutes only: the reference grows, and the backbone's answer is cached a day upstream already (round thirty-five, R1-13).
    // Not when the backbone could not be asked: that page says so, and the next visit should ask again.
    setHeaders({ 'cache-control': unchecked ? 'no-store' : 'public, max-age=300' });
    // What the 404 can say that helps: the name as asked, how many of its genus the reference holds, and whether the
    // genus is taken whole or only by the cultivated count (round forty-one, R15). An aloe grower's most common first
    // visit was a dead end that said nothing.
    const asked = nameFromSlug(params.slug);
    const genus = asked.split(' ')[0] ?? '';
    const index = c.idx;
    // And the reference's own nearest names, by the catalogue's search (the slips it forgives, and since round sixty the
    // way growers write names: a variety the reference files under its species is offered that species, as the search's
    // retry on the first two words finds it), so a misspelt address offers the page it meant (round fifty-eight). Only
    // from the postings: a miss of them is no suggestion, never a whole-index pass.
    const found = asked ? await searchAnswer(platform, fetch, asked, 3, async () => new Response(null, { status: 429 }), c).catch(() => null) : null;
    const suggest = found && 'hits' in found ? found.hits.filter((e) => e.slug !== params.slug).map((e) => ({ slug: e.slug, name: e.name })) : [];
    const species = genus ? { name: asked, genus, inGenus: indexMaps(index).byGenus.get(genus)?.length ?? 0, wholeGenus: WHOLE_GENERA.has(genus), ...(syn ? { accepted: syn.acceptedName } : {}), suggest } : undefined;
    if (syn) error(404, { message: `${syn.matched} is ${syn.acceptedName} in the GBIF backbone, and that species is not in the reference`, species });
    error(404, { message: unchecked ? `No species page for “${params.slug}”. Whether it is an older name for a species that is here was not checked: GBIF's name service did not answer` : `No species page for “${params.slug}”`, species });
  }
  // The dossier and the genus record are two objects in the bucket, read together, since the genus is known from the
  // index before the dossier arrives; read one after the other they were two round trips on every page (round forty-three, 2).
  const index = c.idx;
  const { byKey, byGenus } = indexMaps(index); // once per index, not a map of fifty thousand entries per page (round fifty-one, 6)
  const me = byKey.get(key);
  // The species is in the index: a dossier that cannot be read (absent from the bucket, damaged, or R2 not answering) is
  // a page that could not be read, a 503 not kept by anyone, never "No species page" (round sixty; the first outside
  // review, A6; rule 2: a refusal is not an absence).
  // The error carries `unreadable: true` and the species as the index lists it, so the error page can say "could not be
  // read" and name it, and never "not on the list" (a variable, not a literal: App.Error gains the field at merge).
  const unreadable = () => {
    setHeaders({ 'cache-control': 'no-store' });
    const g = me ? genusOf(me.name) : '';
    const body = { message: SPECIES_UNREADABLE, unreadable: true as const, ...(me ? { species: { name: me.name, genus: g, inGenus: byGenus.get(g)?.length ?? 0, wholeGenus: WHOLE_GENERA.has(g) } } : {}) };
    return error(503, body);
  };
  const [loaded, genusRecordEarly] = await Promise.all([getDossier(platform, fetch, key, c).catch(() => null), me ? getGenus(platform, fetch, slugify(genusOf(me.name)), c).catch(() => null) : Promise.resolve(undefined)]);
  if (!loaded) return unreadable();
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
  const genusRecord = genusRecordEarly !== undefined ? genusRecordEarly : await getGenus(platform, fetch, slugify(genus), c).catch(() => null);
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
