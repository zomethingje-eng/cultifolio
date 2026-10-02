<script lang="ts">
  /**
   * The one head every list page wears, so the pages read as one site: the kicker and the places control on top, the
   * title with at most one action beside it, one line under the title saying what the page is for, and the count in
   * the mono style only where a count matters. The five places live in the top bar (and the phone's tab bar), so they
   * are one tap away from a plant or a bench too, not only from a list page. A detail page has its own head (the id card).
   */
  /** `compact`: on a phone the head is one line, the title with the count beside it; the kicker and the sentence are for wider screens, where there is room (round fifty, 1). A list page's first screen is for its list. */
  let { title, sub, subline, count, places = true, kick = 'Cultifolio', compact = false, children }: { title: string; sub?: string; subline?: import('svelte').Snippet; count?: string; places?: boolean; kick?: string; compact?: boolean; children?: import('svelte').Snippet } = $props();
</script>

<header class="phead" class:compact>
  <div class="kick">{kick}</div>
  <div class="titlerow">
    <h1 class="q">{title}</h1>
    {#if compact && count}<span class="inlinecount seccount">{count}</span>{/if}
    {#if children}<div class="acts">{@render children()}</div>{/if}
  </div>
  {#if subline}<p class="secsub">{@render subline()}</p>{:else if sub}<p class="secsub">{sub}</p>{/if}
  {#if count}<p class="seccount fullcount">{count}</p>{/if}
</header>

<style>
  .phead { margin: 22px 0 18px; }
  .titlerow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .titlerow h1 { margin: 0; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .phead :global(.secsub) { margin: 6px 0 0; }
  .phead :global(.seccount) { margin: 6px 0 0; }
  .inlinecount { display: none; margin: 0; }
  @media (max-width: 700px) {
    .phead { margin-top: 16px; } .titlerow { margin-top: 2px; }
    .phead.compact { margin: 12px 0 10px; }
    .phead.compact .kick, .phead.compact :global(.secsub), .phead.compact .fullcount { display: none; }
    .phead.compact .titlerow { align-items: baseline; justify-content: flex-start; flex-wrap: nowrap; }
    .phead.compact .titlerow h1 { font-size: 26px; }
    .phead.compact .inlinecount { display: inline; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .phead.compact .acts { margin-left: auto; flex: none; }
    .phead.compact .titlerow h1 { white-space: nowrap; }
    /* With an action beside the title there is no room for the count on the line: it goes under, small (round fifty, 4). */
    .phead.compact .titlerow:has(.acts > :global(:not(.wideonly))) .inlinecount { display: none; }
    .phead.compact:has(.titlerow .acts > :global(:not(.wideonly))) .fullcount { display: block; margin-top: 2px; }
    .phead.compact .acts > :global(.wideonly) { display: none; } /* an action the phone has elsewhere, such as the + in the top bar */
    .phead.compact .acts :global(.btn) { padding: 7px 13px; font-size: 13px; min-height: 36px; }
  }
</style>
