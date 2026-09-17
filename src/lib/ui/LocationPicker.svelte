<script lang="ts">
  /** Pick a location node from the tree, or make a new one in place. */
  import { collection } from '$lib/db/collection.svelte';
  import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
  let { value = $bindable<string | null>(null), id = 'loc' }: { value?: string | null; id?: string } = $props();
  let adding = $state(false);
  let newName = $state('');
  let newKind = $state<LocationKind>('shelf');
  let newParent = $state<string | null>(null);

  // Flatten the tree depth-first with indentation for a <select>.
  const flat = $derived.by(() => {
    const out: Array<{ id: string; label: string; depth: number }> = [];
    const walk = (parent: string | null, depth: number) => {
      for (const l of collection.children(parent)) {
        out.push({ id: l.id, label: l.name, depth });
        walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  async function create() {
    if (!newName.trim()) return;
    const loc = await collection.addLocation({ name: newName.trim(), type: newKind, parentId: newParent });
    value = loc.id;
    adding = false;
    newName = '';
  }
</script>

<div class="picker">
  {#if !adding}
    <select {id} bind:value>
      <option value={null}>No location</option>
      {#each flat as f}<option value={f.id}>{'  '.repeat(f.depth)}{f.depth ? '› ' : ''}{f.label}</option>{/each}
    </select>
    <button class="btn small" type="button" onclick={() => { newParent = value; adding = true; }}>New…</button>
  {:else}
    <div class="new card">
      <input id="{id}-new-name" type="text" placeholder="Name, e.g. Shelf 2" bind:value={newName} />
      <select id="{id}-new-kind" bind:value={newKind}>{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select>
      <select id="{id}-new-parent" bind:value={newParent}>
        <option value={null}>Top level</option>
        {#each flat as f}<option value={f.id}>{'  '.repeat(f.depth)}{f.label}</option>{/each}
      </select>
      <div class="row"><button class="btn small" type="button" onclick={() => (adding = false)}>Cancel</button><button class="btn small pri" type="button" onclick={create} disabled={!newName.trim()}>Add location</button></div>
    </div>
  {/if}
</div>

<style>
  .picker { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  select, input { padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: 8px; background: var(--card); }
  .picker > select { flex: 1; min-width: 12rem; }
  .new { width: 100%; padding: 0.7rem; display: grid; gap: 0.5rem; }
  .row { display: flex; justify-content: flex-end; gap: 0.5rem; }
</style>
