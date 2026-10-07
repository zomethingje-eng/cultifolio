<script lang="ts">
  /**
   * The record's page is keyed by its address (round sixty-one; decision 2, the records review's 1). SvelteKit keeps a
   * page's component when only the route's parameter changes, so an edit form or a notes draft open on one record
   * followed the app's own links (the shared-number notice, a place's own rows, Back) to another record, and Save wrote
   * it there. Keyed, a navigation to another record makes the page afresh: every form closed, every draft dropped, as
   * the leave guard's question says.
   */
  import { page } from '$app/state';
  let { children } = $props();
</script>

{#key page.params.acc}{@render children()}{/key}
