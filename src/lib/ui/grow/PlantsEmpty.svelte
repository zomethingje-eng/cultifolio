<script lang="ts">
  /**
   * Two more ways in on an empty My plants (round sixty; the grower review's 2, the product review's 3 and 4): bring a list
   * or a spreadsheet in, or look around a sample collection first. The sample is a database of its own, deleted whole on
   * leaving; nothing of it reaches this collection.
   */
  import TrySample from './TrySample.svelte';
</script>

<div class="growempty">
  <p><b>Already keep a list?</b> <a href="/plants/import" id="empty-import">Import it</a>: paste one name per line, or choose a spreadsheet saved as CSV.</p>
  <TrySample />
</div>

<style>
  .growempty { display: grid; gap: 8px; margin: 0 0 12px; font-size: var(--fs-md); }
  .growempty p { margin: 0; }
</style>
