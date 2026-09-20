<script lang="ts">
  /** "Share card": the species' climate as one picture, drawn here from the page's own figures, shared or saved. */
  import { climateCardSvg, svgToPng, type CardInput } from '$lib/share/card';
  let { input }: { input: CardInput } = $props();
  let busy = $state(false);
  let said = $state<string | null>(null);
  const file = () => `${input.slug}-climate.png`;
  async function go() {
    if (busy) return;
    busy = true;
    said = null;
    try {
      const png = await svgToPng(climateCardSvg(input));
      const f = new File([png], file(), { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [f] })) {
        try {
          await nav.share({ files: [f], title: `${input.name}: habitat climate`, text: `${input.name}, habitat climate from Cultifolio`, url: `https://cultifolio.com/species/${input.slug}` });
          said = 'Shared.';
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // they closed the sheet: nothing to say
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = file();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      said = 'Saved as a picture.';
    } catch (e) {
      said = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn" type="button" onclick={go} disabled={busy} title="One picture: the four figures, the year, the sources and the link">{busy ? 'Drawing…' : 'Share card'}</button>
{#if said}<span class="small muted" role="status">{said}</span>{/if}

<style>
  .muted { color: var(--ink3); }
</style>
