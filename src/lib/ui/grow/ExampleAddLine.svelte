<script lang="ts">
  /**
   * One line over an add form opened inside the example (round sixty-seven; triage-66 V1; S-A1, R45-1): what is added
   * here joins the example and is deleted with it, and "Keep it as my own" leaves the example for the same form in the
   * grower's own collection. A visitor's first plant was numbered after the example's twelve, under a bar that said their
   * own had not begun, and deleted on Leave. Drawn only in the example; the "+" and the other adds lead out before the
   * form is reached, so this is for a form reached by its address or the browser's history.
   *
   * Everything typed goes with it, the place included, through the tab's session storage and never the address
   * (round sixty-nine; triage-68 X3; `keep-draft.ts`); the form's own "Leave site?" is set aside while it goes (`hold`).
   */
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  import { example } from './example.svelte';
  import { keepAsOwn, type Draft } from './keep-draft';
  let { what, draft, hold }: {
    what: 'plant' | 'batch' | 'place';
    /** what the form holds now: its fields, and its place by name and kind */
    draft: () => Omit<Draft, 'form'>;
    /** the form's own unload guard, set aside (true) while it leaves and put back (false) if the Leave does not happen */
    hold?: (on: boolean) => void;
  } = $props();
  const noun = { plant: 'A plant', batch: 'A batch', place: 'A place' } as const;
</script>

{#if PAGE_IN_DEMO}
  <p class="exampleadd" id="example-add-line">
    <span>{noun[what]} added here joins the example collection and is deleted with it.</span>
    <button class="btn small pri" type="button" id="example-keep" onclick={() => void keepAsOwn({ form: what, ...draft() }, hold)} disabled={example.leaving}>Keep it as my own</button>
  </p>
{/if}

<style>
  .exampleadd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 12px 0 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--card); border-radius: var(--r); font-size: var(--fs-md); }
  .exampleadd .btn { min-height: var(--tap); white-space: normal; height: auto; }
</style>
