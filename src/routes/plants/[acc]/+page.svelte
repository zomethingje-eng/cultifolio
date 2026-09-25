<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { localDate, daysBetween } from '$core/dates';
  import { temp, tempN, rain, deltaT } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import type { Provenance } from '$lib/db/types';
  import { slugify, speciesOf } from '$core/names';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { bySlug } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import type { Dossier } from '$dossier/schema';
  import { cultivationSheet, runs, forReader } from '$core/sheet';
  import { EVENT_LABEL, MEASURES, PROP_METHODS, kindOf, type EventType, type Photo } from '$lib/db/types';
  import { parents } from '$core/names';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import PhotoAdd from '$lib/ui/PhotoAdd.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  onMount(() => { site.load(); collection.load(); });
  /** The URL carries the number people know (or an identity, from a printed code); everything below works on the record's identity. */
  const u = $derived(units.current);
  const param = $derived(page.params.acc!);
  const a = $derived(collection.accession(param));
  const id = $derived(a?.id ?? param);
  const events = $derived(collection.events(id));
  /* ---- photos ---- */
  const photos = $derived(collection.photos(id));
  const cover = $derived(collection.cover(id));
  let lightbox = $state<number | null>(null);
  let adding = $state(false);
  let thumbFailed = $state(false);
  let confirmRemove = $state(false);
  /** The log entry whose × was pressed once; a second press removes it. */
  let confirmEvent = $state<string | null>(null);
  const openPhoto = (ph: Photo) => (lightbox = Math.max(0, photos.findIndex((x) => x.id === ph.id)));
  /** Events and photos on one timeline, newest first. */
  const timeline = $derived(
    [...events.map((e) => ({ k: 'e' as const, d: e.d, id: e.id, e })), ...photos.map((ph) => ({ k: 'p' as const, d: ph.d, id: ph.id, ph }))].sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id))
  );
  const taxon = $derived(a ? collection.taxon(slugify(a.taxonName)) : undefined);
  const sowing = $derived(a?.sowingId ? collection.sowing(a.sowingId) : undefined);
  let idx = $state<IndexEntry | undefined>(undefined);
  let dossier = $state<Dossier | null>(null);
  /** What the reference said about this plant's species: still being asked, could not be reached (a different fact from absent), not there, or read. */
  let ref = $state<'loading' | 'unreachable' | 'none' | 'ok'>('loading');
  const kind = $derived(a ? kindOf(a) : 'species');
  /** A hybrid's parents, each with a species page when the corpus has one. */
  let parentLinks = $state<Array<{ name: string; slug: string | null }>>([]);
  $effect(() => {
    if (a) setCrumb([{ label: 'My plants', href: '/plants' }, { label: `${accNo(a)} · ${a.taxonName}${a.cultivar ? ` ‘${a.cultivar}’` : ''}` }]);
    return () => setCrumb([]);
  });
  /** The species behind the plant, fetched again whenever the name or key changes (an edit), and a late answer for a name no longer on the record is dropped. */
  let asked = 0;
  const fetchDossier = (key: number | string): Promise<Dossier | 'none' | null> => fetch(`/api/dossier/${key}`).then((r): Promise<Dossier | 'none' | null> => (r.ok ? (r.json() as Promise<Dossier>) : Promise.resolve(r.status === 404 ? 'none' : null))).catch(() => null);
  $effect(() => {
    if (!a) return;
    // A name below species (a subspecies, a variety) belongs to its species' page; the record keeps the full name.
    const slug = slugify(speciesOf(a.taxonName)), key = a.taxonKey, parentage = a.parentage;
    const seq = ++asked;
    idx = undefined; dossier = null; ref = 'loading';
    (async () => {
      // The record carries its species' key, so one small file is asked for, not the whole index: the file the offline worker keeps.
      let d: Dossier | null | 'none' = key && speciesOf(a.taxonName) === a.taxonName ? await fetchDossier(key) : 'none';
      if (seq !== asked) return;
      if (d === 'none' || d === null) {
        const e = await bySlug(slug);
        if (seq !== asked) return;
        idx = e ?? undefined;
        if (e) d = await fetchDossier(e.key);
        else if (e === null && d === 'none') d = null; // the key led nowhere and the index could not be reached: unknown, not absent
        if (seq !== asked) return;
      }
      dossier = d === 'none' ? null : d;
      ref = d === 'none' ? 'none' : d ? 'ok' : 'unreachable';
    })();
    Promise.all(parents(parentage).map(async (name) => ({ name, slug: (await bySlug(slugify(name))) ? slugify(name) : null }))).then((r) => { if (seq === asked) parentLinks = r; });
  });
  /** A photograph of the species for the plant without one of its own: the index's thumb when the index was read, else the dossier's own first wild photograph. */
  const speciesThumb = $derived(idx?.thumb ?? (dossier?.photos.find((p) => !p.captive) ?? dossier?.photos[0])?.thumb);
  // Habitat versus here: the species' habitat figures, median with the 10th–90th span across the envelope cells, beside the bench's.
  const habitat = $derived.by(() => {
    if (!dossier || dossier.climate.status !== 'ok') return null;
    const c = dossier.climate;
    const m = c.months;
    const dli = (y: typeof m) => y.map((x) => x.dli).filter((x): x is number => x != null);
    const dlis = dli(m), dli10 = dli(c.p10), dli90 = dli(c.p90);
    const ex = c.extremes ?? null;
    const coldI = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const sheet = cultivationSheet({ scientific: dossier.name.scientific, family: dossier.name.family, months: m, p10: c.p10, p90: c.p90, extremes: ex, lat: dossier.centroid?.lat ?? c.at.lat, units: u });
    return {
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis), lo10: dli10.length ? Math.min(...dli10) : null, hi90: dli90.length ? Math.max(...dli90) : null } : null,
      night: { v: m[coldI].tmin, mo: coldI + 1, lo: c.p10[coldI].tmin, hi: c.p90[coldI].tmin },
      ex,
      year: sheet.year,
      cells: c.cells
    };
  });
  const cond = $derived(a?.locationId ? collection.conditions(a.locationId) : null);
  const hereDli = $derived(cond?.ppfd != null ? (cond.ppfd * (cond.lightHours ?? 12) * 3600) / 1e6 : null);
  const r0 = (x: number) => x.toFixed(0);
  // Side by side, no verdict: a regional radiation figure and a climate percentile are facts about the
  // places the species is recorded, not measured tolerances of this plant. The comparison is shown; the judgement is the grower's.
  const lightCompare = $derived.by(() => {
    if (!habitat?.dli) return null;
    const d = habitat.dli;
    const sky = `open sky over the habitat ${r0(d.lo)}–${r0(d.hi)} mol/m²/day across the year (median year${d.lo10 != null && d.hi90 != null ? `; across the ${habitat.cells} envelope cells ${r0(d.lo10)} to ${r0(d.hi90)}` : ''}; CHELSA)`;
    if (hereDli == null) return { here: null, text: `${sky}; no light figure for this place` };
    return { here: hereDli, text: `${r0(hereDli)} mol/m²/day here, from this place's settings; ${sky}` };
  });
  const coldCompare = $derived.by(() => {
    if (!habitat) return null;
    const n = habitat.night;
    const night = `coldest month's mean night at the habitat ${temp(n.v, u, 1)} in ${MONTHS[n.mo - 1]} (median year; across the ${habitat.cells} envelope cells ${tempN(n.lo, u)} to ${tempN(n.hi, u)}; CHELSA)`;
    const p01 = habitat.ex ? `; 1st-percentile night over ${habitat.ex.years} years at the typical cell ${temp(habitat.ex.minP01, u, 1)} (NASA POWER)` : '';
    if (cond?.floorC == null) return { here: null, text: `${night}${p01}; no floor set for this place` };
    return { here: cond.floorC, text: `this place is set to bottom out at ${temp(cond.floorC, u)}; ${night}${p01}` };
  });
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The habitat rain season as a figure: the rain rule's reading in habitat months and shifted to this place's hemisphere. No verdict.
  const season = $derived.by(() => {
    if (!habitat?.year) return null;
    const y = habitat.year;
    // This place's coordinates, else the site set in Settings, else the north with a note: the same order as the species page.
    const hereLat = cond?.lat ?? site.current?.lat ?? null;
    const southHere = (hereLat ?? 40) < 0;
    const here = runs(forReader(y, hereLat ?? 40), 'short');
    const home = `${runs(y.growMonths, 'short')} (${y.south ? 'S' : 'N'})`;
    const shift = `shifted to ${cond?.lat != null ? 'this place' : hereLat != null ? 'your site' : 'the north'}${hereLat == null ? ' (no site set)' : ''}: ${here}`;
    if (y.none) return { label: 'No season to read', note: `${rain(y.annualMm, u)} a year and a flat temperature curve (${deltaT(y.rangeT, u)} of range): no rainy season and no cooler half (CHELSA).` };
    const same = !y.shiftable ? 'not shifted: no thermal season to reverse' : southHere === y.south ? 'the same here' : shift;
    if (y.fog) return { label: 'No rainy season to read', note: `${rain(y.annualMm, u)} a year; the temperature rule's cooler six months ${home}, ${same} (CHELSA).` };
    if (y.spread) return { label: 'Rain spread, no season', note: `70% of the rain takes ${y.growMonths.length} months, ${home} (CHELSA).` };
    if (y.flat) return { label: `Rain ${home}, flat temperature`, note: `a sharp rainy season, but the temperature curve moves ${deltaT(y.rangeT, u)}, so no growing season is inferred; ${same} (CHELSA).` };
    if (y.grow === 'even') return { label: `Rain ${home}, neither winter nor summer`, note: `the wet season sits at the year's mean temperature; ${same} (rain rule, CHELSA).` };
    return { label: `${y.grow === 'winter' ? 'Winter' : 'Summer'} rain ${home}`, note: `${same} (rain rule, CHELSA).` };
  });
  /* ---- move ---- */
  let moving = $state(false);
  let moveTo = $state<string | null>(null);
  async function doMove() {
    if (!a || (moveTo ?? null) === (a.locationId ?? null)) { moving = false; return; }
    await collection.put('accession', id, { locationId: moveTo ?? null, location: moveTo ? null : a.location ?? null });
    if (moveTo) await collection.addEvent({ acc: id, d: localDate(), t: 'move', note: `to ${collection.locationName(moveTo)}` });
    moving = false;
  }
  const daysAgo = (d: string | null | undefined) => (d ? daysBetween(d) : null);
  const lastOf = (t: string) => events.find((e) => e.t === t)?.d ?? null;
  const sinceWater = $derived(daysAgo(lastOf('water')));
  const seen = $derived(daysAgo(collection.lastSeen(id)));
  const lastMeasure = $derived(events.find((e) => e.t === 'measure' && e.measures));
  const firstMeasure = $derived([...events].reverse().find((e) => e.t === 'measure' && e.measures));
  const sizeKey = $derived(lastMeasure ? (['diam', 'h', 'caudex', 'spread', 'heads', 'leaves'].find((k) => lastMeasure.measures?.[k] != null) ?? null) : null);
  const growth = $derived(sizeKey && lastMeasure && firstMeasure && firstMeasure !== lastMeasure && firstMeasure.measures?.[sizeKey] != null ? lastMeasure.measures![sizeKey] - firstMeasure.measures![sizeKey] : null);
  let moreActs = $state(false);
  const fmtDate = (d: string | null | undefined) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  // What a new plant's page is missing: a place, a photograph, a first measurement. Each line goes when it is done; the card goes when two of three are.
  const setup = $derived.by(() => {
    if (!a || a.status !== 'growing') return [];
    const rows: { k: string; n: string; t: string; w: string; go: () => void }[] = [];
    if (!a.locationId) rows.push({ k: 'place', n: '1', t: 'Give it a place', w: 'the bench or room it lives on; conditions and the frost watch follow', go: () => { moveTo = null; moving = true; } });
    if (!photos.length) rows.push({ k: 'photo', n: '2', t: 'Add a photograph', w: 'the page and the labels use it', go: () => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); } });
    if (!lastMeasure) rows.push({ k: 'measure', n: '3', t: 'Measure it', w: 'growth is read from the first measurement on', go: () => { moreActs = true; quick('measure'); } });
    return rows.length >= 2 ? rows : [];
  });
  const provLabel = (p: string | null | undefined) => (p === 'wild' ? 'wild-collected' : p === 'f1' ? 'F1, raised from wild-collected seed' : p === 'fn' ? 'cultivated seed (Fn)' : p === 'veg' ? 'vegetative' : 'provenance not stated');
  let logOpen = $state(false);
  function quick(t: EventType) {
    et = t;
    logOpen = true;
    // The first thing to fill: a measurement's first figure, a treatment's product, else the note.
    setTimeout(() => (document.querySelector<HTMLElement>(t === 'measure' ? '.measures input' : t === 'treat' || t === 'feed' ? '#ev-used' : '#ev-note') ?? document.getElementById('ev-note'))?.focus(), 0);
  }
  /** After a record or a cancel, focus returns to the verb bar and the log line is announced, so a keyboard user is not dropped on the page body. */
  function closeLog(recorded?: string) {
    logOpen = false;
    if (recorded) toast.show(recorded);
    setTimeout(() => document.querySelector<HTMLElement>('.quickbar button')?.focus(), 0);
  }
  const propagations = $derived(collection.propagationsOf(id));

  let et = $state<EventType>('water');
  let ed = $state(localDate());
  let enote = $state('');
  let eused = $state('');
  let ecause = $state('');
  let measures = $state<Record<string, string>>({});
  let editingNotes = $state(false);
  let notesDraft = $state('');
  let myNotesDraft = $state('');
  let editingMy = $state(false);

  /* ---- edit the record ---- */
  let editing = $state(false);
  /** The species' key while editing: kept when the name is untouched, cleared by typing, set again by picking a suggestion. */
  let edKey = $state<number | null>(null);
  let f = $state({ taxonName: '', cultivar: '', nameKind: 'species' as 'species' | 'cultivar' | 'hybrid', parentage: '', nameAsReceived: '', fieldNumber: '', provenance: 'unknown' as Provenance, acquired: '', sourceFrom: '', sourceForm: '', price: '', locationId: null as string | null });
  function startEdit() {
    if (!a) return;
    edKey = a.taxonKey ?? null;
    f = { taxonName: a.taxonName, cultivar: a.cultivar ?? '', nameKind: kindOf(a), parentage: a.parentage ?? '', nameAsReceived: a.nameAsReceived ?? '', fieldNumber: a.fieldNumber ?? '', provenance: a.provenance ?? 'unknown', acquired: a.acquired ?? '', sourceFrom: a.sourceFrom ?? '', sourceForm: a.sourceForm ?? '', price: a.price ?? '', locationId: a.locationId ?? null };
    editing = true;
  }
  async function saveEdit() {
    if (!a) return;
    const moved = (f.locationId ?? null) !== (a.locationId ?? null);
    await collection.put('accession', id, { taxonName: f.taxonName.trim() || a.taxonName, taxonKey: f.taxonName.trim() ? edKey : (a.taxonKey ?? null), cultivar: f.cultivar.trim() || null, nameKind: f.nameKind, parentage: f.nameKind === 'hybrid' ? f.parentage.trim() || null : null, nameAsReceived: f.nameAsReceived.trim() || null, fieldNumber: f.fieldNumber.trim() || null, provenance: f.provenance, acquired: f.acquired || null, sourceFrom: f.sourceFrom.trim() || null, sourceForm: f.sourceForm.trim() || null, price: f.price.trim() || null, locationId: f.locationId ?? null, location: f.locationId ? null : a.location ?? null });
    if (moved && f.locationId) await collection.addEvent({ acc: id, d: localDate(), t: 'move', note: `to ${collection.locationName(f.locationId)}` });
    // The log's "Acquired" line is the same fact as the card's date and source: it follows an edit rather than keeping the old one.
    const acq = events.find((e) => e.t === 'acquire');
    const newDate = f.acquired || null, newNote = f.sourceFrom.trim() ? `from ${f.sourceFrom.trim()}` : null;
    if (acq && newDate && (acq.d !== newDate || (acq.note ?? null) !== newNote)) await collection.put('event', acq.id, { d: newDate, note: newNote });
    editing = false;
  }

  async function addEvent(e: SubmitEvent) {
    e.preventDefault();
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(measures)) if (v !== '' && !Number.isNaN(Number(v))) m[k] = Number(v);
    await collection.addEvent({ acc: id, d: ed, t: et, note: enote.trim() || null, used: et === 'treat' || et === 'feed' ? eused.trim() || null : null, cause: et === 'death' ? ecause.trim() || null : null, measures: Object.keys(m).length ? m : null, followUp: et === 'treat' ? 10 : null });
    if (et === 'death') await collection.put('accession', id, { status: 'dead' });
    enote = '';
    eused = '';
    ecause = '';
    measures = {};
  }
  async function setStatus(s: 'growing' | 'archived' | 'dead') {
    await collection.put('accession', id, { status: s });
  }
  async function saveNotes() {
    await collection.put('accession', id, { notes: notesDraft.trim() || null });
    editingNotes = false;
  }
  async function saveMyNotes() {
    if (!a) return;
    await collection.put('taxon', slugify(a.taxonName), { name: a.taxonName, gbifKey: a.taxonKey ?? null, myNotes: myNotesDraft.trim() || null });
    editingMy = false;
  }
  async function remove() {
    await collection.remove('accession', id);
    goto('/plants');
  }
