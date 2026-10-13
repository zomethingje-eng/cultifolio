<script lang="ts">
  /** Pick a location node from the tree, or make a new one in place. */
  import { collection } from '$lib/db/collection.svelte';
  import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
  import { holdPlacePicker } from './places-pending';
  // `lastUsed`: the place the form pre-filled from the last one used; while it is still the one picked, the field says so (round fifty-eight; the grower review).
  // `typed`: the new place's name while "New…" is open, for the form's test of what leaving would lose; `start`: a new
  // place to open "New…" with, carried from the example by "Keep it as my own" (round sixty-nine; triage-68 X2, X3).
  // Both with the place it goes inside (round seventy; triage-69 X2; S-D7a, IND-7): `typed` names it, for Keep to carry;
  // `start` opens inside the grower's own place of that name (`parentId`), or, when they have none, says where it was
  // (`insideNamed`). A new place made inside "Greenhouse" in the example opened at the top level.
  type Inside = { name: string; kind: string | null } | null;
  let { value = $bindable<string | null>(null), id = 'loc', label = 'Location', lastUsed = null, typed = $bindable(null), start = null }: { value?: string | null; id?: string; label?: string; lastUsed?: string | null; typed?: { name: string; kind: string; inside: Inside } | null; start?: { name: string; kind?: string | null; parentId?: string | null; insideNamed?: string | null } | null } = $props();
  let adding = $state(false);
  let newName = $state('');
  let newKind = $state<LocationKind>('shelf');
  let newParent = $state<string | null>(null);
  /** The containing place a carried place had in the example, when the grower has none of that name: said under "Inside which place". */
  let wasInside = $state<string | null>(null);
  const insideOf = (p: string | null): Inside => { const l = p ? collection.location(p) : undefined; return l ? { name: l.name, kind: l.type ?? null } : null; };
  $effect(() => { typed = adding && newName.trim() ? { name: newName.trim(), kind: newKind, inside: insideOf(newParent) } : null; });
  let started = false;
  $effect(() => {
    if (started || !start?.name?.trim()) return;
    started = true;
    newName = start.name.trim();
    const k = LOCATION_KINDS.find((x) => x.k === start.kind);
    if (k) newKind = k.k;
    newParent = start.parentId && collection.location(start.parentId) ? start.parentId : null;
    wasInside = newParent ? null : (start.insideNamed?.trim() || null);
    adding = true;
  });

  // The tree depth-first for a <select>, each option its full path ("Greenhouse › Bench 1 › Tray B"): a closed select shows
  // one option, and "› Tray B" alone did not say which greenhouse (round fifty-eight; the grower review).
  const flat = $derived.by(() => {
    const out: Array<{ id: string; label: string; depth: number }> = [];
    const seen = new Set<string>();
    const walk = (parent: string | null, depth: number) => {
      for (const l of collection.children(parent)) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        out.push({ id: l.id, label: collection.locationName(l.id) || l.name, depth });
        walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  // One write at a time: "Add place" pressed twice, or the form's own button pressed while the place is written, waits
  // for the same place rather than making a second (round sixty-six).
  let making: Promise<void> | null = null;
  /** Why the place was not made, shown in the picker (round sixty-seven; triage-66 R12, the outside review's 18: Add did nothing, with no word). */
  let err = $state('');
  function create(): Promise<void> {
    if (making) return making;
    if (!newName.trim()) return Promise.resolve();
    err = '';
    making = (async () => {
      try {
        const loc = await collection.addLocation({ name: newName.trim(), type: newKind, parentId: newParent });
        value = loc.id;
        adding = false;
        newName = '';
      } catch (e) {
        err = (e instanceof Error && e.message) || collection.lastWriteError || 'It could not be saved.';
        throw e; // the form that waited for it stops, rather than save without its place
      }
    })().finally(() => (making = null));
    return making;
  }
  /** What the form's own button waits for (`settlePlaces`): the place being written, or the one named and not yet added. */
  const settle = () => making ?? (adding && newName.trim() ? create() : Promise.resolve());
  $effect(() => holdPlacePicker(id, settle));
</script>

<div class="picker">
  {#if !adding}
    <select {id} bind:value aria-label={label} aria-describedby={lastUsed && value === lastUsed ? `${id}-last` : undefined}>
      <option value={null}>No place</option>
      {#each flat as f}<option value={f.id}>{f.label}</option>{/each}
    </select>
    <!-- A new place goes beside the one picked, not inside it: another bench in the same greenhouse is the usual case, and the parent is shown and changeable below. -->
    <button class="btn small" type="button" onclick={() => { newParent = value ? (collection.location(value)?.parentId ?? null) : null; adding = true; }}>New…</button>
    {#if lastUsed && value === lastUsed}<span class="small muted lastused" id="{id}-last">last used</span>{/if}
  {:else}
    <div class="new card">
      <!-- Each field with a visible name over it; the placeholder was the name's only one (round fifty-eight; the accessibility review). -->
      <label class="fl"><span class="eyebrow">Name of the new place</span><input id="{id}-new-name" type="text" placeholder="e.g. Shelf 2" bind:value={newName} /></label>
      <label class="fl"><span class="eyebrow">Kind of place</span><select id="{id}-new-kind" bind:value={newKind}>{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select></label>
      <label class="fl"><span class="eyebrow">Inside which place</span><select id="{id}-new-parent" bind:value={newParent}>
        <option value={null}>Top level</option>
        {#each flat as f}<option value={f.id}>{f.label}</option>{/each}
      </select></label>
      {#if wasInside && !newParent}<p class="small muted" id="{id}-was-inside">In the example it was inside {wasInside}, which is not one of your places, so it goes at the top level unless you choose one.</p>{/if}
      <p class="small muted path">{newParent ? `${collection.locationName(newParent)} › ` : ''}{newName.trim() || '…'}</p>
      {#if err}<p class="small bad" role="alert" id="{id}-err">The place was not made. {err}</p>{/if}
      <div class="row"><button class="btn small" type="button" onclick={() => { adding = false; err = ''; }}>Cancel</button><button class="btn small pri" type="button" onclick={() => void create().catch(() => {})} disabled={!newName.trim()}>Add place</button></div>
    </div>
  {/if}
</div>

<style>
  .path { margin: 2px 0 0; }
  .bad { color: var(--bad); margin: 0; }
  .picker { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  select, input { padding: 0.5em 0.8em; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); } /* an edge at 3:1 (round fifty-nine) */
  .picker > select { flex: 1; min-width: 12rem; }
  .new { width: 100%; padding: 0.7rem; display: grid; gap: 0.5rem; }
  .row { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .fl { display: grid; gap: 3px; } /* round fifty-eight; the accessibility review */
  /* Under the field, on its own line (round fifty-eight; the grower review). */
  .lastused { flex-basis: 100%; margin-top: -0.25rem; font-size: var(--fs-sm); color: var(--ink3); }
</style>
