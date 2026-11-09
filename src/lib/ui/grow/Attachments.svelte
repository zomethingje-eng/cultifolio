<script lang="ts">
  /**
   * A plant's papers on its page (round eighty-seven, t3; plan F9): CITES permits and certificates, phytosanitary
   * certificates, invoices, as PDF, JPEG or PNG files of 10 MB or less. Kept, synced and backed up as its photographs are
   * ($lib/attach/attach says how). Opened in a new tab, or saved, from the file on this device; nothing is sent anywhere
   * but in the encrypted vault, with sync on.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { DOCS, DOC_WORDS, EXT, MAX_ATTACHMENT_BYTES, sizeWords, type Doc, type Attachment } from '$lib/attach/attach';
  import { saveFile } from '$lib/export/save';
  import { toast } from '$lib/ui/toast.svelte';

  let { acc }: { acc: string } = $props();
  const list = $derived(collection.ready ? collection.attachments(acc) : []);
  let adding = $state(false);
  let doc = $state<Doc>('cites');
  let caption = $state('');
  let msg = $state('');
  let busy = $state(false);
  let input = $state<HTMLInputElement | null>(null);
  async function add() {
    const file = input?.files?.[0];
    if (!file || busy) { msg = file ? '' : 'Choose a file first.'; return; }
    busy = true; msg = '';
    try {
      // Refused by its size before it is read whole: a 2 GB file is not read into memory to be refused.
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; the most an attachment can be is ${MAX_ATTACHMENT_BYTES / 1048576} MB.`);
      const x = await collection.addAttachment(acc, new Uint8Array(await file.arrayBuffer()), file.name, doc, caption);
      toast.show(`${x.fileName} kept with this plant.`);
      adding = false; caption = ''; if (input) input.value = '';
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  /** Its bytes are not here yet: a record synced before its file (said, never an empty tab). */
  const notHere = (x: Attachment) => `${x.fileName} is not on this device yet; it comes with the next sync from the device that added it.`;
  async function openIt(x: Attachment) {
    // The tab is opened inside the tap, before the file is read, so no browser takes it for a pop-up; it is closed again if the file is not here.
    const w = window.open('', '_blank');
    const b = await collection.attachmentFile(x.id);
    if (!b) { w?.close(); toast.show(notHere(x)); return; }
    const url = URL.createObjectURL(b);
    if (w) w.location.href = url; else saveFile(b, x.fileName);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function save(x: Attachment) {
    const b = await collection.attachmentFile(x.id);
    if (!b) { toast.show(notHere(x)); return; }
    saveFile(b, x.fileName.toLowerCase().endsWith(`.${EXT[x.mime]}`) ? x.fileName : `${x.fileName}.${EXT[x.mime]}`);
  }
  let confirming = $state<string | null>(null);
  async function remove(x: Attachment) {
    if (confirming !== x.id) { confirming = x.id; return; }
    confirming = null;
    try {
      const back = await collection.removeAttachment(x.id);
      toast.show(`${x.fileName} removed.`, 8000, { label: 'Undo', run: () => void back() });
    } catch (e) {
      toast.show(`Not removed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
</script>

<div class="att" id="attachments">
  <div class="secrule"><h2>Papers</h2><div class="line"></div><span class="n">{list.length || ''}</span></div>
  {#if list.length}
    <ul class="files">
      {#each list as x (x.id)}
        <li>
          <span class="what"><b>{DOC_WORDS[x.doc]}</b>{#if x.caption}{' · '}{x.caption}{/if}</span>
          <span class="meta muted">{x.fileName} · {x.mime === 'application/pdf' ? 'PDF' : x.mime === 'image/png' ? 'PNG' : 'JPEG'}, {sizeWords(x.bytes)} · added {x.d}</span>
          <span class="acts"><button class="linkish" type="button" onclick={() => openIt(x)}>Open</button> <button class="linkish" type="button" onclick={() => save(x)}>Download</button> <button class="linkish" type="button" onclick={() => remove(x)}>{confirming === x.id ? 'Yes, remove it' : 'Remove'}</button></span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if adding}
    <form class="addform" onsubmit={(e) => { e.preventDefault(); void add(); }}>
      <label><span>File (PDF, JPEG or PNG, up to {MAX_ATTACHMENT_BYTES / 1048576} MB)</span><input id="att-file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" bind:this={input} /></label>
      <label><span>What it is</span><select id="att-doc" bind:value={doc}>{#each DOCS as d (d)}<option value={d}>{DOC_WORDS[d]}</option>{/each}</select></label>
      <label><span>Note (optional)</span><input id="att-caption" type="text" maxlength="200" bind:value={caption} placeholder="e.g. permit number, seller" /></label>
      <p class="acts"><button class="btn pri small" type="submit" id="att-save" aria-disabled={busy}>{busy ? 'Keeping…' : 'Keep it'}</button> <button class="btn small" type="button" onclick={() => { adding = false; msg = ''; }}>Cancel</button></p>
      <p class="muted small" role="status" id="att-msg">{msg}</p>
    </form>
  {:else}
    <p class="small"><button class="linkish" type="button" id="att-add" onclick={() => (adding = true)}>Add a paper</button> <span class="muted">a CITES or phytosanitary certificate, an invoice: kept on this device with the plant, in its backups, and in the encrypted vault with sync on.</span></p>
  {/if}
</div>

<style>
  .files { list-style: none; margin: 6px 0 0; padding: 0; }
  .files li { display: grid; gap: 2px; padding: 8px 0; border-top: 1px solid var(--rule2, var(--rule)); font-size: var(--fs-md); }
  .meta { font-size: var(--fs-sm); overflow-wrap: anywhere; }
  .acts { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; margin: 0; }
  .linkish { background: none; border: 0; padding: 0; color: var(--link, var(--accent)); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  .muted { color: var(--ink3); }
  .addform { display: grid; gap: 10px; margin-top: 8px; max-width: 480px; }
  .addform label { display: grid; gap: 4px; font-size: var(--fs-sm); color: var(--ink2); }
  .addform input, .addform select { font: inherit; font-size: var(--fs-md); min-height: var(--tap); padding: 6px 8px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--field, var(--card)); color: var(--ink); max-width: 100%; box-sizing: border-box; }
  .att p { margin: 6px 0 0; }
  .addform .acts .btn { min-height: var(--tap); }
</style>
