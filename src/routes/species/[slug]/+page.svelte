<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import Photos from '$lib/ui/Photos.svelte';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  import Provenance from '$lib/ui/Provenance.svelte';
  import { licenceLabel } from '$core/licence';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { generatedNote } from '$core/note';
  import { cultivationSheet, CARD_ORDER } from '$core/sheet';
  import { collection } from '$lib/db/collection.svelte';
  import { slugify } from '$core/names';
  import { onMount } from 'svelte';
  let { data } = $props();
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
      return { tone: 'warn', text: `No verified native range for this name: WCVP has no entry with native status, and a checklist that only reports presence cannot tell a wild record from a garden one. The map shows ${o.nOpenInRange} openly licensed record${o.nOpenInRange === 1 ? '' : 's'}${all > o.nOpenInRange ? ` of ${all}` : ''} untested against any range; no habitat centre or climate is derived from them, and nothing below is cultivation advice.` };
    }
    if (!o.nOpenInRange && !o.nRestrictedInRange) return { tone: 'muted', text: 'No georeferenced records inside the stated native range.' };
    const all = o.nOpenInRange + o.nRestrictedInRange;
    let t = `The habitat centre and its climate rest on all ${all} georeferenced record${all === 1 ? '' : 's'} inside the native range`;
    if (!o.nOpenInRange) t += `; none carries a licence permitting republication, so the map shows no points.`;
    else if (o.nRestrictedInRange) t += `; the map shows only the ${o.nOpenInRange} openly licensed one${o.nOpenInRange === 1 ? '' : 's'}` + (o.restrictedShiftKm != null ? `, which alone would put the centre ${o.restrictedShiftKm} km away` : '') + '.';
    else t += ', all openly licensed and shown on the map.';
    if (o.nOutsideRange) t += ` ${o.nOutsideRange} record${o.nOutsideRange === 1 ? '' : 's'} outside the range (gardens, roadsides, misidentifications) ignored.`;
    if (o.thin) t += ' Under a dozen records: treat the map and the climate as indicative.';
    return { tone: 'ok', text: t };
  });
  $effect(() => {
    setCrumb([{ label: 'Species', href: '/' }, { label: d.name.scientific }]);
    return () => setCrumb([]);
  });
  // The collection lives in the browser; the page renders on the server. This island lights up after load.
  onMount(() => collection.load());
  const mine = $derived(collection.ready ? collection.accessions.filter((a) => slugify(a.taxonName) === d.slug) : []);
  const growing = $derived(mine.filter((a) => a.status === 'growing'));
  /** Your own photographs of this species, across every plant of it you own. */
  const myPhotos = $derived(mine.flatMap((a) => collection.photos(a.id).map((p) => ({ ...p, plant: a }))).sort((x, y) => y.d.localeCompare(x.d)));
  let lightbox = $state<number | null>(null);
  const myTaxon = $derived(collection.ready ? collection.taxon(d.slug) : undefined);
  let editingMy = $state(false);
  let myDraft = $state('');
  async function saveMy() {
    await collection.put('taxon', d.slug, { name: d.name.scientific, gbifKey: d.key, myNotes: myDraft.trim() || null });
    editingMy = false;
  }
  const sheet = $derived(cultivationSheet({ scientific: d.name.scientific, family: d.name.family, months: d.climate.status === 'ok' ? d.climate.months : null, extremes: d.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, lat: d.centroid?.lat ?? null }));
  const sheetIn = $derived({ scientific: d.name.scientific, family: d.name.family, months: d.climate.status === 'ok' ? d.climate.months : null, extremes: d.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, lat: d.centroid?.lat ?? null });
  /** The grower's hemisphere, from the first place with coordinates, else north. Only the months in the note depend on it. */
  const readerLat = $derived(collection.ready ? (collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null) : null);
  const note = $derived(generatedNote(sheetIn, { readerLat }));
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
      hot: { v: m[hot].tmax, mo: months[hot] }, cold: { v: m[cold].tmin, mo: months[cold] },
      rain, wet: { v: m[wet].precipMm, mo: months[wet] }, dry: { v: m[dry].precipMm, mo: months[dry] }, wetMonths,
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis) } : null,
      ex: d.climate.extremes ?? null
    };
  });
