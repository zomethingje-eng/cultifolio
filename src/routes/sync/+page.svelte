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
  let err = $state('');
  let busy = $state(false);
  let showKey = $state(false);
  let qr = $state('');
  let scanning = $state(false);
  let scanErr = $state('');
  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;

  /** A fresh key is kept for the tab's life, not the page's: a reload between its showing and "Start syncing" (a phone's browser restarted; the print dialog) lost a key the card had called the only one (round forty-nine, 3). */
  const FRESH = 'cultifolio.freshKey';
  onMount(async () => {
    await collection.load();
    await sync.init();
    try {
      const kept = sessionStorage.getItem(FRESH);
      if (kept && !sync.configured && mode === 'idle') { freshKey = kept; typedBack = ''; mode = 'create'; }
    } catch { /* no session storage: the key lives in the page only */ }
  });
  const dropFresh = () => { try { sessionStorage.removeItem(FRESH); } catch { /* fine */ } };
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

  /** The last group of the fresh key, typed back: the one proof the key was kept, not glanced at (round forty-one, R9). */
  let typedBack = $state('');
  let copied = $state(false);
  const saved = $derived(!!freshKey && typedBack.trim().toUpperCase() === freshKey.slice(-5).toUpperCase());
  function startCreate() {
    freshKey = newVaultKey();
    try { sessionStorage.setItem(FRESH, freshKey); } catch { /* fine */ }
    typedBack = '';
    copied = false;
    err = '';
    mode = 'create';
  }
  async function create() {
    busy = true;
    err = '';
    try {
      await sync.setup(freshKey);
      dropFresh();
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
      copied = true;
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
    <div class="card" data-runs={sync.runs}><div class="lab">Status</div><div class="val" style="font-family: var(--ui); font-size: 17px; font-weight: 700">{sync.busy ?? (sync.offline ? (sync.unreached === 'server' ? 'Server not reached' : 'Offline') : sync.lastError ? 'Not synced' : sync.vaultFull ? 'Vault full' : sync.runs ? 'Synced' : 'Not checked yet')}</div><div class="sub">{sync.busy ? '' : sync.offline ? (sync.pending ? `${sync.pending} field ${sync.pending === 1 ? 'change' : 'changes'} kept here, sent ${sync.unreached === 'server' ? 'when the server answers again' : 'when you are back online'}` : `nothing waiting; it will check ${sync.unreached === 'server' ? 'again in a minute' : 'when you are back online'}`) : sync.lastError ? sync.lastError : sync.runs ? (sync.lastSync ? `everything on the server ${ago(sync.lastSync)} is here` : 'not yet') : (sync.lastSync ? `last synced ${ago(sync.lastSync)}; checking now` : 'checking now')}</div></div>
    <div class="card"><div class="lab">Waiting to send</div><div class="val">{sync.pending}</div><div class="sub">field {sync.pending === 1 ? 'change' : 'changes'} made here and not yet up (a note is one; a new plant is several)</div></div>
    {#if sync.clockAhead}<p class="small muted" id="clock-ahead">{sync.clockAhead}</p>{/if}
    {#if sync.quarantined.length || sync.refused.length || collection.incomplete}
      <div class="card"><div class="lab">Set aside</div><div class="val">{sync.quarantined.length + sync.refused.length || collection.incomplete}</div><div class="sub">{#if sync.quarantined.length}{sync.quarantined.length} {sync.quarantined.length === 1 ? 'batch' : 'batches'} on the server could not be read here{/if}{#if sync.quarantined.length && sync.refused.length}; {/if}{#if sync.refused.length}the server refused {sync.refused.length} {sync.refused.length === 1 ? 'item' : 'items'} from this device{/if}{#if sync.quarantined.length || sync.refused.length}. Syncing carries on around them.{/if}{#if collection.incomplete} {collection.incomplete} {collection.incomplete === 1 ? 'record waits' : 'records wait'} for changes this build cannot read yet, and {collection.incomplete === 1 ? 'is' : 'are'} not shown until it can.{/if}</div></div>
    {/if}
    <div class="card"><div class="lab">Encryption</div><div class="val" style="font-family: var(--ui); font-size: 17px; font-weight: 700">AES-256-GCM</div><div class="sub">key never leaves your devices</div></div>
  </div>
  {#if sync.vaultFull}
    <p class="notice bad" id="vault-full">Your vault is full ({mb(sync.vaultFull.bytes)} of {mb(sync.vaultFull.limit)} MB). Removing photographs here does not free it: nothing on the server is ever rewritten or deleted. Back up, then set up a new vault for the collection to carry on syncing. Changes made here are kept on this device and sent once there is room; receiving carries on.</p>
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
            <button class="btn" onclick={() => copyKey(sync.key!)}>{copied ? 'Copied' : 'Copy'}</button>
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
          <!-- Each group is one piece: a key wrapped mid-group was copied wrong by hand (round forty-nine, 3; U6). -->
          <div class="keytext mono" id="vault-key">{#each freshKey.split('-') as g, i (i)}<span class="kg">{g}</span>{#if i < 5}<span class="kd">-</span>{/if}{/each}</div>
          <!-- Typing the last group back is the one check that the key was read and kept, not only glanced at (round forty-one, R9); it sits under the key it asks about (round forty-nine, 3). -->
          <label class="typeback"><span>Type the last five symbols of the key to go on</span><input id="key-typeback" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5" bind:value={typedBack} /></label>
          <p class="small muted">This is the only key. It encrypts your collection and it is what a second device needs. There is no account behind it and no way to recover it: if it is lost the vault cannot be opened by anyone, including us; your collection on this device and in backups is unaffected. Put it in a password manager, or print this card and keep it with your seed packets.</p>
          <div class="row">
            <button class="btn" onclick={() => copyKey(freshKey)}>{copied ? 'Copied' : 'Copy key'}</button>
            <button class="btn" type="button" onclick={() => window.print()}>Print this card</button>
            <a class="btn" href="/backup">Take a backup first</a>
          </div>
        </div>
      </div>
      {#if err}<p class="bad" id="sync-err" role="alert">{err}</p>{/if}
      <div class="actions">
        <button class="btn" onclick={() => { dropFresh(); mode = 'idle'; }} disabled={busy}>Cancel</button>
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
        <input id="sync-key" class="keyin mono" type="text" bind:value={typed} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Vault key" aria-invalid={!!err} aria-describedby={err ? 'sync-err' : undefined} autocomplete="off" spellcheck="false" />
        {#if err}<p class="bad" id="sync-err" role="alert">{err}</p>{/if}
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
    {#if sync.wasIn?.why === 'replaced'}
      <p>Not syncing. This collection was replaced from a backup {ago(sync.wasIn.at)}, and sync was turned off with it; before that the device was in vault <code>{sync.wasIn.vaultId.slice(0, 6)}…</code>. Rejoining that vault would merge its records back into the restored collection, which is usually not what a replace was for. Set up a new vault here to sync the restored collection, or rejoin if that merge is what you want.</p>
    {:else if sync.wasIn}
      <p>Not syncing. This device was in vault <code>{sync.wasIn.vaultId.slice(0, 6)}…</code> until {ago(sync.wasIn.at)}; its collection is still here. To carry on with your other devices, rejoin with the same key. Setting up a new vault here instead makes a second, separate one, which your other devices would not see.</p>
    {:else}
      <p>Not syncing. Your collection is on this device only. Set up a vault here if this is your first device, or join with the key from a device that already has one.</p>
    {/if}
    <p class="small muted">What sync does: it moves an encrypted copy of your collection between your devices through this site, which cannot read it. The key is the only way in: there is no account and no recovery, so a lost key means a lost copy (your devices keep theirs, and a backup file needs no key).</p>
    <div class="row">
      {#if sync.wasIn?.why === 'replaced'}
        <button id="sync-start" class="btn pri" onclick={startCreate}>Set up a new vault for the restored collection</button>
        <button id="sync-have-key" class="btn" onclick={() => { mode = 'join'; err = ''; }}>Rejoin the old vault (merges it back)</button>
      {:else if sync.wasIn}
        <button id="sync-have-key" class="btn pri" onclick={() => { mode = 'join'; err = ''; }}>Rejoin with your key</button>
        <button id="sync-start" class="btn" onclick={startCreate}>Set up a new, separate vault</button>
      {:else}
        <button id="sync-start" class="btn pri" onclick={startCreate}>Set up sync on this device</button>
        <button id="sync-have-key" class="btn" onclick={() => { mode = 'join'; err = ''; }}>I have a key</button>
      {/if}
    </div>
  </div></div>
  <div class="secrule"><h2>What you are trusting</h2><div class="line"></div></div>
  <div class="cult"><div class="body prose">
    <p>The key is made on this device and never sent anywhere. Everything is encrypted with it before it leaves (AES-256-GCM, WebCrypto). The server stores ciphertext under a vault id and checks a token derived from the key; it holds neither the key nor anything that could rebuild it. There is no account, no email, nothing to reset. Lose the key and the vault is unreadable to everyone, us included; your local copy and your backups are what you keep.</p>
  </div></div>
{/if}

<style>
  .typeback { display: grid; gap: 4px; margin-top: 12px; max-width: 320px; }
  .typeback span { font-size: 12px; color: var(--ink2); }
  .typeback input { font-family: var(--mono); letter-spacing: 0.12em; text-transform: uppercase; }
  /* "Print this card": the key card alone on paper, the QR code and the key, nothing else of the page (round forty-one, R9). */
  @media print {
    :global(#topbar), :global(#tabbar), :global(footer.credits), :global(.phead), .pair .row, .pair .typeback, .pair .actions { display: none !important; }
    .pair { box-shadow: none; border: 1px solid #000; }
    .keytext { font-size: 18px; }
  }
  .cult { margin-top: 12px; }
  .cult .body { padding: 14px 17px; font-family: var(--ui); }
  .prose p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; color: var(--ink2); }
  .prose p:last-child { margin-bottom: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .pairrow { display: grid; grid-template-columns: 180px 1fr; gap: 18px; align-items: start; }
  .qr { width: 180px; height: 180px; background: #fff; border-radius: 10px; padding: 8px; box-shadow: var(--sh); }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .keytext { font-size: 17px; letter-spacing: 0.06em; padding: 10px 12px; background: var(--sunk); border-radius: 8px; margin-bottom: 10px; user-select: all; }
  .keytext .kg { white-space: nowrap; display: inline-block; }
  .typeback { margin-top: 0; margin-bottom: 12px; }
  .keyin { width: 100%; font-size: 16px; letter-spacing: 0.06em; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); text-transform: uppercase; }
  .scan { width: 100%; max-height: 60vh; border-radius: 10px; background: #000; }
  .bad { color: var(--bad); font-size: 13.5px; margin: 8px 0 0; }
  .notice { margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 9px; font-family: var(--ui); font-size: 13.5px; line-height: 1.5; color: var(--ink2); }
  .notice.bad { border-color: var(--bad); color: var(--bad); }
  .notice.warn { border-color: var(--rule2); color: var(--ink); }
  .small { font-size: 12.5px; line-height: 1.5; }
  .dangerrow { margin: 40px 0 10px; padding: 15px 17px; border: 1px dashed var(--rule2); border-radius: var(--r); display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 13.5px; }
  @media (max-width: 640px) { .pairrow { grid-template-columns: 1fr; } .qr { margin: 0 auto; } }
</style>
