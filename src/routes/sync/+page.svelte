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
  import { syncWords } from '$lib/ui/sync-words';
  import { heldWords } from '$lib/ui/held-words';
  import { PAGE_IN_DEMO } from '$lib/db/demo';

  /** The sample collection: no sync controls are drawn at all (round sixty-one; decision 10, a guard in the page as in the engine), and the heading stays (the accessibility review's 10). */
  const demo = PAGE_IN_DEMO; // the page's collection (round sixty-seven; triage-66 V3)

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
    if (demo) return;
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

  /** Records with parked changes made on this device, and the one press that applies them all (round sixty-two). */
  const ownParked = $derived(collection.parkedRecords ? collection.parkedOwn().length : 0);
  let applyingOwn = $state(false);
  async function applyOwn() {
    if (applyingOwn) return;
    applyingOwn = true;
    try { await collection.applyAllOwnParked(); } finally { applyingOwn = false; }
  }

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
      err = 'That is not a sync key: six groups of five letters and digits.'; // "sync key", the glossary's word (round fifty-eight; the accessibility review)
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
  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  /** The engine's last error in a grower's words, its own words kept for the disclosure (round sixty; the words review, 15). */
  const errWords = $derived(syncWords(sync.lastError));
  const aheadWords = $derived(syncWords(sync.clockAhead));
  /** "1 change", "3 changes": what waits to be sent, without "field changes", which said how the log counts, not what the grower did (round sixty; the grower review, 16). */
  /** A sentence ends with its stop: the server's own words may come without one. */
  const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : t.trim() + '.');
  const changes = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'change' : 'changes'}`;
</script>

<svelte:head><title>Sync · Cultifolio</title></svelte:head>

{#if demo}
  <!-- The sample's lock says why in the bar above; the page keeps its h1 (round sixty-one; the accessibility review's 10). The wrapper carries the class the sample bar leaves on screen. -->
  <div class="demolock"><PageHead title="Sync" kick="My plants" places={false} sub="The same collection on your phone and your computer, encrypted with a key only you hold." /></div>
{:else}
<PageHead title="Sync" kick="My plants" places={false} sub="The same collection on your phone and your computer, encrypted with a key only you hold." />

{#if sync.configured}
  <div class="secrule"><h2>This device</h2><div class="line"></div><span class="n">vault {sync.vaultId.slice(0, 6)}…</span></div>
  <div class="cards">
    <div class="card" data-runs={sync.runs}><div class="lab">Status</div><div class="val" style="font-family: var(--ui); font-size: var(--fs-lg); font-weight: 700">{sync.busy ?? (sync.offline ? (sync.unreached === 'server' ? 'Server not reached' : 'Offline') : sync.lastError ? 'Not synced' : sync.vaultFull ? 'Vault full' : sync.runs ? 'Synced' : 'Not checked yet')}</div><div class="sub">{sync.busy ? '' : sync.offline ? (sync.pending ? `${changes(sync.pending)} kept here, sent ${sync.unreached === 'server' ? 'when the server answers again' : 'when you are back online'}` : `nothing waiting; it will check ${sync.unreached === 'server' ? 'again in a minute' : 'when you are back online'}`) : errWords ? errWords.text : sync.runs ? (sync.lastSync ? `everything on the server ${ago(sync.lastSync)} is here` : 'not yet') : (sync.lastSync ? `last synced ${ago(sync.lastSync)}; checking now` : 'checking now')}</div></div>
    <div class="card"><div class="lab">Waiting to send</div><div class="val">{sync.pending}</div><div class="sub">{sync.pending === 1 ? 'change' : 'changes'} made here and not yet sent (a watering or a note is one; a new plant is a few)</div></div>
    {#if aheadWords}<p class="small muted" id="clock-ahead">{aheadWords.text}{#if aheadWords.detail}{' '}<details class="tech inline"><summary>Details</summary><span class="mono">{aheadWords.detail}</span></details>{/if}</p>{/if}
    {#if sync.quarantined.length || sync.refused.length || collection.incomplete}
      <!-- What "set aside" meant, said plainly; and "this version of the app", not "this build" (round fifty-eight; the accessibility review). -->
      <div class="card"><div class="lab">Could not be read here</div><div class="val">{[sync.quarantined.length + sync.refused.length ? String(sync.quarantined.length + sync.refused.length) : '', collection.incomplete ? `${collection.incomplete} waiting` : ''].filter(Boolean).join(' · ')}</div><div class="sub">{#if sync.quarantined.length}{sync.quarantined.length} sync {sync.quarantined.length === 1 ? 'bundle' : 'bundles'} on the server could not be read here{/if}{#if sync.quarantined.length && sync.refused.length}; {/if}{#if sync.refused.length}the server refused {sync.refused.length} {sync.refused.length === 1 ? 'item' : 'items'} from this device{/if}{#if sync.quarantined.length || sync.refused.length}. Syncing carries on around them.{/if}{#if collection.incomplete} {collection.incomplete} {collection.incomplete === 1 ? 'record waits' : 'records wait'} for changes this version of the app cannot read yet, and {collection.incomplete === 1 ? 'is' : 'are'} not shown until it can.{/if}</div></div>
    {/if}
    <div class="card"><div class="lab">Encryption</div><div class="val" style="font-family: var(--ui); font-size: var(--fs-lg); font-weight: 700">AES-256-GCM</div><div class="sub">key never leaves your devices</div></div>
  </div>
  <!-- The engine's own words for what went wrong, one tap away; the card above says it plainly (round sixty; the words review, 15). -->
  {#if errWords?.detail}<details class="tech" id="sync-error-detail"><summary>What the sync reported</summary><p class="mono small">{errWords.detail}</p></details>{/if}
  <!-- The server's own sentence when it refuses this vault's uploads, and when this device asks again; receiving carries on (round sixty; three reviews). -->
  {#if sync.refusal}
    <!-- When the server said to, or within the hour: the device never waits longer (round sixty-one; decision 6). The refusal is kept with the sync record, so a reload or another tab waits too. -->
    <p class="notice warn" id="sync-refusal" role="status">{sentence(sync.refusal.text)} This device asks again {when(sync.refusal.until)}, when the server said to or within the hour. Your changes are kept here meanwhile, and changes from your other devices still come in.</p>
  {/if}
  {#if sync.vaultFull}
    <p class="notice bad" id="vault-full">Your vault is full ({mb(sync.vaultFull.bytes)} of {mb(sync.vaultFull.limit)} MB). Removing photographs frees only their own bytes, once the removal is ten minutes old; the sync bundles of changes stay for good, since the log is the collection. Back up, then set up a new vault for the collection to carry on syncing. Changes made here are kept on this device and sent once there is room; receiving carries on.</p>
  {/if}
  {#if sync.clockWarning}
    <p class="notice warn" id="clock-warning">{sync.clockWarning}</p>
  {/if}
  {#if sync.held}
    <p class="notice" id="held">{sync.held} {sync.held === 1 ? 'change' : 'changes'} from a device whose clock was ahead {sync.held === 1 ? 'is' : 'are'} waiting until {sync.heldUntil ? when(sync.heldUntil) : 'this device catches up'}. {sync.held === 1 ? 'It is' : 'They are'} stored here and will show then.</p>
  {:else if collection.heldWaiting}
    <p class="notice" id="held">{heldWords(collection.heldWaiting)} They are stored here; nothing needs doing.</p>
  {/if}
  {#if collection.parkedRecords}
    <!-- A change stamped more than two days past its arrival (PARK_MS) is a broken clock's: parked, never folded on its own, and offered on its record with Apply (round fifty-two, 1). -->
    <div class="notice" id="parked">
      <!-- Parked changes go to a new vault with their verdict, so every device parks them alike; Apply sends one as an edit made now (round sixty-two, second pass; A15, the data review's 5). -->
      <p style="margin: 0 0 6px">{collection.parkedRecords} {collection.parkedRecords === 1 ? 'record has' : 'records have'} edits from a device whose clock was wrong, kept but not applied, here and on every device that syncs with this one. Apply writes them again as edits made now, so every device takes them.</p>
      <ul class="parkedlist">
        {#each collection.parkedList() as p (p.kind + ':' + p.id)}
          <li><span>{p.label}</span> <span class="small muted">({p.fields.join(', ')})</span> <button class="btn small" type="button" onclick={() => collection.applyParked(p.kind, p.id)}>Apply</button> <button class="linkish" type="button" onclick={() => collection.dismissParked(p.kind, p.id)}>Leave</button></li>
        {/each}
      </ul>
      <!-- A month offline at a wrong clock parks everything this device did then, its own new plants included: one press for all of it, a peer's left to judge one by one (round sixty-two; the clock review's suggestion). -->
      {#if ownParked}
        <p style="margin: 8px 0 0"><button class="btn small" id="apply-own" type="button" onclick={applyOwn} disabled={applyingOwn}>Apply all from this device ({ownParked} {ownParked === 1 ? 'record' : 'records'})</button></p>
      {/if}
    </div>
  {/if}
  <div class="quickbar">
    <button id="sync-now" class="btn pri" onclick={() => sync.run().catch(() => {})} disabled={!!sync.busy}>Sync now</button>
    <button id="sync-show-key" class="btn" onclick={() => (showKey = !showKey)}>{showKey ? 'Hide the key' : 'Add another device'}</button>
  </div>

  {#if showKey}
    <div class="cult pair" id="pairing">
      <!-- "sync key" throughout, the glossary's word (round fifty-eight; the accessibility review). -->
      <div class="sum">Your sync key <span class="hint">scan it, or type it, on the other device</span></div>
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
    <!-- "sync key", and the reading of the log said as reading, not folding (round fifty-eight; the accessibility review). -->
    <p>Every change you make (a watering, a note, a photograph) is sealed on this device with a key derived from your sync key, then sent in a sync bundle. Other devices with the same key fetch the bundles and merge them by the same rule a backup uses: for each field, the latest change wins, wherever it was made. A bundle on the server is never rewritten or deleted, so a sync interrupted halfway simply resumes; a photograph's sealed bytes are deleted once its removal is ten minutes old, by a request only a holder of the key can make. "Synced" is a statement about a moment: everything the server held at that time is on this device. A change another device sends later is not here until the next sync, which runs when a change is made here, when the app comes back to the front, when the connection returns, every few minutes while the app is open, and on demand.</p>
    <details class="tech"><summary>How this page read the collection</summary><p id="fold">This page's copy of the collection was read {collection.loaded.from === 'snapshot' ? `from the snapshot the last load left (${collection.loaded.snapshot ?? 0} changes read then) and the ${collection.loaded.changes} ${collection.loaded.changes === 1 ? 'change' : 'changes'} that arrived after it` : `by reading the whole log, ${collection.loaded.changes} ${collection.loaded.changes === 1 ? 'change' : 'changes'}; a snapshot is kept for the next load`}. The log itself is what is kept and sent; the snapshot is a reading of it, dropped whenever the log is replaced or the rules change.</p></details>
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
    <div class="sum">Your new sync key <span class="hint">save it somewhere safe; while this device syncs you can show it again here, under Add another device</span></div><!-- "sync key": round fifty-eight; the accessibility review -->
    <div class="body">
      <div class="pairrow">
        <div class="qr">{@html qr}</div>
        <div>
          <!-- Each group is one piece: a key wrapped mid-group was copied wrong by hand (round forty-nine, 3; U6). -->
          <div class="keytext mono" id="vault-key">{#each freshKey.split('-') as g, i (i)}<span class="kg">{g}</span>{#if i < 5}<span class="kd">-</span>{/if}{/each}</div>
          <!-- Typing the last group back is the one check that the key was read and kept, not only glanced at (round forty-one, R9); it sits under the key it asks about (round forty-nine, 3). -->
          <label class="typeback"><span>Type the last five symbols of the key to go on</span><input id="key-typeback" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5" bind:value={typedBack} /></label>
          <!-- The outcome first and warmly; every fact kept (round sixty; the grower review, §3 and 11). -->
          <p class="small muted">This key is the only way into your vault from a new device. Not even we can open the vault, and there is no account to recover it from, so keep it in your password manager or print this card and keep it with your seed packets. Your collection on this device and in backups never needs it.</p>
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
    <div class="sum">Enter your sync key <span class="hint">from your other device: Sync → Add another device</span></div><!-- "sync key": round fifty-eight; the accessibility review -->
    <div class="body">
      {#if scanning}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} class="scan" playsinline muted></video>
        <div class="actions"><button class="btn" onclick={stopScan}>Stop scanning</button></div>
      {:else}
        <!-- A visible name over the box: the placeholder's pattern was its only one (round fifty-eight; the accessibility review). -->
        <label class="keylab"><span class="eyebrow">Sync key</span><input id="sync-key" class="keyin mono" type="text" bind:value={typed} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" aria-invalid={!!err} aria-describedby={err ? 'sync-err' : undefined} autocomplete="off" spellcheck="false" /></label>
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
      <p>Not syncing. Your collection stays on this device unless you turn sync on. Set up a vault here if this is your first device, or join with the key from a device that already has one.</p>
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
<!-- Held changes are said here with sync off too: a restored file's changes dated ahead wait the same way, and the lists link here (round sixty; decision 2). -->
{#if !sync.configured && collection.heldWaiting}
  <p class="notice" id="held">{heldWords(collection.heldWaiting)} They came with a backup restored here, or from a device this one synced with before, and are stored on this device; nothing needs doing.</p>
{/if}
{/if}

<style>
  .tech { margin: 8px 0 12px; font-size: var(--fs-md); color: var(--ink2); }
  .tech summary { cursor: pointer; min-height: var(--tap); display: flex; align-items: center; }
  .tech.inline { display: inline; }
  .tech.inline summary { display: inline-flex; }
  .tech .mono { overflow-wrap: anywhere; }
  .parkedlist { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .parkedlist li { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
  .parkedlist .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .typeback { display: grid; gap: 4px; margin-top: 12px; max-width: 320px; }
  .typeback span { font-size: var(--fs-sm); color: var(--ink2); }
  .typeback input { font-family: var(--mono); letter-spacing: 0.12em; text-transform: uppercase; }
  /* "Print this card": the key card alone on paper, the QR code and the key, nothing else of the page (round forty-one, R9). */
  @media print {
    :global(#topbar), :global(#tabbar), :global(footer.credits), :global(.phead), .pair .row, .pair .typeback, .pair .actions { display: none !important; }
    .pair { box-shadow: none; border: 1px solid #000; }
    .keytext { font-size: var(--fs-xl); }
  }
  .cult { margin-top: 12px; }
  .cult .body { padding: 14px 17px; font-family: var(--ui); }
  .prose p { margin: 0 0 10px; font-size: var(--fs-md); line-height: 1.55; color: var(--ink2); }
  .prose p:last-child { margin-bottom: 0; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .pairrow { display: grid; grid-template-columns: 180px 1fr; gap: 18px; align-items: start; }
  .qr { width: 180px; height: 180px; background: #fff; border-radius: var(--r); padding: 8px; box-shadow: var(--sh); }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .keytext { font-size: var(--fs-lg); letter-spacing: 0.06em; padding: 10px 12px; background: var(--sunk); border-radius: var(--r); margin-bottom: 10px; user-select: all; }
  .keytext .kg { white-space: nowrap; display: inline-block; }
  .typeback { margin-top: 0; margin-bottom: 12px; }
  .keylab { display: grid; gap: 4px; } /* round fifty-eight; the accessibility review */
  .keyin { width: 100%; font-size: var(--fs-lg); letter-spacing: 0.06em; padding: 10px 12px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); text-transform: uppercase; }
  .scan { width: 100%; max-height: 60vh; border-radius: var(--r); background: #000; }
  .bad { color: var(--bad); font-size: var(--fs-md); margin: 8px 0 0; }
  .notice { margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--rule); border-radius: var(--r); font-family: var(--ui); font-size: var(--fs-md); line-height: 1.5; color: var(--ink2); }
  .notice.bad { border-color: var(--bad); color: var(--bad); }
  .notice.warn { border-color: var(--rule2); color: var(--ink); }
  .small { font-size: var(--fs-md); line-height: 1.5; }
  .dangerrow { margin: 40px 0 10px; padding: 15px 17px; border: 1px dashed var(--rule2); border-radius: var(--r); display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: var(--fs-md); }
  @media (max-width: 640px) { .pairrow { grid-template-columns: 1fr; } .qr { margin: 0 auto; } }
</style>
