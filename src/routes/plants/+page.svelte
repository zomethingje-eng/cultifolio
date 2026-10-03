<script lang="ts">
  import { sync } from '$lib/sync/engine.svelte';
  import { collection, DUE_DAYS } from '$lib/db/collection.svelte';
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
  import { entriesFor } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  onMount(() => collection.load());
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
    return fold(`${a.taxonName} ${a.cultivar ?? ''} ${a.parentage ?? ''} ${a.nameAsReceived ?? ''} ${accNo(a)} ${a.fieldNumber ?? ''} ${a.locationId ? collection.locationName(a.locationId) : (a.location ?? '')} ${a.notes ?? ''} ${a.sourceFrom ?? ''}`);
  };
  const byName = (a: (typeof collection.accessions)[number], b: (typeof collection.accessions)[number]) => a.taxonName.localeCompare(b.taxonName) || (a.cultivar ?? '').localeCompare(b.cultivar ?? '') || accNo(a).localeCompare(accNo(b));
  const sorters: Record<Sort, (a: (typeof collection.accessions)[number], b: (typeof collection.accessions)[number]) => number> = {
    number: () => 0, // the collection's order: newest number first
    name: byName,
    watered: (a, b) => care(b) - care(a) || byName(a, b), // longest since watered first
    place: (a, b) => { const pa = a.locationId ? collection.locationName(a.locationId) : (a.location ?? ''), pb = b.locationId ? collection.locationName(b.locationId) : (b.location ?? ''); return (pa === '' ? 1 : 0) - (pb === '' ? 1 : 0) || pa.localeCompare(pb) || byName(a, b); } // unplaced plants last, not first (round twenty-six, 8)
  };
  const yearAgo = localDateYearAgo();
  const noPhoto = (id: string) => !collection.photos(id).some((p) => p.d >= yearAgo);
  const noPhotoN = $derived(collection.accessions.filter((a) => a.status === 'growing' && noPhoto(a.id)).length);
  let thumbs = $state<Map<string, string>>(new Map());
  // Thumbnails for the species grown here, a small request, not the whole catalogue (round eight, 9).
  // Only when the grower has switched the reference's photographs on for their own pages: the thumbnails are the one thing
  // this page would ask for, and they come from iNaturalist or GBIF, which then see which species (round twelve, A1).
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
  const list = $derived.by(() => {
    careMap = new Map();
    return collection.accessions.filter((a) => (show === 'all' || a.status === 'growing') && (show !== 'due' || care(a) >= DUE_DAYS) && (show !== 'nophoto' || noPhoto(a.id)) && matches(a, words)).sort(sorters[sort]);
  });
  // The list is drawn in pages of two hundred as the reader scrolls: fifteen hundred rows at once was five seconds to paint (round fifty-one, 5).
  const PAGE = 200;
  let limit = $state(PAGE);
  const shown = $derived(list.slice(0, limit));
  let moreEl = $state<HTMLElement | null>(null);
  $effect(() => { void list; limit = PAGE; });
  $effect(() => {
    if (!moreEl) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) limit += PAGE; }, { rootMargin: '600px 0px' });
    io.observe(moreEl);
    return () => io.disconnect();
  });
</script>

<svelte:head><title>My plants — Cultifolio</title></svelte:head>

<PageHead compact title="My plants" sub="Your plants, each under its own number, kept on this device." count="{collection.accessions.filter((a) => a.status === 'growing').length} growing · {collection.numbersIssued} number{collection.numbersIssued === 1 ? '' : 's'} given">
  <!-- The + in the top bar is the phone's add button; the head keeps its one line (round fifty, 4). -->
  <a class="btn pri wideonly" href="/plants/new">Add a plant</a>
</PageHead>

