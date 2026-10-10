<script lang="ts">
  /**
   * My plants' head menu (round sixty; the grower review's §4, "Import" and "Download as spreadsheet" in the head's
   * overflow): bring plants in from a list or a sheet, and take them out as the backup's own plants.csv, made on the
   * device and downloaded directly.
   */
  import { toast } from '$lib/ui/toast.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  import { addLeavesExample } from './example.svelte';
  let open = $state(false);
  let btn = $state<HTMLButtonElement | null>(null);
  let busy = $state(false);
  const close = (refocus = false) => { open = false; if (refocus) btn?.focus(); };
  const first = (el: HTMLElement) => { el.querySelector<HTMLElement>('[role=menuitem]')?.focus(); };
  function keys(e: KeyboardEvent) {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1]?.focus(); } // the menu pattern's keys (round sixty-one; the accessibility review, 11)
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
  }
  /** Nothing to download yet: the item stays focusable and says so, as the menu pattern asks (round sixty-one; the accessibility review, 11).
   *  While the collection is still opening it says that, not "no plants yet", which it said of a collection not yet read
   *  (round sixty-six; the all-engines run, r61a a11y 2, where Safari's engine on the PC opened it after the menu; rule 2). */
  const empty = $derived(!collection.ready || !collection.accessions.length);
  async function sheet() {
    if (busy || empty) return;
    // Focus back on "···" before the item goes: the item was removed under focus and the button disabled, and focus fell
    // to the page (round sixty-one; the accessibility review, 2).
    close(true);
    busy = true;
    // Loaded when asked for: a static import carried the backup module, 9% of the page's script, into every visit to My plants (round sixty-two; the accessibility review, 9).
    try { const { downloadPlantsSheet } = await import('$lib/export/sheet'); await downloadPlantsSheet(); toast.show('plants.csv made on this device and downloaded.'); }
    catch (e) { toast.show(`The sheet was not made: ${e instanceof Error ? e.message : String(e)}`); }
    finally { busy = false; }
  }
</script>

<svelte:window onclick={(e) => { if (open && !(e.target as Element).closest('.plantsmenu')) close(); }} />
<div class="plantsmenu">
  <button class="btn dots" type="button" id="plants-menu-btn" bind:this={btn} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'plants-menu' : undefined} aria-label={PAGE_IN_DEMO ? 'More: import your own list' : 'More: import, download as a spreadsheet'} title={PAGE_IN_DEMO ? 'Import your own list' : 'Import, download as a spreadsheet'} onclick={() => { if (!busy) open = !open; }} aria-disabled={busy}>···</button>
  {#if open}
    <div class="menu" id="plants-menu" role="menu" tabindex="-1" aria-label="More for My plants" use:first onkeydown={keys}>
      <!-- In the example, an import is the grower's own and leads out of it first, as every add does; and the example
           offers no spreadsheet of plants that are not the visitor's (round sixty-seven; triage-66 V1, V7; R45-3). -->
      <a role="menuitem" href="/plants/import" onclick={(e) => { close(); addLeavesExample(e, '/plants/import'); }}>{PAGE_IN_DEMO ? 'Import your own list (leaves the example)' : 'Import from a list or a spreadsheet'}</a>
      {#if !PAGE_IN_DEMO}<button role="menuitem" type="button" id="plants-sheet" onclick={sheet} aria-disabled={empty}>Download as a spreadsheet{#if empty}<span class="why">{collection.ready ? ': no plants yet' : ': your collection is still opening'}</span>{/if}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .plantsmenu { position: relative; }
  .dots { min-width: var(--tap); min-height: var(--tap); letter-spacing: 1px; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 60; /* above the sticky search row (z 40) */ min-width: 240px; display: flex; flex-direction: column; padding: 4px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .menu [role='menuitem'] { display: block; text-align: left; padding: 10px 12px; min-height: var(--tap); border: 0; background: none; color: var(--ink); font: inherit; font-size: var(--fs-md); text-decoration: none; border-radius: var(--r); cursor: pointer; }
  .menu [role='menuitem']:hover, .menu [role='menuitem']:focus-visible { background: var(--sunk); }
  .menu [role='menuitem'][aria-disabled='true'] { color: var(--ink3); cursor: default; }
</style>
