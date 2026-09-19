<script lang="ts">
  /** Keep a species on your list without a plant of it. Toggles the taxon's `followed` field; nothing else. */
  import { collection } from '$lib/db/collection.svelte';
  let { slug, name, gbifKey }: { slug: string; name: string; gbifKey: number } = $props();
  const on = $derived(collection.ready && !!collection.taxon(slug)?.followed);
  let busy = $state(false);
  async function toggle() {
    if (!collection.ready || busy) return;
    busy = true;
    try {
      await collection.follow(slug, name, gbifKey, !on);
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn" type="button" aria-pressed={on} disabled={!collection.ready || busy} title="Keep this species on your list without a plant of it" onclick={toggle}>{on ? 'Following ✓' : 'Follow'}</button>
