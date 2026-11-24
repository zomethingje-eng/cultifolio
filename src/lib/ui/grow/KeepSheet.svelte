<script lang="ts">
  /**
   * The "keep your plants" sheet (round 116; MYPLANTS 26): the state in one line, the reason in one sentence, and three
   * ways to keep the collection, sync first (the owner's decision of 23 November 2026, docs/PLAN-IPHONE.md). A native
   * modal dialog, so focus stays in it and Escape closes it; closing it puts it off for a week.
   */
  import { keepSheet, markShown } from './keep-sheet.svelte';
  import { localDateOf } from '$core/dates';
  let { plants, lastBackup, synced }: { plants: number; lastBackup: string | null | undefined; synced: boolean } = $props();
  let dlg = $state<HTMLDialogElement | null>(null);
  $effect(() => {
    if (!dlg) return;
    if (keepSheet.open && !dlg.open) dlg.showModal();
    if (!keepSheet.open && dlg.open) dlg.close();
  });
  function later() { markShown(); keepSheet.open = false; }
  const stateLine = $derived(`${plants} plant${plants === 1 ? '' : 's'} · ${lastBackup ? `last backup ${localDateOf(lastBackup) ?? lastBackup}` : 'no backup yet'} · sync ${synced ? 'on' : 'off'}`);
</script>

<dialog class="keep" bind:this={dlg} aria-labelledby="keep-h" onclose={() => { if (keepSheet.open) later(); }}>
  <h2 id="keep-h">Keep your plants</h2>
  <p class="state" id="keep-state">{stateLine}</p>
  <p class="why">Safari can delete what a website has stored once seven days pass without the site being used.</p>
  <ol class="ways">
    <li class="rec">
      <p><b>Turn on sync</b> <span class="tag">recommended</span></p>
      <p>Your plants are copied, encrypted, so this browser, the Home Screen app and your other devices hold the same collection. A label you scan always finds its plant.</p>
      <a class="btn pri" href="/sync" onclick={() => later()}>Turn on sync</a>
    </li>
    <li>
      <p><b>Add to the Home Screen</b></p>
      <p>In Safari, press Share, then Add to Home Screen. The app starts empty: turn on sync or take a backup here first, then choose “I have a key” or Restore there. A label scanned with the Camera opens Safari, so without sync keep your collection here, in Safari.</p>
    </li>
    <li>
      <p><b>Download a backup</b></p>
      <p>One file with every plant and its history, to keep somewhere else.</p>
      <a class="btn" href="/backup" onclick={() => later()}>Back up</a>
    </li>
  </ol>
  <button type="button" class="linkish later" onclick={later}>Remind me in a week</button>
</dialog>

<style>
  .keep { max-width: 30rem; width: calc(100% - 32px); border: 1px solid var(--rule); border-radius: var(--r); padding: 16px 18px; background: var(--bg); color: var(--ink); }
  .keep::backdrop { background: rgb(0 0 0 / 0.35); }
  h2 { margin: 0 0 4px; font-size: var(--fs-lg); }
  .state { margin: 0 0 8px; font-size: var(--fs-sm); color: var(--ink3); }
  .why { margin: 0 0 10px; }
  .ways { margin: 0; padding: 0 0 0 1.2rem; }
  .ways li { margin: 0 0 12px; }
  .ways p { margin: 0 0 4px; }
  .tag { font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--mut); }
  .later { min-height: var(--tap); }
</style>
