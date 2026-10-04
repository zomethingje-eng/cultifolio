<script lang="ts">
  /**
   * One of your photos at full size, with the few things you do to a photo:
   * caption it, fix its date, make it the plant's face, or remove it.
   * Arrow keys and swipes move through the set; Escape closes.
   */
  import { tick } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import PhotoImg from './PhotoImg.svelte';
  import { photoLabel } from './photo-label';
  import type { Photo } from '$lib/db/types';

  import { toast } from './toast.svelte';
  let { photos, index = $bindable(0), acc = null, onclose }: { photos: Photo[]; index?: number; acc?: string | null; onclose: () => void } = $props();
  // The viewer holds the photograph by id, not by its place in the list: saving a date re-sorts the list, and a viewer
  // on `photos[index]` would then be showing, and removing, a neighbour (round twenty-nine, 1). `index` follows the id.
  // svelte-ignore state_referenced_locally
  let id = $state<string | null>(photos[index]?.id ?? null); // the initial value on purpose: the id is set once from where the viewer opened, and follows the arrows from then on
  const p = $derived(photos.find((x) => x.id === id) ?? photos[index]);
  $effect(() => {
    const i = photos.findIndex((x) => x.id === id);
    if (i >= 0 && i !== index) index = i;
  });
  /** The photograph's own words, with its place in the set when there are several: two photographs of one plant on one day read the same otherwise (round fifty-nine). */
  const label = $derived(p ? `${photoLabel(p)}${photos.length > 1 ? `, photograph ${index + 1} of ${photos.length}` : ''}` : 'Photograph');
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
    // A modal: the rest of the page is inert while it is open (Tab cannot leave it, a screen reader cannot read behind it),
    // and focus goes back to what opened it on close, the thumbnail as a rule (round eighteen, 13).
    const opener = document.activeElement as HTMLElement | null;
    // Focus starts on the first control, the Close button, not on the dialog's box: a screen reader announced a box with
    // nothing to act on (round fifty-eight; the accessibility review).
    (dialog?.querySelector<HTMLElement>('[data-ctl]') ?? dialog)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Every sibling of the dialog and of each of its ancestors, up to <body>: the dialog sits deep inside the page, so
    // marking only <body>'s children would leave its own branch live.
    const others: HTMLElement[] = [];
    for (let node: HTMLElement | null = dialog; node && node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement.children) if (sib !== node && !(sib as HTMLElement).inert) others.push(sib as HTMLElement);
    }
    for (const el of others) el.inert = true;
    return () => {
      document.body.style.overflow = prev;
      for (const el of others) el.inert = false;
      // The opener, else the page's content when the opener went with the photograph (a removal): never the page body
      // (round fifty-eight; the accessibility review).
      if (opener && opener !== document.body && document.contains(opener)) opener.focus();
      else document.getElementById('main')?.focus({ preventScroll: true });
    };
  });

  /**
   * Focus a control by its role in the viewer, after the render that put it there: each control that replaces itself
   * (Caption / date, Remove, Keep, Cancel, Save) hands focus to the one that took its place, so a keyboard is never
   * dropped on the page body (round fifty-eight; the accessibility review).
   */
  async function focusCtl(...keys: string[]) {
    await tick();
    for (const k of keys) {
      const el = dialog?.querySelector<HTMLElement>(`[data-ctl="${k}"]`);
      if (el) { el.focus(); return; }
    }
  }
  /** The control the photograph after a swap has in place of this one: an editor or a confirmation closes on a swap, so its fields stand for the button that opened it. */
  const SAME: Record<string, string> = { caption: 'edit', date: 'edit', 'edit-cancel': 'edit', 'edit-save': 'edit', 'remove-yes': 'remove', 'remove-keep': 'remove' };

  const go = (n: number) => {
    if (!photos.length) return;
    // Which control had focus, so the next photograph's equivalent gets it (round fifty-eight; the accessibility review).
    const was = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-ctl]')?.dataset.ctl ?? null;
    index = (index + n + photos.length) % photos.length;
    id = photos[index]?.id ?? null;
    editing = false;
    confirming = false;
    if (was) void focusCtl(SAME[was] ?? was, n > 0 ? 'next' : 'prev', 'close');
  };
  // On the window while the viewer is open, not on the dialog's box: focus can sit anywhere in it, or nowhere after a
  // swap, and Escape must close it all the same. Escape steps back one level: out of the editor or the confirmation
  // first, then out of the viewer (round fifty-eight; the accessibility review).
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) cancelEdit();
      else if (confirming) keep();
      else onclose();
      return;
    }
    if (editing) return;
    if (e.key === 'ArrowRight') go(1);
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
    void focusCtl('caption'); // the field that replaced the button (round fifty-eight; the accessibility review)
  }
  function cancelEdit() {
    editing = false;
    void focusCtl('edit');
  }
  async function save() {
    await collection.put('photo', p.id, { caption: caption.trim() || null, d: d || p.d, dFrom: d && d !== p.d ? 'added' : p.dFrom ?? null });
    editing = false;
    void focusCtl('edit');
  }
  function askRemove() {
    confirming = true;
    void focusCtl('remove-yes'); // the confirmation that replaced the button, as the plant page's "×" does (round fifty-eight; the accessibility review)
  }
  function keep() {
    confirming = false;
    void focusCtl('remove');
  }
  async function makeCover() {
    if (!acc) return;
    await collection.setCover(acc, isCover ? null : p.id);
  }
  async function remove() {
    const undo = await collection.removePhoto(p.id);
    confirming = false;
    // The viewer closes on a removal: the Undo below sits on the page, which this modal keeps inert while it is open,
    // and the grid is where the gap shows (round twenty-nine, 1). The removal is one tap; the way back is one too.
    onclose();
    toast.show('Photograph removed.', 8000, { label: 'Undo', run: () => { void undo(); } });
  }
