<script lang="ts">
  /**
   * The habitat's hardiness (round eighty-seven, derived agent; `$dossier/hardiness`): the USDA zone the mean of the
   * typical spot's yearly lowest nights falls in, and the RHS band of its record low, each with its years, its source and
   * its arithmetic. The habitat's, not a tested hardiness of the plant, and the section says so. Shown only while the
   * page shows the daily extremes it was worked out from; a page whose record has no `hardiness` yet says so.
   */
  import { rhsOf, usdaRange, usdaOfShown, USDA_YEARS_MIN, type HardinessFigures } from '$dossier/hardiness';
  import { tempN, tempUnit, type Units } from '$core/units';
  let { hardiness, extremesShown, units }: { hardiness: HardinessFigures | null | undefined; extremesShown: boolean; units: Units } = $props();
  const h = $derived(extremesShown ? (hardiness ?? null) : null);
  const t = (c: number) => `${tempN(c, units, 1)} ${tempUnit(units)}`;
  const minus = (s: string) => s.replace(/(^|\s)-(?=\d)/g, '$1−');
  // The sum as printed, worked from the mean as shown (round eighty-seven's review of stage 2, M1): every figure true, and
  // the zone the printed °F's, also for a record written before, whose zone was the unrounded mean's.
  const u = $derived(h?.usda ? usdaOfShown(h.usda.meanC) : null);
</script>

{#if extremesShown}
  <section class="hard" aria-labelledby="hard-t" id="hardiness">
    <h2 id="hard-t">Hardiness of the habitat</h2>
    {#if h}
      <table>
        <tbody>
          <tr>
            <th scope="row">USDA zone of the habitat</th>
            {#if h.usda && u}
              <td class="v">{u.zone}</td>
              <td class="how">the mean of the typical spot&rsquo;s lowest night in each of {h.usda.years} complete years, {h.usda.from}–{h.usda.to}: {minus(`${u.c.toFixed(1)} °C`)} = {minus(`${u.c.toFixed(1)}`)} × 9 ÷ 5 + 32 = {minus(`${u.fText} °F`)}, in zone {u.zone}{usdaRange(u.zone) ? ` (${minus(usdaRange(u.zone)!)})` : ''}. USDA&rsquo;s zones are the 30-year mean of each year&rsquo;s lowest temperature, in 10 °F zones with 5 °F half-zones (<a href="https://planthardiness.ars.usda.gov/">USDA Plant Hardiness Zone Map</a>); this mean is of the years the series holds, not USDA&rsquo;s 1991–2020.</td>
            {:else}
              <td class="v none">not worked out</td>
              <td class="how">{h.usdaWhy ?? `a mean needs ${USDA_YEARS_MIN} complete years`}.</td>
            {/if}
          </tr>
          <tr>
            <th scope="row">RHS band of the record low</th>
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
