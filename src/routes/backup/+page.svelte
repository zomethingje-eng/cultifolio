<script lang="ts">
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { getMeta, setMeta, photoBlobIds } from '$lib/db/vault';
  import { exportBackup, openBackup, restoreBackup, type Opened } from '$lib/backup/io';
  import { importV2, type ImportReport } from '$lib/import/v2';
  import { setCrumb } from '$lib/ui/crumb.svelte';

  let lastBackup = $state<string | null>(null);
  let photoCount = $state<number | null>(null);
  onMount(async () => {
    await collection.load();
    lastBackup = (await getMeta<string>('lastBackup')) ?? null;
    photoCount = (await photoBlobIds()).length;
  });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Backup' }]);
    return () => setCrumb([]);
  });

  /* ---- export ---- */
  let exporting = $state<string | null>(null);
  let exported = $state<{ name: string; bytes: number } | null>(null);
  let exportErr = $state('');
  async function doExport() {
    exporting = 'Packing…';
    exportErr = '';
    try {
      exported = await exportBackup((d, n) => (exporting = `Packing photos ${d} of ${n}…`));
      const now = new Date().toISOString();
      await setMeta('lastBackup', now);
      lastBackup = now;
    } catch (e) {
      exportErr = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = null;
    }
  }

  /* ---- restore ---- */
  let opened = $state.raw<Opened | null>(null);
  let openErr = $state('');
  let v2 = $state.raw<{ changes: ReturnType<typeof importV2>['changes']; report: ImportReport } | null>(null);
  let busy = $state<string | null>(null);
  let done = $state<string | null>(null);
  let confirmReplace = $state(false);
  let fileName = $state('');

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    opened = null;
    v2 = null;
    openErr = '';
    done = null;
    confirmReplace = false;
    fileName = f.name;
    busy = 'Reading…';
    try {
      try {
        opened = await openBackup(f);
      } catch (err) {
        // Not ours? Perhaps a v2 Herbarium backup, which is plain JSON with accessions.
        if (f.name.endsWith('.json')) {
          const json = JSON.parse(await f.text());
          const r = importV2(json);
          if (!r.changes.length) throw err;
          v2 = r;
        } else throw err;
      }
    } catch (err) {
      openErr = err instanceof Error ? err.message : String(err);
    } finally {
      busy = null;
    }
  }
  async function doRestore(mode: 'merge' | 'replace') {
    if (!opened) return;
    busy = mode === 'replace' ? 'Replacing…' : 'Merging…';
    try {
      const r = await restoreBackup(opened, mode, (d, n) => (busy = `Storing photos ${d} of ${n}…`));
      if (mode === 'replace') {
        location.href = '/plants';
        return;
      }
      done = `Merged ${r.changes} ${r.changes === 1 ? 'change' : 'changes'} and ${r.photos} ${r.photos === 1 ? 'photo' : 'photos'}.`;
      opened = null;
      photoCount = (await photoBlobIds()).length;
    } catch (err) {
      openErr = err instanceof Error ? err.message : String(err);
    } finally {
      busy = null;
    }
  }
  async function doV2() {
    if (!v2) return;
    busy = 'Importing…';
    try {
      await collection.ingest(v2.changes);
      const r = v2.report;
      done = `Imported ${r.accessions} plants, ${r.events} timeline entries, ${r.taxa} species notes${r.locations ? `, ${r.locations} places` : ''}${r.sowings ? `, ${r.sowings} sowings` : ''}.${r.skipped.length ? ` Skipped: ${r.skipped.join('; ')}.` : ''}`;
      v2 = null;
    } catch (err) {
      openErr = err instanceof Error ? err.message : String(err);
    } finally {
      busy = null;
    }
  }
  const mb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const ago = (iso: string) => {
    const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  };
</script>

<svelte:head><title>Backup — Cultifolio</title></svelte:head>

