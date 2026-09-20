<script lang="ts">
  /** Keep a species on your list without a plant of it. Toggles the taxon's `followed` field; nothing else. */
  import { collection } from '$lib/db/collection.svelte';
  let { slug, name, gbifKey }: { slug: string; name: string; gbifKey: number } = $props();
  /** Followed, and not a record a v2 overlay marked removed: such a record is on no list, so the button must not say it is. */
  const on = $derived.by(() => {
    const t = collection.ready ? collection.taxon(slug) : undefined;
    return !!t?.followed && !t.removed;
  });
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
