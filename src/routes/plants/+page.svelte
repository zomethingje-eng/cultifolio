<script lang="ts">
  import { sync } from '$lib/sync/engine.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import StateNote from '$lib/ui/StateNote.svelte';
  import { localDate, localDateYearAgo, daysBetween } from '$core/dates';
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
  // The chip, the query and the sort live in the URL (?show=, ?q=, ?sort=), so Back from a plant returns to the same list
  // and a filtered list can be bookmarked; /plants?show=due is where Today points (round twenty-five, 11).
  onMount(() => {
    const sp = new URL(location.href).searchParams;
    const want = sp.get('show');
    if (want === 'due' || want === 'all' || want === 'nophoto') show = want;
    q = sp.get('q') ?? '';
    const s = sp.get('sort');
    if (s === 'name' || s === 'watered' || s === 'place') sort = s;
  });
  $effect(() => {
    if (!collection.ready) return;
    const sp = new URLSearchParams();
    if (show !== 'growing') sp.set('show', show);
    if (q.trim()) sp.set('q', q.trim());
    if (sort !== 'number') sp.set('sort', sort);
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
  const yearAgo = localDateYearAgo();
  const noPhoto = (id: string) => !collection.photos(id).some((p) => p.d >= yearAgo);
  const noPhotoN = $derived(collection.accessions.filter((a) => a.status === 'growing' && noPhoto(a.id)).length);
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
  /** One tap writes one line, dated today; the toast takes exactly that line back (round forty-nine, 3). */
  let watering = $state('');
  async function water(a: Accession) {
    if (watering) return;
    if (collection.lastWatered(a.id) === localDate()) { toast.show(`${accNo(a)} is already recorded as watered today.`); return; } // one watering a day: two taps are one (round fifty-two, 3)
    watering = a.id;
    try {
      const ev = await collection.addEvent({ acc: a.id, d: localDate(), t: 'water' });
      toast.show(`${accNo(a)} watered.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents([ev.id]).then(() => toast.show(`Undone: the watering line removed.`)); } });
    } finally {
      watering = '';
    }
  }
  /** Days since watered per plant, read once per list rather than once per comparison in the sort (round fifty-one, 5). */
  let careMap = new Map<string, number>();
  const care = (a: Accession) => { let d = careMap.get(a.id); if (d === undefined) careMap.set(a.id, (d = collection.careDays(a))); return d; };
  // The sort and the chips wait for a second plant: with none or one there is nothing to sort, and a chip left in the URL
  // must not hide the one plant behind controls that are not shown; the search stays (round fifty-eight; the grower review).
  const few = $derived(collection.accessions.length < 2);
  const list = $derived.by(() => {
    careMap = new Map();
    if (few) return collection.accessions.filter((a) => matches(a, words));
    return collection.accessions.filter((a) => (show === 'all' || a.status === 'growing') && (show !== 'due' || collection.isDue(a)) && (show !== 'nophoto' || noPhoto(a.id)) && matches(a, words)).sort(sorters[sort]);
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
<PageHead compact title="My plants" sub="Your plants, each under its own number, kept on this device." count={collection.ready && !collection.accessions.length ? undefined : `${collection.accessions.filter((a) => a.status === 'growing').length} growing · ${collection.numbersIssued} plant number${collection.numbersIssued === 1 ? '' : 's'}`}>
  <!-- The + in the top bar is the phone's add button; the head keeps its one line (round fifty, 4). -->
  <a class="btn pri wideonly" href="/plants/new">Add a plant</a>
</PageHead>

{#if collection.ready && collection.accessions.length}
<div class="toolrow plantstools">
  <input id="plants-q" class="searchbar" type="search" placeholder="Search name, number, field number, place, notes…" aria-label="Search your plants" bind:value={q} />
  {#if !few}<select id="plants-sort" class="sortsel" aria-label="Sort" bind:value={sort}><option value="number">Newest number first</option><option value="name">By name</option><option value="watered">Longest since watered</option><option value="place">By place</option></select>{/if}
  {#if (q.trim() || show !== 'growing') && list.length}<a class="btn small" href="/labels?acc={list.map((a) => a.id).join(',')}" title="Labels for exactly the plants listed here">Labels for these {list.length}</a>{/if}
  <!-- "Due" by each plant's rhythm, which a place or the plant may set: the chip no longer says 21 days for all (round fifty-eight; the grower review). -->
  <!-- The one toggle group, as chips, with a name for the group (round fifty-eight; the accessibility review). -->
  {#if !few}<ToggleGroup chips class="showrow" style="margin: 0" label="Which plants" bind:value={show} options={[
    { value: 'growing', label: 'Growing', n: collection.accessions.filter((a) => a.status === 'growing').length },
    { value: 'due', label: 'Due', n: dueN, title: 'Past its watering rhythm: 21 days unless its place or the plant sets another' },
    { value: 'nophoto', label: 'No photo in 12 months', n: noPhotoN, title: 'Growing plants with no photograph in the last year' },
    { value: 'all', label: 'All', n: collection.accessions.length }
  ]} />{/if}
</div>
{/if}

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if collection.ready && storageLow && !storageNoticeHidden}
  <div class="notice" id="storage-notice">This browser's storage is nearly full{collection.persisted === false ? ', and it has not promised to keep this site\'s data' : ''}: it may clear photographs to make room. <a href="/backup">Back up now</a>. <button class="linkish" type="button" onclick={hideStorageNotice}>Hide for now</button></div>
{:else if collection.ready && collection.persisted === false && !sync.configured}
  <p class="small muted keepline" id="storage-notice">Kept in this browser only: <a href="/backup">back up</a> or install the app.</p>
{/if}
<!-- What "set aside" meant, and "version of the app", not "build" (round fifty-eight; the accessibility review). -->
{#if collection.incomplete}<StateNote word="{collection.incomplete} waiting" id="incomplete-notice">{collection.incomplete} {collection.incomplete === 1 ? 'record waits' : 'records wait'} for a field this device does not have ({#if sync.quarantined.length}a batch from a newer version of the app, which could not be read here; see <a href="/sync">Sync</a>{:else}a file that never had it, or a batch from a newer version of the app that has not arrived{/if}), and {collection.incomplete === 1 ? 'is' : 'are'} not shown until it comes; a plant's own page, by its number, says which field. <a href="/about/how#glossary">Glossary</a>.</StateNote>{/if}

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !collection.accessions.length}
  <!-- Three steps in the order they help, each a link, a step done says so: a sort menu and zero chips over nothing was the first thing a new grower saw (round fifty-eight; the grower review). -->
  <div class="emptybox firststeps">
    <h2 class="q" style="font-size: var(--fs-2xl)">Nothing here yet</h2>
    <ol class="steps">
      <li><a href="/places"><span class="n">1</span><span class="t">Where you grow</span><span class="w">{collection.locations.length ? `${collection.locations.length === 1 ? 'one place' : `${collection.locations.length} places`} so far; add another` : 'add your bench or windowsill'}</span></a></li>
      <li><a href="/plants/new"><span class="n">2</span><span class="t">Your first plant</span><span class="w">its name, where it came from and where it lives</span></a></li>
      <li><a href="/settings#site"><span class="n">3</span><span class="t">Your location for the frost watch</span><span class="w">{site.current ? `set${site.current.name ? `: ${site.current.name}` : ''}` : 'the frost watch reads its forecast there, and the months follow its hemisphere'}</span></a></li>
    </ol>
    <p class="muted small">Your plants are recorded on this device and nowhere else until you choose to sync. Moving from another device? <a href="/backup">Restore a backup</a>.</p>
  </div>
{:else if !list.length}
  <div class="emptybox"><p class="muted">No plants match.</p></div>
{:else}
  {#if !prefs.referencePhotos && list.some((a) => !collection.cover(a.id))}
    <!-- One line, the disclosure behind it: the paragraph stood between the chips and the first plant on a phone (round fifty, 4). -->
    <div style="margin: 0 0 8px"><RefPhotoOffer link buckets what="the reference’s photographs for plants without their own" /></div>
  {/if}
  <div class="rows" class:nopic={!anyPic}>
    {#each shown as a (a.id)}
      {@const w = sinceWater(a.id)}
      {@const th = thumbs.get(speciesSlug(a.taxonName))}
      {@const own = collection.cover(a.id)}
      {@const wtext = w == null ? collection.wateringWords(a) : w === 0 ? 'watered today' : `watered ${w} d ago`}
      <div class="accline">
        <a class="azrow accrow" href="/plants/{accNo(a)}">
          {#if anyPic}<span class="im" class:own={!!own}>{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else if th}<img src={th} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span>–</span>{/if}</span>{/if}
          <span class="txt">
            <span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span>
            <!-- On a phone the watering figure leads the second line, so a row is two lines, not three (round fifty-eight; the grower review). -->
            <span class="fam"><span class="sr">, </span>{#if a.status === 'growing' || collection.lastWatered(a.id)}<span class="figphone" class:due={collection.isDue(a)}>{wtext}</span>{/if}{#if kindOf(a) !== 'species'}<span class="pill c">{kindOf(a)}</span>{/if}{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span class="where">{collection.locationName(a.locationId)}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</span>
          </span>
          <span class="fig" class:due={collection.isDue(a)}><span class="sr">, </span>{wtext}</span>
        </a>
        <!-- The one thing done to a plant without opening its page: a watering today, with an Undo (round forty-nine, 3). -->
        {#if a.status === 'growing'}<button class="btn small wbtn" type="button" onclick={() => water(a)} disabled={watering === a.id} aria-label="Record {accNo(a)} watered today" title="Record watered today">Water</button>{/if}
      </div>
    {/each}
  </div>
  {#if shown.length < list.length}<div class="more" bind:this={moreEl}><button class="btn small" type="button" onclick={() => (limit += PAGE)}>More ({list.length - shown.length} further down)</button></div>{/if}
  <p class="seccount">{list.length} of {collection.accessions.length} shown</p>
{/if}

<style>
  .keepline { margin: -6px 0 10px; }
  .more { display: flex; justify-content: center; padding: 10px 0; }
  .sortsel { border: 1px solid var(--rule); background: var(--card); border-radius: var(--r); padding: 8px 10px; font: inherit; font-size: var(--fs-md); color: var(--ink); }
  .muted { color: var(--ink3); }
  .notice .linkish { background: none; border: 0; padding: 0; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .im.own { box-shadow: inset 0 0 0 2px var(--accent); }
  .accline { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; }
  .wbtn { min-height: 40px; }
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  /* Rows of two lines, about 56px; a name wraps between words, never inside one ("Astrophytu m"): the theme's anywhere is for the catalogue's tiles (round fifty-eight; the grower review). */
  .accrow { min-height: 56px; }
  .accrow .nm { overflow-wrap: break-word; word-break: normal; }
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
    .plantstools .sortsel { flex: none; max-width: 44%; }
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