<div class="kick" style="margin-top: 22px">My plants</div>
<h1 class="q">Backup</h1>
<p class="secsub">Your collection lives on this device and nowhere else. A backup is one file: every record, every change, every photograph.{#if collection.ready}{' '}<span class="mono faint">{collection.accessions.length} plants · {photoCount ?? '…'} photos</span>{/if}</p>

{#if collection.persisted === false}
  <div class="cult warn"><div class="body"><b>This browser has not promised to keep your data.</b> Storage for sites you rarely open can be cleared to make room. Take a backup now, and install the app to your home screen, which tells the browser to keep it.</div></div>
{/if}

<div class="secrule"><h2>Take a backup</h2><div class="line"></div><span class="n">{lastBackup ? `last ${ago(lastBackup)}` : 'never'}</span></div>
<div class="cult">
  <div class="body">
    <p>One zip file: <code>changes.json</code> (the collection itself, every change ever made), a folder of photographs, and <code>plants.csv</code> for a spreadsheet. Restoring it on another device merges by the same rule sync will use, so nothing is lost by restoring an old file over a newer collection, and restoring twice changes nothing.</p>
    <div class="row">
      <button id="bk-export" class="btn pri" onclick={doExport} disabled={!collection.ready || !!exporting}>{exporting ?? 'Download backup'}</button>
      {#if exported}<span class="ok">Saved <span class="mono">{exported.name}</span>, {mb(exported.bytes)}. Put it somewhere that is not this device.</span>{/if}
      {#if exportErr}<span class="bad">{exportErr}</span>{/if}
    </div>
  </div>
</div>

<div class="secrule"><h2>Restore</h2><div class="line"></div></div>
<div class="cult">
  <div class="body">
    <p>Choose a Cultifolio backup (<span class="mono">.cultifolio.zip</span>, or the older <span class="mono">.json</span> export), or a backup from the v2 Herbarium app (Settings → Backup there). Nothing changes until you confirm below.</p>
    <div class="row">
      <label class="btn"><input id="bk-file" type="file" accept=".zip,.json,application/zip,application/json" onchange={onFile} disabled={!!busy} />{busy ?? 'Choose a file'}</label>
      {#if fileName && !busy}<span class="mono faint">{fileName}</span>{/if}
    </div>
    {#if openErr}<p class="bad">{openErr}</p>{/if}
    {#if done}<p class="ok" id="bk-done">{done} <a href="/plants">See your plants</a>.</p>{/if}
  </div>

  {#if opened}
    {@const m = opened.file.manifest}
    {@const c = opened.counts}
    <div class="preview">
      <div class="factgrid">
        <div><b>In the file</b>{c.accessions} plants · {c.events} timeline entries · {c.locations} places · {c.sowings} sowings · {c.photos} photos{#if m}<span class="faint"> · taken {m.exported.slice(0, 10)}{m.device ? ` on device ${m.device.slice(0, 6)}` : ''}</span>{/if}</div>
        <div><b>Merging would</b>{#if opened.merge.fresh.length === 0}change nothing: everything in the file is already here.{:else}add {opened.merge.added} {opened.merge.added === 1 ? 'record' : 'records'}, update {opened.merge.changed}, and bring in {opened.newPhotos} {opened.newPhotos === 1 ? 'photo' : 'photos'}. Nothing on this device is removed.{/if}</div>
      </div>
      <div class="row acts">
        <button id="bk-merge" class="btn pri" onclick={() => doRestore('merge')} disabled={!!busy || opened.merge.fresh.length === 0 && opened.newPhotos === 0}>Merge into this device</button>
        {#if confirmReplace}
          <span class="bad">Everything on this device is wiped first. Sure?</span>
          <button id="bk-replace-yes" class="btn danger" onclick={() => doRestore('replace')} disabled={!!busy}>Yes, replace</button>
          <button class="btn" onclick={() => (confirmReplace = false)}>Keep</button>
        {:else}
          <button id="bk-replace" class="btn" onclick={() => (confirmReplace = true)} disabled={!!busy}>Replace this device with the file</button>
        {/if}
        <button class="btn" onclick={() => (opened = null)} disabled={!!busy}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if v2}
    <div class="preview">
      <div class="factgrid">
        <div><b>A v2 Herbarium backup</b>{v2.report.accessions} plants, {v2.report.events} timeline entries, {v2.report.taxa} species notes{#if v2.report.locations}, {v2.report.locations} places{/if}{#if v2.report.sowings}, {v2.report.sowings} sowings{/if}. Your numbers are kept. Nothing in the old app is changed.</div>
      </div>
      <div class="row acts">
        <button id="bk-v2" class="btn pri" onclick={doV2} disabled={!!busy}>Import</button>
        <button class="btn" onclick={() => (v2 = null)} disabled={!!busy}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .cult { margin-top: 12px; }
  .cult .body { padding: 14px 17px; font-family: var(--ui); }
  .cult .body p { margin: 0 0 12px; color: var(--ink2); font-size: 14px; line-height: 1.5; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .row input[type='file'] { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  label.btn { position: relative; cursor: pointer; }
  label.btn:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ok { color: var(--accent); font-size: 13.5px; }
  .bad { color: var(--bad); font-size: 13.5px; }
  .faint { color: var(--ink3); }
  .warn { margin-top: 14px; border-left: 3px solid var(--warm); }
  .warn .body { padding: 12px 16px; font-size: 14px; color: var(--ink2); font-family: var(--ui); }
  .preview { border-top: 1px solid var(--rule); padding: 0 17px 14px; }
  .preview .factgrid { margin: 14px 0 12px; box-shadow: none; border: 1px solid var(--rule); grid-template-columns: 1fr 1fr; }
  .preview .factgrid > div { font-size: 13.5px; font-family: var(--ui); }
  .acts { gap: 8px; }
  code { font-family: var(--mono); font-size: 12.5px; background: var(--sunk); padding: 1px 5px; border-radius: 4px; }
  @media (max-width: 640px) { .preview .factgrid { grid-template-columns: 1fr; } }
</style>
