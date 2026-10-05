<script lang="ts">
  /**
   * The sample collection's banner, on every page while it is open (round sixty; the product review's 3): it says nothing
   * here is the visitor's, and Leave deletes the sample's database whole and returns to the grower's own collection. It
   * fills the sample the first time it opens. Sync and restoring a backup are shut while the sample is open: a sync key
   * set up here would send the sample to a vault on the server, and a backup restored here would go into the sample and
   * be deleted with it; the pages say so in place of their controls.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { inDemo, leaveDemo } from '$lib/db/demo';
  import { seedDemo } from './demo-seed';
  let on = $state(false);
  let seeding = $state(false);
  let leaving = $state(false);
  onMount(() => {
    on = inDemo();
    if (!on) return;
    seeding = true;
    void seedDemo().catch(() => false).finally(() => (seeding = false));
  });
  const locked = $derived(on && /^\/(sync|backup)(\/|$)/.test(page.url.pathname));
  $effect(() => {
    if (!locked) return;
    document.body.classList.add('demo-locked');
    return () => document.body.classList.remove('demo-locked');
  });
  async function leave() {
    leaving = true;
    await leaveDemo('/');
  }
</script>

{#if on}
  <div class="demobar" role="region" aria-label="Sample collection">
    <span><b>This is a sample collection.</b> Nothing here is yours or saved with your plants.{#if seeding} Setting it out…{/if}</span>
    <button class="btn small" type="button" onclick={leave} disabled={leaving}>{leaving ? 'Leaving…' : 'Leave the sample'}</button>
  </div>
  {#if locked}
    <div class="demolock" id="demo-locked">
      <p><b>{page.url.pathname.startsWith('/sync') ? 'Sync is off in the sample collection.' : 'Backup and restore are off in the sample collection.'}</b> {page.url.pathname.startsWith('/sync') ? 'Setting up sync here would send the sample to a vault on the server.' : 'A file restored here would go into the sample, and be deleted with it when you leave.'} Leave the sample to use {page.url.pathname.startsWith('/sync') ? 'sync' : 'backups'} with your own plants.</p>
    </div>
  {/if}
{/if}

<style>
  .demobar { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; margin: 12px 0 0; padding: 8px 12px; border: 1px solid var(--accent); border-radius: var(--r); background: var(--accent-soft, var(--card)); font-size: var(--fs-md); }
  .demobar .btn { min-height: var(--tap); }
  .demolock { margin: 16px 0; padding: 12px 14px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); font-size: var(--fs-md); }
  .demolock p { margin: 0; }
  /* The sync and backup pages' own controls are put away while the sample is open; the line above says why. */
  :global(body.demo-locked #main > :not(.demobar):not(.demolock):not(.toast):not(.install)) { display: none !important; }
</style>
