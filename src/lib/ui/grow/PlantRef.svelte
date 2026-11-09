<script lang="ts">
  /**
   * A plant named by a lineage link (round eighty-seven, F4): its number and name as a link to its page, whether the grower
   * still has it or not. A plant dead or archived is said so; one removed links its own page, which offers to restore it;
   * an id this device holds no plant under (a sync not yet arrived, a file from elsewhere) is said as that, unlinked.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo } from '$lib/db/types';
  import { plantHref } from '$lib/db/links';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  let { id, short = false }: { id: string; short?: boolean } = $props();
  const a = $derived(collection.anyAccession(id));
  const gone = $derived(!!a?._deleted);
</script>

{#if a}<a class="pref" href={gone ? `/plants/${encodeURIComponent(a.id)}` : plantHref(a)}><span class="accno">{accNo(a)}</span>{#if !short}{' '}<SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}{/if}</a>{#if gone}<span class="state">{' '}(removed)</span>{:else if a.status !== 'growing'}<span class="state">{' '}({a.status})</span>{/if}{:else}<span class="state">a plant not on this device</span>{/if}

<style>
  .pref .accno { font-variant-numeric: tabular-nums lining-nums; font-style: normal; }
  .state { color: var(--ink3); }
  /* Round eighty-seven, stage-3 integration (DESIGN-87: data looks like data, no chips): a number as plain figures. */
  .accno { background: none; padding: 0; border-radius: 0; font-variant-numeric: tabular-nums lining-nums; }
</style>