</script>

<svelte:head><title>{a ? `${accNo(a)} ${a.taxonName}` : param} — Cultifolio</title></svelte:head>

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if !collection.ready}
  <!-- The page's shape before the vault opens: the same head, hero and card heights, so nothing jumps when the record arrives. -->
  <div class="skel" aria-busy="true"><h1 class="q" style="margin-top: 24px">{param}</h1><p class="muted">Opening your collection…</p><div class="hero skelbox"></div><div class="idcard skelcard"></div></div>
{:else if !a}
  <h1 class="q" style="margin-top: 24px">{param}</h1>
  <p class="muted">{collection.isNumberTaken(param) ? `${param} was given to a plant since removed; the number stays reserved and its record stays in the change log and in any backup taken before.` : 'No plant with this number on this device.'}</p>
{:else}
  <div class="hero" class:own={!!cover}>
    {#if cover}
      <button class="heroimg" type="button" onclick={() => openPhoto(cover)} aria-label="Open photograph">{#key cover.id}<PhotoImg id={cover.id} size="full" alt="{a.taxonName}, {cover.d}" />{/key}</button>
      <span class="cred">{cover.caption ? cover.caption + ' · ' : ''}{cover.d}{photos.length > 1 ? ` · ${plural(photos.length, 'photo')}` : ''}</span>
    {:else if speciesThumb && !thumbFailed}
      <img src={speciesThumb} alt={a.taxonName} class="spthumb" onerror={() => (thumbFailed = true)} /><button class="cred" type="button" onclick={() => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>species photograph · add your own</button>
    {:else if speciesThumb}
      <div class="ph"><span class="phcap empty">No photograph yet.</span><PhotoAdd acc={id} id="hero-photo" compact /></div>
    {:else}
      <div class="ph"><PhotoAdd acc={id} id="hero-photo" compact /></div>
    {/if}
  </div>
  <div class="idcard">
    <div class="who">
      <h1 class="sci"><span class="accno big lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}<span style="font-style: normal">‘{a.cultivar}’</span>{/if}</h1>
      <p class="vern">
        {#if a.nameAsReceived}received as <i>{a.nameAsReceived}</i> · {/if}
        {#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span> · {/if}
        {#if a.provenance === 'unknown' && !a.sourceFrom && !a.fieldNumber}Added {fmtDate(a.acquired)}{:else}{provLabel(a.provenance)}{#if a.acquired}{' · '}{a.sourceForm ?? 'acquired'}{a.sourceFrom ? ` from ${a.sourceFrom}` : ''}{' '}{fmtDate(a.acquired)}{/if}{/if}
        {#if a.sowingId}{' · '}raised from <a class="mono" href="/sowings/{a.sowingId}">{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing && sowing.parentAcc} (from <a class="mono" href="/plants/{sowing.parentAcc}">{collection.accession(sowing.parentAcc) ? accNo(collection.accession(sowing.parentAcc)!) : sowing.parentAcc}</a>){/if}{/if}
      </p>
      {#if kind === 'hybrid'}
        <p class="vern parentage">{#if parentLinks.length}{#each parentLinks as pl, i}{#if i}{' × '}{/if}{#if pl.slug}<a href="/species/{pl.slug}"><SpeciesName name={pl.name} /></a>{:else}<SpeciesName name={pl.name} />{/if}{/each}{:else}A hybrid; parentage not stated. <button class="linkish" type="button" onclick={startEdit}>Add it</button> if you know it.{/if}</p>
      {/if}
      <div class="pills">
        <span class="pill {a.status === 'growing' ? 'a' : a.status === 'dead' ? 'b' : ''}">{a.status}</span>
        {#if kind === 'hybrid'}<span class="pill c">hybrid</span>{:else if kind === 'cultivar'}<span class="pill c">cultivar</span>{/if}
        {#if a.locationId}<a class="pill" href="/benches/{a.locationId}">{collection.locationName(a.locationId)}</a>{:else if a.location}<span class="pill">{a.location}</span>{/if}
        {#if sinceWater != null && sinceWater > 21 && a.status === 'growing'}<span class="pill w">not watered for {sinceWater} d</span>{/if}
      </div>
    </div>
    <div class="acts">
      {#if kind !== 'hybrid' && ref === 'ok'}<a class="btn" href="/species/{slugify(speciesOf(a.taxonName))}">Species page</a>{/if}
      <button class="btn" onclick={startEdit}>Edit</button>
      <a class="btn" href="/labels?acc={a.id}">Label</a>
      {#if a.status === 'growing'}<a class="btn" href="/sowings/new?parent={a.id}">Propagate</a>{/if}
    </div>
  </div>

  {#if editing}
    <form class="cult editform" onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
      <label><span>Species</span><SpeciesPicker bind:value={f.taxonName} bind:taxonKey={edKey} id="ed-name" /></label>
      <label><span>Cultivar</span><input id="ed-cv" type="text" bind:value={f.cultivar} /></label>
      <label><span>What it is</span><select id="ed-kind" bind:value={f.nameKind}><option value="species">A species</option><option value="cultivar">A cultivar of that species</option><option value="hybrid">A hybrid (filed under the genus)</option></select></label>
      {#if f.nameKind === 'hybrid'}<label><span>Parentage</span><input id="ed-parentage" type="text" bind:value={f.parentage} placeholder="Seed parent × pollen parent" /></label>{/if}
      <label><span>Name as received</span><input id="ed-recv" type="text" bind:value={f.nameAsReceived} /></label>
      <label><span>Field number</span><input id="ed-fn" type="text" bind:value={f.fieldNumber} /></label>
      <label><span>Provenance</span><select id="ed-prov" bind:value={f.provenance}><option value="unknown">Not stated</option><option value="wild">Wild-collected</option><option value="f1">F1: raised from wild-collected seed</option><option value="fn">Cultivated seed (Fn)</option><option value="veg">Vegetative</option></select></label>
      <label><span>Acquired</span><input id="ed-date" type="date" bind:value={f.acquired} /></label>
      <label><span>From</span><input id="ed-from" type="text" bind:value={f.sourceFrom} /></label>
      <label><span>Form</span><input id="ed-form" type="text" bind:value={f.sourceForm} placeholder="plant, seedling, seed, cutting" /></label>
      <label><span>Price</span><input id="ed-price" type="text" bind:value={f.price} /></label>
      <div class="wide"><span class="lbl">Place</span><LocationPicker bind:value={f.locationId} id="ed-loc" label="Place" /></div>
      <div class="actions wide"><button class="btn" type="button" onclick={() => (editing = false)}>Cancel</button><button class="btn pri" type="submit">Save</button></div>
    </form>
  {/if}

  <!-- The four verbs a grower uses most, then the rest on request: a new plant's page is not the tracker's whole vocabulary. -->
  <div class="quickbar">
    <button class="btn pri" onclick={() => quick('water')}>Water</button>
    <button class="btn" onclick={() => { adding = !adding; if (adding) setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>Photo</button>
    <button class="btn" onclick={() => quick('note')}>Note</button>
    <button class="btn" onclick={() => { moveTo = a.locationId ?? null; moving = !moving; }}>Move</button>
    {#if moreActs}
      <button class="btn" onclick={() => quick('feed')}>Feed</button>
      <button class="btn" onclick={() => quick('repot')}>Repot</button>
      <button class="btn" onclick={() => quick('measure')}>Measure</button>
      <button class="btn" onclick={() => quick('treat')}>Treat</button>
      <button class="btn" onclick={() => quick('flower')}>Flower</button>
      {#if a.status === 'growing'}<button class="btn" onclick={() => setStatus('archived')}>Archive</button>{:else}<button class="btn" onclick={() => setStatus('growing')}>Mark growing</button>{/if}
    {:else}
      <button class="btn more" type="button" aria-expanded="false" onclick={() => { moreActs = true; setTimeout(() => document.querySelector<HTMLElement>('.quickbar button:nth-of-type(5)')?.focus(), 0); }}>More ▾</button>
    {/if}
  </div>

  {#if moving}
    <div class="cult evform">
      <div class="sum">Move to <span class="hint">records a move on the timeline</span></div>
      <div class="fields"><LocationPicker bind:value={moveTo} id="mv-loc" label="Move to" /><div class="actions"><button class="btn" type="button" onclick={() => (moving = false)}>Cancel</button><button class="btn pri" type="button" onclick={doMove}>Move</button></div></div>
    </div>
  {/if}

  {#if logOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="cult evform" onsubmit={async (e) => { e.preventDefault(); const label = EVENT_LABEL[et]; try { await addEvent(e); } catch { return; } closeLog(`${label} recorded`); }} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeLog(); } }}>
      <div class="sum">Record: {EVENT_LABEL[et]} <span class="hint">goes on the timeline below</span></div>
      <div class="fields">
        <div class="row">
          <select id="ev-type" bind:value={et} aria-label="What to record">
            {#each Object.entries(EVENT_LABEL).filter(([k]) => !['audit', 'germinate', 'potup', 'loss', 'propagate', 'acquire'].includes(k)) as [k, label]}<option value={k}>{label}</option>{/each}
          </select>
          <input id="ev-date" type="date" aria-label="Date" bind:value={ed} />
        </div>
        {#if et === 'treat' || et === 'feed'}<input id="ev-used" type="text" aria-label="What was used" bind:value={eused} placeholder={et === 'treat' ? 'Product and rate, e.g. Safari 20SG drench' : 'Feed, e.g. Grow More 17-8-22 ¼ tsp/gal'} />{/if}
        {#if et === 'death'}<input id="ev-cause" type="text" aria-label="Cause" bind:value={ecause} placeholder="Cause, if known" />{/if}
        {#if et === 'measure'}
          <div class="measures">
            {#each MEASURES as m}
              <label><span class="lab">{m.label}{m.unit ? ` (${m.unit})` : ''}</span><input type="number" step="any" bind:value={measures[m.k]} /></label>
            {/each}
          </div>
        {/if}
        <input id="ev-note" type="text" aria-label="Note" bind:value={enote} placeholder="Note (optional)" />
        <div class="actions"><button class="btn" type="button" onclick={() => closeLog()}>Cancel</button><button class="btn pri" type="submit">Record</button></div>
      </div>
    </form>
  {/if}

  {#if setup.length}
    <div class="cult setup">
      <div class="sum">Set it up <span class="hint">what makes this page useful</span></div>
      <div class="setupbody">
        {#each setup as st, i (st.k)}<button class="setuprow" type="button" onclick={st.go}><span class="n">{i + 1}</span><span class="t">{st.t}</span><span class="w">{st.w}</span></button>{/each}
      </div>
    </div>
  {/if}

  <div class="cards">
    {#if lastOf('water')}<div class="card"><div class="lab">Since watered</div><div class="val">{sinceWater == null ? '–' : sinceWater}<span class="u">{sinceWater == null ? '' : ' d'}</span></div><div class="sub">last {lastOf('water')}</div></div>{/if}
    {#if events.some((e) => e.t === 'audit')}<div class="card"><div class="lab">Last seen</div><div class="val">{seen == null ? '–' : seen}<span class="u">{seen == null ? '' : ' d'}</span></div><div class="sub">audit, {collection.lastSeen(id)}</div></div>{/if}
    {#if lastMeasure}<div class="card"><div class="lab">{sizeKey ? (MEASURES.find((m) => m.k === sizeKey)?.label ?? 'Size') : 'Size'}</div><div class="val">{sizeKey && lastMeasure ? lastMeasure.measures![sizeKey] : '–'}<span class="u">{sizeKey ? ' ' + (MEASURES.find((m) => m.k === sizeKey)?.unit ?? '') : ''}</span></div>{#if growth != null}<div class="gauge"><i style="width: {Math.min(100, Math.max(8, (growth / Math.max(1, lastMeasure!.measures![sizeKey!])) * 100))}%"></i></div>{/if}<div class="sub">{growth != null ? `${growth >= 0 ? '+' : ''}${growth} since ${firstMeasure!.d}` : `measured ${lastMeasure.d}`}</div></div>{/if}
    <div class="card"><div class="lab">Habitat rain season</div><div class="val" style="font-family: var(--ui); font-size: 17px; font-weight: 700">{season ? season.label : dossier?.climate.status === 'refused' ? 'Climate not checked' : dossier?.climate.status === 'pending' ? 'Climate pending' : dossier ? 'No habitat climate' : ref === 'unreachable' ? 'Reference not reached' : ref === 'none' ? (kind === 'hybrid' ? 'A hybrid' : 'No species page') : '…'}</div><div class="sub">{#if season}{season.note} <a href="/species/{slugify(a.taxonName)}#s-cultivation">The sheet</a>.{:else if dossier?.climate.status === 'refused'}A source did not answer when the species page was built{dossier.climate.detail ? `: ${dossier.climate.detail}` : ''}. Not a statement that no climate exists.{:else if dossier?.climate.status === 'pending'}The habitat climate for this species has not been derived yet.{:else if dossier}Nothing to read a season from{dossier.climate.status === 'none' && dossier.climate.detail ? `: ${dossier.climate.detail}` : ''}.{:else if ref === 'unreachable'}The species reference could not be reached from here; nothing is known either way.{:else if ref === 'none'}{kind === 'hybrid' ? (parentLinks.some((p) => p.slug) ? 'No habitat of its own; its parents have species pages.' : 'No habitat of its own.') : 'Not in the reference.'}{:else}reading the species dossier{/if}</div></div>
  </div>

  {#if habitat && a.locationId}
    <div class="secrule"><h2>Habitat versus here</h2><div class="line"></div><span class="n">{collection.locationName(a.locationId)}</span></div>
    <div class="factgrid hvh">
      {#if lightCompare}<div><b>Light</b>{lightCompare.text}.{#if lightCompare.here == null}{#if a.locationId}{' '}<a href="/benches/{a.locationId}?edit=1">Set its light</a>.{:else}{' '}<button type="button" class="linkish" onclick={() => (moving = true)}>Give it a place</button> first.{/if}{/if}</div>{/if}
      {#if coldCompare}<div><b>Cold</b>{coldCompare.text}.{#if coldCompare.here == null}{#if a.locationId}{' '}<a href="/benches/{a.locationId}?edit=1">Set its floor</a>.{:else}{' '}<button type="button" class="linkish" onclick={() => (moving = true)}>Give it a place</button> first.{/if}{/if}</div>{/if}
    </div>
    <details class="why">
      <summary>What this compares</summary>
      <div class="whybody">A comparison, not a verdict: the habitat figures are what the sky and the weather do where the species is recorded (CHELSA across every envelope cell, NASA POWER at the typical cell), not measured tolerances of this plant. This place's figures are its bench settings, inherited from parents where set. <a href="/species/{slugify(a.taxonName)}#s-cultivation">The full cultivation sheet</a>.</div>
    </details>
  {/if}

  <div class="secrule" id="photos"><h2>Photographs</h2><div class="line"></div><span class="n">{photos.length ? `${photos.length}` : ''}</span></div>
  {#if adding || !photos.length}
    <div class="cult addrow"><PhotoAdd acc={id} id="acc-photo" onadded={() => (adding = true)} /></div>
  {/if}
  {#if photos.length}
    <div class="phgrid">
      {#each photos as ph, i (ph.id)}
        <button class="ph" type="button" class:cov={cover?.id === ph.id} onclick={() => (lightbox = i)} title={ph.caption ?? ph.d}>
          <PhotoImg id={ph.id} alt={ph.caption ?? ph.d} loading="lazy" />
          <span class="pd">{ph.d}</span>
          {#if cover?.id === ph.id}<span class="tag">cover</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>Log</h2><div class="line"></div><span class="n">{plural(timeline.length, 'entry', 'entries')}</span></div>
  {#if !events.length}
    <p class="empty">Nothing recorded yet; each verb above adds a line here.</p>
  {:else}
    <div class="tl">
      {#each timeline as row (row.k + row.id)}
        {#if row.k === 'e'}
          {@const e = row.e}
          <div class="tlrow">
            <span class="d">{e.d}</span>
            <span class="t">{EVENT_LABEL[e.t] ?? e.t}{#if e.used}<span class="x2">{' · '}{e.used}</span>{/if}{#if e.cause}<span class="x2">{' · '}{e.cause}</span>{/if}{#if e.measures}<span class="x2">{' · '}{Object.entries(e.measures).map(([k, v]) => `${MEASURES.find((m) => m.k === k)?.label ?? k} ${v}`).join(', ')}</span>{/if}{#if e.note}<span class="x2">{' · '}{e.note}</span>{/if}</span>
            {#if confirmEvent === e.id}<button class="rm confirm" type="button" onclick={() => { collection.remove('event', e.id); confirmEvent = null; }}>Remove?</button>{:else}<button class="rm" type="button" title="Remove this entry" aria-label="Remove this entry" onclick={() => (confirmEvent = e.id)}>×</button>{/if}
          </div>
        {:else}
          {@const ph = row.ph}
          <button class="tlrow tlphoto" type="button" onclick={() => openPhoto(ph)}>
            <span class="d">{ph.d}</span>
            <span class="t"><span class="thumb"><PhotoImg id={ph.id} alt="" loading="lazy" /></span>Photographed{#if ph.caption}<span class="x2"> · {ph.caption}</span>{/if}</span>
            <span class="x">{ph.dFrom === 'exif' ? 'camera date' : ''}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>Notes on this plant</h2><div class="line"></div></div>
  <div class="cult">
    {#if editingNotes}
      <div class="fields"><textarea id="acc-notes" rows="4" bind:value={notesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingNotes = false)}>Cancel</button><button class="btn pri" onclick={saveNotes}>Save</button></div></div>
    {:else if a.notes}
      <div class="body">{a.notes}</div><div class="foot"><button class="linkish" onclick={() => { notesDraft = a.notes ?? ''; editingNotes = true; }}>Edit</button></div>
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { notesDraft = ''; editingNotes = true; }}>Add a note</button></div>
    {/if}
  </div>
  <div class="cult">
    <div class="sum">My notes on <i>{a.taxonName}</i> <span class="hint">shared by every plant of this species you own; shown on the species page</span></div>
    {#if editingMy}
      <div class="fields"><textarea id="taxon-notes" rows="4" bind:value={myNotesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingMy = false)}>Cancel</button><button class="btn pri" onclick={saveMyNotes}>Save</button></div></div>
    {:else if taxon?.myNotes}
      <div class="body">{taxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => { myNotesDraft = taxon?.myNotes ?? ''; editingMy = true; }}>Edit</button></div>
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { myNotesDraft = ''; editingMy = true; }}>Write cultivation notes</button></div>
    {/if}
  </div>

  {#if propagations.length}
    <div class="secrule"><h2>Propagated from this plant</h2><div class="line"></div><span class="n">{propagations.length}</span></div>
    <div class="tl">
      {#each propagations as p}
        {@const st = collection.sowingStats(p.id)}
        <a class="tlrow" href="/sowings/{sowNo(p)}"><span class="d">{p.sown}</span><span class="t"><span class="mono">{sowNo(p)}</span> · {p.count} {(PROP_METHODS.find((m) => m.k === p.method) ?? PROP_METHODS[0]).unit}</span><span class="x">{st.germinated} struck · {st.potted} potted · {p.status}</span></a>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>Provenance</h2><div class="line"></div></div>
  {#if !a.sourceFrom && !a.sourceForm && !a.fieldNumber && a.provenance === 'unknown' && !a.sowingId && !a.nameAsReceived && kind !== 'hybrid'}
    <p class="empty">Nothing stated yet. <button class="linkish" type="button" onclick={startEdit}>Add where it came from</button></p>
  {:else}
  <div class="factgrid">
    <div><b>Source</b>{[a.sourceFrom, a.sourceForm, a.acquired].filter(Boolean).join(' · ') || 'not stated'}{#if a.price}{' · '}{a.price}{/if}</div>
    <div><b>Field number</b>{a.fieldNumber ?? 'none'}</div>
    <div><b>Provenance</b>{provLabel(a.provenance)}</div>
    {#if a.sowingId}<div><b>Raised from</b><a href="/sowings/{a.sowingId}">{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing} · {sowing.count} started, {collection.sowingStats(sowing.id).germinated} up, {collection.sowingStats(sowing.id).potted} potted{/if}</div>{/if}
    {#if a.nameAsReceived}<div><b>Name as received</b>{a.nameAsReceived}</div>{/if}
    {#if kind === 'hybrid'}<div><b>Parentage</b>{a.parentage ?? 'not stated'}</div>{/if}
  </div>
  {/if}

  <div class="dangerrow">
    <span class="small muted">Removing keeps the number reserved; the record stays in the change log and in any backup taken before.</span>
    {#if confirmRemove}<span><button class="btn danger" onclick={remove}>Yes, remove {accNo(a)}</button> <button class="btn" onclick={() => (confirmRemove = false)}>Keep</button></span>{:else}<button class="btn danger" onclick={() => (confirmRemove = true)}>Remove this plant</button>{/if}
  </div>
  {#if lightbox != null && photos.length}
    <Lightbox {photos} bind:index={lightbox} acc={id} onclose={() => (lightbox = null)} />
  {/if}
{/if}

<style>
  .hero { margin-top: 14px; }
  /* A fixed height for the species photograph and its stand-ins: the box is the same size before the image, with it, and without it, so the page below does not move. */
  .hero:not(.own) { min-height: 260px; }
  .hero .spthumb { width: 100%; height: 260px; object-fit: cover; display: block; }
  .skelbox { background: var(--sunk); border-radius: var(--r); min-height: 260px; }
  .skelcard { min-height: 120px; margin-top: 14px; }
  .parentage { margin-top: 2px; }
  .parentage a { color: inherit; }
  .hero.own { background: #0d1211; }
  .hero.own .cred { top: 10px; bottom: auto; }
  .heroimg { display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .heroimg :global(img) { width: 100%; max-height: 430px; object-fit: cover; display: block; }
  /* No photograph: the box keeps a hero's height but grows with its contents, the caption on its own line above the buttons. */
  .hero .ph { height: auto; min-height: 260px; box-sizing: border-box; padding: 16px; flex-direction: column; gap: 12px; }
  .hero .ph .phcap { display: block; }
  button.cred { border: 0; cursor: pointer; font: inherit; font-size: 10.5px; }
  .addrow { padding: 14px 17px; margin-top: 12px; }
  .phgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
  .phgrid .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: 10px; overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: var(--sh); }
  .phgrid .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .phgrid .ph.cov { outline: 2px solid var(--accent); outline-offset: 2px; }
  .phgrid .pd { position: absolute; left: 8px; bottom: 7px; font-family: var(--mono); font-size: 10.5px; color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: 5px; }
  .phgrid .tag { position: absolute; right: 8px; top: 7px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; color: var(--on-accent); background: var(--accent); padding: 2px 7px; border-radius: 5px; }
  .tlphoto { width: 100%; text-align: left; background: transparent; border: 0; border-top: 1px solid var(--rule); font: inherit; color: inherit; cursor: pointer; align-items: center; }
  .tlphoto:first-child { border-top: 0; }
  .tlphoto .thumb { display: inline-block; width: 44px; height: 44px; border-radius: 7px; overflow: hidden; vertical-align: middle; margin-right: 10px; background: var(--sunk); }
  .tlphoto .thumb :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tlphoto:hover .t { color: var(--accent); }
  .hvh { grid-template-columns: 1fr 1fr; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  @media (max-width: 520px) { .hvh { grid-template-columns: 1fr; } }
  .muted { color: var(--ink3); }
  .editform, .evform { margin-top: 16px; }
  .editform { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; }
  .editform label { display: grid; gap: 4px; }
  .editform label > span, .editform .lbl { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .editform input, .editform select, .fields input, .fields select, .fields textarea { width: 100%; font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .measures { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .measures label { display: grid; gap: 3px; }
  .measures .lab { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin: 0; }
  .tlrow .x2 { font-weight: 400; color: var(--ink2); font-size: 12.5px; }
  /* The × is small; its hit area is not. Negative margins keep the row's height. */
  .rm { border: 0; background: transparent; color: var(--ink3); cursor: pointer; font-size: 16px; line-height: 1; padding: 0 4px; min-width: 40px; min-height: 40px; margin: -12px -8px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; }
  .rm:hover { color: var(--bad); }
  .rm.confirm { font-size: 12px; color: var(--bad); font-weight: 600; }
  a.tlrow { color: inherit; }
  a.tlrow:hover { text-decoration: none; }
  a.tlrow:hover .t { color: var(--accent); }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 13px; }
  .dangerrow { margin: 46px 0 10px; padding: 0; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 12.5px; color: var(--ink3); }
  .setup { margin-top: 14px; }
  .setup .setupbody { display: grid; }
  .setuprow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 12px; align-items: center; text-align: left; padding: 12px 17px; border: 0; border-top: 1px solid var(--rule); background: none; font: inherit; color: inherit; cursor: pointer; min-height: 48px; width: 100%; }
  .setuprow:first-child { border-top: 0; }
  .setuprow:hover { background: var(--sunk); }
  .setuprow .n { font-family: var(--mono); font-size: 12px; color: var(--ink3); }
  .setuprow .t { font-weight: 600; font-size: 14px; color: var(--accent); }
  .setuprow .w { font-size: 12px; color: var(--ink3); }
  .quickbar .more { color: var(--ink2); }
  @media (max-width: 640px) { .setuprow .w { display: none; } }
  a.pill { color: inherit; }
  @media (max-width: 640px) { .editform { grid-template-columns: 1fr 1fr; } .hero { margin-top: 0; } .heroimg :global(img) { max-height: 260px; } }
</style>
