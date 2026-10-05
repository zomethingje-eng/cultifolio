<script lang="ts">
  /**
   * Changes held because they are dated ahead of this device's clock (a peer's, or a restored file's), said wherever
   * records are listed: a never-synced device that restored a fast-clock backup showed an empty list while the report
   * said "1 plant added", and the held changes were named only on the sync page (round sixty; the self-review's 8,
   * decision 2). The wording is the lead's.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { heldWords } from '$lib/ui/held-words';
</script>

{#if collection.heldWaiting > 0}
  <p class="notice heldnote" id="held-notice" role="status">{heldWords(collection.heldWaiting)} <a href="/sync#held">Details on the sync page</a>.</p>
{/if}

<style>
  .heldnote { margin: 8px 0 10px; }
</style>
