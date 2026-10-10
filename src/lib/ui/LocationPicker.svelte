<script lang="ts">
  /** Pick a location node from the tree, or make a new one in place. */
  import { collection } from '$lib/db/collection.svelte';
  import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
  import { holdPlacePicker } from './places-pending';
  // `lastUsed`: the place the form pre-filled from the last one used; while it is still the one picked, the field says so (round fifty-eight; the grower review).
  let { value = $bindable<string | null>(null), id = 'loc', label = 'Location', lastUsed = null }: { value?: string | null; id?: string; label?: string; lastUsed?: string | null } = $props();
  let adding = $state(false);
  let newName = $state('');
  let newKind = $state<LocationKind>('shelf');
  let newParent = $state<string | null>(null);

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
  function create(): Promise<void> {
    if (making) return making;
    if (!newName.trim()) return Promise.resolve();
    making = (async () => {
      const loc = await collection.addLocation({ name: newName.trim(), type: newKind, parentId: newParent });
      value = loc.id;
      adding = false;
      newName = '';
    })().finally(() => (making = null));
    return making;
  }
  /** What the form's own button waits for (`settlePlaces`): the place being written, or the one named and not yet added. */
  const settle = () => making ?? (adding && newName.trim() ? create() : Promise.resolve());
  $effect(() => holdPlacePicker(settle));
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
      <p class="small muted path">{newParent ? `${collection.locationName(newParent)} › ` : ''}{newName.trim() || '…'}</p>
      <div class="row"><button class="btn small" type="button" onclick={() => (adding = false)}>Cancel</button><button class="btn small pri" type="button" onclick={create} disabled={!newName.trim()}>Add place</button></div>
    </div>
  {/if}
</div>

<style>
  .path { margin: 2px 0 0; }
  .picker { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  select, input { padding: 0.5em 0.8em; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); } /* an edge at 3:1 (round fifty-nine) */
  .picker > select { flex: 1; min-width: 12rem; }
  .new { width: 100%; padding: 0.7rem; display: grid; gap: 0.5rem; }
  .row { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .fl { display: grid; gap: 3px; } /* round fifty-eight; the accessibility review */
  /* Under the field, on its own line (round fifty-eight; the grower review). */
  .lastused { flex-basis: 100%; margin-top: -0.25rem; font-size: var(--fs-sm); color: var(--ink3); }
</style>
