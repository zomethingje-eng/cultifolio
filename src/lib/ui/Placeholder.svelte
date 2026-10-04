<script lang="ts">
  /**
   * Where a photograph would be and is not: the genus initial, set in the reference's own serif, on a tint drawn from the
   * genus name so that a row of photo-less tiles is not a row of grey boxes, with the reason in one small line beneath
   * (round twenty, 9). The tint is a hue only; the lightness follows the theme, so it reads in dark mode too. By genus,
   * not family: a cactus grower's tiles are nearly all Cactaceae, and tiles a grower scans must tell apart (round
   * twenty-one, 12). The caption is ordinary text at ordinary contrast, and read out; only the initial is decoration.
   */
  let { name, family = '', caption = '', title = '' }: { name: string; family?: string; caption?: string; title?: string } = $props();
  const hue = $derived.by(() => {
    let h = 2166136261;
    // the genus word without a hybrid sign or its spacing, so × Gasteraloe and × Graptoveria are not one hue (round twenty-two)
    const genus = name.replace(/[×x]\s*(?=[A-Z])/, '').trim().split(/\s+/)[0] || family;
    for (const ch of genus.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0) % 360;
  });
  const initial = $derived((name.replace(/[×x]\s*(?=[A-Z])/, '').trim()[0] ?? '?').toUpperCase());
</script>

<div class="ph" style="--h: {hue}" {title}>
  <span class="ini" aria-hidden="true">{initial}</span>
  {#if caption}<span class="cap">{caption}</span>{/if}
</div>

<style>
  .ph { width: 100%; height: 100%; container-type: size; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: hsl(var(--h) 48% 92%); color: hsl(var(--h) 30% 30%); padding: 6px; box-sizing: border-box; text-align: center; }
  /* the initial scales with the box (a 40 px row thumbnail, a 170 px tile); the caption is the theme's hint ink, 4.5:1 or better on the tint */
  .ini { font-family: var(--serif, Georgia, serif); font-style: italic; font-size: 2.125rem; line-height: 1; font-weight: 500; }
  @supports (font-size: 1cqh) { .ini { font-size: clamp(16px, 38cqh, 72px); } } /* scales with the box where container units exist; a fixed size where they do not (older Safari) */
  .cap { font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.3; color: var(--ink2); max-width: 100%; }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .ph { background: hsl(var(--h) 22% 20%); color: hsl(var(--h) 30% 78%); }
  }
  :global(:root[data-theme='dark']) .ph { background: hsl(var(--h) 22% 20%); color: hsl(var(--h) 30% 78%); }
</style>
