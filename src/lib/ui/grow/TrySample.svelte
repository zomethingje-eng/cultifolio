<script lang="ts">
  /**
   * "Try it with a sample collection" (round sixty; the product review's 3): the visitor's way to see My plants, Today and
   * a plant's page filled in before keeping a single plant. The sample is a database of its own, chosen at page load and
   * deleted whole on leaving; nothing of it reaches the grower's own collection, a backup or sync. Used on the empty My
   * plants page; the front page offers it in its welcome line (round sixty).
   */
  import { enterDemo, inDemo } from '$lib/db/demo';
  let { note = true }: { note?: boolean } = $props();
  let demo = $state(false);
  $effect(() => { demo = inDemo(); });
</script>

{#if !demo}
  <p class="trysample">
    <button class="btn small" type="button" id="try-sample" onclick={() => enterDemo('/plants')}>Try it with a sample collection</button>
    {#if note}<span class="muted">Twelve plants in a greenhouse and on a windowsill, with a seed batch. Nothing in it is yours, and leaving deletes it.</span>{/if}
  </p>
{/if}

<style>
  .trysample { margin: 0; display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; font-size: var(--fs-md); }
  .trysample .btn { min-height: var(--tap); white-space: normal; max-width: 100%; height: auto; text-align: start; } /* wraps at 200% text on a 320 px screen (round sixty) */
  .muted { color: var(--ink3); }
</style>
