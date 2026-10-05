<script lang="ts">
  /** Keep a species on your list without a plant of it. Toggles the taxon's `followed` field; nothing else. */
  import { collection } from '$lib/db/collection.svelte';
  let { slug, name, gbifKey }: { slug: string; name: string; gbifKey: number } = $props();
  const on = $derived.by(() => {
    const t = collection.ready ? collection.taxon(slug) : undefined;
    return !!t?.followed;
  });
  /** Followed and not grown: it is on the Wanted list at the foot of My plants, and the button says where (round sixty). */
  const wanted = $derived(on && !(collection.ready && collection.mySpecies.get(slug)?.grown));
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

<button class="btn" type="button" aria-pressed={on} disabled={!collection.ready || busy} title="Keep this species on your Wanted list without a plant of it" onclick={toggle}>{on ? 'Following ✓' : 'Follow'}</button>{#if wanted}<a class="wantedlink small" href="/plants#wanted">On your Wanted list ›</a>{/if}

<style>
  .wantedlink { margin-left: 8px; white-space: nowrap; display: inline-flex; align-items: center; min-height: var(--tap); }
</style>
