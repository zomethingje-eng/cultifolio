<script lang="ts">
  import { nameParts } from '$core/names';
  let { name, authorship }: { name: string; authorship?: string } = $props();
  const parts = $derived(nameParts(name));
</script>

<span class="sciname">{#each parts as p}{#if p.italic}<i>{p.text}</i>{:else}{p.text}{/if}{/each}{#if authorship}&nbsp;<span class="auth">{authorship}</span>{/if}</span>

<style>
  .auth { font-style: normal; font-size: 0.72em; color: var(--ink3); }
  /* A name set in a row or tile whose line is italic (My plants, the tiles): only the Latin is italic, so "sp.", "var."
     and a collector's designation stay roman, as botanical convention sets them (the merge, round eighty-five; review-w W12). */
  :global(.nm) .sciname { font-style: normal; }
  .sciname i { font-style: italic; }
</style>
