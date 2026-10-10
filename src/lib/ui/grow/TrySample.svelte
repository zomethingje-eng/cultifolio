<script lang="ts">
  /**
   * "See the example collection" (round sixty; the product review's 3; worded "example" in round sixty-three, V2): the
   * visitor's way to see My plants, Today and a plant's page filled in before keeping a single plant. The example is a
   * database of its own, chosen at page load and deleted whole on leaving; nothing of it reaches the grower's own
   * collection, a backup or sync. At the head of the empty My plants page, where it opens the example on that page.
   */
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  import { enterExample, notEnteredWords, type NotEntered } from './example.svelte';
  let { note = true, to = '/plants' }: { note?: boolean; to?: string } = $props();
  let demo = $state(false);
  let refused = $state<NotEntered | null>(null);
  $effect(() => { demo = PAGE_IN_DEMO; }); // the page's collection, not the tab's flag of the moment (round sixty-seven; triage-66 V3)
</script>

{#if !demo}
  <p class="trysample">
    <button class="btn pri" type="button" id="try-sample" onclick={() => { const r = enterExample(to); refused = r === true ? null : r; }}>See the example collection</button>
    {#if note}<span class="muted">Twelve plants in a greenhouse and on a windowsill, with a seed batch, so you can see what each page does. Nothing in it is yours, and leaving deletes it.</span>{/if}
  </p>
  {#if refused}<p class="small" role="status">{notEnteredWords(refused)}</p>{/if}
{/if}

<style>
  .trysample { margin: 0; display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; font-size: var(--fs-md); }
  .trysample .btn { min-height: var(--tap); white-space: normal; max-width: 100%; height: auto; text-align: start; } /* wraps at 200% text on a 320 px screen (round sixty) */
  .muted { color: var(--ink3); }
</style>
