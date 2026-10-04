<script lang="ts">
  /**
   * Texts of a plant's or a batch's notes that an edit replaced without having seen them: two devices edited the notes
   * apart, and last-writer-wins kept one. Read from the log each time the notes change (src/lib/core/notes.ts); nothing
   * is written (round fifty-eight; rule 5). Before this round the device that lost its text wrote a line on the plant's
   * log when a pull or a file replaced it.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { hlcWall } from '$core/log';
  import { localDate } from '$core/dates';
  import type { ReplacedNotes } from '$core/notes';
  let { kind, id }: { kind: 'accession' | 'sowing'; id: string } = $props();
  let found = $state<ReplacedNotes[]>([]);
  // Read again when the notes' stamp moves (an edit here, a pull, another tab), and a late answer for an older stamp is dropped.
  const stamp = $derived(collection.ready ? collection.notesStamp(kind, id) : null);
  let asked = 0;
  $effect(() => {
    void stamp;
    const seq = ++asked;
    collection.replacedNotes(kind, id).then((r) => { if (seq === asked) found = r; }, () => {});
  });
</script>

{#if found.length}
  <details class="replaced">
    <summary>{found.length === 1 ? 'An earlier text was' : `${found.length} earlier texts were`} replaced by an edit made without seeing {found.length === 1 ? 'it' : 'them'}</summary>
    {#each [...found].reverse() as r (r.was)}
      <div class="was"><span class="when">Replaced {localDate(new Date(hlcWall(r.by)))}; written {localDate(new Date(hlcWall(r.was)))}</span><p>{r.text}</p></div>
    {/each}
  </details>
{/if}

<style>
  .replaced { margin: 10px 0 0; font-size: var(--fs-md); color: var(--ink2); }
  .replaced summary { cursor: pointer; min-height: 36px; display: flex; align-items: center; }
  .was { border-left: 2px solid var(--rule); padding: 2px 0 2px 10px; margin: 8px 0; }
  .when { font-family: var(--mono); font-size: var(--fs-sm); color: var(--ink3); }
  .was p { margin: 4px 0 0; white-space: pre-wrap; color: var(--ink); }
</style>
