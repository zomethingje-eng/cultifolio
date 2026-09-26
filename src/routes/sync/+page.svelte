<script lang="ts">
  /**
   * Sync between your devices. One vault key, made here once, is all there
   * is: it encrypts everything before it leaves the device, and it is what a
   * second device needs. The server keeps ciphertext and cannot read or
   * recover any of it.
   */
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import QRCode from 'qrcode';
  import { collection } from '$lib/db/collection.svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { newVaultKey, parseVaultKey, pairingUrl } from '$lib/sync/crypto';
  import { setCrumb } from '$lib/ui/crumb.svelte';

  let mode = $state<'idle' | 'create' | 'join'>('idle');
  let freshKey = $state('');
  let typed = $state('');
  let saved = $state(false);
  let err = $state('');
  let busy = $state(false);
  let showKey = $state(false);
  let qr = $state('');
  let scanning = $state(false);
  let scanErr = $state('');
  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;

  onMount(async () => {
    await collection.load();
    await sync.init();
  });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Sync' }]);
    return () => {
      setCrumb([]);
      stopScan();
    };
  });
  $effect(() => {
    const k = showKey ? sync.key : mode === 'create' ? freshKey : null;
    if (k) QRCode.toString(pairingUrl(k), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }).then((s) => (qr = s));
    else qr = '';
  });

  function startCreate() {
    freshKey = newVaultKey();
    saved = false;
    err = '';
    mode = 'create';
  }
  async function create() {
    busy = true;
    err = '';
    try {
      await sync.setup(freshKey);
      mode = 'idle';
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function join() {
    const k = parseVaultKey(typed);
    if (!k) {
      err = 'That is not a vault key: six groups of five letters and digits.';
      return;
    }
    busy = true;
    err = '';
    try {
      await sync.setup(k, 'join');
      mode = 'idle';
      typed = '';
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  async function startScan() {
    scanErr = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      scanning = true;
      await new Promise((r) => setTimeout(r, 50));
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const Det = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      const det = new Det({ formats: ['qr_code'] });
      const tick = async () => {
        if (!scanning || !video) return;
        try {
          const codes = await det.detect(video);
          const hit = codes.map((c) => parseVaultKey(c.rawValue)).find(Boolean);
          if (hit) {
            typed = hit;
            stopScan();
            await join();
            return;
          }
        } catch {
          /* keep trying */
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      scanErr = e instanceof Error ? e.message : 'The camera could not be opened.';
      scanning = false;
    }
  }
  function stopScan() {
    scanning = false;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  async function copyKey(k: string) {
    try {
      await navigator.clipboard.writeText(k);
      saved = true;
    } catch {
      /* the key is on screen */
    }
  }
  let confirmForget = $state(false);
  const ago = (iso: string) => {
    const s = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
  };
  const mb = (n: number) => (n >= 100 * 1048576 ? Math.round(n / 1048576) : Math.round((n / 1048576) * 10) / 10);
  const when = (ms: number) => new Date(ms).toLocaleString();
</script>

<svelte:head><title>Sync — Cultifolio</title></svelte:head>

<PageHead title="Sync" kick="My plants" places={false} sub="The same collection on your phone and your computer, encrypted with a key only you hold." />

{#if sync.configured}
  <div class="secrule"><h2>This device</h2><div class="line"></div><span class="n">vault {sync.vaultId.slice(0, 6)}…</span></div>
  <div class="cards">
    <div class="card" data-runs={sync.runs}><div class="lab">Status</div><div class="val" style="font-family: var(--ui); font-size: 17px; font-weight: 700">{sync.busy ?? (sync.lastError ? 'Not synced' : sync.vaultFull ? 'Vault full' : 'Synced')}</div><div class="sub">{sync.busy ? '' : sync.lastError ? sync.lastError : sync.lastSync ? `everything on the server ${ago(sync.lastSync)} is here` : 'not yet'}</div></div>
    <div class="card"><div class="lab">Waiting to send</div><div class="val">{sync.pending}</div><div class="sub">{sync.pending === 1 ? 'change' : 'changes'} made here and not yet up</div></div>
    {#if sync.quarantined.length || sync.refused.length}
      <div class="card"><div class="lab">Set aside</div><div class="val">{sync.quarantined.length + sync.refused.length}</div><div class="sub">{#if sync.quarantined.length}{sync.quarantined.length} {sync.quarantined.length === 1 ? 'batch' : 'batches'} on the server could not be read here{/if}{#if sync.quarantined.length && sync.refused.length}; {/if}{#if sync.refused.length}the server refused {sync.refused.length} {sync.refused.length === 1 ? 'item' : 'items'} from this device{/if}. Syncing carries on around them.</div></div>
    {/if}
    <div class="card"><div class="lab">Encryption</div><div class="val" style="font-family: var(--ui); font-size: 17px; font-weight: 700">AES-256-GCM</div><div class="sub">key never leaves your devices</div></div>
  </div>
  {#if sync.vaultFull}
    <p class="notice bad" id="vault-full">Your vault is full ({mb(sync.vaultFull.bytes)} of {mb(sync.vaultFull.limit)} MB). Delete photographs or export and start a new vault. Changes made here are kept on this device and sent once there is room; receiving carries on.</p>
  {/if}
  {#if sync.clockWarning}
    <p class="notice warn" id="clock-warning">{sync.clockWarning}</p>
  {/if}
  {#if sync.held}
    <p class="notice" id="held">{sync.held} {sync.held === 1 ? 'change' : 'changes'} from a device whose clock was ahead {sync.held === 1 ? 'is' : 'are'} held until {sync.heldUntil ? when(sync.heldUntil) : 'this device catches up'}. {sync.held === 1 ? 'It is' : 'They are'} stored here and will show then.</p>
  {/if}
  <div class="quickbar">
    <button id="sync-now" class="btn pri" onclick={() => sync.run().catch(() => {})} disabled={!!sync.busy}>Sync now</button>
    <button id="sync-show-key" class="btn" onclick={() => (showKey = !showKey)}>{showKey ? 'Hide the key' : 'Add another device'}</button>
  </div>

  {#if showKey}
    <div class="cult pair" id="pairing">
      <div class="sum">Your vault key <span class="hint">scan it, or type it, on the other device</span></div>
      <div class="body">
        <div class="pairrow">
          <div class="qr">{@html qr}</div>
          <div>
            <div class="keytext mono" id="vault-key">{sync.key}</div>
            <p class="small muted">On the other device: My plants → Sync → <b>I have a key</b>, then scan this code or type the key. Anyone with this key can read your collection; keep it where you keep passwords.</p>
            <button class="btn" onclick={() => copyKey(sync.key!)}>{saved ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <div class="secrule"><h2>How it works</h2><div class="line"></div></div>
  <div class="cult"><div class="body prose">
    <p>Every change you make (a watering, a note, a photograph) is sealed on this device with a key derived from your vault key, then sent as a batch. Other devices with the same key pull the batches and merge them by the same rule a backup uses: for each field, the latest change wins, wherever it was made. Nothing on the server is ever rewritten or deleted, so a sync interrupted halfway simply resumes. "Synced" is a statement about a moment: everything the server held at that time is on this device. A change another device sends later is not here until the next sync, which runs when a change is made here, when the app comes back to the front, when the connection returns, every few minutes while the app is open, and on demand.</p>
    <p>What the server can see: a vault id, a token that proves you hold the key, and sealed blobs. From their names and sizes it can tell how many devices share the vault, when each of them syncs, roughly how many changes were made and when, and how many photographs there are and how large each is. It cannot read a plant's name, a note, a place or a date, and it cannot recover a lost key. Your local copy and your backups are unaffected by anything that happens to the vault.</p>
  </div></div>

  <div class="dangerrow">
    <span class="muted">Stop syncing on this device. Nothing here is deleted and nothing on the server is deleted; you can rejoin with the key.</span>
    {#if confirmForget}
      <span><button class="btn danger" onclick={() => sync.forget()}>Yes, stop</button> <button class="btn" onclick={() => (confirmForget = false)}>Keep syncing</button></span>
    {:else}
      <button id="sync-forget" class="btn" onclick={() => (confirmForget = true)}>Stop syncing here</button>
    {/if}
  </div>
{:else if mode === 'create'}
  <div class="cult pair">
    <div class="sum">Your new vault key <span class="hint">shown once here; keep it somewhere safe</span></div>
    <div class="body">
      <div class="pairrow">
        <div class="qr">{@html qr}</div>
        <div>
          <div class="keytext mono" id="vault-key">{freshKey}</div>
          <p class="small muted">This is the only key. It encrypts your collection and it is what a second device needs. If it is lost the vault cannot be opened by anyone, including us; your collection on this device and in backups is unaffected. Put it in a password manager now.</p>
          <div class="row">
            <button class="btn" onclick={() => copyKey(freshKey)}>{saved ? 'Copied' : 'Copy key'}</button>
            <label class="check"><input id="key-saved" type="checkbox" bind:checked={saved} /> I have saved it</label>
          </div>
        </div>
      </div>
      {#if err}<p class="bad">{err}</p>{/if}
      <div class="actions">
        <button class="btn" onclick={() => (mode = 'idle')} disabled={busy}>Cancel</button>
        <button id="sync-create" class="btn pri" onclick={create} disabled={!saved || busy}>{busy ? 'Setting up…' : 'Start syncing'}</button>
      </div>
    </div>
  </div>
{:else if mode === 'join'}
  <div class="cult pair">
    <div class="sum">Enter your vault key <span class="hint">from your other device: Sync → Add another device</span></div>
    <div class="body">
      {#if scanning}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} class="scan" playsinline muted></video>
        <div class="actions"><button class="btn" onclick={stopScan}>Stop scanning</button></div>
      {:else}
        <input id="sync-key" class="keyin mono" type="text" bind:value={typed} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Vault key" autocomplete="off" spellcheck="false" />
        {#if err}<p class="bad">{err}</p>{/if}
        {#if scanErr}<p class="bad">{scanErr}</p>{/if}
        <div class="actions">
          <button class="btn" onclick={() => (mode = 'idle')} disabled={busy}>Cancel</button>
          {#if canScan}<button class="btn" onclick={startScan}>Scan the code</button>{/if}
          <button id="sync-join" class="btn pri" onclick={join} disabled={busy || !typed.trim()}>{busy ? 'Joining…' : 'Join'}</button>
        </div>
      {/if}
      <p class="small muted" style="margin-top: 10px">Joining merges: what is here stays, what is in the vault arrives, and both devices end up with everything.</p>
    </div>
  </div>
{:else}
  <div class="cult"><div class="body prose">
    <p>Not syncing. Your collection is on this device only. Set up a vault here if this is your first device, or join with the key from a device that already has one.</p>
    <div class="row">
      <button id="sync-start" class="btn pri" onclick={startCreate}>Set up sync on this device</button>
      <button id="sync-have-key" class="btn" onclick={() => { mode = 'join'; err = ''; }}>I have a key</button>
    </div>
  </div></div>
  <div class="secrule"><h2>What you are trusting</h2><div class="line"></div></div>
  <div class="cult"><div class="body prose">
    <p>The key is made on this device and never sent anywhere. Everything is encrypted with it before it leaves (AES-256-GCM, WebCrypto). The server stores ciphertext under a vault id and checks a token derived from the key; it holds neither the key nor anything that could rebuild it. There is no account, no email, nothing to reset. Lose the key and the vault is unreadable to everyone, us included; your local copy and your backups are what you keep.</p>
  </div></div>
{/if}

<style>
  .cult { margin-top: 12px; }
  .cult .body { padding: 14px 17px; font-family: var(--ui); }
  .prose p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; color: var(--ink2); }
  .prose p:last-child { margin-bottom: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .pairrow { display: grid; grid-template-columns: 180px 1fr; gap: 18px; align-items: start; }
  .qr { width: 180px; height: 180px; background: #fff; border-radius: 10px; padding: 8px; box-shadow: var(--sh); }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .keytext { font-size: 17px; letter-spacing: 0.06em; word-break: break-all; padding: 10px 12px; background: var(--sunk); border-radius: 8px; margin-bottom: 10px; user-select: all; }
  .keyin { width: 100%; font-size: 16px; letter-spacing: 0.06em; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); text-transform: uppercase; }
  .check { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; }
  .scan { width: 100%; max-height: 60vh; border-radius: 10px; background: #000; }
  .bad { color: var(--bad); font-size: 13.5px; margin: 8px 0 0; }
  .notice { margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 9px; font-family: var(--ui); font-size: 13.5px; line-height: 1.5; color: var(--ink2); }
  .notice.bad { border-color: var(--bad); color: var(--bad); }
  .notice.warn { border-color: var(--rule2); color: var(--ink); }
  .small { font-size: 12.5px; line-height: 1.5; }
  .dangerrow { margin: 40px 0 10px; padding: 15px 17px; border: 1px dashed var(--rule2); border-radius: var(--r); display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 13.5px; }
  @media (max-width: 640px) { .pairrow { grid-template-columns: 1fr; } .qr { margin: 0 auto; } }
</style>
