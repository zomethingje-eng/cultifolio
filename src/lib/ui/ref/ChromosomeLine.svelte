<script lang="ts">
  /**
   * Chromosome counts in one or two lines (round eighty-seven, stage 2; the sources agent): each number as published
   * (2n first, then n), with the references that give it, each linked to its DOI or stable URL, then ChromoDB's set, its
   * version and date, CC BY 4.0, and the day read. A count published under another name says so in its reference's title.
   * Words: `source-words.ts`.
   */
  import type { Chromosomes } from '$dossier/schema';
  import { chromosomeWords, countGroups } from './source-words';
  let { chromosomes = null }: { chromosomes?: Chromosomes | null } = $props();
  const w = $derived(chromosomeWords(chromosomes));
  const groups = $derived(chromosomes?.status === 'ok' ? countGroups(chromosomes) : []);
</script>

<p class="srcline" id="chromosome-line"><b>{w.head}</b>{#each groups as g, i (g.label)}{i ? '; ' : ' '}<span class="n">{g.label}</span> ({#each g.refs as r, j (r.ref)}{j ? ', ' : ''}{#if r.url}<a href={r.url} rel="noopener" title={[r.cite, r.as ? `published as ${r.as}` : ''].filter(Boolean).join('; ') || undefined}>{r.ref}</a>{:else}{r.ref}{/if}{/each}){/each}{#if groups.length}.{/if}{#if w.body}{' '}{w.body}{/if}{#if w.credit}{' '}<span class="cr">{w.credit}</span>{/if}</p>

<style>
  .srcline { margin: 4px 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink2); }
  .srcline b { color: var(--ink); font-weight: 600; }
  .n { font-variant-numeric: var(--figs); white-space: nowrap; color: var(--ink); }
  .cr { color: var(--mut); }
</style>