<div class="toolrow plantstools">
  <input id="plants-q" class="searchbar" type="search" placeholder="Search name, number, field number, place, notes…" aria-label="Search your plants" bind:value={q} />
  <select id="plants-sort" class="sortsel" aria-label="Sort" bind:value={sort}><option value="number">Newest number first</option><option value="name">By name</option><option value="watered">Longest since watered</option><option value="place">By place</option></select>
  {#if (q.trim() || show !== 'growing') && list.length}<a class="btn small" href="/labels?acc={list.map((a) => a.id).join(',')}" title="Labels for exactly the plants listed here">Labels for these {list.length}</a>{/if}
  <div class="chiprow showrow" style="margin: 0">
    <button class="chipbtn" class:on={show === 'growing'} aria-pressed={show === 'growing'} onclick={() => (show = 'growing')}>Growing<span class="n">{collection.accessions.filter((a) => a.status === 'growing').length}</span></button>
    <button class="chipbtn" class:on={show === 'due'} aria-pressed={show === 'due'} onclick={() => (show = 'due')} title="Not watered, or not recorded as watered, for three weeks or more: a fact about the record, not a verdict on the plant">Not watered 21+ days<span class="n">{dueN}</span></button>
    <button class="chipbtn" class:on={show === 'nophoto'} aria-pressed={show === 'nophoto'} onclick={() => (show = 'nophoto')} title="Growing plants with no photograph in the last year">No photo in 12 months<span class="n">{noPhotoN}</span></button>
    <button class="chipbtn" class:on={show === 'all'} aria-pressed={show === 'all'} onclick={() => (show = 'all')}>All<span class="n">{collection.accessions.length}</span></button>
  </div>
</div>

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if collection.ready && storageLow && !storageNoticeHidden}
  <div class="notice" id="storage-notice">This browser's storage is nearly full{collection.persisted === false ? ', and it has not promised to keep this site\'s data' : ''}: it may clear photographs to make room. <a href="/backup">Back up now</a>. <button class="linkish" type="button" onclick={hideStorageNotice}>Hide for now</button></div>
{:else if collection.ready && collection.persisted === false && !sync.configured}
  <p class="small muted keepline" id="storage-notice">Kept in this browser only: <a href="/backup">back up</a> or install the app.</p>
{/if}
{#if collection.incomplete}<StateNote word="{collection.incomplete} waiting" id="incomplete-notice">{collection.incomplete} {collection.incomplete === 1 ? 'record waits' : 'records wait'} for a field this device does not have ({#if sync.quarantined.length}a batch from a newer build, set aside on <a href="/sync">Sync</a>{:else}a file that never had it, or a batch from a newer build that has not arrived{/if}), and {collection.incomplete === 1 ? 'is' : 'are'} not shown until it comes; a plant's own page, by its number, says which field. <a href="/about/how#glossary">Glossary</a>.</StateNote>{/if}

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !collection.accessions.length}
  <div class="emptybox">
    <h2 class="q" style="font-size: 22px">Nothing here yet</h2>
    <p class="muted">Your plants are recorded on this device and nowhere else until you choose to sync. <a href="/plants/new">Add the first plant</a>, or <a href="/backup">restore a backup or import from the v2 Herbarium app</a>.</p>
  </div>
{:else if !list.length}
  <div class="emptybox"><p class="muted">No plants match.</p></div>
{:else}
  {#if !prefs.referencePhotos && list.some((a) => !collection.cover(a.id))}
    <!-- One line, the disclosure behind it: the paragraph stood between the chips and the first plant on a phone (round fifty, 4). -->
    <div style="margin: 0 0 8px"><RefPhotoOffer link buckets what="the reference’s photographs for plants without their own" /></div>
  {/if}
  <div class="rows">
    {#each shown as a (a.id)}
      {@const w = sinceWater(a.id)}
      {@const th = thumbs.get(speciesSlug(a.taxonName))}
      {@const own = collection.cover(a.id)}
      <div class="accline">
        <a class="azrow accrow" href="/plants/{accNo(a)}">
          <span class="im" class:own={!!own}>{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else if th}<img src={th} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span>–</span>{/if}</span>
          <span>
            <span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span>
            <span class="fam">{#if kindOf(a) !== 'species'}<span class="pill c">{kindOf(a)}</span>{/if}{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span>{collection.locationName(a.locationId)}</span>{:else if a.location}<span>{a.location}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</span>
          </span>
          <span class="fig" class:due={a.status === 'growing' && collection.careDays(a) >= DUE_DAYS && !collection.wateringAhead(a.id)}>{w == null ? collection.wateringWords(a) : w === 0 ? 'watered today' : `watered ${w} d ago`}</span>
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
  .sortsel { border: 1px solid var(--rule); background: var(--card); border-radius: 9px; padding: 8px 10px; font: inherit; font-size: 13px; color: var(--ink); }
  .muted { color: var(--ink3); }
  .notice .linkish { background: none; border: 0; padding: 0; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .im.own { box-shadow: inset 0 0 0 2px var(--accent); }
  .accline { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; }
  .wbtn { min-height: 40px; }
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  /* On a phone the figure goes under the name instead of away: "which of these did I water last" is the question the list is for. */
  /* The first screen is for the list: the search and the sort share a row, the chips are one row scrolled sideways (round fifty, 4). */
  @media (max-width: 640px) {
    .plantstools { margin-top: 0; padding-top: 4px; row-gap: 6px; }
    .plantstools .searchbar { min-width: 0; flex-basis: 160px; }
    .plantstools > a.btn.small { flex: none; order: 3; } /* the labels link does not squeeze the search box (round fifty-two, 6) */
    .plantstools .sortsel { flex: none; max-width: 44%; }
    .plantstools .showrow { flex-basis: 100%; flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin: 0 -16px !important; padding: 2px 16px; }
    .plantstools .showrow::-webkit-scrollbar { display: none; }
    .plantstools .showrow .chipbtn { flex: none; white-space: nowrap; }
  }
  @media (max-width: 640px) { .azrow { grid-template-columns: 40px minmax(0, 1fr); } .azrow .fig { grid-column: 2; justify-content: flex-start; text-align: left; font-size: 11.5px; margin-top: -4px; } }
</style>
