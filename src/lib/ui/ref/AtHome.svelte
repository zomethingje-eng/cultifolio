<script lang="ts">
  /**
   * "At home, aim for" (round eighty-seven, derived agent; the plan's C10 and the owner's mockup, LookSpecies): a grower's
   * targets worked out from the page's own habitat figures, each row with its arithmetic and source (`at-home.ts`). The
   * photoperiod is 14 hours, with 12 and 16 a choice away; the choice changes only the grow-light row. Nothing is shown
   * where the page has no habitat climate: the climate's own notice says why.
   */
  import { atHomeRows, AT_HOME_NOTE, PHOTOPERIODS, DEFAULT_HOURS, type AtHomeClimate } from './at-home';
  import type { Units } from '$core/units';
  let { climate, units }: { climate: AtHomeClimate | null | undefined; units: Units } = $props();
  let hours = $state<number>(DEFAULT_HOURS);
  const rows = $derived(atHomeRows(climate, units, hours));
  const hasLight = $derived(!!rows?.some((r) => r.k.startsWith('Grow light,')));
  /** What a change of hours did, said once to a screen reader (the review of stage 2's pages, 5: the row changed in silence). */
  let said = $state('');
  function choose(h: number) {
    hours = h;
    const r = atHomeRows(climate, units, h)?.find((x) => x.k.startsWith('Grow light,'));
    said = r ? `${r.k}: ${r.v}` : '';
  }
</script>

{#if rows}
  <section class="athome" aria-labelledby="athome-t" id="at-home">
    <h2 id="athome-t">At home, aim for <span class="sub">(worked out from the figures above)</span></h2>
    <table>
      <tbody>
        {#each rows as r (r.k.replace(/,.*$/, ''))}
          <tr>
            <th scope="row">{r.k}</th>
            <td class="v" class:none={!r.figure}>{r.v}</td>
            <td class="how">{r.how}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if hasLight}
      <div class="hours" role="group" aria-label="Hours of grow light a day">
        <span class="hl" aria-hidden="true">Hours of light a day:</span>
        {#each PHOTOPERIODS as h (h)}
          <button type="button" aria-pressed={hours === h} onclick={() => choose(h)}>{h} h</button>
        {/each}
      </div>
      <p class="sr" aria-live="polite" id="at-home-said">{said}</p>
    {/if}
    <p class="note">{AT_HOME_NOTE}</p>
  </section>
{/if}

<style>
  .athome { margin: 28px 0 0; }
  h2 { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut); }
  h2 .sub { text-transform: none; letter-spacing: 0; font-weight: 400; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-base); }
  tr { border-bottom: 1px solid var(--rule2); }
  th { padding: 8px 0; width: 190px; text-align: left; font-weight: 400; vertical-align: top; }
  td { padding: 8px 0; vertical-align: top; }
  td.v { font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
  td.v.none { color: var(--mut); white-space: normal; }
  td.how { padding-left: 24px; color: var(--ink2); font-size: var(--fs-ui); }
  .hours { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; font-size: var(--fs-head); color: var(--mut); }
  .hours button { min-height: 32px; padding: 2px 10px; border: 1px solid var(--edge); border-radius: 4px; background: var(--field); color: var(--ink); font: inherit; font-variant-numeric: tabular-nums lining-nums; cursor: pointer; }
  .hours button[aria-pressed='true'] { border-color: var(--ink); font-weight: 600; }
  .note { margin: 6px 0 0; font-size: var(--fs-head); color: var(--mut); }
  /* A phone: each row stacked, its label, then the figure, then the arithmetic under it (DESIGN-87: tables become stacked rows). */
  @media (max-width: 640px) {
    table, tbody, tr, th, td { display: block; width: auto; }
    tr { padding: 6px 0; }
    th, td { padding: 0; }
    th { font-size: var(--fs-head); color: var(--mut); }
    td.how { padding: 2px 0 0; }
    .hours button { min-height: 44px; min-width: 44px; }
  }
  @media (pointer: coarse) { .hours button { min-height: 44px; min-width: 44px; } }
</style>
