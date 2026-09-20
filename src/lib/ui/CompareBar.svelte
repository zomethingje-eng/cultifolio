<script lang="ts">
  /** The tray: what is picked for comparison, and the way to the page. Shown on every page while anything is picked. */
  import { compare } from '$lib/ui/compare.svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  onMount(() => compare.load());
  const onComparePage = $derived(page.url.pathname === '/compare');
</script>

{#if compare.picks.length && !onComparePage}
  <div class="tray" role="region" aria-label="Compare tray">
    <span class="lab">Compare</span>
    {#each compare.picks as p (p.slug)}
      <span class="pick"><i>{p.name}</i><button type="button" aria-label="Remove {p.name} from compare" onclick={() => compare.remove(p.slug)}>×</button></span>
    {/each}
    {#if compare.picks.length >= 2}<a class="btn pri" href={compare.href}>Compare {compare.picks.length}</a>{:else}<span class="hint">pick one more</span>{/if}
    <button class="clear" type="button" onclick={() => compare.clear()} aria-label="Clear the compare tray">clear</button>
  </div>
{/if}

<style>
  .tray { position: fixed; right: 16px; bottom: 16px; z-index: 58; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: calc(100vw - 32px); background: var(--card); border: 1px solid var(--rule); border-radius: 12px; box-shadow: var(--sh2); padding: 8px 10px; font-size: 13px; }
  .lab { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .pick { display: inline-flex; align-items: center; gap: 2px; background: var(--sunk); border-radius: 999px; padding: 2px 4px 2px 10px; font-family: var(--serif); font-size: 13.5px; }
  .pick button { border: 0; background: none; color: var(--ink3); font: inherit; font-size: 15px; min-width: 32px; min-height: 32px; cursor: pointer; border-radius: 999px; }
  .pick button:hover { color: var(--bad); background: var(--card); }
  .hint { color: var(--ink3); font-size: 12px; }
  .clear { border: 0; background: none; color: var(--ink3); font: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; min-height: 32px; padding: 0 6px; }
  @media (max-width: 700px) { .tray { left: 10px; right: 10px; bottom: calc(60px + env(safe-area-inset-bottom)); max-width: none; } }
</style>
