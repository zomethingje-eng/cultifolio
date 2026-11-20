<script lang="ts">
  /**
   * The lock screen (round eighty-seven, t3; plan F12): over every page but the about pages while the app is locked on this
   * device. The passcode opens it; so do the sync key, on a device that syncs, and a backup file of this collection, each
   * of which takes the passcode off, to be set again in Settings. What it protects is said under it, and on /about/how.
   */
  import { lock } from './lock.svelte';
  import { getMeta } from '$lib/db/vault';
  import { tick } from 'svelte';

  let pass = $state('');
  let forgot = $state(false);
  let msg = $state('');
  let busy = $state(false);
  let input = $state<HTMLInputElement | null>(null);
  let now = $state(Date.now());
  $effect(() => { void tick().then(() => input?.focus()); });
  $effect(() => {
    if (!lock.waitUntil) return;
    const t = setInterval(() => { now = Date.now(); if (now >= lock.waitUntil) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  });
  const waitLeft = $derived(Math.max(0, Math.ceil((lock.waitUntil - now) / 1000)));
  async function submit() {
    if (busy || waitLeft) return;
    busy = true; msg = '';
    try {
      if (!(await lock.unlock(pass))) { msg = lock.waitUntil > Date.now() ? 'Five wrong passcodes: try again in 30 seconds.' : 'That is not the passcode.'; now = Date.now(); }
      pass = '';
    } finally {
      busy = false;
    }
  }

  /* ---- coming back without the passcode ---- */
  let keyText = $state('');
  let keyMsg = $state('');
  /**
   * The sync key this device keeps: the one shown when sync was set up here or joined, typed or pasted in any case; or,
   * on a device that stopped syncing while locked, the key it synced with, kept as a hash beside the lock (round
   * eighty-seven, the stage 3 fixes; S3).
   */
  async function byKey() {
    keyMsg = '';
    const [{ parseVaultKey }, { syncKeyHash }] = await Promise.all([import('$lib/sync/crypto'), import('./lock.svelte')]);
    const want = parseVaultKey(keyText);
    if (lock.sealed) {
      // Encrypted: a sync key this device synced with opens the collection's key; the collection is then decrypted back
      // to plain and the passcode taken off, as the sync key always has (round ninety-nine; docs/REVIEW-ROUND-99.md, D7).
      const { openSealWithSyncKey } = await import('$lib/db/vault');
      if (!want || !(await openSealWithSyncKey(want))) { keyMsg = 'That is not a sync key this device synced with.'; return; }
      keyMsg = 'Opened. Decrypting the collection on this device…';
      try {
        await lock.decrypt((p) => (keyMsg = `Decrypting the collection on this device: ${p.what} ${p.done} of ${p.of}…`));
        lock.recovered();
      } catch (err) {
        keyMsg = err instanceof Error ? err.message : String(err);
      }
      return;
    }
    const meta = await getMeta<{ key?: string }>('sync');
    const have = meta?.key ? parseVaultKey(meta.key) : null;
    if (!have && !lock.keptKey) { keyMsg = 'This device does not sync and kept no sync key, so there is no key to check against: open it with a backup file.'; return; }
    if (want && (want === have || (lock.keptKey && (await syncKeyHash(want)) === lock.keptKey))) { lock.recovered(); return; }
    keyMsg = 'That is not this device\'s sync key.';
  }
  /** Which ways back this device has, said before they are tried: whether it syncs, or kept the key it synced with. */
  let syncs = $state<boolean | null>(null);
  $effect(() => { if (forgot && syncs === null && !lock.sealed) void getMeta<{ key?: string }>('sync').then((m) => (syncs = !!m?.key), () => (syncs = false)); });
  /* ---- encrypted, and no key: start again from a backup file (D7) ---- */
  let eraseSure = $state(false);
  let eraseMsg = $state('');
  async function eraseForFile() {
    if (!eraseSure) { eraseMsg = 'Tick the box first: this deletes the collection on this device.'; return; }
    eraseMsg = 'Deleting the collection on this device…';
    try {
      const { eraseVault } = await import('$lib/db/vault');
      await eraseVault();
      lock.remove();
      location.href = '/backup';
    } catch (err) {
      eraseMsg = err instanceof Error ? err.message : String(err);
    }
  }
  let fileMsg = $state('');
  let reading = $state(false);
  /**
   * A backup file of this collection: read on the device, not merged, and taken as this collection's when it holds
   * changes this device's log holds (ten, or every one when the log has fewer). A file of this collection holds what the
   * lock covers, so opening with it shows nothing its holder could not read in it.
   */
  async function byFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f || reading) return;
    reading = true; fileMsg = '';
    try {
      const [{ readBackup }, { collection }] = await Promise.all([import('$lib/backup/backup'), import('$lib/db/collection.svelte')]);
      const file = await readBackup(new Uint8Array(await f.arrayBuffer()));
      const here = await collection.exportChanges();
      const mine = new Set(here.map((c) => c.t));
      const shared = file.changes.filter((c) => mine.has(c.t)).length;
      if (shared >= Math.min(10, here.length)) lock.recovered();
      else fileMsg = 'That file is not a backup of the collection on this device.';
    } catch (err) {
      fileMsg = err instanceof Error ? err.message : String(err);
    } finally {
      reading = false;
    }
  }
</script>

