<script lang="ts">
  import { compare } from '$lib/ui/compare.svelte';
  import { onMount } from 'svelte';
  let { slug, name }: { slug: string; name: string } = $props();
  onMount(() => compare.load());
  const on = $derived(compare.has(slug));
</script>

<button class="btn" type="button" aria-pressed={on} disabled={!compare.loaded || (!on && compare.full)} title={!on && compare.full ? 'Three species are already in the tray; remove one to add this' : 'Put this species side by side with up to two others'} onclick={() => compare.toggle({ slug, name })}>{on ? 'In compare ✓' : 'Compare'}</button>
