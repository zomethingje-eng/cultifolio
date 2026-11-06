<script lang="ts">
  import { nameParts } from '$core/names';
  let { name, authorship }: { name: string; authorship?: string } = $props();
  const parts = $derived(nameParts(name));
</script>

<!-- A plain space before the author (round eighty-six; review W's W5, P's P4): the no-break space glued the epithet to the
     author's first word, so a long author took the epithet to the next line ("Sabdariffa / acetosella (Welw. ex Hiern) …")
     though the binomial fitted, and an author kept whole ran out of the name card at 320 px. Now the line breaks before
     the author, and the author wraps within itself. -->
<span class="sciname">{#each parts as p}{#if p.italic}<i>{p.text}</i>{:else}{p.text}{/if}{/each}{#if authorship}{' '}<span class="auth">{authorship}</span>{/if}</span>

<style>
  .auth { font-style: normal; font-size: 0.72em; color: var(--ink3); }
  /* A name set in a row or tile whose line is italic (My plants, the tiles): only the Latin is italic, so "sp.", "var."
     and a collector's designation stay roman, as botanical convention sets them (the merge, round eighty-five; review-w W12). */
  :global(.nm) .sciname { font-style: normal; }
  .sciname i { font-style: italic; }
</style>
