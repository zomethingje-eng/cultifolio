<script lang="ts">
  /**
   * The habitat's hardiness (round eighty-seven, derived agent; `$dossier/hardiness`): the USDA zone the mean of the
   * typical spot's yearly lowest nights falls in, and the RHS band of its record low, each with its years, its source and
   * its arithmetic. The habitat's, not a tested hardiness of the plant, and the section says so. Shown only while the
   * page shows the daily extremes it was worked out from; a page whose record has no `hardiness` yet says so.
   */
  import Term from './Term.svelte';
  import YearLows from './YearLows.svelte';
  import { frostWording } from '$core/extremes';
  import { rhsOf, usdaRange, usdaOfShown, USDA_YEARS_MIN, type HardinessFigures } from '$dossier/hardiness';
  import { tempN, tempUnit, type Units } from '$core/units';
  // `extremes`: the shown daily extremes, for round 113's chart and tiles (SPECIES 21: "How cold it gets").
  type Shown = { years: number; minP01: number; maxP99: number; frostDaysPerYear: number; frostNights?: number; lows?: { from: number; t: Array<number | null> } };
  let { hardiness, extremesShown, units, extremes = null }: { hardiness: HardinessFigures | null | undefined; extremesShown: boolean; units: Units; extremes?: Shown | null } = $props();
  const h = $derived(extremesShown ? (hardiness ?? null) : null);
  const t = (c: number) => `${tempN(c, units, 1)} ${tempUnit(units)}`;
  const minus = (s: string) => s.replace(/(^|\s)-(?=\d)/g, '$1−');
  // The sum as printed, worked from the mean as shown (round eighty-seven's review of stage 2, M1): every figure true, and
  // the zone the printed °F's, also for a record written before, whose zone was the unrounded mean's.
  const u = $derived(h?.usda ? usdaOfShown(h.usda.meanC) : null);
</script>

{#if extremesShown}
  <section class="hard" aria-labelledby="hard-t" id="hardiness">
    <!-- Round 113 (SPECIES 21): the section is "How cold it gets", its yearly lows drawn, four tiles, and the derivation
         under them as before. -->
    <h2 id="hard-t">How cold it gets</h2>
    {#if extremes}
      <div class="tiles">
        {#if h?.usda && u}<div class="tile"><div class="tl"><Term k="usda">USDA zone</Term></div><div class="tv">{u.zone}</div></div>{/if}
        {#if h}<div class="tile"><div class="tl"><Term k="rhs">RHS band</Term></div><div class="tv">{h.rhs.band}</div></div>{/if}
        <div class="tile"><div class="tl">Frost</div><div class="tv small">{frostWording(extremes)}</div></div>
        <div class="tile"><div class="tl">Hottest day in 100</div><div class="tv">{minus(t(extremes.maxP99))}</div></div>
      </div>
      {#if extremes.lows}<YearLows lows={extremes.lows} floorC={extremes.minP01} zone={u?.zone ?? null} {units} />{/if}
    {/if}
    {#if h}
      <table>
        <tbody>
          <tr>
            <th scope="row"><Term k="usda">USDA zone</Term> of the habitat</th>
            {#if h.usda && u}
              <td class="v">{u.zone}</td>
              <td class="how">the mean of the typical spot&rsquo;s lowest night in each of {h.usda.years} complete years, {h.usda.from}–{h.usda.to}: {minus(`${u.c.toFixed(1)} °C`)} = {minus(`${u.c.toFixed(1)}`)} × 9 ÷ 5 + 32 = {minus(`${u.fText} °F`)}, in zone {u.zone}{usdaRange(u.zone) ? ` (${minus(usdaRange(u.zone)!)})` : ''}. USDA&rsquo;s zones are the 30-year mean of each year&rsquo;s lowest temperature, in 10 °F zones with 5 °F half-zones (<a href="https://planthardiness.ars.usda.gov/">USDA Plant Hardiness Zone Map</a>); this mean is of the years the series holds, not USDA&rsquo;s 1991–2020.</td>
            {:else}
              <td class="v none">not worked out</td>
              <td class="how">{h.usdaWhy ?? `a mean needs ${USDA_YEARS_MIN} complete years`}.</td>
            {/if}
          </tr>
          <tr>
            <th scope="row"><Term k="rhs">RHS band</Term> of the record low</th>
            <td class="v">{h.rhs.band}</td>
            <td class="how">the record low falls in RHS&rsquo;s {h.rhs.band} band ({rhsOf(h.rhs.band).range}: {rhsOf(h.rhs.band).words}; <a href="https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating">RHS hardiness rating</a>): {minus(t(h.rhs.lowC))}, the lowest night in {h.rhs.years} years.</td>
          </tr>
        </tbody>
      </table>
      <p class="note">Both are the habitat&rsquo;s, worked out from where it grows wild: neither is a tested hardiness of the plant. Lows from {h.src}.</p>
    {:else}
      <p class="note">Not worked out for this page yet: its record was written before the hardiness figures were.</p>
    {/if}
  </section>
{/if}

<style>
  .hard { margin: 28px 0 0; }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 18px; margin: 4px 0 8px; }
  .tile { border-top: 1px solid var(--rule); padding: 8px 0 6px; }
  .tl { font-size: var(--fs-xs); letter-spacing: 0.06em; text-transform: uppercase; color: var(--mut); font-weight: 600; }
  .tv { font-size: 1.35rem; font-variant-numeric: tabular-nums lining-nums; margin-top: 2px; }
  .tv.small { font-size: var(--fs-base); }
  @media (max-width: 640px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  h2 { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut); }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-base); }
  tr { border-bottom: 1px solid var(--rule2); }
  th { padding: 8px 0; width: 190px; text-align: left; font-weight: 400; vertical-align: top; }
  td { padding: 8px 0; vertical-align: top; }
  td.v { font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
  td.v.none { color: var(--mut); white-space: normal; }
  td.how { padding-left: 24px; color: var(--ink2); font-size: var(--fs-ui); }
  .note { margin: 6px 0 0; font-size: var(--fs-head); color: var(--mut); }
  @media (max-width: 640px) {
    table, tbody, tr, th, td { display: block; width: auto; }
    tr { padding: 6px 0; }
    th, td { padding: 0; }
    th { font-size: var(--fs-head); color: var(--mut); }
    td.how { padding: 2px 0 0; }
  }
</style>
