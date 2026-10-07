<script lang="ts">
  /**
   * A plant's photographs in a strip by date under its hero, oldest to newest, and Compare to set two side by side (round
   * sixty; the grower review's §4, the self-review's experience item 10). Compare opens on the first and the latest, the
   * "then and now" a grower wants most; a tap on another photograph swaps it in. All on the device.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { daysBetween } from '$core/dates';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import { photoDay, photoLabel } from '$lib/ui/photo-label';
  let { acc }: { acc: string } = $props();
  const photos = $derived([...collection.photos(acc)].sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id)));
  let comparing = $state(false);
  let pair = $state<string[]>([]);
  function startCompare() {
    comparing = !comparing;
    if (comparing) pair = [photos[0].id, photos[photos.length - 1].id];
  }
  function tap(id: string) {
    if (!comparing) { comparing = true; pair = [photos[0].id === id ? photos[photos.length - 1].id : photos[0].id, id]; return; }
    if (pair.includes(id)) return;
    pair = [pair[1] ?? pair[0], id];
  }
  const shown = $derived(pair.map((id) => photos.find((p) => p.id === id)).filter((p): p is (typeof photos)[number] => !!p).sort((a, b) => a.d.localeCompare(b.d)));
  const span = $derived(shown.length === 2 ? daysBetween(shown[0].d, shown[1].d) : null);
  const spanWords = (d: number) => (d >= 730 ? `${Math.floor(d / 365)} years` : d >= 60 ? `${Math.round(d / 30.4)} months` : `${d} day${d === 1 ? '' : 's'}`);
</script>

{#if photos.length >= 2}
  <section class="ptl" aria-label="Photographs by date" id="photo-timeline">
    <div class="ptlhead"><span class="muted small">{photos.length} photographs, {photoDay(photos[0].d)} to {photoDay(photos[photos.length - 1].d)}</span><button class="btn small" type="button" id="ptl-compare" aria-pressed={comparing} onclick={startCompare}>{comparing ? 'Close compare' : 'Compare'}</button></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <ol class="strip" tabindex="0" aria-label="Photographs, oldest first">
      {#each photos as p (p.id)}
        <!-- Named from the month it shows, then the photograph, so a voice saying "2026-10" finds it (round sixty-one; the accessibility review, 14). -->
        <li><button type="button" class="th" class:on={comparing && pair.includes(p.id)} onclick={() => tap(p.id)} aria-label="{p.d.slice(0, 7)}: {photoLabel(p)}{comparing ? (pair.includes(p.id) ? ', compared' : ', compare this one') : ', compare'}" aria-pressed={comparing ? pair.includes(p.id) : undefined}><PhotoImg id={p.id} alt="" loading="lazy" /><span class="d">{p.d.slice(0, 7)}</span></button></li>
      {/each}
    </ol>
    {#if comparing && shown.length === 2}
      <div class="pair" id="ptl-pair">
        {#each shown as p (p.id)}
          <figure><PhotoImg id={p.id} size="full" alt={photoLabel(p)} /><figcaption>{photoDay(p.d)}{p.caption ? ` · ${p.caption}` : ''}</figcaption></figure>
        {/each}
      </div>
      {#if span != null}<p class="muted small">{spanWords(span)} apart. Tap another photograph to swap it in.</p>{/if}
    {/if}
  </section>
{/if}

<style>
  .ptl { margin: 10px 0 4px; }
  .ptlhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .ptlhead .btn { min-height: var(--tap); }
  .strip { list-style: none; display: flex; gap: 6px; overflow-x: auto; margin: 6px 0 0; padding: 2px 0 6px; scrollbar-width: thin; }
  .th { position: relative; display: block; width: 72px; height: 72px; padding: 0; border: 2px solid transparent; border-radius: var(--r); overflow: hidden; background: var(--sunk); cursor: pointer; }
  .th.on { border-color: var(--accent); }
  .th :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .th .d { position: absolute; left: 0; right: 0; bottom: 0; padding: 1px 3px; background: rgba(0, 0, 0, 0.55); color: #fff; font-family: var(--mono); font-size: 11px; text-align: center; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .pair figure { margin: 0; }
  .pair :global(img) { width: 100%; height: auto; max-height: 60vh; object-fit: contain; background: var(--sunk); border-radius: var(--r); display: block; }
  .pair figcaption { font-size: var(--fs-sm); color: var(--ink2); margin-top: 4px; }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
</style>
