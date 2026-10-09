<script lang="ts">
  /**
   * The species page is keyed by its address, as the record pages are (round sixty-two; outside review A13). SvelteKit
   * keeps a page's component when only the slug changes, so a notes draft open on one species followed a related-species
   * tile to the next, and Save wrote it over that species' notes. Keyed, a navigation to another species makes the page
   * afresh: the editor closed and the draft dropped, after the leave guard has asked.
   */
  import { page } from '$app/state';
  let { children } = $props();
</script>

{#key page.params.slug}{@render children()}{/key}
