<!--
  The line a page shows until the collection opens, or, when the browser refused the storage it is kept in, why it
  cannot open (round sixty-nine; triage-68 R3, the self-review's D4, R46-18). The refusal was said on Today and Backup
  only: My plants, Places, Propagation, a plant's and a place's page and Labels said "Opening your collection…" for good,
  which is an absence where there was a refusal (rule 2). One place, so every page that waits for the collection says it.
-->
<script lang="ts">
  import { collection } from './collection.svelte';
  /** The waiting line's own class on the page that shows it ("muted", "none"). */
  let { cls = 'muted' }: { cls?: string } = $props();
</script>

{#if collection.failed}<p class="notice err" role="alert" data-opening="failed">{collection.failed}</p>{:else}<p class={cls}>Opening your collection…</p>{/if}