</script>

<svelte:window onkeydown={key} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="lb" role="dialog" aria-modal="true" aria-label={p ? photoLabel(p) : 'Photograph'} tabindex="-1" bind:this={dialog} ontouchstart={touchStart} ontouchend={touchEnd}>
  <button class="x" type="button" aria-label="Close" data-ctl="close" onclick={onclose}>×</button>
  {#if photos.length > 1}
    <button class="nav prev" type="button" aria-label="Previous photograph" data-ctl="prev" onclick={() => go(-1)}>‹</button>
    <button class="nav next" type="button" aria-label="Next photograph" data-ctl="next" onclick={() => go(1)}>›</button>
  {/if}
  {#if p}
    <!-- The plant, the day and the caption as the image's text: it had the caption or nothing (round fifty-eight; the accessibility review). -->
    <div class="stage">{#key p.id}<PhotoImg id={p.id} size="full" alt={label} />{/key}</div>
    <div class="bar">
      {#if editing}
        <!-- Each field with a visible name: the caption's placeholder was its only one, the date had none (round fifty-eight; the accessibility review). -->
        <div class="edit">
          <label class="lbf grow"><span class="eyebrow">Caption</span><input id="lb-caption" type="text" data-ctl="caption" bind:value={caption} /></label>
          <label class="lbf"><span class="eyebrow">Date taken</span><input id="lb-date" type="date" data-ctl="date" bind:value={d} /></label>
          <button class="btn small" type="button" data-ctl="edit-cancel" onclick={cancelEdit}>Cancel</button>
          <button class="btn small pri" type="button" data-ctl="edit-save" onclick={save}>Save</button>
        </div>
      {:else}
        <div class="meta">
          <span class="d">{p.d}</span>
          {#if p.dFrom === 'exif'}<span class="faint">from the camera</span>{/if}
          {#if p.caption}<span class="cap">{p.caption}</span>{/if}
          <span class="faint">{p.w}×{p.h}</span>
          <!-- Said when the photograph changes, so an arrow key or a swipe is heard as well as seen (round fifty-nine). -->
          {#if photos.length > 1}<span class="faint" aria-live="polite" aria-atomic="true"><span class="sr">{photoLabel(p)}{', '}</span>{index + 1} of {photos.length}</span>{/if}
        </div>
        <div class="acts">
          <button class="btn small" type="button" data-ctl="edit" onclick={startEdit}>Caption / date</button>
          {#if acc}<button class="btn small" type="button" data-ctl="cover" onclick={makeCover}>{isCover ? 'Is the cover' : 'Make cover'}</button>{/if}
          {#if confirming}
            <span class="faint">Remove this photo?</span><button class="btn small danger" type="button" data-ctl="remove-yes" onclick={remove}>Remove</button><button class="btn small" type="button" data-ctl="remove-keep" onclick={keep}>Keep</button>
          {:else}
            <button class="btn small" type="button" data-ctl="remove" onclick={askRemove}>Remove</button>
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
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 10px 16px 14px; color: #dfe5e2; font-size: var(--fs-md); }
  .meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
  .meta .d { font-family: var(--mono); }
  .meta .cap { font-family: var(--serif); font-style: italic; font-size: var(--fs-base); }
  .faint { color: #8a9891; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .edit { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; width: 100%; }
  .edit input { font: inherit; font-size: var(--fs-md); padding: 7px 10px; border-radius: var(--r); border: 1px solid #3a4440; background: #1a201d; color: #e8eeeb; width: 100%; }
  /* A field and its small name over it, light on the dark ground (round fifty-eight; the accessibility review). */
  .lbf { display: grid; gap: 3px; }
  .lbf.grow { flex: 1 1 220px; }
  .lbf .eyebrow { color: #b6c1bc; }
  .x, .nav { position: absolute; background: rgba(255, 255, 255, 0.08); color: #fff; border: 0; border-radius: 999px; width: max(40px, var(--tap)); height: max(40px, var(--tap)); font-size: 1.625rem; line-height: 1; cursor: pointer; display: grid; place-items: center; }
  .x:hover, .nav:hover { background: rgba(255, 255, 255, 0.18); }
  .x { top: 10px; right: 12px; }
  .nav { top: 50%; transform: translateY(-50%); }
  .prev { left: 10px; }
  .next { right: 10px; }
  .btn.small { padding: 5px 11px; font-size: var(--fs-md); }
  .lb .btn { background: rgba(255, 255, 255, 0.1); color: #fff; border-color: transparent; }
  .lb .btn.pri { background: var(--accent); color: var(--on-accent); }
  .lb .btn.danger { color: #f0a08c; }
  @media (max-width: 640px) { .stage { padding: 52px 10px 6px; } .nav { display: none; } }
</style>
