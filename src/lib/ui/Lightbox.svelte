<script lang="ts">
  /**
   * One of your photos at full size, with the few things you do to a photo:
   * caption it, fix its date, make it the plant's face, or remove it.
   * Arrow keys and swipes move through the set; Escape closes.
   */
  import { collection } from '$lib/db/collection.svelte';
  import PhotoImg from './PhotoImg.svelte';
  import type { Photo } from '$lib/db/types';

  let { photos, index = $bindable(0), acc = null, onclose }: { photos: Photo[]; index?: number; acc?: string | null; onclose: () => void } = $props();
  const p = $derived(photos[index]);
  const isCover = $derived(!!acc && collection.accession(acc)?.cover === p?.id);
  let editing = $state(false);
  let caption = $state('');
  let d = $state('');
  let confirming = $state(false);
  let dialog: HTMLDivElement;

  $effect(() => {
    // Reset the editor when the photo changes.
    void p?.id;
    editing = false;
    confirming = false;
  });
  $effect(() => {
    dialog?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  const go = (n: number) => {
    if (!photos.length) return;
    index = (index + n + photos.length) % photos.length;
  };
  function key(e: KeyboardEvent) {
    if (editing) return;
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }
  let x0 = 0;
  const touchStart = (e: TouchEvent) => (x0 = e.touches[0].clientX);
  function touchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  }
  function startEdit() {
    caption = p.caption ?? '';
    d = p.d;
    editing = true;
  }
  async function save() {
    await collection.put('photo', p.id, { caption: caption.trim() || null, d: d || p.d, dFrom: d && d !== p.d ? 'added' : p.dFrom ?? null });
    editing = false;
  }
  async function makeCover() {
    if (!acc) return;
    await collection.setCover(acc, isCover ? null : p.id);
  }
  async function remove() {
    const id = p.id;
    const wasLast = photos.length === 1;
    await collection.removePhoto(id);
    if (wasLast) onclose();
    else if (index >= photos.length - 1) index = Math.max(0, photos.length - 2);
    confirming = false;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="lb" role="dialog" aria-modal="true" aria-label="Photograph" tabindex="-1" bind:this={dialog} onkeydown={key} ontouchstart={touchStart} ontouchend={touchEnd}>
  <button class="x" type="button" aria-label="Close" onclick={onclose}>×</button>
  {#if photos.length > 1}
    <button class="nav prev" type="button" aria-label="Previous" onclick={() => go(-1)}>‹</button>
    <button class="nav next" type="button" aria-label="Next" onclick={() => go(1)}>›</button>
  {/if}
  {#if p}
    <div class="stage">{#key p.id}<PhotoImg id={p.id} size="full" alt={p.caption ?? ''} />{/key}</div>
    <div class="bar">
      {#if editing}
        <div class="edit">
          <input id="lb-caption" type="text" bind:value={caption} placeholder="Caption" />
          <input id="lb-date" type="date" bind:value={d} />
          <button class="btn small" type="button" onclick={() => (editing = false)}>Cancel</button>
          <button class="btn small pri" type="button" onclick={save}>Save</button>
        </div>
      {:else}
        <div class="meta">
          <span class="d">{p.d}</span>
          {#if p.dFrom === 'exif'}<span class="faint">from the camera</span>{/if}
          {#if p.caption}<span class="cap">{p.caption}</span>{/if}
          <span class="faint">{p.w}×{p.h}{#if photos.length > 1} · {index + 1} of {photos.length}{/if}</span>
        </div>
        <div class="acts">
          <button class="btn small" type="button" onclick={startEdit}>Caption / date</button>
          {#if acc}<button class="btn small" type="button" onclick={makeCover}>{isCover ? 'Is the cover' : 'Make cover'}</button>{/if}
          {#if confirming}
            <span class="faint">Remove this photo?</span><button class="btn small danger" type="button" onclick={remove}>Remove</button><button class="btn small" type="button" onclick={() => (confirming = false)}>Keep</button>
          {:else}
            <button class="btn small" type="button" onclick={() => (confirming = true)}>Remove</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lb { position: fixed; inset: 0; z-index: 100; background: rgba(8, 12, 10, 0.94); display: grid; grid-template-rows: 1fr auto; outline: 0; }
  .stage { display: grid; place-items: center; min-height: 0; padding: 48px 56px 8px; }
  .stage :global(img) { max-width: 100%; max-height: calc(100vh - 140px); object-fit: contain; border-radius: 4px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); }
  .stage :global(.ph-wait) { width: 60vw; height: 40vh; background: rgba(255, 255, 255, 0.06); border-radius: 4px; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 10px 16px 14px; color: #dfe5e2; font-size: 13px; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
  .meta .d { font-family: var(--mono); }
  .meta .cap { font-family: var(--serif); font-style: italic; font-size: 15px; }
  .faint { color: #8a9891; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .edit { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; }
  .edit input { font: inherit; font-size: 14px; padding: 7px 10px; border-radius: 8px; border: 1px solid #3a4440; background: #1a201d; color: #e8eeeb; }
  .edit input[type='text'] { flex: 1 1 220px; }
  .x, .nav { position: absolute; background: rgba(255, 255, 255, 0.08); color: #fff; border: 0; border-radius: 999px; width: 40px; height: 40px; font-size: 26px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
  .x:hover, .nav:hover { background: rgba(255, 255, 255, 0.18); }
  .x { top: 10px; right: 12px; }
  .nav { top: 50%; transform: translateY(-50%); }
  .prev { left: 10px; }
  .next { right: 10px; }
  .btn.small { padding: 5px 11px; font-size: 12.5px; }
  .lb .btn { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: transparent; }
  .lb .btn.pri { background: var(--accent); color: var(--on-accent); }
  .lb .btn.danger { color: #f0a08c; }
  @media (max-width: 640px) { .stage { padding: 52px 10px 6px; } .nav { display: none; } }
</style>
