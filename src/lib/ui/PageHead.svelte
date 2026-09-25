<script lang="ts">
  /**
   * The one head every list page wears, so the pages read as one site: the kicker and the places control on top, the
   * title with at most one action beside it, one line under the title saying what the page is for, and the count in
   * the mono style only where a count matters. The five places are always shown, so a visitor sees the whole shape of
   * the app at once. A detail page has its own head (the id card); settings and the like pass `places={false}`.
   */
  import { page } from '$app/state';
  let { title, sub, subline, count, places = true, kick = 'Cultifolio', children }: { title: string; sub?: string; subline?: import('svelte').Snippet; count?: string; places?: boolean; kick?: string; children?: import('svelte').Snippet } = $props();
  const PLACES = [
    { href: '/', label: 'Species', on: (p: string) => p === '/' || p.startsWith('/species') },
    { href: '/plants', label: 'My plants', on: (p: string) => p.startsWith('/plants') },
    { href: '/benches', label: 'Benches', on: (p: string) => p.startsWith('/benches') },
    { href: '/sowings', label: 'Sowings', on: (p: string) => p.startsWith('/sowings') },
    { href: '/frost', label: 'Frost', on: (p: string) => p.startsWith('/frost') }
  ];
</script>

<header class="phead">
  <div class="kick">{kick}</div>
  {#if places}
    <nav class="seg topseg" aria-label="Places">
      {#each PLACES as pl}<a href={pl.href} class:on={pl.on(page.url.pathname)}>{pl.label}</a>{/each}
    </nav>
  {/if}
  <div class="titlerow">
    <h1 class="q">{title}</h1>
    {#if children}<div class="acts">{@render children()}</div>{/if}
  </div>
  {#if subline}<p class="secsub">{@render subline()}</p>{:else if sub}<p class="secsub">{sub}</p>{/if}
  {#if count}<p class="seccount">{count}</p>{/if}
</header>

<style>
  .phead { margin: 22px 0 18px; }
  .titlerow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .titlerow h1 { margin: 0; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .phead :global(.secsub) { margin: 6px 0 0; }
  .phead :global(.seccount) { margin: 6px 0 0; }
  @media (max-width: 700px) { .topseg { display: none; } .phead { margin-top: 16px; } .titlerow { margin-top: 2px; } }
</style>
