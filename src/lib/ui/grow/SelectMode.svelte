<script lang="ts">
  /**
   * Selection on My plants (round sixty; the grower review's §4, the self-review's experience item 10): "Select", tick the
   * plants, then Water, Move to a place, Print labels or Archive the ones ticked. Each action is one commit through the
   * collection's own functions, as the single plant's is, with the Undo the single action has (Water, Move, and since
   * round sixty-one Archive); Archive asks once first, as the plant page does. While selecting, this list of tick rows
   * stands in for the plain rows.
   *
   * The buttons are never `disabled`: a disabled button drops keyboard focus to the page, and the toast then has no
   * origin for Tab to come back to; they say `aria-disabled` and do nothing (or say why) while it holds, and each panel
   * that replaces a button hands focus to what replaced it and back (round sixty-one; the accessibility review, 2).
   */
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, type Accession } from '$lib/db/types';
  import { localDate } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import { focusNext } from '$lib/ui/focus';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  /** `start`: open in select mode, as `/plants?place=<id>&select=1` asks (round sixty-one; the grower review, 7). */
  let { plants, start = false }: { plants: Accession[]; start?: boolean } = $props();
  let on = $state(false);
  onMount(() => { if (start) on = true; });
  let picked = $state<Set<string>>(new Set());
  let busy = $state(false);
  let moving = $state(false);
  /**
   * Where Move takes the plants: '' until the grower chooses, 'none' for no place, else a place's id. It started on
   * "No place", and one more Enter moved the ticked plants out of their places (round sixty-one; the accessibility
   * review, 9).
   */
  let moveTo = $state('');
  let moveWhy = $state('');
  let confirmArchive = $state(false);
  $effect(() => {
    if (!on) return;
    document.body.classList.add('grow-selecting');
    return () => document.body.classList.remove('grow-selecting');
  });
  // What is ticked is what is listed: a plant filtered out of view is not acted on unseen.
  const chosen = $derived(plants.filter((a) => picked.has(a.id)));
  const growing = $derived(chosen.filter((a) => a.status === 'growing'));
  /** The places as the picker lists them: the tree depth-first, each by its full path, as the plant form's picker does. */
  const places = $derived.by(() => {
    const out: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const walk = (parent: string | null) => {
      for (const l of collection.children(parent)) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        out.push({ id: l.id, label: collection.locationName(l.id) || l.name });
        walk(l.id);
      }
    };
    walk(null);
    return out;
  });
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
    if (busy) return;
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
  /** Move opens on the picker, with nothing chosen yet. */
  async function openMove() {
    if (busy) return;
    if (!chosen.length) { toast.show('Nothing is ticked.'); return; }
    moveTo = ''; moveWhy = ''; moving = true;
    await focusNext('#sel-loc');
  }
  async function closeMove() {
    moving = false; moveWhy = '';
    await focusNext('#sel-move');
  }
  async function move() {
    if (busy || !chosen.length) return;
    if (!moveTo) { moveWhy = 'Choose a place first, or "No place".'; await focusNext('#sel-loc'); return; }
    busy = true;
    try {
      const to = moveTo === 'none' ? null : moveTo;
      const { n, undo } = await collection.movePlantsUndoable(chosen.filter((a) => a.status !== 'dead').map((a) => a.id), to);
      // Focus to the button the panel gives way to before the toast is raised, so the toast's origin is that button and
      // Tab reaches its Undo (round sixty-one; the accessibility review, 2).
      await closeMove();
      toast.show(n ? `${n} moved to ${to ? collection.locationName(to) : 'no place'}.` : 'Already there.', 8000, n ? { label: 'Undo', run: () => { void undo().then(() => toast.show('Undone: back where they were.')); } } : null);
    } finally {
      busy = false;
    }
  }
  async function askArchive() {
    if (busy) return;
    if (!growing.length) { toast.show('Nothing growing is ticked.'); return; }
    confirmArchive = true;
    await focusNext('#sel-archive-keep'); // the question's safe answer first: Enter twice does not archive
  }
  async function keep() {
    confirmArchive = false;
    await focusNext('#sel-archive');
  }
  async function archive() {
    if (busy) return;
    confirmArchive = false;
    const list = growing;
    if (!list.length) return;
    busy = true;
    try {
      // The status and its line on each plant, all in one commit: all are archived or none is.
      const d = localDate();
      const [first, ...rest] = list;
      const before = new Set(list.flatMap((a) => collection.events(a.id).map((e) => e.id)));
      await collection.putWith('accession', first.id, { status: 'archived' }, list.map((a) => ({ acc: a.id, d, t: 'note' as const, note: 'Archived' })), rest.map((a) => ({ kind: 'accession' as const, id: a.id, fields: { status: 'archived' } })));
      // The lines this commit wrote, found as the ones that were not there before it, so the Undo takes away exactly those.
      const lines = list.flatMap((a) => collection.events(a.id).filter((e) => !before.has(e.id) && e.t === 'note' && e.note === 'Archived').map((e) => e.id));
      picked = new Set([...picked].filter((id) => !list.some((a) => a.id === id)));
      await focusNext('#sel-archive');
      toast.show(`${list.length} archived, and logged.`, 8000, { label: 'Undo', run: () => { void unarchive(list.map((a) => a.id), lines); } });
    } finally {
      busy = false;
    }
  }
  /**
   * Archive's Undo (round sixty-one; the grower review, 8; the accessibility review, 9; review B3): the plants still
   * archived go back to growing in one commit, as the archive went, then the "Archived" lines it wrote are taken away, as
   * the plant page's death Undo does. A plant marked otherwise since is left as it is.
   */
  async function unarchive(ids: string[], lines: string[]) {
    const back = ids.filter((id) => collection.accession(id)?.status === 'archived');
    if (back.length) {
      const [first, ...rest] = back;
      await collection.putWith('accession', first, { status: 'growing' }, [], rest.map((id) => ({ kind: 'accession' as const, id, fields: { status: 'growing' } })));
    }
    await collection.removeEvents(lines);
    toast.show(`Undone: ${back.length} growing again, the archive line${lines.length === 1 ? '' : 's'} removed.`);
  }
  function labels() {
    if (!chosen.length) { toast.show('Nothing is ticked.'); return; }
    void goto('/labels?acc=' + chosen.map((a) => a.id).join(','));
  }
