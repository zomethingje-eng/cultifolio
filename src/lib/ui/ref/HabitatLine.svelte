<script lang="ts">
  /**
   * The habitat in four figures on a phone's first screen (round eighty-four; the owner's decision 3, outside review B's 3):
   * the cold figure, the year's rain, the open-sky light and the season, each with its qualification and source, above the
   * photograph strip. The same figures as the glance cards further down, by the same rules (`Glance.svelte`, `$core/sheet`),
   * which stay where they are with their explanations; on a wider screen the cards are on the first screen and this is not shown.
   */
  import { temp, rain } from '$core/units';
  import type { Units } from '$core/units';
  import type { Year } from '$core/sheet';
  import { yearRain } from '$climate/year-rain';
  import { seasonWords } from './season';
  type M = { tmax: number; tmin: number; precipMm: number; dli?: number };
  let {
    months,
    extremes = null,
    annualRain = null,
    year = null,
    readerLat = null,
    units,
    few = null,
    href = '#s-glance'
  }: {
    months: M[];
    extremes?: { minP01: number } | null;
    annualRain?: { p50?: number | null } | null;
    year?: Year | null;
    readerLat?: number | null;
    units: Units;
    few?: { records: number; cells: number } | null;
    /** Where the full cards are. */
    href?: string;
  } = $props();
  const cold = $derived(months.reduce((b, x, i) => (x.tmin < months[b].tmin ? i : b), 0));
  const yr = $derived(yearRain(months, annualRain));
  const dlis = $derived(months.map((x) => x.dli).filter((x): x is number => x != null));
  const season = $derived(year ? seasonWords(year, readerLat) : null);
</script>

<section class="hline" aria-labelledby="hline-t">
  <p class="hhead"><span id="hline-t">Habitat in short</span>{#if few}<span class="few">from {few.records} record{few.records === 1 ? '' : 's'}</span>{/if}<a href={href}>Figures ›</a></p>
  <dl>
    {#if extremes}
      <div><dt>Cold floor</dt><dd><b>{temp(extremes.minP01, units, 1)}</b> <span>1 night in 100 colder <i>NASA POWER</i></span></dd></div>
    {:else if months.length}
      <div><dt>Coldest month</dt><dd><b>{temp(months[cold].tmin, units, 1)}</b> <span>mean nightly low, not a floor <i>CHELSA</i></span></dd></div>
    {/if}
    <div><dt>Rain</dt><dd><b>{rain(yr.mm, units)}</b> <span>a year, {yr.cells ? 'median across the range' : 'monthly medians added'} <i>CHELSA</i></span></dd></div>
    {#if dlis.length}<div><dt>Open-sky light</dt><dd><b>{Math.min(...dlis).toFixed(0)}–{Math.max(...dlis).toFixed(0)} DLI</b> <span>lowest to highest month <i>CHELSA</i></span></dd></div>{/if}
    {#if season}<div><dt>Season</dt><dd><b class="w">{season.head}</b> <span>{season.months} <i>{season.rule}</i></span></dd></div>{/if}
  </dl>
</section>

<style>
  /* A phone's alone: from 641 px the glance cards are on the first screen. */
  .hline { display: none; }
  @media (max-width: 640px) {
    .hline { display: block; margin: 12px 0 0; padding: 10px 12px 4px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  }
  .hhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 0 0 6px; font-size: var(--fs-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .hhead > * { white-space: nowrap; }
  .hhead a { margin-left: auto; letter-spacing: 0.02em; text-transform: none; font-weight: 600; font-size: var(--fs-sm); }
  .few { padding: 0 7px; border: 1.5px dashed var(--warm); border-radius: 999px; color: var(--warm-ink); letter-spacing: 0.02em; text-transform: none; }
  dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 12px; margin: 0; }
  dl > div { min-width: 0; padding: 4px 0 6px; }
  dt { font-size: var(--fs-xs); color: var(--ink3); letter-spacing: 0.02em; }
  dd { margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
  dd b { display: block; font-family: var(--mono); font-size: var(--fs-md); color: var(--ink); font-weight: 600; }
  dd b.w { font-family: var(--ui); font-weight: 700; }
  dd span { display: block; font-size: var(--fs-xs); color: var(--ink3); }
  /* The source as the cards' small tag, so it reads as the figure's source and not as a word of the line. */
  dd i { display: inline-block; font-style: normal; letter-spacing: 0.04em; border: 1px solid var(--rule); border-radius: var(--r-sm); padding: 0 4px; margin-left: 2px; line-height: 1.35; }
</style>
