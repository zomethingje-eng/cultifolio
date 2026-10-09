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
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, type Accession } from '$lib/db/types';
  import { localDate } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import { focusNext } from '$lib/ui/focus';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { archivePlants, undoArchive, type Archived } from '$lib/ui/grow/select-actions';
  /**
   * `start`: open in select mode, as `/plants?place=<id>&select=1` asks (round sixty-one; the grower review, 7). Read as it
   * changes, not once at mount: the page reads the address in its own onMount, after this one's, so a "Select these"
   * followed inside the app opened the list unselected (round sixty-two; the grower review, 4). `on` is bound by the page,
   * which keeps this mounted while selecting even when the list is empty.
   */
  let { plants, start = false, on = $bindable(false) }: { plants: Accession[]; start?: boolean; on?: boolean } = $props();
  $effect(() => { if (start) on = true; });
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
  /** The bar's height, for the toast to stand clear of it on a phone, as it does of the add form's pinned bar (round sixty-two; the accessibility review, 3). */
  let barEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = barEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    // Where the bar really is, not where a pinned bar would be: on a short list the sticky bar rests in the page under the
    // last row, and a toast placed for a bar at the foot sat over the Archive button focus had moved to. The toast goes
    // just above the bar's top; with the bar too near the top of the screen for that, under it, where it goes without one
    // (round sixty-two; the verification review's grower 3).
    let frame = 0;
    const place = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      root.style.setProperty('--sel-h', `${Math.round(r.height)}px`);
      const tab = document.getElementById('tabbar')?.getBoundingClientRect().height || 0;
      const lift = r.top >= 160 && r.top < innerHeight ? innerHeight - r.top + 8 : tab + 10;
      root.style.setProperty('--sel-lift', `${Math.round(lift)}px`);
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(place); };
    const ro = new ResizeObserver(place);
    ro.observe(el);
    ro.observe(document.body); // rows archived or moved away move the bar without resizing it
    addEventListener('scroll', soon, { passive: true });
    addEventListener('resize', soon);
    return () => { ro.disconnect(); removeEventListener('scroll', soon); removeEventListener('resize', soon); if (frame) cancelAnimationFrame(frame); root.style.removeProperty('--sel-h'); root.style.removeProperty('--sel-lift'); };
  });
  /** Escape answers the open panel or question as Cancel or Keep does, focus back on the button that opened it (round sixty-two; the outside review's A40). */
  function onBarKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (moving) { e.preventDefault(); void closeMove(); }
    else if (confirmArchive) { e.preventDefault(); void keep(); }
  }
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
      const done = await archivePlants(collection, list.map((a) => a.id), localDate());
      picked = new Set([...picked].filter((id) => !list.some((a) => a.id === id)));
      await focusNext('#sel-archive');
      toast.show(`${list.length} archived, and logged.`, 8000, { label: 'Undo', run: () => { void unarchive(done); } });
    } finally {
      busy = false;
    }
  }
  /**
   * Archive's Undo (round sixty-one; the grower review, 8; the accessibility review, 9; review B3): the plants still
   * archived go back to growing and their own "Archived" lines go, in one commit (`undoArchive`; round sixty-two, A25). A
   * plant marked otherwise since is left as it is. A failure is said, and nothing was changed.
   */
  async function unarchive(done: Archived[]) {
    try {
      const { back, lines } = await undoArchive(collection, done);
      toast.show(back ? `Undone: ${back} growing again, the archive line${lines === 1 ? '' : 's'} removed.` : 'Nothing to undo: they were marked otherwise since.');
    } catch (err) {
      toast.show(`Not undone: ${err instanceof Error ? err.message : String(err)}. They are still archived.`);
    }
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
  <!-- data-cover: the bar floats above the tab bar, off the screen's edge, so the focus helper counts it by this mark; a
       tick box under it was reached by Tab and never seen (round sixty-two; the accessibility review, 1). -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="selbar" role="group" aria-label="For the ticked plants" data-cover="bottom" bind:this={barEl} onkeydown={onBarKey}>
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
  /* At the window's foot on a desktop, where there is no tab bar: it floated 72 px up with rows showing under it (round sixty-two; the accessibility review, 8). */
  .selbar { position: sticky; bottom: calc(env(safe-area-inset-bottom, 0px) + 8px); z-index: 5; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .selbar .btn { min-height: var(--tap); }
  .moveto { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; min-width: 0; }
  /* The picker shrinks to the bar and its options' words wrap no further than the screen: at 320 px with 200% text it was
     440 px wide and the page scrolled sideways (round sixty-one; the accessibility review, 7). */
  .moveto select { flex: 1 1 12rem; min-width: 0; max-width: 100%; min-height: var(--tap); padding: 0.5em 0.8em; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); font: inherit; }
  .movelab { font-weight: 600; }
  .why { flex-basis: 100%; color: var(--bad); }
  .selbar [aria-disabled='true'] { opacity: 0.55; cursor: default; }
  @media (max-width: 700px) { .selbar { bottom: calc(env(safe-area-inset-bottom, 0px) + var(--tab-h, 57px) + 8px); } }
  /* A short screen (a phone on its side, 400% zoom): the bar takes its place in the page instead of 110 of 256 px over the
     list, as the tool row does (round sixty-one; the accessibility review, 8). In em, which a media query reads at the
     browser's own text size: 480 px at 100% text, 960 px at 200%, where the bars covered 682 of 700 px (round sixty-two;
     the accessibility review, 1). */
  @media (max-height: 30em) { .selbar { position: static; } }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  /* The plain rows give way to the tick rows while selecting. */
  :global(body.grow-selecting #main .rows), :global(body.grow-selecting #main .more) { display: none; }
</style>
