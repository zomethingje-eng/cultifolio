<script lang="ts">
  /**
   * "Share card": the species' climate as one picture, drawn here from the page's own figures, shared or saved. The
   * drawing code is fetched when the button is pressed, not with every species page (round sixty; a11y 14).
   */
  import type { CardInput } from '$lib/share/card';
  import { updated } from '$app/state';
  import { cardCodeWords } from './share-words';
  let { input }: { input: CardInput } = $props();
  /** The drawing code could not be fetched: the page can be reloaded to get it (round eighty-one; review C1). */
  let reload = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);
  let saved = $state<string | null>(null); // the picture's own URL, so "saved" can be seen and not only believed
  const file = () => `${input.slug}-climate.png`;
  async function go() {
    if (busy) return;
    busy = true;
    said = null;
    reload = false;
    // The drawing code, fetched on the first press. A page left open across a deploy asks for its own build's file, which
    // the server no longer has and the device may not hold; offline, a device that never made a card does not hold it
    // either. Said in words, with the way forward, never the browser's message with the file's address (round
    // eighty-one; review C1: "Failed to fetch dynamically imported module: …/_app/immutable/chunks/C19Gm2hU.js").
    let card: typeof import('$lib/share/card');
    try {
      card = await import('$lib/share/card');
    } catch {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const newer = offline ? false : await updated.check().catch(() => false);
      said = cardCodeWords(offline ? 'offline' : newer ? 'newer' : 'unreached');
      reload = !offline;
      busy = false;
      return;
    }
    try {
      const { climateCardSvg, svgToPng } = card;
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
      saved = a.href;
      said = `Saved to your downloads as ${file()}.`;
    } catch (e) {
      said = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn" type="button" onclick={go} disabled={busy} title="One picture: the four figures, the year, the sources and the link">{busy ? 'Drawing…' : 'Share card'}</button>
<!-- The space before "Open it" is its own expression: Svelte trimmed it inside the block, and the line read "….png.Open it" (round sixty; visitor 14). -->
{#if said}<span class="small muted" role="status">{said}{#if saved}{' '}<a href={saved} target="_blank" rel="noopener">Open it</a>.{/if}</span>{#if reload}{' '}<button class="btn small" type="button" onclick={() => location.reload()}>Reload the page</button>{/if}{/if}

<style>
  .muted { color: var(--ink3); }
</style>
