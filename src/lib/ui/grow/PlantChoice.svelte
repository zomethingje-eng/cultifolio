<script lang="ts">
  /**
   * One of the grower's plants, chosen from a list narrowed by what is typed above it (number, name or cultivar, every
   * word), as the new batch's "From which plant" is (round fifty-eight's filter, round eighty-seven's lineage, F4): the
   * pollen parent of a cross, a graft's scion and stock, the plant an offset was taken from. Growing plants first, then
   * the rest by number; a plant dead or archived can still be a parent. The plant chosen stays in the list whatever is
   * typed, so a filter never quietly changes the choice.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, type Accession } from '$lib/db/types';
  let { value = $bindable(null), id, label, none = 'Not one of my plants', exclude = null, describedby }: { value?: string | null; id: string; label: string; none?: string; exclude?: string | null; describedby?: string } = $props();
  let q = $state('');
  const plants = $derived(collection.accessions.filter((a) => a.id !== exclude).slice().sort((a, b) => Number(b.status === 'growing') - Number(a.status === 'growing') || accNo(a).localeCompare(accNo(b), undefined, { numeric: true })));
  const words = $derived(q.toLowerCase().split(/\s+/).filter(Boolean));
  const match = (a: Accession) => words.every((w) => `${accNo(a)} ${a.taxonName} ${a.cultivar ?? ''}`.toLowerCase().includes(w));
  const matches = $derived(plants.filter(match));
  const options = $derived(words.length ? plants.filter((a) => a.id === value || match(a)) : plants);
</script>

<div class="pc">
  <label class="fl" for={id}><span class="eyebrow">{label}</span></label>
  {#if plants.length > 8}
    <input id="{id}-q" class="pfilter" type="search" bind:value={q} placeholder="Filter by number or name" aria-label="Filter the plants for {label.toLowerCase()} by number or name" aria-controls={id} autocomplete="off" />
    {#if words.length}<span class="small muted" role="status">{matches.length === 0 ? 'No plant matches; clear the filter to see them all.' : `${matches.length} of ${plants.length} shown.`}</span>{/if}
  {/if}
  <select {id} bind:value aria-describedby={describedby}>
    <option value={null}>{none}</option>
    {#each options as a (a.id)}<option value={a.id}>{accNo(a)} · {a.taxonName}{a.cultivar ? ` ‘${a.cultivar}’` : ''}{a.status !== 'growing' ? ` (${a.status})` : ''}</option>{/each}
  </select>
</div>

<style>
  .pc { display: grid; gap: 4px; min-width: 0; }
  .pfilter, select { width: 100%; min-width: 0; font: inherit; font-size: var(--fs-md); padding: 8px 11px; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .small { font-size: var(--fs-sm); }
  .muted { color: var(--ink3); }
  @media (max-width: 640px) { .pfilter, select { min-height: 44px; } }
</style>
