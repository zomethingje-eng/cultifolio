<script lang="ts">
  /**
   * Selection on My plants (round sixty; the grower review's §4, the self-review's experience item 10): "Select", tick the
   * plants, then Water, Move to a place, Print labels or Archive the ones ticked. Each action is one commit through the
   * collection's own functions, as the single plant's is, with the Undo the single action has (Water, Move); Archive asks
   * once first, as the plant page does. While selecting, this list of tick rows stands in for the plain rows.
   */
  import { goto } from '$app/navigation';
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, type Accession } from '$lib/db/types';
  import { localDate } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  let { plants }: { plants: Accession[] } = $props();
  let on = $state(false);
  let picked = $state<Set<string>>(new Set());
  let busy = $state(false);
  let moving = $state(false);
  let moveTo = $state<string | null>(null);
  let confirmArchive = $state(false);
  $effect(() => {
    if (!on) return;
    document.body.classList.add('grow-selecting');
    return () => document.body.classList.remove('grow-selecting');
  });
  // What is ticked is what is listed: a plant filtered out of view is not acted on unseen.
  const chosen = $derived(plants.filter((a) => picked.has(a.id)));
  const growing = $derived(chosen.filter((a) => a.status === 'growing'));
  function toggle(id: string) {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else n.add(id);
    picked = n;
  }
  const allOn = $derived(plants.length > 0 && plants.every((a) => picked.has(a.id)));
  function all() {
    picked = allOn ? new Set() : new Set(plants.map((a) => a.id));
  }
  function stop() {
    on = false; picked = new Set(); moving = false; confirmArchive = false;
  }
  async function water() {
    const today = localDate();
    const list = growing.filter((a) => collection.lastWatered(a.id) !== today); // one watering a day, as the single Water
    if (!list.length) { toast.show(growing.length ? 'Already recorded as watered today.' : 'Nothing growing is ticked.'); return; }
    busy = true;
    try {
      const ids = await collection.addEventsIds(list.map((a) => ({ acc: a.id, d: today, t: 'water' as const })));
      const skipped = growing.length - list.length;
      toast.show(`${ids.length} watered${skipped ? `; ${skipped} already were today` : ''}.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents(ids).then(() => toast.show(`Undone: ${ids.length} watering line${ids.length === 1 ? '' : 's'} removed.`)); } });
    } finally {
      busy = false;
    }
  }
  async function move() {
    if (!chosen.length) return;
    busy = true;
    try {
      const to = moveTo ?? null;
      const { n, undo } = await collection.movePlantsUndoable(chosen.filter((a) => a.status !== 'dead').map((a) => a.id), to);
      moving = false;
      toast.show(n ? `${n} moved to ${to ? collection.locationName(to) : 'no place'}.` : 'Already there.', 8000, n ? { label: 'Undo', run: () => { void undo().then(() => toast.show('Undone: back where they were.')); } } : null);
    } finally {
      busy = false;
    }
  }
  async function archive() {
    confirmArchive = false;
    const list = growing;
    if (!list.length) return;
    busy = true;
    try {
      // The status and its line on each plant, all in one commit: all are archived or none is.
      const d = localDate();
      const [first, ...rest] = list;
      await collection.putWith('accession', first.id, { status: 'archived' }, list.map((a) => ({ acc: a.id, d, t: 'note' as const, note: 'Archived' })), rest.map((a) => ({ kind: 'accession' as const, id: a.id, fields: { status: 'archived' } })));
      toast.show(`${list.length} archived, and logged.`);
      picked = new Set([...picked].filter((id) => !list.some((a) => a.id === id)));
    } finally {
      busy = false;
    }
  }
</script>

<div class="selhead">
  <button class="btn small" type="button" id="select-toggle" aria-pressed={on} onclick={() => (on ? stop() : (on = true))}>{on ? 'Done selecting' : 'Select'}</button>
  {#if on}<button class="btn small" type="button" onclick={all}>{allOn ? 'Untick all' : `Tick all ${plants.length}`}</button><span class="muted small" aria-live="polite">{chosen.length} ticked</span>{/if}
</div>

{#if on}
  <ul class="selrows" aria-label="Plants to select">
    {#each plants as a (a.id)}
      <li><label class="selrow"><input type="checkbox" checked={picked.has(a.id)} onchange={() => toggle(a.id)} /><span class="accno">{accNo(a)}</span> <SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}{#if a.locationId}<span class="muted where"> · {collection.locationName(a.locationId)}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</label></li>
    {/each}
  </ul>
  <div class="selbar" role="toolbar" aria-label="For the ticked plants">
    {#if moving}
      <div class="moveto"><LocationPicker bind:value={moveTo} id="sel-loc" label="Move to" /><button class="btn pri" type="button" onclick={move} disabled={busy || !chosen.length}>Move {chosen.length}</button><button class="btn" type="button" onclick={() => (moving = false)}>Cancel</button></div>
    {:else if confirmArchive}
      <span>Archive {growing.length}? They leave the growing list and can be marked growing again.</span><button class="btn" type="button" id="sel-archive-yes" onclick={archive} disabled={busy}>Yes, archive</button><button class="btn" type="button" onclick={() => (confirmArchive = false)}>Keep</button>
    {:else}
      <button class="btn pri" type="button" id="sel-water" onclick={water} disabled={busy || !growing.length}>Water</button>
      <button class="btn" type="button" id="sel-move" onclick={() => { moveTo = null; moving = true; }} disabled={busy || !chosen.length}>Move to a place</button>
      <button class="btn" type="button" id="sel-labels" onclick={() => goto('/labels?acc=' + chosen.map((a) => a.id).join(','))} disabled={!chosen.length}>Print labels</button>
      <button class="btn" type="button" id="sel-archive" onclick={() => (confirmArchive = true)} disabled={busy || !growing.length}>Archive</button>
    {/if}
  </div>
{/if}

<style>
  .selhead { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; flex-wrap: wrap; }
  .selhead .btn { min-height: var(--tap); }
  .selrows { list-style: none; margin: 0 0 12px; padding: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  .selrows li + li { border-top: 1px solid var(--rule); }
  .selrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; min-height: var(--tap); cursor: pointer; }
  .selrow input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); flex: none; }
  .where { font-size: var(--fs-md); }
  .selbar { position: sticky; bottom: calc(env(safe-area-inset-bottom, 0px) + 72px); z-index: 5; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .selbar .btn { min-height: var(--tap); }
  .moveto { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  /* The plain rows give way to the tick rows while selecting. */
  :global(body.grow-selecting #main .rows), :global(body.grow-selecting #main .more) { display: none; }
</style>
