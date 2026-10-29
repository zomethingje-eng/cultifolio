import { error, redirect } from '@sveltejs/kit';
import { getDossier, resolveSlug, corpusNow, getGenus, searchAnswer } from '$lib/server/dossiers';
import { synonymAsk, nameFromSlug, authorsOf, sharedNameMessage, cachedMatch, type SynonymAnswer } from '$lib/server/synonyms';
import { lookupOf, addressOf, mergedHolder, type Lookup } from '$lib/server/lookup';
import { plainName, synonymKey, type Card } from '$dossier/lookups';
/** The genera the species list takes whole (the file the derivation reads), for the 404 to say so. */
import { WHOLE_GENERA } from '$lib/ui/ref/whole-genera';
import { limited, clientIp } from '$lib/server/sync';
import { genusOf, slugify, canonicalSynonym } from '$core/names';
import { isPageId, type PageId } from '$core/page-id';
import { hybridOf, signedName, withKewLinks } from '$core/hybrids';
import { unitsFor } from '$lib/server/units';
import { englishNames, generaOf, mergedNamesOf } from '$dossier/index-entry';
import { addressGenus } from '$lib/ui/ref/notes';
import { authorKey, plainlyAnother } from '$dossier/authors';
import { regionSvg } from '$lib/map/still';
import { unitName } from '$core/regions';
import { drawOnce } from '$lib/server/drawn';
import type { PageServerLoad } from './$types';

/** The genera's words for `englishNames`, once for each genera read (round seventy-seven: every page folded all 1,300). */
const generaWords = new WeakMap<ReadonlyMap<string, number>, Set<string>>();
const generaHeld = (g: ReadonlyMap<string, number>) => { let w = generaWords.get(g); if (!w) generaWords.set(g, (w = generaOf(g.keys()))); return w; };

/** The 503's sentence when the index lists a species whose page cannot be read (round sixty). */
const SPECIES_UNREADABLE = 'This species page could not be read just now';

