<script lang="ts">
  /** The tray: what is picked for comparison, and the way to the page. Shown on every page while anything is picked. */
  import { compare } from '$lib/ui/compare.svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  /** The phone's tab bar has stepped out of the way: the pill follows it down (round fifty-eight; the grower review). */
  let { low = false, preload = 'hover' }: { low?: boolean; preload?: 'off' | 'hover' } = $props();
  onMount(() => compare.load());
  const onComparePage = $derived(page.url.pathname === '/compare');
</script>

{#if compare.picks.length && !onComparePage}
  <!-- Above 700 px: the tray, one line of names and the way to the page. -->
  <!-- Not preloaded on hover on a private page: the tray's link names the species (round sixty-seven; triage-66 P3, S-F6). -->
  <div class="tray" role="region" aria-label="Compare tray" data-cover="bottom" data-sveltekit-preload-data={preload}>
    <span class="lab">Compare</span>
    {#each compare.picks as p (p.slug)}
      <span class="pick"><i>{p.name}</i><button type="button" aria-label="Remove {p.name} from compare" onclick={() => compare.remove(p.slug)}>×</button></span>
    {/each}
    {#if compare.picks.length >= 2}<a class="btn pri" href={compare.href}>Compare {compare.picks.length}</a>{:else}<span class="hint">pick one more</span>{/if}
    <button class="clear" type="button" onclick={() => compare.clear()} aria-label="Clear the compare tray">clear</button>
  </div>
  <!-- On a phone: a pill at the bottom right, above the tab bar, to the compare page; the × clears. The tray took a third
       of the fixed height on a species page with two compared (round fifty-eight; the grower review). -->
  <div class="cmppill" class:low role="region" aria-label="Compare" data-cover="bottom" data-away={low ? 'true' : undefined} data-sveltekit-preload-data={preload}>
    <a class="go" href={compare.picks.length >= 2 ? compare.href : '/compare'} aria-label={compare.picks.length >= 2 ? `Compare ${compare.picks.length} species` : `Compare 1, pick one more: ${compare.picks[0].name} is picked`}>Compare {compare.picks.length}{#if compare.picks.length < 2}<span class="more">, pick one more</span>{/if} <span aria-hidden="true">›</span></a>
    <button class="x" type="button" aria-label="Clear the compare tray" onclick={() => compare.clear()}>×</button>
  </div>
{/if}

<style>
  .tray { position: fixed; right: 16px; bottom: 16px; z-index: 58; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: calc(100vw - 32px); background: var(--card); border: 1px solid var(--rule); border-radius: var(--r-lg); box-shadow: var(--sh2); padding: 8px 10px; font-size: var(--fs-md); }
  .lab { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .pick { display: inline-flex; align-items: center; gap: 2px; background: var(--sunk); border-radius: 999px; padding: 2px 4px 2px 10px; font-family: var(--serif); font-size: var(--fs-md); }
  .pick button { border: 0; background: none; color: var(--ink3); font: inherit; font-size: var(--fs-base); min-width: var(--tap); min-height: var(--tap); cursor: pointer; border-radius: 999px; }
  .pick button:hover { color: var(--bad); background: var(--card); }
  .hint { color: var(--ink3); font-size: var(--fs-sm); }
  .clear { border: 0; background: none; color: var(--ink3); font: inherit; font-size: var(--fs-sm); text-decoration: underline; cursor: pointer; min-height: var(--tap); min-width: var(--tap); padding: 0 6px; }
  .cmppill { display: none; }
  @media (max-width: 700px) {
    .tray { display: none; }
    /* Clear of the tab bar (56 px and the safe area) by 10 px; right-aligned and small, so the page's own actions stay in reach. */
    .cmppill { position: fixed; right: max(12px, env(safe-area-inset-right)); bottom: calc(66px + env(safe-area-inset-bottom)); z-index: 58; display: flex; align-items: center; background: var(--ink); color: var(--bg); border-radius: 999px; box-shadow: var(--sh2); font-size: var(--fs-md); font-weight: 600; transition: transform 0.22s ease; }
    .cmppill.low { transform: translateY(56px); }
    .go { color: inherit; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 4px 0 16px; white-space: nowrap; }
    .go:hover { text-decoration: none; }
    .more { font-weight: 400; opacity: 0.8; }
    .x { border: 0; background: none; color: inherit; opacity: 0.75; font: inherit; font-size: var(--fs-lg); min-width: 44px; min-height: 44px; border-radius: 999px; cursor: pointer; }
    .x:hover { opacity: 1; }
  }
  /* Under 480 px tall there is no tab bar: the pill sits at the bottom. */
  @media (max-width: 700px) and (max-height: 480px) { .cmppill, .cmppill.low { bottom: calc(12px + env(safe-area-inset-bottom)); transform: none; } }
  @media (prefers-reduced-motion: reduce) { .cmppill { transition: none; } }
</style>
