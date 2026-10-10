<script lang="ts">
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { getMeta, setMeta, photoBlobIds, storageErrorText } from '$lib/db/vault';
  import { prepareBackup, downloadBackup, openBackup, restoreBackup, type Opened, type PreparedBackup } from '$lib/backup/io';
  import { ReplaceBegunError } from '$lib/backup/replace';
  import { sync } from '$lib/sync/engine.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { heldWords } from '$lib/ui/held-words';
  import { listWords, plural, some } from '$lib/ui/words';
  import { keepWorking } from '$lib/ui/grow/example.svelte';

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
  /** A built file that is short of photographs, held back until the person has read what is not in it. */
  let shortfall = $state.raw<PreparedBackup | null>(null);
  async function doExport() {
    exporting = 'Packing…';
    exportErr = '';
    exported = null;
    shortfall = null;
    try {
      const p = await prepareBackup((d, n) => (exporting = `Packing photos ${d} of ${n}…`));
      if (p.photosMissing.length) shortfall = p;
      else await save(p);
    } catch (e) {
      exportErr = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = null;
    }
  }
  async function save(p: PreparedBackup) {
    downloadBackup(p);
    exported = { name: p.name, bytes: p.bytes };
    shortfall = null;
    const now = new Date().toISOString();
    await setMeta('lastBackup', now);
    lastBackup = now;
  }

  /* ---- restore ---- */
  let opened = $state.raw<Opened | null>(null);
  let openErr = $state('');
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
    openErr = '';
    done = null;
    confirmReplace = false;
    fileName = f.name;
    busy = 'Reading…';
    try {
      opened = await openBackup(f);
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
      const heldBefore = collection.heldWaiting;
      // Work a page load must not cut off: no page goes into the example collection while it runs, and the browser asks
      // before a reload or a closed tab (round sixty-three, the fix pass; R1, 2). On a fresh device the collection reads
      // empty until the photographs' pixels are stored and the changes taken in, and an empty Today opened the example
      // over a restore cut in half, its pixels left named by no record. A move to another page in the app does not stop it.
      const o = opened;
      restoring = true;
      const r = await keepWorking(() => restoreBackup(o, mode, (d, n) => (busy = `Storing photos ${d} of ${n}…`))).finally(() => (restoring = false));
      if (mode === 'replace') {
        location.href = '/plants';
        return;
      }
      // The outcome in the grower's words first; the log's own count of changes after it (round sixty; the grower review, §3).
      done = `Merged: ${opened && opened.merge.fresh.length ? `${addedWords(opened.merge)} added${opened.merge.changed ? `, ${plural(opened.merge.changed, 'record')} here updated from the file` : ''}` : 'nothing new to add'}. ${plural(r.changes, 'change')} taken in; nothing here was removed.`;
      // Changes dated ahead of this device's clock are in the log and wait for its date: said, so a list that stays short is not read as a restore that failed (round sixty; decision 2, the data review's 6).
      const heldNow = collection.heldWaiting - heldBefore;
      if (heldNow > 0) done += ` ${heldWords(heldNow)}`;
      if (r.photosMissing) done += ` ${r.photosMissing} ${r.photosMissing === 1 ? 'photo record has' : 'photo records have'} no photograph: the file did not hold the pixels and neither does this device. The ${r.photosMissing === 1 ? 'record is' : 'records are'} kept.`;
      if (r.settingsRestored.length) done += ` This device had no ${r.settingsRestored.length > 1 ? r.settingsRestored.slice(0, -1).join(', ') + ' or ' + r.settingsRestored.at(-1) : r.settingsRestored[0]} of its own, so the file's ${r.settingsRestored.length === 1 ? 'was' : 'were'} applied.`;
      opened = null;
      photoCount = (await photoBlobIds()).length;
    } catch (err) {
      // A replacement whose switch began: the device now holds part of the file and finishes it at the next open, so the
      // old collection on screen is only this tab's memory. Said, and the page reloads (round sixty-seven; triage-66 R1).
      if (err instanceof ReplaceBegunError) {
        const why = await storageErrorText(err.reason);
        openErr = `${why ? 'This device ran out of space during the switch. ' : ''}${err.message}.`;
        opened = null;
        setTimeout(() => location.reload(), 2500);
        return;
      }
      openErr = (await storageErrorText(err)) ?? (err instanceof Error && err.message ? err.message : String(err)); // a full device is named as such (round twenty-nine, 4)
    } finally {
      busy = null;
    }
  }
  /** A restore or merge is storing: a reload or a closed tab would cut it off, so the browser asks first. */
  let restoring = false;
  function guardUnload(e: BeforeUnloadEvent) {
    if (restoring) e.preventDefault();
  }
  /**
   * "40 plants, 6 places and 1 photo": what a grower recognises, said first. The app's own records (species records, the
   * numbering scheme), records the file holds as removed, and records waiting for a field go under "What's in the file":
   * "6 deleted records" read as a restore that deletes (round sixty; the grower review, 16 and §3).
   */
  const addedWords = (m: Opened['merge']): string => {
    const k = m.addedByKind;
    return listWords([some(k.accession, 'plant'), some(k.location, 'place'), some(k.sowing, 'propagation batch', 'propagation batches'), some(k.event, 'timeline entry', 'timeline entries'), some(k.photo, 'photo')]) || (k.taxon || k.setting ? 'only the app\'s own records' : m.added ? 'no record a page shows' : 'no records'); // not "the app's own" when the file adds only removed records or the lines of a removed plant (round sixty-three; the backlog audit, 20)
  };
  /** The rest of what a merge adds, for the disclosure. */
  const addedDetail = (m: Opened['merge']): string[] => {
    const k = m.addedByKind;
    return [
      k.taxon ? `${plural(k.taxon, 'species record')}: the app's own, one per species grown or followed` : '',
      k.setting ? 'the numbering scheme' : '',
      m.addedDeleted ? `${plural(m.addedDeleted, 'record')} removed on the other device, which ${m.addedDeleted === 1 ? 'stays' : 'stay'} removed here; nothing on this device is removed` : '',
      // The lines and photographs of a plant or batch removed (in the file or here) or not yet shown: counted apart, not as added (round sixty-three; the backlog audit, 20).
      m.addedOnRemoved ? `${listWords([some(m.addedOnRemovedByKind.event ?? 0, 'timeline entry', 'timeline entries'), some(m.addedOnRemovedByKind.photo ?? 0, 'photo')])} ${m.addedOnRemoved === 1 ? 'on a removed plant or batch (or one not shown yet): kept, and shown on its page only if it comes back' : 'on removed plants or batches (or ones not shown yet): kept, and shown on their pages only if they come back'}` : '',
      m.addedWaiting ? `${plural(m.addedWaiting, 'record')} the file leaves without a field ${m.addedWaiting === 1 ? 'it' : 'they'} cannot be shown without (${m.waitingNames.slice(0, 5).join(', ')}${m.waitingNames.length > 5 ? ` and ${m.waitingNames.length - 5} more` : ''}); not shown until a later file or sync completes ${m.addedWaiting === 1 ? 'it' : 'them'}` : ''
    ].filter(Boolean);
  };
  /** The numbers a merge would leave on two plants, one line each: "2026-0004: Copiapoa cinerea here and Echeveria from the file". */
  const sharedLines = (rows: Opened['merge']['sharedNumbers']): string[] => {
    const by = new Map<string, Array<{ here: boolean; name: string }>>();
    for (const r of rows) { const xs = by.get(r.no) ?? []; xs.push(r); by.set(r.no, xs); }
    return [...by].map(([no, xs]) => `${no}: ${listWords(xs.map((x) => `${x.name.trim() || 'a plant'} ${x.here ? 'here' : 'from the file'}`))}`);
  };
  const mb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const ago = (iso: string) => {
    const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  };
