<script lang="ts">
  /**
   * One line over an add form opened inside the example (round sixty-seven; triage-66 V1; S-A1, R45-1): what is added
   * here joins the example and is deleted with it, and "Keep it as my own" leaves the example for the same form in the
   * grower's own collection, with what the form reads from its address (the species, a place's name) carried there. A
   * visitor's first plant was numbered after the example's twelve, under a bar that said their own had not begun, and
   * deleted on Leave. Drawn only in the example; the "+" and the other adds lead out before the form is reached, so this
   * is for a form reached by its address or the browser's history.
   */
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  import { example, leaveExample } from './example.svelte';
  let { what, keep }: { what: 'plant' | 'batch' | 'place'; /** the form's address in the grower's own collection, with what is typed */ keep: () => string } = $props();
  const noun = { plant: 'A plant', batch: 'A batch', place: 'A place' } as const;
</script>

{#if PAGE_IN_DEMO}
  <p class="exampleadd" id="example-add-line">
    <span>{noun[what]} added here joins the example collection and is deleted with it.</span>
    <button class="btn small pri" type="button" id="example-keep" onclick={() => leaveExample(keep())} disabled={example.leaving}>Keep it as my own</button>
  </p>
{/if}

<style>
  .exampleadd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 12px 0 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--card); border-radius: var(--r); font-size: var(--fs-md); }
  .exampleadd .btn { min-height: var(--tap); white-space: normal; height: auto; }
</style>
