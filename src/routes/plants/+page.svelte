<script lang="ts">
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import { kindOf } from '$lib/db/types';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { slugify } from '$core/names';
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { speciesIndex } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  onMount(() => collection.load());
  let q = $state('');
  let show = $state<'growing' | 'all' | 'due'>('growing');
  let thumbs = $state<Map<string, string>>(new Map());
  onMount(async () => {
    const idx = await speciesIndex();
    thumbs = new Map(idx.filter((e: IndexEntry) => e.thumb).map((e: IndexEntry) => [e.slug, e.thumb!]));
  });
  const dayMs = 86_400_000;
  const sinceWater = (id: string) => { const d = collection.events(id).find((e) => e.t === 'water')?.d; return d ? Math.floor((Date.now() - Date.parse(d)) / dayMs) : null; };
  const dueN = $derived(collection.accessions.filter((a) => a.status === 'growing' && (sinceWater(a.id) ?? 999) > 21).length);
  const list = $derived(
    collection.accessions.filter((a) => (show === 'all' || a.status === 'growing') && (show !== 'due' || (sinceWater(a.id) ?? 999) > 21) && (!q || `${a.taxonName} ${accNo(a)} ${a.fieldNumber ?? ''} ${a.locationId ? collection.locationName(a.locationId) : (a.location ?? '')}`.toLowerCase().includes(q.toLowerCase())))
  );
</script>

<svelte:head><title>My plants — Cultifolio</title></svelte:head>

<PageHead title="My plants" sub="Every plant you own, under its own number. Recorded on this device and nowhere else until you choose to sync." count="{collection.accessions.filter((a) => a.status === 'growing').length} growing · {collection.accessions.length} numbered">
  <a class="btn" href="/labels">Labels</a>
  <a class="btn" href="/backup">Backup</a>
  <a class="btn" href="/sync">Sync</a>
  <a class="btn pri" href="/plants/new">Add a plant</a>
</PageHead>

<div class="toolrow">
  <input id="plants-q" class="searchbar" type="search" placeholder="Search name, number, field number, place…" bind:value={q} />
  <div class="chiprow" style="margin: 0">
    <button class="chipbtn" class:on={show === 'growing'} onclick={() => (show = 'growing')}>Growing<span class="n">{collection.accessions.filter((a) => a.status === 'growing').length}</span></button>
    <button class="chipbtn" class:on={show === 'due'} onclick={() => (show = 'due')}>Water overdue<span class="n">{dueN}</span></button>
    <button class="chipbtn" class:on={show === 'all'} onclick={() => (show = 'all')}>All<span class="n">{collection.accessions.length}</span></button>
  </div>
</div>

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !collection.accessions.length}
  <div class="emptybox">
    <h3 class="q" style="font-size: 22px">Nothing here yet</h3>
    <p class="muted">Your plants are recorded on this device and nowhere else until you choose to sync. <a href="/plants/new">Add the first plant</a>, or <a href="/backup">restore a backup or import from the v2 Herbarium app</a>.</p>
  </div>
{:else if !list.length}
  <div class="emptybox"><p class="muted">No plants match.</p></div>
{:else}
  <div class="rows">
    {#each list as a (a.id)}
      {@const w = sinceWater(a.id)}
      {@const th = thumbs.get(slugify(a.taxonName))}
      {@const own = collection.cover(a.id)}
      <a class="azrow accrow" href="/plants/{accNo(a)}">
        <span class="im" class:own={!!own}>{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else if th}<img src={th} alt="" loading="lazy" />{:else}<span>–</span>{/if}</span>
        <span>
          <span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar} ‘{a.cultivar}’{/if}</span>
          <span class="fam">{#if kindOf(a) !== 'species'}<span class="pill c">{kindOf(a)}</span>{/if}{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span>{collection.locationName(a.locationId)}</span>{:else if a.location}<span>{a.location}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</span>
        </span>
        <span class="fig" class:due={w != null && w > 21 && a.status === 'growing'}>{w == null ? 'not watered yet' : w === 0 ? 'watered today' : `watered ${w} d ago`}</span>
      </a>
    {/each}
  </div>
  <p class="seccount">{list.length} of {collection.accessions.length}. {#if collection.persisted === false}This browser has not promised to keep your data; install the app to your home screen or <a href="/backup">take a backup</a>.{:else}<a href="/backup">Backup</a>.{/if}</p>
{/if}

<style>
  .muted { color: var(--ink3); }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .im.own { box-shadow: inset 0 0 0 2px var(--accent); }
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  @media (max-width: 640px) { .azrow .fig { display: none; } }
</style>
