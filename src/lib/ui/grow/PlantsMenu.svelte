<script lang="ts">
  /**
   * My plants' head menu (round sixty; the grower review's §4, "Import" and "Download as spreadsheet" in the head's
   * overflow): bring plants in from a list or a sheet, and take them out as the backup's own plants.csv, made on the
   * device and downloaded directly.
   */
  import { downloadPlantsSheet } from '$lib/export/sheet';
  import { toast } from '$lib/ui/toast.svelte';
  import { collection } from '$lib/db/collection.svelte';
  let open = $state(false);
  let btn = $state<HTMLButtonElement | null>(null);
  let busy = $state(false);
  const close = (refocus = false) => { open = false; if (refocus) btn?.focus(); };
  const first = (el: HTMLElement) => { el.querySelector<HTMLElement>('[role=menuitem]')?.focus(); };
  function keys(e: KeyboardEvent) {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
  }
  async function sheet() {
    close();
    busy = true;
    try { await downloadPlantsSheet(); toast.show('plants.csv made on this device and downloaded.'); }
    catch (e) { toast.show(`The sheet was not made: ${e instanceof Error ? e.message : String(e)}`); }
    finally { busy = false; }
  }
</script>

<svelte:window onclick={(e) => { if (open && !(e.target as Element).closest('.plantsmenu')) close(); }} />
<div class="plantsmenu">
  <button class="btn dots" type="button" id="plants-menu-btn" bind:this={btn} aria-haspopup="menu" aria-expanded={open} aria-controls="plants-menu" aria-label="More: import, download as a spreadsheet" title="Import, download as a spreadsheet" onclick={() => (open = !open)} disabled={busy}>···</button>
  {#if open}
    <div class="menu" id="plants-menu" role="menu" tabindex="-1" aria-label="More for My plants" use:first onkeydown={keys}>
      <a role="menuitem" href="/plants/import" onclick={() => close()}>Import from a list or a spreadsheet</a>
      <button role="menuitem" type="button" id="plants-sheet" onclick={sheet} disabled={!collection.ready || !collection.accessions.length}>Download as a spreadsheet</button>
    </div>
  {/if}
</div>

<style>
  .plantsmenu { position: relative; }
  .dots { min-width: var(--tap); min-height: var(--tap); letter-spacing: 1px; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 60; /* above the sticky search row (z 40) */ min-width: 240px; display: flex; flex-direction: column; padding: 4px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .menu [role='menuitem'] { display: block; text-align: left; padding: 10px 12px; min-height: var(--tap); border: 0; background: none; color: var(--ink); font: inherit; font-size: var(--fs-md); text-decoration: none; border-radius: var(--r); cursor: pointer; }
  .menu [role='menuitem']:hover, .menu [role='menuitem']:focus-visible { background: var(--sunk); }
  .menu [role='menuitem']:disabled { color: var(--ink3); cursor: default; }
</style>
