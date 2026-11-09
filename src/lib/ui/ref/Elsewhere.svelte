<script lang="ts">
  /**
   * Elsewhere and the first publication (round eighty-seven, stage 2; links agent), for Names and registers: the other
   * registers and floras the page's own Wikidata item names (`$dossier/elsewhere-links`, `--fill elsewhere`; CC0), one
   * line of links, a register the page already links never twice; and where the name was published, as Kew's World
   * Checklist gives it (WCVP), linked to BHL only where BHL's resolver gave one page for exactly that citation (`--fill
   * bhl`), else the citation as text. "Not asked" until the fill reads the item, "not checked" where it did not answer.
   * Species+ is linked only once the CITES table is checked for the page (`elsewhereView`; the review of stage 2's pages, 7).
   */
  import type { Dossier } from '$dossier/schema';
  import { elsewhereView } from './links-words';
  let { dossier }: { dossier: Pick<Dossier, 'ids' | 'links' | 'elsewhere'> & { cites?: Dossier['cites'] | null } } = $props();
  const v = $derived(elsewhereView(dossier));
</script>

{#if v.published}
  <p class="small muted names" id="first-published"><b>Published in</b> {#if v.published.bhl}<a href={v.published.bhl} rel="noopener">{v.published.text}</a> (the page on BHL){:else}{v.published.text}{/if} <span class="faint">(WCVP, RBG Kew{v.published.file ? `, file of ${v.published.file}` : ''}{v.published.bhl ? '; page by BHL’s resolver for this citation' : ''})</span></p>
{/if}
<p class="small muted names elsewhere" id="elsewhere">
  <b>Elsewhere</b>
  {#if v.wikidata.state === 'not-asked'}not asked: {v.wikidata.why}.{:else if v.wikidata.state === 'not-checked'}not checked: Wikidata's item {v.wikidata.item} was asked on {v.wikidata.read} and not answered ({v.wikidata.why}).{:else if v.links.length}{#each v.links as l, i (l.p)}{i ? ' · ' : ''}<a href={l.url} rel="noopener">{l.label}</a>{/each} <span class="faint">(identifiers from Wikidata's item {v.wikidata.item}, read {v.wikidata.read}, CC0)</span>{:else}Wikidata's item {v.wikidata.item} names no other register <span class="faint">(read {v.wikidata.read}, CC0)</span>{/if}
</p>

<style>
  .names { margin: 0 0 6px; }
  .elsewhere a { white-space: nowrap; }
  @media (pointer: coarse) { .elsewhere a { display: inline-block; min-height: var(--tap, 44px); line-height: var(--tap, 44px); } }
</style>
