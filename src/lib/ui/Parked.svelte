<script lang="ts">
  /**
   * The changes the fold parked for one record: stamped more than two days past their arrival (PARK_MS) by a device whose clock was
   * wrong, kept in the log and never folded on their own (round fifty-two, 1). Apply writes the same values as edits made
   * now, so every device takes them; Dismiss leaves them in the log, unlisted here.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { hlcWall, type Kind } from '$core/log';
  import { localDate } from '$core/dates';
  import { fieldWords } from './held-words';
  let { kind, id }: { kind: Kind; id: string } = $props();
  const parked = $derived(collection.parkedFor(kind, id));
  const when = $derived(parked.length ? localDate(new Date(Math.max(...parked.map((c) => hlcWall(c.t))))) : '');
  const what = $derived(fieldWords(kind, parked).join(', ')); // the fields in words, a notes edit's base with its notes (round sixty-one)
  let busy = $state(false);
  async function go(apply: boolean) {
    if (busy) return;
    busy = true;
    try { if (apply) await collection.applyParked(kind, id); else await collection.dismissParked(kind, id); } finally { busy = false; }
  }
</script>

{#if parked.length}
  <div class="notice parked" role="status">
    {parked.length === 1 ? 'An edit' : `${parked.length} edits`} from a device whose clock was wrong (dated {when}: {what}) {parked.length === 1 ? 'was' : 'were'} not applied.
    <button class="btn small" type="button" onclick={() => go(true)} disabled={busy}>Apply {parked.length === 1 ? 'it' : 'them'} now</button>
    <button class="linkish" type="button" onclick={() => go(false)} disabled={busy}>Leave {parked.length === 1 ? 'it' : 'them'}</button>
  </div>
{/if}

<style>
  .parked { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 10px 0 0; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; min-height: 36px; }
</style>