export const load: PageServerLoad = async ({ params, platform, fetch, setHeaders, cookies, request, url, getClientAddress, locals, isDataRequest }) => {
  // One corpus for the page, the hook's when it held the page: its key, its slug and every index read (round fifty-nine).
  // A corpus that cannot be read is a 503 that says so (`UNREADABLE`), never the fixture's species (round sixty).
  const c = locals?.corpus ?? (await corpusNow(platform, fetch));
  // Every name the page asks of the reference, by key: from the build's name files, or the maps over the index of a
  // corpus built before them (round seventy-six; $lib/server/lookup).
  const look: Lookup = lookupOf(c, platform, fetch);
  // What the address names, in the order since round seventy (`addressOf`):
  // - An address in capitals, or with a space, an underscore or any other character a slug does not have, is the same
  //   species: moved for good to the slug, written as a slug, so no decoded character (a space, a `?`, a line break) is
  //   ever put in the Location header or changes which page answers (round sixty; the corpus review, 9: `Copiapoa%20cinerea`
  //   moved to an address with a raw space, `%3F` to another page, and `%0D%0A` was a 500). `/species/Copiapoa-cinerea`
  //   said Kew did not accept the name (round fifty-eight).
  // - A genus alone is its row in the catalogue, opened (round fifty-eight): `/species/copiapoa` was a dead end.
  // - An older name of two species or more of the reference answers none of them (rule 3), and GBIF is not asked: the
  //   404 says so and names them (round sixty-nine; triage-68 N1, S-F1, R46-3: "Cotyledon mammillaris" went to
  //   Adromischus filicaulis, the first holder in the index's order, and the page said GBIF accepted it as that species).
  //   Whichever of them shows it (round seventy; triage-69 F1): looked up by the address's slug, so a hyphenated name is
  //   found as written (N3), and each holder named with the author under which its record holds the name, read from its
  //   dossier's stored synonyms, or with none where the record has none or could not be read.
  // - An old name the reference's own older names hold, held by one species: moved there (round thirty-one, 3).
  const at = await addressOf(look, params.slug, (slug) => resolveSlug(platform, fetch, slug, c));
  if (at.kind === 'move') {
    if (!at.slug) error(404, { message: 'No species page at this address' });
    redirect(301, `/species/${encodeURIComponent(at.slug)}${url.search}`);
  }
  if (at.kind === 'genus') redirect(302, `/?by=genus&open=${slugify(at.genus)}`);
  const key = at.kind === 'page' ? at.key : null;
  if (!key) {
    if (at.kind === 'shared') {
      const asName = at.name;
      const records = await Promise.all(at.holders.map(([k]) => getDossier(platform, fetch, k, c).catch(() => null)));
      // The old address of a page merged into one of them by the owner's decision goes to that page, as every merged
      // page's old address does (round eighty-three, A; `mergedHolder`): `/species/echeveria-peacockii` answered this 404,
      // because Kew's file also files the name under Dudleya pulverulenta. The kept page says so under its name.
      const kept = mergedHolder(params.slug, at.holders, records);
      if (kept) {
        setHeaders({ 'cache-control': records.every(Boolean) ? 'public, max-age=86400' : 'no-store' });
        redirect(302, `/species/${kept[1]}?was=${encodeURIComponent(asName)}`);
      }
      // A record not read is the next visit's to read again: kept by no one (rule 2), where a full answer is kept five minutes.
      setHeaders({ 'cache-control': records.every(Boolean) ? 'public, max-age=300' : 'no-store' });
      const g = asName.split(' ')[0];
      const message = sharedNameMessage(asName, at.holders.map(([, , name], i) => ({ name, authors: authorsOf(asName, records[i]?.name.synonyms ?? []) })));
      error(404, { message, species: { name: asName, genus: g, inGenus: at.inGenus, wholeGenus: WHOLE_GENERA.has(g), suggest: at.holders.map(([, slug, name]) => ({ slug, name })) } });
    }
    // An old name: the reference's own older names first (no request), then the backbone is asked whether it is a synonym,
    // and the page moves to the accepted species when the reference holds it, saying so; otherwise the 404 says what the
    // name is now (round thirty, R2-8; round thirty-two, 2). The move is temporary (a 302, cached for the day the
    // answer is), since the backbone changes its mind and a browser keeps a 301 for good; and a lookup upstream is
    // rate-limited per address, since a script can mint binomial-shaped addresses without end (round thirty-three, 12).
    let syn: SynonymAnswer | null = at.kind === 'older' ? { matched: at.matched, acceptedKey: at.key, acceptedName: at.name, slug: at.slug } : null; // the page's corpus (round sixty; A27)
    let unchecked = false;
    let heldBack = false; // the site held its call to GBIF back: not asked, never "did not answer" (round sixty-one)
    let gbifRefused = false; // GBIF refused this site's request: said as a refusal (round sixty-seven; S8)
    // The reference's own nearest names (below), asked beside GBIF's name service rather than after it: the two do not
    // depend on each other, and a missing address waited 4.4 s for one and then the other (round eighty; review-w 14).
    const asked = nameFromSlug(params.slug);
    let foundP: ReturnType<typeof searchAnswer> | null = null;
    const nearest = () => (foundP ??= asked ? searchAnswer(platform, fetch, asked, 3, async () => new Response(null, { status: 429 }), c).catch(() => ({ hits: [], corpus: '' })) : Promise.resolve({ hits: [], corpus: '' }));
    if (!syn) {
      const stop = await limited(platform, getClientAddress, 'match');
      if (stop) error(429, { message: 'Too many unknown species addresses from this address; wait a few minutes and try again.' });
      void nearest();
      // `synonymAsk` tells GBIF's own refusal of this site's request apart (round sixty-seven; triage-66 S8, R45-11).
      const asked = await synonymAsk(platform, fetch, params.slug, c, clientIp(getClientAddress)); // the reader's part of GBIF's share as well as the site's (round sixty-two; the server review's 3, outside review A29)
      unchecked = asked === 'unchecked' || asked === 'held' || asked === 'refused';
      heldBack = asked === 'held';
      gbifRefused = asked === 'refused';
      syn = asked === 'unchecked' || asked === 'held' || asked === 'refused' ? null : asked;
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
    // A genus only when the address is shaped as a name: "not-a-plant-zzz" is no genus "Not" (round seventy-two; triage F12).
    const genus = addressGenus(asked) ?? '';
    // And the reference's own nearest names, by the catalogue's search (the slips it forgives, and since round sixty the
    // way growers write names: a variety the reference files under its species is offered that species, as the search's
    // retry on the first two words finds it), so a misspelt address offers the page it meant (round fifty-eight). Only
    // from the postings: a miss of them is no suggestion, never a whole-index pass.
    const found = asked ? await nearest() : null;
    const suggest = found && 'hits' in found ? found.hits.filter((e) => e.slug !== params.slug).map((e) => ({ slug: e.slug, name: e.name })) : [];
    const species = genus ? { name: asked, genus, inGenus: (await look.genera()).get(genus) ?? 0, wholeGenus: WHOLE_GENERA.has(genus), ...(syn ? { accepted: syn.acceptedName } : {}), suggest } : undefined;
    if (syn) error(404, { message: `${syn.matched} is ${syn.acceptedName} in the GBIF backbone, and that species is not in the reference`, species });
    // A held call is "not asked", a silence "not checked" (round sixty-two; visitor-words 12, rule 2). "The calls this site
    // allows" covers the site's share and this address's part of it alike.
    // Each said in the order it happened, the held call with GBIF as its subject (round sixty-two; the words review's 15).
    error(404, { message: unchecked ? `No species page for “${params.slug}”. ${heldBack ? "GBIF was not asked whether it is an older name for a species that is here: this site held its call to GBIF back for this minute" : gbifRefused ? "Whether it is an older name for a species that is here was not checked: GBIF refused this site's request" : "Whether it is an older name for a species that is here was not checked: GBIF's name service did not answer"}` : `No species page for “${params.slug}”`, species });
  }
  // The dossier and the genus record are two objects in the bucket, read together, since the genus is known from the
  // index before the dossier arrives; read one after the other they were two round trips on every page (round forty-three, 2).
  // The species, the genera and its genus's row, read together with the dossier: by key from the name files under a
  // manifest that names them, from the maps over the index otherwise (round seventy-six).
  const [me, genera] = await Promise.all([look.species(key), look.genera()]);
  const rowOf = (g: string) => look.row('genus', slugify(g)).then((r) => (r?.items ?? []).filter((e) => genusOf(e.name) === g));
  // The species is in the index: a dossier that cannot be read (absent from the bucket, damaged, or R2 not answering) is
  // a page that could not be read, a 503 not kept by anyone, never "No species page" (round sixty; the first outside
  // review, A6; rule 2: a refusal is not an absence).
  // The error carries `unreadable: true` and the species as the index lists it, so the error page can say "could not be
  // read" and name it, and never "not on the list" (a variable, not a literal: App.Error gains the field at merge).
  const unreadable = () => {
    setHeaders({ 'cache-control': 'no-store' });
    const g = me ? genusOf(me.name) : '';
    const body = { message: SPECIES_UNREADABLE, unreadable: true as const, ...(me ? { species: { name: me.name, genus: g, inGenus: genera.get(g) ?? 0, wholeGenus: WHOLE_GENERA.has(g) } } : {}) };
    return error(503, body);
  };
  const myRow = me ? rowOf(genusOf(me.name)) : null;
  myRow?.catch(() => {}); // awaited below, or not at all when the page cannot be read
  const [loaded, genusRecordEarly] = await Promise.all([getDossier(platform, fetch, key, c).catch(() => null), me ? getGenus(platform, fetch, slugify(genusOf(me.name)), c).catch(() => null) : Promise.resolve(undefined)]);
  if (!loaded) return unreadable();
  // The page's own slug is the index's: a homonym whose plain slug the index gave to the other species carries that
  // plain slug in its file, and every link, Compare, Follow and note keyed on it would point at the other (round seventeen, 6).
  const d = params.slug !== loaded.slug ? { ...loaded, slug: params.slug } : loaded;
  // The open records are shown only as the regional map's points, which the page draws from their places, and the datasets
  // they came from only as a count (round seventy-seven): each record's year, country, kind and licence, and each
  // dataset's key, title, licence and count, are read by nothing the page shows, and were a fifth of what it carried to
  // the browser (the type below lets no part of the page read them).
  const points = d.occurrences.open.map((p) => [p[0], p[1]] as [number, number]);
  const { open: _open, datasets: _datasets, ...occurrences } = d.occurrences;
  // A hybrid of the list is shown with Kew's sign, and linked by Kew's own numbers where its record links neither (round
  // eighty-one, H; review-w 3, review-d 3; `$core/hybrids`): its address, and every name this load compares (they read `d`), are without it.
  const hybrid = hybridOf(key);
  const signed = signedName(key, d.name.scientific);
  const kewNo = withKewLinks(key, d.ids, d.links as Record<string, string>);
  const shown: Omit<typeof d, 'occurrences'> & { occurrences: typeof occurrences } = { ...d, name: signed === d.name.scientific ? d.name : { ...d.name, scientific: signed }, ids: kewNo.ids, links: kewNo.links as typeof d.links, occurrences };
  // Short for HTML: a deploy changes the hashed asset names the page references, so a page cached for an hour
  // would point at assets that no longer exist. The assets themselves are immutable and cached for a year.
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie' }); // private: the page is rendered in the reader's units, so no shared cache may hand one reader's page to another
  // Related: the rest of the genus, and the species whose habitat climate is nearest (from the index; nothing computed here).
  const card = (e: Pick<Card, 'key' | 'slug' | 'name' | 'family' | 'common' | 'thumb' | 'credit' | 'open' | 'climate'>) => ({ key: e.key, slug: e.slug, name: signedName(e.key, e.name), family: e.family, common: e.common, thumb: e.thumb, credit: e.credit, open: e.open, climate: e.climate });
  const genus = genusOf(d.name.scientific);
  // The English names by the index's own rule, with the corpus's genera, so the page, its title and its JSON-LD show the name its tile shows (round sixty-one; decision 7).
  const names = englishNames(d.name.vernacular, { genus: d.name.scientific, genera: generaHeld(genera), older: [...(d.name.synonyms ?? []), ...(d.name.kew?.synonyms ?? [])] });
  // The page shows twelve and a count: the rest of a large genus (six hundred cards, taken whole) is not sent (round forty, own).
  const allSiblings = (await (me && genusOf(me.name) === genus ? myRow! : rowOf(genus))).filter((e) => e.key !== key);
  const siblings = allSiblings.slice(0, 12).map(card);
  const siblingCount = allSiblings.length;
  // Only a species with a derived climate can be near anything; the build writes it so, and a stale index is not trusted to.
  const near = (await Promise.all((me?.near ?? []).map((k) => look.species(k)))).filter((e): e is Card => !!e && e.climate === 'ok').map(card);
  // About the genus: its Wikipedia lead, written by `--fill genus`; null when that pass has not run for this genus.
  const genusRecord = genusRecordEarly !== undefined ? genusRecordEarly : await getGenus(platform, fetch, slugify(genus), c).catch(() => null);
  // Shown only when the name is one this species' own record lists (the index's binomials, or the dossier's synonyms):
  // `?was=` is a statement anyone can write into a link, and the page printed it as fact (round thirty-three, 12).
  const was = url.searchParams.get('was');
  // Compared without rank markers, since the backbone's canonical form of a variety drops "var." (round thirty-four).
  const plain = plainName;
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
  // "The GBIF backbone accepts this species as" is said only of a name this species alone holds (round seventy; triage-69
  // F1, S-F1): of a name other species of the reference hold too, GBIF accepts no one species as it, and the line names
  // the others instead. No redirect sends a shared name here; a link written by hand, or a redirect a browser kept from
  // before, can. The name itself is looked up: a variety GBIF places under this species is GBIF's answer for that variety.
  const wellFormed = !!was && /^[\p{L}\p{M} .'\-×]{3,80}$/u.test(was);
  // A name the record does not list, which the backbone files under a subspecies or variety of this species: the
  // redirect put GBIF's answer in the Worker's cache, and only that answer, never the link, says so (round seventy-one;
  // S-F8: `/species/echinopsis-pachanoi` landed on Trichocereus macrogonus with no word why).
  const listedHere = ownNames.has(wasPlain) || asVariety || ofOlder;
  const m = wellFormed && !listedHere ? await cachedMatch(platform, was!) : null;
  // GBIF's keys are compared with the page's own GBIF key, never its id (round seventy-eight).
  const wasBelow = !!m && m.status === 'SYNONYM' && m.matchType === 'EXACT' && m.speciesKey === d.ids.gbif && m.acceptedUsageKey !== d.ids.gbif;
  const shownWas = wellFormed && (listedHere || wasBelow) ? was : null;
  // A name another species here is accepted under names no one species here, as a shared older name does (round
  // seventy-one; S-F3: `?was=Annona%20muricata` on Annona montana, which holds Vellozo's homonym, said the backbone
  // accepted this species as Annona muricata, the soursop's name).
  const acceptedElsewhere = shownWas ? [await look.accepted(wasPlain)].filter((e): e is NonNullable<typeof e> => !!e && e[0] !== key).map(([, slug, name]) => ({ slug, name })) : [];
  const wasHeld = shownWas ? await look.older(synonymKey(shownWas)) : null;
  const sharedRefs = wasHeld && 'many' in wasHeld ? wasHeld.many.filter(([k, slug]) => k !== key && !acceptedElsewhere.some((a) => a.slug === slug)) : [];
  // The old name of a page merged into this one by the owner's decision (round eighty-three, A): the record's keys with an
  // old address (`mergedNamesOf`). Its old address leads here even where other pages hold the name (`mergedHolder`), so
  // the line says the name is merged here, and also an older name of each other page, with the author under which that
  // page's record holds it, read from its dossier (Echeveria peacockii Croucher ex T.Moore & Mast., of Dudleya pulverulenta).
  const wasMerged = !!shownWas && mergedNamesOf(d.name.scientific, d.occurrences.keys).some((n) => plain(n) === wasPlain);
  const sharedWith = wasMerged
    ? await Promise.all(sharedRefs.map(async ([k, slug, name]) => ({ slug, name, authors: authorsOf(shownWas!, (await getDossier(platform, fetch, k, c).catch(() => null))?.name.synonyms ?? []) })))
    : sharedRefs.map(([, slug, name]) => ({ slug, name }));
  // The record's older names that are another species' accepted name here: shown with the record's author, and said not
  // to be that species (round seventy-one; S-F3: 169 pages, "Also known as … Annona muricata" on Annona montana).
  const olderOwn = [...new Set((d.name.synonyms ?? []).map((x) => canonicalSynonym(x)).filter((x): x is string => !!x && x !== d.name.scientific))];
  const elsewhere = await look.elsewhere(key, olderOwn.map(plain));
  // A name the record cites by that page's own author is that page's very name, which GBIF files under both, not another
  // author's (round eighty-two, the merge, on S's need: 10 of 283 such names on round seventy-seven's corpus): it is an
  // older name as any other, as the index now keeps it (`homonymEntries`). The other page's record gives its author; one
  // not read leaves the name under "another author", as before.
  const namedElsewhere = (await Promise.all(olderOwn.map(async (n) => {
    const e = elsewhere.get(plain(n));
    if (!e || e[0] === key) return [];
    const authors = authorsOf(n, d.name.synonyms ?? []);
    const other = authors.some((a) => !!authorKey(a)) ? ((await getDossier(platform, fetch, e[0], c).catch(() => null))?.name.authorship ?? undefined) : undefined;
    if (authors.some((a) => !!authorKey(a) && !!authorKey(other) && !plainlyAnother(other, a))) return [];
    return [{ name: n, slug: e[1], authors }];
  }))).flat();
  // The other page whose Kew entry gives this page its range, when the dossier names one (round seventy-two; triage B3, F13),
  // by its id (round seventy-eight).
  const viaKey = (d.distribution as { via?: { page?: string } }).via?.page;
  const viaEntry = isPageId(viaKey) && viaKey !== key ? await look.species(viaKey) : undefined;
  // The pages GBIF files the names of a page that reads no key under (round eighty, `occurrences.unread`), by their ids.
  const underIds = [...new Set((d.occurrences.unread?.under ?? []).map((u) => u.page).filter((x): x is PageId => isPageId(x) && x !== key))];
  const heldUnder = (await Promise.all(underIds.map((id) => look.species(id)))).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({ slug: e.slug, name: e.name }));
  // The page's own HTML (round eighty-three; the species page's weight, $lib/server/drawn): the regional map is drawn here,
  // once, into the HTML, and its records' places are not carried in the data the page hydrates from, where nothing read
  // them once the page had loaded. Nor are the common names in other languages: the page reads only Wikidata's, for the
  // line that names its source ($lib/ui/ref/upstream `namesSource`); the rest were a twelfth of Sempervivum tectorum's
  // data. A move inside the app asks for the data alone (`isDataRequest`), and gets it all, as before: the page draws the
  // map from it, and the offline page and a tab of the build before read what they always did. Anything else that is not
  // plainly the page's HTML (a caller that does not say) gets the whole data too.
  const regionMark = isDataRequest === false ? drawOnce(locals, 'region-map', regionSvg(shown.distribution.boxes, points, shown.centroid, `Openly licensed records of ${shown.name.scientific}`, shown.distribution.native.filter((r) => r.box).map((r) => ({ name: unitName(r.name), box: r.box! })))) : null;
  const map: { regionMark?: string; points?: typeof points } = regionMark ? { regionMark } : { points };
  const sent = regionMark ? { ...shown, name: { ...shown.name, vernacular: shown.name.vernacular.filter((v) => v.source === 'Wikidata') } } : shown;
  return {
    viaPage: viaEntry ? { slug: viaEntry.slug, name: viaEntry.name } : null,
    /** The pages GBIF files this page's names under, when it reads no key for that reason (round eighty). */
    heldUnder,
    /** A hybrid of the list: its parents as Kew's file states them, and whether its links are Kew's own numbers (round eighty-one, H). */
    hybrid: hybrid ? { parents: hybrid.parents ?? null, kewLinked: kewNo.kew } : null,
    /** English common names, the index's choice first (round sixty-one; decision 7). */
    commonNames: [names.common, ...(names.commons ?? [])].filter((x): x is string => !!x).slice(0, 4),
    /** The old name this page was reached by, when the address was a synonym the backbone resolved (round thirty, R2-8). */
    was: shownWas,
    /** The other species of the reference that hold the old name too: the line then says so, and never that GBIF accepts this species as it (round seventy; triage-69 F1). */
    wasShared: sharedWith as Array<{ slug: string; name: string; authors?: string[] }>,
    /** The old name is that of a page merged into this one by the owner's decision (round eighty-three, A). */
    wasMerged,
    /** Species of the reference accepted under the old name: the line names them, and never says the backbone accepts this species as it. */
    wasAcceptedBy: acceptedElsewhere,
    /** The old name is one the backbone files under a subspecies or variety of this species, by its cached answer. */
    wasBelow,
    /** The record's older names that are another species' accepted name here, with the record's authors. */
    namedElsewhere,
    /** The old name is the binomial of a variety the backbone places under this species, not of the species itself. */
    wasVariety: asVariety,
    /** The old name is a variety of a binomial the record lists as an older name of this species. */
    wasOfOlder: ofOlder,
    units: unitsFor(cookies, request),
    // The grower's hemisphere, when their site has been saved on this device: seeds the months before the site store loads.
    hemiLat: cookies.get('cultifolio.hemi') === 's' ? -1 : cookies.get('cultifolio.hemi') === 'n' ? 1 : null,
    d: sent,
    genusRecord,
    siblings,
    siblingCount,
    near,
    /**
     * The open records' places (latitude, longitude), which the page draws its regional map from, in the browser and on the
     * server, rather than carried as drawn (round seventy-seven); in a move inside the app's data only. The page's own HTML
     * carries the map drawn and, in its data, the mark the map takes the place of (round eighty-three).
     */
    ...map,
    /** How many datasets the open records came from (the provenance line). */
    datasets: d.occurrences.datasets.length
  };
};
