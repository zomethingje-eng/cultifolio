<script lang="ts">
  /** A plant's full name, set as the list sets it: the Latin in italics, a cultivar in roman quotes, a cross with its parents (round sixty; the grower review, 7). */
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { plantName } from '$lib/ui/plant-label';
  let { plant }: { plant: { taxonName: string; cultivar?: string | null; nameKind?: string | null; parentage?: string | null } } = $props();
  const n = $derived(plantName(plant));
</script>

<SpeciesName name={n.sci} />{#if n.cultivar}{' '}<span class="cv">‘{n.cultivar}’</span>{/if}

<style>
  .cv { font-style: normal; }
</style>
