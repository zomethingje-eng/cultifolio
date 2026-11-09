<script lang="ts">
  /**
   * A named hybrid's parents (round eighty-seven, stage 2; links agent): the parents Kew's World Checklist states for the
   * page's Kew entry (`hybrid_formula`, WCVP; `$dossier/kew-published`), each linked to its page here by Kew's ids, and each
   * parent's own habitat figures side by side, read from the parent's own dossier when the page is served (`parentPage`):
   * the coldest month's mean nightly low, the warmest month's mean daily high and the year's rain (CHELSA), and the record
   * low (NASA POWER), each with its source. Never blended into one climate: a hybrid's parents grew apart, and an average
   * of their places is no place. A parent with no page here, or none read just now, says why.
   */
  import type { Parents } from '$dossier/schema';
  import { temp, rain, type Units } from '$core/units';
  import { parentRows, type ParentPage } from './links-words';
  let { parents, pages, units }: { parents: Parents; pages: Readonly<Record<string, ParentPage | null | undefined>>; units: Units } = $props();
  const rows = $derived(parentRows(parents, pages));
  const others = (n: number) => `Kew's file holds ${n} other name${n === 1 ? '' : 's'} of these words, by other authors; the parent is the one Kew accepts.`;
</script>

<section class="parents" aria-labelledby="parents-t" id="parents">
  <h3 class="ph3" id="parents-t">Parents</h3>
  <p class="small muted">Kew's World Checklist gives this hybrid's parents as “{parents.formula}” <span class="faint">(WCVP, RBG Kew{parents.file ? `, file of ${parents.file}` : ''})</span>. Each parent's own habitat is shown beside the other's, not combined.</p>
  <table class="pt">
    <thead><tr><th scope="col">Parent</th><th scope="col">Coldest month, mean low</th><th scope="col">Warmest month, mean high</th><th scope="col">Rain a year</th><th scope="col">Record low</th></tr></thead>
    <tbody>
      {#each rows as r, i (i)}
        {@const of = parents.of[i]}
        <tr>
          <th scope="row">{#if r.page}<a href="/species/{r.page.slug}"><i class="sciname">{r.page.name}</i></a>{#if r.page.name !== r.name}<span class="faint small"> (Kew's formula: <i>{r.name}</i>)</span>{/if}{:else}<i class="sciname">{r.name}</i>{/if}{#if r.why}<span class="small muted why">{r.why}.</span>{/if}{#if of.others}<span class="small muted why">{others(of.others)}</span>{/if}</th>
          {#if r.page && !r.page.figures.none}
            {@const f = r.page.figures}
            <td data-l="Coldest month, mean low">{f.coldLow != null ? temp(f.coldLow, units, 1) : '–'} <span class="src">{f.normals ?? 'CHELSA'}</span></td>
            <td data-l="Warmest month, mean high">{f.warmHigh != null ? temp(f.warmHigh, units, 1) : '–'} <span class="src">{f.normals ?? 'CHELSA'}</span></td>
            <td data-l="Rain a year">{f.rainMm != null ? rain(f.rainMm, units) : '–'} <span class="src">{f.rainCells ? 'median across the range' : 'monthly medians added'}, {f.normals ?? 'CHELSA'}</span></td>
            <td data-l="Record low">{#if f.recordLow != null}{temp(f.recordLow, units, 1)} <span class="src">in {f.years} years, {f.extremes ?? 'NASA POWER'}</span>{:else}<span class="muted">not shown on its page</span>{/if}</td>
          {:else if r.page}
            <td colspan="4" class="muted" data-l="Habitat">{r.page.figures.none}.</td>
          {:else if of.page}
            <!-- A parent with a page here whose page was not read just now (round eighty-seven, the integration): not checked, never "no page". -->
            <td colspan="4" class="muted" data-l="Habitat">its habitat figures not checked.</td>
          {:else}
            <td colspan="4" class="muted" data-l="Habitat">no figures: no page here to read them from.</td>
          {/if}
        </tr>
        {#if r.page && !r.page.figures.none && (r.page.figures.day || r.page.figures.few)}
          <tr class="note"><td colspan="5" class="small faint">{#if r.page.figures.day}Derived {r.page.figures.day} for <i>{r.page.name}</i>'s page{/if}{#if r.page.figures.few}{r.page.figures.day ? '; ' : ''}from few records, as its page says{/if}.</td></tr>
        {/if}
      {/each}
    </tbody>
  </table>
</section>

<style>
  .parents { margin: 10px 0 0; }
  .ph3 { margin: 0 0 6px; font-size: var(--fs-head, 0.8125rem); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mut); }
  .pt { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
  .pt thead th { text-align: left; font-weight: 600; font-size: var(--fs-sm); color: var(--mut); border-bottom: 1px solid var(--ink); padding: 4px 8px 4px 0; }
  .pt th[scope='row'] { text-align: left; font-weight: 400; padding: 6px 8px 6px 0; vertical-align: top; }
  .pt td { padding: 6px 8px 6px 0; vertical-align: top; font-variant-numeric: tabular-nums lining-nums; border-top: 1px solid var(--rule2); }
  .pt tbody th { border-top: 1px solid var(--rule2); }
  .pt tr.note td { border-top: 0; padding-top: 0; }
  .src { display: block; font-size: var(--fs-xs); color: var(--mut); }
  .why { display: block; }
  /* A phone: each parent a stack of label and value, the source under each (the look's tables, DESIGN-87). */
  @media (max-width: 640px) {
    .pt thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .pt, .pt tbody, .pt tr, .pt th, .pt td { display: block; width: auto; }
    .pt tbody th { border-top: 1px solid var(--ink); }
    .pt td { border-top: 1px solid var(--rule2); padding: 4px 0; }
    .pt td[data-l]::before { content: attr(data-l); display: block; font-size: var(--fs-xs); color: var(--mut); }
  }
</style>
