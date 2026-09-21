<script lang="ts">
  /** The head of a list page: kicker, the segmented control between the app's places, a sentence on what the page is for, the count, the title. */
  import { page } from '$app/state';
  import { collection } from '$lib/db/collection.svelte';
  let { title, sub, count, children }: { title: string; sub?: string; count?: string; children?: import('svelte').Snippet } = $props();
  const hasPlants = $derived(collection.ready && collection.accessions.length > 0);
  const shown = (pl: { href: string; on: (p: string) => boolean }) => hasPlants || pl.href === '/' || pl.href === '/plants' || pl.on(page.url.pathname);
  const places = [
    { href: '/', label: 'Species', on: (p: string) => p === '/' || p.startsWith('/species') },
    { href: '/plants', label: 'My plants', on: (p: string) => p.startsWith('/plants') },
    { href: '/benches', label: 'Benches', on: (p: string) => p.startsWith('/benches') },
    { href: '/sowings', label: 'Sowings', on: (p: string) => p.startsWith('/sowings') },
    { href: '/frost', label: 'Frost', on: (p: string) => p.startsWith('/frost') }
  ];
</script>

<div class="kick" style="margin-top: 22px">Cultifolio</div>
<!-- A visitor with no plants sees two places; benches, sowings and frost mean nothing until there is a plant, and stay in the menu. -->
<nav class="seg topseg" aria-label="Places">
  {#each places.filter((pl) => shown(pl)) as pl}<a href={pl.href} class:on={pl.on(page.url.pathname)}>{pl.label}</a>{/each}
</nav>
{#if sub}<p class="secsub">{sub}</p>{/if}
{#if count}<p class="seccount">{count}</p>{/if}
<div class="titlerow">
  <h1 class="q">{title}</h1>
  {#if children}<div class="acts">{@render children()}</div>{/if}
</div>

<style>
  .titlerow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .titlerow h1 { margin-bottom: 4px; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 700px) { .topseg { display: none; } }
</style>