</script>

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
  {#if hero}
    <div class="hero">
      <a href={hero.page ?? hero.url} rel="noopener"><img src={hero.url} alt="{d.name.scientific}{hero.place ? ', ' + hero.place : ''}" loading="eager" fetchpriority="high" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} /></a>
      <a class="cred" href={hero.page ?? hero.url} rel="noopener">{hero.attribution}{hero.captive ? ' · in cultivation' : ' · observed growing wild'}{hero.observedOn ? ' · ' + hero.observedOn : ''}</a>
    </div>
  {:else}
    <div class="hero"><div class="ph">No openly licensed photograph yet. If you grow this plant, add your own photo to your record.</div></div>
  {/if}
  <div class="idcard">
    <div class="who">
      <h1 class="sci"><SpeciesName name={d.name.scientific} authorship={d.name.authorship} /></h1>
      <p class="vern">
        {#if common.length}{common.join(', ') + ' · '}{/if}{d.name.family}{#if d.distribution.native.length}{' · '}{d.distribution.native.slice(0, 3).map((r) => r.name).join(', ')}{d.distribution.native.length > 3 ? ' +' + (d.distribution.native.length - 3) : ''}{/if}
        {#if d.name.status === 'synonym' && d.name.acceptedName}· <span class="pill w">synonym of {d.name.acceptedName}</span>{:else if d.name.status !== 'accepted'}· <span class="pill">{d.name.status}</span>{/if}
      </p>
      <div class="pills">
        {#if d.climate.status === 'ok'}<span class="pill a">Climate known</span>{:else if d.climate.status === 'pending'}<span class="pill">Climate pending</span>{:else if d.climate.status === 'refused'}<span class="pill w">Climate not checked</span>{:else}<span class="pill">No habitat climate</span>{/if}
        {#if d.occurrences.nOpenInRange}<span class="pill c">{d.occurrences.nOpenInRange} open records</span>{/if}
        {#if d.photos.length}<span class="pill">{d.photos.length} photograph{d.photos.length === 1 ? '' : 's'}</span>{/if}
        {#if sheet.arch}<span class="pill" title="Care archetype, inferred from {sheet.arch.why}">{sheet.arch.arch.lab}</span>{/if}
        {#if growing.length}<span class="pill a">you grow {growing.length}</span>{/if}
      </div>
      {#if mine.length}
        <p class="vern mine">Yours: {#each mine as a, i}{#if i}, {/if}<a class="accno" href="/plants/{accNo(a)}">{accNo(a)}</a>{#if a.status !== 'growing'} <span class="small muted">({a.status})</span>{/if}{/each}</p>
      {/if}
    </div>
    <div class="acts">
      <a class="btn pri" href="/plants/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Add one to my plants</a>
      <a class="btn" href="/sowings/new?species={encodeURIComponent(d.name.scientific)}&key={d.key}">Sow seed</a>
    </div>
  </div>

  <nav class="tabs" aria-label="Sections">
    {#if d.summary}<a href="#s-summary">Summary</a>{/if}
    <a href="#s-climate">Climate</a>
    <a href="#s-habitat">Habitat</a>
    <a href="#s-cultivation">Cultivation</a>
    {#if d.photos.length > 1}<a href="#s-photos">Photographs</a>{/if}
    {#if d.literature.length}<a href="#s-research">Papers</a>{/if}
    <a href="#s-registers">Registers</a>
  </nav>

  {#if d.name.synonyms.length}
    <p class="small muted">Also known as {d.name.synonyms.slice(0, 5).join('; ')}{d.name.synonyms.length > 5 ? ` and ${d.name.synonyms.length - 5} more` : ''}.</p>
  {/if}

  {#if d.summary}
    <h2 class="sec" id="s-summary">Summary</h2>
    <div class="sumbody"><p>{d.summary.text}</p></div>
    <p class="small muted">Text from <a href={d.summary.url} rel="noopener">Wikipedia, “{d.summary.title}”</a>, {d.summary.licence}. Kept separate from everything written here.</p>
  {/if}

  <h2 class="sec" id="s-climate">Climate at the habitat centre</h2>
  {#if d.climate.status === 'ok'}
    {#if glance}
      <div class="cards">
        <div class="card"><div class="lab">Warmest</div><div class="val">{glance.hot.v.toFixed(0)}<span class="u">°C</span></div><div class="sub">{glance.hot.mo} days · nights {d.climate.months[months.indexOf(glance.hot.mo)].tmin.toFixed(0)} °C</div></div>
        <div class="card"><div class="lab">Coldest</div><div class="val">{glance.cold.v.toFixed(0)}<span class="u">°C</span></div><div class="sub">{glance.cold.mo} nights{#if glance.ex}{' · '}{glance.ex.frostDaysPerYear < 0.05 ? `no frost in ${glance.ex.years} years` : glance.ex.frostDaysPerYear < 1 ? 'frost rarer than yearly' : `${Math.round(glance.ex.frostDaysPerYear)} frost nights a year`}{/if}</div></div>
        <div class="card"><div class="lab">Rain</div><div class="val">{glance.rain.toFixed(0)}<span class="u">mm/yr</span></div><div class="gauge"><i class="c" style="width:{Math.min(100, glance.rain / 12)}%"></i></div><div class="sub">{glance.wetMonths === 0 ? 'no wet month' : glance.wetMonths + (glance.wetMonths === 1 ? ' wet month' : ' wet months')} · peak {glance.wet.mo} {glance.wet.v.toFixed(0)} mm</div></div>
        {#if glance.dli}<div class="card"><div class="lab">Light</div><div class="val">{glance.dli.lo.toFixed(0)}–{glance.dli.hi.toFixed(0)}<span class="u">DLI</span></div><div class="gauge"><i class="w" style="width:{Math.min(100, glance.dli.hi / 0.7)}%"></i></div><div class="sub">mol/m²/day, winter to summer</div></div>{/if}
      </div>
    {/if}
    <div class="scroll-x">
      <table class="wx">
        <thead><tr><th></th>{#each months as m}<th>{m}</th>{/each}</tr></thead>
        <tbody>
          <tr><td>Day °C</td>{#each d.climate.months as m}<td>{m.tmax.toFixed(1)}</td>{/each}</tr>
          <tr><td>Night °C</td>{#each d.climate.months as m}<td>{m.tmin.toFixed(1)}</td>{/each}</tr>
          <tr><td>Rain mm</td>{#each d.climate.months as m}<td>{m.precipMm.toFixed(0)}</td>{/each}</tr>
          <tr><td>DLI</td>{#each d.climate.months as m}<td>{m.dli?.toFixed(0) ?? '–'}</td>{/each}</tr>
          <tr><td>RH %</td>{#each d.climate.months as m}<td>{m.rh?.toFixed(0) ?? '–'}</td>{/each}</tr>
        </tbody>
      </table>
    </div>
    <p class="small muted">
      {#if d.climate.extremes}Over {d.climate.extremes.years} years: absolute minimum {d.climate.extremes.minAbs.toFixed(1)} °C, 1st-percentile night {d.climate.extremes.minP01.toFixed(1)} °C, 99th-percentile day {d.climate.extremes.maxP99.toFixed(1)} °C. {/if}
      Normals: {d.climate.src.normals}.{#if d.climate.src.extremes} Extremes: {d.climate.src.extremes}.{/if}
    </p>
  {:else if d.climate.status === 'pending'}
    <div class="cult"><div class="none">The climate for this habitat is being prepared. Check back shortly.</div></div>
  {:else if d.climate.status === 'refused'}
    <div class="notice"><b>Not checked.</b> {d.climate.detail ?? 'An upstream source did not answer.'} This is not a statement that no climate exists.</div>
  {:else}
    <div class="cult"><div class="none">No habitat climate can be derived: {d.climate.detail ?? 'no habitat centre'}.</div></div>
  {/if}

  <h2 class="sec" id="s-habitat">Natural habitat</h2>
  <div class="maprow">
    <div class="mapbox">{@html data.worldSvg}<div class="mapcap">Native range as published by WCVP; the marker is the habitat centre used for climate.</div></div>
    <div class="mapbox">{@html data.regionSvg}<div class="mapcap">Openly licensed records inside the range, framed on where they fall.</div></div>
  </div>
  <div class="factgrid">
    <div><b>Native</b>{#if d.distribution.native.length}{d.distribution.native.map((r) => r.name).join(', ')}{#if d.distribution.verified === false}<span class="small muted"> · stated native by a national checklist, not by WCVP: unverified</span>{/if}{:else if d.distribution.reported?.length}<span class="muted">Not verified.</span><span class="small muted"> Reported present (native status not stated): {d.distribution.reported.map((r) => r.name).join(', ')}</span>{:else}{d.upstream['wcvp.distribution']?.status === 'none' ? 'No published distribution for this name.' : 'Distribution source did not answer.'}{/if}{#if d.distribution.introduced.length}<span class="small muted"> · introduced: {d.distribution.introduced.map((r) => r.name).join(', ')}</span>{/if}</div>
    {#if d.centroid}<div><b>Habitat centre</b>{d.centroid.lat}, {d.centroid.lon}<span class="small muted"> · {d.centroid.n} records ({Math.round(d.centroid.share * 100)}% of those in range)</span></div>{/if}
    <div class="wide"><b>Evidence used</b>{evidence.text}</div>
    {#if d.centroid}<div><b>How the centre was chosen</b>{d.centroid.how}</div>{/if}
    {#if d.distribution.native.length && !d.distribution.boxes.length}<div><b>Range source</b>{d.distribution.source}: country level only, so records are not tested against it.</div>{/if}
  </div>

  <h2 class="sec" id="s-cultivation">Cultivation</h2>
  <div class="note-slot" data-key={d.key}>
    <div class="cult">
      <div class="sum">Your notes <span class="hint">yours alone, on this device; shown on every plant of this species you own</span></div>
      {#if editingMy}
        <div class="fields"><textarea id="my-notes" rows="4" bind:value={myDraft}></textarea><div class="end"><button class="btn" onclick={() => (editingMy = false)}>Cancel</button><button class="btn pri" onclick={saveMy}>Save</button></div></div>
      {:else if myTaxon?.myNotes}
        <div class="body">{myTaxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => { myDraft = myTaxon?.myNotes ?? ''; editingMy = true; }}>Edit</button></div>
      {:else if collection.ready}
        <div class="none">Nothing yet. <button class="linkish" onclick={() => { myDraft = ''; editingMy = true; }}>Write what you know</button>: the pot it sulked in, the window it hated, the year it flowered.</div>
      {:else}
        <div class="none">Your own notes for this species go here.</div>
      {/if}
    </div>
    {#if sheet.year && sheet.year.grow !== 'even'}
      <p class="small muted" style="margin: 4px 0 12px">{sheet.year.fog ? 'Growing months read from the temperature curve (too little rain for a rainy season)' : sheet.year.grow === 'winter' ? 'A winter grower by the rainfall curve' : 'A summer grower by the rainfall curve'}{sheet.year.south ? ' (southern hemisphere)' : ''}. {#if sheet.arch}Treated as a {sheet.arch.arch.lab.toLowerCase()}, inferred from {sheet.arch.why}.{/if}</p>
    {:else if sheet.arch}
      <p class="small muted" style="margin: 4px 0 12px">Treated as a {sheet.arch.arch.lab.toLowerCase()}, inferred from {sheet.arch.why}.</p>
    {/if}
    {#each sheetCards as c}
      <div class="cult">
        <div class="sum">{c.title} <span class="hint">{c.rows.some((r) => r.hab) ? 'from this species’ habitat figures' : `conventional for a ${sheet.arch?.arch.lab.toLowerCase() ?? 'plant of this kind'}`}</span></div>
        <div class="body sheet">
          {#each c.rows as r}
            {#if c.rows.length > 1}<h4>{r.k}</h4>{/if}
            <p>{r.s}</p>
            <p class="why">{r.why}</p>
          {/each}
        </div>
      </div>
    {/each}
    {#if !sheetCards.length}
      <div class="cult"><div class="none">Nothing can be derived yet: no habitat climate for this species and no care archetype for its genus or family.</div></div>
    {/if}
    {#if d.note}
      <div class="cult"><div class="sum">Written from the climate above <span class="hint">generated · not verified by a person</span></div><div class="body">{d.note.text}</div><div class="foot">Written by a language model from the evidence on this page, {d.note.built.slice(0, 10)}. <a href="/about/how#notes">How these are made</a>.</div></div>
    {:else if note}
      <div class="cult" id="gen-note"><div class="sum">In short <span class="hint">condensed by rule from the cards above · not written by a person</span></div><div class="body">{note.text}</div><div class="foot">Each sentence is one card's own one-line form, written by the same rule as the card ({note.from.join(', ')}); the note cannot say what a card does not. {#if note.hab}Months are given for {readerLat != null && readerLat < 0 ? 'the southern' : 'the northern'} hemisphere{readerLat == null ? ' (set coordinates on a bench to change this)' : ', from your benches'}.{/if}</div></div>
    {/if}
  </div>

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
  {#if lightbox != null && myPhotos.length}
    <Lightbox photos={myPhotos} bind:index={lightbox} acc={myPhotos[lightbox]?.plant.id ?? null} onclose={() => (lightbox = null)} />
  {/if}

  {#if d.literature.length}
    <h2 class="sec" id="s-research">Papers naming this species</h2>
    <p class="small muted" style="margin: 0 0 8px">Works whose title or abstract names <i>{d.name.scientific}</i>, most cited first, from OpenAlex (CC0). A mention, not a cultivation source: nothing on this page is drawn from them.</p>
    {#each d.literature as p}
      <div class="paper"><a href={p.url} rel="noopener">{p.title}</a><div class="meta">{p.authors?.join(', ')}{p.year ? ` (${p.year})` : ''}{p.venue ? ` · ${p.venue}` : ''}</div></div>
    {/each}
  {/if}

  <h2 class="sec" id="s-registers">History &amp; registers</h2>
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
  .muted { color: var(--ink3); }
  .factgrid .wide { grid-column: 1 / -1; }
  .sheet { white-space: normal; }
  .mine { margin-top: 8px; }
  .mine .accno { margin-right: 2px; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .fields textarea { width: 100%; font: inherit; font-size: 15px; font-family: var(--serif); line-height: 1.55; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); min-height: 96px; }
  .end { display: flex; justify-content: flex-end; gap: 8px; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .sheet h4 { font-size: 11px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin: 14px 0 4px; font-family: var(--ui); }
  .sheet h4:first-child { margin-top: 0; }
  .sheet p { margin: 0 0 6px; }
  .sheet .why { font-family: var(--ui); font-size: 12px; color: var(--ink3); line-height: 1.5; margin-bottom: 10px; }
  .sheet .why:last-child { margin-bottom: 0; }
  @media (max-width: 640px) { .hero { margin-top: 0; } }
</style>
