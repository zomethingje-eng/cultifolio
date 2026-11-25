<script lang="ts">
  /**
   * One home for the collection (round 121; MYPLANTS 29): Plants, Spaces and Batches as one switch at the head of each,
   * each with its count. Their addresses stay (/plants, /places, /propagation), so no link breaks; the switch is links,
   * the one shown marked as the current page.
   */
  import { page } from '$app/state';
  import { collection } from '$lib/db/collection.svelte';
  const tabs = $derived([
    { href: '/plants', label: 'Plants', n: collection.ready ? collection.accessions.filter((a) => a.status === 'growing').length : null },
    { href: '/places', label: 'Spaces', n: collection.ready ? collection.locations.length : null },
    { href: '/propagation', label: 'Batches', n: collection.ready ? collection.sowings.filter((s) => s.status === 'active').length : null }
  ]);
  const at = (href: string) => page.url.pathname === href;
</script>

<nav class="cswitch" aria-label="Your collection">
  {#each tabs as t (t.href)}
    <a href={t.href} class:on={at(t.href)} aria-current={at(t.href) ? 'page' : undefined}>{t.label}{#if t.n != null}<span class="n"><span class="sr">, </span>{t.n}</span>{/if}</a>
  {/each}
</nav>

<style>
  .cswitch { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; margin: 0 0 12px; border-radius: var(--r); background: var(--sunk); }
  .cswitch a { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--tap); border-radius: var(--r-sm); color: var(--ink2); text-decoration: none; font-size: var(--fs-md); }
  .cswitch a:hover { color: var(--ink); }
  .cswitch a.on { background: var(--bg); color: var(--ink); font-weight: 600; outline: 1px solid var(--rule); }
  .n { font-size: var(--fs-sm); color: var(--ink3); font-weight: 400; font-variant-numeric: tabular-nums; }
</style>
