<script lang="ts">
  /**
   * The one-tap way to switch the reference's photographs on for your own pages, with the disclosure in the same
   * breath: showing them fetches each picture from the image host, which then sees which species this address grows.
   * Shown only where a photograph is being withheld; the preference is the same one Settings holds, and pages that
   * read it update at once. Off again in Settings.
   */
  import { prefs } from '$lib/ui/prefs.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  let { compact = false, center = false, what = 'the reference’s photographs of your species' }: { compact?: boolean; center?: boolean; what?: string } = $props();
  function on() {
    prefs.set({ referencePhotos: true });
    toast.show('Reference photographs on. Off again in Settings.');
  }
</script>

<div class="rpo" class:compact class:center>
  <button class="go" type="button" onclick={on}>{center ? 'or show' : 'Show'} {what}</button>
  <span class="why">They come straight from the image host (iNaturalist or the GBIF image cache), which then sees which species you grow. Nothing is sent to Cultifolio.</span>
</div>

<style>
  .rpo { font-family: var(--ui); font-size: 12.5px; color: var(--ink3); display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .go { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; white-space: nowrap; min-height: 0; }
  .go:hover { color: var(--ink); }
  .rpo .why { max-width: 56ch; line-height: 1.4; }
  .rpo.compact { font-size: 12px; }
  .rpo.compact .why { max-width: none; }
  .rpo.center { flex-direction: column; align-items: center; gap: 4px; text-align: center; font-family: var(--ui); }
  .rpo.center .why { max-width: 48ch; }
</style>
