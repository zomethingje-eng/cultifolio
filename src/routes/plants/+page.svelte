<script lang="ts">
  import { collection } from '$lib/db/collection.svelte';
  import { localDate, localDateYearAgo, daysBetween } from '$core/dates';
  import { accNo, sowNo } from '$lib/db/types';
  import { kindOf } from '$lib/db/types';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { onMount } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { entriesFor } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
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
  // /plants?show=nophoto (from the front page's "today" line) opens on that chip.
  onMount(() => {
    const want = new URL(location.href).searchParams.get('show');
    if (want === 'due' || want === 'all' || want === 'nophoto') show = want;
  });
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
  const sinceWater = (id: string) => { const d = collection.events(id).find((e) => e.t === 'water')?.d; return d ? daysBetween(d) : null; };
  // Never watered counts from the day its record was made (not the acquisition date, which for a collection entered late is years back), so a plant entered this week is not "overdue".
  const sinceCare = (a: (typeof collection.accessions)[number]) => sinceWater(a.id) ?? daysBetween(collection.madeOn('accession', a.id) ?? a.acquired ?? localDate());
  const dueN = $derived(collection.accessions.filter((a) => a.status === 'growing' && sinceCare(a) > 21).length);
  const list = $derived(
    collection.accessions.filter((a) => (show === 'all' || a.status === 'growing') && (show !== 'due' || sinceCare(a) > 21) && (show !== 'nophoto' || noPhoto(a.id)) && (!q || `${a.taxonName} ${a.cultivar ?? ''} ${a.parentage ?? ''} ${a.nameAsReceived ?? ''} ${accNo(a)} ${a.fieldNumber ?? ''} ${a.locationId ? collection.locationName(a.locationId) : (a.location ?? '')}`.toLowerCase().includes(q.toLowerCase())))
  );
</script>

<svelte:head><title>My plants — Cultifolio</title></svelte:head>

<PageHead title="My plants" sub="Your plants, each under its own number, kept on this device." count="{collection.accessions.filter((a) => a.status === 'growing').length} growing · {collection.numbersIssued} number{collection.numbersIssued === 1 ? '' : 's'} given">
  <a class="btn pri" href="/plants/new">Add a plant</a>
</PageHead>

<div class="toolrow">
  <input id="plants-q" class="searchbar" type="search" placeholder="Search name, number, field number, place…" aria-label="Search your plants" bind:value={q} />
  <div class="chiprow" style="margin: 0">
    <button class="chipbtn" class:on={show === 'growing'} onclick={() => (show = 'growing')}>Growing<span class="n">{collection.accessions.filter((a) => a.status === 'growing').length}</span></button>
    <button class="chipbtn" class:on={show === 'due'} onclick={() => (show = 'due')} title="Not watered, or not recorded as watered, for three weeks: a fact about the record, not a verdict on the plant">Not watered 21+ days<span class="n">{dueN}</span></button>
    <button class="chipbtn" class:on={show === 'nophoto'} onclick={() => (show = 'nophoto')} title="Growing plants with no photograph in the last year">No photo this year<span class="n">{noPhotoN}</span></button>
    <button class="chipbtn" class:on={show === 'all'} onclick={() => (show = 'all')}>All<span class="n">{collection.accessions.length}</span></button>
  </div>
</div>

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if collection.ready && storageLow && !storageNoticeHidden}
  <div class="notice" id="storage-notice">This browser's storage is nearly full{collection.persisted === false ? ', and it has not promised to keep this site\'s data' : ''}: it may clear photographs to make room. <a href="/backup">Back up now</a>. <button class="linkish" type="button" onclick={hideStorageNotice}>Hide for now</button></div>
{:else if collection.ready && collection.persisted === false}
  <p class="small muted keepline" id="storage-notice">Kept in this browser only; <a href="/backup">back up</a> or install the app to keep it safe.</p>
{/if}

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
  <div class="rows">
    {#each list as a (a.id)}
      {@const w = sinceWater(a.id)}
      {@const th = thumbs.get(speciesSlug(a.taxonName))}
      {@const own = collection.cover(a.id)}
      <a class="azrow accrow" href="/plants/{accNo(a)}">
        <span class="im" class:own={!!own}>{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else if th}<img src={th} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span>–</span>{/if}</span>
        <span>
          <span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span>
          <span class="fam">{#if kindOf(a) !== 'species'}<span class="pill c">{kindOf(a)}</span>{/if}{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span>{collection.locationName(a.locationId)}</span>{:else if a.location}<span>{a.location}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</span>
        </span>
        <span class="fig" class:due={w != null && w > 21 && a.status === 'growing'}>{w == null ? 'no watering recorded' : w === 0 ? 'watered today' : `watered ${w} d ago`}</span>
      </a>
    {/each}
  </div>
  <p class="seccount">{list.length} of {collection.accessions.length} shown</p>
{/if}

<style>
  .keepline { margin: -6px 0 10px; }
  .muted { color: var(--ink3); }
  .notice .linkish { background: none; border: 0; padding: 0; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .im.own { box-shadow: inset 0 0 0 2px var(--accent); }
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  /* On a phone the figure goes under the name instead of away: "which of these did I water last" is the question the list is for. */
  @media (max-width: 640px) { .azrow { grid-template-columns: 40px minmax(0, 1fr); } .azrow .fig { grid-column: 2; justify-content: flex-start; text-align: left; font-size: 11.5px; margin-top: -4px; } }
</style>
