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
  import { CLOSED_NOTE, LEFT_PARAM, PAGE_IN_DEMO, clearExampleCopies, deleteLeftoverSample, dropLeftoverSample, finishLeaving, keepSampleOpen, markLeftByAddress, onExampleClosed } from '$lib/db/demo';
  import { example, enterExample, hadOwn, leaveExample, notEnteredWords } from './example.svelte';
  import { replaceState } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  /** The page shows the example: decided once, as the page loaded (round sixty-seven; triage-66 V3). */
  const on = PAGE_IN_DEMO;
  /**
   * The words for a grower who looked in from the menu: their own collection is waiting as they left it (round
   * sixty-three, V2). Noted as the example was opened, by the same test as an empty page's (round sixty-seven; triage-66
   * V4, S-A11): the front page's hint counts no places, and a grower with only places was told their own had not begun.
   */
  let hasOwn = $state(false);
  /** The example was closed under this page by another tab (round sixty-seven; triage-66 V3): said here, with the way home. */
  let closedHere = $state(false);
  onMount(() => {
    if (!on) {
      delete document.documentElement.dataset.demo;
      clearExampleCopies();
      // Sent home because the sample was closed in another tab: said here, plainly (round sixty-one; the records review, 13).
      try { if (sessionStorage.getItem(CLOSED_NOTE) === '1') { sessionStorage.removeItem(CLOSED_NOTE); toast.show('The example collection was closed in another tab. This is your own collection.', 8000); } } catch { /* nothing to say */ }
      // The first page after Leave deletes the sample; a delete that is held up or refused is said, never taken as done (round sixty-two; A9).
      // The address a Leave opened this page at says so (`?left=sample`, read by app.html's first script); taken off it here,
      // so a reload or a link copied from it is an ordinary visit (round sixty-two, the first deploy).
      // The tab is marked as out of the example by the address too, so an empty Today does not open it again (round sixty-three, V2).
      if (page.url.searchParams.get(LEFT_PARAM) === 'sample') { markLeftByAddress(); setTimeout(() => { try { const u = new URL(location.href); u.searchParams.delete(LEFT_PARAM); replaceState(u, page.state); } catch { /* the router not up yet: the address keeps it, harmlessly */ } }, 0); } // read when it runs: a page that takes its own parameter off (Places' `name`) does so beside it (round sixty-seven)
      void finishLeaving().then((left) => {
        if (left === 'blocked') toast.show('The example collection is still open in another tab, so it is not deleted yet: it goes when that tab is closed.', 10000);
        else if (left === 'failed') toast.show('The example collection could not be deleted: the browser refused. It is tried again the next time a page opens here.', 10000);
        // A leftover with records the visitor made is kept and offered back once (round sixty-seven; triage-66 V2).
        else if (left === null) void dropLeftoverSample((n) => (example.leftover = n));
      });
      return;
    }
    document.documentElement.dataset.demo = '1'; // a browser that ran no inline script still shows the bar
    const stop = keepSampleOpen();
    const unclosed = onExampleClosed(() => (closedHere = true));
    hasOwn = hadOwn();
    // Shared with the pages, which say "Setting out the example collection" rather than draw their empty state under it (round sixty-three, V2).
    example.seeding = true;
    // The seed is loaded only in the sample: a visitor's page carries none of it (round sixty-one; the accessibility review, 3).
    void import('./demo-seed').then((m) => m.seedDemo()).catch(() => false).finally(() => (example.seeding = false));
    return () => { stop(); unclosed(); };
  });
  const locked = $derived(/^\/(sync|backup|settings)(\/|$)/.test(page.url.pathname));
  const what = $derived(page.url.pathname.startsWith('/sync') ? 'sync' : page.url.pathname.startsWith('/backup') ? 'backup' : 'settings');
  // For a browser without :has(): the same rule by a class on the body.
  $effect(() => {
    if (!on || !locked) return;
    document.body.classList.add('demo-locked');
    return () => document.body.classList.remove('demo-locked');
  });
  /** The leftover's offer, answered (triage-66 V2): into it, or deleted, and either way the offer goes. */
  let offerMsg = $state('');
  function openLeftover() {
    const r = enterExample('/today');
    if (r !== true) offerMsg = notEnteredWords(r);
  }
  async function deleteLeftover() {
    const r = await deleteLeftoverSample();
    example.leftover = 0;
    toast.show(r === 'deleted' ? 'The example collection you left is deleted.' : r === 'blocked' ? 'The example collection is open in another tab, so it is not deleted.' : 'The example collection could not be deleted: the browser refused.', 8000);
  }
</script>