</script>

<svelte:head><title>Backup · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} />

<PageHead title="Backup" kick="My plants" places={false} sub="One file holds every record, every change and every photograph, and this device's settings (site, units, label choices), which a restore applies on a device that has none." count={collection.ready ? `${plural(collection.accessions.length, 'plant')} · ${photoCount == null ? '… photos' : plural(photoCount, 'photo')}` : undefined} />

{#if collection.failed}
  <div class="notice err" role="alert" id="bk-failed">{collection.failed}</div>
{/if}
{#if collection.malformed}
  <!-- Skipped and counted (round sixty-seven; triage-66 R10): the change stays in the log and in a backup, and is not folded. -->
  <p class="notice" id="bk-malformed">{collection.malformed === 1 ? 'One change' : `${collection.malformed} changes`} in this device's log could not be read and {collection.malformed === 1 ? 'is' : 'are'} not shown. {collection.malformed === 1 ? 'It stays' : 'They stay'} in the log, and in a backup.</p>
{/if}
{#if collection.persisted === false}
  <div class="cult warn"><div class="body"><!-- The outcome first, warmly; the browser's rule kept (round sixty; the grower review, §3). --><b>Your plants live only in this browser.</b> Take a backup now and install the app to your home screen so they are safe: a browser can clear storage for sites you rarely open, and has not promised to keep this one's.</div></div>
{/if}

<div class="secrule"><h2>Take a backup</h2><div class="line"></div><span class="n">{lastBackup ? `last ${ago(lastBackup)}` : 'never'}</span></div>
<div class="cult">
  <div class="body">
    <p>One zip file: <code>changes.json</code> (the collection itself, every change ever made), a folder of photographs, and <code>plants.csv</code>, <code>batches.csv</code> and <code>events.csv</code> for a spreadsheet. Restoring it on another device merges by the same rule sync will use, so nothing is lost by restoring an old file over a newer collection, and restoring twice changes nothing.</p>
    <div class="row">
      <button id="bk-export" class="btn pri" onclick={doExport} disabled={!collection.ready || !!exporting}>{exporting ?? 'Download backup'}</button>
      {#if exported}<span class="ok">Saved <span class="mono">{exported.name}</span>, {mb(exported.bytes)}. Put it somewhere that is not this device.</span>{/if}
      {#if exportErr}<span class="bad">{exportErr}</span>{/if}
    </div>
    {#if shortfall}
      {@const n = shortfall.photosMissing.length}
      <div class="notice err" id="bk-shortfall">{n} {n === 1 ? 'photograph had' : 'photographs had'} no pixels on this device and {n === 1 ? 'is' : 'are'} not in the file. {n === 1 ? 'Its record is' : 'Their records are'}, and the file says which.{#if sync.configured}{' '}Sync may still bring the pixels down; take the backup again afterwards.{/if} <button class="btn" type="button" onclick={() => shortfall && save(shortfall)}>Download it anyway</button></div>
    {/if}
  </div>
</div>

<div class="secrule"><h2>Restore</h2><div class="line"></div></div>
<div class="cult">
  <div class="body">
    <p>Choose a Cultifolio backup (<span class="mono">.cultifolio.zip</span>). Nothing changes until you confirm below.</p>
    <div class="row">
      <label class="btn"><input id="bk-file" type="file" accept=".zip,application/zip" onchange={onFile} disabled={!!busy} />{busy ?? 'Choose a file'}</label>
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
        <div><b>In the file</b>{c.accessions} plant{c.accessions === 1 ? '' : 's'} · {c.events} timeline entr{c.events === 1 ? 'y' : 'ies'} · {c.locations} place{c.locations === 1 ? '' : 's'} · {c.sowings} propagation batch{c.sowings === 1 ? '' : 'es'} · {c.photos} photo{c.photos === 1 ? "" : "s"}{#if c.taxa}{' · '}{c.taxa} species record{c.taxa === 1 ? '' : 's'}{/if}{#if m}<span class="faint">{" · "}taken {m.exported.slice(0, 10)}{m.device ? ` on device ${m.device.slice(0, 6)}` : ''}</span>{/if}</div>
        <!-- The outcome first, in a grower's words: "40 plants, 6 places and 1 photo will be added. Nothing here is removed."; the rest one tap away (round sixty; the grower review, §3). -->
        <div id="bk-preview"><b>Merging</b>{#if opened.merge.fresh.length === 0 && !opened.settings.length}Nothing changes: everything in the file is already here.{:else if opened.merge.fresh.length === 0}No records are added (everything in the file is already here); the file's {opened.settings.join(', ')} {opened.settings.length === 1 ? 'is' : 'are'} applied, since this device has none.{:else}{@const what = addedWords(opened.merge)}{what[0].toUpperCase() + what.slice(1)} will be added{#if opened.merge.changed}, and {plural(opened.merge.changed, 'record')} here updated from the file{/if}{#if opened.newPhotos - (opened.merge.addedByKind.photo ?? 0) - (opened.merge.addedOnRemovedByKind.photo ?? 0) > 0}, with the pixels of {plural(opened.newPhotos - (opened.merge.addedByKind.photo ?? 0) - (opened.merge.addedOnRemovedByKind.photo ?? 0), 'photograph')} already listed here{/if}. Nothing here is removed.{#if opened.settings.length} The file's {opened.settings.join(', ')} {opened.settings.length === 1 ? 'is' : 'are'} applied, since this device has none.{/if}{/if}{#if opened.missingPixels.length} {plural(opened.missingPixels.length, 'photo record')} in the file {opened.missingPixels.length === 1 ? 'has' : 'have'} no photograph in it or on this device.{/if}{#if opened.file.unreadable.length} {plural(opened.file.unreadable.length, 'change')} in the file cannot be read and {opened.file.unreadable.length === 1 ? 'is' : 'are'} left out ({opened.file.unreadable[0]}).{/if}</div>
      </div>
      {#if opened.merge.sharedNumbers.length}
        {@const lines = sharedLines(opened.merge.sharedNumbers)}
        <!-- A merge never renumbers on its own: the number stays on both plants until the grower presses Renumber on one (round sixty; the lead's preview). -->
        <div class="notice" id="bk-shared">
          <p>{lines.length === 1 ? 'One number would then be on two plants' : `${lines.length} numbers would then each be on two plants`}:</p>
          <ul>{#each lines as l (l)}<li>{l}</li>{/each}</ul>
          <p>Both keep the number until you choose. Each plant's page says so and offers Renumber, which gives one of them the next free number, with a note saying so.</p>
        </div>
      {/if}
      {#if opened.merge.fresh.length && addedDetail(opened.merge).length}
        <details class="infile"><summary>What's in the file</summary><ul>{#each addedDetail(opened.merge) as d (d)}<li>{d}</li>{/each}</ul></details>
      {/if}
      <div class="row acts">
        <button id="bk-merge" class="btn pri" onclick={() => doRestore('merge')} disabled={!!busy || (opened.merge.fresh.length === 0 && opened.newPhotos === 0 && opened.settings.length === 0)}>Merge into this device</button>
        {#if confirmReplace}
          <!-- What replacing loses, counted: the plants here that the file does not hold (round fifty-one, 4). -->
          <span class="bad">The file is stored in full first; then everything on this device is replaced by it{#if opened.onlyHere.length}: {opened.onlyHere.length} {opened.onlyHere.length === 1 ? 'plant exists' : 'plants exist'} only on this device and {opened.onlyHere.length === 1 ? 'is' : 'are'} lost ({opened.onlyHere.slice(0, 6).join(', ')}{opened.onlyHere.length > 6 ? ` and ${opened.onlyHere.length - 6} more` : ''}); <button class="linkish" type="button" onclick={doExport} disabled={!!exporting}>back up first</button>{:else}; every plant here is in the file too{/if}{#if opened.changedHere}; {opened.changedHere} {opened.changedHere === 1 ? 'record has' : 'records have'} changes made here that the file lacks, and those are lost too{#if !opened.onlyHere.length}; <button class="linkish" type="button" onclick={doExport} disabled={!!exporting}>back up first</button>{/if}{/if}{#if sync.configured}, and sync is turned off (a synced vault would merge straight back in; you can create a new vault or re-join afterwards){/if}. Sure?</span>
          <button id="bk-replace-yes" class="btn danger" onclick={() => doRestore('replace')} disabled={!!busy}>Yes, replace</button>
          <button class="btn" onclick={() => (confirmReplace = false)}>Keep</button>
        {:else if opened.file.unreadable.length}
          <!-- A replacement is the file and nothing else: a change this build cannot read would be gone for good (round forty-nine, 1). -->
          <button id="bk-replace" class="btn" disabled title="Not offered for a file with changes this version cannot read">Replace this device with the file</button>
          <span class="muted" id="bk-replace-why">Replacing is not offered for this file: {opened.file.unreadable.length === 1 ? 'a change' : `${opened.file.unreadable.length} changes`} in it cannot be read by this version and would be lost for good. Merge keeps {opened.file.unreadable.length === 1 ? 'it' : 'them'} in the file.</span>
        {:else}
          <button id="bk-replace" class="btn" onclick={() => (confirmReplace = true)} disabled={!!busy}>Replace this device with the file</button>
        {/if}
        <button class="btn" onclick={() => (opened = null)} disabled={!!busy}>Cancel</button>
      </div>
    </div>
  {/if}

</div>

<style>
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .cult { margin-top: 12px; }
  .cult .body { padding: 14px 17px; font-family: var(--ui); }
  .cult .body p { margin: 0 0 12px; color: var(--ink2); font-size: var(--fs-md); line-height: 1.5; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .row input[type='file'] { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  label.btn { position: relative; cursor: pointer; }
  label.btn:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ok { color: var(--accent); font-size: var(--fs-md); }
  .bad { color: var(--bad); font-size: var(--fs-md); }
  .faint { color: var(--ink3); }
  .warn { margin-top: 14px; border-left: 3px solid var(--warm); }
  .warn .body { padding: 12px 16px; font-size: var(--fs-md); color: var(--ink2); font-family: var(--ui); }
  .preview { border-top: 1px solid var(--rule); padding: 0 17px 14px; }
  .preview .factgrid { margin: 14px 0 12px; box-shadow: none; border: 1px solid var(--rule); grid-template-columns: 1fr 1fr; }
  .preview .factgrid > div { font-size: var(--fs-md); font-family: var(--ui); }
  .acts { gap: 8px; }
  .infile { margin: 0 0 12px; font-size: var(--fs-md); color: var(--ink2); }
  .infile summary { cursor: pointer; min-height: var(--tap); display: flex; align-items: center; }
  .infile ul, #bk-shared ul { margin: 4px 0 0; padding-left: 20px; }
  #bk-shared { margin: 0 0 12px; font-size: var(--fs-md); }
  #bk-shared p { margin: 0 0 4px; }
  code { font-family: var(--mono); font-size: var(--fs-md); background: var(--sunk); padding: 1px 5px; border-radius: 4px; }
  @media (max-width: 640px) { .preview .factgrid { grid-template-columns: 1fr; } }
</style>
