<script lang="ts">
  /**
   * CITES Appendix status in one or two lines (round eighty-seven, stage 2; the sources agent): the Appendix, the listing
   * that covers the page and its level, the day the Appendices are in force from, a link to the official Appendices and,
   * where the page holds the taxon's Species+ id from Wikidata (P2040), to Species+. Read from the Appendices as CITES
   * publishes them, never from Species+'s data. No legal advice: the words are the listing's. Words: `source-words.ts`.
   */
  import type { Cites } from '$dossier/schema';
  import { citesWords, speciesPlusUrl, CITES_APPENDICES } from './source-words';
  let { cites = null, speciesPlusId = null }: { cites?: Cites | null; speciesPlusId?: string | null } = $props();
  const w = $derived(citesWords(cites));
</script>

<p class="srcline" id="cites-line"><b>{w.head}</b> {w.body}{#if w.credit}{' '}<span class="cr">{w.credit} <a href={CITES_APPENDICES} rel="noopener">The Appendices</a>{#if speciesPlusId}{' · '}<a href={speciesPlusUrl(speciesPlusId)} rel="noopener">Species+</a>{/if}</span>{/if}</p>

<style>
  .srcline { margin: 4px 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink2); }
  .srcline b { color: var(--ink); font-weight: 600; }
  .cr { color: var(--mut); }
</style>
