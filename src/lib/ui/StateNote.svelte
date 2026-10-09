<script lang="ts">
  /**
   * A system state in two words, with its sentence behind "Why?": the app's careful sentences ("records wait for changes
   * this build cannot read yet (a batch from a newer build, set aside on Sync)") read as errors to a grower; the word says
   * what, the disclosure says why (round forty-one, R14). The glossary on /about/how defines the words.
   */
  import type { Snippet } from 'svelte';
  let { word, id = undefined, children }: { word: string; id?: string; children: Snippet } = $props();
</script>

<!-- A div, not a p: a <details> inside a <p> is split off by the HTML parser when the template is cloned, and every page
     that drew a state note threw "Illegal invocation" (round sixty-two, agent L). -->
<div class="statenote small" {id}>
  <span class="word">{word}</span>
  <details class="why"><summary>Why?</summary><span class="text">{@render children()}</span></details>
</div>

<style>
  .statenote { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 10px 0; color: var(--ink2); }
  .word { font-family: var(--mono); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink); background: var(--sunk); padding: 3px 9px; border-radius: 999px; }
  .why { display: inline; }
  .why summary { display: inline; cursor: pointer; color: var(--accent); text-decoration: underline; font-size: var(--fs-md); list-style: none; }
  .why summary::-webkit-details-marker { display: none; }
  .why[open] summary { margin-right: 6px; }
  .text { line-height: 1.5; }
</style>
