<script lang="ts">
  /**
   * Where a photograph would be and is not: the genus initial, set in the reference's own serif, on a tint drawn from the
   * family name so that a row of photo-less tiles is not a row of grey boxes, with the reason in one small line beneath
   * (round twenty, 9). The tint is a hue only; the lightness follows the theme, so it reads in dark mode too.
   */
  let { name, family = '', caption = '', title = '' }: { name: string; family?: string; caption?: string; title?: string } = $props();
  const hue = $derived.by(() => {
    let h = 2166136261;
    for (const ch of (family || name).toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0) % 360;
  });
  const initial = $derived((name.trim()[0] ?? '?').toUpperCase());
</script>

<div class="ph" style="--h: {hue}" {title} aria-hidden="true">
  <span class="ini">{initial}</span>
  {#if caption}<span class="cap">{caption}</span>{/if}
</div>

<style>
  .ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: hsl(var(--h) 30% 91%); color: hsl(var(--h) 25% 38%); padding: 6px; box-sizing: border-box; text-align: center; }
  .ini { font-family: var(--serif, Georgia, serif); font-style: italic; font-size: clamp(34px, 40%, 64px); line-height: 1; font-weight: 500; opacity: 0.85; }
  .cap { font-family: var(--mono); font-size: 10px; line-height: 1.3; opacity: 0.8; max-width: 100%; }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .ph { background: hsl(var(--h) 22% 20%); color: hsl(var(--h) 30% 78%); }
  }
  :global(:root[data-theme='dark']) .ph { background: hsl(var(--h) 22% 20%); color: hsl(var(--h) 30% 78%); }
</style>
