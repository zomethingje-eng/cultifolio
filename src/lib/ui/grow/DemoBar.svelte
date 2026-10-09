<script lang="ts">
  /**
   * The sample collection's banner, on every page while it is open (round sixty; the product review's 3): it says nothing
   * here is the visitor's, and Leave deletes the sample's database whole and returns to the grower's own collection. It
   * fills the sample the first time it opens. Sync, restoring a backup and Settings are shut while the sample is open: a
   * sync key set up here would send the sample to a vault on the server, a backup restored here would go into the sample
   * and be deleted with it, and Settings are this device's (round sixty-one; the grower review, 14); the pages say so in
   * place of their controls, under their own heading.
   *
   * Drawn from the server on every page and shown by `html[data-demo]`, which app.html sets before the first paint: set
   * after hydration, the bar pushed every page down (a layout shift of 0.17 to 0.54; round sixty-one, the accessibility
   * review, 4).
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { CLOSED_NOTE, dropLeftoverSample, finishLeaving, inDemo, keepSampleOpen, leaveDemo, sampleEdits } from '$lib/db/demo';
  import { toast } from '$lib/ui/toast.svelte';
  let seeding = $state(false);
  let leaving = $state(false);
  let on = $state(false);
  onMount(() => {
    on = inDemo();
    if (!on) {
      delete document.documentElement.dataset.demo;
      // Sent home because the sample was closed in another tab: said here, plainly (round sixty-one; the records review, 13).
      try { if (sessionStorage.getItem(CLOSED_NOTE) === '1') { sessionStorage.removeItem(CLOSED_NOTE); toast.show('The sample collection was closed in another tab. This is your own collection.', 8000); } } catch { /* nothing to say */ }
      // The first page after Leave deletes the sample; a delete that is held up or refused is said, never taken as done (round sixty-two; A9).
      void finishLeaving().then((left) => {
        if (left === 'blocked') toast.show('The sample collection is still open in another tab, so it is not deleted yet: it goes when that tab is closed.', 10000);
        else if (left === 'failed') toast.show('The sample collection could not be deleted: the browser refused. It is tried again the next time a page opens here.', 10000);
        else if (left === null) void dropLeftoverSample();
      });
      return;
    }
    document.documentElement.dataset.demo = '1'; // a browser that ran no inline script still shows the bar
    const stop = keepSampleOpen();
    seeding = true;
    // The seed is loaded only in the sample: a visitor's page carries none of it (round sixty-one; the accessibility review, 3).
    void import('./demo-seed').then((m) => m.seedDemo()).catch(() => false).finally(() => (seeding = false));
    return stop;
  });
  const locked = $derived(/^\/(sync|backup|settings)(\/|$)/.test(page.url.pathname));
  const what = $derived(page.url.pathname.startsWith('/sync') ? 'sync' : page.url.pathname.startsWith('/backup') ? 'backup' : 'settings');
  // For a browser without :has(): the same rule by a class on the body.
  $effect(() => {
    if (!on || !locked) return;
    document.body.classList.add('demo-locked');
    return () => document.body.classList.remove('demo-locked');
  });
  /**
   * Leave asks first when the visitor added or changed records here, saying how many (round sixty-two; A9); then the tab
   * navigates, and the next page deletes the sample. A page's own "Leave site?" answered Cancel keeps the tab as it was,
   * so the button comes back at once, not 4 seconds later under "Leaving…" (round sixty-two, second pass; the
   * verification grower review, 4).
   */
  async function leave() {
    const n = await sampleEdits();
    if (n && !confirm(`Leave the sample collection? The ${n === 1 ? 'record you added or changed here is' : `${n} records you added or changed here are`} deleted with it.`)) return;
    leaving = true;
    leaveDemo('/', () => (leaving = false));
  }
</script>

<div class="demobar" id="demobar" role="region" aria-label="Sample collection">
  <span><b>This is a sample collection.</b> Nothing here is yours or saved with your plants. <span role="status">{seeding ? 'Setting it out…' : ''}</span></span>
  <button class="btn small" type="button" onclick={leave} disabled={leaving}>{leaving ? 'Leaving…' : 'Leave the sample'}</button>
</div>
{#if locked}
  <div class="demolock" id="demo-locked">
    <p><b>{what === 'sync' ? 'Sync is off in the sample collection.' : what === 'backup' ? 'Backup and restore are off in the sample collection.' : 'Settings are off in the sample collection.'}</b> {what === 'sync' ? 'Setting up sync here would send the sample to a vault on the server.' : what === 'backup' ? 'A file restored here would go into the sample, and be deleted with it when you leave.' : 'Units, appearance and your site are this device\'s, and the sample leaves them as they are.'} Leave the sample to use {what === 'sync' ? 'sync' : what === 'backup' ? 'backups' : 'Settings'} with your own plants.</p>
  </div>
{/if}

<style>
  .demobar { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; margin: 12px 0 0; padding: 8px 12px; border: 1px solid var(--accent); border-radius: var(--r); background: var(--accent-soft, var(--card)); font-size: var(--fs-md); }
  .demobar .btn { min-height: var(--tap); }
  .demolock { margin: 16px 0; padding: 12px 14px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); font-size: var(--fs-md); }
  .demolock p { margin: 0; }
  /* Shown only in the sample's tab, which app.html marks before the first paint. */
  :global(html:not([data-demo])) .demobar, :global(html:not([data-demo])) .demolock { display: none; }
  /* The sync, backup and settings pages' own controls are put away while the sample is open; the line above says why.
     The page's head stays, so the page keeps its heading (round sixty-one; the accessibility review, 10). */
  :global(html[data-demo] #main:has(> .demolock) > :not(.demobar):not(.demolock):not(.toast):not(.install):not(.phead):not(.toastregion)),
  :global(body.demo-locked #main > :not(.demobar):not(.demolock):not(.toast):not(.install):not(.phead):not(.toastregion)) { display: none !important; }
  @media print { .demobar, .demolock { display: none !important; } }
</style>
