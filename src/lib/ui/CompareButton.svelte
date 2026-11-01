<script lang="ts">
  import { compare } from '$lib/ui/compare.svelte';
  import { onMount } from 'svelte';
  let { slug, name }: { slug: string; name: string } = $props();
  onMount(() => compare.load());
  const on = $derived(compare.has(slug));
</script>

<!-- The button says what a press does (round eighty-five; review-w W7): "In compare ✓" read as a state and took the species
     out when pressed. Once the species is in the tray it reads "Remove from compare"; the tray shows it is in. -->
<button class="btn" type="button" disabled={!compare.loaded || (!on && compare.full)} title={on ? 'Take this species out of the compare tray' : compare.full ? 'Three species are already in the tray; remove one to add this' : 'Put this species side by side with up to two others'} onclick={() => compare.toggle({ slug, name })}>{on ? 'Remove from compare' : 'Compare'}</button>
