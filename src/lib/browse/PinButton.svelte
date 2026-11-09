<script lang="ts">
  /**
   * "Pin this view" in a browse view's row of actions (round eighty-seven, C6; the state is `PinState`): pins the view's
   * query in the collection's log with its species now, so the front page and the empty search box can say what a
   * reference update adds to it or takes from it. Pinned, it says so, with the view's changes since it was pinned or
   * last seen (a press opens them, under the row), and offers Unpin. Drawn once the page's scripts run and the collection
   * has opened: without them a pin cannot be written.
   */
  import { collection } from '$lib/db/collection.svelte';
  import type { PinState } from './pinned.svelte';

  let { state: ps }: { state: PinState } = $props();
  // Followed for the view shown and its pin: a pin made or seen, or another view, asks again.
  $effect(() => { void ps.mine; ps.follow(); });
</script>

{#if ps.mounted && (collection.ready || collection.failed)}
  <span class="pin">
    {#if collection.failed}
      <span class="note">Pinning needs this browser's storage, which it refused.</span>
    {:else if ps.mine}
      <span class="on">Pinned{#if ps.words}<span class="w">{' · '}{#if ps.changed}<button type="button" class="linkish" aria-expanded={!!ps.panel} aria-controls="bv-since" onclick={() => ps.toggle()}>{ps.words}</button>{:else}{ps.words}{/if}</span>{/if}</span>
      <button type="button" class="linkish" disabled={ps.busy} onclick={() => ps.unpin()}>Unpin</button>
    {:else}
      <button type="button" class="linkish" disabled={ps.busy} onclick={() => ps.pin()}>Pin this view</button>
    {/if}
    <span class="sr" aria-live="polite">{ps.said ?? ''}</span>
    {#if ps.said}<span class="note" aria-hidden="true">{ps.said}</span>{/if}
  </span>
{/if}

<style>
  .pin { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .on { color: var(--ink2); }
  .w { color: var(--mut, var(--ink3)); }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .linkish:hover { text-decoration: underline; }
  .linkish:disabled { color: var(--mut, var(--ink3)); cursor: default; }
  .note { font-size: var(--fs-head); color: var(--ink2); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 899px) { .linkish { min-height: 44px; } }
</style>