<!-- What the example is for, in the words the owner agreed (round sixty-three, V2): the bar, not a page, says why a
     visitor is looking at plants that are not theirs, and that nothing added here is kept (round sixty-seven; triage-66 V1). -->
<div class="demobar" id="demobar" role="region" aria-label="Example collection">
  {#if closedHere}
    <span role="alert"><b>The example collection was closed in another tab.</b> Nothing more is saved on this page; what you typed is still here to copy.</span>
    <span class="demoacts"><a class="btn small pri" href="/?left=sample" id="demo-home" data-sveltekit-reload>Go to my own collection</a></span>
  {:else}
    <span><b>An example collection,</b> so you can see what this page does. Nothing added here is kept: leaving deletes it.{hasOwn ? ' Your own collection is kept apart, as you left it.' : ''} <span class="sr" role="status">{example.seeding ? 'Setting it out…' : ''}</span></span>
    <span class="demoacts">
      {#if !hasOwn}<button class="btn small pri" type="button" id="demo-add" onclick={() => leaveExample('/plants/new')} disabled={example.leaving}>Add your first plant</button>{/if}
      <button class="btn small" type="button" id="demo-leave" onclick={() => leaveExample('/')} disabled={example.leaving}>{example.leaving ? 'Leaving…' : 'Leave the example'}</button>
    </span>
  {/if}
</div>
{#if !on && example.leftover > 0}
  <!-- A leftover example with the visitor's records in it, kept and offered back once (round sixty-seven; triage-66 V2; R45-2). -->
  <div class="leftover" id="example-left" role="region" aria-label="Example collection left open">
    <p>You left an example collection with {example.leftover === 1 ? '1 record' : `${example.leftover} records`} you added or changed there.</p>
    <p class="demoacts"><button class="btn small pri" type="button" id="example-left-open" onclick={openLeftover}>Open it</button><button class="btn small" type="button" id="example-left-delete" onclick={deleteLeftover}>Delete it</button></p>
    {#if offerMsg}<p class="small" role="status">{offerMsg}</p>{/if}
  </div>
{/if}
{#if locked}
  <div class="demolock" id="demo-locked">
    <p><b>{what === 'sync' ? 'Sync is off in the example collection.' : what === 'backup' ? 'Backup and restore are off in the example collection.' : 'Settings are off in the example collection.'}</b> {what === 'sync' ? 'Setting up sync here would send the example to a vault on the server.' : what === 'backup' ? 'A file restored here would go into the example, and be deleted with it when you leave.' : 'Units, appearance and your site are this device\'s, and the example leaves them as they are.'} Leave the example to use {what === 'sync' ? 'sync' : what === 'backup' ? 'backups' : 'Settings'} with your own plants.</p>
  </div>
{/if}

<style>
  .demobar { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; margin: 12px 0 0; padding: 8px 12px; border: 1px solid var(--accent); border-radius: var(--r); background: var(--accent-soft, var(--card)); font-size: var(--fs-md); }
  .demobar .btn { min-height: var(--tap); }
  /* The two buttons keep to one row beside the words, or under them on a phone; "Setting it out" is said to a screen
     reader only, since the page itself says it where its list will be: shown in the bar it changed the bar's height for a
     moment on every page of the example (round sixty-three, V2; a layout shift of 0.59 on /about/how). */
  .demoacts { display: flex; flex-wrap: wrap; gap: 8px; flex: none; max-width: 100%; }
  .demolock { margin: 16px 0; padding: 12px 14px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); font-size: var(--fs-md); }
  .demolock p { margin: 0; }
  .leftover { margin: 12px 0 0; padding: 8px 12px; border: 1px solid var(--accent); border-radius: var(--r); background: var(--card); font-size: var(--fs-md); display: grid; gap: 8px; }
  .leftover p { margin: 0; }
  .leftover .btn { min-height: var(--tap); }
  /* Shown only in the sample's tab, which app.html marks before the first paint. */
  :global(html:not([data-demo])) .demobar, :global(html:not([data-demo])) .demolock { display: none; }
  /* The sync, backup and settings pages' own controls are put away while the sample is open; the line above says why.
     The page's head stays, so the page keeps its heading (round sixty-one; the accessibility review, 10). */
  :global(html[data-demo] #main:has(> .demolock) > :not(.demobar):not(.demolock):not(.toast):not(.install):not(.phead):not(.toastregion)),
  :global(body.demo-locked #main > :not(.demobar):not(.demolock):not(.toast):not(.install):not(.phead):not(.toastregion)) { display: none !important; }
  @media print { .demobar, .demolock, .leftover { display: none !important; } }
</style>
