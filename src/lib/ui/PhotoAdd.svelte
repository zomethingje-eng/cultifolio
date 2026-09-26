<script lang="ts">
  /**
   * Two ways in: the camera (on a phone this opens it directly) and the
   * library or a file. Each file is resized on the device and stored; the
   * original is not kept. Several at once are fine.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { processImage, today } from '$lib/photo/process';
  import type { Photo } from '$lib/db/types';

  let { acc = null, sowing = null, id = 'photo', compact = false, tile = false, onadded }: { acc?: string | null; sowing?: string | null; id?: string; compact?: boolean; tile?: boolean; onadded?: (p: Photo[]) => void } = $props();
  let busy = $state<string | null>(null);
  let error = $state<string | null>(null);
  let done = $state(0);

  async function take(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    error = null;
    const added: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      busy = files.length > 1 ? `Storing ${i + 1} of ${files.length}…` : 'Storing…';
      try {
        const r = await processImage(files[i]);
        added.push(await collection.addPhoto({ acc, sowing, d: r.taken ?? today(), dFrom: r.taken ? 'exif' : 'added', caption: null, w: r.w, h: r.h, bytes: r.bytes, sha: r.sha, blob: r.blob, thumb: r.thumb }));
      } catch (err) {
        error = err instanceof Error ? err.message : 'That file could not be read.';
      }
    }
    busy = null;
    done = added.length;
    if (added.length) onadded?.(added);
    setTimeout(() => (done = 0), 2500);
  }
</script>

{#if tile}
  <!-- One square where the photograph will be: the camera on a phone, the file chooser elsewhere. The full control is on the photographs section. -->
  <label class="tile" class:busy={!!busy} title={error ?? 'Add a photograph of this plant'}>
    <input id="{id}-tile" type="file" accept="image/*" capture="environment" onchange={take} disabled={!!busy} />
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
    <span>{busy ?? (error ? 'Not added' : 'Add a photo')}</span>
  </label>
{:else}
<div class="add" class:compact>
  <label class="btn pri"><input id="{id}-camera" type="file" accept="image/*" capture="environment" onchange={take} disabled={!!busy} />{busy ?? 'Take a photo'}</label>
  <label class="btn"><input id="{id}-file" type="file" accept="image/*" multiple onchange={take} disabled={!!busy} />Choose photos</label>
  {#if done}<span class="ok">{done === 1 ? 'Added' : `Added ${done}`}</span>{/if}
  {#if error}<span class="err">{error}</span>{/if}
  {#if !compact}<span class="faint small">Resized on this device; the original stays in your camera roll. The date comes from the photo when it carries one.</span>{/if}
</div>
{/if}

<style>
  .add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .add input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  label.btn { position: relative; cursor: pointer; }
  label.btn:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  label.btn:has(input:disabled) { opacity: 0.6; cursor: wait; }
  .ok { color: var(--accent); font-weight: 600; font-size: 13px; }
  .err { color: var(--bad, #b3261e); font-size: 13px; }
  .small { flex-basis: 100%; }
  .tile { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: var(--tile, 96px); height: var(--tile, 96px); flex: 0 0 var(--tile, 96px); border-radius: 12px; border: 1.5px dashed var(--line); background: var(--sunk); color: var(--ink3); font-family: var(--ui); font-size: 11.5px; font-weight: 600; cursor: pointer; text-align: center; }
  .tile input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .tile:hover { color: var(--accent); border-color: var(--accent); }
  .tile:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tile.busy { opacity: 0.6; cursor: wait; }
</style>
