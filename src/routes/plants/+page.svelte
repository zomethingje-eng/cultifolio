<script lang="ts">
  import { sync } from '$lib/sync/engine.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import StateNote from '$lib/ui/StateNote.svelte';
  import { localDate, daysBetween } from '$core/dates';
  import { accNo, sowNo, type Accession } from '$lib/db/types';
  import { toast } from '$lib/ui/toast.svelte';
  import { kindOf } from '$lib/db/types';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { prefs } from '$lib/ui/prefs.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
  import { entriesFor } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { plantHref } from '$lib/db/links';
  import { numberFirst } from '$lib/db/number-order'; // the sort and search (agent L, round sixty-three)
  import PlantName from '$lib/ui/PlantName.svelte';
  import HeldNote from '$lib/ui/HeldNote.svelte';
  import { placeTail, plantName } from '$lib/ui/plant-label';
  // Each by its own path, not the barrel: a barrel import carries every grower component into this page's chunk (round sixty-one; the accessibility review, 3).
  import PlantsMenu from '$lib/ui/grow/PlantsMenu.svelte'; // round sixty, agent F: import, the sample, selection, Wanted and spending
  import PlantsEmpty from '$lib/ui/grow/PlantsEmpty.svelte';
  import TrySample from '$lib/ui/grow/TrySample.svelte'; // round sixty-three, V2: the example at the head of the empty page
  import { example } from '$lib/ui/grow/example.svelte';
  import SelectMode from '$lib/ui/grow/SelectMode.svelte';
  import PlantsFoot from '$lib/ui/grow/PlantsFoot.svelte';
  import { photoDue, photoDueDays } from '$lib/ui/photo-due';
  import { today as day } from '$lib/ui/day.svelte';
  onMount(() => { site.load(); collection.load(); }); // the site, for the empty list's third step (round fifty-eight; the grower review)
  /** The storage warning can be put away for this tab's life only; the browser's promise has not changed, so it comes back on the next visit. */
  let storageNoticeHidden = $state(false);
  // The amber notice is for storage that is actually running out: under 50 MB left, or nine tenths used. A browser that
  // merely has not promised to keep the data gets one quiet line under the count instead.
  let storageLow = $state(false);
  onMount(async () => {
    try {
      storageNoticeHidden = sessionStorage.getItem('storage-notice-hidden') === '1';
    } catch {
      /* private window or storage blocked: show it */
    }
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota && est.usage != null) storageLow = est.quota - est.usage < 50 * 1024 * 1024 || est.usage / est.quota > 0.9;
    } catch {
      /* no estimate: no warning */
    }
  });
  function hideStorageNotice() {
    storageNoticeHidden = true;
    try {
      sessionStorage.setItem('storage-notice-hidden', '1');
    } catch {
      /* ignore */
    }
  }
  let q = $state('');
  let show = $state<'growing' | 'all' | 'due' | 'nophoto'>('growing');
  type Sort = 'number' | 'name' | 'watered' | 'place';
  let sort = $state<Sort>('number');
  /**
   * One place and what is inside it (?place=<id>), so a bench is selected by its place and not by a word search that also
   * finds "2" in "0042" (round sixty-one; the grower review, 7). `?select=1` opens select mode on it: a place page's
   * "Select these" links to `/plants?place=<id>&select=1`.
   */
  let place = $state('');
  let selectStart = $state(false);
  /** Select mode is on: kept drawn while the list is empty, so a Move that empties a filtered list keeps it and its focus (round sixty-two; the grower review, 10). */
  let selecting = $state(false);
  // The chip, the query and the sort live in the URL (?show=, ?q=, ?sort=), so Back from a plant returns to the same list
  // and a filtered list can be bookmarked; /plants?show=due is where Today points (round twenty-five, 11).
  onMount(() => {
    const sp = new URL(location.href).searchParams;
    const want = sp.get('show');
    if (want === 'due' || want === 'all' || want === 'nophoto') show = want; // a link to ?show=nophoto (Today's line) is followed even before the chip shows
    q = sp.get('q') ?? '';
    const s = sp.get('sort');
    if (s === 'name' || s === 'watered' || s === 'place') sort = s;
    place = sp.get('place') ?? '';
    selectStart = sp.get('select') === '1';
  });
  $effect(() => {
    if (!collection.ready) return;
    const sp = new URLSearchParams();
    if (show !== 'growing') sp.set('show', show);
    if (q.trim()) sp.set('q', q.trim());
    if (sort !== 'number') sp.set('sort', sort);
    if (place && collection.location(place)) sp.set('place', place);
    const want = sp.toString() ? `?${sp}` : '';
    if (new URL(location.href).search !== want) replaceState(`/plants${want}`, page.state);
  });
  /** Every word typed must be found somewhere in the plant's names, number, field number, place or notes: "humilis bench" finds a humilis on a bench (round twenty-five, 11). */
  // Each plant's searchable text, folded once per change to the collection rather than once per plant per keystroke (round fifty-one, 5).
  const hays = $derived(new Map(collection.accessions.map((a) => [a.id, hayOf(a)])));
  const matches = (a: (typeof collection.accessions)[number], words: string[]) => {
    if (!words.length) return true;
    const hay = hays.get(a.id) ?? hayOf(a);
    return words.every((w) => hay.includes(w));
  };
  const hayOf = (a: (typeof collection.accessions)[number]) => {
    return fold(`${a.taxonName} ${a.cultivar ?? ''} ${a.parentage ?? ''} ${a.nameAsReceived ?? ''} ${accNo(a)} ${a.fieldNumber ?? ''} ${a.locationId ? collection.locationName(a.locationId) : ''} ${a.notes ?? ''} ${a.sourceFrom ?? ''}`);
  };
  const byName = (a: (typeof collection.accessions)[number], b: (typeof collection.accessions)[number]) => a.taxonName.localeCompare(b.taxonName) || (a.cultivar ?? '').localeCompare(b.cultivar ?? '') || accNo(a).localeCompare(accNo(b));
  const sorters: Record<Sort, (a: (typeof collection.accessions)[number], b: (typeof collection.accessions)[number]) => number> = {
    number: () => 0, // the collection's order: newest number first
    name: byName,
    watered: (a, b) => care(b) - care(a) || byName(a, b), // longest since watered first
    place: (a, b) => { const pa = a.locationId ? collection.locationName(a.locationId) : '', pb = b.locationId ? collection.locationName(b.locationId) : ''; return (pa === '' ? 1 : 0) - (pb === '' ? 1 : 0) || pa.localeCompare(pb) || byName(a, b); } // unplaced plants last, not first (round twenty-six, 8)
  };
  // Today's rule for the line that links here, so the line and the chip say the same number: growing, here six months or
  // more, and no photograph in twelve (round sixty-one; the grower review, 11). The chip is offered once it counts one.
  // Cut on the shared day store's corrected day, as Today's line is, so the two agree and both move at midnight and at a
  // clock correction (round sixty-two; outside review B4).
  const photoDays = $derived(photoDueDays(day.current));
  const noPhoto = (a: Accession) => photoDue(a, collection, photoDays);
  const noPhotoN = $derived(collection.accessions.filter(noPhoto).length);
  // The keep line below reads `persisted`, which the collection asks the browser for once it is open: drawn a moment after the
  // list, it moved the list 26 px down (CLS 0.011 to 0.020). The list waits for that answer, a few milliseconds in Chromium,
  // and at most a quarter of a second where the browser asks the grower first (round sixty-two; the self-review's N10, the
  // accessibility review of round sixty-one, 9).
  let persistWaited = $state(false);
  $effect(() => {
    if (!collection.ready || collection.persisted !== null) return;
    const t = setTimeout(() => (persistWaited = true), 250);
    return () => clearTimeout(t);
  });
  const opened = $derived(collection.ready && (collection.persisted !== null || persistWaited));
  let thumbs = $state<Map<string, string>>(new Map());
  // Thumbnails for the species grown here, a small request, not the whole catalogue (round eight, 9).
  // Only when the grower has switched the reference's photographs on for their own pages: the thumbnails are the one thing
  // this page would ask for, and they come from iNaturalist, Commons or GBIF, which then see which species (round twelve, A1).
  $effect(() => {
    if (!collection.ready || !prefs.referencePhotos) return;
    const slugs = collection.accessions.map((a) => speciesSlug(a.taxonName));
    entriesFor(slugs).then((m) => { if (m) thumbs = new Map([...m.values()].filter((e) => e.thumb).map((e) => [e.slug, e.thumb!])); });
  });
  // One figure for the row, the chip, the filter and Today: the collection's (round twenty-five, R1-1 and 2).
  const sinceWater = (id: string) => { const d = collection.lastWatered(id); return d ? daysBetween(d) : null; };
  const dueN = $derived(collection.due.length);
  /** Lower-cased with accents folded, as the species search does: "Echeveria agavoïdes" is found by "agavoides" (round twenty-six, 8). */
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = $derived(fold(q).split(/\s+/).filter(Boolean));
  /** The places a search names whole, by their own name or their full path ("bench 2", "greenhouse › bench 2"). */
  const placeKey = (s: string) => fold(s).replace(/\s*(›|>|\/)\s*/g, ' › ').replace(/\s+/g, ' ').trim();
  const named = $derived.by(() => {
    const k = placeKey(q);
    if (!k) return [] as string[];
    return collection.locations.filter((l) => placeKey(l.name) === k || placeKey(collection.locationName(l.id)) === k).map((l) => l.id);
  });
  /** The places for the place filter: the tree depth-first, each by its full path, as the plant form's picker lists them. */
  const placeList = $derived.by(() => {
    const out: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const walk = (parent: string | null) => { for (const l of collection.children(parent)) { if (seen.has(l.id)) continue; seen.add(l.id); out.push({ id: l.id, label: collection.locationName(l.id) || l.name }); walk(l.id); } };
    walk(null);
    return out;
  });
  /** "Search the words instead": the grower asked for every plant that mentions it, not the place. Per search. */
  let wordsOnly = $state(false);
  $effect(() => { void q; wordsOnly = false; });
  /**
   * The places the list is held to: the ?place= filter, else the places a search names whole. A search for a place's name
   * lists that place and what is inside it, so "Tick all" ticks the bench and nothing else; "bench 2" ticked 168 plants on
   * five places (round sixty-one; the grower review, 7).
   */
  const byPlace = $derived(place && collection.location(place) ? [place] : !wordsOnly && named.length ? named : []);
  const within = $derived(new Set(byPlace.flatMap((id) => collection.subtree(id))));
  const placeOk = (a: Accession) => !byPlace.length || (!!a.locationId && within.has(collection.placeOf(a.locationId) ?? ''));
  /** The search's words, unless the search named a place and the list is held to it instead. */
  const searchWords = $derived(!place && !wordsOnly && named.length ? [] : words);
  /** One tap writes one line, dated today; the toast takes exactly that line back (round forty-nine, 3). */
  let watering = $state('');
  async function water(a: Accession) {
    if (watering) return; // a second tap while the first saves does nothing; the button stays focused (aria-disabled, round sixty)
    if (collection.lastWatered(a.id) === localDate()) { toast.show(`${accNo(a)} is already recorded as watered today.`); return; } // one watering a day: two taps are one (round fifty-two, 3)
    watering = a.id;
    try {
      const ev = await collection.addEvent({ acc: a.id, d: localDate(), t: 'water' });
      toast.show(`${accNo(a)} watered.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents([ev.id]).then(() => toast.show(`Undone: the watering line removed.`)); } });
    } finally {
      watering = '';
    }
  }
  /** Two letters for a row with no picture: the genus's and the epithet's (or the cultivar's) first letters. */
  const initials = (a: Accession) => { const n = plantName(a); const w = n.sci.replace(/^×\s*/, '').split(/\s+/); return ((w[0]?.[0] ?? '') + ((w[1] && w[1] !== '×' ? w[1][0] : n.cultivar?.[0]) ?? '')).toUpperCase(); };
  /** Days since watered per plant, read once per list rather than once per comparison in the sort (round fifty-one, 5). */
  let careMap = new Map<string, number>();
  const care = (a: Accession) => { let d = careMap.get(a.id); if (d === undefined) careMap.set(a.id, (d = collection.careDays(a))); return d; };
  // The sort and the chips wait for a second plant: with none or one there is nothing to sort, and a chip left in the URL
  // must not hide the one plant behind controls that are not shown; the search stays (round fifty-eight; the grower review).
  const few = $derived(collection.accessions.length < 2);
  const list = $derived.by(() => {
    careMap = new Map();
    if (few) return collection.accessions.filter((a) => placeOk(a) && matches(a, searchWords));
    // A search that is a plant's whole number lists that plant first: "0001" listed 2026-0001 and 2014-0001 above it (round sixty-three; the round-sixty grower review, 10).
    const found = collection.accessions.filter((a) => (show === 'all' || a.status === 'growing') && (show !== 'due' || collection.isDue(a)) && (show !== 'nophoto' || noPhoto(a)) && placeOk(a) && matches(a, searchWords)).sort(sorters[sort]);
    return searchWords.length ? numberFirst(found, q, accNo) : found;
  });
  // The list is drawn in pages of two hundred as the reader scrolls: fifteen hundred rows at once was five seconds to paint (round fifty-one, 5).
  const PAGE = 200;
  let limit = $state(PAGE);
  const shown = $derived(list.slice(0, limit));
  /** The picture column only when something in view has a picture: a column of dashes was a fifth of a phone's row (round fifty-eight; the grower review). */
  const anyPic = $derived(shown.some((a) => !!collection.cover(a.id) || thumbs.has(speciesSlug(a.taxonName))));
  let moreEl = $state<HTMLElement | null>(null);
  $effect(() => { void list; limit = PAGE; });
  $effect(() => {
    if (!moreEl) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) limit += PAGE; }, { rootMargin: '600px 0px' });
    io.observe(moreEl);
    return () => io.disconnect();
  });
</script>

<svelte:head><title>My plants · Cultifolio</title></svelte:head>

<!-- No count over an empty list: "0 growing · 0 plant numbers" said nothing the steps below do not (round fifty-eight; the grower review). -->
<!-- "plant numbers", not "numbers given": the glossary's plain words (round fifty-eight; the accessibility review). -->
<!-- "N growing" alone: "31 growing · 41 plant numbers" left the grower wondering why the two differ (round sixty; the grower review, 16). -->
<!-- And no count while the collection is still opening: "0 growing" stood over "Opening your collection…" for as long as the
     open took (round sixty-six; the all-engines run, smoke 2527, a minute in Safari's engine on the PC; rule 2). -->
<PageHead compact title="My plants" sub="Your plants, each under its own number, kept on this device." count={!collection.ready || !collection.accessions.length ? undefined : `${collection.accessions.filter((a) => a.status === 'growing').length} growing`}>
  <!-- The + in the top bar is the phone's add button; the head keeps its one line (round fifty, 4). -->
  <a class="btn pri wideonly" href="/plants/new">Add a plant</a>
  <PlantsMenu />
</PageHead>

{#if collection.ready && collection.accessions.length}
<div class="toolrow plantstools">
  <input id="plants-q" class="searchbar" type="search" placeholder="Search plants…" aria-label="Search your plants" bind:value={q} />
  {#if !few}<select id="plants-sort" class="sortsel" aria-label="Sort" bind:value={sort}><option value="number">Newest first</option><option value="name">By name</option><option value="watered">Longest unwatered</option><option value="place">By place</option></select>{/if}
  <!-- One place and what is inside it; the address carries it, so a place page can link here (round sixty-one; the grower
       review, 7). Offered with the "By place" order, or while a place is chosen, so the phone's first screen keeps its one row. -->
  {#if collection.locations.length && (place || (!few && sort === 'place'))}<select id="plants-place" class="sortsel placesel" aria-label="Place" bind:value={place}><option value="">All places</option>{#each placeList as p (p.id)}<option value={p.id}>{p.label}</option>{/each}</select>{/if}
  {#if (q.trim() || show !== 'growing') && list.length}<a class="btn small" href="/labels?acc={list.map((a) => a.id).join(',')}" title="Labels for exactly the plants listed here">Labels for these {list.length}</a>{/if}
  <!-- "Due" by each plant's rhythm, which a place or the plant may set: the chip no longer says 21 days for all (round fifty-eight; the grower review). -->
  <!-- The one toggle group, as chips, with a name for the group (round fifty-eight; the accessibility review). -->
  {#if !few}<ToggleGroup chips class="showrow" style="margin: 0" label="Which plants" bind:value={show} options={[
    { value: 'growing', label: 'Growing', n: collection.accessions.filter((a) => a.status === 'growing').length },
    { value: 'due', label: 'Due', n: dueN, title: 'Past its watering rhythm: 21 days unless its place or the plant sets another' },
    ...(noPhotoN || show === 'nophoto' ? [{ value: 'nophoto' as const, label: 'No photo in 12 months', n: noPhotoN, title: 'Growing plants kept six months or more and not photographed in the last year' }] : []),
    { value: 'all', label: 'All', n: collection.accessions.length }
  ]} />{/if}
</div>
{/if}

<HeldNote />
{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if opened && storageLow && !storageNoticeHidden}
  <div class="notice" id="storage-notice">This browser's storage is nearly full{collection.persisted === false ? ', and it has not promised to keep this site\'s data' : ''}: it may clear photographs to make room. <a href="/backup">Back up now</a>. <button class="linkish" type="button" onclick={hideStorageNotice}>Hide for now</button></div>
{:else if opened && collection.persisted === false && !sync.configured}
  <p class="small muted keepline" id="storage-notice">Kept in this browser only: <a href="/backup">back up</a> or install the app.</p>
{/if}
<!-- What "set aside" meant, and "version of the app", not "build" (round fifty-eight; the accessibility review). -->
{#if collection.incomplete}<StateNote word="{collection.incomplete} waiting" id="incomplete-notice">{collection.incomplete} {collection.incomplete === 1 ? 'record waits' : 'records wait'} for a field this device does not have ({#if sync.quarantined.length}a sync bundle from a newer version of the app, which could not be read here; see <a href="/sync">Sync</a>{:else}a file that never had it, or a sync bundle from a newer version of the app that has not arrived{/if}), and {collection.incomplete === 1 ? 'is' : 'are'} not shown until it comes; a plant's own page, by its number, says which field. <a href="/about/how#glossary">Glossary</a>.</StateNote>{/if}

{#if !opened}
  <p class="muted">Opening your collection…</p>
{:else if !collection.accessions.length && example.seeding}
  <!-- The example being set out: said, not "Nothing here yet" under it (round sixty-three, V2). -->
  <p class="muted" role="status" id="example-opening">Setting out the example collection…</p>
{:else if !collection.accessions.length}
  <!-- Three steps in the order they help, each a link, a step done says so: a sort menu and zero chips over nothing was the first thing a new grower saw (round fifty-eight; the grower review). -->
  <div class="emptybox firststeps">
    <h2 class="q" style="font-size: var(--fs-2xl)">Nothing here yet</h2>
    <!-- The example first, where a visitor starts: a look at every page filled in before typing a plant (round sixty-three, V2). -->
    <TrySample />
    <ol class="steps">
      <!-- To the add form: an empty Places opens the example by itself, and this step is for the grower's own place (round sixty-three, V2). -->
      <li><a href="/places#add"><span class="n">1</span><span class="t">Where you grow</span><span class="w">{collection.locations.length ? `${collection.locations.length === 1 ? 'one place' : `${collection.locations.length} places`} so far; add another` : 'add your bench or windowsill'}</span></a></li>
      <li><a href="/plants/new"><span class="n">2</span><span class="t">Your first plant</span><span class="w">its name, where it came from and where it lives</span></a></li>
      <li><a href="/settings#site"><span class="n">3</span><span class="t">Your location for the frost watch</span><span class="w">{site.current ? `set${site.current.name ? `: ${site.current.name}` : ''}` : 'the frost watch reads its forecast there, and the months follow its hemisphere'}</span></a></li>
    </ol>
    <p class="muted small">Your plants are recorded on this device and nowhere else until you choose to sync. Moving from another device? <a href="/backup">Restore a backup</a>.</p>
  </div>
  <PlantsEmpty />
{:else}
  {#if byPlace.length && !place}
    <!-- What the list is held to, said, with the way to the words instead (round sixty-one; the grower review, 7). -->
    <p class="small muted" id="q-place">The plants at {byPlace.map((id) => collection.locationName(id)).join(' and ')} and inside, since the search names {byPlace.length === 1 ? 'that place' : 'those places'}. <button class="linkish" type="button" id="q-words" onclick={() => (wordsOnly = true)}>Every plant that mentions “{q.trim()}” instead</button></p>
  {/if}
  {#if list.length && !prefs.referencePhotos && list.some((a) => !collection.cover(a.id))}
    <!-- One line, the disclosure behind it: the paragraph stood between the chips and the first plant on a phone (round fifty, 4). -->
    <div style="margin: 0 0 8px"><RefPhotoOffer link buckets what="the reference’s photographs for plants without their own" /></div>
  {/if}
  <!-- Drawn while selecting even when the list is empty: a Move that emptied a place's list unmounted it, and focus fell to the page (round sixty-two; the grower review, 10). -->
  {#if list.length || selecting}<SelectMode plants={list} start={selectStart} bind:on={selecting} />{/if}
  {#if !list.length}
  <div class="emptybox"><p class="muted">No plants match.</p></div>
  {:else}
  <div class="rows" class:nopic={!anyPic}>
    {#each shown as a (a.id)}
      {@const w = sinceWater(a.id)}
      {@const th = thumbs.get(speciesSlug(a.taxonName))}
      {@const own = collection.cover(a.id)}
      {@const wtext = w == null ? collection.wateringWords(a) : w === 0 ? 'watered today' : `watered ${w} d ago`}
      <div class="accline">
        <!-- By its identity while another plant shares its number (round sixty). -->
        <a class="azrow accrow" href={plantHref(a)}>
          <!-- No photograph: the name's initials, not a grey dash that read as a missing image thirty times (round sixty; the grower review, 17). -->
          {#if anyPic}<span class="im" class:own={!!own}>{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else if th}<img src={th} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span class="ini" aria-hidden="true">{initials(a)}</span>{/if}</span>{/if}
          <span class="txt">
            <span class="nm"><span class="accno lead">{accNo(a)}</span>{' '}<PlantName plant={a} /></span>
            <!-- On a phone the watering figure leads the second line, so a row is two lines, not three (round fifty-eight; the grower review). -->
            <span class="fam"><span class="sr">{', '}</span>{#if a.status === 'growing' || collection.lastWatered(a.id)}<span class="figphone" class:due={collection.isDue(a)}>{wtext}</span>{/if}{#if kindOf(a) !== 'species'}<span class="pill c">{kindOf(a)}</span>{/if}{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span class="where" title={collection.locationName(a.locationId)}><span aria-hidden="true">{placeTail(collection.locationName(a.locationId))}</span><span class="sr">{collection.locationName(a.locationId)}</span></span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</span>
          </span>
          <span class="fig" class:due={collection.isDue(a)}><span class="sr">{', '}</span>{wtext}</span>
        </a>
        <!-- The one thing done to a plant without opening its page: a watering today, with an Undo (round forty-nine, 3). -->
        <!-- aria-disabled while it saves: a disabled button drops keyboard focus to the page, and the toast's Undo is then 23 Tabs away (round sixty; the accessibility review, 1). -->
        {#if a.status === 'growing'}<button class="btn small wbtn" type="button" onclick={() => water(a)} aria-disabled={watering === a.id} aria-label="Water {accNo(a)}, record watered today" title="Record watered today">Water</button>{/if}
      </div>
    {/each}
  </div>
  {#if shown.length < list.length}<div class="more" bind:this={moreEl}><button class="btn small" type="button" onclick={() => (limit += PAGE)}>More ({list.length - shown.length} further down)</button></div>{/if}
  <p class="seccount">{list.length} of {collection.accessions.length} shown</p>
  {/if}
{/if}
<PlantsFoot />

<style>
  .keepline { margin: -6px 0 10px; }
  .more { display: flex; justify-content: center; padding: 10px 0; }
  .placesel { max-width: 100%; text-overflow: ellipsis; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  .sortsel { border: 1px solid var(--field-edge); background: var(--card); border-radius: var(--r); padding: 8px 10px; min-height: var(--tap); font: inherit; font-size: var(--fs-md); color: var(--ink); } /* an edge at 3:1: --rule was 1.17:1 (round fifty-nine) */
  .muted { color: var(--ink3); }
  .notice .linkish { background: none; border: 0; padding: 0; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .im.own { box-shadow: inset 0 0 0 2px var(--accent); }
  .im .ini { font-family: var(--ui); font-size: var(--fs-sm); font-weight: 700; letter-spacing: 0.04em; color: var(--ink3); }
  .accline { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; }
  .wbtn { min-height: var(--tap); min-width: var(--tap); } /* the tap token: 44 px under a finger (round fifty-nine) */
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  /* Rows of two lines, about 56px; a name wraps between words, never inside one ("Astrophytu m"): the theme's anywhere is for the catalogue's tiles (round fifty-eight; the grower review). */
  .accrow { min-height: 56px; }
  .accrow .nm { overflow-wrap: break-word; word-break: normal; }
  .accrow .nm :global(i) { overflow-wrap: break-word; }
  .rows.nopic .azrow { grid-template-columns: minmax(0, 1fr) auto; }
  .figphone { display: none; }
  .firststeps .steps { list-style: none; padding: 0; margin: 12px 0 14px; display: grid; gap: 8px; }
  .firststeps .steps a { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 2px 10px; align-items: baseline; padding: 10px 12px; min-height: 56px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: inherit; text-decoration: none; }
  .firststeps .steps a:hover { border-color: var(--accent); }
  .firststeps .n { grid-row: span 2; font-family: var(--mono); font-size: var(--fs-md); color: var(--ink3); }
  .firststeps .t { font-weight: 600; color: var(--accent); }
  .firststeps .w { font-size: var(--fs-md); color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  /* On a phone the figure goes under the name instead of away: "which of these did I water last" is the question the list is for. */
  /* The first screen is for the list: the search and the sort share a row, the chips are one row scrolled sideways (round fifty, 4). */
  @media (max-width: 640px) {
    .plantstools { margin-top: 0; padding-top: 4px; row-gap: 6px; }
    .plantstools .searchbar { min-width: 0; flex-basis: 160px; }
    .plantstools > a.btn.small { flex: none; order: 3; } /* the labels link does not squeeze the search box (round fifty-two, 6) */
    /* As wide as its longest option, up to the row, and onto a line of its own before it is cut: at 200% text a 44% cap showed "Newe" (round sixty-one; the accessibility review, 7). */
    .plantstools .sortsel { flex: 0 1 9.5em; min-width: min(9.5em, 100%); max-width: 100%; }
    .plantstools .placesel { flex: 1 1 auto; min-width: 0; }
    /* :global, since the row is the toggle group's own markup (round fifty-eight; the accessibility review). */
    .plantstools :global(.showrow) { flex-basis: 100%; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin: 0 -16px !important; padding: 2px 16px; }
    .plantstools :global(.showrow::-webkit-scrollbar) { display: none; }
    .plantstools :global(.showrow .chipbtn) { flex: none; white-space: nowrap; }
  }
  /* On a phone the figure leads the row's second line rather than taking a third (round fifty-eight; the grower review). */
  @media (max-width: 640px) {
    .azrow { grid-template-columns: 40px minmax(0, 1fr); }
    .rows.nopic .azrow { grid-template-columns: minmax(0, 1fr); }
    .azrow .fig { display: none; }
    .accrow .fam { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
    .accrow .fam > :global(*) { flex: none; }
    .accrow .fam .where { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .figphone { display: inline; font-family: var(--mono); font-size: var(--fs-sm); color: var(--ink2); }
    .figphone.due { color: var(--bad); font-weight: 600; }
  }
</style>
