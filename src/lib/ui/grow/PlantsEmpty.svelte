<script lang="ts">
  /**
   * One more way in on an empty My plants (round sixty; the grower review's 2, the product review's 4): bring a list or a
   * spreadsheet in. The example collection, which stood here, heads the page now (round sixty-three, V2). In the example
   * (its plants all removed) the import leads out of it first, as every add does (round sixty-seven; triage-66 V1).
   */
  import { addLeavesExample } from './example.svelte';
</script>

<div class="growempty">
  <p><b>Already keep a list?</b> <a href="/plants/import" id="empty-import" onclick={(e) => addLeavesExample(e, '/plants/import')}>Import it</a>: paste one name per line, or choose a spreadsheet saved as CSV.</p>
</div>

<style>
  .growempty { display: grid; gap: 8px; margin: 0 0 12px; font-size: var(--fs-md); }
  .growempty p { margin: 0; }
</style>
