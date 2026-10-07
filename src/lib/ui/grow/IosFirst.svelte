<script lang="ts">
  /**
   * On an iPhone or iPad, in a browser tab, before the first plant: the Home Screen first (round sixty; the product review's
   * 5, the self-review's 18). Safari can clear a site's storage after a week without a visit, and the Home Screen app keeps
   * storage of its own that a tab's plants do not move into, so the step that keeps the plants is the one taken before
   * there are any. Shown on My plants and the add and import pages until a plant exists; put away for this tab on request.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { collection } from '$lib/db/collection.svelte';
  import { inDemo } from '$lib/db/demo';
  import { iosInBrowser } from './ios';
  const HIDDEN = 'cultifolio.iosFirstHidden';
  /** Whether the card is showing: the install bar stands down while it is, so the same advice is not given twice. */
  let { shown = $bindable(false) }: { shown?: boolean } = $props();
  let ios = $state(false);
  let hidden = $state(false);
  onMount(() => {
    ios = iosInBrowser();
    try { hidden = sessionStorage.getItem(HIDDEN) === '1'; } catch { /* shown */ }
  });
  const show = $derived(ios && !hidden && !inDemo() && /^\/plants(\/new|\/import)?\/?$/.test(page.url.pathname) && collection.ready && collection.accessions.length === 0);
  $effect(() => { shown = show; });
  function hide() {
    hidden = true;
    try { sessionStorage.setItem(HIDDEN, '1'); } catch { /* fine */ }
  }
</script>

{#if show}
  <div class="iosfirst" role="region" aria-label="Before your first plant" id="ios-first">
    <p><b>On iPhone, add Cultifolio to your Home Screen before adding plants:</b> Safari can clear a website's data after a week without a visit, and the Home Screen app keeps its own.</p>
    <p class="how">In Safari, tap <span aria-hidden="true">⎋</span> Share, then <b>Add to Home Screen</b>, and open Cultifolio from there. <button class="linkish" type="button" onclick={hide}>Not now</button></p>
  </div>
{/if}

<style>
  .iosfirst { margin: 14px 0 0; padding: 10px 14px; background: var(--card); border: 1px solid var(--accent); border-radius: var(--r-lg); font-size: var(--fs-md); line-height: 1.45; }
  .iosfirst p { margin: 0; }
  .iosfirst .how { margin-top: 6px; color: var(--ink2); }
  .linkish { background: none; border: 0; padding: 0 0 0 6px; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  @media print { .iosfirst { display: none !important; } } /* advice for the screen, not for paper (round sixty-one) */
</style>
