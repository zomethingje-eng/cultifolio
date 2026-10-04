<script lang="ts">
  /**
   * The one-tap way to switch the reference's photographs on for your own pages, with the disclosure in the same
   * breath: showing them fetches each picture from the image host, which then sees which species this address grows.
   * Shown only where a photograph is being withheld; the preference is the same one Settings holds, and pages that
   * read it update at once. Off again in Settings.
   */
  import { prefs } from '$lib/ui/prefs.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  let { compact = false, center = false, link = false, what = 'the reference’s photographs of your species', buckets = false }: { compact?: boolean; center?: boolean; link?: boolean; what?: string; buckets?: boolean } = $props();
  // "hash groups", not "hash buckets": the glossary's plain words (round fifty-eight; the accessibility review).
  const why = $derived(`They come straight from the image host (iNaturalist, Wikimedia Commons or the GBIF image cache), which then sees which species you grow. ${buckets ? 'This site is asked for the hash groups your species fall in, a few hundred species each, as the plant pages ask; nothing more.' : 'Nothing is sent to Cultifolio.'}`);
  function on() {
    prefs.set({ referencePhotos: true });
    toast.show('Reference photographs on. Off again in Settings.');
  }
</script>

{#if link}
  <!-- One line, and what showing it discloses on tap, before the switch is thrown: the first screen of a plant is not the place for a paragraph. -->
  <details class="rpo link">
    <summary>Show {what}</summary>
    <span class="why">{why}</span> <button class="go" type="button" onclick={on}>Show it</button>
  </details>
{:else}
<div class="rpo" class:compact class:center>
  <button class="go" type="button" onclick={on}>{center ? 'or show' : 'Show'} {what}</button>
  <span class="why">{why}</span>
</div>
{/if}

<style>
  .rpo { font-family: var(--ui); font-size: var(--fs-md); color: var(--ink3); display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .go { border: 0; background: none; padding: 4px 0; font: inherit; font-size: var(--fs-md); font-weight: 600; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; white-space: nowrap; min-height: 24px; }
  .go:hover { color: var(--ink); }
  .rpo .why { max-width: 56ch; line-height: 1.4; }
  .rpo.compact { font-size: var(--fs-sm); }
  .rpo.compact .why { max-width: none; }
  .rpo.center { flex-direction: column; align-items: center; gap: 4px; text-align: center; font-family: var(--ui); }
  .rpo.center .why { max-width: 48ch; }
  .rpo.link { display: block; margin-top: 6px; }
  .rpo.link summary { cursor: pointer; color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; list-style: none; width: fit-content; }
  .rpo.link summary::-webkit-details-marker { display: none; }
  .rpo.link summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .rpo.link[open] summary { margin-bottom: 4px; }
  .rpo.link .why { display: inline; }
</style>
