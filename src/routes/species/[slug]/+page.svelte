<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import Photos from '$lib/ui/Photos.svelte';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  import Provenance from '$lib/ui/Provenance.svelte';
  import Climograph from '$lib/ui/Climograph.svelte';
  import FollowButton from '$lib/ui/FollowButton.svelte';
  import CompareButton from '$lib/ui/CompareButton.svelte';
  import ShareCard from '$lib/ui/ShareCard.svelte';
  import { firstSentences } from '$core/text';
  import { frostWording } from '$core/extremes';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { generatedNote } from '$core/note';
  import { cultivationSheet, CARD_ORDER } from '$core/sheet';
  import { collection } from '$lib/db/collection.svelte';
  import { slugify, genusOf } from '$core/names';
  import { onMount } from 'svelte';
  import { units } from '$lib/ui/units.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { temp, tempN, rain, rainN, tempUnit, rainUnit, cToF, mmToIn } from '$core/units';
  let { data } = $props();
  let allPapers = $state(false);
  const u = $derived(units.current);
  const d = $derived(data.d);
  const common = $derived(d.name.vernacular.filter((v) => !v.lang || v.lang === 'eng').map((v) => v.name).slice(0, 4));
  const hero = $derived(d.photos.find((p) => !p.captive) ?? d.photos[0]);
  const desc = $derived(d.summary?.text.slice(0, 155) ?? `${d.name.scientific}, ${d.name.family ?? ''}: native range, habitat climate, photographs and cultivation notes with sources.`);
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
      image: hero?.url
    })
  );
  const evidence = $derived.by(() => {
    const o = d.occurrences;
    const up = d.upstream['gbif.occurrences']?.status;
    if (up === 'refused' || up === 'error') return { tone: 'warn', text: 'The occurrence source did not answer when this dossier was built. Nothing here is derived from records, and this is not a statement that none exist.' };
    if (d.distribution.verified === false || (!d.distribution.native.length && d.distribution.reported?.length)) {
      const all = o.nOpenInRange + o.nRestrictedInRange;
      return { tone: 'warn', text: `No verified native range for this name: WCVP has no entry with native status, and a checklist that only reports presence cannot tell a wild record from a garden one. The map shows ${o.nOpenInRange} openly licensed record${o.nOpenInRange === 1 ? '' : 's'}${all > o.nOpenInRange ? ` of ${all}` : ''} untested against any range; no map marker or climate is derived from them, and no sheet is built from them.` };
    }
    if (!o.nOpenInRange && !o.nRestrictedInRange) return { tone: 'muted', text: 'No georeferenced records inside the stated native range.' };
    const all = o.nOpenInRange + o.nRestrictedInRange;
    const climateOk = d.climate.status === 'ok';
    let t = `The map marker${climateOk ? ' and the climate envelope' : ''} rest${climateOk ? '' : 's'} on all ${all} georeferenced record${all === 1 ? '' : 's'} inside the native range`;
    if (!o.nOpenInRange) t += `; none carries a licence permitting republication, so the map shows no points.`;
    else if (o.nRestrictedInRange) t += `; the map shows only the ${o.nOpenInRange} openly licensed one${o.nOpenInRange === 1 ? '' : 's'}` + (o.restrictedShiftKm != null && o.restrictedShiftKm >= 1 ? `, which alone would put the marker ${o.restrictedShiftKm} km away` : o.restrictedShiftKm != null ? ', which alone would put the marker in the same place' : '') + '.';
    else t += ', all openly licensed and shown on the map.';
    if (o.nOutsideRange) t += ` ${o.nOutsideRange} record${o.nOutsideRange === 1 ? '' : 's'} outside the range (gardens, roadsides, misidentifications) ignored.`;
    if (o.thin) t += ` Under a dozen records: treat the map${climateOk ? ' and the climate' : ''} as indicative.`;
    if (!climateOk) t += d.climate.status === 'pending' ? ' No climate envelope yet: the habitat climate is pending.' : d.climate.status === 'refused' ? ' No climate envelope: the climate source did not answer.' : ' No climate envelope is derived for this species.';
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
  let active = $state('');
  onMount(() => {
    const heads = [...document.querySelectorAll<HTMLElement>('h2.sec[id]')].filter((h) => ['s-cultivation', 's-climate', 's-habitat', 's-photos', 's-photos-open', 's-research', 's-related', 's-registers'].includes(h.id));
    if (!heads.length) return;
    const onScroll = () => {
      const line = 110;
      let cur = '';
      for (const h of heads) if (h.getBoundingClientRect().top <= line) cur = h.id;
      active = cur;
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  });
  const mine = $derived(collection.ready ? collection.accessions.filter((a) => slugify(a.taxonName) === d.slug) : []);
  const growing = $derived(mine.filter((a) => a.status === 'growing'));
  /** Your own photographs of this species, across every plant of it you own. */
  const myPhotos = $derived(mine.flatMap((a) => collection.photos(a.id).map((p) => ({ ...p, plant: a }))).sort((x, y) => y.d.localeCompare(x.d)));
  let lightbox = $state<number | null>(null);
  let heroFailed = $state(false);
  const myTaxon = $derived(collection.ready ? collection.taxon(d.slug) : undefined);
  let editingMy = $state(false);
  let myDraft = $state('');
  async function saveMy() {
    await collection.put('taxon', d.slug, { name: d.name.scientific, gbifKey: d.key, myNotes: myDraft.trim() || null });
    editingMy = false;
  }
  const sheetIn = $derived({ scientific: d.name.scientific, climateStatus: d.climate.status, family: d.name.family, months: d.climate.status === 'ok' ? d.climate.months : null, p10: d.climate.status === 'ok' ? d.climate.p10 : null, p90: d.climate.status === 'ok' ? d.climate.p90 : null, annualP10: d.climate.status === 'ok' ? (d.climate.annualRain?.p10 ?? null) : null, annualP90: d.climate.status === 'ok' ? (d.climate.annualRain?.p90 ?? null) : null, extremes: d.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, lat: d.centroid?.lat ?? (d.climate.status === 'ok' ? d.climate.at.lat : null), units: u });
  const sheet = $derived(cultivationSheet(sheetIn));
  /** An upstream that refused or failed. Only 'none' is ever rendered as an absence; these get their own line. */
  /** Not answered: refused, failed, or not asked (a skipped source). Only 'none' is ever rendered as an absence. */
  const refused = (k: string) => ['refused', 'error', 'skipped'].includes(d.upstream[k]?.status ?? '');
  const refusedPhotoSources = $derived(['inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated', 'commons', 'gbif.media'].filter(refused));
  const photoSourceName: Record<string, string> = { 'inat.taxon': 'iNaturalist', 'inat.photos.wild': 'iNaturalist', 'inat.photos.cultivated': 'iNaturalist', commons: 'Wikimedia Commons', 'gbif.media': 'GBIF media' };
  const refusedPhotoNames = $derived([...new Set(refusedPhotoSources.map((k) => photoSourceName[k]))]);
  /** "12 / 8–15": the median with the 10th–90th span across the envelope cells. */
  const cell = (med: number | undefined, lo: number | undefined, hi: number | undefined, digits = 0, conv: (x: number) => number = (x) => x) => (med == null ? '–' : lo == null || hi == null || (lo === med && hi === med) ? conv(med).toFixed(digits) : `${conv(med).toFixed(digits)} / ${conv(lo).toFixed(digits)}–${conv(hi).toFixed(digits)}`);
  const tC = $derived((x: number) => (u === 'us' ? cToF(x) : x));
  const rMm = $derived((x: number) => (u === 'us' ? mmToIn(x) : x));
  /** A source's detail string as a sentence of its own: capitalised, with a full stop. */
  const sentence = (t: string | undefined, fallback: string) => { const x = (t ?? fallback).trim(); const y = x.charAt(0).toUpperCase() + x.slice(1); return y.endsWith('.') ? y : y + '.'; };
  /** The grower's hemisphere, from the first place with coordinates, else north. Only the months in the note depend on it. */
  // Your site's latitude decides the hemisphere of the months; a bench with coordinates stands in when no site is set.
  const readerLat = $derived(site.current?.lat ?? (collection.ready ? (collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null) : null));
  const note = $derived(generatedNote(sheetIn, { readerLat }));
  /** Four sentences of the quoted lead; the rest is a link, never a mid-sentence cut. */
  const excerpt = $derived(d.summary ? firstSentences(d.summary.text, 4) : null);
  const genusName = $derived(genusOf(d.name.scientific));
  const genusExcerpt = $derived(data.genusRecord?.summary ? firstSentences(data.genusRecord.summary.text, 3) : null);
  const genusSlug = $derived(slugify(genusName));
  const sheetCards = $derived(CARD_ORDER.map((c) => ({ title: c, rows: sheet.rows.filter((r) => r.card === c) })).filter((c) => c.rows.length));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The numbers a grower reads first, each with the month it belongs to.
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
</script>

{#snippet rel(c: (typeof data.near)[number])}
  <a class="reltile" href="/species/{c.slug}">
    {#if c.thumb}<img src={c.thumb} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} />{:else}<div class="noim"></div>{/if}
    <span class="rn"><SpeciesName name={c.name} /></span>
    <span class="rf">{c.common ?? c.family ?? ''}</span>
  </a>
{/snippet}

<svelte:head>
  <title>{d.name.scientific} — Cultifolio</title>
  <meta name="description" content={desc} />
  <meta property="og:title" content={d.name.scientific} />
  <meta property="og:description" content={desc} />
  {#if hero}<meta property="og:image" content={hero.url} />{/if}
  <link rel="canonical" href="https://cultifolio.com/species/{d.slug}" />
  {@html `<script type="application/ld+json">${jsonld}</script>`}
</svelte:head>

<article class="species">
  <div class="top" class:withhero={!!hero}>
  {#if hero && heroFailed}
    <div class="hero"><div class="ph">The photograph did not load ({hero.attribution}). <a href={hero.page ?? hero.url} rel="noopener">Its page</a>.</div></div>
  {:else if hero}
    <div class="hero">
      <a href={hero.page ?? hero.url} rel="noopener"><img src={hero.url} alt="{d.name.scientific}{hero.place ? ', ' + hero.place : ''}" loading="eager" fetchpriority="high" onerror={() => (heroFailed = true)} /></a>
      <a class="cred" href={hero.page ?? hero.url} rel="noopener">{hero.attribution}{hero.captive ? ' · in cultivation' : ' · observed growing wild'}{hero.observedOn ? ' · ' + hero.observedOn : ''}</a>
    </div>
  {:else}
    <div class="hero"><div class="ph">{#if refusedPhotoNames.length}Photographs: {refusedPhotoNames.join(' and ')} {refusedPhotoSources.every((k) => d.upstream[k]?.status === 'skipped') ? 'were not asked when this page was built' : 'did not answer when this page was built'}. Not a statement that none exist.{:else}No openly licensed photograph on file. If you grow this plant, add your own photo to your record.{/if}</div></div>
  {/if}
  <div class="idcard">
    <div class="who">
      <h1 class="sci"><SpeciesName name={d.name.scientific} authorship={d.name.authorship} /></h1>
      <p class="vern">
        {#if common.length}{common.join(', ')}{:else}{d.name.family ?? ''}{/if}
        {#if d.name.status === 'synonym' && d.name.acceptedName}· <span class="pill w">synonym of {d.name.acceptedName}</span>{:else if d.name.status !== 'accepted'}· <span class="pill">{d.name.status}</span>{/if}
      </p>
      <div class="pills">
        {#if d.climate.status === 'ok'}<span class="pill a">Climate known</span>{:else if d.climate.status === 'pending'}<span class="pill">Climate pending</span>{:else if d.climate.status === 'refused'}<span class="pill w">Climate not checked</span>{:else}<span class="pill">No habitat climate</span>{/if}
        {#if d.photos.length}<span class="pill">{d.photos.length} photograph{d.photos.length === 1 ? '' : 's'}</span>{:else if refusedPhotoNames.length}<span class="pill w">Photographs not checked</span>{/if}
        {#if sheet.arch}<span class="pill" title="Grouped by {sheet.arch.why} (archetype table)">{sheet.arch.arch.lab}</span>{/if}
        {#if growing.length}<span class="pill a">you grow {growing.length}</span>{/if}
      </div>
      {#if mine.length}
        <p class="vern mine">Yours: {#each mine as a, i}{#if i}, {/if}<a class="accno" href="/plants/{accNo(a)}">{accNo(a)}</a>{#if a.status !== 'growing'} <span class="small muted">({a.status})</span>{/if}{/each}</p>
      {/if}
    </div>
    <div class="acts">
      <a class="btn pri" href="/plants/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Add one to my plants</a>
      <a class="btn" href="/sowings/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Sow seed</a>
      <FollowButton slug={d.slug} name={d.name.scientific} gbifKey={d.key} />
      <CompareButton slug={d.slug} name={d.name.scientific} />
      {#if d.climate.status === 'ok'}<ShareCard input={{ units: u, name: d.name.scientific, family: d.name.family, origin: d.distribution.native.map((r) => r.name), slug: d.slug, cells: d.climate.cells, climate: { months: d.climate.months, p10: d.climate.p10, p90: d.climate.p90, cells: d.climate.cells, extremes: d.climate.extremes ?? null } }} />{/if}
    </div>
  </div>
  </div>
  <p class="small muted derived">Every figure on this page is derived from public data by a stated rule and says its source; nothing here is written by a person or a model, except the Wikipedia passage, which is quoted and marked as such. <a href="/about/how">How it is made.</a></p>

  {#if d.summary}
    <h2 class="sec" id="s-summary">Summary</h2>
    <div class="sumbody"><p>{excerpt?.text}{#if excerpt?.more}{' '}<a class="more" href={d.summary.url} rel="noopener">More on Wikipedia ›</a>{/if}</p></div>
    <p class="small muted">{excerpt?.more ? 'The opening of' : 'Text from'} <a href={d.summary.url} rel="noopener">Wikipedia, “{d.summary.title}”</a>, {d.summary.licence}, quoted as written. Kept separate from everything derived here.</p>
  {:else if refused('wikipedia')}
    <h2 class="sec" id="s-summary">Summary</h2>
    <div class="notice"><b>Not checked.</b> Wikipedia did not answer when this page was built. Not a statement that it has no article.</div>
  {/if}

  {#if data.genusRecord?.status === 'ok' && data.genusRecord.summary}
    <h2 class="sec" id="s-genus">About the genus · <i>{genusName}</i></h2>
    <div class="sumbody"><p>{genusExcerpt?.text}{#if genusExcerpt?.more}{' '}<a class="more" href={data.genusRecord.summary.url} rel="noopener">More on Wikipedia ›</a>{/if}</p></div>
    <p class="small muted">{genusExcerpt?.more ? 'The opening of' : 'Text from'} <a href={data.genusRecord.summary.url} rel="noopener">Wikipedia, “{data.genusRecord.summary.title}”</a>, {data.genusRecord.summary.licence}, quoted as written.</p>
  {:else if data.genusRecord?.status === 'refused'}
    <h2 class="sec" id="s-genus">About the genus · <i>{genusName}</i></h2>
    <div class="notice"><b>Not checked.</b> Wikipedia did not answer for the genus when this was built. Not a statement that it has no article.</div>
  {/if}

  <div class="facts">
    <div class="fact"><div class="lab">Family</div><div class="v">{d.name.family ?? '–'}</div></div>
    <div class="fact"><div class="lab">Described by</div><div class="v">{d.name.authorship ?? '–'}</div></div>
    <div class="fact"><div class="lab">Native to</div><div class="v">{#if d.distribution.native.length}{d.distribution.native.slice(0, 3).map((r) => r.name).join(', ')}{d.distribution.native.length > 3 ? ` +${d.distribution.native.length - 3}` : ''}{:else}<span class="muted">not verified</span>{/if}</div></div>
    <div class="fact"><div class="lab">Wild records</div><div class="v">{#if d.occurrences.nOpenInRange || d.occurrences.nRestrictedInRange}{d.occurrences.nOpenInRange + d.occurrences.nRestrictedInRange} in range<span class="small muted"> · {d.occurrences.nOpenInRange} open</span>{:else if ['refused', 'error'].includes(d.upstream['gbif.occurrences']?.status ?? '')}<span class="muted">not checked</span>{:else}<span class="muted">none in range</span>{/if}</div></div>
  </div>

  {#if glance || note}
    <h2 class="sec" id="s-glance">At a glance</h2>
    <section class="glance" aria-label="At a glance">
      {#if glance}
        <div class="cards">
          <button class="card unitbtn" type="button" title="Switch to {u === 'us' ? 'Celsius and millimetres' : 'Fahrenheit and inches'}" onclick={() => units.toggle()}><div class="lab">Cold floor</div>{#if glance.ex}<div class="val">{tempN(glance.ex.minP01, u, 1)}<span class="u">{tempUnit(u)}</span></div><div class="sub">1st-percentile night over {glance.ex.years} years; lowest {temp(glance.ex.minAbs, u, 1)}, {frostWording(glance.ex)} (NASA POWER)</div>{:else}<div class="val">{tempN(glance.cold.v, u)}<span class="u">{tempUnit(u)}</span></div><div class="sub">{glance.cold.mo}, mean night (CHELSA); no extremes series for this cell</div>{/if}<span class="swap">tap for {u === 'us' ? '°C' : '°F'}</span></button>
          <div class="card"><div class="lab">Warmest month</div><div class="val">{tempN(glance.hot.v, u)}<span class="u">{tempUnit(u)}</span></div><div class="sub">{glance.hot.mo}, mean day; nights {temp(glance.hot.night, u)} (CHELSA)</div></div>
          <div class="card"><div class="lab">Rain</div><div class="val">{rainN(glance.rain, u)}<span class="u">{rainUnit(u)}/yr</span></div><div class="gauge"><i class="c" style="width:{Math.min(100, glance.rain / 12)}%"></i></div><div class="sub">{glance.wetMonths === 0 ? 'no wet month' : glance.wetMonths + (glance.wetMonths === 1 ? ' wet month' : ' wet months')} · peak {glance.wet.mo} {rain(glance.wet.v, u)} (CHELSA)</div></div>
          {#if glance.dli}<div class="card"><div class="lab">Light</div><div class="val">{glance.dli.lo.toFixed(0)}–{glance.dli.hi.toFixed(0)}<span class="u">DLI</span></div><div class="gauge"><i class="w" style="width:{Math.min(100, glance.dli.hi / 0.7)}%"></i></div><div class="sub">mol/m²/day, winter to summer, open sky (CHELSA shortwave)</div></div>{/if}
        </div>
      {/if}
      {#if note}
        <details class="cult acc notecard" id="gen-note">
          <summary><span class="t">In short</span><span class="one">the figures as one paragraph, condensed by rule from the cultivation cards · not written by a person</span><span class="pm" aria-hidden="true"><span class="pmw">open</span></span></summary>
          <div class="body">{note.text}</div><div class="foot">Each sentence is one card's own one-line form, written by the same rule as the card ({note.from.join(', ')}); the note cannot say what a card does not. {#if note.hab}Months are given for {readerLat != null && readerLat < 0 ? 'the southern' : 'the northern'} hemisphere{readerLat == null ? ' (set your site in Settings to change this)' : site.current ? ', from your site' : ', from your benches'}, and the habitat's own alongside.{/if} <a href="#s-cultivation">The cards</a> · <a href="#s-climate">the figures</a>.</div>
        </details>
      {/if}
    </section>
  {/if}

  <nav class="tabs" aria-label="Sections">
    <a href="#s-cultivation" class:on={active === 's-cultivation'}>Cultivation</a>
    <a href="#s-climate" class:on={active === 's-climate'}>Climate</a>
    <a href="#s-habitat" class:on={active === 's-habitat'}>Habitat</a>
    {#if d.photos.length > 1}<a href="#s-photos" class:on={active === 's-photos' || active === 's-photos-open'}>Photographs</a>{/if}
    {#if d.literature.length || refused('openalex')}<a href="#s-research" class:on={active === 's-research'}>Papers</a>{/if}
    {#if data.siblings.length || data.near.length}<a href="#s-related" class:on={active === 's-related'}>Related</a>{/if}
    <a href="#s-registers" class:on={active === 's-registers'}>Registers</a>
  </nav>

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
        <div class="body">{myTaxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => { myDraft = myTaxon?.myNotes ?? ''; editingMy = true; }}>Edit</button></div>
      </div>
    {:else if collection.ready}
      <p class="small muted notesline">Your notes: none yet. <button class="linkish" onclick={() => { myDraft = ''; editingMy = true; }}>Write what you know</button> · yours alone, on this device.</p>
    {/if}
    {#if sheet.arch}
      <details class="why archwhy">
        <summary>Grouped as a {sheet.arch.arch.lab.toLowerCase()}</summary>
        <div class="whybody">By {sheet.arch.why}, from the archetype table. {sheet.arch.arch.minC != null ? 'The table supplies one figure for this group, a conventional minimum for the cold floor, and no prose.' : (d.climate.status === 'ok' ? 'The table holds no figure for this group, which spans too much for one minimum; the cold floor is the habitat\'s alone, and no prose comes from the table.' : 'The table holds no figure for this group, which spans too much for one minimum, and no habitat climate is derived yet; no cold floor is given, and no prose comes from the table.')}</div>
      </details>
    {/if}
    {#each sheetCards as c, i (c.title)}
      <details class="cult acc" open={i === 0}>
        <summary>
          <span class="t">{c.title}</span>
          <span class="one">{c.rows.find((r) => r.short)?.short ?? c.rows[0]?.s ?? ''}</span>
          <span class="pm" aria-hidden="true"><span class="pmw">open</span></span>
        </summary>
        <div class="body sheet">
          {#each c.rows as r}
            {#if c.rows.length > 1}<div class="rowk" role="heading" aria-level="3">{r.k}</div>{/if}
            <p>{r.s}</p>
          {/each}
          <details class="why">
            <summary>How this is read</summary>
            <div class="whybody">
              <p class="hintline">{c.rows.some((r) => r.hab) ? (c.title === 'Its year' ? 'This species’ habitat figures, and what two fixed rules read from them.' : 'This species’ habitat figures, with their source.') : 'The archetype table’s figure; no habitat figure for this species.'}</p>
              {#each c.rows as r}<p class="whyline">{#if c.rows.length > 1}<b>{r.k}.</b> {/if}{r.why}</p>{/each}
            </div>
          </details>
        </div>
      </details>
    {/each}
    {#if !sheetCards.length}
      <div class="cult"><div class="none">{#if d.climate.status === 'refused'}Not checked: {sentence(d.climate.detail, 'a source did not answer when this page was built')} No sheet is derived from an answer that was not given, and the archetype table has no figure for this genus or family.{:else if d.climate.status === 'pending'}Pending: the habitat climate has not been derived yet, and the archetype table has no figure for this genus or family.{:else}Nothing derived: no habitat climate for this species, and the archetype table has no figure for its genus or family.{/if}</div></div>
    {/if}
    {#if sheetCards.length}<p class="small muted">The figures the cards read from are in <a href="#s-climate">Climate</a> below, and where they came from in <a href="#s-habitat">Natural habitat</a>.</p>{/if}
  </div>

  <h2 class="sec" id="s-climate">Climate across the habitat</h2>
  {#if d.climate.status === 'ok'}
    <Climograph climate={{ months: d.climate.months, p10: d.climate.p10, p90: d.climate.p90, cells: d.climate.cells, extremes: d.climate.extremes ?? null }} />
    <details class="figures">
      <summary>Figures by month</summary>
    <div class="scroll-x">
      <table class="wx">
        <thead><tr><th></th>{#each months as m}<th>{m}</th>{/each}</tr></thead>
        <tbody>
          <tr><td>Day {tempUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.tmax, d.climate.p10[i].tmax, d.climate.p90[i].tmax, 0, tC)}</td>{/each}</tr>
          <tr><td>Night {tempUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.tmin, d.climate.p10[i].tmin, d.climate.p90[i].tmin, 0, tC)}</td>{/each}</tr>
          <tr><td>Rain {rainUnit(u)}</td>{#each d.climate.months as m, i}<td>{cell(m.precipMm, d.climate.p10[i].precipMm, d.climate.p90[i].precipMm, u === 'us' ? 1 : 0, rMm)}</td>{/each}</tr>
          <tr><td>DLI</td>{#each d.climate.months as m, i}<td>{cell(m.dli, d.climate.p10[i].dli, d.climate.p90[i].dli)}</td>{/each}</tr>
          <tr><td>RH %</td>{#each d.climate.months as m, i}<td>{cell(m.rh, d.climate.p10[i].rh, d.climate.p90[i].rh)}</td>{/each}</tr>
        </tbody>
      </table>
    </div>
    </details>
    <details class="why">
      <summary>Where these figures come from</summary>
      <div class="whybody">
      Each figure is the median across the {d.climate.cells} grid cells holding the {d.climate.records} in-range records, with the 10th–90th percentile span across those cells after the slash where it differs. Extremes and elevation were read at the typical cell {d.climate.cell} ({d.climate.at.lat}, {d.climate.at.lon}).
      {#if d.climate.extremes}Over {d.climate.extremes.years} years there: absolute minimum {temp(d.climate.extremes.minAbs, u, 1)}, 1st-percentile night {temp(d.climate.extremes.minP01, u, 1)}, 99th-percentile day {temp(d.climate.extremes.maxP99, u, 1)}.{/if}{#if u === 'us'}{' '}Shown in Fahrenheit and inches; the sources measure in °C and mm.{/if}
      Normals: {d.climate.src.normals}. Envelope: {d.climate.src.envelope}.{#if d.climate.src.extremes}{' '}Extremes: {d.climate.src.extremes}.{/if}{#if d.climate.src.elevation}{' '}Elevation: {d.climate.src.elevation}.{/if}
      </div>
    </details>
  {:else if d.climate.status === 'pending'}
    <div class="cult"><div class="none">Pending: the habitat climate for this species has not been derived yet{d.climate.detail ? ` (${d.climate.detail})` : ''}. Not a statement that none exists.</div></div>
  {:else if d.climate.status === 'refused'}
    <div class="notice"><b>Not checked.</b> {sentence(d.climate.detail, 'An upstream source did not answer when this page was built')} This is not a statement that no climate exists.</div>
  {:else}
    <div class="cult"><div class="none">No habitat climate can be derived: {sentence(d.climate.detail, 'no in-range records to read one at')}</div></div>
  {/if}

  <h2 class="sec" id="s-habitat">Natural habitat</h2>
  <div class="maprow">
    <div class="mapbox">{@html data.worldSvg}<div class="mapcap">Native range as published by WCVP{#if d.centroid}; the marker is where the records are densest and decides nothing{#if d.climate.status === 'ok'}: the climate was read across every in-range record's cell, not at the marker{/if}{/if}.</div></div>
    <div class="mapbox">{@html data.regionSvg}<div class="mapcap">{d.occurrences.nOpenInRange ? 'Openly licensed records inside the range, framed on where they fall.' : ['refused', 'error'].includes(d.upstream['gbif.occurrences']?.status ?? '') ? 'Records not checked: the occurrence source did not answer when this page was built.' : 'No openly licensed record to show inside the range.'}</div></div>
  </div>
  <div class="factgrid">
    <div><b>Native</b>{#if d.distribution.native.length}{d.distribution.native.map((r) => r.name).join(', ')}{#if d.distribution.verified === false}<span class="small muted"> · stated native by a national checklist, not by WCVP: unverified</span>{/if}{:else if d.distribution.reported?.length}<span class="muted">Not verified.</span><span class="small muted"> Reported present (native status not stated): {d.distribution.reported.map((r) => r.name).join(', ')}</span>{:else}{d.upstream['wcvp.distribution']?.status === 'none' ? 'No published distribution for this name.' : 'Distribution source did not answer.'}{/if}{#if d.distribution.introduced.length}<span class="small muted"> · introduced: {d.distribution.introduced.map((r) => r.name).join(', ')}</span>{/if}</div>
    {#if d.distribution.extinct?.length}<div><b>Extinct in</b>{d.distribution.extinct.map((r) => r.name).join(', ')}<span class="small muted"> · recorded as extinct by WCVP: history, not habitat; no records are tested against these regions</span></div>{/if}
    {#if d.distribution.kew?.lifeform || d.distribution.kew?.climate}<div class="wide"><b>Kew's description</b>{[d.distribution.kew.lifeform, d.distribution.kew.climate].filter(Boolean).map((t) => `“${t}”`).join(' · ')}<span class="small muted"> · quoted from WCVP, RBG Kew (CC BY 4.0); not derived here</span></div>{/if}
    {#if d.distribution.ambiguous}<div class="wide"><b>Name not resolved</b>{d.distribution.ambiguous}<span class="small muted"> · WCVP lists this name more than once and authorship did not decide, so no range is attached and nothing is derived from records</span></div>{/if}
    {#if d.centroid}<div><b>Map marker</b>{d.centroid.lat}, {d.centroid.lon}<span class="small muted">{' · '}in the densest population, {d.centroid.n} records ({Math.round(d.centroid.share * 100)}% of those in range)</span></div>{/if}
    <div class="wide"><b>Evidence used</b>{evidence.text}{#if d.occurrences.nVague}{' '}{d.occurrences.nVague} in-range record{d.occurrences.nVague === 1 ? ' is' : 's are'} placed to worse than 10 km and stay{d.occurrences.nVague === 1 ? 's' : ''} on the map but off the climate.{/if}</div>
    {#if d.distribution.native.length && !d.distribution.boxes.length}<div><b>Range source</b>{d.distribution.source}: country level only, so records are not tested against it.</div>{/if}
  </div>
  {#if d.centroid}
    <details class="why">
      <summary>How the map marker was placed</summary>
      <div class="whybody">{d.centroid.how}.</div>
    </details>
  {/if}

  {#if myPhotos.length}
    <h2 class="sec" id="s-photos">Your photographs</h2>
    <div class="myph">
      {#each myPhotos.slice(0, 12) as ph, i (ph.id)}
        <button class="ph" type="button" onclick={() => (lightbox = i)} title="{accNo(ph.plant)} · {ph.d}">
          <PhotoImg id={ph.id} alt="{d.name.scientific}, {accNo(ph.plant)}" loading="lazy" />
          <span class="pd">{accNo(ph.plant)}</span>
        </button>
      {/each}
    </div>
    {#if myPhotos.length > 12}<p class="faint small">Showing the newest 12 of {myPhotos.length}; the rest are on each plant's page.</p>{/if}
  {/if}
  {#if d.photos.length > 1}
    <h2 class="sec" id={myPhotos.length ? 's-photos-open' : 's-photos'}>{myPhotos.length ? 'Open photographs' : 'Photographs'}</h2>
    <Photos photos={d.photos} name={d.name.scientific} strip />
  {/if}
  {#if refusedPhotoNames.length && d.photos.length}
    <p class="small muted">Photographs: {refusedPhotoNames.join(' and ')} did not answer when this page was built; what is shown came from the sources that did.</p>
  {/if}
  {#if lightbox != null && myPhotos.length}
    <Lightbox photos={myPhotos} bind:index={lightbox} acc={myPhotos[lightbox]?.plant.id ?? null} onclose={() => (lightbox = null)} />
  {/if}

  {#if refused('openalex') && !d.literature.length}
    <h2 class="sec" id="s-research">Papers naming this species</h2>
    <div class="notice"><b>Not checked.</b> OpenAlex did not answer when this page was built. Not a statement that no paper names this species.</div>
  {/if}
  {#if d.literature.length}
    <h2 class="sec" id="s-research">Papers naming this species</h2>
    <p class="small muted" style="margin: 0 0 8px">Works whose title or abstract names <i>{d.name.scientific}</i>, most cited first, from OpenAlex (CC0). A mention, not a cultivation source: nothing on this page is drawn from them.</p>
    {#each allPapers ? d.literature : d.literature.slice(0, 3) as p}
      <div class="paper"><a href={p.url} rel="noopener">{p.title}</a><div class="meta">{p.authors?.join(', ')}{p.year ? ` (${p.year})` : ''}{p.venue ? ` · ${p.venue}` : ''}</div></div>
    {/each}
    {#if d.literature.length > 3 && !allPapers}<button class="btn small" type="button" onclick={() => (allPapers = true)}>All {d.literature.length} papers</button>{/if}
  {/if}

  {#if data.siblings.length || data.near.length}
    <h2 class="sec" id="s-related">Related</h2>
    {#if data.near.length}
      <p class="relhead"><b>Similar habitat climate</b> <span class="small muted">the {data.near.length} species whose habitat climate is nearest this one's: mean day and night, month by month, and rain on a log scale, in calendar order, so a habitat with the same seasons six months out is far, not near. Nothing else counts: not range, not family.</span></p>
      <div class="relstrip">
        {#each data.near as c (c.key)}{@render rel(c)}{/each}
      </div>
    {/if}
    {#if data.siblings.length}
      <p class="relhead"><b>Other <i>{genusName}</i></b> <span class="small muted">{data.siblings.length} in the reference</span></p>
      <div class="relstrip">
        {#each data.siblings.slice(0, 12) as c (c.key)}{@render rel(c)}{/each}
        {#if data.siblings.length > 12}<a class="reltile more" href="/?by=genus&open={genusSlug}"><span>all {data.siblings.length + 1} ›</span></a>{/if}
      </div>
    {/if}
  {/if}

  <h2 class="sec" id="s-registers">Names &amp; registers</h2>
  {#if d.name.synonyms.length}
    <p class="small muted names"><b>Also known as</b> {d.name.synonyms.slice(0, 5).join('; ')}{d.name.synonyms.length > 5 ? ` and ${d.name.synonyms.length - 5} more` : ''}{d.name.synonyms.slice(0, 5).join('; ').endsWith('.') && d.name.synonyms.length <= 5 ? '' : '.'}</p>
  {/if}
  <div class="links">
    {#each Object.entries(d.links) as [k, url]}
      <a href={url} rel="noopener">{k === 'gbif' ? 'GBIF' : k === 'powo' ? 'POWO' : k === 'ipni' ? 'IPNI' : k === 'wfo' ? 'WFO' : k === 'wikidata' ? 'Wikidata' : k === 'wikipedia' ? 'Wikipedia' : k === 'inat' ? 'iNaturalist' : k.toUpperCase()}</a>
    {/each}
  </div>

  <Provenance dossier={d} />
</article>

<style>
  .myph { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 10px; }
  .myph .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: 9px; overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: var(--sh); }
  .myph .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .myph .pd { position: absolute; left: 7px; bottom: 6px; font-family: var(--mono); font-size: 10px; color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: 5px; }
  .species { max-width: 980px; }
  .hero { margin-top: 14px; }
  .glance { margin-top: 0; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; margin: 16px 0 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .fact { padding: 12px 16px; border-right: 1px solid var(--rule); min-width: 0; }
  .fact:last-child { border-right: 0; }
  .fact .lab { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .fact .v { font-size: 14.5px; margin-top: 4px; overflow-wrap: anywhere; }
  @media (max-width: 640px) { .fact { border-right: 0; border-bottom: 1px solid var(--rule); } .fact:last-child { border-bottom: 0; } }
  .unitbtn { text-align: left; border: 0; font: inherit; color: inherit; cursor: pointer; position: relative; }
  .unitbtn:hover { box-shadow: var(--sh2); }
  .unitbtn .swap { position: absolute; top: 12px; right: 14px; font-family: var(--mono); font-size: 10px; color: var(--accent); }
  .relhead { margin: 12px 0 6px; font-size: 14px; }
  .relstrip { display: grid; grid-auto-flow: column; grid-auto-columns: 132px; gap: 10px; overflow-x: auto; padding: 2px 2px 10px; scroll-snap-type: x proximity; }
  .reltile { display: block; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; color: inherit; scroll-snap-align: start; }
  .reltile:hover { text-decoration: none; color: inherit; box-shadow: var(--sh2); }
  .reltile img, .reltile .noim { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sunk); }
  .reltile .rn { display: block; padding: 7px 9px 0; font-family: var(--serif); font-style: italic; font-size: 13.5px; line-height: 1.25; font-weight: 600; }
  .reltile .rf { display: block; padding: 3px 9px 9px; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink3); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reltile.more { display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--accent); }
  .glance .cards { margin: 0 0 12px; }
  .glance .foot a { color: var(--accent); }
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
  .mine { margin-top: 8px; }
  .sumbody .more { font-family: var(--ui); font-size: 13px; white-space: nowrap; }
  .notesline { margin: 2px 0 12px; }
  .figures { margin: 10px 0 0; }
  .figures summary { cursor: pointer; font-size: 12.5px; color: var(--ink2); font-weight: 600; padding: 6px 0; }
  .figures summary:hover { color: var(--accent); }
  .figures table.wx { margin-top: 6px; }
  .mine .accno { margin-right: 2px; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .fields textarea { width: 100%; font: inherit; font-size: 15px; font-family: var(--serif); line-height: 1.55; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); min-height: 96px; }
  .end { display: flex; justify-content: flex-end; gap: 8px; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .acc { margin: 8px 0 0; }
  .acc > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 150px minmax(0, 1fr) 24px; gap: 14px; align-items: center; padding: 13px 17px; font-family: var(--ui); }
  .acc > summary::-webkit-details-marker { display: none; }
  .acc > summary .t { font-weight: 700; font-size: 15px; color: var(--ink); }
  .acc > summary .one { font-size: 13.5px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acc[open] > summary .one { white-space: normal; }
  .acc > summary .pm { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; }
  .acc > summary .pm::after { content: '+'; font-family: var(--mono); font-size: 18px; color: var(--ink3); }
  .acc[open] > summary .pm::after { content: '–'; }
  .acc > summary .pmw { display: none; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .acc[open] > summary .pmw { display: none; }
  .derived { margin: 10px 0 0; }
  .acc > summary:hover .t { color: var(--accent); }
  .acc > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: var(--r); }
  .acc .body { border-top: 1px solid var(--rule); }
  .hintline { margin: 0 0 10px; font-family: var(--ui); }
  @media (max-width: 640px) { .acc > summary { grid-template-columns: minmax(0, 1fr) 64px; } .acc > summary .one { grid-column: 1; } .acc > summary .pm { grid-column: 2; grid-row: 1; } .acc:not([open]) > summary .pmw { display: inline; } }
  .sheet .rowk { font-size: 11px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin: 14px 0 4px; font-family: var(--ui); }
  .sheet .rowk:first-child { margin-top: 0; }
  .sheet p { margin: 0 0 6px; }
  .sheet details.why { margin-top: 10px; }
  .sheet .whyline, .sheet .hintline { margin: 0 0 6px; font-family: var(--ui); }
  .sheet .whyline b { color: var(--ink2); }
  .notecard .body { white-space: normal; }
  .archwhy { margin: 0 0 10px; }
  .names { margin: 0 0 8px; }

  @media (max-width: 640px) { .hero { margin-top: 0; } }
</style>
