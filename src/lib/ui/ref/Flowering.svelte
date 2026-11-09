<script lang="ts">
  /**
   * Flowering by month (round eighty-seven, stage 2; links agent): iNaturalist's research-grade observations of wild plants
   * annotated "Flowering", counted by the month they were observed in (`$dossier/flowering`, `--fill flowering`). Twelve
   * cells, January first, each its count and a bar to the busiest month's; the source and the day read under them. "Not
   * asked" until the fill reads the page, "not checked" where iNaturalist did not answer, never "none" (rule 2). Under
   * twelve observations it is marked "from few records", as the habitat climate is, and shown as read. The months are the
   * calendar's, as observed: never moved to the reader's hemisphere, as the climate chart keeps the habitat's.
   */
  import type { Dossier } from '$dossier/schema';
  import { floweringView, floweringCaption, floweringMonthsWords, floweringFew } from './links-words';
  let { dossier }: { dossier: Pick<Dossier, 'ids' | 'flowering' | 'climate'> } = $props();
  const v = $derived(floweringView(dossier));
</script>

<section class="flower" aria-labelledby="flowering-t" id="flowering">
  <h3 class="fh" id="flowering-t">Flowering by month{#if v.state === 'read' && v.few}<span class="few" id="flowering-few">from few records: {v.total}</span>{/if}</h3>
  {#if v.state === 'not-asked'}
    <p class="small muted" id="flowering-not-asked">Not asked: {v.why}.</p>
  {:else if v.state === 'not-checked'}
    <p class="small muted" id="flowering-not-checked">Not checked: iNaturalist was asked on {v.read} and did not answer ({v.why}).</p>
  {:else}
    {#if v.total}
      <ol class="months" aria-label="Flowering observations by month, January to December">
        {#each v.months as m (m.m)}<li><span class="n">{m.n}</span><span class="bar" aria-hidden="true"><i style="height:{Math.round(m.share * 100)}%"></i></span><span class="mo">{m.m}</span></li>{/each}
      </ol>
    {:else}
      <p class="small" id="flowering-zero">No research-grade observation of a wild plant is annotated flowering on iNaturalist.</p>
    {/if}
    <p class="small muted cap">{floweringCaption(v.read)}: <a href={v.href} rel="noopener">{v.total} observation{v.total === 1 ? '' : 's'}</a>, research grade, not captive. {floweringMonthsWords(v.south)}</p>
    {#if v.few && v.total}<p class="small muted">{floweringFew(v.total)}</p>{/if}
  {/if}
</section>

<style>
  .flower { margin: 10px 0 0; }
  .fh { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0 0 6px; font-size: var(--fs-head, 0.8125rem); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mut); }
  .few { padding: 0 7px; border: 1.5px dashed var(--warm); border-radius: var(--r); color: var(--warm-ink); letter-spacing: 0.02em; text-transform: none; font-weight: 400; }
  .months { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px; margin: 0; padding: 0; list-style: none; max-width: 520px; border-bottom: 1px solid var(--ink); }
  .months li { display: flex; flex-direction: column; align-items: stretch; min-width: 0; text-align: center; }
  .n { font-size: var(--fs-xs); font-variant-numeric: tabular-nums lining-nums; color: var(--ink2); overflow-wrap: anywhere; }
  .bar { display: flex; align-items: flex-end; height: 48px; }
  .bar i { display: block; width: 100%; min-height: 1px; background: var(--link); }
  .mo { font-size: var(--fs-xs); color: var(--mut); padding-top: 2px; border-top: 1px solid var(--rule); }
  .cap { margin: 6px 0 0; }
  p { margin: 4px 0 0; }
</style>
