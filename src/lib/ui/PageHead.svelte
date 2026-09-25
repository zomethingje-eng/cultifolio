<script lang="ts">
  /**
   * The one head every list page wears, so the pages read as one site: the kicker and the places control on top, the
   * title with at most one action beside it, one line under the title saying what the page is for, and the count in
   * the mono style only where a count matters. The five places live in the top bar (and the phone's tab bar), so they
   * are one tap away from a plant or a bench too, not only from a list page. A detail page has its own head (the id card).
   */
  let { title, sub, subline, count, places = true, kick = 'Cultifolio', children }: { title: string; sub?: string; subline?: import('svelte').Snippet; count?: string; places?: boolean; kick?: string; children?: import('svelte').Snippet } = $props();
</script>

<header class="phead">
  <div class="kick">{kick}</div>
  <div class="titlerow">
    <h1 class="q">{title}</h1>
    {#if children}<div class="acts">{@render children()}</div>{/if}
  </div>
  {#if subline}<p class="secsub">{@render subline()}</p>{:else if sub}<p class="secsub">{sub}</p>{/if}
  {#if count}<p class="seccount">{count}</p>{/if}
</header>

<style>
  .phead { margin: 22px 0 18px; }
  .titlerow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .titlerow h1 { margin: 0; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .phead :global(.secsub) { margin: 6px 0 0; }
  .phead :global(.seccount) { margin: 6px 0 0; }
  @media (max-width: 700px) { .phead { margin-top: 16px; } .titlerow { margin-top: 2px; } }
</style>