<div class="lockscreen" id="lockscreen" role="dialog" aria-modal="true" aria-labelledby="lock-h">
  <div class="box">
    <h1 id="lock-h">Locked on this device</h1>
    {#if lock.handing}
    <p id="lock-handing" role="status">Opening: taking the collection's key from another open tab of the app…</p>
    {:else}
    <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label for="lock-pass">Passcode</label>
      <div class="line"><input id="lock-pass" type="password" autocomplete="current-password" bind:this={input} bind:value={pass} aria-describedby="lock-msg" /><button class="btn pri" type="submit" id="lock-open" aria-disabled={busy || waitLeft > 0}>{waitLeft ? `Wait ${waitLeft} s` : 'Open'}</button></div>
      <p class="msg" id="lock-msg" role="status">{msg}</p>
    </form>
    <!-- A button and the part it shows, not a disclosure element: the lock screen is drawn only on a locked device. -->
    <button class="linkish forgotbtn" type="button" id="lock-forgot" aria-expanded={forgot} aria-controls="lock-ways" onclick={() => (forgot = !forgot)}>Forgot the passcode?</button>
    {#if forgot && lock.sealed}
    <div class="forgot" id="lock-ways">
      <p id="lock-ways-here">The collection on this device is encrypted under the passcode. A sync key this device synced with opens it, decrypts it and takes the passcode off; set a new one in Settings.</p>
      <form onsubmit={(e) => { e.preventDefault(); void byKey(); }}>
        <label for="lock-key">A sync key this device synced with</label>
        <div class="line"><input id="lock-key" type="text" autocomplete="off" spellcheck="false" bind:value={keyText} placeholder="XXXXX-XXXXX-…" /><button class="btn" type="submit" id="lock-bykey">Open with the key</button></div>
        <p class="msg" role="status">{keyMsg}</p>
      </form>
      <p>A backup file cannot open it: the file holds no key. With no sync key, the collection on this device can be deleted and restored from a backup file; what was added since the file was made is lost, unless another device syncs it.</p>
      <label class="check"><input type="checkbox" id="lock-erase-sure" bind:checked={eraseSure} /> Delete the collection, its photographs and papers on this device</label>
      <div class="line"><button class="btn" type="button" id="lock-erase" onclick={eraseForFile}>Delete it and restore from a backup file</button></div>
      <p class="msg" role="status">{eraseMsg}</p>
    </div>
    {:else if forgot}
    <div class="forgot" id="lock-ways">
      <p id="lock-ways-here">{syncs === null ? 'Either of these opens the app and takes the passcode off; set a new one in Settings.' : syncs ? 'This device syncs: its sync key opens the app, and so does a backup file of this collection. Either takes the passcode off; set a new one in Settings.' : lock.keptKey ? 'This device stopped syncing while locked and kept the sync key it synced with: that key opens the app, and so does a backup file of this collection. Either takes the passcode off; set a new one in Settings.' : 'This device does not sync and kept no sync key: a backup file of this collection opens the app and takes the passcode off; set a new one in Settings.'}</p>
      <form onsubmit={(e) => { e.preventDefault(); void byKey(); }}>
        <label for="lock-key">{syncs === false && lock.keptKey ? 'The sync key this device synced with' : "This device's sync key"}</label>
        <div class="line"><input id="lock-key" type="text" autocomplete="off" spellcheck="false" bind:value={keyText} placeholder="XXXXX-XXXXX-…" /><button class="btn" type="submit" id="lock-bykey">Open with the key</button></div>
        <p class="msg" role="status">{keyMsg}</p>
      </form>
      <label for="lock-file">Or a backup file of this collection (.cultifolio.zip), read here and not restored</label>
      <input id="lock-file" type="file" accept=".zip,application/zip" onchange={byFile} disabled={reading} />
      <p class="msg" role="status">{reading ? 'Reading the file…' : fileMsg}</p>
      <p class="small">With neither, clearing this site's data in the browser's settings takes the lock off, and the collection on this device with it.</p>
    </div>
    {/if}
    {/if}
    {#if lock.sealed}
    <p class="small what" id="lock-sealed-what">The collection on this device is encrypted under the passcode: without it, or a sync key this device synced with, its records, photographs and papers cannot be read from the browser's storage. <a href="/about/how#sealed">What it protects</a>.</p>
    {:else}
    <p class="small what">The lock is a screen over the app: the collection on this device is not encrypted, so it keeps out a casual look, not someone who can read the browser's storage. <a href="/about/how#lock">What it protects</a>.</p>
    {/if}
  </div>
</div>

<style>
  .lockscreen { position: fixed; inset: 0; z-index: 1000; background: var(--bg); color: var(--ink); overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: max(48px, env(safe-area-inset-top)) 16px 32px; box-sizing: border-box; }
  .box { width: min(100%, 440px); }
  h1 { font-size: 1.4rem; margin: 0 0 16px; }
  label { display: block; font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); margin: 10px 0 4px; }
  .line { display: flex; gap: 8px; flex-wrap: wrap; }
  input[type='password'], input[type='text'] { flex: 1 1 180px; min-width: 0; font: inherit; font-size: var(--fs-md); min-height: var(--tap); padding: 6px 10px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--field, var(--card)); color: var(--ink); box-sizing: border-box; }
  .btn { min-height: var(--tap); }
  .msg { min-height: 1.4em; margin: 4px 0 0; font-size: var(--fs-md); color: var(--bad); }
  .forgot { margin-top: 6px; border-top: 1px solid var(--rule); padding-top: 10px; }
  .forgotbtn { margin-top: 18px; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--link, var(--accent)); text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  .forgot p { font-size: var(--fs-md); }
  .small { font-size: var(--fs-sm); color: var(--ink3); }
  .what { margin-top: 18px; }
  input[type='file'] { max-width: 100%; font-size: var(--fs-md); min-height: var(--tap); }
  .check { display: flex; gap: 8px; align-items: center; font-weight: 400; color: var(--ink); font-size: var(--fs-md); min-height: var(--tap); }
</style>