</script>

<div class="selhead">
  <!-- The words say the state; aria-pressed as well read "Done selecting, toggle button, pressed" (round sixty-one; the accessibility review, 11). -->
  <button class="btn small" type="button" id="select-toggle" onclick={() => (on ? stop() : (on = true))}>{on ? 'Done selecting' : 'Select'}</button>
  {#if on}<button class="btn small" type="button" onclick={all}>{allOn ? 'Untick all' : `Tick all ${plants.length}`}</button><span class="muted small" aria-live="polite">{chosen.length} ticked</span>{/if}
</div>

{#if on}
  <ul class="selrows" aria-label="Plants to select">
    {#each plants as a (a.id)}
      <li><label class="selrow"><input type="checkbox" checked={picked.has(a.id)} onchange={() => toggle(a.id)} /><span class="accno">{accNo(a)}</span> <SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}{#if a.locationId}<span class="muted where"> · {collection.locationName(a.locationId)}</span>{/if}{#if a.status !== 'growing'}<span class="pill">{a.status}</span>{/if}</label></li>
    {/each}
  </ul>
  <!-- A group, not a toolbar: a toolbar promises the arrow keys, and each button here is its own Tab stop (round sixty-one; the accessibility review, 11). -->
  <div class="selbar" role="group" aria-label="For the ticked plants">
    {#if moving}
      <div class="moveto">
        <label class="movelab" for="sel-loc">Move to</label>
        <select id="sel-loc" bind:value={moveTo} onchange={() => (moveWhy = '')} aria-describedby={moveWhy ? 'sel-move-why' : undefined}>
          <option value="" disabled>Choose a place…</option>
          <option value="none">No place</option>
          {#each places as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
        </select>
        <button class="btn pri" type="button" id="sel-move-go" onclick={move} aria-disabled={busy || !chosen.length || !moveTo}>Move {chosen.length}</button><button class="btn" type="button" onclick={closeMove}>Cancel</button>
        {#if moveWhy}<span class="small why" id="sel-move-why">{moveWhy}</span>{/if}
      </div>
    {:else if confirmArchive}
      <span>Archive {growing.length}? They leave the growing list and can be marked growing again.</span><button class="btn" type="button" id="sel-archive-yes" onclick={archive} aria-disabled={busy}>Yes, archive</button><button class="btn" type="button" id="sel-archive-keep" onclick={keep}>Keep</button>
    {:else}
      <button class="btn pri" type="button" id="sel-water" onclick={water} aria-disabled={busy || !growing.length}>Water</button>
      <button class="btn" type="button" id="sel-move" onclick={openMove} aria-disabled={busy || !chosen.length}>Move to a place</button>
      <button class="btn" type="button" id="sel-labels" onclick={labels} aria-disabled={!chosen.length}>Print labels</button>
      <button class="btn" type="button" id="sel-archive" onclick={askArchive} aria-disabled={busy || !growing.length}>Archive</button>
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
  /* Above the tab bar by its measured height, which the layout sets (round sixty-one; the accessibility review, 8). */
  .selbar { position: sticky; bottom: calc(env(safe-area-inset-bottom, 0px) + var(--tab-h, 64px) + 8px); z-index: 5; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .selbar .btn { min-height: var(--tap); }
  .moveto { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; min-width: 0; }
  /* The picker shrinks to the bar and its options' words wrap no further than the screen: at 320 px with 200% text it was
     440 px wide and the page scrolled sideways (round sixty-one; the accessibility review, 7). */
  .moveto select { flex: 1 1 12rem; min-width: 0; max-width: 100%; min-height: var(--tap); padding: 0.5em 0.8em; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); font: inherit; }
  .movelab { font-weight: 600; }
  .why { flex-basis: 100%; color: var(--bad); }
  .selbar [aria-disabled='true'] { opacity: 0.55; cursor: default; }
  /* A short screen (a phone on its side, 400% zoom): the bar takes its place in the page instead of 110 of 256 px over the
     list, as the tool row does (round sixty-one; the accessibility review, 8). */
  @media (max-height: 480px) { .selbar { position: static; } }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  /* The plain rows give way to the tick rows while selecting. */
  :global(body.grow-selecting #main .rows), :global(body.grow-selecting #main .more) { display: none; }
</style>
