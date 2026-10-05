<script lang="ts">
  import ReplacedNotes from '$lib/ui/ReplacedNotes.svelte';
  import { aLabel } from '$core/arch';
  import Glance from '$lib/ui/ref/Glance.svelte';
  import Placeholder from '$lib/ui/Placeholder.svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { motion } from '$lib/ui/focus';
  import { failedBeforeHydration } from '$lib/ui/ref/failed';
  import { speciesTitle, speciesDescription, tileCredit } from '$lib/ui/ref/head';
  import NotChecked from '$lib/ui/NotChecked.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import Photos from '$lib/ui/Photos.svelte';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  import { photoLabel } from '$lib/ui/photo-label';
  import Provenance from '$lib/ui/Provenance.svelte';
  import Climograph from '$lib/ui/Climograph.svelte';
  import FollowButton from '$lib/ui/FollowButton.svelte';
  import CompareButton from '$lib/ui/CompareButton.svelte';
  import ShareCard from '$lib/ui/ShareCard.svelte';
  import { isDatasetDoi } from '$dossier/sources/openalex';
  import { photoAt, srcsetOf, photoHosts, shownAt } from '$dossier/photo-size';
  import { heroOf } from '$dossier/dedupe';
  import { firstSentences, clip } from '$core/text';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { cultivationSheet, CARD_ORDER } from '$core/sheet';
  import { collection } from '$lib/db/collection.svelte';
  import { slugify, genusOf, speciesSlug, canonicalSynonym } from '$core/names';
  import { unitName } from '$core/regions';
  import { onMount } from 'svelte';
  import { units } from '$lib/ui/units.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { temp, deltaT, rain, tempUnit, rainUnit, cToF, mmToIn, fixed } from '$core/units';
  let { data } = $props();
  let allPapers = $state(false);
  const u = $derived(units.current);
  const d = $derived(data.d);
  const common = $derived(d.name.vernacular.filter((v) => !v.lang || v.lang === 'eng').map((v) => v.name).slice(0, 4));
  const hero = $derived(heroOf(d.photos));
  const heroSrc = $derived(hero ? shownAt(hero) : undefined);
  // Synonyms as names, not as the backbone's strings: authorship dropped, and a malformed entry ("? glabra Salm-Dyck") left out (round thirty-one, 3).
  const synonyms = $derived([...new Set(d.name.synonyms.map(canonicalSynonym).filter((x): x is string => !!x && x !== d.name.scientific))]);
  /*
   * The head says what only this page has: with a climate, the title names it and the description is the page's own
   * figures with their sources; without one, the name alone and a line naming only what the page holds. Never the
   * uncredited Wikipedia lead (which a search engine already has from Wikipedia), and never "the cultivation it
   * suggests", which the sheet does not give (round sixty; self-review 14, the round forty-two review A5, product 6).
   */
  const climateOk = $derived(d.climate.status === 'ok');
  const headIn = $derived({ name: d.name, common: common[0] ?? null, climate: d.climate.status === 'ok' ? { status: 'ok', months: d.climate.months, records: d.climate.records, extremes: d.climate.extremes ?? null } : { status: d.climate.status }, native: d.distribution.native.length, photos: d.photos.length, summary: !!d.summary });
  const title = $derived(speciesTitle(headIn));
  const desc = $derived(speciesDescription(headIn, u));
  /** The photograph's own words for a screen reader: the species and the credit (round sixty; a11y 12). */
  const heroAlt = $derived(hero ? `${d.name.scientific}${hero.place ? `, ${hero.place}` : ''}; photograph ${hero.attribution}` : '');
  const jsonld = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Taxon',
      name: d.name.scientific,
      alternateName: common,
      taxonRank: d.name.rank?.toLowerCase(),
      parentTaxon: d.name.family ? { '@type': 'Taxon', name: d.name.family, taxonRank: 'family' } : undefined,
      identifier: [{ '@type': 'PropertyValue', propertyID: 'GBIF', value: String(d.key) }],
      url: `https://cultifolio.com/species/${d.slug}`,
      image: heroSrc
    })
  );
  // A range of more than a few regions stacks a dozen lines deep in one narrow cell of the fact grid beside a blank row; the cell, and the marker's beside it, take the whole row instead.
  const longRange = $derived(d.distribution.native.length > 4);
  // The glossary's plain words in what the reader sees: "species page", not "dossier"; "across the range", not "envelope" (round fifty-eight; the accessibility review).
  const evidence = $derived.by(() => {
    const o = d.occurrences;
    const up = d.upstream['gbif.occurrences']?.status;
    if (up === 'refused' || up === 'error') return { tone: 'warn', text: 'The occurrence source did not answer when this species page was built. Nothing here is derived from records, and this is not a statement that none exist.' };
    // A refused range is said before anything is read as an absence of one (round seventeen, 5).
    const rangeUp = d.upstream['wcvp.distribution']?.status;
    if (o.rangeTested === false && (rangeUp === 'refused' || rangeUp === 'error')) {
      // The range source did not answer: no marker and no envelope are made, and the records were tested against nothing (round eighteen, 9).
      const all = o.nOpenInRange + o.nRestrictedInRange;
      return { tone: 'warn', text: `The range source did not answer when this species page was built, so none of the ${all} georeferenced record${all === 1 ? '' : 's'} was tested against a native range, and no map marker or climate across the range is derived without one. ${o.nOpenInRange ? `The map shows the ${o.nOpenInRange} openly licensed one${o.nOpenInRange === 1 ? '' : 's'}, garden and roadside records included.` : 'None carries a licence permitting republication, so the map shows no points.'} This is not a statement that they are in range.` };
    }
    if (d.distribution.verified === false || (!d.distribution.native.length && d.distribution.reported?.length)) {
      const all = o.nOpenInRange + o.nRestrictedInRange;
      return { tone: 'warn', text: `No verified native range for this name: WCVP has no entry with native status, and a checklist that only reports presence cannot tell a wild record from a garden one. The map shows ${o.nOpenInRange} openly licensed record${o.nOpenInRange === 1 ? '' : 's'}${all > o.nOpenInRange ? ` of ${all}` : ''} untested against any range; no map marker or climate is derived from them, and no sheet is built from them.` };
    }
    if (!o.nOpenInRange && !o.nRestrictedInRange) return { tone: 'muted', text: 'No georeferenced records inside the stated native range.' };
    const all = o.nOpenInRange + o.nRestrictedInRange;
    const where = o.rangeTested === false ? 'not tested against the range (stated at country level only)' : 'inside the native range';
    if (o.rangeTested === false) return { tone: 'muted', text: `${all} georeferenced record${all === 1 ? '' : 's'}, ${where}; no map marker or climate across the range is derived without a range to test them against. ${o.nOpenInRange ? `The map shows the ${o.nOpenInRange} openly licensed one${o.nOpenInRange === 1 ? '' : 's'}.` : 'None carries a licence permitting republication, so the map shows no points.'}` };
    // The marker rests on every in-range record; the envelope only on those placed well enough (within 10 km) to read a
    // grid cell at, and among those only on the ones in the land cells it reads (`climate.records`, since round
    // thirty-three); the ones placed well enough are the rest after the vague ones (round thirty-five, R1-7).
    const climRecs = d.climate.status === 'ok' ? d.climate.records : all;
    const placed = all - (o.nVague ?? 0);
    let t = climateOk && climRecs < all
      ? `The map marker rests on all ${all} georeferenced records ${where}; the climate across the range on the ${climRecs} of them${climRecs < placed ? ` in the land cells it reads, of ${placed}` : ''} placed to within 10 km`
      : `The map marker${climateOk ? ' and the climate across the range' : ''} rest${climateOk ? '' : 's'} on all ${all} georeferenced record${all === 1 ? '' : 's'} ${where}`;
    if (!o.nOpenInRange) t += `; none carries a licence permitting republication, so the map shows no points.`;
    else if (o.nRestrictedInRange) t += `; the map shows only the ${o.nOpenInRange} openly licensed one${o.nOpenInRange === 1 ? '' : 's'}` + (o.restrictedShiftKm != null && o.restrictedShiftKm >= 1 ? `, which alone would put the marker ${o.restrictedShiftKm} km away` : o.restrictedShiftKm != null ? ', which alone would put the marker in the same place' : '') + '.';
    else t += ', all openly licensed and shown on the map.';
    if (o.nOutsideRange) t += ` ${o.nOutsideRange} record${o.nOutsideRange === 1 ? '' : 's'} outside the WCVP native range not used.`; // no rule says why a record lies outside (round fifty-nine)
    // A count, not advice: "treat as indicative" told the reader what to do (round sixty; words 2).
    if (o.thin) t += ` Under a dozen records behind the map${climateOk ? ' and the climate' : ''}.`;
    else if (climateOk && climRecs < 12) t += ` Under a dozen records behind the climate.`;
    if (!climateOk) t += d.climate.status === 'pending' ? ' No climate across the range yet: the habitat climate is pending.' : d.climate.status === 'refused' ? ' No climate across the range: the climate source did not answer.' : ' No climate across the range is derived for this species.';
    return { tone: 'ok', text: t };
  });
  $effect(() => {
    setCrumb([{ label: 'Species', href: '/' }, { label: d.name.scientific }]);
    return () => setCrumb([]);
  });
  // The collection lives in the browser; the page renders on the server. This island lights up after load.
  onMount(() => {
    site.load();
    collection.load();
  });
  // The section row names where the reader is: the last section heading that has passed under the sticky row.
  /** The dossier's works without GBIF occurrence downloads: datasets that name the species, not papers about it (the builder drops them at source now; the corpus on disk is filtered here until it is refilled). */
  const papers = $derived(d.literature.filter((p) => !isDatasetDoi(p.doi) && !/^Occurrence Download$/i.test(p.title)));
  let active = $state('');
  let tapped: { id: string; at: number } | null = null;
  /** A section tab: the heading scrolled to, the tab marked at once, and the address replaced rather than pushed, so six taps are not six Backs (round sixty; visitor 9, 19). */
  function goTab(e: MouseEvent, id: string) {
    const h = document.getElementById(id);
    if (!h || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    tapped = { id, at: Date.now() };
    active = id;
    h.scrollIntoView({ behavior: motion(), block: 'start' });
    replaceState(`#${id}`, page.state);
  }
  onMount(() => {
    const heads = [...document.querySelectorAll<HTMLElement>('h2.sec[id]')].filter((h) => ['s-cultivation', 's-climate', 's-habitat', 's-photos', 's-photos-open', 's-research', 's-related', 's-registers'].includes(h.id));
    if (!heads.length) return;
    const onScroll = () => {
      const line = 110;
      const prev = active;
      let cur = '';
      for (const h of heads) {
        const r = h.getBoundingClientRect();
        if (r.height > 0 && r.top <= line) cur = h.id; // a heading that is not rendered measures 0,0 and must not count as passed
      }
      // At the foot of the page the last sections' headings can never reach the line: the last one is marked there, and a
      // tab just tapped stays marked while its scroll settles (round sixty; visitor 9).
      const rendered = heads.filter((h) => h.getBoundingClientRect().height > 0);
      if (rendered.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) cur = rendered[rendered.length - 1].id;
      if (tapped && Date.now() - tapped.at < 1200) cur = tapped.id;
      active = cur;
      if (cur === prev) return;
      // Keep the marked tab within the strip by scrolling the strip itself, never the page: scrollIntoView on a tab whose
      // strip is below the fold scrolled the page down to it on arrival, so a species page opened part-way down.
      const nav = document.querySelector<HTMLElement>('nav.tabs');
      const on = nav?.querySelector<HTMLElement>('a.on');
      if (nav && on) {
        const a = on.getBoundingClientRect(), n = nav.getBoundingClientRect();
        if (a.left < n.left) nav.scrollLeft += a.left - n.left;
        else if (a.right > n.right) nav.scrollLeft += a.right - n.right;
      }
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  });
  // Yours: by the name's slug, or by the reference key, so a suffixed homonym's page lists its own plants (round eighteen, 6).
  const mine = $derived(collection.ready ? collection.accessions.filter((a) => speciesSlug(a.taxonName) === d.slug || (a.taxonKey != null && a.taxonKey === d.key)) : []);
  const growing = $derived(mine.filter((a) => a.status === 'growing'));
  /** Your own photographs of this species, across every plant of it you own. */
  /** Up to six photographs other than the one at the top, for the strip under the card. */
  const stripPhotos = $derived(d.photos.filter((p) => p !== hero && p.thumb).slice(0, 6));
  const myPhotos = $derived(mine.flatMap((a) => collection.photos(a.id).map((p) => ({ ...p, plant: a }))).sort((x, y) => y.d.localeCompare(x.d)));
  let lightbox = $state<number | null>(null);
  let heroFailed = $state(false);
  const myTaxon = $derived(collection.ready ? collection.taxon(d.slug) : undefined);
  let editingMy = $state(false);
  let myDraft = $state('');
  let myBase: string | null = null; // the stamp of the text the editor opened on (round fifty-nine)
  const openMy = (text: string) => { myDraft = text; myBase = collection.notesStamp('taxon', d.slug); editingMy = true; };
  async function saveMy() {
    await collection.put('taxon', d.slug, { name: d.name.scientific, gbifKey: d.key, myNotes: myDraft.trim() || null, myNotesBase: myBase });
    editingMy = false;
  }
  // The site once loaded; before that (and on the server) the hemisphere cookie, so a southern grower never sees northern months first.
  const readerLat = $derived(site.current?.lat ?? (site.loaded ? (collection.ready ? (collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null) : null) : data.hemiLat));
  const sheetIn = $derived({ readerLat, scientific: d.name.scientific, climateStatus: d.climate.status, family: d.name.family, months: d.climate.status === 'ok' ? d.climate.months : null, p10: d.climate.status === 'ok' ? d.climate.p10 : null, p90: d.climate.status === 'ok' ? d.climate.p90 : null, annualP10: d.climate.status === 'ok' ? (d.climate.annualRain?.p10 ?? null) : null, annualP90: d.climate.status === 'ok' ? (d.climate.annualRain?.p90 ?? null) : null, extremes: d.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, extremesStatus: d.climate.status === 'ok' ? d.climate.extremesStatus : null, lat: d.centroid?.lat ?? (d.climate.status === 'ok' ? d.climate.at.lat : null), units: u });
  const sheet = $derived(cultivationSheet(sheetIn));
  /** An upstream that refused or failed. Only 'none' is ever rendered as an absence; these get their own line. */
  /** Not answered: refused, failed, or not asked (a skipped source). Only 'none' is ever rendered as an absence. */
  const refused = (k: string) => ['refused', 'error', 'skipped'].includes(d.upstream[k]?.status ?? '');
  // A source that refused or errored is named. One merely skipped in the latest build (its earlier answer carried over) is
  // named only when the page has no photographs at all; beside 57 photographs "did not answer" would be untrue.
  const refusedPhotoSources = $derived(['inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated', 'commons', 'gbif.media'].filter((k) => { const st = d.upstream[k]?.status ?? ''; return st === 'refused' || st === 'error' || (st === 'skipped' && !d.photos.length); }));
  const photoSourceName: Record<string, string> = { 'inat.taxon': 'iNaturalist', 'inat.photos.wild': 'iNaturalist', 'inat.photos.cultivated': 'iNaturalist', commons: 'Wikimedia Commons', 'gbif.media': 'GBIF media' };
  const refusedPhotoNames = $derived([...new Set(refusedPhotoSources.map((k) => photoSourceName[k]))]);
  /** "12 / 8–15": the median with the 10th–90th span across the envelope cells. */
  const cell = (med: number | undefined, lo: number | undefined, hi: number | undefined, digits = 0, conv: (x: number) => number = (x) => x) => (med == null ? '–' : lo == null || hi == null || (lo === med && hi === med) ? fixed(conv(med), digits) : `${fixed(conv(med), digits)} / ${fixed(conv(lo), digits)}–${fixed(conv(hi), digits)}`);
  const tC = $derived((x: number) => (u === 'us' ? cToF(x) : x));
  const rMm = $derived((x: number) => (u === 'us' ? mmToIn(x) : x));
  /** A source's detail string as a sentence of its own: capitalised, with a full stop. */
  const sentence = (t: string | undefined, fallback: string) => { const x = (t ?? fallback).trim(); const y = x.charAt(0).toUpperCase() + x.slice(1); return y.endsWith('.') ? y : y + '.'; };
  /** The grower's hemisphere, from the first place with coordinates, else north. Only the months in the note depend on it. */
  // Your site's latitude decides the hemisphere of the months; a place with coordinates stands in when no site is set.
  /** The season card's sentence: the sheet's own reading of this year, in plain words (the row the In short list used to repeat). */
  const seasonRow = $derived(sheet.rows.find((r) => r.k === 'Its year') ?? null);
  /** Where the reader's hemisphere came from, for the season card. */
  const readerFrom = $derived(readerLat == null ? null : site.current || !site.loaded ? ('site' as const) : ('places' as const));
  /** Four sentences of the quoted lead; the rest is a link, never a mid-sentence cut. */
  const excerpt = $derived(d.summary ? firstSentences(d.summary.text, 4) : null);
  const genusName = $derived(genusOf(d.name.scientific));
  const genusExcerpt = $derived(data.genusRecord?.summary ? firstSentences(data.genusRecord.summary.text, 3) : null);
  /**
   * A monotypic genus has one Wikipedia article for the genus and the species, and the two excerpts were the same
   * paragraph twice, one heading apart (round thirty-eight, R2-3). When the genus excerpt is the species excerpt or a
   * prefix of it (or the reverse), spacing and case aside, it is not shown: a rule over two quoted strings, not a word of prose.
   */
  const norm = (t: string | undefined) => (t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const genusRepeats = $derived.by(() => {
    const g = norm(genusExcerpt?.text), sp = norm(excerpt?.text);
    return !!g && !!sp && (sp.startsWith(g) || g.startsWith(sp));
  });
  const genusSlug = $derived(slugify(genusName));
  const sheetCards = $derived(CARD_ORDER.map((c) => ({ title: c, rows: sheet.rows.filter((r) => r.card === c) })).filter((c) => c.rows.length));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The numbers a grower reads first, each with the month it belongs to.
  /**
   * The grower's places against this habitat's cold floor: the first place with a floor set, its floor beside the
   * habitat's, and the difference; or, with places but no floor, the way to set one (round fifty, 3). Only once the
   * collection is open, and only when the page has a floor to compare with.
   */
  const placeLine = $derived.by(() => {
    if (!collection.ready || !glance) return null;
    // The habitat's cold floor only: the archetype table's convention is never a floor (round sixty; self-review 3).
    const floorC = glance.ex ? glance.ex.minP01 : null;
    if (floorC == null) return null;
    const places = collection.locations;
    if (!places.length) return null;
    const withFloor = places.map((l) => ({ l, c: collection.conditions(l.id) })).find((x) => x.c.floorC != null);
    // Which place to name: the one this species grows in here, else the grower's first place, and said as such (round fifty-eight: it named whichever place came first).
    if (!withFloor) {
      const grown = mine.find((a) => a.status === 'growing' && a.locationId);
      const p = (grown && places.find((l) => l.id === grown.locationId)) ?? null;
      const whose = "this habitat's cold floor";
      return p ? { text: `Your ${p.name}, where you grow it, has no floor set. Set one to see how it compares with ${whose}.`, href: `/places/${p.id}`, under: false } : { text: `None of your places has a floor set. Set one to see how it compares with ${whose}.`, href: '/places', under: false };
    }
    const diff = withFloor.c.floorC! - floorC;
    // A difference in the reader's degrees, never through temp() (which adds 32 for °F: a 2 °C gap read as 35.6 °F), and
    // the figure itself, not "about the same" (round fifty-nine): the same only when it shows as nothing.
    const gap = deltaT(Math.abs(diff), u, 1);
    const by = Number(gap.split(' ')[0]) === 0 ? 'the same as' : `${gap} ${diff < 0 ? 'under' : 'over'}`;
    const ref = `this habitat's cold floor, ${temp(floorC, u, 1)} (one night in a hundred colder, NASA POWER)`;
    return { text: `Your ${withFloor.l.name}: ${withFloor.c.floorHeld ? 'held at' : 'floor'} ${temp(withFloor.c.floorC!, u, 1)}, ${by} ${ref}.`, href: `/places/${withFloor.l.id}`, under: diff < 0 && Number(gap.split(' ')[0]) !== 0 };
  });
  // What the distribution source said when no native region is listed: its own answer, never "did not answer" for an
  // answer (round fifty-nine; the round forty-one review, 2: an answer listing only introduced or extinct regions, or a
  // name WCVP holds twice, read as a refusal).
  const distWords = $derived.by(() => {
    const st = d.upstream['wcvp.distribution']?.status;
    if (st === 'none') return 'No published distribution for this name.';
    if (st === 'refused' || st === 'error' || !st) return 'Not checked: the distribution source did not answer when this page was built.';
    if (d.distribution.ambiguous) return `WCVP holds more than one name spelt this way (${d.distribution.ambiguous}); no native region is read from it.`;
    return d.distribution.introduced.length || d.distribution.extinct?.length ? 'WCVP lists no region where it is native; the regions it does list are named here.' : 'WCVP lists no native region for this name.';
  });
  const glance = $derived.by(() => {
    if (d.climate.status !== 'ok') return null;
    const m = d.climate.months;
    const idx = (f: (x: (typeof m)[number]) => number, hi: boolean) => m.reduce((b, x, i) => ((hi ? f(x) > f(m[b]) : f(x) < f(m[b])) ? i : b), 0);
    const hot = idx((x) => x.tmax, true), cold = idx((x) => x.tmin, false), wet = idx((x) => x.precipMm, true), dry = idx((x) => x.precipMm, false);
    const rain = m.reduce((a, x) => a + x.precipMm, 0);
    const dlis = m.map((x) => x.dli).filter((x): x is number => x != null);
    const wetMonths = m.filter((x) => x.precipMm >= 25).length;
    return {
      hot: { v: m[hot].tmax, mo: months[hot], night: m[hot].tmin }, cold: { v: m[cold].tmin, mo: months[cold] },
      rain, wet: { v: m[wet].precipMm, mo: months[wet] }, dry: { v: m[dry].precipMm, mo: months[dry] }, wetMonths,
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis) } : null,
      ex: d.climate.extremes ?? null
    };
  });
  /** The marker's sentence, said once: the build's text already begins "the map marker: " (round sixty). */
  const markerHow = (how: string) => (how.toLowerCase().startsWith('the map marker: ') ? how.charAt(0).toUpperCase() + how.slice(1) : `The map marker: ${how}`);
</script>

{#snippet rel(c: (typeof data.near)[number])}
  <a class="reltile" href="/species/{c.slug}">
    <!-- Hidden on a failure heard before hydration too, and credited: the tile names its photograph's source, and the species
         page it opens names the author and licence (round sixty; visitor 4, rule 1, the round forty-two review G). -->
    {#if c.thumb}<img src={c.thumb} alt={c.name} loading="lazy" use:failedBeforeHydration={(im) => (im.style.visibility = 'hidden')} />{:else}<div class="noim"></div>{/if}
    <span class="rn"><SpeciesName name={c.name} /></span>
    <span class="rf">{c.common ?? c.family ?? ''}</span>
    {#if c.thumb && tileCredit(c)}<span class="rc">{tileCredit(c)}</span>{/if}
  </a>
{/snippet}

<svelte:head>
  <title>{title} · Cultifolio</title>
  <meta name="description" content={desc} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/species/{d.slug}" />
  <!-- A species with no photograph previews as the site's own card, not as no picture (round sixty; product 6, visitor 20). -->
  <meta property="og:image" content={hero ? heroSrc : 'https://cultifolio.com/og.png'} />
  <meta property="og:image:alt" content={hero ? heroAlt : 'Cultifolio: habitat climate for cacti, succulents and bulbs, every figure sourced'} />
  <meta name="twitter:card" content="summary_large_image" />
  {#if hero}
    <!-- The photograph is the largest paint on a phone and lives on a third party's host. Preloaded from the head, one size by
         surface (the 500 px file under 640 px, the 1024 px file above), so the handshake and the download start with the
         stylesheet, not when the parser reaches the image (round forty-two, 1). The hosts are preconnected for the rest. -->
    <link rel="preload" as="image" href={photoAt(heroSrc!, 'medium')} media="(max-width: 640px)" fetchpriority="high" />
    <link rel="preload" as="image" href={photoAt(heroSrc!, 'large')} imagesrcset={srcsetOf(heroSrc!, ['medium', 'large'])} imagesizes="480px" media="(min-width: 641px)" fetchpriority="high" />
    {#each photoHosts([heroSrc]) as h (h)}<link rel="preconnect" href={h} />{/each}
  {/if}
  <link rel="canonical" href="https://cultifolio.com/species/{d.slug}" />
  <!-- A vernacular name is user-contributed upstream; a "<" in it must not end this script early. -->
  {@html `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<article class="species">
  {#if data.was}
    <p class="notice" id="was-synonym"><b>{data.was}</b> is {data.wasVariety ? 'an older name of a variety of this species' : data.wasOfOlder ? 'a variety under an older name of this species' : 'a synonym'}: the GBIF backbone accepts {data.wasVariety || data.wasOfOlder ? 'it under' : 'this species as'} <i>{d.name.scientific}</i>, and the reference files it under that name.</p>
  {/if}
  <div class="top" class:withhero={!!hero}>
  {#if hero && heroFailed}
    <!-- The one placeholder, in the photograph's own box, so nothing below moves; the credit and its page stay (round sixty; visitor 12). -->
    <div class="hero photo failed"><Placeholder name={d.name.scientific} family={d.name.family ?? ''} caption="photograph did not load" /><a class="cred" href={hero.page ?? hero.url} rel="noopener">Its page{hero.attribution?.trim() ? ` · ${hero.attribution}` : ''}</a></div>
  {:else if hero}
    <!-- The box is a fixed 150 px band on a phone, so the page lays out once and does not shift down when the photograph lands (round forty-two, 1). -->
    <div class="hero photo">
      <!-- One size by surface, not by pixel density (round thirty-five, R2-7): under 640 px the 500 px file fills a 150 px band cropped to cover,
           and a phone's density promoted it to the 1024 px one, three times the bytes for a crop that showed a third of it (round forty-two, 1). -->
      <a href={hero.page ?? hero.url} rel="noopener"><picture><source media="(max-width: 640px)" srcset={photoAt(heroSrc!, 'medium')} /><img src={photoAt(heroSrc!, 'large')} srcset={srcsetOf(heroSrc!, ['medium', 'large'])} sizes="480px" alt={heroAlt} loading="eager" fetchpriority="high" use:failedBeforeHydration={() => (heroFailed = true)} /></picture></a>
      <a class="cred" href={hero.page ?? hero.url} rel="noopener">{hero.attribution}{hero.captive === true ? ' · in cultivation' : hero.captive === false ? ' · observed growing wild' : ''}{hero.observedOn ? ' · ' + hero.observedOn : ''}</a>
    </div>
  {/if}
  <!-- No photograph: no grey box of text where one would be; the card takes the width, with the one placeholder as a small
       thumbnail, and the sentence saying why is under Photographs, where rule 2 needs it (round sixty; visitor 12). -->
  <div class="idcard" class:nophoto={!hero}>
    {#if !hero}<div class="phthumb" aria-hidden="true"><Placeholder name={d.name.scientific} family={d.name.family ?? ''} /></div>{/if}
    <div class="who">
      <h1 class="sci"><SpeciesName name={d.name.scientific} authorship={d.name.authorship} /></h1>
      <!-- One line under the name: common names, then family, native range and the group; the facts grid they came from is at the foot of the page now (round fifty, 3). -->
      <p class="vern">
        {#if common.length}{common.join(', ')}{/if}
        {#if d.name.status === 'synonym' && d.name.acceptedName}· <span class="pill w">synonym of {d.name.acceptedName}</span>{:else if d.name.status !== 'accepted'}· <span class="pill">{d.name.status}</span>{/if}
      </p>
      <p class="vern meta">{[d.name.family, d.distribution.native.length ? d.distribution.native.slice(0, 2).map((r) => unitName(r.name)).join(', ') + (d.distribution.native.length > 2 ? ` +${d.distribution.native.length - 2}` : '') : null, sheet.arch ? sheet.arch.arch.lab.toLowerCase() : null].filter(Boolean).join(' · ')}</p>
      <!-- Pills say a state that is not the usual one; what is known is shown, not announced. Counts and groupings are plain text (improvements, 7). -->
      {#if d.climate.status !== 'ok' || (!d.photos.length && refusedPhotoNames.length)}
        <div class="pills">
          {#if d.climate.status === 'pending'}<span class="pill">Climate pending</span>{:else if d.climate.status === 'refused'}<NotChecked what="Climate" why={sentence(d.climate.detail, 'A source did not answer when this page was built')} />{:else if d.climate.status !== 'ok'}<span class="pill">No habitat climate</span>{/if}
          {#if !d.photos.length && refusedPhotoNames.length}<NotChecked what="Photographs" why="{refusedPhotoNames.join(' and ')} {refusedPhotoSources.every((k) => d.upstream[k]?.status === 'skipped') ? `${refusedPhotoNames.length === 1 ? 'was' : 'were'} not asked` : 'did not answer'} when this page was built." />{/if}
        </div>
      {/if}
    </div>
    <!-- One primary action, the grower's own numbers beside it, and the other four verbs as a quieter row: five equal buttons were a bar nobody could read (round fifty, 3). -->
    <div class="acts">
      <a class="btn pri" href="/plants/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Add one to my plants</a>
      {#if mine.length}
        <span class="vern mine">{#each mine.slice(0, 3) as a (a.id)}<a class="accno" href="/plants/{accNo(a)}" title={a.status !== 'growing' ? a.status : 'yours'}>{accNo(a)}</a>{/each}{#if mine.length > 3}<span class="more">+{mine.length - 3}</span>{/if}</span>
      {/if}
    </div>
    <div class="acts acts2">
      <a class="btn" href="/propagation/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Sow seed</a>
      <FollowButton slug={d.slug} name={d.name.scientific} gbifKey={d.key} />
      <CompareButton slug={d.slug} name={d.name.scientific} />
      {#if d.climate.status === 'ok'}<ShareCard input={{ units: u, name: d.name.scientific, family: d.name.family, origin: d.distribution.native.map((r) => r.name), slug: d.slug, cells: d.climate.cells, climate: { months: d.climate.months, p10: d.climate.p10, p90: d.climate.p90, cells: d.climate.cells, extremes: d.climate.extremes ?? null } }} />{/if}
    </div>
  </div>
  </div>

  {#if stripPhotos.length}
    <!-- A few of the photographs under the name card, on a phone too: the grid was three and a half thousand pixels down (round fifty-eight; the first-impression review). Each opens its credit and licence in the Photographs section. -->
    <a class="thumbstrip" href="#{myPhotos.length ? 's-photos-open' : 's-photos'}" aria-label="Photographs of {d.name.scientific}, with their credits">
      {#each stripPhotos as p (p.src + p.id)}<img src={p.thumb} alt="{d.name.scientific}, photograph {p.attribution}" title={p.attribution} loading="lazy" width="72" height="72" onerror={(e) => (e.currentTarget as HTMLImageElement).remove()} />{/each}
      <span class="more">{d.photos.length} photograph{d.photos.length === 1 ? '' : 's'} ›</span>
    </a>
  {/if}
  <!-- The section menu under the card, where a phone reader still is (round fifty-eight); it stays pinned as the page scrolls. -->
  <nav class="tabs" aria-label="Sections">
    <a href="#s-cultivation" class:on={active === 's-cultivation'} onclick={(e) => goTab(e, 's-cultivation')}>Cultivation</a>
    <a href="#s-climate" class:on={active === 's-climate'} onclick={(e) => goTab(e, 's-climate')}>Climate</a>
    <a href="#s-habitat" class:on={active === 's-habitat'} onclick={(e) => goTab(e, 's-habitat')}>Habitat</a>
    {#if d.photos.length !== 1}<a href="#s-photos" class:on={active === 's-photos' || active === 's-photos-open'} onclick={(e) => goTab(e, 's-photos')}>Photographs</a>{/if}
    {#if papers.length || refused('openalex')}<a href="#s-research" class:on={active === 's-research'} onclick={(e) => goTab(e, 's-research')}>Papers</a>{/if}
    {#if data.siblings.length || data.near.length}<a href="#s-related" class:on={active === 's-related'} onclick={(e) => goTab(e, 's-related')}>Related</a>{/if}
    <a href="#s-registers" class:on={active === 's-registers'} onclick={(e) => goTab(e, 's-registers')}>Registers</a>
  </nav>

  {#if glance}
    <h2 class="sec visually-hidden" id="s-glance">At a glance</h2>
    <section class="glance" aria-label="At a glance">
      <!-- The figures once, in growers' words, each with a small source tag; the season in the reader's months beside them.
           The "In short" list that repeated these cards line by line is gone: its one new line, the season, is the season
           card's sentence now (round sixty; visitor 2, 3, product 7, self-review "the experience" 2 and 3). -->
      <Glance months={d.climate.status === 'ok' ? d.climate.months : []} extremes={glance.ex} extremesStatus={d.climate.status === 'ok' ? (d.climate.extremesStatus ?? null) : null} year={sheet.year} seasonLead={seasonRow?.plain?.lead ?? null} seasonRule={seasonRow?.plain?.rule ?? ''} {readerLat} {readerFrom} chartHref="#s-climate" />
      {#if d.climate.status === 'ok' && d.climate.records < 12}<p class="small muted thinline">Under a dozen records behind these figures ({d.climate.records}). <a href="#s-habitat">The records.</a></p>{/if}
      {#if placeLine}
        <!-- The grower's own place against this habitat's cold floor: the one comparison the site can make that no other does, one line under the figures (round fifty, 3). Nothing is inferred; two figures and their difference. -->
        <a class="placeline" class:warn={placeLine.under} href={placeLine.href}>{placeLine.text}<span class="chev">›</span></a>
      {/if}
    </section>
  {/if}

  <!-- The quoted summary comes after the figures: a phone reader reached At a glance only after a screen of Wikipedia (round forty, R2 design 1; R1 R12). -->
  {#if d.summary}
    <h2 class="sec" id="s-summary">Summary</h2>
    <div class="sumbody"><p>{excerpt?.text}{#if excerpt?.more}{' '}<a class="more" href={d.summary.url} rel="noopener">More on Wikipedia ›</a>{/if}</p></div>
    <p class="small muted">Quoted from <a href={d.summary.url} rel="noopener">Wikipedia, "{d.summary.title}"</a>, {d.summary.licence}.</p>
  {:else if refused('wikipedia')}
    <h2 class="sec" id="s-summary">Summary</h2>
    <div class="notice"><b>Not checked.</b> Wikipedia did not answer when this page was built. Not a statement that it has no article.</div>
  {/if}

  {#if data.genusRecord?.status === 'ok' && data.genusRecord.summary && !genusRepeats}
    <h2 class="sec" id="s-genus">About the genus · <i>{genusName}</i></h2>
    <div class="sumbody"><p>{genusExcerpt?.text}{#if genusExcerpt?.more}{' '}<a class="more" href={data.genusRecord.summary.url} rel="noopener">More on Wikipedia ›</a>{/if}</p></div>
    <p class="small muted">Quoted from <a href={data.genusRecord.summary.url} rel="noopener">Wikipedia, "{data.genusRecord.summary.title}"</a>, {data.genusRecord.summary.licence}.</p>
  {:else if data.genusRecord?.status === 'refused'}
    <h2 class="sec" id="s-genus">About the genus · <i>{genusName}</i></h2>
    <div class="notice"><b>Not checked.</b> Wikipedia did not answer for the genus when this was built. Not a statement that it has no article.</div>
  {/if}


  {#if d.upstream['gbif.accepted']?.detail}
    <p class="small muted">This page was reached by a name the GBIF Backbone holds as a synonym: {d.upstream['gbif.accepted'].detail}.</p>
  {/if}

  <h2 class="sec" id="s-cultivation">Cultivation</h2>
  <div class="note-slot" data-key={d.key}>
    {#if editingMy}
      <div class="cult">
        <div class="sum">Your notes <span class="hint">yours alone, on this device; shown on every plant of this species you own</span></div>
        <div class="fields"><textarea id="my-notes" rows="4" bind:value={myDraft}></textarea><div class="end"><button class="btn" onclick={() => (editingMy = false)}>Cancel</button><button class="btn pri" onclick={saveMy}>Save</button></div></div>
      </div>
    {:else if myTaxon?.myNotes}
      <div class="cult">
        <div class="sum">Your notes <span class="hint">yours alone, on this device; shown on every plant of this species you own</span></div>
        <div class="body">{myTaxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => openMy(myTaxon?.myNotes ?? '')}>Edit</button></div>
        <ReplacedNotes kind="taxon" id={d.slug} />
      </div>
    {:else if collection.ready}
      <p class="small muted notesline">Your notes: none yet. <button class="linkish" onclick={() => openMy('')}>Write what you know</button> · yours alone, on this device.</p>
    {/if}
    {#if sheet.arch}
      <!-- The group and, apart from every habitat figure, its convention, said as one with no source: it never raises or
           replaces the cold floor (round sixty; self-review 3, words 1). -->
      <p class="small archline">Grouped as {aLabel(sheet.arch.arch.lab)}, by its {sheet.arch.tier} (archetype table).{#if sheet.floor?.convention && d.climate.status === 'ok'}{' '}Not a habitat figure: {sheet.floor.convention.text}.{/if}</p>
    {/if}
    <!-- Closed at rest, title only: the glance row above carries their figures, so a summary line under each title said
         them a second time (round sixty; visitor 2, self-review "the experience" 2). -->
    {#each sheetCards as c (c.title)}
      <details class="cult acc">
        <summary>
          <span class="t">{c.title}</span>
          <span class="pm" aria-hidden="true"><span class="pmw">open</span></span>
        </summary>
        <div class="body sheet">
          {#each c.rows as r}
            {#if c.rows.length > 1}<div class="rowk" role="heading" aria-level="3">{r.k}</div>{/if}
            <p>{r.s}</p>
          {/each}
        </div>
      </details>
    {/each}
    {#if !sheetCards.length}
      <div class="cult"><div class="none">{#if d.climate.status === 'refused'}Not checked: {sentence(d.climate.detail, 'a source did not answer when this page was built')} No sheet is derived from an answer that was not given, and the archetype table has no figure for this genus or family.{:else if d.climate.status === 'pending'}Pending: the habitat climate has not been derived yet, and the archetype table has no figure for this genus or family.{:else}Nothing derived: no habitat climate for this species, and the archetype table has no figure for its genus or family.{/if}</div></div>
    {/if}
    {#if sheetCards.length || sheet.arch}
      <!-- One account of the method per section, closed: the grey "by rule" lines under every block are gone (round sixty; visitor 2). -->
      <details class="why howmade">
        <summary>How this section is made</summary>
        <div class="whybody">
          <p class="whyline">Each card states this species' habitat figures with their sources, and what two fixed rules read from them; nothing here says what the plant does, wants or tolerates. <a href="/about/how#year">The rules</a> · <a href="/about/how#glossary">the terms</a>.</p>
          {#each sheetCards as c (c.title)}{#each c.rows as r}<p class="whyline"><b>{c.rows.length > 1 ? r.k : c.title}.</b> {r.why}</p>{/each}{/each}
          {#if sheet.arch}<p class="whyline"><b>Group.</b> By {sheet.arch.why}, from the archetype table. {sheet.arch.arch.minC != null ? 'The table gives one figure for this group, a convention for growing it indoors, with no source; it is shown apart and never changes the cold floor.' : 'The table gives no figure for this group, which spans too much for one; the cold floor is the habitat\'s alone.'} The table gives no prose.</p>{/if}
        </div>
      </details>
    {/if}
  </div>

  <!-- The long sections below the sheet: laid out with the page, since `content-visibility` with a 480 px placeholder made
       the page report twice its height and the scrollbar jump as it shrank (round fifty-eight; it came in round forty, R2-6). -->
  <div class="deep">
  <h2 class="sec" id="s-climate">Climate across the habitat</h2>
  {#if d.climate.status === 'ok'}
    <Climograph name={d.name.scientific} south={sheet.year?.south ?? null} climate={{ months: d.climate.months, p10: d.climate.p10, p90: d.climate.p90, cells: d.climate.cells, extremes: d.climate.extremes ?? null }} /><!-- named: round fifty-eight; the accessibility review; its calendar named, round sixty -->
    <details class="figures">
      <summary>Figures by month</summary>
    <!-- Reachable and scrollable by keyboard, and named (round fifty-eight; the accessibility review). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroll-x" tabindex="0" role="region" aria-label="Habitat climate by month">
      <table class="wx">
        <thead><tr><th></th>{#each months as m}<th>{m}</th>{/each}</tr></thead>
        <tbody>
          <tr><td>Day {tempUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.tmax, d.climate.p10[i].tmax, d.climate.p90[i].tmax, 0, tC)}</td>{/each}</tr>
          <tr><td>Night {tempUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.tmin, d.climate.p10[i].tmin, d.climate.p90[i].tmin, 0, tC)}</td>{/each}</tr>
          <tr><td>Rain {rainUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.precipMm, d.climate.p10[i].precipMm, d.climate.p90[i].precipMm, u === 'us' ? (mmToIn(Math.max(m.precipMm, d.climate.p90[i].precipMm ?? 0)) < 1 ? 2 : 1) : 0, rMm)}</td>{/each}</tr>
          <tr><td>DLI</td>{#each d.climate.months as m, i}<td>{cell(m.dli, d.climate.p10[i].dli, d.climate.p90[i].dli)}</td>{/each}</tr>
          <tr><td>RH %</td>{#each d.climate.months as m, i}<td>{cell(m.rh, d.climate.p10[i].rh, d.climate.p90[i].rh)}</td>{/each}</tr>
        </tbody>
      </table>
    </div>
    </details>
    {#if d.climate.hemispheres}
      {@const hs = d.climate.hemispheres}
      {@const other = hs.used === 'north' ? hs.south : hs.north}
      {@const eq = hs.equatorial ?? Math.max(0, d.climate.cells - (hs.used === 'north' ? hs.north : hs.south))}
      <!-- One string: a block's boundary comment ate the space before "and", and the page printed "northand" (round thirty-seven, R2-2). The boundary is "at least 10°", as the split counts it (>= 10). -->
      {@const remain = `the ${hs.used === 'north' ? hs.north : hs.south} at least 10° ${hs.used}${eq ? ` and the ${eq} within 10° of the equator, which stay in either way` : ''}`}
      <p class="notice small" id="hemispheres">Records on both sides of the equator: the {other} {other === 1 ? 'cell' : 'cells'} at least 10° {hs.used === 'north' ? 'south' : 'north'} of it {other === 1 ? 'has' : 'have'} seasons six months apart and {other === 1 ? 'is' : 'are'} left out, not combined into a year no place has. These figures are across the {d.climate.cells} cells that remain: {remain}.</p>
    {/if}
    {#if d.climate.extremesSea && d.climate.landFraction != null}
      <p class="notice small" id="seacell">The daily extremes were read at a NASA POWER cell that is {Math.round(d.climate.landFraction * 100)}% land: neither it nor the next candidates whose coldest night is within 2 °C of the median across cells sit in a POWER cell that is mostly land, and the rule reads a cold floor only from a cell that is mostly land, so none is read for this species. Nor is the coldest month's mean night taken as one: it is a mean of a month's lows, not its coldest night. What that cell gave over {d.climate.extremesSea.years} years: absolute minimum {temp(d.climate.extremesSea.minAbs, u, 1)}, 1st-percentile night {temp(d.climate.extremesSea.minP01, u, 1)}, 99th-percentile day {temp(d.climate.extremesSea.maxP99, u, 1)}.</p>
    {/if}
    <!-- "a typical spot in the range" and "across the range", the glossary's words (round fifty-eight; the accessibility review). -->
    <details class="why">
      <summary>How this section is made</summary>
      <div class="whybody">
      Each figure is the median across the {d.climate.cells} grid cells {#if d.climate.seaCells}on land that hold in-range records ({d.climate.records} records in those cells; {d.climate.seaCells} more {d.climate.seaCells === 1 ? 'cell holds' : 'cells hold'} records but no land by the elevation layer, so those records sit at sea and the {d.climate.seaCells === 1 ? 'cell is' : 'cells are'} left out){:else}holding the {d.climate.records} in-range records{/if}, with the 10th–90th percentile span across those cells after the slash where it differs. A dash is a month one or more of those cells has no figure for in the grid (a variable CHELSA does not carry there), so no median is taken rather than one over fewer cells. Extremes and elevation were read at a typical spot in the range, cell {d.climate.cell} ({d.climate.at.lat}, {d.climate.at.lon}).
      {#if d.climate.extremes}Over {d.climate.extremes.years} years there: absolute minimum {temp(d.climate.extremes.minAbs, u, 1)}, 1st-percentile night {temp(d.climate.extremes.minP01, u, 1)}, 99th-percentile day {temp(d.climate.extremes.maxP99, u, 1)}.{/if}{#if u === 'us'}{' '}Shown in Fahrenheit and inches; the sources measure in °C and mm.{/if}
      Normals: {d.climate.src.normals}. Across the range: {d.climate.src.envelope}.{#if d.climate.src.extremes}{' '}Extremes: {d.climate.src.extremes}.{/if}{#if d.climate.src.elevation}{' '}Elevation: {d.climate.src.elevation}.{/if}
      </div>
    </details>
  {:else if d.climate.status === 'pending'}
    <div class="cult"><div class="none">Pending: the habitat climate for this species has not been derived yet{d.climate.detail ? ` (${d.climate.detail})` : ''}. Not a statement that none exists.</div></div>
  {:else if d.climate.status === 'refused'}
    <div class="notice"><b>Not checked.</b> {sentence(d.climate.detail, 'An upstream source did not answer when this page was built')} This is not a statement that no climate exists.</div>
  {:else}
    <div class="cult"><div class="none">No habitat climate can be derived: {sentence(d.climate.detail, 'no in-range records to read one at')}{#if d.occurrences.nVague}{' '}{d.occurrences.nVague} of the {d.occurrences.nOpenInRange + (d.occurrences.nRestrictedInRange ?? 0)} in-range records {d.occurrences.nVague === 1 ? 'is' : 'are'} placed to worse than 10 km, or to no stated accuracy and fewer than three decimals or by something other than a person's observation, and cannot place a climate cell, though {d.occurrences.nVague === 1 ? 'it counts' : 'they count'} for the map and its marker.{/if}</div></div>
  {/if}

  <h2 class="sec" id="s-habitat">Natural habitat</h2>
  <div class="maprow">
    <div class="mapbox">{@html data.worldSvg}<div class="mapcap">Native range as published by WCVP{#if d.centroid}; the marker is where the records are densest and decides nothing{#if d.climate.status === 'ok'}: the climate was read across the cells of the in-range records placed well enough to read one, not at the marker{/if}{/if}.</div></div>
    <div class="mapbox">{@html data.regionSvg}<div class="mapcap">{d.occurrences.nOpenInRange ? (d.occurrences.rangeTested === false ? 'Openly licensed records, not tested against the stated range, framed on where they fall.' : 'Openly licensed records inside the range, framed on where they fall.') : ['refused', 'error'].includes(d.upstream['gbif.occurrences']?.status ?? '') ? 'Records not checked: the occurrence source did not answer when this page was built.' : d.occurrences.rangeTested === false ? 'No openly licensed georeferenced record to show; records were not tested against the stated range.' : 'No openly licensed record to show inside the range.'}</div></div>
  </div>
  <div class="factgrid">
    <div class:wide={longRange}><b>Native</b>{#if d.distribution.native.length}{d.distribution.native.map((r) => unitName(r.name)).join(', ')}{#if d.distribution.verified === false}<span class="small muted"> · stated native by a national checklist, not by WCVP: unverified</span>{/if}{:else if d.distribution.reported?.length}<span class="muted">Not verified.</span><span class="small muted"> Reported present (native status not stated): {d.distribution.reported.map((r) => r.name).join(', ')}</span>{:else}{distWords}{/if}{#if d.distribution.introduced.length}<span class="small muted"> · introduced: {d.distribution.introduced.map((r) => r.name).join(', ')}</span>{/if}</div>
    {#if d.centroid}<div class:wide={longRange}><b>Map marker</b>{d.centroid.lat}, {d.centroid.lon}<span class="small muted">{' · '}in the densest population, {d.centroid.n} records ({Math.round(d.centroid.share * 100)}% of those in range)</span></div>{/if}
    {#if d.distribution.extinct?.length}<div><b>Extinct in</b>{d.distribution.extinct.map((r) => r.name).join(', ')}<span class="small muted"> · recorded as extinct by WCVP: history, not habitat; no records are tested against these regions</span></div>{/if}
    {#if d.distribution.kew?.lifeform || d.distribution.kew?.climate}<div class="wide"><b>Kew's description</b>{[d.distribution.kew.lifeform, d.distribution.kew.climate].filter(Boolean).map((t) => `“${t}”`).join(' · ')}<span class="small muted">{' · '}quoted from WCVP, RBG Kew (CC BY 4.0); not derived here</span></div>{/if}
    {#if d.distribution.ambiguous}<div class="wide"><b>Name not resolved</b>{d.distribution.ambiguous}<span class="small muted"> · WCVP lists this name more than once and authorship did not decide, so no range is attached and nothing is derived from records</span></div>{/if}
    <div class="wide"><b>Evidence used</b>{evidence.text}{#if d.occurrences.nVague}{' '}{d.occurrences.nVague} in-range record{d.occurrences.nVague === 1 ? ' is' : 's are'} placed to worse than 10 km, or with no stated accuracy (admitted only as a person's observation to three decimals), and stay{d.occurrences.nVague === 1 ? 's' : ''} on the map but off the climate.{/if}</div>
    {#if d.distribution.native.length && !d.distribution.boxes.length}<div><b>Range source</b>{d.distribution.source}: country level only, so records are not tested against it.</div>{/if}
  </div>
  {#if d.centroid}
    <details class="why">
      <summary>How this section is made</summary>
      <div class="whybody">{markerHow(d.centroid.how)}. Records outside the native range, living specimens and records marked introduced are not used; <a href="/about/how#records">which records count</a>.</div>
    </details>
  {/if}

  {#if myPhotos.length}
    <h2 class="sec" id="s-photos">Your photographs</h2>
    <!-- Each named by the plant, the day and the caption; the image inside is then decorative (round fifty-eight; the accessibility review). -->
    <div class="myph">
      {#each myPhotos.slice(0, 12) as ph, i (ph.id)}
        <button class="ph" type="button" onclick={() => (lightbox = i)} title="{accNo(ph.plant)} · {ph.d}" aria-label={photoLabel(ph)}>
          <PhotoImg id={ph.id} alt="" loading="lazy" />
          <span class="pd">{accNo(ph.plant)}</span>
        </button>
      {/each}
    </div>
    {#if myPhotos.length > 12}<p class="faint small">Showing the newest 12 of {myPhotos.length}; the rest are on each plant's page.</p>{/if}
  {/if}
  {#if d.photos.length > 1}
    <h2 class="sec" id={myPhotos.length ? 's-photos-open' : 's-photos'}>{myPhotos.length ? 'Open photographs' : 'Photographs'}</h2>
    <Photos photos={d.photos} name={d.name.scientific} strip />
  {:else if !d.photos.length}
    <!-- Why there is no photograph, here and not as the page's hero (round sixty; visitor 12). -->
    <h2 class="sec" id={myPhotos.length ? 's-photos-open' : 's-photos'}>{myPhotos.length ? 'Open photographs' : 'Photographs'}</h2>
    {#if refusedPhotoNames.length}
      <div class="notice"><b>Not checked.</b> {refusedPhotoNames.join(' and ')} {refusedPhotoSources.every((k) => (d.upstream[k]?.detail ?? '').startsWith('no credited photograph')) ? 'answered, but every photograph they gave lacked an author to credit under its licence, so none is shown' : refusedPhotoSources.every((k) => d.upstream[k]?.status === 'skipped') ? `${refusedPhotoNames.length === 1 ? 'was' : 'were'} not asked when this page was built` : `did not answer when this page was built`}{#if d.upstream['gbif.media']?.status === 'none' && !refusedPhotoSources.includes('gbif.media')}; GBIF's observation records with coordinates hold none{/if}. Not a statement that none exist.</div>
    {:else}
      <p class="small muted">No openly licensed photograph on file. If you grow this plant, add your own photograph to your record.</p>
    {/if}
  {/if}
  {#if refusedPhotoNames.length && d.photos.length}
    <p class="small muted">Photographs: {refusedPhotoNames.join(' and ')} did not answer when this page was built; what is shown came from the sources that did.</p>
  {/if}
  {#if lightbox != null && myPhotos.length}
    <Lightbox photos={myPhotos} bind:index={lightbox} acc={myPhotos[lightbox]?.plant.id ?? null} onclose={() => (lightbox = null)} />
  {/if}

  {#if refused('openalex') && !papers.length}
    <h2 class="sec" id="s-research">Papers naming this species</h2>
    <div class="notice"><b>Not checked.</b> OpenAlex did not answer when this page was built. Not a statement that no paper names this species.</div>
  {/if}
  {#if papers.length}
    <h2 class="sec" id="s-research">Papers naming this species</h2>
    <p class="small muted" style="margin: 0 0 8px">Works whose title or abstract names <i>{d.name.scientific}</i>, most cited first, from OpenAlex (CC0). A mention, not a cultivation source: nothing on this page is drawn from them.</p>
    {#each allPapers ? papers : papers.slice(0, 3) as p}
      <div class="paper"><a href={p.url} rel="noopener">{p.title}</a><div class="meta">{p.authors?.join(', ')}{p.year ? ` (${p.year})` : ''}{p.venue ? ` · ${p.venue}` : ''}</div></div>
    {/each}
    {#if papers.length > 3 && !allPapers}<button class="btn small" type="button" onclick={() => (allPapers = true)}>All {papers.length} papers</button>{/if}
  {/if}

  {#if data.siblings.length || data.near.length}
    <h2 class="sec" id="s-related">Related</h2>
    {#if data.near.length}
      <p class="relhead"><b>Similar habitat climate</b> <span class="small muted">The {data.near.length} nearest by mean day, mean night and rain, month by month. <a href="/about/how#related">How</a>.</span></p>
      <div class="relstrip">
        {#each data.near as c (c.key)}{@render rel(c)}{/each}
      </div>
    {/if}
    {#if data.siblings.length}
      <p class="relhead"><b>Other <i>{genusName}</i></b> <span class="small muted">{data.siblingCount} in the reference</span></p>
      <div class="relstrip">
        {#each data.siblings as c (c.key)}{@render rel(c)}{/each}
        {#if data.siblingCount > 12}<a class="reltile more" href="/?by=genus&open={genusSlug}"><span>all {data.siblingCount + 1} ›</span></a>{/if}
      </div>
    {/if}
  {/if}

  <h2 class="sec" id="s-registers">Names &amp; registers</h2>
  {#if synonyms.length}
    <p class="small muted names"><b>Also known as</b> {synonyms.slice(0, 5).join('; ')}{synonyms.length > 5 ? ` and ${synonyms.length - 5} more` : ''}{synonyms.slice(0, 5).join('; ').endsWith('.') && synonyms.length <= 5 ? '' : '.'} <span class="faint">(GBIF Backbone)</span></p>
  {/if}
  <div class="links">
    {#each Object.entries(d.links) as [k, url]}
      <a href={url} rel="noopener">{k === 'gbif' ? 'GBIF' : k === 'powo' ? 'POWO' : k === 'ipni' ? 'IPNI' : k === 'wfo' ? 'WFO' : k === 'wikidata' ? 'Wikidata' : k === 'wikipedia' ? 'Wikipedia' : k === 'inat' ? 'iNaturalist' : k.toUpperCase()}</a>
    {/each}
  </div>

  </div>
  <!-- The facts that led the page until round fifty, and the sentence about derivation: here, where someone checking the page looks. -->
  <h2 class="sec" id="s-facts">The record</h2>
  <div class="facts">
    <div class="fact"><div class="lab">Family</div><div class="v">{d.name.family ?? 'not stated by the backbone'}</div></div>
    <div class="fact"><div class="lab">Described by</div><div class="v">{d.name.authorship ?? 'authorship not stated by the backbone'}</div></div>
    <div class="fact"><div class="lab">Native to</div><div class="v">{#if d.distribution.native.length}{d.distribution.native.slice(0, 3).map((r) => unitName(r.name)).join(', ')}{d.distribution.native.length > 3 ? ` +${d.distribution.native.length - 3}` : ''}{:else}<span class="muted">not verified</span>{/if}</div></div>
    <!-- "Wild" only of records the rule tested against a native range (round sixty; words 20). -->
    <div class="fact"><div class="lab">{d.occurrences.rangeTested === false || !d.distribution.native.length ? 'Records' : 'Wild records'}</div><div class="v">{#if d.occurrences.nOpenInRange || d.occurrences.nRestrictedInRange}{d.occurrences.nOpenInRange + d.occurrences.nRestrictedInRange} {d.occurrences.rangeTested === false ? 'georeferenced' : 'in range'}<span class="small muted">{' · '}{d.occurrences.nOpenInRange} open{d.occurrences.rangeTested === false ? ' · range not tested' : ''}</span>{:else if ['refused', 'error'].includes(d.upstream['gbif.occurrences']?.status ?? '')}<span class="muted">not checked</span>{:else if d.occurrences.rangeTested === false}<span class="muted">no georeferenced records · range not tested</span>{:else}<span class="muted">none in range</span>{/if}</div></div>
  </div>
  <p class="small muted derived">Every figure here is derived from public data by a stated rule and names its source; nothing is written by a person or a model except the marked, credited quotations. <a href="/about/how">How&nbsp;→</a></p>
  <Provenance dossier={d} />
</article>

<style>
  /* A placeholder height only: the shorthand gave the unrendered sections a 480px width too, which on a phone narrower
     than that was a horizontal scroll until they rendered (round forty-nine, 2; round twenty-seven, 4). */
  .thinline { margin: 6px 0 0; }
  /* One centred run of text: the sentence and its link were two flex columns, the link's words stacked, so the placeholder's
     text is one span and the flex box centres that (round fifty, 3). */
  .myph { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 10px; }
  .myph .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: var(--r); overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: var(--sh); }
  .myph .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .myph .pd { position: absolute; left: 7px; bottom: 6px; font-family: var(--mono); font-size: var(--fs-xs); color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: var(--r-sm); }
  .species { max-width: 980px; }
  .hero { margin-top: 14px; }
  .glance { margin-top: 12px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .idcard .meta { margin-top: 3px; font-size: var(--fs-md); color: var(--ink3); }
  .idcard .acts { margin-top: 12px; }
  .idcard .acts .mine { margin: 0; display: inline-flex; gap: 6px; align-items: center; }
  .idcard .acts2 { margin-top: 0; gap: 0 14px; }
  .idcard .mine { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; } /* chips with a gap, no separators to strand (round fifty-two, 6) */
  .idcard .acts2 :global(.btn) { background: none; border: 0; box-shadow: none; padding: 6px 0; min-height: var(--tap); color: var(--accent); font-weight: 600; font-size: var(--fs-md); }
  .idcard .acts2 :global(.btn:hover) { text-decoration: underline; }
  .placeline { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 10px 0 0; padding: 11px 14px; background: color-mix(in srgb, var(--accent) 9%, var(--card)); border-left: 3px solid var(--accent); border-radius: var(--r); color: var(--ink); font-size: var(--fs-md); text-decoration: none; }
  .placeline.warn { border-left-color: var(--bad); background: color-mix(in srgb, var(--bad) 8%, var(--card)); }
  .placeline .chev { color: var(--accent); font-weight: 700; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; margin: 16px 0 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .fact { padding: 12px 16px; border-right: 1px solid var(--rule); min-width: 0; }
  .fact:last-child { border-right: 0; }
  .fact .lab { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .fact .v { font-size: var(--fs-base); margin-top: 4px; overflow-wrap: anywhere; }
  @media (max-width: 640px) { .fact { border-right: 0; border-bottom: 1px solid var(--rule); } .fact:last-child { border-bottom: 0; } }
  .relhead { margin: 12px 0 6px; font-size: var(--fs-md); }
  .relstrip { display: grid; grid-auto-flow: column; grid-auto-columns: 132px; gap: 10px; overflow-x: auto; padding: 2px 2px 10px; scroll-snap-type: x proximity; }
  .reltile { display: block; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; color: inherit; scroll-snap-align: start; }
  .reltile:hover { text-decoration: none; color: inherit; box-shadow: var(--sh2); }
  .reltile img, .reltile .noim { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sunk); }
  .reltile .rn { display: block; padding: 7px 9px 0; font-family: var(--serif); font-style: italic; font-size: var(--fs-md); line-height: 1.25; font-weight: 600; }
  .reltile .rf { display: block; padding: 3px 9px 9px; font-size: var(--fs-xs); letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink3); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reltile .rc { display: block; padding: 0 9px 8px; margin-top: -5px; font-size: var(--fs-xs); color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reltile.more { display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--accent); }
  @media (min-width: 860px) {
    /* The first screen answers: the photograph beside the name and the actions, the four figures and the note under them. */
    .top.withhero { display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 14px; }
    .top.withhero .hero { margin: 0; aspect-ratio: 4 / 3; }
    .top.withhero .hero img { height: 100%; max-height: none; }
    .top.withhero .idcard { margin: 0; flex-direction: column; gap: 14px; }
    .top.withhero .idcard .who { flex: 0 0 auto; }
  }
  .muted { color: var(--ink3); }
  .factgrid .wide { grid-column: 1 / -1; }
  .sheet { white-space: normal; }
  .mine { margin-top: 8px; white-space: normal; overflow-wrap: anywhere; line-height: 1.9; } /* six numbers on a phone wrap rather than widen the page (round seventeen, 11) */
  .sumbody .more { font-family: var(--ui); font-size: var(--fs-md); white-space: nowrap; }
  .notesline { margin: 2px 0 12px; }
  .figures { margin: 10px 0 0; }
  .figures summary { cursor: pointer; font-size: var(--fs-md); color: var(--ink2); font-weight: 600; padding: 6px 0; }
  .figures summary:hover { color: var(--accent); }
  .figures table.wx { margin-top: 6px; }
  .mine .accno { margin-right: 2px; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .fields textarea { width: 100%; font: inherit; font-size: 0.9375rem; font-family: var(--serif); line-height: 1.55; padding: 9px 12px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); min-height: 96px; }
  .end { display: flex; justify-content: flex-end; gap: 8px; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .acc { margin: 8px 0 0; }
  .acc > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) 24px; gap: 14px; align-items: center; padding: 13px 17px; font-family: var(--ui); }
  .acc > summary::-webkit-details-marker { display: none; }
  .acc > summary .t { font-weight: 700; font-size: var(--fs-base); color: var(--ink); }
  .acc > summary .pm { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; }
  .acc > summary .pm::after { content: '+'; font-family: var(--mono); font-size: var(--fs-xl); color: var(--ink3); }
  .acc[open] > summary .pm::after { content: '–'; }
  .acc > summary .pmw { display: none; font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .acc[open] > summary .pmw { display: none; }
  .derived { margin: 10px 0 0; }
  .acc > summary:hover .t { color: var(--accent); }
  .acc > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: var(--r); }
  .acc .body { border-top: 1px solid var(--rule); }
  @media (max-width: 640px) { .acc > summary { grid-template-columns: minmax(0, 1fr) 64px; } .acc > summary .pm { grid-column: 2; grid-row: 1; } .acc:not([open]) > summary .pmw { display: inline; } }
  .sheet .rowk { font-size: var(--fs-xs); letter-spacing: 0.11em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin: 14px 0 4px; font-family: var(--ui); }
  .sheet .rowk:first-child { margin-top: 0; }
  .sheet p { margin: 0 0 6px; }
  .thumbstrip { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; overflow-x: auto; text-decoration: none; color: var(--ink2); scrollbar-width: none; }
  .thumbstrip img { width: 72px; height: 72px; object-fit: cover; border-radius: var(--r); flex: none; background: var(--sunk); }
  .thumbstrip .more { flex: none; font-size: var(--fs-md); padding: 0 6px; }
  .names { margin: 0 0 8px; }
  .archline { margin: 0 0 10px; color: var(--ink2); }
  .howmade { margin: 10px 0 0; }
  .howmade .whyline { margin: 0 0 6px; font-family: var(--ui); }
  .howmade .whyline b { color: var(--ink2); }
  /* No photograph: the card takes the width, the placeholder a small square beside the name (round sixty; visitor 12). */
  .idcard.nophoto { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 0 14px; align-items: start; margin-top: 14px; }
  .idcard.nophoto > :not(.phthumb) { grid-column: 2; min-width: 0; }
  .idcard.nophoto .phthumb { grid-row: 1 / span 3; width: 64px; height: 64px; border-radius: var(--r); overflow: hidden; }
  @media (max-width: 420px) { .idcard.nophoto { grid-template-columns: 48px minmax(0, 1fr); } .idcard.nophoto .phthumb { width: 48px; height: 48px; } }
  .hero.failed { position: relative; min-height: 150px; border-radius: var(--r); overflow: hidden; }
  .hero.failed .cred { position: absolute; left: 8px; bottom: 6px; }
  /* At 320 px and 200% text the actions wrap rather than widen the page (round sixty; a11y 5). */
  .idcard .acts { flex-wrap: wrap; min-width: 0; }
  .idcard .acts :global(.btn) { white-space: normal; max-width: 100%; }
  .idcard .who, .idcard h1 { min-width: 0; overflow-wrap: anywhere; }
  .placeline { overflow-wrap: anywhere; }
  /* Anchors land under the top bar and the pinned section row, not beneath them (round sixty; visitor 5). */
  h2.sec { scroll-margin-top: calc(44px + 64px + 12px); }
  /* 44 px under a finger: the section row, the register links and the photograph strip (round sixty; a11y 6). */
  @media (pointer: coarse) {
    nav.tabs a { min-height: var(--tap); }
    .links a { min-height: var(--tap); display: inline-flex; align-items: center; }
    .thumbstrip { min-height: var(--tap); }
  }

  /* The failed-photograph line takes the photograph's own box on a phone, not a 200px one of its own: the page below did not move when it failed (round forty-nine, 3; S2). */
  @media (max-width: 640px) { .hero { margin-top: 0; } .hero.photo { height: 150px; } .hero.photo img { height: 100%; max-height: none; } }
</style>
